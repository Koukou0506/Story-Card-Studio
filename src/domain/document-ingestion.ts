import { z } from "zod";
import { CharacterCardV2Schema } from "./character-card";
import { LorebookSchema } from "./lorebook";
import { LanguageConstraintSchema, StyleProfileSchema } from "./prose";
import { createStableId } from "./lorebook";
import { WorkImportStateSchema } from "./work-import";

export const DOCUMENT_INGESTION_DATA_VERSION = 2;
export const DOCUMENT_PARSER_VERSION = "document-parser-v2.0.0";
export const DOCUMENT_EXTRACTION_VERSION = "document-extraction-v1.0.0";

export const DocumentProcessingStatusSchema = z.enum([
  "pending", "validating", "extracting", "cleaning", "segmenting", "analyzing",
  "consolidating", "ready_for_review", "completed", "partially_completed", "cancelled",
  "failed", "needs_password", "needs_ocr",
]);

export const ExternalModelPermissionSchema = z.enum(["local_only", "chunks_only", "full_chapters"]);
export const CandidateDecisionSchema = z.enum([
  "pending", "confirmed", "edited_and_confirmed", "merged", "kept_candidate",
  "marked_inference", "ignored", "conflict",
]);
export const ExtractionConfidenceSchema = z.enum(["high", "medium", "low"]);

export const DocumentSourceSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  originalFilename: z.string().min(1),
  displayName: z.string().min(1),
  mimeType: z.string().default("application/octet-stream"),
  fileExtension: z.enum([".txt", ".pdf", ".epub", ".docx", ".md", ".markdown"]),
  fileSize: z.number().int().min(1),
  contentHash: z.string().min(1),
  encoding: z.string().nullable().default(null),
  encodingConfidence: z.number().min(0).max(1).nullable().default(null),
  pageCount: z.number().int().min(0).nullable().default(null),
  chapterCount: z.number().int().min(0).default(0),
  paragraphCount: z.number().int().min(0).default(0),
  characterCount: z.number().int().min(0).default(0),
  tokenEstimate: z.number().int().min(0).default(0),
  importTime: z.string(),
  parserVersion: z.string().default(DOCUMENT_PARSER_VERSION),
  processingStatus: DocumentProcessingStatusSchema.default("pending"),
  processingProgress: z.number().int().min(0).max(100).default(0),
  currentStage: z.string().default("等待处理"),
  permissionConfirmed: z.boolean().default(false),
  externalModelPermission: ExternalModelPermissionSchema.default("local_only"),
  retainOriginalFile: z.boolean().default(true),
  retainExtractedText: z.boolean().default(true),
  warnings: z.array(z.string()).default([]),
  errors: z.array(z.string()).default([]),
  sourceVersion: z.number().int().positive().default(1),
  storageReference: z.string().min(1),
  rawTextReference: z.string().nullable().default(null),
  normalizedTextReference: z.string().nullable().default(null),
  stale: z.boolean().default(false),
  relativePath: z.string().default(""),
  bundleId: z.string().nullable().default(null),
  ocrJobId: z.string().nullable().default(null),
}).passthrough();

export const SourceSpanSchema = z.object({
  documentId: z.string().min(1),
  sourceVersion: z.number().int().positive().default(1),
  chapterId: z.string().nullable().default(null),
  chapterTitle: z.string().default(""),
  pageStart: z.number().int().positive().nullable().default(null),
  pageEnd: z.number().int().positive().nullable().default(null),
  paragraphStart: z.number().int().min(0).nullable().default(null),
  paragraphEnd: z.number().int().min(0).nullable().default(null),
  characterStart: z.number().int().min(0),
  characterEnd: z.number().int().min(0),
  rawTextExcerpt: z.string().max(280).default(""),
  normalizedTextExcerpt: z.string().max(280).default(""),
  extractionConfidence: ExtractionConfidenceSchema.default("medium"),
  mappingStatus: z.enum(["mapped", "approximate", "unmapped"]).default("mapped"),
  relativePath: z.string().default(""),
  contentHash: z.string().default(""),
  parserVersion: z.string().default(DOCUMENT_PARSER_VERSION),
  epubSpineIndex: z.number().int().min(0).nullable().default(null),
  epubPath: z.string().default(""),
  docxParagraphIndex: z.number().int().min(0).nullable().default(null),
  docxHeadingLevel: z.number().int().min(1).max(9).nullable().default(null),
  docxPart: z.enum(["body", "footnote", "endnote", "comment", "table", "image"]).nullable().default(null),
  markdownLineStart: z.number().int().positive().nullable().default(null),
  markdownLineEnd: z.number().int().positive().nullable().default(null),
  ocrPage: z.number().int().positive().nullable().default(null),
  ocrRegion: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).nullable().default(null),
  ocrVersion: z.string().default(""),
}).refine((value) => value.characterEnd >= value.characterStart, {
  message: "来源结束位置不能早于开始位置",
  path: ["characterEnd"],
});

