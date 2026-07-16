import type { ProjectDraft } from "@/domain/project-draft";
import {
  StorageConflictError,
  WorkspaceProjectRecordSchema,
  type ProjectStorageAdapter,
  type StorageHealth,
  type WorkspaceProjectRecord,
  type WorkspaceProjectSummary,
} from "./types";

type Fetcher = typeof fetch;

export class ServerWorkspaceAdapter implements ProjectStorageAdapter {
  private csrf = "";
  constructor(private readonly baseUrl = "/api/workspace", private readonly fetcher: Fetcher = fetch) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      ...init,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(this.csrf ? { "x-csrf-token": this.csrf } : {}), ...init?.headers },
    });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 409) throw new StorageConflictError(payload.current ? WorkspaceProjectRecordSchema.parse(payload.current) : null, payload.error);
    if (!response.ok) throw new Error(payload.error || `工作区请求失败 (${response.status})`);
    return payload as T;
  }

  async login(accessToken: string): Promise<void> {
    const result = await this.request<{ csrf: string }>("/session", { method: "POST", body: JSON.stringify({ accessToken }) });
    this.csrf = result.csrf;
  }

  async logout(): Promise<void> {
    await this.request("/session", { method: "DELETE" });
    this.csrf = "";
  }

  async listProjects(): Promise<WorkspaceProjectSummary[]> { return (await this.request<{ projects: WorkspaceProjectSummary[] }>("/projects")).projects; }
  async readProject(id: string): Promise<WorkspaceProjectRecord | null> { return (await this.request<{ project: WorkspaceProjectRecord | null }>(`/projects/${encodeURIComponent(id)}`)).project; }
  async createProject(record: WorkspaceProjectRecord): Promise<WorkspaceProjectRecord> { return (await this.request<{ project: WorkspaceProjectRecord }>("/projects", { method: "POST", body: JSON.stringify({ record }) })).project; }
  async updateProject(id: string, draft: ProjectDraft, expectedVersion: number): Promise<WorkspaceProjectRecord> { return (await this.request<{ project: WorkspaceProjectRecord }>(`/projects/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify({ draft, expectedVersion }) })).project; }
  async deleteProject(id: string, expectedVersion: number): Promise<void> { await this.request(`/projects/${encodeURIComponent(id)}`, { method: "DELETE", body: JSON.stringify({ expectedVersion }) }); }
  async backupProject(id: string): Promise<string> { return (await this.request<{ backup: string }>(`/projects/${encodeURIComponent(id)}/backup`)).backup; }
  async healthCheck(): Promise<StorageHealth> { return this.request<StorageHealth>("/health"); }
}
