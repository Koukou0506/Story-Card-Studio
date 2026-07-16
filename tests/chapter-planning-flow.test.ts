import { describe, expect, it } from "vitest";
import { createEmptyCharacterCard } from "@/domain/character-card";
import { createEmptyChapterPlanningProject } from "@/domain/chapter-planning";
import { createEmptyLorebook } from "@/domain/lorebook";
import { createEmptyProjectDraft, migrateProjectDraft, PROJECT_DATA_VERSION } from "@/domain/project-draft";
import { createEmptyAnalysisProject } from "@/domain/plot-analysis";
import { createEmptyBeat, createEmptyStoryPlan } from "@/domain/story-planning";
import { MockProvider } from "@/providers/mock";
import { buildChapterPlanningContext } from "@/services/chapter-planning-context-builder";
import { exportChapterPlanningJSON, exportChapterPlanningMarkdown, importChapterPlanningJSON } from "@/services/chapter-planning-export";
import { generateChapterPlanning } from "@/services/chapter-planning-generator";
import { createMockChapterPlanningProject } from "@/services/chapter-planning-mock";
import { validateChapterPlanningReference } from "@/services/chapter-planning-references";
import { cloneChapterVersion, compareChapterVersions, mergeChapterVersion, mergeSceneVersion } from "@/services/chapter-planning-version";

function storyPlanWithBeats() {
  const plan = createEmptyStoryPlan();
  plan.variants[0].outline.beats = Array.from({ length: 8 }, (_, index) => {
    const beat = createEmptyBeat(index);
    beat.title = `Beat ${index + 1}`;
    beat.trigger = `Cause ${index + 1}`;
    beat.directResult = `Result ${index + 1}`;
    return beat;
  });
  return plan;
}

