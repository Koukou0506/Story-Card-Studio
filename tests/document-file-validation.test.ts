import { describe, expect, it } from "vitest";
import {
  calculateContentHash,
  inspectDocumentFile,
  sanitizeDocumentFilename,
  validateDocumentFile,
} from "@/services/document-ingestion/file-validator";

const pdfHeader = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);

describe("document file validation", () => {
  it("accepts TXT and PDF only when extension, MIME and signature agree", () => {
    expect(validateDocumentFile({ name: "novel.txt", size: 12, type: "text/plain" }, new TextEncoder().encode("第一章"))).toEqual({ ok: true, format: "txt" });
    expect(validateDocumentFile({ name: "novel.pdf", size: 12, type: "application/pdf" }, pdfHeader)).toEqual({ ok: true, format: "pdf" });
    expect(validateDocumentFile({ name: "fake.pdf", size: 12, type: "application/pdf" }, new TextEncoder().encode("not pdf"))).toMatchObject({ ok: false });
    expect(validateDocumentFile({ name: "archive.exe", size: 12, type: "application/octet-stream" }, new Uint8Array([0x4d, 0x5a]))).toMatchObject({ ok: false });
  });

  it("rejects empty and oversized files with Chinese errors", () => {
    expect(validateDocumentFile({ name: "empty.txt", size: 0, type: "text/plain" }, new Uint8Array())).toEqual({ ok: false, error: "文件为空，无法解析。" });
    expect(validateDocumentFile({ name: "huge.txt", size: 101, type: "text/plain" }, new Uint8Array([65]), { maxBytes: 100 })).toEqual({ ok: false, error: "文件超过 100 B 上限，请拆分文件或调整管理员配置。" });
  });

  it("sanitizes names without losing the supported extension", () => {
    expect(sanitizeDocumentFilename("../我的:小说?.TXT")).toBe("我的_小说_.txt");
  });

  it("hashes content and detects duplicate hashes", async () => {
    const file = new File(["第一章\n内容"], "novel.txt", { type: "text/plain" });
    const hash = await calculateContentHash(await file.arrayBuffer());
    const result = await inspectDocumentFile(file, { knownHashes: [hash] });
    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("已导入");
  });
});
