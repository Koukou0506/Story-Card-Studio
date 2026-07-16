export type DocumentAssetKind = "original" | "raw_text" | "normalized_text" | "page_map";
export type DocumentAssetData = string | Blob | ArrayBuffer;

export interface DocumentAssetRecord {
  id: string;
  documentId: string;
  projectId: string;
  kind: DocumentAssetKind;
  mimeType: string;
  data: DocumentAssetData;
  size: number;
  contentHash: string;
  createdAt: string;
}

export interface DocumentAssetStorage {
  put(record: DocumentAssetRecord): Promise<void>;
  get(id: string): Promise<DocumentAssetRecord | null>;
  readTextRange(id: string, start: number, end: number): Promise<string>;
  findByHash(contentHash: string): Promise<DocumentAssetRecord | null>;
  deleteDocument(documentId: string): Promise<void>;
}

type AssetInput = Omit<DocumentAssetRecord, "size" | "createdAt"> & { createdAt?: string };

export function createDocumentAssetRecord(input: AssetInput): DocumentAssetRecord {
  const size = typeof input.data === "string"
    ? new TextEncoder().encode(input.data).byteLength
    : input.data instanceof Blob ? input.data.size : input.data.byteLength;
  return {
    id: input.id,
    documentId: input.documentId,
    projectId: input.projectId,
    kind: input.kind,
    mimeType: input.mimeType,
    data: input.data,
    size,
    contentHash: input.contentHash,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

export class MemoryDocumentAssetStorage implements DocumentAssetStorage {
  private readonly records = new Map<string, DocumentAssetRecord>();

  async put(record: DocumentAssetRecord): Promise<void> {
    const safeRecord = createDocumentAssetRecord(record);
    this.records.set(safeRecord.id, structuredClone(safeRecord));
  }

  async get(id: string): Promise<DocumentAssetRecord | null> {
    const value = this.records.get(id);
    return value ? structuredClone(value) : null;
  }

  async readTextRange(id: string, start: number, end: number): Promise<string> {
    const value = this.records.get(id);
    if (!value) throw new Error("文档资产不存在或已被删除。");
    const text = typeof value.data === "string"
      ? value.data
      : value.data instanceof Blob
        ? await value.data.text()
        : new TextDecoder().decode(value.data);
    return text.slice(Math.max(0, start), Math.max(start, end));
  }

  async findByHash(contentHash: string): Promise<DocumentAssetRecord | null> {
    const value = [...this.records.values()].find((record) => record.contentHash === contentHash);
    return value ? structuredClone(value) : null;
  }

  async deleteDocument(documentId: string): Promise<void> {
    for (const [id, record] of this.records) if (record.documentId === documentId) this.records.delete(id);
  }
}

export {
  BrowserDocumentAssetStorage,
  createBrowserDocumentAssetStorage,
} from "./browser-document-assets";
