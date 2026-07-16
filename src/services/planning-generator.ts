import type { IProviderAdapter } from "@/providers/types";
import type { CharacterCardV2 } from "@/domain/character-card";
import type { Lorebook } from "@/domain/lorebook";
import type { PlotAnalysisProject } from "@/domain/plot-analysis";
import { OutlineVariantSchema, createEmptyVariant, type StoryPlan } from "@/domain/story-planning";
import { buildPlanningContext } from "./planning-context-builder";
import { mergeGeneratedVariant } from "./planning-version";
import { validatePlanning } from "./planning-validator";
import { validatePlanningReferences } from "./planning-references";
import {
  buildAlternativeVariantPrompt,
  buildCharacterPlanningPrompt,
  buildPlanningCompletionPrompt,
  buildPlanningJSONRepairPrompt,
  buildPlanningUserMessage,
  buildPlotOutlinePrompt,
  buildRelationshipPlanningPrompt,
  buildStoryBiblePrompt,
  buildTimelinePrompt,
} from "@/prompts/planning-v1";
import { GenerationError } from "./generator";

export type PlanningMode = "full" | "bible" | "characters" | "relationships" | "outline" | "timeline" | "expand" | "complete" | "analysis_revision" | "alternative" | "local";
const prompts: Record<PlanningMode, () => string> = {
  full: buildPlotOutlinePrompt,
  bible: buildStoryBiblePrompt,
  characters: buildCharacterPlanningPrompt,
  relationships: buildRelationshipPlanningPrompt,
  outline: buildPlotOutlinePrompt,
  timeline: buildTimelinePrompt,
  expand: buildPlanningCompletionPrompt,
  complete: buildPlanningCompletionPrompt,
  analysis_revision: buildAlternativeVariantPrompt,
  alternative: buildAlternativeVariantPrompt,
  local: buildPlanningCompletionPrompt,
};
const modules: Record<PlanningMode, string[]> = {
  full: ["storyBible", "characterPlans", "characterArcs", "relationshipArcs", "outline", "timeline"],
  bible: ["storyBible"],
  characters: ["characterPlans", "characterArcs"],
  relationships: ["relationshipArcs"],
  outline: ["outline"],
  timeline: ["timeline"],
  expand: ["storyBible", "outline"],
  complete: ["outline"],
  analysis_revision: ["storyBible", "characterPlans", "characterArcs", "relationshipArcs", "outline", "timeline"],
  alternative: ["storyBible", "characterPlans", "characterArcs", "relationshipArcs", "outline", "timeline"],
  local: ["outline"],
};

function extractJson(text: string) {
  const trimmed = text.trim();
  try { JSON.parse(trimmed); return trimmed; } catch { /* continue */ }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  if (fenced) return fenced;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1).replace(/,(\s*[}\]])/g, "$1");
  throw new GenerationError("无法提取小说规划 JSON。", "parse_error");
}

async function withTimeout<T>(promise: Promise<T>, milliseconds: number, signal?: AbortSignal) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new GenerationError("小说规划生成超时。", "timeout")), milliseconds);
    const cancel = () => { clearTimeout(timer); reject(new GenerationError("小说规划生成已取消。", "cancelled")); };
    if (signal?.aborted) return cancel();
    signal?.addEventListener("abort", cancel, { once: true });
    promise.then((value) => { clearTimeout(timer); resolve(value); }).catch((error) => { clearTimeout(timer); reject(error); });
  });
}

export async function generateStoryPlan(
  plan: StoryPlan,
  mode: PlanningMode,
  card: CharacterCardV2,
  books: Lorebook[],
  analyses: PlotAnalysisProject[],
  config: { provider: IProviderAdapter; model: string; timeoutMs?: number; maxRetries?: number; abortSignal?: AbortSignal },
) {
  const context = buildPlanningContext(plan, card, books, analyses);
  const existing = plan.variants.find((variant) => variant.id === plan.selectedVariantId) || createEmptyVariant();
  let lastError = "";
  for (let attempt = 0; attempt <= (config.maxRetries ?? 2); attempt += 1) {
    try {
      const response = await withTimeout(config.provider.generate({
        systemPrompt: prompts[mode](),
        userMessage: buildPlanningUserMessage(plan, context, mode) + (attempt ? `\n${buildPlanningJSONRepairPrompt(lastError)}` : ""),
        model: config.model,
        maxTokens: 10000,
        temperature: 0.4,
        abortSignal: config.abortSignal,
      }), config.timeoutMs ?? 60000, config.abortSignal);
      const parsed = OutlineVariantSchema.safeParse(JSON.parse(extractJson(response.content)));
      if (!parsed.success) {
        lastError = parsed.error.issues.map((item) => `${item.path.join(".")}:${item.message}`).join("; ");
        if (attempt < (config.maxRetries ?? 2)) continue;
        throw new GenerationError(`规划 Schema 校验失败：${lastError}`, "validation_error", attempt);
      }
      const generated = {
        ...parsed.data,
        id: createEmptyVariant().id,
        parentVariantId: existing.id,
        creationSource: mode === "alternative" ? "alternative" : mode === "analysis_revision" ? "analysis_revision" : "generated",
        name: mode === "alternative" ? `${existing.name} 替代版` : `${existing.name} 修订版`,
        adopted: false,
        provider: config.provider.type,
        model: response.model,
        promptVersion: "planning-v1.0.0",
        sourceVersions: Object.fromEntries(context.sources.filter((source) => source.included).map((source) => [source.id, source.version])),
      } as typeof parsed.data;
      const merged = mergeGeneratedVariant(existing, generated, modules[mode]);
      const referenceResult = validatePlanningReferences(merged, context);
      const issues = validatePlanning(referenceResult.variant, existing);
      return {
        variant: { ...referenceResult.variant, issues },
        context,
        issues,
        warnings: [...referenceResult.warnings, ...issues.filter((item) => item.type === "locked_content_changed").map((item) => item.rationale)],
        model: response.model,
        retriesUsed: attempt,
      };
    } catch (error) {
      if (error instanceof GenerationError && ["timeout", "cancelled"].includes(error.code)) throw error;
      lastError = (error as Error).message;
      if (attempt >= (config.maxRetries ?? 2)) {
        throw error instanceof GenerationError ? error : new GenerationError(`小说规划生成失败：${lastError}`, "provider_error", attempt);
      }
    }
  }
  throw new GenerationError("小说规划生成失败。", "provider_error");
}
