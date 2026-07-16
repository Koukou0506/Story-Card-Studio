import { describe, expect, it } from "vitest";
import {
  ChapterDependencySchema,
  ForeshadowItemSchema,
  InformationItemSchema,
  InformationRevealSchema,
  SceneDependencySchema,
  createEmptyChapter,
  createEmptyChapterPlanningProject,
  createEmptyScene,
  createEmptyVolume,
} from "@/domain/chapter-planning";
import { createStableId } from "@/domain/lorebook";
import { createEmptyBeat, createEmptyStoryPlan } from "@/domain/story-planning";
import { calculatePlotBeatCoverage, validateChapterPlanning } from "@/services/chapter-planning-validator";

const base = (prefix: string) => ({ id: createStableId(prefix), createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString() });

function fixture() {
  const storyPlan = createEmptyStoryPlan();
  const variant = storyPlan.variants[0];
  const beat = createEmptyBeat(0);
  beat.title = "Required event";
  variant.outline.beats = [beat];
  const project = createEmptyChapterPlanningProject(storyPlan.id, variant.id);
  const volume = createEmptyVolume(0);
  volume.goal = "Advance the investigation";
  const chapter = createEmptyChapter(volume.id, 0);
  const chapterVersion = chapter.versions[0];
  chapterVersion.chapterGoal = "Find the witness";
  chapterVersion.result = "The witness agrees to talk";
  chapterVersion.b1PlotBeatIds = [beat.id];
  const scene = createEmptyScene(chapter.id, 0);
  const sceneVersion = scene.versions[0];
  sceneVersion.sceneGoal = "Reach the witness";
  sceneVersion.result = "A meeting is secured";
  sceneVersion.characterGoals = { hero: "find witness" };
  sceneVersion.presentCharacterIds = ["hero"];
  sceneVersion.pov.povCharacterIds = ["hero"];
  sceneVersion.sceneFunctions = ["setup", "resolution"];
  sceneVersion.b1PlotBeatIds = [beat.id];
  chapterVersion.scenes = [scene];
  volume.chapters = [chapter];
  project.volumes = [volume];
  return { storyPlan, variant, beat, project, volume, chapter, chapterVersion, scene, sceneVersion };
}

describe("B2 chapter and scene validator", () => {
  it("calculates covered and duplicated B1 beats", () => {
    const value = fixture();
    expect(calculatePlotBeatCoverage(value.project, value.variant)[0].status).toBe("covered");
    const duplicate = createEmptyChapter(value.volume.id, 1);
    duplicate.versions[0].b1PlotBeatIds = [value.beat.id];
    duplicate.versions[0].chapterGoal = "Repeat";
    duplicate.versions[0].result = "Repeated";
    value.volume.chapters.push(duplicate);
    expect(calculatePlotBeatCoverage(value.project, value.variant)[0].status).toBe("duplicated");
  });

  it("reports missing volume, chapter and scene goals", () => {
    const value = fixture();
    value.volume.goal = "";
    value.chapterVersion.chapterGoal = "";
    value.sceneVersion.sceneGoal = "";
    const types = validateChapterPlanning(value.project, value.variant).issues.map((item) => item.type);
    expect(types).toEqual(expect.arrayContaining(["volume_missing_goal", "chapter_missing_goal", "scene_missing_goal"]));
  });

  it("detects entry/exit state discontinuity", () => {
    const value = fixture();
    value.sceneVersion.exitState.location = "bridge";
    const second = createEmptyScene(value.chapter.id, 1);
    second.versions[0].sceneGoal = "Continue";
    second.versions[0].result = "Done";
    second.versions[0].entryState.location = "palace";
    second.versions[0].pov.povCharacterIds = ["hero"];
    value.chapterVersion.scenes.push(second);
    expect(validateChapterPlanning(value.project, value.variant).issues.some((item) => item.type === "scene_state_discontinuity")).toBe(true);
  });

  it("detects unmarked POV switching", () => {
    const value = fixture();
    value.sceneVersion.pov.povCharacterIds = ["hero", "witness"];
    value.sceneVersion.pov.allowSwitch = false;
    const types = validateChapterPlanning(value.project, value.variant).issues.map((item) => item.type);
    expect(types).toContain("unmarked_pov_switch");
  });

  it("detects repeated first reveal and missing reveal source", () => {
    const value = fixture();
    const information = InformationItemSchema.parse({ ...base("info"), title: "Identity" });
    const revealA = InformationRevealSchema.parse({ ...base("reveal"), informationItemId: information.id, sceneId: value.scene.id, isFirstReveal: true, order: 1 });
    const revealB = InformationRevealSchema.parse({ ...base("reveal"), informationItemId: information.id, sceneId: value.scene.id, isFirstReveal: true, order: 2 });
    value.project.informationItems = [information];
    value.project.informationReveals = [revealA, revealB];
    value.sceneVersion.informationRevealIds = [revealA.id];
    const types = validateChapterPlanning(value.project, value.variant).issues.map((item) => item.type);
    expect(types).toEqual(expect.arrayContaining(["duplicate_first_reveal", "reveal_missing_source"]));
  });

  it("detects a foreshadow payoff before setup", () => {
    const value = fixture();
    const later = createEmptyScene(value.chapter.id, 1);
    later.versions[0].sceneGoal = "Later";
    later.versions[0].result = "Later result";
    later.versions[0].pov.povCharacterIds = ["hero"];
    value.chapterVersion.scenes.push(later);
    value.project.foreshadows = [ForeshadowItemSchema.parse({
      ...base("seed"), label: "Broken seal", setupLocationIds: [later.id], actualPayoffLocationIds: [value.scene.id], state: "paid_off",
    })];
    expect(validateChapterPlanning(value.project, value.variant).issues.some((item) => item.type === "foreshadow_payoff_before_setup")).toBe(true);
  });

  it("detects self dependencies and chapter dependency cycles", () => {
    const value = fixture();
    const second = createEmptyChapter(value.volume.id, 1);
    second.versions[0].chapterGoal = "Continue";
    second.versions[0].result = "Continued";
    value.chapterVersion.dependencies = [ChapterDependencySchema.parse({
      ...base("chapter-dependency"), fromChapterId: value.chapter.id, toChapterId: second.id, type: "causes",
    })];
    second.versions[0].dependencies = [ChapterDependencySchema.parse({
      ...base("chapter-dependency"), fromChapterId: second.id, toChapterId: value.chapter.id, type: "continues",
    })];
    value.sceneVersion.dependencies = [SceneDependencySchema.parse({
      ...base("scene-dependency"), fromSceneId: value.scene.id, toSceneId: value.scene.id, type: "causes",
    })];
    value.volume.chapters.push(second);
    const types = validateChapterPlanning(value.project, value.variant).issues.map((item) => item.type);
    expect(types).toEqual(expect.arrayContaining(["chapter_dependency_cycle", "scene_self_dependency", "scene_dependency_cycle"]));
  });

  it("does not mutate volume order while validating", () => {
    const value = fixture();
    const other = createEmptyVolume(0);
    other.id = "first-in-array";
    value.volume.order = 2;
    value.project.volumes = [value.volume, other];
    const before = value.project.volumes.map((item) => item.id);
    validateChapterPlanning(value.project, value.variant);
    expect(value.project.volumes.map((item) => item.id)).toEqual(before);
  });
});
