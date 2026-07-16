import { z } from "zod";
import { createStableId } from "./lorebook";
import { ContentStatusSchema } from "./story-planning";

export const CHAPTER_PLANNING_DATA_VERSION = 1;
export const CHAPTER_PLANNING_PROMPT_VERSION = "chapter-planning-v1.0.0";

export const ChapterPlanningSourceReferenceSchema = z.object({
  sourceType: z.enum([
    "b1_plan", "plot_section", "plot_beat", "character_card", "lorebook",
    "analysis_report", "chapter", "scene", "user_constraint", "model_suggestion",
  ]),
  sourceId: z.string(),
  sourceName: z.string().default(""),
  field: z.string().default(""),
  excerpt: z.string().default(""),
  version: z.string().default(""),
  valid: z.boolean().default(true),
});

const BaseShape = {
  id: z.string().min(1),
  dataVersion: z.literal(CHAPTER_PLANNING_DATA_VERSION).default(CHAPTER_PLANNING_DATA_VERSION),
  status: ContentStatusSchema.default("draft"),
  sources: z.array(ChapterPlanningSourceReferenceSchema).default([]),
  createdAt: z.string(),
  modifiedAt: z.string(),
};
const Base = z.object(BaseShape);

export const SceneStateSchema = z.object({
  time: z.string().default(""),
  location: z.string().default(""),
  presentCharacterIds: z.array(z.string()).default([]),
  bodyStates: z.record(z.string(), z.string()).default({}),
  emotionStates: z.record(z.string(), z.string()).default({}),
  currentGoals: z.record(z.string(), z.string()).default({}),
  relationshipStates: z.record(z.string(), z.string()).default({}),
  knownInformationIds: z.array(z.string()).default([]),
  heldItems: z.record(z.string(), z.array(z.string())).default({}),
  unresolvedConflicts: z.array(z.string()).default([]),
});

export const SceneEntryStateSchema = Base.extend(SceneStateSchema.shape);
export const SceneExitStateSchema = Base.extend(SceneStateSchema.shape);

export const PointOfViewConfigSchema = Base.extend({
  perspective: z.enum(["first_person", "third_limited", "third_omniscient", "multiple", "custom"]).default("third_limited"),
  povCharacterIds: z.array(z.string()).default([]),
  allowSwitch: z.boolean().default(false),
  switchMarker: z.string().default(""),
  customRules: z.array(z.string()).default([]),
});

export const InformationItemSchema = Base.extend({
  title: z.string().default(""),
  content: z.string().default(""),
  authorKnows: z.boolean().default(true),
  readerState: z.enum(["unknown", "known", "misled"]).default("unknown"),
  characterStates: z.record(z.string(), z.enum(["unknown", "known", "misunderstood"])).default({}),
  secrecy: z.enum(["public", "secret", "misleading"]).default("secret"),
  verification: z.enum(["verified", "unverified"]).default("unverified"),
  expectedResolution: z.string().default(""),
});

export const InformationRevealSchema = Base.extend({
  informationItemId: z.string(),
  chapterId: z.string().default(""),
  sceneId: z.string().default(""),
  target: z.enum(["reader", "characters", "public"]).default("reader"),
  characterIds: z.array(z.string()).default([]),
  method: z.string().default(""),
  sourceReferenceIds: z.array(z.string()).default([]),
  isFirstReveal: z.boolean().default(false),
  order: z.number().int().default(0),
});

export const ForeshadowItemSchema = Base.extend({
  label: z.string().default(""),
  expectedEffect: z.string().default(""),
  setupLocationIds: z.array(z.string()).default([]),
  reinforcementLocationIds: z.array(z.string()).default([]),
  plannedPayoffLocationIds: z.array(z.string()).default([]),
  actualPayoffLocationIds: z.array(z.string()).default([]),
  state: z.enum(["planned", "planted", "set", "reinforced", "resolved", "paid_off", "abandoned", "unknown"]).default("planned"),
  notes: z.string().default(""),
});

export const SceneFunctionSchema = z.enum([
  "setup", "conflict", "reveal", "decision", "reversal", "aftermath",
  "transition", "relationship", "worldbuilding", "climax", "resolution", "custom",
  "action", "dialogue", "investigation", "emotional_reaction", "foreshadow", "payoff",
]);

