import { z } from "zod";
import { createStableId } from "./lorebook";

export const PROSE_DATA_VERSION = 1;
export const PROSE_PROMPT_VERSION = "prose-v1.0.0";

export const ProseStatusSchema = z.enum([
  "generated", "user_edited", "reviewed", "accepted", "alternative",
  "deprecated", "locked", "conflicted", "incomplete",
]);

export const ProseSourceReferenceSchema = z.object({
  sourceType: z.enum([
    "b1_plan", "plot_beat", "b2_project", "volume", "chapter_plan", "scene_plan",
    "scene_entry_state", "scene_exit_state", "character_card", "lorebook",
    "relationship", "information", "foreshadow", "analysis_report", "previous_prose",
    "style_profile", "language_constraint", "document", "user_instruction", "model_suggestion",
  ]),
  sourceId: z.string(),
  sourceName: z.string().default(""),
  field: z.string().default(""),
  excerpt: z.string().default(""),
  version: z.string().default(""),
  authority: z.number().int().min(1).max(6).default(4),
  locked: z.boolean().default(false),
  allowModelChange: z.boolean().default(false),
  valid: z.boolean().default(true),
});

const BaseShape = {
  id: z.string().min(1),
  dataVersion: z.literal(PROSE_DATA_VERSION).default(PROSE_DATA_VERSION),
  status: ProseStatusSchema.default("alternative"),
  sources: z.array(ProseSourceReferenceSchema).default([]),
  createdAt: z.string(),
  modifiedAt: z.string(),
};
const Base = z.object(BaseShape);
const EmbeddedBaseShape = {
  id: z.string().min(1).default(() => createStableId("prose_value")),
  dataVersion: z.literal(PROSE_DATA_VERSION).default(PROSE_DATA_VERSION),
  status: ProseStatusSchema.default("alternative"),
  sources: z.array(ProseSourceReferenceSchema).default([]),
  createdAt: z.string().default(() => new Date().toISOString()),
  modifiedAt: z.string().default(() => new Date().toISOString()),
};

export const TextBlockSchema = Base.extend({
  order: z.number().int().min(0).default(0),
  kind: z.enum(["paragraph", "dialogue", "narration", "separator", "heading"]).default("paragraph"),
  text: z.string().default(""),
  locked: z.boolean().default(false),
  preserveVerbatim: z.array(z.string()).default([]),
});

export const EditScopeTypeSchema = z.enum([
  "document", "scene", "paragraph", "text_range", "dialogue_only", "narration_only",
  "opening", "ending", "custom",
]);

export const EditScopeSchema = z.object({
  ...EmbeddedBaseShape,
  type: EditScopeTypeSchema.default("scene"),
  start: z.number().int().min(0).nullable().default(null),
  end: z.number().int().min(0).nullable().default(null),
  textBlockIds: z.array(z.string()).default([]),
  allowStructureChanges: z.boolean().default(false),
  allowNewFacts: z.boolean().default(false),
  allowDeleteInformation: z.boolean().default(false),
  lockedBlockIds: z.array(z.string()).default([]),
  preserveVerbatim: z.array(z.string()).default([]),
  customDescription: z.string().default(""),
});

export const ProseGenerationModeSchema = z.enum([
  "full_scene", "opening", "conflict", "turning_point", "ending", "continue",
  "rewrite", "expand", "compress", "enhance_dialogue", "enhance_action",
  "enhance_psychology", "enhance_environment", "adjust_pacing", "custom_revision",
]);

export const StyleProfileSchema = Base.extend({
  name: z.string().default("默认风格"),
  description: z.string().default(""),
  isProjectDefault: z.boolean().default(false),
  sceneOverrideIds: z.array(z.string()).default([]),
  concision: z.number().int().min(1).max(5).default(3),
  sentenceLength: z.number().int().min(1).max(5).default(3),
  paragraphLength: z.number().int().min(1).max(5).default(3),
  dialogueRatio: z.number().int().min(0).max(100).default(35),
  actionRatio: z.number().int().min(0).max(100).default(25),
  psychologyRatio: z.number().int().min(0).max(100).default(20),
  environmentRatio: z.number().int().min(0).max(100).default(20),
  sensoryDensity: z.number().int().min(1).max(5).default(3),
  figurativeDensity: z.number().int().min(1).max(5).default(2),
  subtextIntensity: z.number().int().min(1).max(5).default(3),
  emotionalRestraint: z.number().int().min(1).max(5).default(3),
  pacing: z.number().int().min(1).max(5).default(3),
  narrativeDistance: z.number().int().min(1).max(5).default(3),
  humor: z.number().int().min(1).max(5).default(1),
  overallTone: z.string().default("清晰、克制"),
  customInstructions: z.string().default(""),
  abstractSampleFeatures: z.array(z.string()).default([]),
});

