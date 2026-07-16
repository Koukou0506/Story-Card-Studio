import { describe, expect, it } from "vitest";
import {
  BrowserDocumentAssetStorage,
  MemoryDocumentAssetStorage,
  createBrowserDocumentAssetStorage,
  createDocumentAssetRecord,
  type DocumentAssetRecord,
} from "@/storage/document-assets";

type RequestShape<T> = {
  result: T;
  error: DOMException | null;
  onsuccess: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
};

function request<T>(run: () => T): IDBRequest<T> {
  const value: RequestShape<T | undefined> = {
    result: undefined,
    error: null,
    onsuccess: null,
    onerror: null,
  };
  queueMicrotask(() => {
    try {
      value.result = run();
      value.onsuccess?.(new Event("success"));
    } catch (error) {
      value.error = error instanceof DOMException ? error : new DOMException(String(error), "UnknownError");
      value.onerror?.(new Event("error"));
    }
  });
  return value as unknown as IDBRequest<T>;
}

function createWorkingIndexedDb(options: { abortWrites?: boolean } = {}) {
  const records = new Map<IDBValidKey, DocumentAssetRecord>();
  let storeCreated = false;

  const objectStore = {
    createIndex: () => ({}) as IDBIndex,
    put: (record: DocumentAssetRecord) => request(() => {
      records.set(record.id, structuredClone(record));
      return record.id;
    }),
    get: (id: IDBValidKey) => request(() => structuredClone(records.get(id))),
    getAll: () => request(() => [...records.values()].map((record) => structuredClone(record))),
    delete: (id: IDBValidKey) => request(() => {
      records.delete(id);
      return undefined;
    }),
    index: (name: string) => ({
      get: (value: IDBValidKey) => request(() => {
        const field = name === "contentHash" ? "contentHash" : "documentId";
        return structuredClone([...records.values()].find((record) => record[field] === value));
      }),
      getAllKeys: (value: IDBValidKey) => request(() => [...records.values()]
        .filter((record) => record.documentId === value)
        .map((record) => record.id)),
    }),
  } as unknown as IDBObjectStore;

  const database = {
    objectStoreNames: { contains: () => storeCreated },
    createObjectStore: () => {
      storeCreated = true;
      return objectStore;
    },
    transaction: (_storeName: string, mode: IDBTransactionMode = "readonly") => {
      const transaction = {
        error: null as DOMException | null,
        onabort: null as ((event: Event) => void) | null,
        oncomplete: null as ((event: Event) => void) | null,
        onerror: null as ((event: Event) => void) | null,
        objectStore: () => objectStore,
      };
      setTimeout(() => {
        if (options.abortWrites && mode === "readwrite") {
          transaction.error = new DOMException("commit failed", "AbortError");
          transaction.onabort?.(new Event("abort"));
        } else {
          transaction.oncomplete?.(new Event("complete"));
        }
      }, 0);
      return transaction as unknown as IDBTransaction;
    },
  } as unknown as IDBDatabase;

  const factory = {
    open: () => {
      const openRequest = {
        result: database,
        error: null,
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
        onblocked: null,
      } as unknown as IDBOpenDBRequest;
      queueMicrotask(() => {
        openRequest.onupgradeneeded?.(new Event("upgradeneeded") as IDBVersionChangeEvent);
        openRequest.onsuccess?.(new Event("success"));
      });
      return openRequest;
    },
  } as unknown as IDBFactory;

  return { factory, records };
}

function createFailingIndexedDb(): IDBFactory {
  return {
    open: () => {
      const openRequest = {
        result: undefined,
        error: new DOMException("database is blocked", "UnknownError"),
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
        onblocked: null,
      } as unknown as IDBOpenDBRequest;
      queueMicrotask(() => openRequest.onerror?.(new Event("error")));
      return openRequest;
    },
  } as unknown as IDBFactory;
}