export const ChapterHookSchema = Base.extend({
  type: z.enum(["question", "danger", "reveal", "decision", "emotion", "promise", "relationship", "unfinished_action", "reversal", "none", "custom"]).default("question"),
  content: z.string().default(""),
});

const DependencyTypeSchema = z.enum([
  "causes", "enables", "motivates", "reveals", "foreshadows", "resolves", "contrasts", "continues",
  "escalates", "interrupts", "reverses", "pays_off", "transitions_to", "contradicts",
]);

export const ChapterDependencySchema = Base.extend({
  fromChapterId: z.string(),
  toChapterId: z.string(),
  type: DependencyTypeSchema,
  description: z.string().default(""),
});

export const SceneDependencySchema = Base.extend({
  fromSceneId: z.string(),
  toSceneId: z.string(),
  type: DependencyTypeSchema,
  description: z.string().default(""),
});

const IntensitySchema = z.number().int().min(1).max(5).default(3);

export const ScenePlanVersionSchema = Base.extend({
  name: z.string().default("Scene version A"),
  parentVersionId: z.string().nullable().default(null),
  creationReason: z.string().default("user"),
  adopted: z.boolean().default(false),
  deprecated: z.boolean().default(false),
  title: z.string().default("Untitled scene"),
  time: z.string().default(""),
  location: z.string().default(""),
  pov: PointOfViewConfigSchema,
  presentCharacterIds: z.array(z.string()).default([]),
  entryState: SceneEntryStateSchema,
  exitState: SceneExitStateSchema,
  sceneGoal: z.string().default(""),
  characterGoals: z.record(z.string(), z.string()).default({}),
  opposingForce: z.string().default(""),
  conflictType: z.string().default(""),
  trigger: z.string().default(""),
  action: z.string().default(""),
  turningPoint: z.string().default(""),
  result: z.string().default(""),
  emotionalChange: z.string().default(""),
  relationshipChanges: z.array(z.string()).default([]),
  informationChanges: z.array(z.string()).default([]),
  newSettings: z.array(z.string()).default([]),
  informationRevealIds: z.array(z.string()).default([]),
  foreshadowSetupIds: z.array(z.string()).default([]),
  foreshadowPayoffIds: z.array(z.string()).default([]),
  sensoryFocus: z.string().default(""),
  dialogueFunction: z.string().default(""),
  sceneFunctions: z.array(SceneFunctionSchema).default([]),
  pacingIntensity: IntensitySchema,
  conflictIntensity: IntensitySchema,
  emotionalIntensity: IntensitySchema,
  informationDensity: IntensitySchema,
  actionDensity: IntensitySchema,
  estimatedWords: z.number().int().min(0).default(1200),
  nextSceneConnection: z.string().default(""),
  notes: z.array(z.string()).default([]),
  b1PlotBeatIds: z.array(z.string()).default([]),
  dependencies: z.array(SceneDependencySchema).default([]),
  lockedFields: z.array(z.string()).default([]),
  newSettingMarked: z.boolean().default(false),
});

export const ScenePlanSchema = Base.extend({
  chapterId: z.string(),
  order: z.number().int().default(0),
  versions: z.array(ScenePlanVersionSchema).default([]),
  selectedVersionId: z.string().nullable().default(null),
  adoptedVersionId: z.string().nullable().default(null),
  locked: z.boolean().default(false),
});

