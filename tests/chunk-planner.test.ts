import { describe, expect, it } from "vitest";
import { segmentDocumentChapters } from "@/services/document-ingestion/chapter-segmenter";
import { deduplicateOverlapExtractions, planDocumentChunks } from "@/services/document-ingestion/chunk-planner";

describe("ChunkPlanner", () => {
  it("prefers chapter and sentence boundaries with bounded overlap", () => {
    const text = `第一章\n${"甲走进城门。乙跟在身后。".repeat(20)}\n\n第二章\n${"雨停了。众人继续赶路。".repeat(20)}`;
    const chapters = segmentDocumentChapters("doc-1", text);
    const chunks = planDocumentChunks({ documentId: "doc-1", chapters, targetCharacters: 80, overlapCharacters: 12 });
    expect(chunks.length).toBeGreaterThan(2);
    expect(new Set(chunks.map((chunk) => chunk.chapterId)).size).toBe(2);
    expect(chunks.slice(0, -1).every((chunk) => /[。！？.!?]$/.test(chunk.text.trim()))).toBe(true);
    expect(chunks.some((chunk) => chunk.overlapBefore > 0)).toBe(true);
    expect(chunks.every((chunk) => chunk.sourceSpans.length > 0)).toBe(true);
  });

  it("deduplicates extraction items originating only from adjacent overlap", () => {
    const items = [
      { id: "a", type: "character", normalizedName: "柳如烟", content: "柳如烟出现", sourceStart: 70, sourceEnd: 78, chunkId: "c1" },
      { id: "b", type: "character", normalizedName: "柳如烟", content: "柳如烟出现", sourceStart: 70, sourceEnd: 78, chunkId: "c2" },
      { id: "c", type: "character", normalizedName: "旅人", content: "旅人出现", sourceStart: 90, sourceEnd: 95, chunkId: "c2" },
    ];
    expect(deduplicateOverlapExtractions(items).map((item) => item.id)).toEqual(["a", "c"]);
  });
});
