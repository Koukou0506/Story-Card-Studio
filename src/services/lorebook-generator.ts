import type { IProviderAdapter } from "@/providers/types";
import {
  createEmptyLorebook,
  createStableId,
  LorebookDraftOutputSchema,
  LorebookGenerationInputSchema,
  LorebookSchema,
  type Lorebook,
  type LorebookGenerationInput,
} from "@/domain/lorebook";
import { buildLorebookSystemPrompt, buildLorebookUserMessage, LOREBOOK_PROMPT_VERSION } from "@/prompts/lorebook-v1";
import { GenerationError } from "./generator";

export interface LorebookGenerationConfig {
  provider: IProviderAdapter;
  model: string;
  abortSignal?: AbortSignal;
  timeoutMs?: number;
  maxRetries?: number;
}

function extractJSON(text: string): string {
  const trimmed = text.trim().replace(/^\uFEFF/, "");
  try { JSON.parse(trimmed); return trimmed; } catch { /* continue */ }
  const block = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (block) try { JSON.parse(block); return block; } catch { /* continue */ }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1).replace(/,(\s*[}\]])/g, "$1");
  throw new GenerationError("无法从模型响应中提取世界书 JSON。", "parse_error");
}

async function withTimeout<T>(promise: Promise<T>, ms: number, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new GenerationError("世界书生成超时，请缩短输入后重试。", "timeout")), ms);
    const abort = () => { clearTimeout(timer); reject(new GenerationError("世界书生成已取消。", "cancelled")); };
    if (signal?.aborted) return abort();
    signal?.addEventListener("abort", abort, { once: true });
    promise.then(value => { clearTimeout(timer); signal?.removeEventListener("abort", abort); resolve(value); })
      .catch(error => { clearTimeout(timer); signal?.removeEventListener("abort", abort); reject(error); });
  });
}

export async function generateLorebook(
  rawInput: LorebookGenerationInput,
  config: LorebookGenerationConfig,
): Promise<{ lorebook: Lorebook; model: string; retriesUsed: number; usage?: { inputTokens: number; outputTokens: number } }> {
  const input = LorebookGenerationInputSchema.parse(rawInput);
  const retries = config.maxRetries ?? 2;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await withTimeout(config.provider.generate({
        systemPrompt: buildLorebookSystemPrompt(),
        userMessage: buildLorebookUserMessage(input) + (attempt ? "\n上次格式不正确，请只返回完整合法 JSON。" : ""),
        model: config.model,
        maxTokens: 4096,
        temperature: 0.6,
        abortSignal: config.abortSignal,
      }), config.timeoutMs ?? 60000, config.abortSignal);
      const parsed = JSON.parse(extractJSON(response.content));
      const draft = LorebookDraftOutputSchema.safeParse(parsed);
      if (!draft.success) {
        lastError = new Error(draft.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("；"));
        if (attempt < retries) continue;
        throw new GenerationError(`世界书 Schema 校验失败：${lastError.message}`, "validation_error", attempt);
      }
      const book = createEmptyLorebook(draft.data.name);
      book.description = draft.data.description;
      book.metadata.promptVersion = LOREBOOK_PROMPT_VERSION;
      book.entries = draft.data.entries.map((entry, index) => ({
        id: createStableId("entry"), externalId: null, name: entry.name, category: entry.category,
        content: entry.content, enabled: entry.enabled, insertionOrder: entry.insertionOrder - index,
        position: entry.position, depth: 4, role: "system", outletName: "",
        activation: { primaryKeys: entry.primaryKeys, secondaryKeys: entry.secondaryKeys,
          secondaryLogic: entry.secondaryLogic, caseSensitive: null, matchWholeWords: null,
          constant: entry.constant, selective: entry.secondaryKeys.length > 0, recursive: true,
          preventRecursion: false, delayUntilRecursion: 0, probability: 100, scanDepth: null,
          sticky: null, cooldown: null, delay: null, group: "", groupOverride: false, groupWeight: 100 },
        extensions: {}, formatSpecificData: { characterBook: {}, sillyTavern: {} },
        provenance: entry.provenance, compatibilityWarnings: [],
      }));
      return { lorebook: LorebookSchema.parse(book), model: response.model, retriesUsed: attempt, usage: response.usage };
    } catch (error) {
      if (error instanceof GenerationError && (error.code === "cancelled" || error.code === "timeout")) throw error;
      lastError = error as Error;
      if (attempt >= retries) {
        if (error instanceof GenerationError) throw error;
        throw new GenerationError(`世界书生成失败：${lastError.message}`, "provider_error", attempt);
      }
    }
  }
  throw new GenerationError(`世界书生成失败：${lastError?.message || "未知错误"}`, "provider_error", retries);
}

