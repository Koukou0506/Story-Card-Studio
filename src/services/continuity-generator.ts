import { ContinuityProjectSchema, type ContinuityProject } from "@/domain/continuity";
import type { IProviderAdapter } from "@/providers/types";
import { buildContinuityRepairPrompt, buildContinuitySystemPrompt, buildContinuityUserMessage, type ContinuityPromptMode } from "@/prompts/continuity-v1";
import { GenerationError } from "./generator";

const extractJSON = (text: string) => {
  const clean = text.trim().replace(/^\uFEFF/, "");
  try { JSON.parse(clean); return clean; } catch { /* continue */ }
  const block = clean.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (block) try { JSON.parse(block); return block; } catch { /* continue */ }
  const start = clean.indexOf("{"); const end = clean.lastIndexOf("}");
  if (start >= 0 && end > start) return clean.slice(start, end + 1).replace(/,(\s*[}\]])/g, "$1");
  throw new GenerationError("无法从模型响应中提取连续性 JSON。", "parse_error");
};

const withTimeout = async <T>(promise: Promise<T>, ms: number, signal?: AbortSignal): Promise<T> => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new GenerationError("连续性分析超时，请缩小范围后重试。", "timeout")), ms);
  const abort = () => { clearTimeout(timer); reject(new GenerationError("连续性分析已取消。", "cancelled")); };
  if (signal?.aborted) return abort(); signal?.addEventListener("abort", abort, { once: true });
  promise.then((value) => { clearTimeout(timer); resolve(value); }).catch((error) => { clearTimeout(timer); reject(error); });
});

export function validateContinuityReferences(project: ContinuityProject, allowedSourceIds: string[]): { project: ContinuityProject; warnings: string[] } {
  const allowed = new Set(allowedSourceIds); const warnings: string[] = [];
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== "object") return value;
    const object = value as Record<string, unknown>;
    if (typeof object.sourceId === "string" && typeof object.sourceType === "string") {
      const valid = allowed.has(object.sourceId) || ["canon", "plot_thread", "foreshadow"].includes(String(object.sourceType));
      if (!valid) warnings.push(`来源 ${object.sourceType}:${object.sourceId} 未包含在本次上下文中，已标记无效。`);
      return { ...object, valid };
    }
    return Object.fromEntries(Object.entries(object).map(([key, item]) => [key, visit(item)]));
  };
  return { project: ContinuityProjectSchema.parse(visit(project)), warnings };
}

export async function generateContinuityProject(args: { project: ContinuityProject; mode: ContinuityPromptMode; context: unknown; allowedSourceIds: string[]; provider: IProviderAdapter; model: string; timeoutMs?: number; maxRetries?: number; abortSignal?: AbortSignal }) {
  let errorText = ""; const retries = args.maxRetries ?? 2; let lastRaw = "";
  for (let attempt = 0; attempt <= retries; attempt++) try {
    const repair = attempt ? buildContinuityRepairPrompt("ContinuityProjectSchema", lastRaw, errorText) : null;
    const response = await withTimeout(args.provider.generate({ systemPrompt: repair?.systemPrompt ?? buildContinuitySystemPrompt(args.mode), userMessage: repair?.userMessage ?? buildContinuityUserMessage(args.mode, { currentProject: args.project, context: args.context }, "ContinuityProjectSchema"), model: args.model, temperature: 0.2, maxTokens: 8000, responseFormat: "json", abortSignal: args.abortSignal }), args.timeoutMs ?? 60000, args.abortSignal);
    lastRaw = extractJSON(response.content); const parsed = ContinuityProjectSchema.safeParse(JSON.parse(lastRaw));
    if (!parsed.success) { errorText = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("；"); if (attempt < retries) continue; throw new GenerationError(`连续性结果 Schema 校验失败：${errorText}`, "validation_error", attempt); }
    const references = validateContinuityReferences(parsed.data, args.allowedSourceIds);
    return { project: references.project, warnings: references.warnings, retriesUsed: attempt, model: response.model, usage: response.usage };
  } catch (error) {
    if (error instanceof GenerationError && ["timeout", "cancelled"].includes(error.code)) throw error;
    errorText = (error as Error).message; if (attempt >= retries) throw error instanceof GenerationError ? error : new GenerationError(`连续性分析失败：${errorText}`, "provider_error", attempt);
  }
  throw new GenerationError("连续性分析失败。", "provider_error", retries);
}
