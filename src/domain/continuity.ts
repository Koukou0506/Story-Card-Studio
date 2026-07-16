import { z } from "zod";
import { createStableId } from "./lorebook";

export const CONTINUITY_DATA_VERSION = 1;
export const CONTINUITY_PROMPT_VERSION = "continuity-v1.0.0";

export const ContinuitySeveritySchema = z.enum(["critical", "major", "moderate", "minor", "note"]);
export const ContinuityConfidenceSchema = z.enum(["high", "medium", "low"]);
export const CanonAuthoritySchema = z.number().int().min(1).max(9);
export const CanonStatusSchema = z.enum(["locked", "confirmed", "derived", "candidate", "disputed", "retconned", "deprecated", "unknown"]);
export const EntityTypeSchema = z.enum(["character", "location", "organization", "item", "ability", "world_rule", "event", "secret", "plot_thread", "foreshadow", "chapter", "scene"]);
export const KnowledgeStatusSchema = z.enum(["knows", "believes_true", "believes_false", "suspects", "does_not_know", "forgot", "unknown"]);

export const ContinuitySourceReferenceSchema = z.object({
  sourceType: z.enum([
    "user", "character_card", "lorebook", "story_plan", "plot_beat", "b2_project", "volume",
    "chapter_plan", "scene_plan", "scene_entry", "scene_exit", "manuscript", "draft_version",
    "text_block", "candidate_fact", "candidate_state", "canon", "timeline", "plot_thread",
    "foreshadow", "analysis_report", "document", "model_inference", "model_suggestion",
  ]),
  sourceId: z.string().min(1),
  sourceName: z.string().default(""),
  field: z.string().default(""),
  excerpt: z.string().default(""),
  version: z.string().default(""),
  authority: CanonAuthoritySchema.default(9),
  classification: z.enum(["confirmed_fact", "project_fact", "source_setting", "user_assumption", "model_inference", "model_suggestion", "unknown"]).default("unknown"),
  locked: z.boolean().default(false),
  valid: z.boolean().default(true),
});

const BaseShape = {
  id: z.string().min(1),
  dataVersion: z.literal(CONTINUITY_DATA_VERSION).default(CONTINUITY_DATA_VERSION),
  status: z.string().default("unknown"),
  sources: z.array(ContinuitySourceReferenceSchema).default([]),
  createdAt: z.string(),
  modifiedAt: z.string(),
};
const Base = z.object(BaseShape);

export const CanonFactSchema = Base.extend({
  status: CanonStatusSchema.default("candidate"),
  title: z.string().default("未命名事实"),
  content: z.string().default(""),
  factType: z.enum(["character", "location", "organization", "item", "ability", "world_rule", "relationship", "history", "body_state", "secret", "time", "event"]).default("event"),
  entityIds: z.array(z.string()).default([]),
  authority: CanonAuthoritySchema.default(8),
  effectiveFrom: z.string().default(""),
  effectiveTo: z.string().default(""),
  spatialScope: z.string().default(""),
  locked: z.boolean().default(false),
  publicKnowledge: z.boolean().default(false),
  knowingCharacterIds: z.array(z.string()).default([]),
  relatedFactIds: z.array(z.string()).default([]),
  conflictFactIds: z.array(z.string()).default([]),
  notes: z.array(z.string()).default([]),
});

export const CanonConflictSchema = Base.extend({
  status: z.enum(["open", "resolved", "false_positive", "deferred"]).default("open"),
  conflictType: z.enum(["direct_content", "time", "identity", "state", "source_version", "different_effective_time", "can_coexist", "insufficient_information"]),
  factIds: z.array(z.string()).min(2),
  description: z.string().default(""),
  resolution: z.enum(["unresolved", "keep_old", "adopt_new", "set_effective_time", "keep_both", "create_retcon", "false_positive", "deferred"]).default("unresolved"),
  effectiveTime: z.string().default(""),
  rationale: z.string().default(""),
  resolvedAt: z.string().nullable().default(null),
});

export const RetconRecordSchema = Base.extend({
  status: z.enum(["planned", "active", "completed", "deprecated"]).default("active"),
  oldFactId: z.string(),
  newFactId: z.string(),
  reason: z.string().default(""),
  effectiveScope: z.string().default(""),
  affectedChapterIds: z.array(z.string()).default([]),
  affectedCharacterIds: z.array(z.string()).default([]),
  sourceIdsToReview: z.array(z.string()).default([]),
});

