import type { ProjectDraft } from "@/domain/project-draft";
import { VisualReadModelsSchema, type VisualReadModels } from "@/domain/visual-read-model";
import { blocksToText } from "./prose-editing";
import { analyzeStyleRiskDeterministically } from "./style-risk-analysis";

export interface VisualQueryOptions { maxNodes?: number; pageSize?: number; signal?: AbortSignal }
const cache = new Map<string, VisualReadModels>();
export function clearVisualReadModelCache() { cache.clear(); }
const stateOf = (status: string) => status === "conflicted" || status === "disputed" ? "conflict" as const : ["confirmed", "locked", "current", "active", "resolved", "paid_off"].includes(status) ? "confirmed" as const : "candidate" as const;
const meta = (item: { id: string; status: string; modifiedAt: string; sources?: Array<{ sourceId: string; version?: string }>; chapterId?: string; sceneId?: string; stale?: boolean }) => {
  const source = item.sources?.[0]; const conflict = stateOf(item.status) === "conflict";
  return { sources: item.sources ?? [], version: source?.version || item.modifiedAt, state: stateOf(item.status), conflict, stale: item.stale === true || item.status === "stale", jump: { view: "continuity", sourceId: source?.sourceId || item.id, chapterId: item.chapterId ?? "", sceneId: item.sceneId ?? "" } };
};
function signature(draft: ProjectDraft) { return [draft.savedAt, ...draft.continuityProjects.map((x) => x.modifiedAt), ...draft.chapterPlanningProjects.map((x) => x.modifiedAt), ...draft.manuscripts.map((x) => x.modifiedAt)].join("|"); }
function acceptedChapterText(draft: ProjectDraft, chapterPlanId: string) { return draft.manuscripts.flatMap((m) => m.chapterDrafts).filter((c) => c.chapterPlanId === chapterPlanId).flatMap((c) => c.sceneDrafts).map((s) => s.versions.find((v) => v.id === s.acceptedVersionId)).filter(Boolean).map((v) => blocksToText(v!.blocks)).join("\n\n"); }
const selectedVersion = <T extends { id: string }>(versions: T[], adopted: string | null, selected: string | null) => versions.find((v) => v.id === adopted) ?? versions.find((v) => v.id === selected) ?? versions[0];