export const LanguageConstraintSchema = Base.extend({
  name: z.string().default("语言规则"),
  content: z.string().default(""),
  scope: z.enum(["project", "character", "scene"]).default("project"),
  targetIds: z.array(z.string()).default([]),
  strictness: z.enum(["hard", "preferred", "advisory"]).default("preferred"),
  enabled: z.boolean().default(true),
  positiveExamples: z.array(z.string()).default([]),
  negativeExamples: z.array(z.string()).default([]),
  locked: z.boolean().default(false),
});

export const ProseGenerationSettingsSchema = z.object({
  ...EmbeddedBaseShape,
  targetWords: z.number().int().min(50).max(20000).default(1200),
  mode: ProseGenerationModeSchema.default("full_scene"),
  person: z.enum(["first", "third", "follow_plan", "custom"]).default("follow_plan"),
  tense: z.enum(["past", "present", "follow_project", "custom"]).default("follow_project"),
  styleProfileId: z.string().nullable().default(null),
  languageConstraintIds: z.array(z.string()).default([]),
  allowMinorDetails: z.boolean().default(true),
  allowMinorDeviation: z.boolean().default(false),
  previousTextMode: z.enum(["near_cursor", "scene", "previous_scene_ending", "chapter_summary", "manual", "auto_related"]).default("auto_related"),
  manualPreviousText: z.string().default(""),
  stream: z.boolean().default(true),
  contextBudget: z.number().int().min(256).max(50000).default(10000),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().int().min(64).max(32000).default(4000),
  stopSequences: z.array(z.string()).default([]),
});

export const ProseGenerationRequestSchema = z.object({
  ...EmbeddedBaseShape,
  manuscriptId: z.string(),
  chapterDraftId: z.string(),
  sceneDraftId: z.string(),
  baseVersionId: z.string(),
  scope: EditScopeSchema,
  settings: ProseGenerationSettingsSchema,
  instruction: z.string().default(""),
});

export const ParagraphDiffSchema = z.object({
  id: z.string(),
  order: z.number().int().default(0),
  type: z.enum(["unchanged", "added", "removed", "modified"]),
  originalBlockId: z.string().nullable().default(null),
  suggestedBlockId: z.string().nullable().default(null),
  originalText: z.string().default(""),
  suggestedText: z.string().default(""),
  decision: z.enum(["pending", "accepted", "rejected"]).default("pending"),
});

export const DraftVersionSchema = Base.extend({
  sceneDraftId: z.string(),
  name: z.string().default("正文版本"),
  parentVersionId: z.string().nullable().default(null),
  blocks: z.array(TextBlockSchema).default([]),
  operationType: ProseGenerationModeSchema.default("full_scene"),
  promptVersion: z.string().default(PROSE_PROMPT_VERSION),
  provider: z.enum(["mock", "openai", "anthropic", "user"]).default("user"),
  model: z.string().default(""),
  b2ProjectVersion: z.string().default(""),
  b2ChapterVersionId: z.string().default(""),
  b2SceneVersionId: z.string().default(""),
  incomplete: z.boolean().default(false),
  locked: z.boolean().default(false),
  wordCount: z.number().int().min(0).default(0),
  notes: z.array(z.string()).default([]),
});

export const RevisionSchema = Base.extend({
  sceneDraftId: z.string(),
  baseVersionId: z.string(),
  suggestedVersionId: z.string(),
  operationType: ProseGenerationModeSchema,
  scope: EditScopeSchema,
  userInstruction: z.string().default(""),
  promptVersion: z.string().default(PROSE_PROMPT_VERSION),
  provider: z.enum(["mock", "openai", "anthropic", "user"]).default("user"),
  model: z.string().default(""),
  sourceVersions: z.record(z.string(), z.string()).default({}),
  diffs: z.array(ParagraphDiffSchema).default([]),
  decision: z.enum(["pending", "accepted", "rejected", "partially_accepted"]).default("pending"),
});

export const PlanCoverageItemSchema = Base.extend({
  sceneDraftId: z.string(),
  element: z.enum(["goal", "conflict", "action", "turning_point", "result", "exit_state", "information_change", "relationship_change", "foreshadow", "payoff"]),
  label: z.string().default(""),
  status: z.enum(["missing", "partial", "covered", "overexpanded", "contradicted", "intentionally_omitted"]).default("missing"),
  textRanges: z.array(z.object({ start: z.number().int().min(0), end: z.number().int().min(0), excerpt: z.string().default("") })).default([]),
  rationale: z.string().default(""),
  heuristic: z.boolean().default(true),
});

