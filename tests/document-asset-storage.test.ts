import { describe, expect, it } from "vitest";
import { MemoryDocumentAssetStorage, createDocumentAssetRecord } from "@/storage/document-assets";

describe("DocumentAssetStorage", () => {
  it("stores document assets outside ProjectDraft and supports bounded text reads", async () => {
    const storage = new MemoryDocumentAssetStorage();
    await storage.put(createDocumentAssetRecord({
      id: "asset-text",
      documentId: "doc-1",
      projectId: "project-1",
      kind: "normalized_text",
      mimeType: "text/plain",
      data: "第一章\n江风吹过旧城。",
      contentHash: "sha256:text",
    }));

    expect(await storage.readTextRange("asset-text", 4, 9)).toBe("江风吹过旧");
    expect((await storage.get("asset-text"))?.data).toBe("第一章\n江风吹过旧城。");
  });

  it("finds duplicates by hash and deletes all assets for a document", async () => {
    const storage = new MemoryDocumentAssetStorage();
    await storage.put(createDocumentAssetRecord({ id: "a", documentId: "doc-1", projectId: "p", kind: "original", mimeType: "text/plain", data: "A", contentHash: "sha256:same" }));
    await storage.put(createDocumentAssetRecord({ id: "b", documentId: "doc-1", projectId: "p", kind: "raw_text", mimeType: "text/plain", data: "B", contentHash: "sha256:other" }));

    expect((await storage.findByHash("sha256:same"))?.id).toBe("a");
    await storage.deleteDocument("doc-1");
    expect(await storage.get("a")).toBeNull();
    expect(await storage.get("b")).toBeNull();
  });

  it("never persists PDF passwords as asset fields", async () => {
    const record = createDocumentAssetRecord({ id: "pdf", documentId: "doc", projectId: "p", kind: "original", mimeType: "application/pdf", data: new Blob(["%PDF"]), contentHash: "sha256:pdf" });
    expect(record).not.toHaveProperty("password");
  });
});
