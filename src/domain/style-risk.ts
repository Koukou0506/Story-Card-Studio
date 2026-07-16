import { z } from "zod";
import { createStableId } from "./lorebook";
import { EditScopeSchema, LanguageConstraintSchema, ProseSourceReferenceSchema, StyleProfileSchema } from "./prose";

export const STYLE_RISK_DATA_VERSION = 1;
export const STYLE_RISK_SCORE_VERSION = "style-risk-score-v1.0.0";
export const STYLE_RISK_PROMPT_VERSION = "style-risk-analysis-v1.0.0";
export const STYLE_RISK_DISCLAIMER = "本功能分析的是文本风格风险，不能可靠证明文本由 AI 或人类创作。分数不是作者身份概率，也不保证通过任何外部检测器。";

export const StyleRiskSeveritySchema = z.enum(["critical", "major", "moderate", "minor", "note"]);
export const StyleRiskConfidenceSchema = z.enum(["high", "medium", "low"]);
export const StyleRiskCategorySchema = z.enum([
  "uniform_sentence_length", "uniform_paragraph_length", "repeated_structure", "repeated_opening", "summary_ending",
  "repeated_ngram", "connector_overuse", "summary_word_overuse", "adverb_overuse", "cliche", "symmetric_template",
  "abstract_emotion", "over_explanation", "smooth_emotion", "dialogue_homogenization", "dialogue_exposition",
  "generic_metaphor", "abstract_narration", "fast_conflict_resolution", "information_uniformity", "style_deviation",
  "character_voice_deviation", "language_constraint", "insufficient_sample", "opportunity",
]);

const Timestamped = {
  id: z.string().min(1).default(() => createStableId("style_risk")),
  dataVersion: z.literal(STYLE_RISK_DATA_VERSION).default(STYLE_RISK_DATA_VERSION),
  createdAt: z.string().default(() => new Date().toISOString()),
  updatedAt: z.string().default(() => new Date().toISOString()),
};

export const TextRangeReferenceSchema = z.object({
  start: z.number().int().min(0).nullable().default(null), end: z.number().int().min(0).nullable().default(null),
  excerpt: z.string().default(""), scopeType: z.enum(["document", "chapter", "scene", "paragraph", "selection", "dialogue", "narration", "character_dialogue"]).default("document"),
  mappingStatus: z.enum(["exact", "uncertain", "unmapped"]).default("unmapped"),
});

const FrequencySchema = z.object({ value: z.string(), count: z.number().int().min(0) });
export const TextFeatureVectorSchema = z.object({
  characterCount: z.number().int().min(0), sentenceCount: z.number().int().min(0), paragraphCount: z.number().int().min(0),
  averageSentenceLength: z.number().min(0), sentenceLengths: z.array(z.number().int().min(0)), sentenceLengthVariance: z.number().min(0),
  paragraphLengths: z.array(z.number().int().min(0)), paragraphLengthVariance: z.number().min(0),
  dialogueRatio: z.number().min(0).max(1), narrationRatio: z.number().min(0).max(1), punctuation: z.record(z.string(), z.number().int().min(0)),
  exclamationFrequency: z.number().min(0), questionFrequency: z.number().min(0), ellipsisFrequency: z.number().min(0), semicolonColonFrequency: z.number().min(0),
  frequentConnectors: z.array(FrequencySchema), frequentSummaryWords: z.array(FrequencySchema), frequentAdverbs: z.array(FrequencySchema), frequentAdjectives: z.array(FrequencySchema),
  repeatedNgrams: z.array(FrequencySchema), repeatedSentenceOpenings: z.array(FrequencySchema), repeatedParagraphEndings: z.array(FrequencySchema),
  adjacentSentenceSimilarity: z.number().min(0).max(1), adjacentParagraphSimilarity: z.number().min(0).max(1), repeatedAddresses: z.array(FrequencySchema),
  dialogueVocabularyOverlap: z.number().min(0).max(1).nullable(), abstractEmotionDensity: z.number().min(0), concreteActionSensoryDensity: z.number().min(0),
  languageConstraintViolations: z.array(z.object({ constraintId: z.string(), name: z.string(), strictness: z.enum(["hard", "preferred", "advisory"]), locked: z.boolean(), matches: z.array(z.object({ value: z.string(), start: z.number().int(), end: z.number().int() })) })),
});

export const StyleRiskMetricSchema = z.object({
  id: z.string().default(() => createStableId("style_metric")), key: z.string(), label: z.string(), value: z.number(), unit: z.string().default(""),
  dimension: z.enum(["structure", "wording", "emotion", "dialogue", "narration", "pacing", "style"]), isDeterministic: z.literal(true).default(true),
});

export const StyleRiskBaselineTypeSchema = z.enum(["generic_chinese_fiction", "project_style", "personal_sample", "character_voice", "custom"]);
export const StyleRiskBaselineSchema = z.object({
  ...Timestamped, name: z.string(), baselineType: StyleRiskBaselineTypeSchema, language: z.string().default("zh-CN"), genre: z.string().default("中文小说"),
  pointOfView: z.string().default("mixed"), sampleScope: z.string().default(""), sampleSize: z.number().int().min(0), featureStatistics: z.record(z.string(), z.unknown()).default({}),
  styleProfileId: z.string().nullable().default(null), languageConstraintIds: z.array(z.string()).default([]), sourceReferences: z.array(ProseSourceReferenceSchema).default([]),
  confidence: StyleRiskConfidenceSchema.default("medium"), isUserConfirmed: z.boolean().default(false), sourceTextStored: z.boolean().default(false),
});
export const PersonalStyleBaselineSchema = StyleRiskBaselineSchema.extend({
  baselineType: z.literal("personal_sample"), documentId: z.string().nullable().default(null), chapterIds: z.array(z.string()).default([]), characterIds: z.array(z.string()).default([]), samplePointOfView: z.string().default(""),
});