export const TextOffsetMapSegmentSchema = z.object({
  normalizedStart: z.number().int().min(0),
  normalizedEnd: z.number().int().min(0),
  rawStart: z.number().int().min(0),
  rawEnd: z.number().int().min(0),
  operation: z.enum(["unchanged", "collapsed_whitespace", "removed", "joined_line", "replaced_control"]),
});

export const DocumentParagraphSchema = z.object({
  id: z.string().min(1),
  order: z.number().int().min(0),
  text: z.string(),
  startOffset: z.number().int().min(0),
  endOffset: z.number().int().min(0),
  pageStart: z.number().int().positive().nullable().default(null),
  pageEnd: z.number().int().positive().nullable().default(null),
});

export const DocumentChapterSchema = z.object({
  id: z.string().min(1),
  documentId: z.string().min(1),
  title: z.string().default("未分章内容"),
  normalizedTitle: z.string().default("未分章内容"),
  order: z.number().int().min(0),
  startOffset: z.number().int().min(0),
  endOffset: z.number().int().min(0),
  startPage: z.number().int().positive().nullable().default(null),
  endPage: z.number().int().positive().nullable().default(null),
  paragraphs: z.array(DocumentParagraphSchema).default([]),
  confidence: z.number().min(0).max(1).default(0),
  detectionMethod: z.enum(["pattern", "english_heading", "custom_regex", "manual", "fallback"]).default("fallback"),
  userConfirmed: z.boolean().default(false),
});

export const DocumentChunkSchema = z.object({
  id: z.string().min(1),
  documentId: z.string().min(1),
  chapterId: z.string().nullable().default(null),
  order: z.number().int().min(0),
  text: z.string(),
  startOffset: z.number().int().min(0),
  endOffset: z.number().int().min(0),
  sourceSpans: z.array(SourceSpanSchema).min(1),
  estimatedTokens: z.number().int().min(0),
  overlapBefore: z.number().int().min(0).default(0),
  overlapAfter: z.number().int().min(0).default(0),
  processingStatus: z.enum(["pending", "processing", "completed", "failed", "cancelled", "skipped"]).default("pending"),
  extractionVersion: z.string().default(DOCUMENT_EXTRACTION_VERSION),
  retryCount: z.number().int().min(0).default(0),
  error: z.string().nullable().default(null),
});

export const IngestionCheckpointSchema = z.object({
  stage: z.string().default("pending"),
  completedChapterIds: z.array(z.string()).default([]),
  completedChunkIds: z.array(z.string()).default([]),
  failedChunkIds: z.array(z.string()).default([]),
  lastChunkOrder: z.number().int().min(-1).default(-1),
  savedAt: z.string().default(() => new Date().toISOString()),
});

const IngestionTaskObjectSchema = z.object({
  id: z.string().min(1),
  documentId: z.string().min(1),
  projectId: z.string().min(1),
  status: z.enum(["pending", "running", "paused", "completed", "partially_completed", "cancelled", "failed"]).default("pending"),
  stage: z.string().default("pending"),
  progress: z.number().int().min(0).max(100).default(0),
  currentChapterId: z.string().nullable().default(null),
  currentChunkId: z.string().nullable().default(null),
  completedChunkIds: z.array(z.string()).default([]),
  failedChunkIds: z.array(z.string()).default([]),
  checkpoint: IngestionCheckpointSchema.optional(),
  retryLimit: z.number().int().min(0).max(5).default(2),
  createdAt: z.string(),
  modifiedAt: z.string(),
  startedAt: z.string().nullable().default(null),
  completedAt: z.string().nullable().default(null),
  error: z.string().nullable().default(null),
});

export const IngestionTaskSchema = IngestionTaskObjectSchema.transform((value) => ({
  ...value,
  checkpoint: IngestionCheckpointSchema.parse(value.checkpoint ?? {
    stage: value.stage,
    completedChunkIds: value.completedChunkIds,
    failedChunkIds: value.failedChunkIds,
  }),
}));