const asset = (
  id: string,
  documentId: string,
  kind: DocumentAssetRecord["kind"],
  data: DocumentAssetRecord["data"],
  contentHash = `sha256:${id}`,
) => createDocumentAssetRecord({
  id,
  documentId,
  projectId: "project-1",
  kind,
  mimeType: kind === "original" ? "application/pdf" : "text/plain",
  data,
  contentHash,
});

describe("BrowserDocumentAssetStorage", () => {
  it("provides a stable default browser-storage factory", async () => {
    const storage = createBrowserDocumentAssetStorage();
    await storage.put(asset("factory", "doc-1", "normalized_text", "factory content"));
    expect((await storage.get("factory"))?.data).toBe("factory content");
  });

  it("persists original, extracted and normalized assets as separate IndexedDB records", async () => {
    const indexedDb = createWorkingIndexedDb();
    const storage = new BrowserDocumentAssetStorage(indexedDb.factory);

    await storage.put(asset("original", "doc-1", "original", new Blob(["%PDF"])));
    await storage.put(asset("raw", "doc-1", "raw_text", "第一章\r\n江风吹过旧城。", "sha256:raw"));
    await storage.put(asset("normalized", "doc-1", "normalized_text", "第一章\n江风吹过旧城。", "sha256:normalized"));

    expect([...indexedDb.records.keys()]).toEqual(["original", "raw", "normalized"]);
    expect(await storage.readTextRange("normalized", 4, 9)).toBe("江风吹过旧");
    expect((await storage.findByHash("sha256:raw"))?.id).toBe("raw");
  });

  it("deletes every asset for one document without touching another document", async () => {
    const indexedDb = createWorkingIndexedDb();
    const storage = new BrowserDocumentAssetStorage(indexedDb.factory);
    await storage.put(asset("a", "doc-1", "original", "A"));
    await storage.put(asset("b", "doc-1", "raw_text", "B"));
    await storage.put(asset("c", "doc-2", "normalized_text", "C"));

    await storage.deleteDocument("doc-1");

    expect(await storage.get("a")).toBeNull();
    expect(await storage.get("b")).toBeNull();
    expect((await storage.get("c"))?.data).toBe("C");
  });

  it("uses memory only when IndexedDB is unavailable", async () => {
    const fallback = new MemoryDocumentAssetStorage();
    const storage = new BrowserDocumentAssetStorage(null, fallback);
    await storage.put(asset("text", "doc-1", "normalized_text", "0123456789"));

    expect(await storage.readTextRange("text", -5, 4)).toBe("0123");
    expect((await fallback.get("text"))?.data).toBe("0123456789");
  });

  it("surfaces IndexedDB failures instead of silently writing to memory", async () => {
    const fallback = new MemoryDocumentAssetStorage();
    const storage = new BrowserDocumentAssetStorage(createFailingIndexedDb(), fallback);

    await expect(storage.put(asset("text", "doc-1", "normalized_text", "content")))
      .rejects.toThrow("database is blocked");
    expect(await fallback.get("text")).toBeNull();
  });

  it("does not report a write as persisted before its transaction commits", async () => {
    const indexedDb = createWorkingIndexedDb({ abortWrites: true });
    const storage = new BrowserDocumentAssetStorage(indexedDb.factory);

    await expect(storage.put(asset("text", "doc-1", "normalized_text", "content")))
      .rejects.toThrow("commit failed");
  });

  it("strips password and diagnostic fields before persistence", () => {
    const record = createDocumentAssetRecord({
      id: "pdf",
      documentId: "doc-1",
      projectId: "project-1",
      kind: "original",
      mimeType: "application/pdf",
      data: new Blob(["%PDF"]),
      contentHash: "sha256:pdf",
      password: "secret",
      debugLog: "full extracted text",
    } as never);

    expect(record).not.toHaveProperty("password");
    expect(record).not.toHaveProperty("debugLog");
  });
});
