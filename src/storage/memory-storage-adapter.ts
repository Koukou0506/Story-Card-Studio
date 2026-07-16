import type { ProjectDraft } from "@/domain/project-draft";
import {
  StorageConflictError,
  WorkspaceProjectRecordSchema,
  projectSummary,
  type ProjectStorageAdapter,
  type StorageHealth,
  type WorkspaceProjectRecord,
  type WorkspaceProjectSummary,
} from "./types";

export class MemoryProjectStorage implements ProjectStorageAdapter {
  protected readonly projects = new Map<string, WorkspaceProjectRecord>();

  async listProjects(): Promise<WorkspaceProjectSummary[]> {
    return [...this.projects.values()].map((item) => projectSummary(structuredClone(item))).sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  }

  async readProject(id: string): Promise<WorkspaceProjectRecord | null> {
    const value = this.projects.get(id);
    return value ? structuredClone(value) : null;
  }

  async createProject(record: WorkspaceProjectRecord): Promise<WorkspaceProjectRecord> {
    if (this.projects.has(record.id)) throw new StorageConflictError(await this.readProject(record.id), "同名项目已经存在。");
    const value = WorkspaceProjectRecordSchema.parse({ ...structuredClone(record), version: 1 });
    this.projects.set(value.id, value);
    return structuredClone(value);
  }

  async updateProject(id: string, draft: ProjectDraft, expectedVersion: number): Promise<WorkspaceProjectRecord> {
    const current = this.projects.get(id) ?? null;
    if (!current || current.version !== expectedVersion) throw new StorageConflictError(current ? structuredClone(current) : null);
    const next = WorkspaceProjectRecordSchema.parse({
      ...current,
      name: draft.projectInput.projectName.trim() || current.name,
      draft: structuredClone(draft),
      version: current.version + 1,
      modifiedAt: new Date().toISOString(),
    });
    this.projects.set(id, next);
    return structuredClone(next);
  }

  async deleteProject(id: string, expectedVersion: number): Promise<void> {
    const current = this.projects.get(id) ?? null;
    if (!current || current.version !== expectedVersion) throw new StorageConflictError(current ? structuredClone(current) : null);
    this.projects.delete(id);
  }

  async backupProject(id: string): Promise<string> {
    const record = await this.readProject(id);
    if (!record) throw new Error("项目不存在，无法备份。");
    return JSON.stringify(record, null, 2);
  }

  async healthCheck(): Promise<StorageHealth> {
    return { ok: true, mode: "memory", message: "内存工作区可用。" };
  }
}