export const CanonLedgerSchema = Base.extend({
  status: z.enum(["active", "archived"]).default("active"),
  name: z.string().default("项目 Canon"),
  facts: z.array(CanonFactSchema).default([]),
  conflicts: z.array(CanonConflictSchema).default([]),
  retcons: z.array(RetconRecordSchema).default([]),
});

export const EntityAliasSchema = Base.extend({
  status: z.enum(["confirmed", "candidate", "deprecated"]).default("candidate"),
  entityId: z.string(),
  value: z.string(),
  normalized: z.string().default(""),
  context: z.string().default(""),
});

export const ProjectEntitySchema = Base.extend({
  status: z.enum(["active", "candidate", "merged", "deprecated"]).default("active"),
  entityType: EntityTypeSchema,
  name: z.string().min(1),
  normalizedName: z.string().default(""),
  aliases: z.array(EntityAliasSchema).default([]),
  description: z.string().default(""),
  firstAppearanceId: z.string().default(""),
  lastAppearanceId: z.string().default(""),
  canonFactIds: z.array(z.string()).default([]),
  chapterIds: z.array(z.string()).default([]),
  sceneIds: z.array(z.string()).default([]),
  mergedIntoId: z.string().nullable().default(null),
});

export const CharacterSnapshotSchema = Base.extend({
  status: z.enum(["confirmed", "candidate", "stale"]).default("candidate"),
  characterId: z.string(),
  chapterId: z.string().default(""), sceneId: z.string().default(""), order: z.number().int().default(0), time: z.string().default(""),
  location: z.string().default(""), body: z.string().default(""), emotion: z.string().default(""), goal: z.string().default(""),
  identity: z.string().default(""), affiliation: z.string().default(""), informationIds: z.array(z.string()).default([]),
  items: z.array(z.string()).default([]), unfinishedActions: z.array(z.string()).default([]), confirmed: z.boolean().default(false),
});

export const RelationshipSnapshotSchema = Base.extend({
  status: z.enum(["confirmed", "candidate", "stale"]).default("candidate"),
  characterIds: z.array(z.string()).min(2), chapterId: z.string().default(""), sceneId: z.string().default(""), order: z.number().int().default(0),
  relationship: z.string().default(""), trust: z.string().default(""), power: z.string().default(""), unresolvedConflict: z.string().default(""), confirmed: z.boolean().default(false),
});

export const WorldSnapshotSchema = Base.extend({
  status: z.enum(["confirmed", "candidate", "stale"]).default("candidate"),
  entityId: z.string(), entityType: z.enum(["organization", "society", "location", "world_rule", "item"]).default("world_rule"),
  chapterId: z.string().default(""), sceneId: z.string().default(""), order: z.number().int().default(0), state: z.string().default(""), scope: z.string().default(""), confirmed: z.boolean().default(false),
});

export const KnowledgeHolderSchema = z.object({
  characterId: z.string(), status: KnowledgeStatusSchema.default("unknown"), acquiredAt: z.string().default(""),
  channel: z.string().default(""), misunderstood: z.boolean().default(false), suspected: z.boolean().default(false), sourceIds: z.array(z.string()).default([]),
});
export const KnowledgeStateSchema = Base.extend({
  status: z.enum(["confirmed", "candidate", "conflicted", "deprecated"]).default("candidate"),
  informationId: z.string(), title: z.string().default(""), content: z.string().default(""),
  readerStatus: KnowledgeStatusSchema.default("unknown"), public: z.boolean().default(false), secret: z.boolean().default(true),
  verified: z.boolean().default(false), holders: z.array(KnowledgeHolderSchema).default([]),
});

export const PlotThreadEventSchema = Base.extend({
  status: z.enum(["planned", "occurred", "candidate", "deprecated"]).default("planned"),
  threadId: z.string(), eventType: z.enum(["introduced", "advanced", "complicated", "paused", "resolved", "reopened", "abandoned"]),
  chapterId: z.string().default(""), sceneId: z.string().default(""), plotBeatId: z.string().default(""), summary: z.string().default(""), order: z.number().int().default(0),
});
export const PlotThreadSchema = Base.extend({
  status: z.enum(["candidate", "active", "paused", "resolved", "abandoned", "deprecated"]).default("candidate"),
  title: z.string().default("未命名剧情线"), description: z.string().default(""), characterIds: z.array(z.string()).default([]),
  plotBeatIds: z.array(z.string()).default([]), chapterIds: z.array(z.string()).default([]), currentState: z.string().default(""),
  nextNode: z.string().default(""), plannedResolutionLocation: z.string().default(""), events: z.array(PlotThreadEventSchema).default([]),
});