export function queryVisualReadModels(draft: ProjectDraft, options: VisualQueryOptions = {}): VisualReadModels {
  options.signal?.throwIfAborted(); const sig = signature(draft); const cached = cache.get(sig); if (cached) return cached;
  const limit = Math.max(10, Math.min(options.maxNodes ?? 500, 2000)); const continuity = draft.continuityProjects.find((x) => x.id === draft.selectedContinuityProjectId) ?? draft.continuityProjects[0];
  const entities = continuity?.entities ?? []; const name = (id: string) => entities.find((e) => e.id === id)?.name || id;
  const nodes = [...new Set((continuity?.relationshipSnapshots ?? []).flatMap((x) => x.characterIds))].slice(0, limit).map((id) => ({ id, title: name(id), status: "confirmed", chapterId: "", sceneId: "", ...meta({ id, status: "confirmed", modifiedAt: draft.savedAt }) }));
  const edges = (continuity?.relationshipSnapshots ?? []).slice(0, limit).map((x) => ({ id: x.id, title: `${name(x.characterIds[0])} → ${name(x.characterIds[1])}`, status: x.status, chapterId: x.chapterId, sceneId: x.sceneId, fromCharacterId: x.characterIds[0], toCharacterId: x.characterIds[1], relationship: x.relationship, trust: x.trust, power: x.power, order: x.order, ...meta(x) }));
  const chapterOrder = new Map<string, number>(); const chapterTitle = new Map<string, string>();
  const pacing: any[] = []; const presence = new Map<string, { chapters: string[]; dialogue: number; pov: string[] }>();
  for (const project of draft.chapterPlanningProjects) for (const volume of project.volumes) for (const chapter of volume.chapters) {
    options.signal?.throwIfAborted(); const cv = selectedVersion(chapter.versions, chapter.adoptedVersionId, chapter.selectedVersionId); if (!cv) continue;
    chapterOrder.set(chapter.id, chapter.order); chapterTitle.set(chapter.id, cv.title); const text = acceptedChapterText(draft, chapter.id); const risk = text.length >= 300 ? analyzeStyleRiskDeterministically({ text }).overallScore : null;
    pacing.push({ id: chapter.id, title: cv.title, status: cv.status, chapterId: chapter.id, sceneId: "", words: text.replace(/\s/g, "").length || cv.estimatedWords, scenes: cv.scenes.length, pacing: cv.pacingIntensity, conflictIntensity: cv.conflictIntensity, emotion: cv.emotionalIntensity, action: cv.actionDensity, information: cv.informationDensity, relationshipProgress: cv.relationshipChanges.length, styleRisk: risk, ...meta({ ...cv, chapterId: chapter.id }) });
    const characterIds = new Set([...cv.characterIds, ...cv.scenes.flatMap((s) => selectedVersion(s.versions, s.adoptedVersionId, s.selectedVersionId)?.presentCharacterIds ?? [])]);
    for (const id of characterIds) { const value = presence.get(id) ?? { chapters: [], dialogue: 0, pov: [] }; value.chapters.push(chapter.id); value.dialogue += (text.match(/[“「『"]/g) ?? []).length; if (cv.pov.povCharacterIds.includes(id)) value.pov.push(chapter.id); presence.set(id, value); }
  }
  const timeline = (continuity?.timeline.events ?? []).slice(0, limit).map((x) => ({ id: x.id, title: x.title, status: x.status, chapterId: x.chapterId, sceneId: x.sceneId, timeType: x.timeType, exactDate: x.timeType === "date" && x.date ? x.date : null, storyDay: x.storyDay, order: x.order, location: x.location, ...meta(x) }));
  const actualOrder = [...timeline].sort((a, b) => (a.storyDay ?? Number.MAX_SAFE_INTEGER) - (b.storyDay ?? Number.MAX_SAFE_INTEGER) || (a.exactDate ?? "~").localeCompare(b.exactDate ?? "~") || a.order - b.order);
  const narrativeOrder = [...timeline].sort((a, b) => (chapterOrder.get(a.chapterId) ?? Number.MAX_SAFE_INTEGER) - (chapterOrder.get(b.chapterId) ?? Number.MAX_SAFE_INTEGER) || a.order - b.order);
  const threadItems = (continuity?.plotThreads ?? []).slice(0, limit).map((x) => ({ id: x.id, title: x.title, status: x.status, chapterId: x.chapterIds[0] ?? "", sceneId: "", characterIds: x.characterIds, events: x.events, stalled: x.status === "paused" || (x.status === "active" && x.events.length === 0), ...meta(x) }));
  const foreshadowItems = (continuity?.foreshadowThreads ?? []).slice(0, limit).map((x) => ({ id: x.id, title: x.title, status: x.status, chapterId: x.events[0]?.chapterId ?? "", sceneId: x.events[0]?.sceneId ?? "", events: x.events, overdue: x.overdue, ...meta(x) }));
  const characterColumns = [...new Set((continuity?.knowledgeStates ?? []).flatMap((x) => x.holders.map((h) => h.characterId)))];
  const knowledgeRows = (continuity?.knowledgeStates ?? []).slice(0, limit).map((x) => ({
    id: x.id, title: x.title, status: x.status, chapterId: "", sceneId: "", public: x.public, secret: x.secret,
    cells: Object.fromEntries([["reader", x.readerStatus], ...characterColumns.map((id) => [id, x.holders.find((h) => h.characterId === id)?.status ?? "does_not_know"])]),
    ...meta(x),
  }));
  const chapters = [...chapterOrder].sort((a, b) => a[1] - b[1]).map(([id, order]) => ({ id, title: chapterTitle.get(id) ?? id, order }));
  const characters = [...presence.entries()].slice(0, limit).map(([id, value]) => { const indexes = value.chapters.map((c) => chapters.findIndex((x) => x.id === c)).filter((x) => x >= 0); const gaps: string[] = []; for (let i = 1; i < indexes.length; i++) if (indexes[i] - indexes[i - 1] > 1) gaps.push(`${chapters[indexes[i - 1] + 1].title}–${chapters[indexes[i] - 1].title}`); return { id, characterId: id, title: name(id), status: "confirmed", chapterId: value.chapters[0] ?? "", sceneId: "", chapterIds: value.chapters, dialogueCount: value.dialogue, povChapterIds: value.pov, absenceRanges: gaps, ...meta({ id, status: "confirmed", modifiedAt: draft.savedAt }) }; });
  const result = VisualReadModelsSchema.parse({ signature: sig, generatedAt: new Date().toISOString(), views: { relationshipGraph: { nodes, edges, truncated: edges.length >= limit }, timeline: { actualOrder, narrativeOrder, truncated: timeline.length >= limit }, plotThread: { items: threadItems, truncated: threadItems.length >= limit }, foreshadow: { items: foreshadowItems, truncated: foreshadowItems.length >= limit }, knowledgeMatrix: { columns: [{ id: "reader", title: "读者" }, ...characterColumns.map((id) => ({ id, title: name(id) }))], rows: knowledgeRows, truncated: knowledgeRows.length >= limit }, pacingSeries: { points: pacing.slice(0, limit), truncated: pacing.length > limit }, characterPresence: { chapters, characters, truncated: characters.length >= limit } } });
  cache.set(sig, result); while (cache.size > 8) cache.delete(cache.keys().next().value!); return result;
}
