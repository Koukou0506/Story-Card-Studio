import { describe, expect, it } from "vitest";
import { createMockDocumentIngestionProject } from "@/services/document-ingestion/mock";
import { DocumentIngestionProjectSchema } from "@/domain/document-ingestion";

describe("Mock document ingestion complete flow", () => {
  it("demonstrates traceable reverse modelling without confirming candidates", () => {
    const project = createMockDocumentIngestionProject("project-1");
    const parsed = DocumentIngestionProjectSchema.parse(project);
    expect(parsed.documentSources).toHaveLength(3);
    expect(parsed.documentSources.some((source) => source.fileExtension === ".txt")).toBe(true);
    expect(parsed.documentSources.some((source) => source.processingStatus === "needs_ocr")).toBe(true);
    expect(parsed.chapters.filter((chapter) => chapter.documentId === parsed.documentSources[0].id)).toHaveLength(3);
    expect(parsed.characterCandidates).toHaveLength(3);
    expect(parsed.entityResolutions.some((item) => item.result === "probably_same")).toBe(true);
    expect(parsed.entityResolutions.some((item) => ["different_entity", "conflict"].includes(item.result))).toBe(true);
    expect(parsed.relationshipCandidates).toHaveLength(2);
    expect(parsed.characterCardDrafts).toHaveLength(2);
    expect(parsed.lorebookDrafts[0].lorebook.entries).toHaveLength(5);
    expect(parsed.canonCandidates).toHaveLength(5);
    expect(parsed.timelineCandidates.length).toBeGreaterThan(0);
    expect(parsed.plotThreadCandidates).toHaveLength(2);
    expect(parsed.foreshadowCandidates).toHaveLength(1);
    expect(parsed.styleProfileCandidates).toHaveLength(1);
    expect(parsed.languageConstraintCandidates).toHaveLength(3);
    expect(parsed.characterCandidates.every((item) => item.decision === "pending")).toBe(true);
    expect(parsed.canonCandidates.every((item) => item.decision === "pending")).toBe(true);
    expect(parsed.characterCardDrafts.every((item) => item.status === "draft")).toBe(true);
    expect(parsed.tasks.some((task) => task.status === "partially_completed" && task.checkpoint.completedChunkIds.length > 0)).toBe(true);
  });
});