export const OpenQuestionSchema = Base.extend({
  status: z.enum(["unanswered", "partially_answered", "answered", "intentionally_open", "deprecated"]).default("unanswered"),
  question: z.string().default(""), answer: z.string().default(""), characterIds: z.array(z.string()).default([]),
  plotThreadIds: z.array(z.string()).default([]), introducedAt: z.string().default(""), plannedAnswerLocation: z.string().default(""), answeredAt: z.string().default(""),
});

export const ForeshadowEventSchema = Base.extend({
  status: z.enum(["planned", "occurred", "candidate", "deprecated"]).default("planned"),
  threadId: z.string(), eventType: z.enum(["setup", "reinforcement", "misdirection", "planned_payoff", "payoff", "retcon"]),
  chapterId: z.string().default(""), sceneId: z.string().default(""), order: z.number().int().default(0), description: z.string().default(""),
});
export const ForeshadowThreadSchema = Base.extend({
  status: z.enum(["candidate", "planned", "planted", "reinforced", "due", "paid_off", "abandoned", "retconned"]).default("candidate"),
  title: z.string().default("未命名伏笔"), description: z.string().default(""), expectedPayoff: z.string().default(""),
  plannedPayoffLocation: z.string().default(""), events: z.array(ForeshadowEventSchema).default([]), overdue: z.boolean().default(false), importedFromB2Id: z.string().default(""),
});

export const ProjectTimelineEventSchema = Base.extend({
  status: z.enum(["confirmed", "candidate", "conflicted", "deprecated"]).default("candidate"),
  title: z.string().default(""), description: z.string().default(""), timeType: z.enum(["date", "story_day", "relative", "order", "range", "unknown"]).default("unknown"),
  date: z.string().default(""), storyDay: z.number().int().nullable().default(null), relativeToEventId: z.string().default(""),
  relativeOffset: z.number().int().nullable().default(null), order: z.number().int().default(0), start: z.string().default(""), end: z.string().default(""),
  location: z.string().default(""), characterIds: z.array(z.string()).default([]), chapterId: z.string().default(""), sceneId: z.string().default(""),
});
export const ProjectTimelineSchema = Base.extend({
  status: z.enum(["active", "stale", "archived"]).default("active"), name: z.string().default("全书时间线"), events: z.array(ProjectTimelineEventSchema).default([]),
});

const SummaryItemSchema = z.object({ content: z.string(), classification: z.enum(["fact", "inference", "suggestion"]).default("fact"), sourceIds: z.array(z.string()).default([]) });
const SummaryShape = {
  sourceManuscriptId: z.string(), sourceDraftVersionIds: z.array(z.string()).default([]), stale: z.boolean().default(false),
  majorEvents: z.array(SummaryItemSchema).default([]), characterChoices: z.array(SummaryItemSchema).default([]),
  characterChanges: z.array(SummaryItemSchema).default([]), relationshipChanges: z.array(SummaryItemSchema).default([]),
  informationChanges: z.array(SummaryItemSchema).default([]), newFacts: z.array(SummaryItemSchema).default([]),
  plotThreadChanges: z.array(SummaryItemSchema).default([]), foreshadowChanges: z.array(SummaryItemSchema).default([]),
  openQuestions: z.array(SummaryItemSchema).default([]), endingState: z.string().default(""),
};
export const ChapterSummarySchema = Base.extend({ status: z.enum(["current", "stale", "candidate"]).default("candidate"), chapterId: z.string(), ...SummaryShape });
export const SceneSummarySchema = Base.extend({ status: z.enum(["current", "stale", "candidate"]).default("candidate"), chapterId: z.string(), sceneId: z.string(), ...SummaryShape });

export const PlanManuscriptDriftSchema = Base.extend({
  status: z.enum(["open", "intentional", "accepted_manuscript", "revision_task", "plan_copy_created", "deferred"]).default("open"),
  driftType: z.enum(["planned_event_missing", "major_addition", "character_choice", "information_reveal", "relationship_change", "time_change", "ending_state", "beat_coverage", "foreshadow_location"]),
  planSourceId: z.string().default(""), manuscriptSourceId: z.string().default(""), chapterId: z.string().default(""), sceneId: z.string().default(""),
  description: z.string().default(""), impact: z.string().default(""), recommendation: z.string().default(""),
});