export const CandidateFactSchema = Base.extend({
  sceneDraftId: z.string(),
  versionId: z.string(),
  content: z.string(),
  factType: z.enum(["character", "location", "organization", "item", "ability", "world_rule", "relationship", "history", "body_state", "secret", "time"]),
  textRange: z.object({ start: z.number().int().min(0), end: z.number().int().min(0), excerpt: z.string().default("") }),
  alreadyExists: z.boolean().default(false),
  possibleSourceIds: z.array(z.string()).default([]),
  importance: z.enum(["high", "medium", "low"]).default("medium"),
  conflictStatus: z.enum(["none", "possible", "confirmed"]).default("none"),
  recommendation: z.enum(["confirm_project_fact", "add_lorebook_draft", "add_character_note", "add_timeline_candidate", "ignore", "review"]).default("review"),
  decision: z.enum(["pending", "confirmed", "ignored", "copied_to_candidate"]).default("pending"),
});

export const CandidateStateChangeSchema = Base.extend({
  sceneDraftId: z.string(),
  versionId: z.string(),
  changeType: z.enum(["character", "relationship", "world", "information", "item"]),
  entityIds: z.array(z.string()).default([]),
  before: z.string().default(""),
  after: z.string(),
  triggerText: z.string().default(""),
  textRange: z.object({ start: z.number().int().min(0), end: z.number().int().min(0), excerpt: z.string().default("") }),
  confidence: z.enum(["high", "medium", "low"]).default("medium"),
  matchesSceneExitState: z.boolean().nullable().default(null),
  conflictDescription: z.string().default(""),
  decision: z.enum(["pending", "confirmed", "ignored", "b2_copy_created"]).default("pending"),
});

export const ProseIssueSchema = Base.extend({
  type: z.string(),
  severity: z.enum(["critical", "major", "moderate", "minor", "note"]),
  confidence: z.enum(["high", "medium", "low"]),
  sceneDraftId: z.string(),
  versionId: z.string(),
  textRange: z.object({ start: z.number().int().min(0), end: z.number().int().min(0), excerpt: z.string().default("") }).nullable().default(null),
  characterIds: z.array(z.string()).default([]),
  rationale: z.string().default(""),
  minimumRevision: z.string().default(""),
  sideEffects: z.array(z.string()).default([]),
  heuristic: z.boolean().default(true),
  resolution: z.enum(["unresolved", "confirmed_error", "intentional", "deferred"]).default("unresolved"),
});

export const SceneDraftSchema = Base.extend({
  chapterDraftId: z.string(),
  scenePlanId: z.string(),
  b2SceneVersionId: z.string(),
  title: z.string().default("未命名场景"),
  order: z.number().int().min(0).default(0),
  versions: z.array(DraftVersionSchema).default([]),
  selectedVersionId: z.string().nullable().default(null),
  acceptedVersionId: z.string().nullable().default(null),
  revisions: z.array(RevisionSchema).default([]),
  coverage: z.array(PlanCoverageItemSchema).default([]),
  candidateFacts: z.array(CandidateFactSchema).default([]),
  candidateStateChanges: z.array(CandidateStateChangeSchema).default([]),
  issues: z.array(ProseIssueSchema).default([]),
  incomplete: z.boolean().default(true),
});

export const ChapterDraftSchema = Base.extend({
  chapterPlanId: z.string(),
  b2ChapterVersionId: z.string(),
  title: z.string().default("未命名章节"),
  order: z.number().int().min(0).default(0),
  sceneDrafts: z.array(SceneDraftSchema).default([]),
  summary: z.string().default(""),
});

export const ProsePromptVersionSchema = Base.extend({
  version: z.string().default(PROSE_PROMPT_VERSION),
  mode: ProseGenerationModeSchema,
  textOnly: z.literal(true).default(true),
  description: z.string().default(""),
});

export const ManuscriptSchema = Base.extend({
  name: z.string().default("正文稿"),
  b1PlanId: z.string().default(""),
  b1VariantId: z.string().default(""),
  b2ProjectId: z.string(),
  b2SourceVersion: z.string().default(""),
  chapterDrafts: z.array(ChapterDraftSchema).default([]),
  styleProfiles: z.array(StyleProfileSchema).default([]),
  languageConstraints: z.array(LanguageConstraintSchema).default([]),
  promptVersions: z.array(ProsePromptVersionSchema).default([]),
  selectedChapterDraftId: z.string().nullable().default(null),
  selectedSceneDraftId: z.string().nullable().default(null),
  defaultStyleProfileId: z.string().nullable().default(null),
  provider: z.enum(["mock", "openai", "anthropic"]).default("mock"),
  model: z.string().default("mock-model"),
  tokenBudget: z.number().int().min(256).default(10000),
  analysisReportIds: z.array(z.string()).default([]),
  b2CandidateCopyNotes: z.array(z.string()).default([]),
}).passthrough();

