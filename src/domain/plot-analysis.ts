import { z } from "zod";
import { createStableId } from "./lorebook";

export const ANALYSIS_DATA_VERSION = 1;
export const ANALYSIS_PROMPT_VERSION = "analysis-v1.0.0";
export const ANALYSIS_SCORING_VERSION = "analysis-score-v1.0.0";

export const FactClassificationSchema = z.enum(["confirmed_fact", "source_setting", "user_assumption", "model_inference", "model_suggestion", "unknown"]);
export const ContextSourceTypeSchema = z.enum(["user_confirmed", "plot_fact", "character_card", "lorebook", "user_assumption", "model_history"]);
export const IssueCategorySchema = z.enum(["hard_contradiction", "causal_gap", "motivation_gap", "character_mismatch", "information_violation", "capability_violation", "world_rule_violation", "continuity_error", "relationship_jump", "tone_mismatch", "pacing_risk", "reader_clarity_risk", "missing_evidence", "opportunity"]);
export const AnalysisSeveritySchema = z.enum(["critical", "major", "moderate", "minor", "note"]);
export const AnalysisConfidenceSchema = z.enum(["high", "medium", "low"]);
export const AnalysisFocusSchema = z.enum(["comprehensive", "causality", "character_fit", "relationship", "world_consistency", "continuity", "drama", "branch_comparison"]);

export const PlotBranchSchema = z.object({ id: z.string().min(1), name: z.string().default("备选分支"), description: z.string().default(""), expectedEffect: z.string().default(""), acceptableChanges: z.string().default("") });
export const PlotProposalSchema = z.object({ id: z.string().min(1), occurredPlot: z.string().default(""), proposedPlot: z.string().default(""), plotGoal: z.string().default(""), branches: z.array(PlotBranchSchema).max(3).default([]) });

export const AnalysisInputSchema = z.object({
  title: z.string().default("未命名剧情分析"), occurredPlot: z.string().default(""), proposedPlot: z.string().default(""), plotGoal: z.string().default(""),
  participatingCharacters: z.array(z.string()).default([]), currentTime: z.string().default(""), currentPlace: z.string().default(""),
  characterKnowledge: z.string().default(""), characterEmotions: z.string().default(""), relationshipState: z.string().default(""),
  requiredOutcomes: z.string().default(""), immutableSettings: z.string().default(""), fillableGaps: z.string().default(""),
  focuses: z.array(AnalysisFocusSchema).default(["comprehensive"]), userNotes: z.string().default(""), branches: z.array(PlotBranchSchema).max(3).default([]),
});

export const ContextSourceSchema = z.object({
  id: z.string().min(1), type: ContextSourceTypeSchema, entityId: z.string(), name: z.string(), field: z.string(), content: z.string(),
  authority: z.number().int().min(1).max(7), classification: FactClassificationSchema, version: z.string().default("1"),
  included: z.boolean().default(true), inclusionReason: z.string().default(""), tokenEstimate: z.number().int().min(0).default(0), relevance: z.number().min(0).max(1).default(0),
});

export const SourceReferenceSchema = z.object({
  source_type: ContextSourceTypeSchema, source_entity_id: z.string(), source_name: z.string(), field_or_entry: z.string(), excerpt: z.string(),
  version: z.string(), valid: z.boolean().default(true), inference: z.boolean().default(false), confidence: AnalysisConfidenceSchema.default("medium"),
});

export const AnalysisContextSchema = z.object({
  dataVersion: z.literal(ANALYSIS_DATA_VERSION).default(ANALYSIS_DATA_VERSION), sources: z.array(ContextSourceSchema).default([]),
  selectedSourceIds: z.array(z.string()).default([]), excludedSourceIds: z.array(z.string()).default([]), tokenBudget: z.number().int().min(256).default(6000),
  estimatedTokens: z.number().int().min(0).default(0), truncated: z.boolean().default(false), createdAt: z.string(),
});

export const RevisionSuggestionSchema = z.object({ id: z.string().min(1), issueId: z.string().default(""), title: z.string().default(""), minimumChange: z.string().default(""), alternatives: z.array(z.string()).default([]), sideEffects: z.array(z.string()).default([]), classification: FactClassificationSchema.default("model_suggestion") });