export const ContinuityIssueSchema = Base.extend({
  status: z.enum(["open", "accepted", "intentional", "fixed", "false_positive", "deferred", "retcon_required"]).default("open"),
  type: z.string(), title: z.string().default(""), severity: ContinuitySeveritySchema, confidence: ContinuityConfidenceSchema,
  affectedChapterIds: z.array(z.string()).default([]), affectedEntityIds: z.array(z.string()).default([]),
  rationale: z.string().default(""), minimumRevision: z.string().default(""), sideEffects: z.array(z.string()).default([]), heuristic: z.boolean().default(true),
});

export const WritingGoalSchema = Base.extend({
  status: z.enum(["active", "completed", "paused", "deprecated"]).default("active"), title: z.string().default(""),
  targetType: z.enum(["words", "chapters", "scenes", "date"]).default("words"), targetValue: z.number().int().min(0).default(0), currentValue: z.number().int().min(0).default(0), deadline: z.string().default(""),
});
const CountItemSchema = z.object({ id: z.string(), name: z.string(), words: z.number().int().min(0), status: z.string().default("unknown") });
export const WritingProgressSchema = Base.extend({
  status: z.enum(["current", "stale"]).default("current"), totalWords: z.number().int().min(0).default(0),
  volumeWords: z.array(CountItemSchema).default([]), chapterWords: z.array(CountItemSchema).default([]), sceneWords: z.array(CountItemSchema).default([]),
  planningCompletion: z.number().int().min(0).max(100).default(0), draftCompletion: z.number().int().min(0).max(100).default(0), revisionCompletion: z.number().int().min(0).max(100).default(0),
  lastEditedAt: z.string().default(""), goals: z.array(WritingGoalSchema).default([]),
});

export const ProjectHealthReportSchema = Base.extend({
  status: z.enum(["current", "stale"]).default("current"), totalWords: z.number().int().min(0).default(0),
  chapterCompletion: z.number().int().min(0).max(100).default(0), sceneCompletion: z.number().int().min(0).max(100).default(0),
  canonConflicts: z.number().int().min(0).default(0), severeIssues: z.number().int().min(0).default(0), activeThreads: z.number().int().min(0).default(0),
  stalledThreads: z.number().int().min(0).default(0), openQuestions: z.number().int().min(0).default(0), pendingForeshadows: z.number().int().min(0).default(0),
  staleSummaries: z.number().int().min(0).default(0), drifts: z.number().int().min(0).default(0), candidateFacts: z.number().int().min(0).default(0),
  nextInheritanceRisks: z.array(z.string()).default([]), priorities: z.array(z.string()).default([]), generatedAt: z.string(),
});

export const NextChapterContextPackageSchema = Base.extend({
  status: z.enum(["draft", "locked", "sent_to_b2", "sent_to_b3", "deprecated"]).default("draft"),
  chapterId: z.string().default(""), chapterGoal: z.string().default(""), previousEndingState: z.string().default(""), plotThreadIds: z.array(z.string()).default([]),
  characterSnapshotIds: z.array(z.string()).default([]), relationshipSnapshotIds: z.array(z.string()).default([]), knowledgeStateIds: z.array(z.string()).default([]),
  currentItems: z.array(z.string()).default([]), unfinishedActions: z.array(z.string()).default([]), foreshadowIds: z.array(z.string()).default([]),
  payoffIds: z.array(z.string()).default([]), prohibitedEarlyEvents: z.array(z.string()).default([]), canonFactIds: z.array(z.string()).default([]),
  characterCardIds: z.array(z.string()).default([]), lorebookEntryIds: z.array(z.string()).default([]), languageRules: z.array(z.string()).default([]),
  povRules: z.array(z.string()).default([]), continuityRisks: z.array(z.string()).default([]), lockedFields: z.array(z.string()).default([]), notes: z.array(z.string()).default([]),
});

export const ContinuityPromptVersionSchema = Base.extend({
  status: z.enum(["active", "deprecated"]).default("active"), version: z.string().default(CONTINUITY_PROMPT_VERSION), mode: z.string(), description: z.string().default(""),
});

