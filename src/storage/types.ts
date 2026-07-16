import { z } from "zod";
import { ProjectDraftSchema, type ProjectDraft } from "@/domain/project-draft";

export const WorkspaceProjectOriginSchema = z.enum(["local", "server", "conflict_copy"]);
export type WorkspaceProjectOrigin = z.infer<typeof WorkspaceProjectOriginSchema>;

export const WorkspaceProjectRecordSchema = z.object({
  id: z.string().min(1).max(120).regex(/^[a-zA-Z0-9_-]+$/),
  name: z.string().min(1).max(200),
  draft: ProjectDraftSchema,
  version: z.number().int().positive(),
  modifiedAt: z.string(),
  origin: WorkspaceProjectOriginSchema.default("local"),
});

export type WorkspaceProjectRecord = z.infer<typeof WorkspaceProjectRecordSchema>;
export type WorkspaceProjectSummary = Omit<WorkspaceProjectRecord, "draft">;
export type StorageHealth = { ok: boolean; mode: "memory" | "indexeddb" | "localstorage" | "server"; message: string };

export interface ProjectStorageAdapter {
  listProjects(): Promise<WorkspaceProjectSummary[]>;
  readProject(id: string): Promise<WorkspaceProjectRecord | null>;
  createProject(record: WorkspaceProjectRecord): Promise<WorkspaceProjectRecord>;
  updateProject(id: string, draft: ProjectDraft, expectedVersion: number): Promise<WorkspaceProjectRecord>;
  deleteProject(id: string, expectedVersion: number): Promise<void>;
  backupProject(id: string): Promise<string>;
  healthCheck(): Promise<StorageHealth>;
}

export class StorageConflictError extends Error {
  readonly code = "storage_conflict";
  constructor(public readonly current: WorkspaceProjectRecord | null, message = "项目已在另一客户端更新，当前保存已停止。") {
    super(message);
    this.name = "StorageConflictError";
  }
}

export class StorageCapacityError extends Error {
  readonly code = "storage_capacity";
  constructor(message = "本机存储空间不足。请先导出项目备份，再清理浏览器存储空间。") {
    super(message);
    this.name = "StorageCapacityError";
  }
}

export function createProjectRecord(id: string, draft: ProjectDraft, origin: WorkspaceProjectOrigin = "local"): WorkspaceProjectRecord {
  return WorkspaceProjectRecordSchema.parse({
    id,
    name: draft.projectInput.projectName.trim() || "未命名项目",
    draft,
    version: 1,
    modifiedAt: draft.savedAt || new Date().toISOString(),
    origin,
  });
}

export function createConflictProjectCopy(record: WorkspaceProjectRecord, now = new Date()): WorkspaceProjectRecord {
  const stamp = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return WorkspaceProjectRecordSchema.parse({
    ...structuredClone(record),
    id: `${record.id}-conflict-${stamp}`,
    name: `${record.name}（冲突副本 ${now.toLocaleString("zh-CN", { hour12: false })}）`,
    version: 1,
    modifiedAt: now.toISOString(),
    origin: "conflict_copy",
  });
}

export function projectSummary(record: WorkspaceProjectRecord): WorkspaceProjectSummary {
  const { draft: _draft, ...summary } = record;
  return summary;
}

