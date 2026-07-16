import type { CharacterCardV2 } from "@/domain/character-card";
import type { Lorebook } from "@/domain/lorebook";
import { AnalysisContextSchema, type AnalysisContext, type ContextSource, type PlotAnalysisProject } from "@/domain/plot-analysis";

export interface AnalysisContextBuildInput { project: PlotAnalysisProject; characterCard: CharacterCardV2; lorebooks: Lorebook[] }
export const AUTHORITY_LABELS: Record<number, string> = { 1: "不可修改设定", 2: "用户当前确认事实", 3: "已发生剧情事实", 4: "角色卡/世界书设定", 5: "用户假设", 6: "模型历史建议", 7: "本次模型推断" };
export function estimateTokens(text: string): number { return Math.max(1, Math.ceil(text.length / 2)); }

function source(partial: Omit<ContextSource, "tokenEstimate" | "included" | "inclusionReason" | "relevance"> & Partial<Pick<ContextSource, "included" | "inclusionReason" | "relevance">>): ContextSource {
  return { ...partial, included: partial.included ?? true, inclusionReason: partial.inclusionReason ?? "用户输入", relevance: partial.relevance ?? 1, tokenEstimate: estimateTokens(partial.content) };
}

function terms(project: PlotAnalysisProject): string[] {
  const input = project.input; const text = [input.proposedPlot, input.occurredPlot, input.plotGoal, input.currentPlace, ...input.participatingCharacters,
    ...input.branches.flatMap(branch => [branch.name, branch.description])].join(" ").toLocaleLowerCase();
  return [...new Set(text.split(/[\s，。！？、,.;:：；!?（）()\[\]]+/).map(x => x.trim()).filter(x => x.length >= 2))];
}

function relevanceFor(text: string, keywords: string[]): number {
  const normalized = text.toLocaleLowerCase(); const hits = keywords.filter(key => normalized.includes(key)).length;
  return keywords.length ? Math.min(1, hits / Math.max(2, Math.min(8, keywords.length))) : 0;
}

export function getCurrentSourceVersions(characterCard: CharacterCardV2, lorebooks: Lorebook[]): Record<string, string> {
  return { [`character:${characterCard.data.name || "current-character"}`]: characterCard.data.character_version || "1.0",
    ...Object.fromEntries(lorebooks.map(book => [`lorebook:${book.id}`, book.metadata.modifiedAt])) };
}

export function buildAnalysisContext({ project, characterCard, lorebooks }: AnalysisContextBuildInput): AnalysisContext {
  const input = project.input; const candidates: ContextSource[] = [];
  const userFields: Array<[string, string, number, ContextSource["type"], ContextSource["classification"]]> = [
    ["immutableSettings", input.immutableSettings, 1, "user_confirmed", "confirmed_fact"], ["requiredOutcomes", input.requiredOutcomes, 2, "user_confirmed", "confirmed_fact"],
    ["occurredPlot", input.occurredPlot, 3, "plot_fact", "confirmed_fact"], ["proposedPlot", input.proposedPlot, 5, "user_assumption", "user_assumption"],
    ["plotGoal", input.plotGoal, 2, "user_confirmed", "confirmed_fact"], ["currentTime", input.currentTime, 2, "user_confirmed", "confirmed_fact"],
    ["currentPlace", input.currentPlace, 2, "user_confirmed", "confirmed_fact"], ["characterKnowledge", input.characterKnowledge, 2, "user_confirmed", "confirmed_fact"],
    ["characterEmotions", input.characterEmotions, 2, "user_confirmed", "confirmed_fact"], ["relationshipState", input.relationshipState, 2, "user_confirmed", "confirmed_fact"],
    ["fillableGaps", input.fillableGaps, 5, "user_assumption", "user_assumption"], ["userNotes", input.userNotes, 5, "user_assumption", "user_assumption"],
  ];
  userFields.filter(([, content]) => content.trim()).forEach(([field, content, authority, type, classification]) => candidates.push(source({
    id: `plot:${field}`, type, entityId: project.id, name: project.title, field, content, authority, classification, version: project.modifiedAt })));
  input.branches.forEach(branch => candidates.push(source({ id: `branch:${branch.id}`, type: "user_assumption", entityId: branch.id, name: branch.name, field: "description",
    content: `${branch.description}\n预期：${branch.expectedEffect}\n可修改：${branch.acceptableChanges}`, authority: 5, classification: "user_assumption", version: project.modifiedAt })));

  const characterId = characterCard.data.name || "current-character";
  if (project.selectedCharacterIds.includes(characterId)) {
    const fields = ["description", "personality", "scenario", "creator_notes"] as const;
    fields.filter(field => characterCard.data[field].trim()).forEach(field => candidates.push(source({ id: `character:${characterId}:${field}`, type: "character_card", entityId: characterId,
      name: characterId, field, content: characterCard.data[field], authority: 4, classification: "source_setting", version: characterCard.data.character_version || "1.0" })));
  }

  const keywords = terms(project);
  const plotText = [input.proposedPlot, input.occurredPlot, input.plotGoal, input.currentPlace, ...input.participatingCharacters,
    ...input.branches.flatMap(branch => [branch.name, branch.description])].join(" ").toLocaleLowerCase();
  lorebooks.filter(book => project.selectedLorebookIds.includes(book.id)).forEach(book => book.entries.filter(entry => entry.enabled).forEach(entry => {
    const id = `lorebook:${book.id}:${entry.id}`; const manual = project.manualIncludedEntryIds.includes(entry.id); const excluded = project.manualExcludedEntryIds.includes(entry.id);
    const directMatch = [entry.name, ...entry.activation.primaryKeys].some(term => term.trim().length >= 2 && plotText.includes(term.toLocaleLowerCase()));
    const relevance = directMatch ? 1 : relevanceFor(`${entry.name} ${entry.category} ${entry.activation.primaryKeys.join(" ")} ${entry.content}`, keywords);
    candidates.push(source({ id, type: "lorebook", entityId: entry.id, name: `${book.name} / ${entry.name || "未命名条目"}`, field: "content", content: entry.content,
      authority: entry.provenance === "user_fact" ? 4 : 6, classification: entry.provenance === "user_fact" ? "source_setting" : entry.provenance,
      version: book.metadata.modifiedAt, included: manual || (!excluded && relevance > 0), inclusionReason: excluded ? "用户手动排除" : manual ? "用户手动包含" : relevance > 0 ? "与剧情实体或关键词相关" : "未发现相关性", relevance }));
  }));

  const budget = project.tokenBudget; let used = 0; let truncated = false;
  const ordered = candidates.map((item, index) => ({ item, index })).sort((a, b) => {
    const am = project.manualIncludedEntryIds.includes(a.item.entityId) ? 1 : 0; const bm = project.manualIncludedEntryIds.includes(b.item.entityId) ? 1 : 0;
    return bm - am || a.item.authority - b.item.authority || b.item.relevance - a.item.relevance || a.index - b.index;
  });
  for (const { item } of ordered) {
    if (!item.included) continue;
    if (used + item.tokenEstimate > budget) { item.included = false; item.inclusionReason = "超出 token 预算"; truncated = true; }
    else used += item.tokenEstimate;
  }
  return AnalysisContextSchema.parse({ sources: candidates, selectedSourceIds: candidates.filter(x => x.included).map(x => x.id),
    excludedSourceIds: candidates.filter(x => !x.included).map(x => x.id), tokenBudget: budget, estimatedTokens: used, truncated, createdAt: new Date().toISOString() });
}