export const ContinuityProjectSchema = Base.extend({
  status: z.enum(["active", "archived"]).default("active"), name: z.string().default("连续性项目"),
  canonLedger: CanonLedgerSchema, entities: z.array(ProjectEntitySchema).default([]), characterSnapshots: z.array(CharacterSnapshotSchema).default([]),
  relationshipSnapshots: z.array(RelationshipSnapshotSchema).default([]), worldSnapshots: z.array(WorldSnapshotSchema).default([]), knowledgeStates: z.array(KnowledgeStateSchema).default([]),
  plotThreads: z.array(PlotThreadSchema).default([]), openQuestions: z.array(OpenQuestionSchema).default([]), foreshadowThreads: z.array(ForeshadowThreadSchema).default([]),
  timeline: ProjectTimelineSchema, chapterSummaries: z.array(ChapterSummarySchema).default([]), sceneSummaries: z.array(SceneSummarySchema).default([]),
  drifts: z.array(PlanManuscriptDriftSchema).default([]), issues: z.array(ContinuityIssueSchema).default([]), healthReports: z.array(ProjectHealthReportSchema).default([]),
  writingProgress: WritingProgressSchema, contextPackages: z.array(NextChapterContextPackageSchema).default([]), promptVersions: z.array(ContinuityPromptVersionSchema).default([]),
  provider: z.enum(["mock", "openai", "anthropic"]).default("mock"), model: z.string().default("mock-model"), sourceVersions: z.record(z.string(), z.string()).default({}),
}).passthrough();

export type ContinuitySourceReference = z.infer<typeof ContinuitySourceReferenceSchema>;
export type CanonFact = z.infer<typeof CanonFactSchema>; export type CanonConflict = z.infer<typeof CanonConflictSchema>; export type RetconRecord = z.infer<typeof RetconRecordSchema>; export type CanonLedger = z.infer<typeof CanonLedgerSchema>;
export type EntityAlias = z.infer<typeof EntityAliasSchema>; export type ProjectEntity = z.infer<typeof ProjectEntitySchema>;
export type CharacterSnapshot = z.infer<typeof CharacterSnapshotSchema>; export type RelationshipSnapshot = z.infer<typeof RelationshipSnapshotSchema>; export type WorldSnapshot = z.infer<typeof WorldSnapshotSchema>;
export type KnowledgeState = z.infer<typeof KnowledgeStateSchema>; export type PlotThread = z.infer<typeof PlotThreadSchema>; export type PlotThreadEvent = z.infer<typeof PlotThreadEventSchema>;
export type OpenQuestion = z.infer<typeof OpenQuestionSchema>; export type ForeshadowThread = z.infer<typeof ForeshadowThreadSchema>; export type ForeshadowEvent = z.infer<typeof ForeshadowEventSchema>;
export type ProjectTimeline = z.infer<typeof ProjectTimelineSchema>; export type ProjectTimelineEvent = z.infer<typeof ProjectTimelineEventSchema>;
export type ChapterSummary = z.infer<typeof ChapterSummarySchema>; export type SceneSummary = z.infer<typeof SceneSummarySchema>; export type PlanManuscriptDrift = z.infer<typeof PlanManuscriptDriftSchema>;
export type ContinuityIssue = z.infer<typeof ContinuityIssueSchema>; export type ProjectHealthReport = z.infer<typeof ProjectHealthReportSchema>; export type WritingProgress = z.infer<typeof WritingProgressSchema>; export type WritingGoal = z.infer<typeof WritingGoalSchema>;
export type NextChapterContextPackage = z.infer<typeof NextChapterContextPackageSchema>; export type ContinuityPromptVersion = z.infer<typeof ContinuityPromptVersionSchema>; export type ContinuityProject = z.infer<typeof ContinuityProjectSchema>;

export const continuityNow = () => new Date().toISOString();
export const continuityBase = (prefix: string) => ({ id: createStableId(prefix), createdAt: continuityNow(), modifiedAt: continuityNow() });

export function createContinuitySource(sourceType: ContinuitySourceReference["sourceType"], sourceId: string, patch: Partial<ContinuitySourceReference> = {}): ContinuitySourceReference {
  return ContinuitySourceReferenceSchema.parse({ sourceType, sourceId, ...patch });
}

export function createCanonFact(patch: Partial<CanonFact> = {}): CanonFact {
  return CanonFactSchema.parse({ ...continuityBase("canon"), ...patch });
}

export function createEmptyContinuityProject(name = "连续性项目"): ContinuityProject {
  const b = continuityBase("continuity");
  const modes = ["chapter_summary", "scene_summary", "canon_extraction", "state_extraction", "plot_thread_extraction", "foreshadow_detection", "plan_manuscript_drift", "project_continuity", "project_health", "next_chapter_context", "json_repair"];
  return ContinuityProjectSchema.parse({
    ...b, name,
    canonLedger: { ...continuityBase("ledger") }, timeline: { ...continuityBase("timeline") }, writingProgress: { ...continuityBase("progress") },
    promptVersions: modes.map((mode) => ({ ...continuityBase("continuity_prompt"), mode })),
  });
}
