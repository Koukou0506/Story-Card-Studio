import {
  CharacterCandidateSchema,
  DocumentChapterSchema,
  DocumentIngestionProjectSchema,
  DocumentSourceSchema,
  EntityResolutionSchema,
  GenericDocumentCandidateSchema,
  IngestionTaskSchema,
  RelationshipCandidateSchema,
  SourceSpanSchema,
  createEmptyDocumentIngestionProject,
  type GenericDocumentCandidate,
} from "@/domain/document-ingestion";
import { createStableId } from "@/domain/lorebook";
import { segmentDocumentChapters } from "./chapter-segmenter";
import { planDocumentChunks } from "./chunk-planner";
import { characterCandidateToCardDraft, createLanguageConstraintCandidates, createLorebookDraftFromCandidates, styleStatisticsToProfileCandidate } from "./converters";
import { calculateStyleStatistics } from "./style-statistics";

export const MOCK_THREE_CHAPTER_NOVEL = `第一章 雨夜\n柳如烟在临水镇旧宅发现会显字的古玉。旅人称她为柳姑娘。\n\n第二章 旧账\n旅人与柳如烟追查旧案，林青将军阻止二人进入北桥。\n\n第三章 暗室\n江南医师林青救下受伤的旅人。柳如烟决定公开一部分账册。`;

