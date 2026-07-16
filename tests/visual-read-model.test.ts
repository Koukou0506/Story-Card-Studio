import { describe, expect, it } from "vitest";
import { createEmptyProjectDraft } from "@/domain/project-draft";
import { createMockContinuityProject } from "@/services/continuity-mock";
import { ProjectTimelineEventSchema, continuityBase } from "@/domain/continuity";
import { createMockChapterPlanningProject } from "@/services/chapter-planning-mock";
import { createManuscriptFromChapterPlanning } from "@/services/prose-project";
import { queryVisualReadModels, clearVisualReadModelCache } from "@/services/visual-read-model";
import { exportVisualCsv, exportVisualJson, exportVisualSvg } from "@/services/visual-export";

function fixture() {
  const draft = createEmptyProjectDraft();
  const continuity = createMockContinuityProject();
  const planning = createMockChapterPlanningProject();
  const plannedChapters = planning.volumes.flatMap((volume) => volume.chapters);
  if (plannedChapters.length >= 2) continuity.timeline.events.push(
    ProjectTimelineEventSchema.parse({ ...continuityBase("timeline"), id: "actual-first", title: "实际先发生", timeType: "story_day", storyDay: 1, chapterId: plannedChapters[1].id, order: 1 }),
    ProjectTimelineEventSchema.parse({ ...continuityBase("timeline"), id: "actual-second", title: "实际后发生", timeType: "story_day", storyDay: 2, chapterId: plannedChapters[0].id, order: 2 }),
  );
  const manuscript = createManuscriptFromChapterPlanning(planning);
  draft.continuityProjects = [continuity]; draft.selectedContinuityProjectId = continuity.id;
  draft.chapterPlanningProjects = [planning]; draft.manuscripts = [manuscript];
  return draft;
}

describe("Visual Read Model", () => {
  it("builds all seven bounded, source-aware views and preserves directed relationships", () => {
    const result = queryVisualReadModels(fixture(), { maxNodes: 50, pageSize: 20 });
    expect(Object.keys(result.views).sort()).toEqual(["characterPresence", "foreshadow", "knowledgeMatrix", "pacingSeries", "plotThread", "relationshipGraph", "timeline"].sort());
    const source = fixture().continuityProjects[0].relationshipSnapshots[0];
    expect(result.views.relationshipGraph.edges[0]).toMatchObject({ fromCharacterId: source.characterIds[0], toCharacterId: source.characterIds[1] });
    expect(result.views.relationshipGraph.edges).toHaveLength(fixture().continuityProjects[0].relationshipSnapshots.length);
    expect(result.views.relationshipGraph.edges[0].jump.sourceId).toBeTruthy();
    expect(result.views.relationshipGraph.edges.length).toBeLessThanOrEqual(50);
  });

  it("keeps actual and narrative timeline order separate and does not invent dates for fuzzy time", () => {
    const result = queryVisualReadModels(fixture());
    expect(result.views.timeline.actualOrder.map((item) => item.id)).not.toEqual(result.views.timeline.narrativeOrder.map((item) => item.id));
    const fuzzy = result.views.timeline.actualOrder.find((item) => item.timeType === "unknown" || item.timeType === "relative");
    if (fuzzy) expect(fuzzy.exactDate).toBeNull();
  });

  it("exposes thread, foreshadow, knowledge, pacing and presence status including stale/conflict", () => {
    const result = queryVisualReadModels(fixture());
    expect(result.views.plotThread.items.some((item) => item.status === "paused")).toBe(true);
    expect(result.views.foreshadow.items.some((item) => item.overdue)).toBe(true);
    expect(result.views.knowledgeMatrix.rows.some((item) => item.conflict)).toBe(true);
    expect(result.views.pacingSeries.points[0]).toHaveProperty("styleRisk");
    expect(result.views.characterPresence.characters.length).toBeGreaterThan(0);
  });

  it("caches by source version signature and exports current results", () => {
    clearVisualReadModelCache(); const draft = fixture();
    const first = queryVisualReadModels(draft); const second = queryVisualReadModels(draft);
    expect(second).toBe(first);
    draft.savedAt = "2099-01-01T00:00:00.000Z";
    expect(queryVisualReadModels(draft)).not.toBe(first);
    expect(exportVisualJson(first.views.timeline)).toContain("actualOrder");
    expect(exportVisualCsv(first.views.timeline.actualOrder)).toContain("title");
    expect(exportVisualSvg("全书时间线", first.views.timeline.actualOrder)).toContain("<svg");
  });
});
