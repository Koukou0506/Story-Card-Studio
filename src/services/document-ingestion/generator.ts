import { z } from "zod";
import {
  ExtractionItemSchema,
  type DocumentChunk,
  type ExtractionItem,
  type SourceSpan,
} from "@/domain/document-ingestion";
import type { GenerateRequest, GenerateResponse, IProviderAdapter } from "@/providers/types";
import {
  DOCUMENT_INGESTION_PROMPT_VERSION,
  buildDocumentExtractionRepairPrompt,
  buildDocumentExtractionSystemPrompt,
  buildDocumentExtractionUserMessage,
  type DocumentExtractionPromptConfig,
} from "@/prompts/document-ingestion-v1";
import { GenerationError } from "@/services/generator";

export const MAX_DOCUMENT_PROVIDER_RESPONSE_BYTES = 512 * 1024;
export const MAX_DOCUMENT_PROVIDER_ITEMS = 200;
export const MAX_DOCUMENT_PROVIDER_ITEM_SOURCE_SPANS = 16;

const ProviderSourceSpanSchema = z.object({
  documentId: z.string().min(1).max(200),
  sourceVersion: z.number().int().positive(),
  chapterId: z.string().max(200).nullable(),
  chapterTitle: z.string().max(240),
  pageStart: z.number().int().positive().nullable(),
  pageEnd: z.number().int().positive().nullable(),
  paragraphStart: z.number().int().min(0).nullable(),
  paragraphEnd: z.number().int().min(0).nullable(),
  characterStart: z.number().int().min(0),
  characterEnd: z.number().int().min(0),
  rawTextExcerpt: z.string().max(280),
  normalizedTextExcerpt: z.string().max(280),
  extractionConfidence: z.enum(["high", "medium", "low"]),
  mappingStatus: z.enum(["mapped", "approximate", "unmapped"]),
}).strict().superRefine((span, context) => {
  if (span.characterEnd <= span.characterStart) {
    context.addIssue({
      code: "custom",
      path: ["characterEnd"],
      message: "来源字符范围必须为正长度",
    });
  }
  if (span.pageStart !== null && span.pageEnd !== null && span.pageEnd < span.pageStart) {
    context.addIssue({ code: "custom", path: ["pageEnd"], message: "页码范围方向无效" });
  }
  if (span.paragraphStart !== null && span.paragraphEnd !== null
    && span.paragraphEnd < span.paragraphStart) {
    context.addIssue({ code: "custom", path: ["paragraphEnd"], message: "段落范围方向无效" });
  }
});

const ProviderExtractionItemSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.enum([
    "character", "alias", "description", "action", "voice", "emotion", "goal", "relationship",
    "location", "organization", "item", "ability", "world_rule", "term", "history_event",
    "current_event", "time_expression", "secret", "knowledge_gain", "plot_thread", "foreshadow", "style",
  ]),
  normalizedName: z.string().max(200),
  originalExpression: z.string().max(500),
  content: z.string().max(2_000),
  sourceSpans: z.array(ProviderSourceSpanSchema).min(1).max(MAX_DOCUMENT_PROVIDER_ITEM_SOURCE_SPANS),
  confidence: z.enum(["high", "medium", "low"]),
  explicitFact: z.boolean(),
  inference: z.boolean(),
  sceneOnly: z.boolean(),
  possibleExistingEntityIds: z.array(z.string().min(1).max(200)).max(50),
  decision: z.literal("pending"),
}).strict().refine((item) => !(item.explicitFact && item.inference), {
  message: "原文明示事实与推断不能同时为 true",
  path: ["inference"],
});

export const DocumentChunkExtractionResponseSchema = z.object({
  items: z.array(ProviderExtractionItemSchema).max(MAX_DOCUMENT_PROVIDER_ITEMS),
}).strict();

export interface DocumentChunkExtractionConfig {
  provider: IProviderAdapter;
  model: string;
  timeoutMs?: number;
  maxRetries?: number;
  abortSignal?: AbortSignal;
  analysisConfig?: DocumentExtractionPromptConfig;
}

export interface DocumentChunkExtractionResult {
  items: ExtractionItem[];
  warnings: string[];
  model: string;
  usage?: { inputTokens: number; outputTokens: number };
  retriesUsed: number;
  promptVersion: string;
}

function extractJSON(text: string): string {
  const clean = text.trim().replace(/^\uFEFF/, "");
  try {
    JSON.parse(clean);
    return clean;
  } catch {
    // Try a fenced JSON response next.
  }

  const codeBlock = clean.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (codeBlock) {
    JSON.parse(codeBlock);
    return codeBlock;
  }

  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const object = clean.slice(start, end + 1);
    JSON.parse(object);
    return object;
  }

  throw new GenerationError("无法从模型响应中提取文档分析 JSON。", "parse_error");
}

