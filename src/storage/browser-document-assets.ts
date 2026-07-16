import {
  MemoryDocumentAssetStorage,
  createDocumentAssetRecord,
  type DocumentAssetRecord,
  type DocumentAssetStorage,
} from "./document-assets";

export const DOCUMENT_ASSET_DATABASE_NAME = "story-card-studio-document-assets";
export const DOCUMENT_ASSET_DATABASE_VERSION = 1;
const DOCUMENT_ASSET_STORE_NAME = "assets";
const DOCUMENT_ID_INDEX = "documentId";
const CONTENT_HASH_INDEX = "contentHash";

function textFromAsset(record: DocumentAssetRecord): Promise<string> | string {
  if (typeof record.data === "string") return record.data;
  if (record.data instanceof Blob) return record.data.text();
  return new TextDecoder().decode(record.data);
}

function range(start: number, end: number): [number, number] {
  const safeStart = Math.max(0, Number.isFinite(start) ? Math.trunc(start) : 0);
  const safeEnd = Math.max(safeStart, Number.isFinite(end) ? Math.trunc(end) : safeStart);
  return [safeStart, safeEnd];
}

export class BrowserDocumentAssetStorage implements DocumentAssetStorage {
  private database: Promise<IDBDatabase> | null = null;

  constructor(
    private readonly idbFactory: IDBFactory | null = typeof indexedDB === "undefined" ? null : indexedDB,
    private readonly memoryFallback: DocumentAssetStorage = new MemoryDocumentAssetStorage(),
  ) {}

  private open(): Promise<IDBDatabase> {
    if (!this.idbFactory) return Promise.reject(new Error("IndexedDB unavailable"));
    if (!this.database) {
      this.database = new Promise((resolve, reject) => {
        let request: IDBOpenDBRequest;
        try {
          request = this.idbFactory!.open(DOCUMENT_ASSET_DATABASE_NAME, DOCUMENT_ASSET_DATABASE_VERSION);
        } catch (error) {
          reject(error);
          return;
        }
        request.onupgradeneeded = () => {
          if (request.result.objectStoreNames.contains(DOCUMENT_ASSET_STORE_NAME)) return;
          const store = request.result.createObjectStore(DOCUMENT_ASSET_STORE_NAME, { keyPath: "id" });
          store.createIndex(DOCUMENT_ID_INDEX, "documentId", { unique: false });
          store.createIndex(CONTENT_HASH_INDEX, "contentHash", { unique: false });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("Unable to open the document asset database."));
        request.onblocked = () => reject(new Error("Document asset database upgrade is blocked."));
      });
      this.database.catch(() => { this.database = null; });
    }
    return this.database;
  }

  private async idbRequest<T>(
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      let transaction: IDBTransaction;
      let request: IDBRequest<T>;
      try {
        transaction = database.transaction(DOCUMENT_ASSET_STORE_NAME, mode);
        request = action(transaction.objectStore(DOCUMENT_ASSET_STORE_NAME));
      } catch (error) {
        reject(error);
        return;
      }
      let requestSucceeded = false;
      let transactionCompleted = false;
      let result: T;
      const resolveCommittedResult = () => {
        if (requestSucceeded && (mode === "readonly" || transactionCompleted)) resolve(result);
      };
      request.onsuccess = () => {
        result = request.result;
        requestSucceeded = true;
        resolveCommittedResult();
      };
      request.onerror = () => reject(request.error ?? new Error("Document asset database operation failed."));
      transaction.oncomplete = () => {
        transactionCompleted = true;
        resolveCommittedResult();
      };
      transaction.onerror = () => reject(transaction.error ?? new Error("Document asset database transaction failed."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Document asset database transaction aborted."));
    });
  }

  async put(record: DocumentAssetRecord): Promise<void> {
    const safeRecord = createDocumentAssetRecord(record);
    if (!this.idbFactory) return this.memoryFallback.put(safeRecord);
    await this.idbRequest("readwrite", (store) => store.put(safeRecord));
  }

  async get(id: string): Promise<DocumentAssetRecord | null> {
    if (!this.idbFactory) return this.memoryFallback.get(id);
    const record = await this.idbRequest<DocumentAssetRecord | undefined>("readonly", (store) => store.get(id));
    return record ? createDocumentAssetRecord(record) : null;
  }

  async readTextRange(id: string, start: number, end: number): Promise<string> {
    if (!this.idbFactory) return this.memoryFallback.readTextRange(id, start, end);
    const record = await this.get(id);
    if (!record) throw new Error("文档资产不存在或已被删除。");
    const [safeStart, safeEnd] = range(start, end);
    return (await textFromAsset(record)).slice(safeStart, safeEnd);
  }

  async findByHash(contentHash: string): Promise<DocumentAssetRecord | null> {
    if (!this.idbFactory) return this.memoryFallback.findByHash(contentHash);
    const record = await this.idbRequest<DocumentAssetRecord | undefined>(
      "readonly",
      (store) => store.index(CONTENT_HASH_INDEX).get(contentHash),
    );
    return record ? createDocumentAssetRecord(record) : null;
  }

  async deleteDocument(documentId: string): Promise<void> {
    if (!this.idbFactory) return this.memoryFallback.deleteDocument(documentId);
    const keys = await this.idbRequest<IDBValidKey[]>(
      "readonly",
      (store) => store.index(DOCUMENT_ID_INDEX).getAllKeys(documentId),
    );
    await Promise.all(keys.map((key) => this.idbRequest("readwrite", (store) => store.delete(key))));
  }
}

export function createBrowserDocumentAssetStorage(): DocumentAssetStorage {
  return new BrowserDocumentAssetStorage();
}
