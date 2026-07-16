import { describe, expect, it } from "vitest";
import {
  DocumentSourceSchema,
  createEmptyDocumentIngestionProject,
  type DocumentIngestionProject,
} from "@/domain/document-ingestion";
import { createMockDocumentIngestionProject } from "@/services/document-ingestion/mock";
import {
  exportDocumentIngestionJSON,
  importDocumentIngestionJSON,
  safeDocumentIngestionFilename,
} from "@/services/document-ingestion/export";

describe("DocumentIngestionProject JSON", () => {
  it("round-trips a complete structured ingestion project through its Schema", () => {
    const project = createMockDocumentIngestionProject("project-1");

    const imported = importDocumentIngestionJSON(exportDocumentIngestionJSON(project));

    expect(imported).toEqual(project);
  });

  it("rejects invalid JSON and objects that do not satisfy the ingestion Schema", () => {
    expect(() => importDocumentIngestionJSON("{not-json"))
      .toThrow("C2.2 JSON 导入失败");
    expect(() => importDocumentIngestionJSON(JSON.stringify({ dataVersion: 1 })))
      .toThrow("C2.2 JSON 导入失败");
    expect(() => exportDocumentIngestionJSON({ id: "" } as DocumentIngestionProject))
      .toThrow("C2.2 JSON 导出失败");
  });

  it("removes passwords, provider keys, logs and unreferenced asset bodies on export and import", () => {
    const project = createEmptyDocumentIngestionProject("project-1", "安全导入");
    const documentSource = DocumentSourceSchema.parse({
      id: "doc-1",
      projectId: "project-1",
      originalFilename: "novel.pdf",
      displayName: "novel",
      mimeType: "application/pdf",
      fileExtension: ".pdf",
      fileSize: 120,
      contentHash: "sha256:pdf",
      importTime: "2026-07-15T00:00:00.000Z",
      storageReference: "asset:doc-1:original",
      permissionConfirmed: true,
    });
    const unsafe = {
      ...project,
      providerApiKey: "sk-export-secret",
      debugLog: "export request with full content",
      rawText: "unreferenced novel body",
      documentSources: [{
        ...documentSource,
        pdfPassword: "open-sesame",
        requestLogs: ["full request"],
        assetData: "base64-original-file",
      }],
      extensionMetadata: {
        keep: "forward-compatible",
        api_key: "sk-nested-secret",
        anthropicKey: "provider-key-secret",
        providerRequestLog: "provider request body",
        responseLog: "full response",
      },
    } as unknown as DocumentIngestionProject;

    const exported = exportDocumentIngestionJSON(unsafe);
    const parsed = JSON.parse(exported) as Record<string, unknown>;
    const imported = importDocumentIngestionJSON(JSON.stringify(unsafe)) as DocumentIngestionProject & Record<string, unknown>;

    for (const secret of [
      "sk-export-secret", "export request with full content", "unreferenced novel body",
      "open-sesame", "full request", "base64-original-file", "sk-nested-secret",
      "provider-key-secret", "provider request body", "full response",
    ]) expect(exported).not.toContain(secret);
    expect(parsed).not.toHaveProperty("providerApiKey");
    expect(parsed).not.toHaveProperty("debugLog");
    expect(parsed).not.toHaveProperty("rawText");
    expect(imported).not.toHaveProperty("providerApiKey");
    expect(imported.documentSources[0]).not.toHaveProperty("pdfPassword");
    expect(imported.extensionMetadata).toEqual({ keep: "forward-compatible" });
  });

  it("produces path-safe cross-platform filenames", () => {
    const safe = safeDocumentIngestionFilename(" ../../A:/\\*?\"<>|小说. ");

    expect(safe).not.toMatch(/[<>:"/\\|?*\x00-\x1F]/);
    expect(safe).not.toMatch(/^\.+|[. ]+$/);
    expect(safe.length).toBeLessThanOrEqual(100);
    expect(safeDocumentIngestionFilename("CON")).toBe("_CON");
    expect(safeDocumentIngestionFilename("... ")).toBe("document-ingestion");
  });
});