function optionalRangeWithin(
  start: number | null,
  end: number | null,
  allowedStart: number | null,
  allowedEnd: number | null,
): boolean {
  if (allowedStart === null && allowedEnd === null) return start === null && end === null;
  if (start === null || end === null || allowedStart === null || allowedEnd === null) return false;
  if (end < start || allowedEnd < allowedStart) return false;
  return start >= allowedStart && end <= allowedEnd;
}

function trustedChunkSpan(span: SourceSpan, chunk: DocumentChunk): SourceSpan | undefined {
  if (span.characterEnd <= span.characterStart) return undefined;
  return chunk.sourceSpans.find((allowed) => (
    allowed.documentId === chunk.documentId
    && allowed.chapterId === chunk.chapterId
    && allowed.characterEnd > allowed.characterStart
    && span.documentId === allowed.documentId
    && span.sourceVersion === allowed.sourceVersion
    && span.chapterId === allowed.chapterId
    && span.characterStart >= allowed.characterStart
    && span.characterEnd <= allowed.characterEnd
    && optionalRangeWithin(span.pageStart, span.pageEnd, allowed.pageStart, allowed.pageEnd)
    && optionalRangeWithin(
      span.paragraphStart,
      span.paragraphEnd,
      allowed.paragraphStart,
      allowed.paragraphEnd,
    )
  ));
}

function keepSourceBoundItems(
  items: ExtractionItem[],
  chunk: DocumentChunk,
): { items: ExtractionItem[]; warnings: string[] } {
  const kept: ExtractionItem[] = [];
  const warnings: string[] = [];

  for (const item of items) {
    const sourceSpans: SourceSpan[] = [];
    for (const span of item.sourceSpans) {
      const trusted = trustedChunkSpan(span, chunk);
      if (trusted && !sourceSpans.includes(trusted)) sourceSpans.push(trusted);
    }
    const removed = item.sourceSpans.length - sourceSpans.length;
    if (!sourceSpans.length) {
      warnings.push(`候选 ${item.id} 没有分块内有效来源，已丢弃。`);
      continue;
    }
    if (removed > 0) warnings.push(`候选 ${item.id} 含有 ${removed} 个越界来源，已剔除。`);
    kept.push({ ...item, sourceSpans });
  }

  return { items: kept, warnings };
}

function localizeProviderError(error: unknown, retriesUsed: number): GenerationError {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (/\b(401|403)\b|unauthori[sz]ed|authentication|invalid (?:api )?key|api[_ -]?key|认证|密钥/.test(message)) {
    return new GenerationError("Provider 认证失败，请检查服务端密钥配置。", "provider_error", retriesUsed);
  }
  if (/\b429\b|rate.?limit|too many requests|请求过于频繁/.test(message)) {
    return new GenerationError("Provider 请求过于频繁，请稍后重试。", "provider_error", retriesUsed);
  }
  if (/quota|insufficient.?credits?|billing|余额|配额/.test(message)) {
    return new GenerationError("Provider 配额不足，请检查服务端账户状态。", "provider_error", retriesUsed);
  }
  if (/\b5\d\d\b|service.?unavailable|overloaded|temporar(?:y|ily)|服务不可用/.test(message)) {
    return new GenerationError("Provider 服务暂时不可用，请稍后重试。", "provider_error", retriesUsed);
  }
  if (/network|fetch failed|econn|enotfound|dns|网络/.test(message)) {
    return new GenerationError("无法连接 Provider，请检查服务端网络后重试。", "provider_error", retriesUsed);
  }
  return new GenerationError("Provider 调用失败，请稍后重试。", "provider_error", retriesUsed);
}