export const ChapterPlanVersionSchema = Base.extend({
  name: z.string().default("Chapter version A"),
  parentVersionId: z.string().nullable().default(null),
  creationReason: z.string().default("user"),
  adopted: z.boolean().default(false),
  deprecated: z.boolean().default(false),
  title: z.string().default("Untitled chapter"),
  volumeId: z.string(),
  b1PlotBeatIds: z.array(z.string()).default([]),
  pov: PointOfViewConfigSchema,
  time: z.string().default(""),
  location: z.string().default(""),
  characterIds: z.array(z.string()).default([]),
  chapterGoal: z.string().default(""),
  mainConflict: z.string().default(""),
  openingState: SceneEntryStateSchema,
  trigger: z.string().default(""),
  mainAction: z.string().default(""),
  coreTurn: z.string().default(""),
  result: z.string().default(""),
  hook: ChapterHookSchema,
  stateChanges: z.array(z.string()).default([]),
  relationshipChanges: z.array(z.string()).default([]),
  worldStateChanges: z.array(z.string()).default([]),
  informationChanges: z.array(z.string()).default([]),
  newInformation: z.array(z.string()).default([]),
  hiddenInformation: z.array(z.string()).default([]),
  recoveredInformation: z.array(z.string()).default([]),
  estimatedWords: z.number().int().min(0).default(5000),
  scenes: z.array(ScenePlanSchema).default([]),
  dependencies: z.array(ChapterDependencySchema).default([]),
  notes: z.array(z.string()).default([]),
  pacingIntensity: IntensitySchema,
  conflictIntensity: IntensitySchema,
  emotionalIntensity: IntensitySchema,
  informationDensity: IntensitySchema,
  actionDensity: IntensitySchema,
  lockedFields: z.array(z.string()).default([]),
  newSettingMarked: z.boolean().default(false),
});

export const ChapterPlanSchema = Base.extend({
  volumeId: z.string(),
  order: z.number().int().default(0),
  versions: z.array(ChapterPlanVersionSchema).default([]),
  selectedVersionId: z.string().nullable().default(null),
  adoptedVersionId: z.string().nullable().default(null),
  locked: z.boolean().default(false),
});

export const VolumePlanSchema = Base.extend({
  title: z.string().default("Untitled volume"),
  subtitle: z.string().default(""),
  order: z.number().int().default(0),
  volumeFunction: z.string().default(""),
  goal: z.string().default(""),
  coreConflict: z.string().default(""),
  opposingForces: z.array(z.string()).default([]),
  characterIds: z.array(z.string()).default([]),
  relationshipGoal: z.string().default(""),
  keyInformation: z.array(z.string()).default([]),
  majorTurns: z.array(z.string()).default([]),
  climax: z.string().default(""),
  openingState: z.string().default(""),
  endingState: z.string().default(""),
  legacyQuestions: z.array(z.string()).default([]),
  plotSectionId: z.string().default(""),
  plotBeatIds: z.array(z.string()).default([]),
  expectedChapterCount: z.number().int().min(0).default(0),
  actualChapterCount: z.number().int().min(0).default(0),
  locked: z.boolean().default(false),
  chapters: z.array(ChapterPlanSchema).default([]),
  notes: z.array(z.string()).default([]),
});

export const PlotBeatCoverageSchema = z.object({
  plotBeatId: z.string(),
  completionChapterIds: z.array(z.string()).default([]),
  setupLocationIds: z.array(z.string()).default([]),
  payoffLocationIds: z.array(z.string()).default([]),
  status: z.enum(["uncovered", "planned", "partially_covered", "covered", "duplicated", "conflicted"]).default("uncovered"),
  duplicated: z.boolean().default(false),
  missing: z.boolean().default(true),
  deviationNotes: z.array(z.string()).default([]),
});

export const ChapterPlanningIssueSchema = Base.extend({
  type: z.string(),
  severity: z.enum(["critical", "major", "moderate", "minor", "note"]),
  confidence: z.enum(["high", "medium", "low"]),
  volumeId: z.string().default(""),
  chapterId: z.string().default(""),
  sceneId: z.string().default(""),
  characterIds: z.array(z.string()).default([]),
  rationale: z.string().default(""),
  minimumRevision: z.string().default(""),
  sideEffects: z.array(z.string()).default([]),
  heuristic: z.boolean().default(false),
  resolution: z.enum(["unresolved", "confirmed_error", "intentional_jump", "omitted_transition", "deferred"]).default("unresolved"),
});