export const DocumentAnalysisConfigSchema = z.object({
  selectedChapterIds: z.array(z.string()).default([]),
  characterScope: z.enum(["main", "main_and_supporting", "all_mentions"]).default("main_and_supporting"),
  extractMinorCharacters: z.boolean().default(false),
  extractLorebook: z.boolean().default(true),
  extractCanon: z.boolean().default(true),
  extractTimeline: z.boolean().default(true),
  extractPlotThreads: z.boolean().default(true),
  extractForeshadow: z.boolean().default(true),
  analyzeStyle: z.boolean().default(true),
  allowExternalModel: z.boolean().default(false),
  provider: z.enum(["mock", "openai", "anthropic"]).default("mock"),
  model: z.string().default("mock-model"),
  targetChunkCharacters: z.number().int().min(100).max(50000).default(6000),
  overlapCharacters: z.number().int().min(0).max(5000).default(400),
  depth: z.enum(["quick", "standard", "deep"]).default("standard"),
  concurrency: z.number().int().min(1).max(5).default(2),
});

export const ExtractionItemSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    "character", "alias", "description", "action", "voice", "emotion", "goal", "relationship",
    "location", "organization", "item", "ability", "world_rule", "term", "history_event",
    "current_event", "time_expression", "secret", "knowledge_gain", "plot_thread", "foreshadow", "style",
  ]),
  normalizedName: z.string().default(""),
  originalExpression: z.string().default(""),
  content: z.string().default(""),
  sourceSpans: z.array(SourceSpanSchema).min(1),
  confidence: ExtractionConfidenceSchema.default("medium"),
  explicitFact: z.boolean().default(false),
  inference: z.boolean().default(false),
  sceneOnly: z.boolean().default(false),
  possibleExistingEntityIds: z.array(z.string()).default([]),
  decision: CandidateDecisionSchema.default("pending"),
});

export const EntityResolutionSchema = z.object({
  id: z.string().min(1),
  leftCandidateId: z.string().min(1),
  rightCandidateId: z.string().min(1),
  result: z.enum(["same_entity", "probably_same", "uncertain", "different_entity", "conflict"]),
  reasons: z.array(z.string()).default([]),
  confidence: ExtractionConfidenceSchema.default("low"),
  userConfirmed: z.boolean().default(false),
});

const CandidateBaseShape = {
  id: z.string().min(1),
  name: z.string().default(""),
  description: z.string().default(""),
  sourceSpans: z.array(SourceSpanSchema).default([]),
  confidence: ExtractionConfidenceSchema.default("medium"),
  authority: z.enum(["document_explicit", "document_inference", "model_suggestion"]).default("document_inference"),
  conflict: z.boolean().default(false),
  recommendation: z.string().default("review"),
  decision: CandidateDecisionSchema.default("pending"),
};

export const CharacterCandidateSchema = z.object({
  ...CandidateBaseShape,
  aliases: z.array(z.string()).default([]),
  identity: z.array(z.string()).default([]),
  appearance: z.array(z.string()).default([]),
  age: z.string().default("unknown"),
  history: z.array(z.string()).default([]),
  stableTraits: z.array(z.string()).default([]),
  situationalBehaviors: z.array(z.string()).default([]),
  goals: z.array(z.string()).default([]),
  fears: z.array(z.string()).default([]),
  values: z.array(z.string()).default([]),
  abilities: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
  speechHabits: z.array(z.string()).default([]),
  attitudes: z.array(z.string()).default([]),
  relationships: z.array(z.string()).default([]),
  importantEvents: z.array(z.string()).default([]),
  currentState: z.array(z.string()).default([]),
  informationGaps: z.array(z.string()).default([]),
  conflicts: z.array(z.string()).default([]),
});

export const CharacterVoiceProfileSchema = z.object({
  ...CandidateBaseShape,
  characterCandidateId: z.string().min(1),
  commonAddresses: z.array(z.string()).default([]),
  sentenceLength: z.string().default(""),
  tone: z.string().default(""),
  formality: z.string().default(""),
  vocabulary: z.array(z.string()).default([]),
  catchphrases: z.array(z.string()).default([]),
  avoidedExpressions: z.array(z.string()).default([]),
  emotionVariants: z.array(z.string()).default([]),
  audienceVariants: z.array(z.string()).default([]),
  dialogueInitiative: z.string().default(""),
  subtextTendency: z.string().default(""),
  shortExamples: z.array(z.string().max(120)).default([]),
});

