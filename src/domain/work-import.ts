import { z } from "zod";
import { createStableId } from "./lorebook";

export const WORK_IMPORT_DATA_VERSION = 1;
export const WORK_IMPORT_PARSER_VERSION = "work-import-v1.0.0";

export const WorkImportFormatSchema = z.enum(["txt", "pdf", "epub", "docx", "markdown"]);
export const WorkImportStatusSchema = z.enum([
  "pending", "validating", "extracting", "ocr", "segmenting", "analyzing", "consolidating",
  "ready_for_review", "writing", "completed", "partially_completed", "cancelled", "failed",
]);

export const ImportSourceMapSchema = z.object({
  documentId: z.string().default(""), sourceVersion: z.number().int().positive().default(1),
  relativePath: z.string().default(""), contentHash: z.string().default(""), parserVersion: z.string().default(WORK_IMPORT_PARSER_VERSION),
  epubSpineIndex: z.number().int().min(0).nullable().default(null), epubPath: z.string().default(""),
  docxParagraphIndex: z.number().int().min(0).nullable().default(null), docxHeadingLevel: z.number().int().min(1).max(9).nullable().default(null), docxPart: z.enum(["body", "footnote", "endnote", "comment", "table", "image"]).nullable().default(null),
  markdownLineStart: z.number().int().positive().nullable().default(null), markdownLineEnd: z.number().int().positive().nullable().default(null),
  ocrPage: z.number().int().positive().nullable().default(null), ocrRegion: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).nullable().default(null),
  characterStart: z.number().int().min(0), characterEnd: z.number().int().min(0),
  rawExcerpt: z.string().max(280).default(""), confidence: z.number().min(0).max(1).default(1),
}).refine((value) => value.characterEnd >= value.characterStart, { path: ["characterEnd"], message: "来源结束位置不能早于开始位置。" });

export const ImportManifestItemSchema = z.object({
  id: z.string().min(1), originalFilename: z.string().min(1), safeFilename: z.string().min(1), relativePath: z.string().default(""),
  format: WorkImportFormatSchema, mimeType: z.string().default("application/octet-stream"), fileSize: z.number().int().min(0), contentHash: z.string().default(""),
  order: z.number().int().min(0), volumeName: z.string().default(""), excluded: z.boolean().default(false),
  status: WorkImportStatusSchema.default("pending"), documentId: z.string().nullable().default(null), chapterIds: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]), errors: z.array(z.string()).default([]), retryCount: z.number().int().min(0).default(0),
});

export const ImportManifestSchema = z.object({
  id: z.string().min(1), dataVersion: z.literal(WORK_IMPORT_DATA_VERSION).default(WORK_IMPORT_DATA_VERSION), projectId: z.string().min(1),
  status: WorkImportStatusSchema.default("pending"), items: z.array(ImportManifestItemSchema).default([]),
  checkpoint: z.object({ completedItemIds: z.array(z.string()).default([]), failedItemIds: z.array(z.string()).default([]), savedAt: z.string() }).default(() => ({ completedItemIds: [], failedItemIds: [], savedAt: new Date().toISOString() })),
  structureConfirmed: z.boolean().default(false), targetProjectId: z.string().nullable().default(null),
  createdAt: z.string(), modifiedAt: z.string(),
});

export const DocumentBundleSchema = z.object({
  id: z.string().min(1), dataVersion: z.literal(WORK_IMPORT_DATA_VERSION).default(WORK_IMPORT_DATA_VERSION), name: z.string().default("作品导入"),
  manifestId: z.string().min(1), selectedItemId: z.string().nullable().default(null), status: WorkImportStatusSchema.default("pending"),
  createdAt: z.string(), modifiedAt: z.string(),
});

export const ChapterVersionRelationSchema = z.enum(["exact_duplicate", "normalized_duplicate", "probable_revision", "possible_revision", "title_conflict", "partial_overlap", "unrelated"]);
export const ChapterVersionCandidateSchema = z.object({
  id: z.string().min(1), chapterIds: z.array(z.string()).min(2), relation: ChapterVersionRelationSchema,
  similarity: z.number().min(0).max(1), reasons: z.array(z.string()).default([]),
  decision: z.enum(["pending", "use_one", "keep_all", "mark_old", "mark_new", "merge", "exclude", "defer"]).default("pending"),
  selectedChapterId: z.string().nullable().default(null),
});

