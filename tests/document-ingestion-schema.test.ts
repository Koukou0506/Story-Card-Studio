import { describe, expect, it } from "vitest";
import {
  DOCUMENT_INGESTION_DATA_VERSION,
  DocumentChunkSchema,
  DocumentIngestionProjectSchema,
  DocumentSourceSchema,
  IngestionTaskSchema,
  SourceSpanSchema,
  createEmptyDocumentIngestionProject,
} from "@/domain/document-ingestion";

describe("C2.2 document ingestion domain", () => {
  it("creates a safe candidate-only ingestion project", () => {
    const project = createEmptyDocumentIngestionProject("project-1", "示例小说");

    expect(project.dataVersion).toBe(DOCUMENT_INGESTION_DATA_VERSION);
    expect(project.status).toBe("draft");
    expect(project.documentSources).toEqual([]);
    expect(project.characterCandidates).toEqual([]);
    expect(project.characterCardDrafts).toEqual([]);
    expect(project.lorebookDrafts).toEqual([]);
    expect(project.canonCandidates).toEqual([]);
    expect(project.styleProfileCandidates).toEqual([]);
  });

  it("applies safe defaults to a document source without storing its body", () => {
    const source = DocumentSourceSchema.parse({
      id: "doc-1",
      projectId: "project-1",
      originalFilename: "novel.txt",
      displayName: "novel",
      mimeType: "text/plain",
      fileExtension: ".txt",
      fileSize: 120,
      contentHash: "sha256:abc",
      importTime: "2026-07-15T00:00:00.000Z",
      storageReference: "asset:doc-1",
      permissionConfirmed: true,
    });

    expect(source.processingStatus).toBe("pending");
    expect(source.externalModelPermission).toBe("local_only");
    expect(source.sourceVersion).toBe(1);
    expect(source).not.toHaveProperty("rawText");
    expect(source).not.toHaveProperty("password");
  });

  it("validates traceable source spans and chunks", () => {
    const span = SourceSpanSchema.parse({
      documentId: "doc-1",
      sourceVersion: 1,
      chapterId: "chapter-1",
      chapterTitle: "第一章",
      pageStart: 1,
      pageEnd: 1,
      paragraphStart: 0,
      paragraphEnd: 1,
      characterStart: 0,
      characterEnd: 12,
      rawTextExcerpt: "第一章 风从江上来",
      normalizedTextExcerpt: "第一章 风从江上来",
      extractionConfidence: "high",
      mappingStatus: "mapped",
    });
    const chunk = DocumentChunkSchema.parse({
      id: "chunk-1",
      documentId: "doc-1",
      chapterId: "chapter-1",
      order: 0,
      text: "风从江上来。",
      startOffset: 0,
      endOffset: 7,
      sourceSpans: [span],
      estimatedTokens: 4,
    });

    expect(chunk.processingStatus).toBe("pending");
    expect(chunk.overlapBefore).toBe(0);
    expect(chunk.overlapAfter).toBe(0);
  });

  it("persists resumable task checkpoints and partial failures", () => {
    const task = IngestionTaskSchema.parse({
      id: "task-1",
      documentId: "doc-1",
      projectId: "project-1",
      createdAt: "2026-07-15T00:00:00.000Z",
      modifiedAt: "2026-07-15T00:00:00.000Z",
      failedChunkIds: ["chunk-2"],
      completedChunkIds: ["chunk-1"],
    });

    expect(task.status).toBe("pending");
    expect(task.checkpoint.completedChunkIds).toEqual(["chunk-1"]);
    expect(task.checkpoint.failedChunkIds).toEqual(["chunk-2"]);
    expect(task.progress).toBe(0);
  });

  it("round-trips complete structured data", () => {
    const project = createEmptyDocumentIngestionProject("project-1", "示例小说");
    const parsed = DocumentIngestionProjectSchema.parse(JSON.parse(JSON.stringify(project)));
    expect(parsed).toEqual(project);
  });
});
