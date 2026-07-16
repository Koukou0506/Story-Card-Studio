import { ExtensionProjectRecordSchema, ExtensionProjectSummarySchema, IntegrationInfoSchema, IntegrationTaskSchema, SillyTavernContextSnapshotSchema, type ExtensionProjectRecord, type ExtensionProjectSummary, type ExtensionTool, type IntegrationInfo, type IntegrationTask, type IntegrationTaskOptions, type SillyTavernContextSnapshot } from "../../../src/integrations/sillytavern/contracts";
import { validateStudioUrl } from "./settings";

export type StudioClientErrorCode = "unauthorized" | "forbidden" | "offline" | "timeout" | "cancelled" | "conflict" | "schema" | "outdated" | "unsupported" | "server";
export class StudioClientError extends Error { constructor(public readonly code: StudioClientErrorCode, message: string, public readonly status = 0) { super(message); this.name = "StudioClientError"; } }

export class StoryCardStudioClient {
  private readonly baseUrl: string; private readonly token: string; private readonly fetcher: typeof fetch;
  constructor(options: { baseUrl: string; token: string; fetcher?: typeof fetch }) { this.baseUrl = validateStudioUrl(options.baseUrl); this.token = options.token; this.fetcher = options.fetcher ?? fetch; }
  private async request(path: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<unknown> {
    const controller = new AbortController(); const external = init.signal; let timedOut = false;
    const onAbort = () => controller.abort(); external?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      const response = await this.fetcher(`${this.baseUrl}/api/integrations/sillytavern${path}`, { ...init, signal: controller.signal, headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.token}`, ...init.headers } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const code: StudioClientErrorCode = response.status === 401 ? "unauthorized" : response.status === 403 ? "forbidden" : response.status === 409 ? "conflict" : response.status === 426 ? "outdated" : response.status === 422 ? "schema" : "server";
        throw new StudioClientError(code, typeof payload.error === "string" ? payload.error : `Story Card Studio 请求失败 (${response.status})`, response.status);
      }
      return payload;
    } catch (error) {
      if (error instanceof StudioClientError) throw error;
      if (external?.aborted) throw new StudioClientError("cancelled", "请求已取消。");
      if (timedOut) throw new StudioClientError("timeout", "Story Card Studio 请求超时。");
      throw new StudioClientError("offline", "无法连接 Story Card Studio；扩展仍可离线预览和导出。");
    } finally { clearTimeout(timer); external?.removeEventListener("abort", onAbort); }
  }
  async getInfo(signal?: AbortSignal): Promise<IntegrationInfo> { return IntegrationInfoSchema.parse(await this.request("/info", { method: "GET", signal })); }
  async getProjects(signal?: AbortSignal): Promise<ExtensionProjectSummary[]> { const data = await this.request("/projects", { method: "GET", signal }) as { projects?: unknown }; return ExtensionProjectSummarySchema.array().parse(data.projects); }
  async createProject(name: string, signal?: AbortSignal): Promise<ExtensionProjectRecord> { const data = await this.request("/projects", { method: "POST", signal, body: JSON.stringify({ name }) }) as { project?: unknown }; return ExtensionProjectRecordSchema.parse(data.project); }
  async getProject(id: string, signal?: AbortSignal): Promise<ExtensionProjectRecord> { const data = await this.request(`/projects/${encodeURIComponent(id)}`, { method: "GET", signal }) as { project?: unknown }; return ExtensionProjectRecordSchema.parse(data.project); }
  async uploadSnapshot(projectId: string, snapshot: SillyTavernContextSnapshot, signal?: AbortSignal): Promise<{ snapshotId: string }> { const data = await this.request("/snapshots", { method: "POST", signal, body: JSON.stringify({ projectId, snapshot: SillyTavernContextSnapshotSchema.parse(snapshot) }) }) as { snapshotId?: unknown }; if (typeof data.snapshotId !== "string") throw new StudioClientError("schema", "服务返回的快照编号无效。"); return { snapshotId: data.snapshotId }; }
  async createTask(projectId: string, snapshotId: string, tool: ExtensionTool, signal?: AbortSignal, options?: IntegrationTaskOptions): Promise<IntegrationTask> { return IntegrationTaskSchema.parse(await this.request("/tasks", { method: "POST", signal, body: JSON.stringify({ projectId, snapshotId, tool, options }) })); }
  async createStyleRiskTask(projectId: string, snapshotId: string, baseline: IntegrationTaskOptions["styleRiskBaseline"] = "generic", signal?: AbortSignal) { return this.createTask(projectId, snapshotId, "style_risk", signal, { styleRiskBaseline: baseline }); }
  async createCharacterCardDraft(projectId: string, snapshotId: string, signal?: AbortSignal) { return this.createTask(projectId, snapshotId, "character_generate", signal); }
  async createLorebookDraft(projectId: string, snapshotId: string, signal?: AbortSignal) { return this.createTask(projectId, snapshotId, "lorebook_generate", signal); }
  async createPlotAnalysisTask(projectId: string, snapshotId: string, signal?: AbortSignal) { return this.createTask(projectId, snapshotId, "plot_analysis", signal); }
  async getTask(id: string, signal?: AbortSignal): Promise<IntegrationTask> { return IntegrationTaskSchema.parse(await this.request(`/tasks/${encodeURIComponent(id)}`, { method: "GET", signal })); }
  async cancelTask(id: string, signal?: AbortSignal): Promise<IntegrationTask> { return IntegrationTaskSchema.parse(await this.request(`/tasks/${encodeURIComponent(id)}`, { method: "DELETE", signal })); }
  async getResult(id: string, signal?: AbortSignal): Promise<IntegrationTask["result"]> { return (await this.getTask(id, signal)).result; }
  async createWritebackPreview(id: string, signal?: AbortSignal): Promise<unknown> { return this.request(`/tasks/${encodeURIComponent(id)}/preview`, { method: "POST", signal, body: "{}" }); }
}
