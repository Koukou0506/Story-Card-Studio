import { SillyTavernWorldInfoAdapter } from "../../../src/adapters/sillytavern-world-info";
import { CharacterCardV2Schema } from "../../../src/domain/character-card";
import { LorebookSchema } from "../../../src/domain/lorebook";
import { StyleRiskAnalysisReportSchema } from "../../../src/domain/style-risk";
import { SILLYTAVERN_EXTENSION_VERSION, type ChatRange, type ExtensionTool, type IntegrationTask, type SillyTavernContextSnapshot } from "../../../src/integrations/sillytavern/contracts";
import { createProjectAssociation } from "./association";
import { StoryCardStudioClient } from "./api-client";
import { buildContextSnapshot, fingerprintValue, registerContextEvents } from "./context-adapter";
import { createCharacterDiff, createWorldInfoDiff, downloadJson } from "./diff";
import { createExtensionPanel, type PanelSettings } from "./panel";
import { ExtensionTokenStore, validateStudioUrl } from "./settings";
import type { SillyTavernContextLike } from "./types";
import { applyTaskResult, saveAssociation } from "./writeback";

const MODULE = "story_card_studio";
let cleanupEvents: (() => void) | null = null;
let root: HTMLElement | null = null;

type StoredSettings = Omit<PanelSettings, "token" | "pastedText"> & { workspaceId: string; debug: boolean };
const defaults: StoredSettings = {
  baseUrl: "http://localhost:3000", projectId: "", workspaceId: "default", persistToken: false,
  includeCharacter: true, includeWorldInfo: true, allowChat: false, range: "recent", count: 4,
  chatRoles: "all", manualStart: 0, manualEnd: 0, groupMembers: [], debug: false,
  diagnosisBaseline: "generic",
};

function getContext(): SillyTavernContextLike {
  const context = window.SillyTavern?.getContext();
  if (!context) throw new Error("当前 SillyTavern 未提供 getContext()。");
  return context;
}

function getSettings(context: SillyTavernContextLike): StoredSettings {
  const all = context.extensionSettings ?? {};
  const value = all[MODULE];
  const settings = { ...defaults, ...(value && typeof value === "object" ? value as Partial<StoredSettings> : {}) };
  all[MODULE] = settings;
  return settings;
}

function persistSettings(context: SillyTavernContextLike, settings: StoredSettings): void {
  if (context.extensionSettings) context.extensionSettings[MODULE] = settings;
  context.saveSettingsDebounced?.();
}

function rangeFrom(settings: StoredSettings): ChatRange {
  const roles = settings.chatRoles === "all" ? undefined : [settings.chatRoles];
  if (settings.range === "last") return { kind: "last", roles };
  if (settings.range === "manual") return { kind: "manual", start: settings.manualStart, end: settings.manualEnd, roles };
  if (settings.range === "full") return { kind: "full", roles };
  return { kind: "recent", count: settings.count, roles };
}

function notify(kind: "success" | "error" | "warning", message: string): void { window.toastr?.[kind]?.(message); }