export const RelationshipCandidateSchema = z.object({
  ...CandidateBaseShape,
  characterAId: z.string().min(1),
  characterBId: z.string().min(1),
  relationType: z.string().default("unknown"),
  publicRelationship: z.string().default(""),
  actualRelationship: z.string().default(""),
  initialState: z.string().default(""),
  currentState: z.string().default(""),
  trust: z.number().int().min(0).max(100).nullable().default(null),
  intimacy: z.number().int().min(0).max(100).nullable().default(null),
  hostility: z.number().int().min(0).max(100).nullable().default(null),
  dependence: z.string().default(""),
  powerDynamic: z.string().default(""),
  sharedSecrets: z.array(z.string()).default([]),
  turningPoints: z.array(z.string()).default([]),
  conflicts: z.array(z.string()).default([]),
  timeline: z.array(z.string()).default([]),
  directional: z.boolean().default(true),
});

export const GenericDocumentCandidateSchema = z.object({
  ...CandidateBaseShape,
  candidateType: z.enum([
    "entity", "canon", "character_snapshot", "relationship_snapshot", "knowledge_state",
    "timeline_event", "plot_thread", "open_question", "foreshadow", "world_state",
  ]),
  entityIds: z.array(z.string()).default([]),
  content: z.string().default(""),
  applicableTime: z.string().default(""),
  recommendedTarget: z.string().default("review"),
});

export const CharacterCardDraftCandidateSchema = z.object({
  ...CandidateBaseShape,
  characterCandidateId: z.string().min(1),
  card: CharacterCardV2Schema,
  existingCharacterCardId: z.string().nullable().default(null),
  writeMode: z.enum(["new", "compare", "merge_candidate", "ignore"]).default("new"),
  status: z.literal("draft").default("draft"),
});

export const LorebookDraftCandidateSchema = z.object({
  ...CandidateBaseShape,
  lorebook: LorebookSchema,
  status: z.literal("draft").default("draft"),
});

export const StyleStatisticsSchema = z.object({
  characterCount: z.number().int().min(0).default(0),
  chapterLengths: z.array(z.number().int().min(0)).default([]),
  paragraphLengths: z.array(z.number().int().min(0)).default([]),
  sentenceLengths: z.array(z.number().int().min(0)).default([]),
  dialogueRatio: z.number().min(0).max(1).default(0),
  narrationRatio: z.number().min(0).max(1).default(1),
  punctuation: z.record(z.string(), z.number()).default({}),
  pronounPreference: z.enum(["first_person", "third_person", "mixed", "unknown"]).default("unknown"),
  frequentWords: z.array(z.object({ value: z.string(), count: z.number().int().positive() })).default([]),
  frequentAddresses: z.array(z.object({ value: z.string(), count: z.number().int().positive() })).default([]),
  frequentConnectors: z.array(z.object({ value: z.string(), count: z.number().int().positive() })).default([]),
  repeatedPhrases: z.array(z.object({ value: z.string(), count: z.number().int().positive() })).default([]),
  paragraphOpeningPatterns: z.array(z.string()).default([]),
  paragraphEndingPatterns: z.array(z.string()).default([]),
});

export const StyleProfileCandidateSchema = z.object({
  ...CandidateBaseShape,
  sourceDocumentId: z.string().min(1),
  sourceChapterIds: z.array(z.string()).default([]),
  analysisVersion: z.string().default(DOCUMENT_EXTRACTION_VERSION),
  sampleRange: z.string().default(""),
  userConfirmed: z.boolean().default(false),
  statistics: StyleStatisticsSchema,
  profile: StyleProfileSchema,
});

export const LanguageConstraintCandidateSchema = z.object({
  ...CandidateBaseShape,
  constraint: LanguageConstraintSchema,
  candidateStrictness: z.enum(["preferred", "advisory"]).default("advisory"),
});