export const AnalysisIssueSchema = z.object({
  id: z.string().min(1), category: IssueCategorySchema, title: z.string().default(""), severity: AnalysisSeveritySchema, confidence: AnalysisConfidenceSchema,
  characters: z.array(z.string()).default([]), plot_nodes: z.array(z.string()).default([]), conclusion: z.string().default(""), evidence: z.array(z.string()).default([]),
  reasoning_summary: z.string().default(""), missing_information: z.array(z.string()).default([]), impact: z.string().default(""), minimum_revision: z.string().default(""),
  alternatives: z.array(z.string()).default([]), side_effects: z.array(z.string()).default([]), source_references: z.array(SourceReferenceSchema).default([]), is_hard_contradiction: z.boolean().default(false),
});

export const CharacterFitAssessmentSchema = z.object({ character: z.string(), coreGoal: z.string().default(""), currentGoal: z.string().default(""), values: z.string().default(""), fears: z.string().default(""), currentEmotion: z.string().default(""), currentRelationship: z.string().default(""), knownInformation: z.string().default(""), benefits: z.string().default(""), costs: z.string().default(""), externalPressure: z.string().default(""), fitConclusion: z.string().default(""), requiredTrigger: z.string().default(""), requiredSetup: z.string().default(""), score: z.number().int().min(0).max(100).default(50), source_references: z.array(SourceReferenceSchema).default([]) });
export const CausalityAssessmentSchema = z.object({ trigger: z.string().default(""), intermediateSteps: z.array(z.string()).default([]), actionAndResult: z.string().default(""), coincidenceDependence: z.string().default(""), risksAndCosts: z.string().default(""), convenienceRisk: z.string().default(""), conclusion: z.string().default("") });
export const RelationshipAssessmentSchema = z.object({ currentStage: z.string().default(""), emotionalTrigger: z.string().default(""), trustChange: z.string().default(""), actionIntensity: z.string().default(""), mutualReactions: z.string().default(""), powerDynamic: z.string().default(""), emotionalAftermath: z.string().default(""), missingSetup: z.string().default("") });
export const ContinuityAssessmentSchema = z.object({ worldRules: z.string().default(""), identityAndAge: z.string().default(""), timeAndPlace: z.string().default(""), travelAndInjuries: z.string().default(""), relationshipState: z.string().default(""), occurredEvents: z.string().default(""), organizationReaction: z.string().default(""), conclusion: z.string().default("") });

export const DimensionScoreSchema = z.object({ dimension: z.enum(["causalCompleteness", "characterMotivation", "characterFit", "worldConsistency", "continuity", "emotionalProgression", "dramaticEffectiveness", "readerClarity"]), score: z.number().int().min(0).max(100), rationale: z.string().default("") });
export const BranchAssessmentSchema = z.object({ branchId: z.string(), branchName: z.string(), oneLineConclusion: z.string().default(""), strengths: z.array(z.string()).default([]), risks: z.array(z.string()).default([]), characterFit: z.number().int().min(0).max(100).default(50), causalCompleteness: z.number().int().min(0).max(100).default(50), requiredSetup: z.array(z.string()).default([]), futureConstraints: z.array(z.string()).default([]), suitableGoals: z.array(z.string()).default([]), rank: z.number().int().min(1).default(1), recommendationBasis: z.string().default("") });
export const BranchComparisonSchema = z.object({ branches: z.array(BranchAssessmentSchema).max(3).default([]), bestCharacterFitBranchId: z.string().default(""), strongestDramaBranchId: z.string().default(""), lowestRevisionCostBranchId: z.string().default(""), leastFutureConstraintBranchId: z.string().default(""), recommendationSummary: z.string().default("") });

export const AnalysisSummarySchema = z.object({ oneLineConclusion: z.string().default(""), feasibility: z.enum(["成立", "基本成立", "有条件成立", "需要较大调整", "当前无法成立", "信息不足"]).default("信息不足"), topIssueIds: z.array(z.string()).max(3).default([]), strengths: z.array(z.string()).default([]), lowestCostFix: z.string().default(""), informationGaps: z.array(z.string()).default([]), recommendContinue: z.boolean().default(false) });