export async function initializeExtension(): Promise<void> {
  if (root) return;
  const context = getContext();
  const initialSettings = getSettings(context);
  const tokenStore = new ExtensionTokenStore(sessionStorage, localStorage);
  let snapshot: SillyTavernContextSnapshot | null = null;
  let task: IntegrationTask | null = null;
  let stale = false;

  const panel = createExtensionPanel({
    onConnect: () => void connect(),
    onSend: () => void prepareSnapshot(true),
    onAssociate: () => void associateProject(),
    onCancelTask: () => void cancelTask(),
    onRunTool: (tool) => void runTool(tool as ExtensionTool),
    onOpenImport: () => {
      try {
        const config = panel.getSettings();
        window.open(`${validateStudioUrl(config.baseUrl)}/?view=document-ingestion&project=${encodeURIComponent(config.projectId)}`, "_blank", "noopener,noreferrer");
      } catch (error) { notify("error", (error as Error).message); }
    },
    onOpenAssistant: () => void openAssistant(),
    onOpenSettingChange: () => {
      try { const config = panel.getSettings(); window.open(`${validateStudioUrl(config.baseUrl)}/?view=setting-change&project=${encodeURIComponent(config.projectId)}&temporaryContext=sillytavern`, "_blank", "noopener,noreferrer"); }
      catch (error) { notify("error", (error as Error).message); }
    },
    onOpenAssetLibrary: () => {
      try { const config = panel.getSettings(); window.open(`${validateStudioUrl(config.baseUrl)}/?view=asset-library&project=${encodeURIComponent(config.projectId)}&source=sillytavern`, "_blank", "noopener,noreferrer"); }
      catch (error) { notify("error", (error as Error).message); }
    },
    onOpenApp: () => {
      try {
        const config = panel.getSettings();
        window.open(`${validateStudioUrl(config.baseUrl)}/?project=${encodeURIComponent(config.projectId)}`, "_blank", "noopener,noreferrer");
      } catch (error) { notify("error", (error as Error).message); }
    },
  });
  panel.setSettings({ ...initialSettings, token: tokenStore.load() });
  panel.setState({ connection: "unknown", contextLabel: "正在读取", projectLabel: initialSettings.projectId || "未关联", taskLabel: "无任务", preview: "默认仅预览最近 4 条消息，且不会发送聊天。" });
  const toggle = document.createElement("button");
  toggle.type = "button"; toggle.className = "scs-toggle"; toggle.textContent = "SCS"; toggle.setAttribute("aria-label", "打开 Story Card Studio");
  toggle.addEventListener("click", () => panel.element.classList.toggle("scs-open"));
  document.body.append(toggle, panel.element); root = panel.element;

  const currentConfig = () => {
    const ui = panel.getSettings();
    const previous = getSettings(getContext());
    const { token: _token, pastedText: _pastedText, ...persisted } = ui;
    const settings: StoredSettings = { ...previous, ...persisted };
    tokenStore.save(ui.token, ui.persistToken);
    persistSettings(getContext(), settings);
    return { ui, settings, client: new StoryCardStudioClient({ baseUrl: ui.baseUrl, token: ui.token }) };
  };

  async function capture(settings: StoredSettings): Promise<SillyTavernContextSnapshot> {
    let value = await buildContextSnapshot(getContext(), {
      chatRange: rangeFrom(settings), includeWorldInfo: settings.includeWorldInfo,
      includePersona: true, selectedGroupMembers: settings.groupMembers,
    });
    if (!settings.includeCharacter) value = { ...value, character: null };
    if (!settings.allowChat) value = { ...value, chat: { ...value.chat, messages: [], characterCount: 0, participants: [] } };
    return value;
  }

  async function openAssistant() {
    try {
      const { client, settings } = currentConfig();
      const value = await capture(settings);
      const uploaded = settings.projectId ? await client.uploadSnapshot(settings.projectId, value) : null;
      const config = panel.getSettings();
      const query = new URLSearchParams({ view: "assistant", project: config.projectId, temporaryContext: "sillytavern" });
      if (uploaded) query.set("snapshot", uploaded.snapshotId);
      window.open(`${validateStudioUrl(config.baseUrl)}/?${query}`, "_blank", "noopener,noreferrer");
    } catch (error) { notify("error", (error as Error).message); }
  }

  async function refreshContext() {
    const settings = getSettings(getContext());
    snapshot = await capture(settings);
    panel.setState({
      connection: "unknown", contextLabel: snapshot.mode === "group" ? `群聊：${snapshot.group?.name}` : snapshot.character?.name || "未选择角色",
      projectLabel: settings.projectId || "未关联", taskLabel: stale ? "结果可能过期" : task?.status || "无任务",
      preview: `消息 ${snapshot.chat.messages.length} 条 · ${snapshot.chat.characterCount} 字符 · World Info ${snapshot.worldInfo.length} 本`,
    });
  }

  async function connect() {
    try {
      const { client, settings } = currentConfig();
      const info = await client.getInfo(); const projects = await client.getProjects();
      panel.setProjects(projects, settings.projectId);
      panel.setState({ connection: "online", contextLabel: snapshot?.character?.name || snapshot?.group?.name || "未选择角色", projectLabel: settings.projectId || "请选择或创建项目", taskLabel: task?.status || "无任务", preview: `API ${info.apiVersion} · Extension ${SILLYTAVERN_EXTENSION_VERSION}` });
    } catch (error) {
      panel.setState({ connection: "offline", contextLabel: snapshot?.character?.name || snapshot?.group?.name || "本地上下文仍可用", projectLabel: getSettings(getContext()).projectId || "未关联", taskLabel: task?.status || "无任务", preview: (error as Error).message });
    }
  }

  async function prepareSnapshot(confirmSend: boolean) {
    const { settings, ui } = currentConfig(); snapshot = await capture(settings);
    if (ui.pastedText.trim()) {
      const message = { index: 0, role: "assistant" as const, name: "粘贴文本", text: ui.pastedText.trim(), fingerprint: await fingerprintValue({ index: 0, text: ui.pastedText.trim() }) };
      snapshot = { ...snapshot, chat: { ...snapshot.chat, messages: [message], characterCount: message.text.length, participants: [message.name] } };
    }
    const preview = snapshot.chat.messages.map((message) => `${message.name}：${message.text}`).join("\n");
    panel.setState({ connection: "online", contextLabel: snapshot.character?.name || snapshot.group?.name || "无角色", projectLabel: settings.projectId || "未关联", taskLabel: "待确认", preview: `${snapshot.chat.messages.length} 条 / ${snapshot.chat.characterCount} 字符\n${preview.slice(0, 4000)}` });
    if (confirmSend && !window.confirm("确认将预览中的所选角色、World Info 与聊天区块发送到 Story Card Studio？")) throw new Error("用户取消发送。");
    return snapshot;
  }

  async function associateProject() {
    try {
      const { settings } = currentConfig();
      if (!settings.projectId) throw new Error("请先连接服务并选择项目。");
      const value = await capture(settings);
      if (!window.confirm("确认保存轻量项目关联？不会保存令牌、聊天或分析报告。")) return;
      await saveAssociation(getContext(), value, createProjectAssociation({
        projectId: settings.projectId, workspaceId: settings.workspaceId,
        characterFingerprint: value.character?.fingerprint ?? null,
        worldInfoFingerprint: value.worldInfo[0]?.fingerprint ?? null,
      }));
      notify("success", "项目关联已保存。");
    } catch (error) { notify("error", (error as Error).message); }
  }

  async function cancelTask() {
    if (!task || !["pending", "running"].includes(task.status)) { notify("warning", "当前没有可取消的任务。"); return; }
    try { task = await currentConfig().client.cancelTask(task.id); notify("success", "任务已取消。"); }
    catch (error) { notify("error", (error as Error).message); }
  }

  async function runTool(tool: ExtensionTool) {
    try {
      const { client, settings } = currentConfig();
      if (!settings.projectId) {
        const name = snapshot?.character?.name || snapshot?.group?.name || "SillyTavern 项目";
        const created = await client.createProject(name); settings.projectId = created.id; persistSettings(getContext(), settings);
        panel.setProjects([{ id: created.id, name: created.name }], created.id);
      }
      const value = await prepareSnapshot(true); const uploaded = await client.uploadSnapshot(settings.projectId, value);
      task = tool === "style_risk" ? await client.createStyleRiskTask(settings.projectId, uploaded.snapshotId, settings.diagnosisBaseline) : await client.createTask(settings.projectId, uploaded.snapshotId, tool); stale = false;
      panel.setState({ connection: "online", contextLabel: value.character?.name || value.group?.name || "无角色", projectLabel: settings.projectId, taskLabel: task.status, preview: "任务已提交；上下文变化只会标记结果过期，不会自动再次发送。" });
      for (let attempt = 0; attempt < 120 && ["pending", "running"].includes(task.status); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000)); task = await client.getTask(task.id);
      }
      if (!task.result) throw new Error(task.error || (task.status === "cancelled" ? "任务已取消。" : "任务没有返回结果。"));
      showTaskResult(value, task);
    } catch (error) { if ((error as Error).message !== "用户取消发送。") notify("error", (error as Error).message); }
  }

  function showTaskResult(value: SillyTavernContextSnapshot, completed: IntegrationTask) {
    const result = completed.result!; let diffs: Array<{ label: string; kind: string }> = [];
    if (result.kind === "character_card" && value.character) {
      const card = CharacterCardV2Schema.parse(result.payload);
      diffs = createCharacterDiff(value.character.card.data, card.data).map((item) => ({ label: item.path, kind: item.kind }));
    }
    if (result.kind === "lorebook") {
      const book = LorebookSchema.parse(result.payload); const original = value.worldInfo[0]?.data ?? { entries: {} };
      const exported = new SillyTavernWorldInfoAdapter().export(book);
      diffs = createWorldInfoDiff(original, exported.data).map((item) => ({ label: item.path, kind: item.kind }));
    }
    if (result.kind === "style_risk_report") {
      const report = StyleRiskAnalysisReportSchema.parse(result.payload);
      diffs = Object.entries(report.dimensionRisks).map(([label, value]) => ({ label: `${label}: ${value}`, kind: "risk" }));
    }
    if (!diffs.length) diffs = [{ label: "结构化分析结果", kind: "added" }];
    panel.showResult(diffs, () => downloadJson(`story-card-studio-${completed.id}.json`, result.payload), (selected) => void safeWrite(value, completed, selected));
    panel.setState({ connection: "online", contextLabel: value.character?.name || value.group?.name || "无角色", projectLabel: getSettings(getContext()).projectId, taskLabel: stale ? "结果过期" : completed.status, preview: result.warnings.join("\n") || "结果已完成；破坏性差异默认未选择。" });
  }

  async function safeWrite(value: SillyTavernContextSnapshot, completed: IntegrationTask, selected: string[]) {
    if (!selected.length) { notify("warning", "请先选择需要接受的字段或条目。"); return; }
    const confirmed = window.confirm("确认应用所选差异？扩展会重新校验来源指纹；无稳定接口时仅导出。" );
    const outcome = await applyTaskResult(getContext(), value, completed, confirmed, selected);
    notify(outcome === "written" ? "success" : outcome === "blocked" ? "warning" : "success", {
      written: "已写回所选 World Info 条目。", exported: "已安全导出所选结果。", blocked: "原数据已变化，已阻止写回。", cancelled: "已取消写回。",
    }[outcome]);
  }

  cleanupEvents = registerContextEvents(context, (event) => {
    stale = Boolean(task?.result); void refreshContext();
    if (getSettings(getContext()).debug) console.debug(`[StoryCardStudio] context invalidated: ${event}`);
  });
  await refreshContext();
}

export function onActivate() { queueMicrotask(() => void initializeExtension().catch((error) => notify("error", (error as Error).message))); }
export function onDisable() { cleanupEvents?.(); cleanupEvents = null; root?.remove(); root = null; }
