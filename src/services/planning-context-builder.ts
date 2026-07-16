import { z } from "zod";
import type { CharacterCardV2 } from "@/domain/character-card";
import type { Lorebook } from "@/domain/lorebook";
import type { PlotAnalysisProject } from "@/domain/plot-analysis";
import type { StoryPlan } from "@/domain/story-planning";

export const PlanningContextSourceSchema = z.object({
  id: z.string(),
  sourceType: z.string(),
  sourceId: z.string(),
  name: z.string(),
  content: z.string(),
  version: z.string(),
  authority: z.number().int().min(1).max(9),
  locked: z.boolean(),
  modifiable: z.boolean(),
  included: z.boolean(),
  reason: z.string(),
  tokenEstimate: z.number().int(),
});

export const PlanningContextSchema = z.object({
  sources: z.array(PlanningContextSourceSchema),
  estimatedTokens: z.number().int(),
  tokenBudget: z.number().int(),
  truncated: z.boolean(),
  createdAt: z.string(),
});
export type PlanningContext = z.infer<typeof PlanningContextSchema>;

const estimateTokens = (value: string) => Math.max(1, Math.ceil(value.length / 2));

/**
 * Builds a small, inspectable context instead of serialising the whole project.
 * Lower authority numbers win when the token budget is exhausted.
 */
export function buildPlanningContext(
  plan: StoryPlan,
  card: CharacterCardV2,
  books: Lorebook[],
  analyses: PlotAnalysisProject[],
): PlanningContext {
  const selectedVariant = plan.variants.find((variant) => variant.id === plan.selectedVariantId);
  const sources: Array<z.infer<typeof PlanningContextSourceSchema>> = [];
  const add = (source: Omit<z.infer<typeof PlanningContextSourceSchema>, "tokenEstimate" | "included">) => {
    sources.push({ ...source, tokenEstimate: estimateTokens(source.content), included: true });
  };

  if (plan.originalIdea.trim()) {
    add({
      id: "original-idea",
      sourceType: "user_idea",
      sourceId: "project",
      name: "原始创意",
      content: plan.originalIdea,
      version: plan.modifiedAt,
      authority: 1,
      locked: true,
      modifiable: false,
      reason: "用户原始创意",
    });
  }
  add({
    id: "generation-goal",
    sourceType: "user_idea",
    sourceId: "project",
    name: "本次生成目标",
    content: plan.generationGoal,
    version: plan.modifiedAt,
    authority: 2,
    locked: false,
    modifiable: false,
    reason: "用户本次规划目标",
  });

  const selectedCharacters = plan.selectedCharacterIds;
  if (card.data.name && selectedCharacters.includes(card.data.name)) {
    add({
      id: `character-card:${card.data.name}`,
      sourceType: "character_card",
      sourceId: card.data.name,
      name: card.data.name,
      content: [card.data.description, card.data.personality, card.data.scenario, card.data.first_mes]
        .filter(Boolean)
        .join("\n"),
      version: card.data.character_version,
      authority: 3,
      locked: false,
      modifiable: false,
      reason: "用户选择的角色卡",
    });
  }

  const query = `${plan.originalIdea}\n${plan.generationGoal}`.toLocaleLowerCase();
  books
    .filter((book) => plan.selectedLorebookIds.includes(book.id))
    .forEach((book) => {
      book.entries
        .filter((entry) => {
          if (!entry.enabled) return false;
          if (entry.activation.constant) return true;
          const keyHit = [entry.name, ...entry.activation.primaryKeys, ...entry.activation.secondaryKeys]
            .some((key) => key && query.includes(key.toLocaleLowerCase()));
          return keyHit;
        })
        .forEach((entry) => add({
          id: `lore:${book.id}:${entry.id}`,
          sourceType: "lorebook",
          sourceId: entry.id,
          name: `${book.name}/${entry.name}`,
          content: entry.content,
          version: book.metadata.modifiedAt,
          authority: 4,
          locked: false,
          modifiable: false,
          reason: entry.activation.constant ? "常驻条目" : "与创意或生成目标关键词相关",
        }));
    });

  analyses
    .flatMap((project) => project.reports)
    .filter((report) => plan.selectedAnalysisReportIds.includes(report.id))
    .forEach((report) => add({
      id: `analysis:${report.id}`,
      sourceType: "analysis_report",
      sourceId: report.id,
      name: report.inputSnapshot.title,
      content: [report.summary.oneLineConclusion, ...report.suggestions.map((suggestion) => suggestion.minimumChange)]
        .filter(Boolean)
        .join("\n"),
      version: report.modifiedAt,
      authority: 5,
      locked: false,
      modifiable: false,
      reason: "用户选择的 A3 分析结果",
    }));

  if (selectedVariant) {
    const lockedFields = Object.fromEntries(
      selectedVariant.storyBible.lockedFields.map((field) => [field, (selectedVariant.storyBible as Record<string, unknown>)[field]]),
    );
    add({
      id: `plan:${selectedVariant.id}`,
      sourceType: "existing_plan",
      sourceId: selectedVariant.id,
      name: selectedVariant.name,
      content: JSON.stringify({
        storyBible: selectedVariant.storyBible,
        lockedFields,
        characterPlans: selectedVariant.characterPlans,
        characterArcs: selectedVariant.characterArcs,
        relationshipArcs: selectedVariant.relationshipArcs,
        outline: selectedVariant.outline,
        timeline: selectedVariant.timeline,
        notes: selectedVariant.notes,
      }),
      version: selectedVariant.modifiedAt,
      authority: 1,
      locked: true,
      modifiable: false,
      reason: "已有规划与锁定内容",
    });
  }

  if (selectedVariant?.storyBible.constraints.length) {
    selectedVariant.storyBible.constraints.forEach((constraint) => add({
      id: `constraint:${constraint.id}`,
      sourceType: "user_constraint",
      sourceId: constraint.id,
      name: constraint.type,
      content: constraint.content,
      version: constraint.modifiedAt,
      authority: constraint.locked ? 1 : 2,
      locked: constraint.locked,
      modifiable: !constraint.locked,
      reason: constraint.locked ? "锁定创作约束" : "创作约束",
    }));
  }

  let used = 0;
  let truncated = false;
  sources.sort((left, right) => left.authority - right.authority);
  for (const source of sources) {
    if (used + source.tokenEstimate > plan.tokenBudget) {
      source.included = false;
      source.reason = "超出 token 预算，未发送给模型";
      truncated = true;
    } else {
      used += source.tokenEstimate;
    }
  }
  return PlanningContextSchema.parse({
    sources,
    estimatedTokens: used,
    tokenBudget: plan.tokenBudget,
    truncated,
    createdAt: new Date().toISOString(),
  });
}