export function createMockDocumentIngestionProject(projectId = "mock-project") {
  const project = createEmptyDocumentIngestionProject(projectId, "Mock 小说逆向建模");
  const now = new Date().toISOString();
  const txtId = "mock-document-txt";
  const pdfId = "mock-document-pdf";
  const scanId = "mock-document-scan";
  project.documentSources = [
    DocumentSourceSchema.parse({ id: txtId, projectId, originalFilename: "mock-three-chapters.txt", displayName: "三章示例", mimeType: "text/plain", fileExtension: ".txt", fileSize: 1024, contentHash: "sha256:mock-txt", encoding: "utf-8", chapterCount: 3, paragraphCount: 3, characterCount: MOCK_THREE_CHAPTER_NOVEL.length, tokenEstimate: Math.ceil(MOCK_THREE_CHAPTER_NOVEL.length / 2), importTime: now, permissionConfirmed: true, processingStatus: "ready_for_review", processingProgress: 100, storageReference: "asset:mock-txt", normalizedTextReference: "asset:mock-txt-normalized" }),
    DocumentSourceSchema.parse({ id: pdfId, projectId, originalFilename: "mock-text-layer.pdf", displayName: "文本层 PDF", mimeType: "application/pdf", fileExtension: ".pdf", fileSize: 2048, contentHash: "sha256:mock-pdf", pageCount: 3, chapterCount: 1, characterCount: 200, importTime: now, permissionConfirmed: true, processingStatus: "ready_for_review", processingProgress: 100, storageReference: "asset:mock-pdf" }),
    DocumentSourceSchema.parse({ id: scanId, projectId, originalFilename: "mock-scan.pdf", displayName: "扫描 PDF", mimeType: "application/pdf", fileExtension: ".pdf", fileSize: 4096, contentHash: "sha256:mock-scan", pageCount: 2, importTime: now, permissionConfirmed: true, processingStatus: "needs_ocr", processingProgress: 20, currentStage: "需要 OCR", warnings: ["PDF 没有可用文本层，需要 OCR。"], storageReference: "asset:mock-scan" }),
  ];
  project.selectedDocumentId = txtId;
  project.chapters = segmentDocumentChapters(txtId, MOCK_THREE_CHAPTER_NOVEL);
  project.chunks = planDocumentChunks({ documentId: txtId, chapters: project.chapters, targetCharacters: 100, overlapCharacters: 16 });
  const span = SourceSpanSchema.parse({ documentId: txtId, sourceVersion: 1, chapterId: project.chapters[0].id, chapterTitle: project.chapters[0].title, characterStart: 0, characterEnd: 30, rawTextExcerpt: "柳如烟在临水镇旧宅发现古玉。", normalizedTextExcerpt: "柳如烟在临水镇旧宅发现古玉。", extractionConfidence: "high" });
  const makeCharacter = (id: string, name: string, aliases: string[], identity: string[]) => CharacterCandidateSchema.parse({
    id, name, aliases, identity, stableTraits: name === "柳如烟" ? ["谨慎", "重视责任"] : ["克制"],
    situationalBehaviors: ["危机中作出快速选择"], goals: ["查清旧案"], speechHabits: ["短句、少解释"],
    sourceSpans: [span], confidence: "medium", authority: "document_explicit",
  });
  project.characterCandidates = [
    makeCharacter("char-liu", "柳如烟", ["柳姑娘"], ["柳家长女"]),
    makeCharacter("char-traveler", "旅人", ["异乡客"], ["调查旧案的旅人"]),
    makeCharacter("char-linqing-general", "林青", [], ["北境将军"]),
  ];
  project.entityResolutions = [
    EntityResolutionSchema.parse({ id: "resolution-alias", leftCandidateId: "mention-liu", rightCandidateId: "mention-liu-title", result: "probably_same", reasons: ["别名与共现场景一致"], confidence: "medium" }),
    EntityResolutionSchema.parse({ id: "resolution-same-name", leftCandidateId: "char-linqing-general", rightCandidateId: "mention-linqing-doctor", result: "different_entity", reasons: ["同名但身份和地点不同"], confidence: "high" }),
  ];
  project.relationshipCandidates = [
    RelationshipCandidateSchema.parse({ id: "rel-liu-traveler", name: "柳如烟—旅人", characterAId: "char-liu", characterBId: "char-traveler", relationType: "temporary_cooperation", publicRelationship: "同行者", actualRelationship: "谨慎合作", initialState: "互不信任", currentState: "有限合作", trust: 45, sourceSpans: [span], authority: "document_explicit" }),
    RelationshipCandidateSchema.parse({ id: "rel-liu-lin", name: "柳如烟—林青", characterAId: "char-liu", characterBId: "char-linqing-general", relationType: "opposition", publicRelationship: "陌生人", actualRelationship: "目标冲突", initialState: "未知", currentState: "对立", hostility: 65, sourceSpans: [span], authority: "document_explicit" }),
  ];
  project.characterCardDrafts = project.characterCandidates.slice(0, 2).map(characterCandidateToCardDraft);
  const makeCandidate = (id: string, name: string, content: string, candidateType: GenericDocumentCandidate["candidateType"]) => GenericDocumentCandidateSchema.parse({
    id, name, description: content, content, candidateType, sourceSpans: [span], confidence: "medium", authority: "document_explicit", recommendedTarget: candidateType,
  });
  const loreCandidates = [
    makeCandidate("world-town", "临水镇", "临水镇是一座依水而建的旧城。", "entity"),
    makeCandidate("world-jade", "古玉", "古玉遇水会显出隐藏字迹。", "entity"),
    makeCandidate("world-mansion", "柳家旧宅", "柳家旧宅保存旧案账册。", "entity"),
    makeCandidate("world-bridge", "北桥", "北桥下方藏有暗室入口。", "entity"),
    makeCandidate("world-case", "临水旧案", "旧案牵涉柳家与地方势力。", "canon"),
  ];
  project.lorebookDrafts = [createLorebookDraftFromCandidates("Mock 世界书草稿", loreCandidates)];
  project.canonCandidates = loreCandidates.map((candidate, index) => ({ ...candidate, id: `canon-${index}`, candidateType: "canon" as const }));
  project.timelineCandidates = [makeCandidate("timeline-1", "雨夜发现古玉", "第一章雨夜，柳如烟发现古玉显字。", "timeline_event")];
  project.plotThreadCandidates = [
    makeCandidate("plot-1", "临水旧案主线", "追查旧案真相。", "plot_thread"),
    makeCandidate("plot-2", "柳如烟与旅人关系线", "二人从戒备走向有限合作。", "plot_thread"),
  ];
  project.foreshadowCandidates = [makeCandidate("foreshadow-1", "古玉水纹", "第一章设置古玉遇水显字，计划在后续回收。", "foreshadow")];
  const stats = calculateStyleStatistics(MOCK_THREE_CHAPTER_NOVEL, project.chapters.map((chapter) => chapter.endOffset - chapter.startOffset));
  project.styleStatistics = stats;
  project.styleProfileCandidates = [styleStatisticsToProfileCandidate(txtId, project.chapters.map((chapter) => chapter.id), stats, [span])];
  project.languageConstraintCandidates = createLanguageConstraintCandidates(txtId, stats, [span]);
  project.tasks = [IngestionTaskSchema.parse({ id: "mock-partial-task", projectId, documentId: txtId, status: "partially_completed", stage: "analyzing", progress: 67, completedChunkIds: project.chunks.slice(0, 2).map((chunk) => chunk.id), failedChunkIds: project.chunks.slice(2, 3).map((chunk) => chunk.id), createdAt: now, modifiedAt: now })];
  project.status = "review";
  project.modifiedAt = now;
  return DocumentIngestionProjectSchema.parse(project);
}
