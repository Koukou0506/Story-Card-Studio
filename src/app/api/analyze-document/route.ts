import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  DocumentAnalysisConfigSchema,
  DocumentChunkSchema,
} from "@/domain/document-ingestion";
import { createProvider, getDefaultProviderType } from "@/providers/factory";
import { ProviderTypeSchema } from "@/providers/types";
import { GenerationError } from "@/services/generator";
import { generateDocumentChunkExtraction } from "@/services/document-ingestion/generator";
import {
  authorizeWorkspace,
  clientAddress,
  validateWorkspaceOrigin,
  workspaceEnabled,
} from "@/server/workspace-api";

export const runtime = "nodejs";
export const MAX_DOCUMENT_CHUNK_CHARACTERS = 50_000;
export const MAX_ANALYZE_DOCUMENT_BODY_BYTES = 256 * 1024;
export const MAX_DOCUMENT_CHUNK_SOURCE_SPANS = 64;
const ANALYZE_WINDOW_MS = 60_000;
const ANALYZE_REQUESTS_PER_WINDOW = 30;

const requestWindows = new Map<string, { count: number; resetAt: number }>();

function consumeRequestQuota(key: string, now = Date.now()): boolean {
  const current = requestWindows.get(key);
  if (!current || current.resetAt <= now) {
    requestWindows.set(key, { count: 1, resetAt: now + ANALYZE_WINDOW_MS });
    return true;
  }
  if (current.count >= ANALYZE_REQUESTS_PER_WINDOW) return false;
  current.count += 1;
  return true;
}

const ApiSourceSpanSchema = z.object({
  documentId: z.string().min(1).max(200),
  sourceVersion: z.number().int().positive().max(1_000_000),
  chapterId: z.string().max(200).nullable(),
  chapterTitle: z.string().max(240),
  pageStart: z.number().int().positive().max(1_000_000).nullable(),
  pageEnd: z.number().int().positive().max(1_000_000).nullable(),
  paragraphStart: z.number().int().min(0).max(10_000_000).nullable(),
  paragraphEnd: z.number().int().min(0).max(10_000_000).nullable(),
  characterStart: z.number().int().min(0).max(100_000_000),
  characterEnd: z.number().int().min(0).max(100_000_000),
  rawTextExcerpt: z.string().max(280),
  normalizedTextExcerpt: z.string().max(280),
  extractionConfidence: z.enum(["high", "medium", "low"]),
  mappingStatus: z.enum(["mapped", "approximate", "unmapped"]),
}).strict();

const ApiDocumentChunkSchema = z.object({
  id: z.string().min(1).max(200),
  documentId: z.string().min(1).max(200),
  chapterId: z.string().max(200).nullable(),
  order: z.number().int().min(0).max(10_000_000),
  text: z.string().max(MAX_DOCUMENT_CHUNK_CHARACTERS),
  startOffset: z.number().int().min(0).max(100_000_000),
  endOffset: z.number().int().min(0).max(100_000_000),
  sourceSpans: z.array(ApiSourceSpanSchema).min(1).max(MAX_DOCUMENT_CHUNK_SOURCE_SPANS),
  estimatedTokens: z.number().int().min(0).max(200_000),
  overlapBefore: z.number().int().min(0).max(MAX_DOCUMENT_CHUNK_CHARACTERS),
  overlapAfter: z.number().int().min(0).max(MAX_DOCUMENT_CHUNK_CHARACTERS),
}).strict().superRefine((chunk, context) => {
  if (chunk.endOffset < chunk.startOffset) {
    context.addIssue({
      code: "custom",
      path: ["endOffset"],
      message: "分块结束位置不能早于开始位置",
    });
  }
  chunk.sourceSpans.forEach((span, index) => {
    if (span.documentId !== chunk.documentId
      || span.chapterId !== chunk.chapterId) {
      context.addIssue({
        code: "custom",
        path: ["sourceSpans", index],
        message: "来源位置必须属于当前分块",
      });
    }
  });
});

