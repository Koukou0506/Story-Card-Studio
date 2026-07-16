import type { ProjectDraft } from "@/domain/project-draft";
import { DependencyIndexSchema, type DependencyIndex } from "@/domain/change-management";
import { createContinuitySource } from "@/domain/continuity";
const now = () => new Date().toISOString(); const edgeKey = (a: string, b: string, c: string, d: string) => `${a}:${b}:${c}:${d}`;
export function buildDependencyIndex(draft: ProjectDraft, previous?: DependencyIndex, changedSourceIds: string[] = []): DependencyIndex {
  const signature = [draft.savedAt, ...draft.continuityProjects.map((x) => x.modifiedAt), ...draft.manuscripts.map((x) => x.modifiedAt), ...draft.chapterPlanningProjects.map((x) => x.modifiedAt)].join("|"); if (previous?.signature === signature) return previous;
  const continuity = draft.continuityProjects.find((x) => x.id === draft.selectedContinuityProjectId) ?? draft.continuityProjects[0]; const edges: any[] = [];
  const add = (sourceType: string, sourceId: string, targetType: string, targetId: string, relationType: string, sourceReference: any = null, confidence = "high") => { if (!sourceId || !targetId) return; const edgeId = edgeKey(sourceType, sourceId, targetType, targetId); if (!edges.some((x) => x.edgeId === edgeId)) edges.push({ edgeId, sourceType, sourceId, targetType, targetId, relationType, sourceReference, confidence, createdAt: now(), updatedAt: now() }); };
  for (const entity of continuity?.entities ?? []) for (const source of entity.sources) add(source.sourceType, source.sourceId, "entity", entity.id, "sourced_from", source);
  for (const fact of continuity?.canonLedger.facts ?? []) for (const entityId of fact.entityIds) add("entity", entityId, "canon", fact.id, "affects", fact.sources[0] ?? createContinuitySource("canon", fact.id));
  for (const item of continuity?.characterSnapshots ?? []) add("entity", item.characterId, "character_snapshot", item.id, "derived_from", item.sources[0]);
  for (const item of continuity?.relationshipSnapshots ?? []) for (const entityId of item.characterIds) add("entity", entityId, "relationship_snapshot", item.id, "affects", item.sources[0]);
  for (const item of continuity?.knowledgeStates ?? []) for (const holder of item.holders) add("entity", holder.characterId, "knowledge", item.id, "known_by", item.sources[0]);
  for (const item of continuity?.timeline.events ?? []) for (const entityId of item.characterIds) add("entity", entityId, "timeline", item.id, "appears_in", item.sources[0]);
  for (const item of continuity?.plotThreads ?? []) for (const entityId of item.characterIds) add("entity", entityId, "plot_thread", item.id, "appears_in", item.sources[0]);
  for (const summary of [...(continuity?.chapterSummaries ?? []), ...(continuity?.sceneSummaries ?? [])]) for (const sourceId of summary.sourceDraftVersionIds) add("draft_version", sourceId, "sceneId" in summary ? "scene_summary" : "chapter_summary", summary.id, "derived_from", summary.sources[0]);
  for (const manuscript of draft.manuscripts) for (const chapter of manuscript.chapterDrafts) for (const scene of chapter.sceneDrafts) { add("scene_plan", scene.scenePlanId, "manuscript", scene.id, "derived_from", null, "medium"); for (const version of scene.versions) add("manuscript", scene.id, "draft_version", version.id, "depends_on"); }
  const built = DependencyIndexSchema.parse({ projectId: draft.projectInput.projectName || "local-project", signature, edges, updatedAt: now() }); if (!previous || !changedSourceIds.length) return built;
  const changed = new Set(changedSourceIds); return DependencyIndexSchema.parse({ ...built, edges: [...previous.edges.filter((x) => !changed.has(x.sourceId) && !changed.has(x.targetId)), ...built.edges.filter((x) => changed.has(x.sourceId) || changed.has(x.targetId))] });
}