export type ProseStatus = z.infer<typeof ProseStatusSchema>;
export type ProseSourceReference = z.infer<typeof ProseSourceReferenceSchema>;
export type TextBlock = z.infer<typeof TextBlockSchema>;
export type EditScope = z.infer<typeof EditScopeSchema>;
export type ProseGenerationMode = z.infer<typeof ProseGenerationModeSchema>;
export type StyleProfile = z.infer<typeof StyleProfileSchema>;
export type LanguageConstraint = z.infer<typeof LanguageConstraintSchema>;
export type ProseGenerationSettings = z.infer<typeof ProseGenerationSettingsSchema>;
export type ProseGenerationRequest = z.infer<typeof ProseGenerationRequestSchema>;
export type ParagraphDiff = z.infer<typeof ParagraphDiffSchema>;
export type DraftVersion = z.infer<typeof DraftVersionSchema>;
export type Revision = z.infer<typeof RevisionSchema>;
export type PlanCoverageItem = z.infer<typeof PlanCoverageItemSchema>;
export type CandidateFact = z.infer<typeof CandidateFactSchema>;
export type CandidateStateChange = z.infer<typeof CandidateStateChangeSchema>;
export type ProseIssue = z.infer<typeof ProseIssueSchema>;
export type SceneDraft = z.infer<typeof SceneDraftSchema>;
export type ChapterDraft = z.infer<typeof ChapterDraftSchema>;
export type ProsePromptVersion = z.infer<typeof ProsePromptVersionSchema>;
export type Manuscript = z.infer<typeof ManuscriptSchema>;

const now = () => new Date().toISOString();
const base = (prefix: string) => ({ id: createStableId(prefix), createdAt: now(), modifiedAt: now() });
export const proseBase = base;

export function createTextBlocks(text: string, status: ProseStatus = "user_edited"): TextBlock[] {
  const parts = text.replace(/\r\n/g, "\n").split(/\n{2,}/).filter((item) => item.length > 0);
  return parts.map((item, order) => TextBlockSchema.parse({
    ...base("text_block"), status, order, text: item,
    kind: /^[“\"「『].+[”\"」』]$/.test(item.trim()) ? "dialogue" : "paragraph",
  }));
}

export function createEmptyStyleProfile(name = "项目默认风格"): StyleProfile {
  return StyleProfileSchema.parse({ ...base("style"), status: "accepted", name, isProjectDefault: true });
}

export function createEmptyLanguageConstraint(): LanguageConstraint {
  return LanguageConstraintSchema.parse({ ...base("language_rule"), status: "accepted" });
}

export function createDraftVersion(sceneDraftId: string, text = "", status: ProseStatus = "alternative"): DraftVersion {
  return DraftVersionSchema.parse({
    ...base("draft_version"), status, sceneDraftId, blocks: createTextBlocks(text, status),
    wordCount: text.replace(/\s/g, "").length,
  });
}

export function createEmptySceneDraft(chapterDraftId: string, scenePlanId: string, b2SceneVersionId: string, title = "未命名场景", order = 0): SceneDraft {
  const version = createDraftVersion("pending", "", "incomplete");
  const id = createStableId("scene_draft");
  version.sceneDraftId = id;
  return SceneDraftSchema.parse({
    ...base("unused"), id, status: "incomplete", chapterDraftId, scenePlanId, b2SceneVersionId,
    title, order, versions: [version], selectedVersionId: version.id, acceptedVersionId: null,
  });
}

export function createEmptyChapterDraft(chapterPlanId: string, b2ChapterVersionId: string, title = "未命名章节", order = 0): ChapterDraft {
  return ChapterDraftSchema.parse({ ...base("chapter_draft"), status: "incomplete", chapterPlanId, b2ChapterVersionId, title, order });
}

export function createEmptyManuscript(b2ProjectId: string, name = "正文稿"): Manuscript {
  const style = createEmptyStyleProfile();
  const promptVersions = ProseGenerationModeSchema.options.map((mode) => ProsePromptVersionSchema.parse({ ...base("prose_prompt"), status: "accepted", mode, description: `正文模式 ${mode} 的纯文本输出契约` }));
  return ManuscriptSchema.parse({
    ...base("manuscript"), status: "incomplete", name, b2ProjectId,
    styleProfiles: [style], defaultStyleProfileId: style.id, promptVersions,
  });
}