export const OcrPageResultSchema = z.object({
  pageNumber: z.number().int().positive(), status: z.enum(["pending", "processing", "completed", "failed", "cancelled"]).default("pending"),
  rawText: z.string().default(""), correctedText: z.string().nullable().default(null), confidence: z.number().min(0).max(1).default(0),
  imageReference: z.string().default(""), warnings: z.array(z.string()).default([]), error: z.string().nullable().default(null),
  sourceMap: ImportSourceMapSchema.optional(), modifiedAt: z.string(),
});
export const OcrJobSchema = z.object({
  id: z.string().min(1), dataVersion: z.literal(WORK_IMPORT_DATA_VERSION).default(WORK_IMPORT_DATA_VERSION), documentId: z.string().min(1),
  adapterId: z.string().default("tesseract-cli"), adapterVersion: z.string().default("unknown"), languages: z.array(z.enum(["chi_sim", "chi_tra", "eng"])).min(1),
  pageCount: z.number().int().positive(), status: WorkImportStatusSchema.default("pending"), progress: z.number().int().min(0).max(100).default(0),
  pages: z.array(OcrPageResultSchema).default([]), checkpoint: z.object({ completedPageNumbers: z.array(z.number().int().positive()).default([]), failedPageNumbers: z.array(z.number().int().positive()).default([]), savedAt: z.string() }),
  createdAt: z.string(), modifiedAt: z.string(),
});

export const ProjectRebuildOperationSchema = z.object({
  id: z.string().min(1), kind: z.enum(["manuscript", "character_card", "lorebook", "canon", "state", "timeline", "plot_thread", "foreshadow", "style_profile", "language_constraint"]),
  sourceId: z.string().min(1), targetId: z.string().nullable().default(null), action: z.enum(["add", "merge", "create_version", "conflict", "skip"]),
  title: z.string().default(""), reason: z.string().default(""), conflict: z.boolean().default(false), selected: z.boolean().default(true),
});
export const ProjectRebuildPlanSchema = z.object({
  id: z.string().min(1), dataVersion: z.literal(WORK_IMPORT_DATA_VERSION).default(WORK_IMPORT_DATA_VERSION), ingestionId: z.string().min(1),
  mode: z.enum(["new", "supplement"]), targetProjectId: z.string().nullable().default(null), operations: z.array(ProjectRebuildOperationSchema).default([]),
  conflicts: z.array(z.object({ id: z.string(), operationId: z.string(), description: z.string(), resolution: z.enum(["pending", "keep_existing", "use_import", "keep_both", "skip"]).default("pending") })).default([]),
  confirmed: z.boolean().default(false), createdAt: z.string(), modifiedAt: z.string(),
});
export const ProjectRebuildResultSchema = z.object({
  id: z.string().min(1), planId: z.string().min(1), status: z.enum(["completed", "partially_completed", "failed", "cancelled"]),
  log: z.array(z.object({ operationId: z.string(), status: z.enum(["completed", "failed", "skipped"]), targetId: z.string().nullable().default(null), error: z.string().nullable().default(null) })).default([]),
  createdAt: z.string(), modifiedAt: z.string(),
});

export const WorkImportStateSchema = z.object({
  bundles: z.array(DocumentBundleSchema).default([]), manifests: z.array(ImportManifestSchema).default([]), chapterVersions: z.array(ChapterVersionCandidateSchema).default([]),
  ocrJobs: z.array(OcrJobSchema).default([]), sourceMaps: z.array(ImportSourceMapSchema).default([]), rebuildPlans: z.array(ProjectRebuildPlanSchema).default([]), rebuildResults: z.array(ProjectRebuildResultSchema).default([]),
}).default(() => ({ bundles: [], manifests: [], chapterVersions: [], ocrJobs: [], sourceMaps: [], rebuildPlans: [], rebuildResults: [] }));

export type WorkImportFormat = z.infer<typeof WorkImportFormatSchema>;
export type ImportSourceMap = z.infer<typeof ImportSourceMapSchema>;
export type ImportManifestItem = z.infer<typeof ImportManifestItemSchema>;
export type ImportManifest = z.infer<typeof ImportManifestSchema>;
export type DocumentBundle = z.infer<typeof DocumentBundleSchema>;
export type ChapterVersionCandidate = z.infer<typeof ChapterVersionCandidateSchema>;
export type OcrPageResult = z.infer<typeof OcrPageResultSchema>;
export type OcrJob = z.infer<typeof OcrJobSchema>;
export type ProjectRebuildOperation = z.infer<typeof ProjectRebuildOperationSchema>;
export type ProjectRebuildPlan = z.infer<typeof ProjectRebuildPlanSchema>;
export type ProjectRebuildResult = z.infer<typeof ProjectRebuildResultSchema>;
export type WorkImportState = z.infer<typeof WorkImportStateSchema>;

export const workImportNow = () => new Date().toISOString();
export const workImportId = (prefix: string) => createStableId(prefix);