export const ChapterPlanningProjectSchema = Base.extend({
  name: z.string().default("Chapter and scene plan"),
  b1PlanId: z.string(),
  b1VariantId: z.string(),
  volumes: z.array(VolumePlanSchema).default([]),
  informationItems: z.array(InformationItemSchema).default([]),
  informationReveals: z.array(InformationRevealSchema).default([]),
  foreshadows: z.array(ForeshadowItemSchema).default([]),
  plotBeatCoverage: z.array(PlotBeatCoverageSchema).default([]),
  issues: z.array(ChapterPlanningIssueSchema).default([]),
  selectedVolumeId: z.string().nullable().default(null),
  selectedChapterId: z.string().nullable().default(null),
  selectedSceneId: z.string().nullable().default(null),
  selectedAnalysisReportIds: z.array(z.string()).default([]),
  promptVersion: z.string().default(CHAPTER_PLANNING_PROMPT_VERSION),
  provider: z.enum(["mock", "openai", "anthropic"]).default("mock"),
  model: z.string().default(""),
  tokenBudget: z.number().int().min(256).default(10000),
}).passthrough();

export type ChapterPlanningProject = z.infer<typeof ChapterPlanningProjectSchema>;
export type VolumePlan = z.infer<typeof VolumePlanSchema>;
export type ChapterPlan = z.infer<typeof ChapterPlanSchema>;
export type ScenePlan = z.infer<typeof ScenePlanSchema>;
export type ChapterPlanVersion = z.infer<typeof ChapterPlanVersionSchema>;
export type ScenePlanVersion = z.infer<typeof ScenePlanVersionSchema>;
export type SceneEntryState = z.infer<typeof SceneEntryStateSchema>;
export type SceneExitState = z.infer<typeof SceneExitStateSchema>;
export type PointOfViewConfig = z.infer<typeof PointOfViewConfigSchema>;
export type InformationItem = z.infer<typeof InformationItemSchema>;
export type InformationReveal = z.infer<typeof InformationRevealSchema>;
export type ForeshadowItem = z.infer<typeof ForeshadowItemSchema>;
export type ChapterHook = z.infer<typeof ChapterHookSchema>;
export type ChapterDependency = z.infer<typeof ChapterDependencySchema>;
export type SceneDependency = z.infer<typeof SceneDependencySchema>;
export type SceneFunction = z.infer<typeof SceneFunctionSchema>;
export type ChapterPlanningIssue = z.infer<typeof ChapterPlanningIssueSchema>;
export type ChapterPlanningSourceReference = z.infer<typeof ChapterPlanningSourceReferenceSchema>;
export type PlotBeatCoverage = z.infer<typeof PlotBeatCoverageSchema>;

const now = () => new Date().toISOString();
const base = (prefix: string) => ({ id: createStableId(prefix), createdAt: now(), modifiedAt: now() });

export function createEmptySceneVersion(title = "Untitled scene"): ScenePlanVersion {
  return ScenePlanVersionSchema.parse({
    ...base("scene_version"), title, name: "Scene version A",
    pov: base("pov"), entryState: base("entry"), exitState: base("exit"),
  });
}

export function createEmptyScene(chapterId: string, order = 0): ScenePlan {
  const version = createEmptySceneVersion(`Scene ${order + 1}`);
  return ScenePlanSchema.parse({
    ...base("scene"), chapterId, order, versions: [version],
    selectedVersionId: version.id, adoptedVersionId: version.id,
  });
}

export function createEmptyChapterVersion(volumeId: string, title = "Untitled chapter"): ChapterPlanVersion {
  return ChapterPlanVersionSchema.parse({
    ...base("chapter_version"), volumeId, title, name: "Chapter version A",
    pov: base("pov"), openingState: base("opening"), hook: base("hook"),
  });
}

export function createEmptyChapter(volumeId: string, order = 0): ChapterPlan {
  const version = createEmptyChapterVersion(volumeId, `Chapter ${order + 1}`);
  return ChapterPlanSchema.parse({
    ...base("chapter"), volumeId, order, versions: [version],
    selectedVersionId: version.id, adoptedVersionId: version.id,
  });
}

export function createEmptyVolume(order = 0): VolumePlan {
  return VolumePlanSchema.parse({ ...base("volume"), title: `Volume ${order + 1}`, order });
}

export function createEmptyChapterPlanningProject(b1PlanId: string, b1VariantId: string): ChapterPlanningProject {
  return ChapterPlanningProjectSchema.parse({ ...base("chapter_project"), b1PlanId, b1VariantId });
}
