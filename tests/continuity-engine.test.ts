import { describe, expect, it } from "vitest";
import { createMockChapterPlanningProject } from "@/services/chapter-planning-mock";
import { createManuscriptFromChapterPlanning } from "@/services/prose-project";
import { createTextBlocks } from "@/domain/prose";
import { createEmptyStoryPlan } from "@/domain/story-planning";
import { createEmptyContinuityProject, CharacterSnapshotSchema, KnowledgeStateSchema, ForeshadowThreadSchema, ForeshadowEventSchema, PlanManuscriptDriftSchema, continuityBase } from "@/domain/continuity";
import { deriveSnapshots, integrateProjectTimeline, summarizeAcceptedManuscript, markStaleSummaries, analyzePlanManuscriptDrift, validateContinuity, calculateWritingProgress, buildProjectHealthReport, buildNextChapterContextPackage, importB2Foreshadows } from "@/services/continuity-engine";

function acceptedSetup() {
  const b2 = createMockChapterPlanningProject(); const manuscript = createManuscriptFromChapterPlanning(b2); const scene = manuscript.chapterDrafts[0].sceneDrafts[0]; const version = scene.versions[0];
  version.blocks = createTextBlocks("柳如烟进入旧宅。\n\n她找到一页账册，随后带着证据离开。", "accepted"); version.wordCount = 30; version.status = "accepted"; scene.acceptedVersionId = version.id; scene.status = "accepted"; return { b2, manuscript, scene, version };
}

describe("C1 snapshots, knowledge and timeline", () => {
  it("derives character, relationship and world snapshots from B2 entry/exit states", () => {
    const b2 = createMockChapterPlanningProject(); const result = deriveSnapshots([b2]);
    expect(result.characters.length).toBeGreaterThan(0); expect(result.worlds.length).toBeGreaterThan(0); expect(result.characters.every((s) => s.status === "candidate")).toBe(true);
  });

  it("derives Knowledge State without granting author knowledge to characters", () => {
    const b2 = createMockChapterPlanningProject(); const result = deriveSnapshots([b2]);
    expect(result.knowledge.length).toBeGreaterThan(0); expect(result.knowledge[0].holders.some((h) => h.status === "unknown" || h.status === "does_not_know" || h.status === "knows" || h.status === "believes_false")).toBe(true);
  });

  it("integrates B1, B2 and Canon timeline events with sources", () => {
    const project = createEmptyContinuityProject(); const plan = createEmptyStoryPlan(); plan.variants[0].timeline.events = [];
    const timeline = integrateProjectTimeline([plan], [createMockChapterPlanningProject()], project);
    expect(timeline.events.length).toBeGreaterThan(0); expect(timeline.events.every((e) => e.sources.length > 0)).toBe(true);
  });
});

describe("C1 summaries and plan-manuscript drift", () => {
  it("generates fact-classified summaries from accepted versions", () => {
    const { manuscript, version } = acceptedSetup(); const summaries = summarizeAcceptedManuscript(manuscript);
    expect(summaries.scenes[0].sourceDraftVersionIds).toEqual([version.id]); expect(summaries.scenes[0].majorEvents[0].classification).toBe("fact");
  });

  it("marks a summary stale when accepted prose changes", () => {
    const { manuscript } = acceptedSetup(); const summaries = summarizeAcceptedManuscript(manuscript); manuscript.chapterDrafts[0].sceneDrafts[0].acceptedVersionId = null;
    const stale = markStaleSummaries([manuscript], summaries.scenes, summaries.chapters); expect(stale.scenes[0].stale).toBe(true); expect(stale.chapters[0].status).toBe("stale");
  });

  it("detects missing planned scenes and does not modify either source", () => {
    const b2 = createMockChapterPlanningProject(); const before = JSON.stringify(b2); const drifts = analyzePlanManuscriptDrift([b2], []);
    expect(drifts.some((d) => d.driftType === "planned_event_missing")).toBe(true); expect(JSON.stringify(b2)).toBe(before);
  });
});

describe("C1 continuity validator", () => {
  it("finds early knowledge without a channel", () => {
    const project = createEmptyContinuityProject(); project.knowledgeStates = [KnowledgeStateSchema.parse({ ...continuityBase("knowledge"), informationId: "secret", title: "秘密", holders: [{ characterId: "a", status: "knows", channel: "" }] })];
    expect(validateContinuity(project).map((i) => i.type)).toContain("knowledge_channel_missing");
  });

  it("finds location and physical-state conflicts", () => {
    const project = createEmptyContinuityProject(); project.characterSnapshots = [
      CharacterSnapshotSchema.parse({ ...continuityBase("snapshot"), characterId: "a", order: 1, location: "甲地", body: "受伤" }),
      CharacterSnapshotSchema.parse({ ...continuityBase("snapshot"), characterId: "a", order: 1, location: "乙地", body: "无伤" }),
    ]; const types = validateContinuity(project).map((i) => i.type); expect(types).toContain("character_location_conflict"); expect(types).toContain("body_state_conflict");
  });

  it("finds payoff-before-setup and overdue foreshadow", () => {
    const project = createEmptyContinuityProject(); project.foreshadowThreads = [ForeshadowThreadSchema.parse({ ...continuityBase("foreshadow"), status: "due", overdue: true, events: [ForeshadowEventSchema.parse({ ...continuityBase("event"), threadId: "f", eventType: "setup", order: 5 }), ForeshadowEventSchema.parse({ ...continuityBase("event"), threadId: "f", eventType: "payoff", order: 2 })] })];
    const types = validateContinuity(project).map((i) => i.type); expect(types).toContain("payoff_before_setup"); expect(types).toContain("foreshadow_overdue");
  });

  it("reports open plan-manuscript drift", () => {
    const project = createEmptyContinuityProject(); project.drifts = [PlanManuscriptDriftSchema.parse({ ...continuityBase("drift"), driftType: "major_addition", description: "新增设定" })];
    expect(validateContinuity(project).map((i) => i.type)).toContain("plan_manuscript_drift");
  });
});

describe("C1 health, progress and next chapter context", () => {
  it("counts only accepted manuscript versions as formal progress", () => {
    const { b2, manuscript, scene } = acceptedSetup(); scene.versions.push({ ...scene.versions[0], id: "alternative", status: "alternative", wordCount: 9999 });
    const progress = calculateWritingProgress([manuscript], [b2]); expect(progress.totalWords).toBe(30); expect(progress.sceneWords[0].words).toBe(30);
  });

  it("builds a non-mutating health report", () => {
    const project = createEmptyContinuityProject(); const before = JSON.stringify(project); const report = buildProjectHealthReport(project);
    expect(report.generatedAt).toBeTruthy(); expect(JSON.stringify(project)).toBe(before);
  });

  it("builds an editable and lockable next chapter package", () => {
    const project = createEmptyContinuityProject(); const b2 = createMockChapterPlanningProject(); const context = buildNextChapterContextPackage(project, b2);
    expect(context.chapterId).toBeTruthy(); expect(Array.isArray(context.povRules)).toBe(true); expect(context.status).toBe("draft");
  });

  it("imports B2 foreshadows without altering B2", () => {
    const b2 = createMockChapterPlanningProject(); const before = JSON.stringify(b2); const result = importB2Foreshadows([b2]); expect(result.length).toBe(b2.foreshadows.length); expect(JSON.stringify(b2)).toBe(before);
  });
});