const AnalyzeDocumentRequestSchema = z.object({
  chunk: ApiDocumentChunkSchema,
  provider: ProviderTypeSchema.optional(),
  model: z.string().trim().min(1).max(200).optional(),
  config: DocumentAnalysisConfigSchema.pick({
    depth: true, characterScope: true, extractMinorCharacters: true, extractLorebook: true,
    extractCanon: true, extractTimeline: true, extractPlotThreads: true, extractForeshadow: true,
    analyzeStyle: true,
  }).partial().strict().optional(),
}).strict();

class RequestBodyTooLargeError extends Error {}

async function readBoundedJSON(request: NextRequest): Promise<unknown> {
  const declaredLength = Number.parseInt(request.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_ANALYZE_DOCUMENT_BODY_BYTES) {
    throw new RequestBodyTooLargeError();
  }
  if (!request.body) throw new SyntaxError("empty body");

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let byteLength = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > MAX_ANALYZE_DOCUMENT_BODY_BYTES) {
      await reader.cancel();
      throw new RequestBodyTooLargeError();
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return JSON.parse(text);
}

const generationStatus: Record<GenerationError["code"], number> = {
  timeout: 504,
  cancelled: 499,
  provider_error: 502,
  validation_error: 422,
  parse_error: 422,
};

function configuredTimeoutMs(): number {
  const configured = Number.parseInt(process.env.API_TIMEOUT_MS ?? "60000", 10);
  if (!Number.isFinite(configured)) return 60_000;
  return Math.min(300_000, Math.max(1_000, configured));
}

export async function POST(request: NextRequest) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "请求必须使用 application/json。" }, { status: 415 });
  }
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "不允许跨站调用文档分析服务。" }, { status: 403 });
  }
  const originError = validateWorkspaceOrigin(request);
  if (originError) return originError;
  if (workspaceEnabled()) {
    const denied = authorizeWorkspace(request);
    if (denied) return denied;
  }
  if (!consumeRequestQuota(clientAddress(request))) {
    return NextResponse.json({ error: "文档分析请求过于频繁，请稍后重试。" }, { status: 429 });
  }

  let raw: unknown;
  try {
    raw = await readBoundedJSON(request);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json(
        { error: "请求体过大，只能提交单个受限文档分块。" },
        { status: 413 },
      );
    }
    return NextResponse.json(
      { error: "请求只能包含单个文档分块、Provider、模型和受限分析配置。" },
      { status: 400 },
    );
  }

  if (raw && typeof raw === "object" && "chunk" in raw) {
    const rawChunk = (raw as { chunk?: unknown }).chunk;
    if (rawChunk && typeof rawChunk === "object" && "text" in rawChunk
      && typeof (rawChunk as { text?: unknown }).text === "string"
      && (rawChunk as { text: string }).text.length > MAX_DOCUMENT_CHUNK_CHARACTERS) {
      return NextResponse.json(
        { error: "文档分块过大，请重新分块后再分析。" },
        { status: 413 },
      );
    }
  }

  const input = AnalyzeDocumentRequestSchema.safeParse(raw);
  if (!input.success) {
    return NextResponse.json(
      { error: "请求只能包含单个文档分块、Provider、模型和受限分析配置。" },
      { status: 400 },
    );
  }

  try {
    const chunk = DocumentChunkSchema.parse(input.data.chunk);
    const provider = createProvider({
      type: input.data.provider ?? getDefaultProviderType(),
    });
    const result = await generateDocumentChunkExtraction(chunk, {
      provider,
      model: input.data.model ?? provider.defaultModel,
      timeoutMs: configuredTimeoutMs(),
      maxRetries: 2,
      abortSignal: request.signal,
      analysisConfig: input.data.config,
    });

    return NextResponse.json({
      success: true,
      data: { items: result.items },
      warnings: result.warnings,
      meta: {
        chunkId: input.data.chunk.id,
        model: result.model,
        retriesUsed: result.retriesUsed,
        usage: result.usage,
        promptVersion: result.promptVersion,
      },
    });
  } catch (error) {
    if (error instanceof GenerationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: generationStatus[error.code] },
      );
    }
    return NextResponse.json(
      { error: "文档分析服务暂不可用，请检查服务端 Provider 配置。" },
      { status: 500 },
    );
  }
}
