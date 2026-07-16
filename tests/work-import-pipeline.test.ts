import { describe, expect, it } from "vitest";
import { MemoryDocumentAssetStorage } from "@/storage/document-assets";
import { ingestLocalDocumentFile } from "@/services/document-ingestion/pipeline";
import { validateDocumentFile } from "@/services/document-ingestion/file-validator";

describe("作品导入统一 Pipeline", () => {
  it("校验新格式签名并让 Markdown 继续使用统一清洗、分章和分块", async () => {
    expect(validateDocumentFile({ name: "book.epub", size: 20, type: "application/epub+zip" }, new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toMatchObject({ ok: true, format: "epub" });
    expect(validateDocumentFile({ name: "book.docx", size: 20, type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }, new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toMatchObject({ ok: true, format: "docx" });
    const file = new File(["# 第一章\n\n正文。"], "book.md", { type: "text/markdown" });
    const result = await ingestLocalDocumentFile({ file, projectId: "p", permissionConfirmed: true, storage: new MemoryDocumentAssetStorage() });
    expect(result.source.fileExtension).toBe(".md");
    expect(result.chapters).toHaveLength(1);
    expect(result.chunks[0].sourceSpans[0].markdownLineStart).toBeGreaterThan(0);
  });
});