export const StyleRiskIssueSchema = z.object({
  ...Timestamped, category: StyleRiskCategorySchema, title: z.string(), severity: StyleRiskSeveritySchema, confidence: StyleRiskConfidenceSchema,
  textRange: TextRangeReferenceSchema, excerpt: z.string().default(""), conclusion: z.string(), evidence: z.array(z.string()).default([]),
  metricValues: z.record(z.string(), z.number()).default({}), baselineValues: z.record(z.string(), z.number()).default({}), explanation: z.string().default(""),
  minimumRevision: z.string().default(""), alternatives: z.array(z.string()).default([]), possibleSideEffects: z.array(z.string()).default([]),
  isDeterministic: z.boolean().default(false), sourceReferences: z.array(ProseSourceReferenceSchema).default([]), status: z.enum(["open", "accepted", "ignored", "resolved"]).default("open"),
});

export const DimensionRisksSchema = z.object({
  structureRepetition: z.number().int().min(0).max(100), overExplanation: z.number().int().min(0).max(100), abstractEmotion: z.number().int().min(0).max(100),
  dialogueHomogeneity: z.number().int().min(0).max(100), templateExpression: z.number().int().min(0).max(100), projectStyleDeviation: z.number().int().min(0).max(100),
});

export const StyleRiskAnalysisRequestSchema = z.object({
  text: z.string().min(1).max(500_000), mode: z.enum(["generic", "project", "personal", "character", "multi"]).default("generic"),
  scopeType: TextRangeReferenceSchema.shape.scopeType.default("document"), sourceId: z.string().default("pasted_text"), useModel: z.boolean().default(false),
  styleProfile: StyleProfileSchema.nullable().default(null), constraints: z.array(LanguageConstraintSchema).default([]), baselines: z.array(StyleRiskBaselineSchema).default([]),
  editScope: EditScopeSchema.nullable().default(null), selectedCharacterIds: z.array(z.string()).default([]),
});

export const StyleRiskAnalysisReportSchema = z.object({
  ...Timestamped, requestId: z.string(), promptVersion: z.string().default(STYLE_RISK_PROMPT_VERSION), scoreVersion: z.string().default(STYLE_RISK_SCORE_VERSION),
  summary: z.string(), overallRisk: z.enum(["low", "medium", "high", "unstable"]), overallScore: z.number().int().min(0).max(100).nullable(), sampleSufficient: z.boolean(),
  confidence: StyleRiskConfidenceSchema, baselines: z.array(StyleRiskBaselineSchema), features: TextFeatureVectorSchema, metrics: z.array(StyleRiskMetricSchema), issues: z.array(StyleRiskIssueSchema),
  dimensionRisks: DimensionRisksSchema, majorContributors: z.array(z.string()).default([]), doNotChange: z.array(z.string()).default([]), modelStatus: z.enum(["not_requested", "completed", "failed", "cancelled"]).default("not_requested"),
  warnings: z.array(z.string()).default([]), disclaimer: z.literal(STYLE_RISK_DISCLAIMER).default(STYLE_RISK_DISCLAIMER),
});

export const StyleRiskRevisionRequestSchema = z.object({
  issueIds: z.array(z.string()), scope: EditScopeSchema, instruction: z.string().default(""), allowNewFacts: z.literal(false).default(false), preservePlotFacts: z.literal(true).default(true),
});

export const StyleRiskComparisonSchema = z.object({
  ...Timestamped, beforeReportId: z.string(), afterReportId: z.string(), beforeOverallScore: z.number().int().nullable(), afterOverallScore: z.number().int().nullable(),
  dimensionChanges: z.record(z.string(), z.number()), metricChanges: z.record(z.string(), z.number()), newIssueIds: z.array(z.string()), resolvedIssueIds: z.array(z.string()), unchangedIssueIds: z.array(z.string()),
  warning: z.literal("指标下降不等于文本质量一定提高；过度优化可能损害人物声音和节奏，用户应优先判断创作效果。"),
});

export const StyleRiskPromptVersionSchema = z.object({ version: z.literal(STYLE_RISK_PROMPT_VERSION), responseFormat: z.literal("json"), description: z.string() });
export const StyleRiskAnalysisSchema = z.object({ ...Timestamped, request: StyleRiskAnalysisRequestSchema, report: StyleRiskAnalysisReportSchema.nullable().default(null) });

export type TextRangeReference = z.infer<typeof TextRangeReferenceSchema>;
export type TextFeatureVector = z.infer<typeof TextFeatureVectorSchema>;
export type StyleRiskMetric = z.infer<typeof StyleRiskMetricSchema>;
export type StyleRiskBaseline = z.infer<typeof StyleRiskBaselineSchema>;
export type PersonalStyleBaseline = z.infer<typeof PersonalStyleBaselineSchema>;
export type StyleRiskIssue = z.infer<typeof StyleRiskIssueSchema>;
export type StyleRiskAnalysisRequest = z.infer<typeof StyleRiskAnalysisRequestSchema>;
export type StyleRiskAnalysisReport = z.infer<typeof StyleRiskAnalysisReportSchema>;
export type StyleRiskComparison = z.infer<typeof StyleRiskComparisonSchema>;