describe("B2 chapter planning flow", () => {
  it("builds an inspectable context within token budget", () => {
    const plan = storyPlanWithBeats();
    const project = createEmptyChapterPlanningProject(plan.id, plan.variants[0].id);
    project.tokenBudget = 256;
    const context = buildChapterPlanningContext({
      project,
      storyPlan: plan,
      characterCard: createEmptyCharacterCard(),
      lorebooks: [createEmptyLorebook()],
      analyses: [],
      plotBeatIds: [plan.variants[0].outline.beats[0].id],
    });
    expect(context.estimatedTokens).toBeLessThanOrEqual(256);
    expect(context.sources.some((item) => item.sourceType === "plot_beat")).toBe(true);
  });

  it("validates references against the exact included source version", () => {
    const plan = storyPlanWithBeats();
    const project = createEmptyChapterPlanningProject(plan.id, plan.variants[0].id);
    const context = buildChapterPlanningContext({ project, storyPlan: plan, characterCard: createEmptyCharacterCard(), lorebooks: [], analyses: [] });
    const source = context.sources.find((item) => item.included && item.sourceType === "plot_beat")!;
    expect(validateChapterPlanningReference({ sourceType: "plot_beat", sourceId: source.sourceId, sourceName: source.name, field: "summary", excerpt: "", version: source.version, valid: true }, context).valid).toBe(true);
    expect(validateChapterPlanningReference({ sourceType: "plot_beat", sourceId: "missing", sourceName: "missing", field: "summary", excerpt: "", version: source.version, valid: true }, context).valid).toBe(false);
  });

  it("preserves locked fields during chapter and scene local regeneration", () => {
    const mock = createMockChapterPlanningProject();
    const chapter = mock.volumes[0].chapters[0].versions[0];
    const generatedChapter = cloneChapterVersion(chapter);
    chapter.lockedFields = ["chapterGoal"];
    chapter.chapterGoal = "Locked chapter goal";
    generatedChapter.chapterGoal = "Replacement";
    generatedChapter.result = "New result";
    const mergedChapter = mergeChapterVersion(chapter, generatedChapter, ["chapterGoal", "result"]);
    expect(mergedChapter.chapterGoal).toBe("Locked chapter goal");
    expect(mergedChapter.result).toBe("New result");

    const scene = chapter.scenes[0].versions[0];
    const generatedScene = structuredClone(scene);
    generatedScene.id = "generated-scene";
    scene.lockedFields = ["turningPoint"];
    scene.turningPoint = "Locked turn";
    generatedScene.turningPoint = "Replacement turn";
    expect(mergeSceneVersion(scene, generatedScene, ["turningPoint"]).turningPoint).toBe("Locked turn");
  });

  it("saves and compares multiple versions", () => {
    const mock = createMockChapterPlanningProject();
    const chapter = mock.volumes[0].chapters[0].versions[0];
    const copy = cloneChapterVersion(chapter, "alternative");
    copy.chapterGoal = "Alternative goal";
    const comparison = compareChapterVersions(chapter, copy);
    expect(copy.parentVersionId).toBe(chapter.id);
    expect(comparison.goalChanged).toBe(true);
  });

  it("does not add a regenerated version to a locked chapter", async () => {
    const plan = storyPlanWithBeats();
    const project = createMockChapterPlanningProject();
    project.b1PlanId = plan.id;
    project.b1VariantId = plan.variants[0].id;
    const volume = project.volumes[0];
    const chapter = volume.chapters[0];
    chapter.locked = true;
    const versionIds = chapter.versions.map((item) => item.id);
    const result = await generateChapterPlanning({
      project,
      mode: "regenerate_chapter",
      scope: { volumeId: volume.id, chapterId: chapter.id },
      storyPlan: plan,
      characterCard: createEmptyCharacterCard(),
      lorebooks: [],
      analyses: [],
      provider: new MockProvider(),
      model: "mock-model",
      timeoutMs: 4000,
      maxRetries: 0,
    });
    expect(result.project.volumes[0].chapters[0].versions.map((item) => item.id)).toEqual(versionIds);
  });

  it("round trips JSON and exports all major Markdown sections", () => {
    const project = createMockChapterPlanningProject();
    const json = exportChapterPlanningJSON(project);
    expect(importChapterPlanningJSON(json)).toEqual(project);
    const markdown = exportChapterPlanningMarkdown(project);
    expect(markdown).toContain("# ");
    expect(markdown).toContain("## ");
    expect(markdown).toContain(project.volumes[0].title);
    expect(json).not.toContain("apiKey");
  });

  it("migrates a B1-era project without losing existing data", () => {
    const draft = createEmptyProjectDraft();
    const plan = storyPlanWithBeats();
    const raw = { ...draft, dataVersion: 4, storyPlans: [plan] } as Record<string, unknown>;
    delete raw.chapterPlanningProjects;
    delete raw.selectedChapterPlanningProjectId;
    const migrated = migrateProjectDraft(raw);
    expect(migrated.dataVersion).toBe(PROJECT_DATA_VERSION);
    expect(migrated.storyPlans[0].id).toBe(plan.id);
    expect(migrated.chapterPlanningProjects).toEqual([]);
    expect(migrated.migrationError).toBeNull();
  });

  it("keeps raw recovery data if migration fails", () => {
    const raw = "not-an-object";
    const migrated = migrateProjectDraft(raw);
    expect(migrated.migrationError).toBeTruthy();
    expect(migrated.recoveryData).toBe(raw);
  });

  it("runs the complete Mock Provider flow without an external request", async () => {
    const plan = storyPlanWithBeats();
    const project = createEmptyChapterPlanningProject(plan.id, plan.variants[0].id);
    const result = await generateChapterPlanning({
      project,
      mode: "volumes",
      scope: {},
      storyPlan: plan,
      characterCard: createEmptyCharacterCard(),
      lorebooks: [],
      analyses: [createEmptyAnalysisProject()],
      provider: new MockProvider(),
      model: "mock-model",
      timeoutMs: 4000,
      maxRetries: 1,
    });
    expect(result.project.volumes).toHaveLength(2);
    expect(result.project.volumes.flatMap((item) => item.chapters).length).toBeGreaterThanOrEqual(6);
    expect(result.project.volumes[0].chapters[0].versions[0].scenes).toHaveLength(3);
    expect(result.project.volumes[0].chapters[0].versions).toHaveLength(2);
    expect(result.project.volumes[0].chapters[0].versions[0].lockedFields).toContain("chapterGoal");
    expect(result.project.plotBeatCoverage.length).toBe(8);
    expect(result.project.sources[0]?.valid).toBe(true);
    expect(result.issues.map((item) => item.type)).toEqual(expect.arrayContaining(["unmarked_pov_switch", "information_known_too_early", "scene_state_discontinuity"]));
  });
});
