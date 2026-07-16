import type { ProjectDraft } from "@/domain/project-draft";
import { ChangeImpactItemSchema, type ChangeImpactItem, type ChangeSet, type DependencyIndex } from "@/domain/change-management";
import { createContinuitySource } from "@/domain/continuity";
import { blocksToText } from "./prose-editing";
const id = () => `impact-${crypto.randomUUID?.() ?? Date.now()}`;
export function analyzeChangeImpact(change: ChangeSet, draft: ProjectDraft, index: DependencyIndex): ChangeImpactItem[] {
  const impacts: ChangeImpactItem[] = []; const seen = new Set<string>();
  const add = (targetType: string, targetId: string, impactType: ChangeImpactItem["impactType"], reason: string, currentValue: unknown, suggestedValue: unknown, sources: any[] = [], confidence: ChangeImpactItem["confidence"] = "high", auto = true) => {
    const key = `${targetType}:${targetId}:${impactType}`; if (seen.has(key)) return; seen.add(key);
    impacts.push(ChangeImpactItemSchema.parse({ impactId: id(), changeSetId: change.changeSetId, targetType, targetId, impactType, confidence, reason, sourceReferences: sources, currentValue, suggestedValue, requiresRevision: targetType === "manuscript", requiresRetcon: change.isRetcon, canAutoPrepare: auto }));
  };
  const queue = change.targetIds.map((value) => ({ value, depth: 0 })); const visited = new Set<string>();
  while (queue.length) { const current = queue.shift()!; if (visited.has(current.value) || current.depth > 6) continue; visited.add(current.value); for (const edge of index.edges.filter((x) => x.sourceId === current.value)) { add(edge.targetType, edge.targetId, current.depth === 0 ? "direct" : current.depth === 1 ? "derived" : "downstream", `${edge.relationType}：依赖 ${current.value}`, change.previousValue, change.proposedValue, edge.sourceReference ? [edge.sourceReference] : [], edge.confidence); queue.push({ value: edge.targetId, depth: current.depth + 1 }); } }
  const old = String(change.previousValue ?? ""), next = String(change.proposedValue ?? ""); const continuity = draft.continuityProjects.find((x) => x.id === draft.selectedContinuityProjectId) ?? draft.continuityProjects[0];
  if (old) {
    if (draft.characterCard.data.name === old || draft.characterCard.data.description.includes(old)) add("character_card", draft.characterCard.data.name || "current", "direct", "角色卡包含原设定", old, next, [createContinuitySource("character_card", draft.characterCard.data.name || "current", { sourceName: "角色卡", excerpt: old, version: draft.savedAt })]);
    for (const book of draft.lorebooks) for (const entry of book.entries) if (`${entry.name}${entry.content}`.includes(old)) add("lorebook", entry.id, "possible", "世界书文本命中；需确认是否为同一实体", old, next, [createContinuitySource("lorebook", entry.id, { sourceName: entry.name, excerpt: entry.content.slice(0, 180), version: String(entry.modifiedAt ?? book.modifiedAt) })], "medium", false);
    for (const fact of continuity?.canonLedger.facts ?? []) if (`${fact.title}${fact.content}`.includes(old)) { const linked = fact.entityIds.some((x) => change.targetIds.includes(x)); add("canon", fact.id, linked ? "direct" : "possible", "Canon 包含原设定", fact.content, fact.content.replaceAll(old, next), fact.sources, "high", linked); }
    for (const event of continuity?.timeline.events ?? []) if (JSON.stringify(event).includes(old)) add("timeline", event.id, "downstream", "时间线引用原设定", event.description, event.description.replaceAll(old, next), event.sources);
    for (const thread of [...(continuity?.plotThreads ?? []), ...(continuity?.foreshadowThreads ?? [])]) if (JSON.stringify(thread).includes(old)) add("plot_thread", thread.id, "downstream", "剧情线或伏笔引用原设定", thread.description, thread.description.replaceAll(old, next), thread.sources);
    for (const manuscript of draft.manuscripts) for (const chapter of manuscript.chapterDrafts) for (const scene of chapter.sceneDrafts) { const version = scene.versions.find((x) => x.id === scene.acceptedVersionId); if (!version) continue; const text = blocksToText(version.blocks); if (text.includes(old)) add("manuscript", scene.id, "possible", "正文出现同名文本；必须人工确认实体与语境", text, text.replaceAll(old, next), version.sources, "medium", false); }
  }
  for (const summary of [...(continuity?.chapterSummaries ?? []), ...(continuity?.sceneSummaries ?? [])]) add("sceneId" in summary ? "scene_summary" : "chapter_summary", summary.id, "stale", `依赖变更 ${change.changeSetId}`, summary.status, "stale", summary.sources);
  add("visual_read_model", "visual", "stale", "可视化缓存依赖项目版本", index.signature, "invalidate"); return impacts;
}
