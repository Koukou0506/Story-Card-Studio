import { describe, expect, it } from "vitest";
import { MemoryDocumentAssetStorage } from "@/storage/document-assets";
import { ingestLocalDocumentFile } from "@/services/document-ingestion/pipeline";

describe("local-only document ingestion", () => {
  it("parses a TXT into assets, chapters and chunks without calling a Provider", async () => {
    const storage = new MemoryDocumentAssetStorage();
    const file = new File(["第一章\n柳如烟走进临水镇。\n\n第二章\n旅人问她为何而来。"], "novel.txt", { type: "text/plain" });
    const result = await ingestLocalDocumentFile({
      file, projectId: "project-1", permissionConfirmed: true, storage,
      config: { allowExternalModel: false, targetChunkCharacters: 100 },
    });
    expect(result.source.processingStatus).toBe("ready_for_review");
    expect(result.source.externalModelPermission).toBe("local_only");
    expect(result.chapters).toHaveLength(2);
    expect(result.chunks.length).toBeGreaterThan(0);
    expect(result.offsetMap.length).toBeGreaterThan(0);
    expect(result.source.rawTextReference).toBeTruthy();
    expect(await storage.get(result.source.storageReference)).not.toBeNull();
    expect(await storage.get(result.source.rawTextReference!)).not.toBeNull();
    expect(await storage.get(result.source.normalizedTextReference!)).not.toBeNull();
  });

  it("maps chunk Source Spans back to raw character offsets after cleaning", async () => {
    const storage = new MemoryDocumentAssetStorage();
    const raw = "第一章\r\n江　风吹过。";
    const result = await ingestLocalDocumentFile({
      file: new File([raw], "mapped.txt", { type: "text/plain" }),
      projectId: "project-1", permissionConfirmed: true, storage,
    });
    const span = result.chunks[0].sourceSpans[0];
    expect(span.mappingStatus).toBe("approximate");
    expect(raw.slice(span.characterStart, span.characterEnd)).toContain("江　风吹过。");
    expect(span.normalizedTextExcerpt).toContain("江 风吹过。");
  });

  it("honors local retention choices without losing structured chapters", async () => {
    const storage = new MemoryDocumentAssetStorage();
    const result = await ingestLocalDocumentFile({
      file: new File(["第一章\n仅用于本地解析。"], "private.txt", { type: "text/plain" }),
      projectId: "project-1", permissionConfirmed: true, storage,
      retainOriginalFile: false,
      retainExtractedText: false,
    });
    expect(result.chapters).toHaveLength(1);
    expect(result.source.retainOriginalFile).toBe(false);
    expect(result.source.retainExtractedText).toBe(false);
    expect(result.source.rawTextReference).toBeNull();
    expect(result.source.normalizedTextReference).toBeNull();
    expect(await storage.get(result.source.storageReference)).toBeNull();
  });
});
