import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { ProjectDraft } from "@/domain/project-draft";
import {
  StorageConflictError,
  WorkspaceProjectRecordSchema,
  projectSummary,
  type ProjectStorageAdapter,
  type StorageHealth,
  type WorkspaceProjectRecord,
  type WorkspaceProjectSummary,
} from "@/storage/types";

const PROJECT_ID = /^[a-zA-Z0-9_-]{1,120}$/;

export class ServerFileWorkspaceStore implements ProjectStorageAdapter {
  constructor(private readonly directory: string) {}

  private file(id: string): string {
    if (!PROJECT_ID.test(id)) throw new Error("项目 ID 含有不安全字符。");
    return join(this.directory, `${id}.json`);
  }

  private async ensureDirectory(): Promise<void> { await mkdir(this.directory, { recursive: true }); }

  async listProjects(): Promise<WorkspaceProjectSummary[]> {
    await this.ensureDirectory();
    const files = (await readdir(this.directory)).filter((name) => name.endsWith(".json") && !name.includes(".tmp-"));
    const values = await Promise.all(files.map((name) => this.readProject(name.slice(0, -5))));
    return values.filter((value): value is WorkspaceProjectRecord => Boolean(value)).map(projectSummary).sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  }

  async readProject(id: string): Promise<WorkspaceProjectRecord | null> {
    await this.ensureDirectory();
    try { return WorkspaceProjectRecordSchema.parse(JSON.parse(await readFile(this.file(id), "utf8"))); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async createProject(record: WorkspaceProjectRecord): Promise<WorkspaceProjectRecord> {
    const existing = await this.readProject(record.id);
    if (existing) throw new StorageConflictError(existing, "同名项目已经存在。");
    const value = WorkspaceProjectRecordSchema.parse({ ...structuredClone(record), version: 1, origin: "server" });
    await this.atomicWrite(value);
    return structuredClone(value);
  }

  async updateProject(id: string, draft: ProjectDraft, expectedVersion: number): Promise<WorkspaceProjectRecord> {
    const current = await this.readProject(id);
    if (!current || current.version !== expectedVersion) throw new StorageConflictError(current);
    const next = WorkspaceProjectRecordSchema.parse({ ...current, name: draft.projectInput.projectName.trim() || current.name, draft: structuredClone(draft), version: current.version + 1, modifiedAt: new Date().toISOString(), origin: "server" });
    await this.atomicWrite(next);
    return structuredClone(next);
  }

  async deleteProject(id: string, expectedVersion: number): Promise<void> {
    const current = await this.readProject(id);
    if (!current || current.version !== expectedVersion) throw new StorageConflictError(current);
    await unlink(this.file(id));
  }

  async backupProject(id: string): Promise<string> {
    const current = await this.readProject(id);
    if (!current) throw new Error("项目不存在，无法备份。");
    return JSON.stringify(current, null, 2);
  }

  async healthCheck(): Promise<StorageHealth> {
    try { await this.ensureDirectory(); return { ok: true, mode: "server", message: "工作区服务器存储可用。" }; }
    catch { return { ok: false, mode: "server", message: "工作区目录不可写。" }; }
  }

  private async atomicWrite(record: WorkspaceProjectRecord): Promise<void> {
    await this.ensureDirectory();
    const target = this.file(record.id);
    const temporary = join(this.directory, `${record.id}.tmp-${randomUUID()}`);
    await writeFile(temporary, JSON.stringify(record), { encoding: "utf8", flag: "wx" });
    await rename(temporary, target);
  }
}

export function getWorkspaceStore(): ServerFileWorkspaceStore {
  return new ServerFileWorkspaceStore(process.env.WORKSPACE_DATA_DIR || join(process.cwd(), ".workspace-data"));
}
