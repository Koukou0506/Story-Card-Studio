import { describe, expect, it } from "vitest";
import {
  ChapterPlanSchema,
  ChapterPlanningProjectSchema,
  ForeshadowItemSchema,
  InformationItemSchema,
  PointOfViewConfigSchema,
  SceneEntryStateSchema,
  SceneExitStateSchema,
  ScenePlanSchema,
  ScenePlanVersionSchema,
  VolumePlanSchema,
  createEmptyChapter,
  createEmptyChapterPlanningProject,
  createEmptyScene,
  createEmptyVolume,
} from "@/domain/chapter-planning";

const base = (id: string) => ({ id, createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString() });

describe("B2 chapter planning schemas", () => {
  it("creates a safe empty project with a data version", () => {
    const project = createEmptyChapterPlanningProject("plan", "variant");
    expect(ChapterPlanningProjectSchema.safeParse(project).success).toBe(true);
    expect(project.dataVersion).toBe(1);
    expect(project.volumes).toEqual([]);
  });

  it("creates volume, chapter and scene entities with unique ids", () => {
    const volume = createEmptyVolume();
    const chapter = createEmptyChapter(volume.id);
    const scene = createEmptyScene(chapter.id);
    expect(VolumePlanSchema.safeParse(volume).success).toBe(true);
    expect(ChapterPlanSchema.safeParse(chapter).success).toBe(true);
    expect(ScenePlanSchema.safeParse(scene).success).toBe(true);
    expect(new Set([volume.id, chapter.id, scene.id]).size).toBe(3);
  });

  it("supports complete entry and exit states", () => {
    const state = {
      ...base("state"),
      time: "day-2",
      location: "gate",
      presentCharacterIds: ["hero"],
      bodyStates: { hero: "injured" },
      emotionStates: { hero: "afraid" },
      currentGoals: { hero: "escape" },
      relationshipStates: { pair: "distrust" },
      knownInformationIds: ["secret"],
      heldItems: { hero: ["key"] },
      unresolvedConflicts: ["pursuit"],
    };
    expect(SceneEntryStateSchema.parse(state).heldItems.hero).toContain("key");
    expect(SceneExitStateSchema.parse(state).knownInformationIds).toContain("secret");
  });

  it("supports all configured point-of-view modes", () => {
    for (const perspective of ["first_person", "third_limited", "third_omniscient", "multiple", "custom"]) {
      expect(PointOfViewConfigSchema.safeParse({ ...base(`pov-${perspective}`), perspective }).success).toBe(true);
    }
  });

  it("stores scene function, information and foreshadow fields", () => {
    const scene = createEmptyScene("chapter").versions[0];
    scene.sceneFunctions = ["setup", "reveal"];
    scene.informationRevealIds = ["reveal"];
    scene.foreshadowSetupIds = ["seed"];
    expect(ScenePlanVersionSchema.parse(scene).sceneFunctions).toEqual(["setup", "reveal"]);
    expect(InformationItemSchema.parse({ ...base("info"), title: "Secret" }).readerState).toBe("unknown");
    expect(ForeshadowItemSchema.parse({ ...base("seed"), label: "Mark" }).state).toBe("planned");
  });
});