export const AnalysisReportSchema = z.object({
  id: z.string().min(1), dataVersion: z.literal(ANALYSIS_DATA_VERSION).default(ANALYSIS_DATA_VERSION), projectId: z.string(),
  summary: AnalysisSummarySchema, scores: z.array(DimensionScoreSchema).default([]), issues: z.array(AnalysisIssueSchema).default([]),
  characterFits: z.array(CharacterFitAssessmentSchema).default([]), causality: CausalityAssessmentSchema, relationship: RelationshipAssessmentSchema,
  continuity: ContinuityAssessmentSchema, branchComparison: BranchComparisonSchema.nullable().default(null), suggestions: z.array(RevisionSuggestionSchema).default([]),
  informationGaps: z.array(z.string()).default([]), referencedSources: z.array(SourceReferenceSchema).default([]), invalidReferenceWarnings: z.array(z.string()).default([]),
  inputSnapshot: AnalysisInputSchema, contextSnapshot: AnalysisContextSchema, sourceVersions: z.record(z.string(), z.string()).default({}),
  promptVersion: z.string().default(ANALYSIS_PROMPT_VERSION), scoringVersion: z.string().default(ANALYSIS_SCORING_VERSION), provider: z.enum(["mock", "openai", "anthropic"]).default("mock"), model: z.string().default(""),
  createdAt: z.string(), modifiedAt: z.string(), status: z.enum(["draft", "confirmed", "archived"]).default("draft"),
});

export const PlotAnalysisProjectSchema = z.object({
  id: z.string().min(1), dataVersion: z.literal(ANALYSIS_DATA_VERSION).default(ANALYSIS_DATA_VERSION), title: z.string().default("未命名剧情分析"),
  input: AnalysisInputSchema, proposal: PlotProposalSchema, selectedCharacterIds: z.array(z.string()).default([]), selectedLorebookIds: z.array(z.string()).default([]),
  manualIncludedEntryIds: z.array(z.string()).default([]), manualExcludedEntryIds: z.array(z.string()).default([]), tokenBudget: z.number().int().min(256).default(6000),
  context: AnalysisContextSchema.nullable().default(null), reports: z.array(AnalysisReportSchema).default([]), projectNotes: z.array(z.string()).default([]), createdAt: z.string(), modifiedAt: z.string(),
}).passthrough();

export type PlotAnalysisProject = z.infer<typeof PlotAnalysisProjectSchema>; export type PlotProposal = z.infer<typeof PlotProposalSchema>; export type PlotBranch = z.infer<typeof PlotBranchSchema>;
export type AnalysisContext = z.infer<typeof AnalysisContextSchema>; export type ContextSource = z.infer<typeof ContextSourceSchema>; export type SourceReference = z.infer<typeof SourceReferenceSchema>;
export type AnalysisIssue = z.infer<typeof AnalysisIssueSchema>; export type CharacterFitAssessment = z.infer<typeof CharacterFitAssessmentSchema>; export type CausalityAssessment = z.infer<typeof CausalityAssessmentSchema>;
export type RelationshipAssessment = z.infer<typeof RelationshipAssessmentSchema>; export type ContinuityAssessment = z.infer<typeof ContinuityAssessmentSchema>; export type BranchComparison = z.infer<typeof BranchComparisonSchema>;
export type RevisionSuggestion = z.infer<typeof RevisionSuggestionSchema>; export type AnalysisReport = z.infer<typeof AnalysisReportSchema>; export type AnalysisInput = z.infer<typeof AnalysisInputSchema>;

export function createEmptyAnalysisProject(): PlotAnalysisProject {
  const now = new Date().toISOString(); const proposalId = createStableId("proposal");
  return PlotAnalysisProjectSchema.parse({ id: createStableId("analysis"), title: "未命名剧情分析", input: {},
    proposal: { id: proposalId, occurredPlot: "", proposedPlot: "", plotGoal: "", branches: [] }, createdAt: now, modifiedAt: now });
}

export function createEmptyBranch(index = 0): PlotBranch { return PlotBranchSchema.parse({ id: createStableId("branch"), name: `分支 ${index + 1}` }); }