export const DocumentIngestionProjectSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  name: z.string().default("小说导入"),
  dataVersion: z.union([z.literal(1), z.literal(DOCUMENT_INGESTION_DATA_VERSION)]).default(DOCUMENT_INGESTION_DATA_VERSION).transform(() => DOCUMENT_INGESTION_DATA_VERSION),
  status: z.enum(["draft", "processing", "review", "completed", "archived"]).default("draft"),
  documentSources: z.array(DocumentSourceSchema).default([]),
  selectedDocumentId: z.string().nullable().default(null),
  chapters: z.array(DocumentChapterSchema).default([]),
  chunks: z.array(DocumentChunkSchema).default([]),
  offsetMaps: z.record(z.string(), z.array(TextOffsetMapSegmentSchema)).default({}),
  tasks: z.array(IngestionTaskSchema).default([]),
  config: DocumentAnalysisConfigSchema.default(() => DocumentAnalysisConfigSchema.parse({})),
  extractionItems: z.array(ExtractionItemSchema).default([]),
  entityResolutions: z.array(EntityResolutionSchema).default([]),
  characterCandidates: z.array(CharacterCandidateSchema).default([]),
  voiceProfiles: z.array(CharacterVoiceProfileSchema).default([]),
  relationshipCandidates: z.array(RelationshipCandidateSchema).default([]),
  characterCardDrafts: z.array(CharacterCardDraftCandidateSchema).default([]),
  lorebookDrafts: z.array(LorebookDraftCandidateSchema).default([]),
  canonCandidates: z.array(GenericDocumentCandidateSchema).default([]),
  stateCandidates: z.array(GenericDocumentCandidateSchema).default([]),
  timelineCandidates: z.array(GenericDocumentCandidateSchema).default([]),
  plotThreadCandidates: z.array(GenericDocumentCandidateSchema).default([]),
  openQuestionCandidates: z.array(GenericDocumentCandidateSchema).default([]),
  foreshadowCandidates: z.array(GenericDocumentCandidateSchema).default([]),
  styleStatistics: StyleStatisticsSchema.nullable().default(null),
  styleProfileCandidates: z.array(StyleProfileCandidateSchema).default([]),
  languageConstraintCandidates: z.array(LanguageConstraintCandidateSchema).default([]),
  workImport: WorkImportStateSchema,
  promptVersion: z.string().default(DOCUMENT_EXTRACTION_VERSION),
  parserVersion: z.string().default(DOCUMENT_PARSER_VERSION),
  provider: z.enum(["mock", "openai", "anthropic"]).default("mock"),
  model: z.string().default("mock-model"),
  warnings: z.array(z.string()).default([]),
  errors: z.array(z.string()).default([]),
  createdAt: z.string(),
  modifiedAt: z.string(),
}).passthrough();

export type DocumentSource = z.infer<typeof DocumentSourceSchema>;
export type SourceSpan = z.infer<typeof SourceSpanSchema>;
export type TextOffsetMapSegment = z.infer<typeof TextOffsetMapSegmentSchema>;
export type DocumentParagraph = z.infer<typeof DocumentParagraphSchema>;
export type DocumentChapter = z.infer<typeof DocumentChapterSchema>;
export type DocumentChunk = z.infer<typeof DocumentChunkSchema>;
export type IngestionCheckpoint = z.infer<typeof IngestionCheckpointSchema>;
export type IngestionTask = z.infer<typeof IngestionTaskSchema>;
export type DocumentAnalysisConfig = z.infer<typeof DocumentAnalysisConfigSchema>;
export type ExtractionItem = z.infer<typeof ExtractionItemSchema>;
export type EntityResolution = z.infer<typeof EntityResolutionSchema>;
export type CharacterCandidate = z.infer<typeof CharacterCandidateSchema>;
export type CharacterVoiceProfile = z.infer<typeof CharacterVoiceProfileSchema>;
export type RelationshipCandidate = z.infer<typeof RelationshipCandidateSchema>;
export type GenericDocumentCandidate = z.infer<typeof GenericDocumentCandidateSchema>;
export type CharacterCardDraftCandidate = z.infer<typeof CharacterCardDraftCandidateSchema>;
export type LorebookDraftCandidate = z.infer<typeof LorebookDraftCandidateSchema>;
export type StyleStatistics = z.infer<typeof StyleStatisticsSchema>;
export type StyleProfileCandidate = z.infer<typeof StyleProfileCandidateSchema>;
export type LanguageConstraintCandidate = z.infer<typeof LanguageConstraintCandidateSchema>;
export type DocumentIngestionProject = z.infer<typeof DocumentIngestionProjectSchema>;

export function createEmptyDocumentIngestionProject(projectId: string, name = "小说导入"): DocumentIngestionProject {
  const now = new Date().toISOString();
  return DocumentIngestionProjectSchema.parse({
    id: createStableId("ingestion"), projectId, name, createdAt: now, modifiedAt: now,
  });
}
