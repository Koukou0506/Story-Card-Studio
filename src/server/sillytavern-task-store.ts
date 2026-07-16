import { IntegrationTaskSchema, SillyTavernContextSnapshotSchema, type ExtensionTool, type IntegrationTask, type IntegrationTaskOptions, type SillyTavernContextSnapshot } from "@/integrations/sillytavern/contracts";

type Runner = (snapshot: SillyTavernContextSnapshot, tool: ExtensionTool, signal: AbortSignal, options: IntegrationTaskOptions) => Promise<NonNullable<IntegrationTask["result"]>>;

export class SillyTavernTaskStore {
  private readonly snapshots = new Map<string, { projectId: string; value: SillyTavernContextSnapshot }>();
  private readonly tasks = new Map<string, IntegrationTask>();
  private readonly controllers = new Map<string, AbortController>();

  saveSnapshot(projectId: string, snapshot: SillyTavernContextSnapshot): void {
    const value = SillyTavernContextSnapshotSchema.parse(snapshot); this.snapshots.set(value.snapshotId, { projectId, value: structuredClone(value) });
    while (this.snapshots.size > 50) this.snapshots.delete(this.snapshots.keys().next().value!);
  }
  getSnapshot(id: string): SillyTavernContextSnapshot | null { return structuredClone(this.snapshots.get(id)?.value ?? null); }
  createTask(projectId: string, snapshotId: string, tool: ExtensionTool, runner: Runner, options: IntegrationTaskOptions = { styleRiskBaseline: "generic" }): IntegrationTask {
    const saved = this.snapshots.get(snapshotId); if (!saved || saved.projectId !== projectId) throw new Error("SillyTavern 上下文快照不存在或不属于当前项目。");
    const now = new Date().toISOString(); const id = `st_task_${crypto.randomUUID()}`; const controller = new AbortController();
    const task = IntegrationTaskSchema.parse({ id, projectId, snapshotId, tool, options, status: "pending", createdAt: now, modifiedAt: now, error: null, result: null });
    this.tasks.set(id, task); this.controllers.set(id, controller);
    queueMicrotask(async () => {
      if (controller.signal.aborted) return;
      this.update(id, { status: "running" });
      try { const result = await runner(structuredClone(saved.value), tool, controller.signal, task.options); if (!controller.signal.aborted) this.update(id, { status: "completed", result }); }
      catch (error) { this.update(id, controller.signal.aborted ? { status: "cancelled", error: null } : { status: "failed", error: error instanceof Error ? error.message : "任务失败" }); }
      finally { this.controllers.delete(id); }
    });
    while (this.tasks.size > 100) this.tasks.delete(this.tasks.keys().next().value!);
    return structuredClone(task);
  }
  getTask(id: string): IntegrationTask | null { return structuredClone(this.tasks.get(id) ?? null); }
  cancelTask(id: string): IntegrationTask | null { const task = this.tasks.get(id); if (!task) return null; this.controllers.get(id)?.abort(); this.update(id, { status: "cancelled", error: null }); return this.getTask(id); }
  private update(id: string, patch: Partial<IntegrationTask>): void { const current = this.tasks.get(id); if (!current) return; this.tasks.set(id, IntegrationTaskSchema.parse({ ...current, ...patch, modifiedAt: new Date().toISOString() })); }
}

export const sillyTavernTaskStore = new SillyTavernTaskStore();
