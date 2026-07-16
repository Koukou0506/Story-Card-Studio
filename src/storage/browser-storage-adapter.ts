import { migrateProjectDraft, type ProjectDraft } from "@/domain/project-draft";
import {
  StorageCapacityError,
  StorageConflictError,
  WorkspaceProjectRecordSchema,
  createProjectRecord,
  projectSummary,
  type ProjectStorageAdapter,
  type StorageHealth,
  type WorkspaceProjectRecord,
  type WorkspaceProjectSummary,
} from "./types";

const DATABASE_NAME = "story-card-studio";
const STORE_NAME = "projects";
const DATABASE_VERSION = 1;
const FALLBACK_PREFIX = "story-card-studio-project:";
export const LEGACY_DRAFT_KEY = "story-card-studio-draft";

function clone<T>(value: T): T { return structuredClone(value); }

export class BrowserProjectStorage implements ProjectStorageAdapter {
  private database: Promise<IDBDatabase> | null = null;

  constructor(
    private readonly browserStorage: Storage | null = typeof window !== "undefined" ? window.localStorage : null,
    private readonly idbFactory: IDBFactory | null = typeof indexedDB !== "undefined" ? indexedDB : null,
  ) {}

  private open(): Promise<IDBDatabase> {
    if (!this.idbFactory) return Promise.reject(new Error("IndexedDB unavailable"));
    if (!this.database) {
      this.database = new Promise((resolve, reject) => {
        const request = this.idbFactory!.open(DATABASE_NAME, DATABASE_VERSION);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("无法打开 IndexedDB。"));
        request.onblocked = () => reject(new Error("IndexedDB 升级被其他页面阻塞。请关闭旧页面后重试。"));
      });
    }
    return this.database;
  }

  private async idbRequest<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = action(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("本机数据库操作失败。"));
      transaction.onabort = () => reject(transaction.error ?? new Error("本机数据库写入已中止。"));
    });
  }

  private fallbackRecords(): WorkspaceProjectRecord[] {
    if (!this.browserStorage) return [];
    const records: WorkspaceProjectRecord[] = [];
    for (let index = 0; index < this.browserStorage.length; index += 1) {
      const key = this.browserStorage.key(index);
      if (!key?.startsWith(FALLBACK_PREFIX)) continue;
      try { records.push(WorkspaceProjectRecordSchema.parse(JSON.parse(this.browserStorage.getItem(key) ?? "null"))); } catch { /* recovery remains available */ }
    }
    return records;
  }

  private fallbackWrite(record: WorkspaceProjectRecord): WorkspaceProjectRecord {
    if (!this.browserStorage) throw new Error("浏览器本机存储不可用。");
    try { this.browserStorage.setItem(`${FALLBACK_PREFIX}${record.id}`, JSON.stringify(record)); }
    catch (error) {
      if (error instanceof DOMException && ["QuotaExceededError", "NS_ERROR_DOM_QUOTA_REACHED"].includes(error.name)) throw new StorageCapacityError();
      throw error;
    }
    return clone(record);
  }

  async listProjects(): Promise<WorkspaceProjectSummary[]> {
    let records: WorkspaceProjectRecord[];
    try { records = await this.idbRequest("readonly", (store) => store.getAll()); }
    catch { records = this.fallbackRecords(); }
    return records.map((record) => projectSummary(WorkspaceProjectRecordSchema.parse(record))).sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  }

  async readProject(id: string): Promise<WorkspaceProjectRecord | null> {
    try {
      const record = await this.idbRequest<WorkspaceProjectRecord | undefined>("readonly", (store) => store.get(id));
      return record ? WorkspaceProjectRecordSchema.parse(record) : null;
    } catch {
      const raw = this.browserStorage?.getItem(`${FALLBACK_PREFIX}${id}`);
      return raw ? WorkspaceProjectRecordSchema.parse(JSON.parse(raw)) : null;
    }
  }

  async createProject(record: WorkspaceProjectRecord): Promise<WorkspaceProjectRecord> {
    const existing = await this.readProject(record.id);
    if (existing) throw new StorageConflictError(existing, "同名项目已经存在。");
    const value = WorkspaceProjectRecordSchema.parse({ ...clone(record), version: 1 });
    try { await this.idbRequest("readwrite", (store) => store.add(value)); return clone(value); }
    catch (error) {
      if (error instanceof DOMException && error.name === "QuotaExceededError") throw new StorageCapacityError();
      return this.fallbackWrite(value);
    }
  }

  async updateProject(id: string, draft: ProjectDraft, expectedVersion: number): Promise<WorkspaceProjectRecord> {
    const current = await this.readProject(id);
    if (!current || current.version !== expectedVersion) throw new StorageConflictError(current);
    const next = WorkspaceProjectRecordSchema.parse({ ...current, name: draft.projectInput.projectName.trim() || current.name, draft: clone(draft), version: current.version + 1, modifiedAt: new Date().toISOString() });
    try { await this.idbRequest("readwrite", (store) => store.put(next)); return clone(next); }
    catch (error) {
      if (error instanceof DOMException && error.name === "QuotaExceededError") throw new StorageCapacityError();
      return this.fallbackWrite(next);
    }
  }

  async deleteProject(id: string, expectedVersion: number): Promise<void> {
    const current = await this.readProject(id);
    if (!current || current.version !== expectedVersion) throw new StorageConflictError(current);
    try { await this.idbRequest("readwrite", (store) => store.delete(id)); }
    catch { this.browserStorage?.removeItem(`${FALLBACK_PREFIX}${id}`); }
  }

  async backupProject(id: string): Promise<string> {
    const record = await this.readProject(id);
    if (!record) throw new Error("项目不存在，无法备份。");
    return JSON.stringify(record, null, 2);
  }

  async healthCheck(): Promise<StorageHealth> {
    try { await this.open(); return { ok: true, mode: "indexeddb", message: "IndexedDB 本机项目库可用。" }; }
    catch { return { ok: Boolean(this.browserStorage), mode: "localstorage", message: this.browserStorage ? "IndexedDB 不可用，已使用 localStorage 恢复模式。" : "浏览器本机存储不可用。" }; }
  }

  async migrateLegacyProject(id = "default"): Promise<WorkspaceProjectRecord | null> {
    const existing = await this.readProject(id);
    if (existing) return existing;
    const raw = this.browserStorage?.getItem(LEGACY_DRAFT_KEY);
    if (!raw) return null;
    try {
      const draft = migrateProjectDraft(JSON.parse(raw));
      return await this.createProject(createProjectRecord(id, draft));
    } catch {
      return null;
    }
  }
}