async function callProvider(
  provider: IProviderAdapter,
  request: Omit<GenerateRequest, "abortSignal">,
  timeoutMs: number,
  externalSignal: AbortSignal | undefined,
  retriesUsed: number,
): Promise<GenerateResponse> {
  if (externalSignal?.aborted) {
    throw new GenerationError("文档分块提取已取消。", "cancelled", retriesUsed);
  }

  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onExternalAbort: (() => void) | undefined;

  const timeout = new Promise<never>((_, reject) => {
    if (timeoutMs <= 0) return;
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new GenerationError(
        "文档分块提取超时，请缩小分块或稍后重试。",
        "timeout",
        retriesUsed,
      ));
    }, timeoutMs);
  });
  const cancellation = new Promise<never>((_, reject) => {
    if (!externalSignal) return;
    onExternalAbort = () => {
      controller.abort();
      reject(new GenerationError("文档分块提取已取消。", "cancelled", retriesUsed));
    };
    externalSignal.addEventListener("abort", onExternalAbort, { once: true });
  });

  try {
    return await Promise.race([
      provider.generate({ ...request, abortSignal: controller.signal }),
      timeout,
      cancellation,
    ]);
  } catch (error) {
    if (timedOut) {
      throw new GenerationError(
        "文档分块提取超时，请缩小分块或稍后重试。",
        "timeout",
        retriesUsed,
      );
    }
    if (error instanceof GenerationError) {
      if (error.code === "timeout") {
        throw new GenerationError(
          "文档分块提取超时，请缩小分块或稍后重试。",
          "timeout",
          retriesUsed,
        );
      }
      if (error.code === "cancelled") {
        throw new GenerationError("文档分块提取已取消。", "cancelled", retriesUsed);
      }
      throw localizeProviderError(error, retriesUsed);
    }
    if (externalSignal?.aborted) {
      throw new GenerationError("文档分块提取已取消。", "cancelled", retriesUsed);
    }
    throw localizeProviderError(error, retriesUsed);
  } finally {
    if (timer) clearTimeout(timer);
    if (onExternalAbort) externalSignal?.removeEventListener("abort", onExternalAbort);
  }
}

export async function generateDocumentChunkExtraction(
  chunk: DocumentChunk,
  config: DocumentChunkExtractionConfig,
): Promise<DocumentChunkExtractionResult> {
  const configuredRetries = Number.isFinite(config.maxRetries) ? Math.trunc(config.maxRetries ?? 2) : 2;
  const maxRetries = Math.min(2, Math.max(0, configuredRetries));
  const requestedTimeout = config.timeoutMs;
  const timeoutMs = Number.isFinite(requestedTimeout) && (requestedTimeout ?? 0) > 0
    ? Math.min(300_000, Math.max(1, Math.trunc(requestedTimeout!)))
    : 60_000;
  const deadline = Date.now() + timeoutMs;
  let invalidResponse = "";
  let validationErrors = "";

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (config.abortSignal?.aborted) {
      throw new GenerationError("文档分块提取已取消。", "cancelled", attempt);
    }
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw new GenerationError(
        "文档分块提取超时，请缩小分块或稍后重试。",
        "timeout",
        attempt,
      );
    }
    const repair = attempt > 0
      ? buildDocumentExtractionRepairPrompt(chunk, invalidResponse, validationErrors, config.analysisConfig)
      : null;
    const response = await callProvider(
      config.provider,
      {
        systemPrompt: repair?.systemPrompt ?? buildDocumentExtractionSystemPrompt(config.analysisConfig),
        userMessage: repair?.userMessage ?? buildDocumentExtractionUserMessage(chunk, config.analysisConfig),
        model: config.model,
        temperature: 0.1,
        maxTokens: 6_000,
        responseFormat: "json",
      },
      remainingMs,
      config.abortSignal,
      attempt,
    );
    if (new TextEncoder().encode(response.content).byteLength > MAX_DOCUMENT_PROVIDER_RESPONSE_BYTES) {
      throw new GenerationError(
        "Provider 返回的文档分析结果过大，已拒绝处理。",
        "validation_error",
        attempt,
      );
    }
    invalidResponse = response.content;

    let raw: unknown;
    try {
      raw = JSON.parse(extractJSON(response.content));
    } catch (error) {
      validationErrors = error instanceof Error ? error.message : "响应不是有效 JSON";
      if (attempt < maxRetries) continue;
      throw error instanceof GenerationError
        ? new GenerationError(error.message, error.code, attempt)
        : new GenerationError("模型返回的文档分析内容不是有效 JSON。", "parse_error", attempt);
    }

    const parsed = DocumentChunkExtractionResponseSchema.safeParse(raw);
    if (!parsed.success) {
      validationErrors = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("；");
      if (attempt < maxRetries) continue;
      throw new GenerationError(
        `文档分块结果格式不正确，已完成 ${attempt} 次修复仍未通过校验。`,
        "validation_error",
        attempt,
      );
    }

    const sourceBound = keepSourceBoundItems(parsed.data.items.map((item) => ExtractionItemSchema.parse(item)), chunk);
    return {
      items: sourceBound.items,
      warnings: sourceBound.warnings,
      model: response.model,
      usage: response.usage,
      retriesUsed: attempt,
      promptVersion: DOCUMENT_INGESTION_PROMPT_VERSION,
    };
  }

  throw new GenerationError("文档分块提取失败。", "provider_error", maxRetries);
}
