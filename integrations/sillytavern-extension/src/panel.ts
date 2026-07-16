export interface PanelState {
  connection: "unknown" | "online" | "offline";
  contextLabel: string;
  projectLabel: string;
  taskLabel: string;
  preview: string;
}

export interface PanelSettings {
  baseUrl: string;
  token: string;
  persistToken: boolean;
  includeCharacter: boolean;
  includeWorldInfo: boolean;
  allowChat: boolean;
  range: string;
  chatRoles: "all" | "assistant" | "user";
  count: number;
  manualStart: number;
  manualEnd: number;
  groupMembers: string[];
  diagnosisBaseline: "generic" | "project" | "personal" | "character";
  pastedText: string;
  projectId: string;
}

interface PanelActions {
  onConnect(): void;
  onSend(): void;
  onRunTool(tool: string): void;
  onOpenApp(): void;
  onOpenImport?(): void;
  onOpenAssistant?(): void;
  onOpenSettingChange?(): void;
  onOpenAssetLibrary?(): void;
  onAssociate?(): void;
  onCancelTask?(): void;
}

export function createExtensionPanel(actions: PanelActions) {
  const root = document.createElement("section");
  root.id = "story-card-studio-extension";
  root.className = "scs-panel";
  root.setAttribute("aria-label", "Story Card Studio");
  const title = document.createElement("h3"); title.textContent = "Story Card Studio"; root.append(title);
  const status = document.createElement("p"); status.className = "scs-status"; root.append(status);
  const settings = document.createElement("details");
  const settingsSummary = document.createElement("summary"); settingsSummary.textContent = "连接与隐私设置"; settings.append(settingsSummary); root.append(settings);
  const field = (label: string, input: HTMLInputElement | HTMLSelectElement) => {
    const wrapper = document.createElement("label"); wrapper.className = "scs-field";
    const text = document.createElement("span"); text.textContent = label;
    wrapper.append(text, input); settings.append(wrapper); return input;
  };
  const baseUrl = field("Story Card Studio 地址", Object.assign(document.createElement("input"), { type: "url", value: "http://localhost:3000" })) as HTMLInputElement;
  const token = field("工作区访问令牌", Object.assign(document.createElement("input"), { type: "password", autocomplete: "off" })) as HTMLInputElement;
  const persistToken = field("明确允许持久保存令牌", Object.assign(document.createElement("input"), { type: "checkbox" })) as HTMLInputElement;
  const includeCharacter = field("发送当前角色", Object.assign(document.createElement("input"), { type: "checkbox", checked: true })) as HTMLInputElement;
  const includeWorldInfo = field("发送当前 World Info", Object.assign(document.createElement("input"), { type: "checkbox", checked: true })) as HTMLInputElement;
  const allowChat = field("允许发送所选聊天", Object.assign(document.createElement("input"), { type: "checkbox" })) as HTMLInputElement;
  const range = document.createElement("select");
  [["last", "最近一条"], ["recent", "最近 N 条"], ["manual", "手动范围"], ["full", "完整聊天（不推荐）"]].forEach(([value, label]) => range.add(new Option(label, value)));
  field("聊天范围", range);
  const chatRoles = document.createElement("select"); [["all", "用户与角色"], ["assistant", "仅角色回复"], ["user", "仅用户消息"]].forEach(([value, label]) => chatRoles.add(new Option(label, value))); field("消息角色", chatRoles);
  const count = field("最近消息数量", Object.assign(document.createElement("input"), { type: "number", min: "1", max: "200", value: "4" })) as HTMLInputElement;
  const manualStart = field("手动范围起点（从 0 开始）", Object.assign(document.createElement("input"), { type: "number", min: "0", value: "0" })) as HTMLInputElement;
  const manualEnd = field("手动范围终点", Object.assign(document.createElement("input"), { type: "number", min: "0", value: "0" })) as HTMLInputElement;
  const groupMembers = field("群聊成员（逗号分隔，留空为全部）", Object.assign(document.createElement("input"), { type: "text" })) as HTMLInputElement;
  const diagnosisBaseline = document.createElement("select");
  [["generic", "通用中文小说"], ["project", "当前项目文风"], ["personal", "个人样本"], ["character", "当前角色语言"]].forEach(([value, label]) => diagnosisBaseline.add(new Option(label, value)));
  field("诊断基准", diagnosisBaseline);
  const pastedText = document.createElement("textarea"); pastedText.rows = 4; pastedText.placeholder = "可选：粘贴文本将替代聊天范围用于诊断";
  const pastedWrapper = document.createElement("label"); pastedWrapper.className = "scs-field"; const pastedLabel = document.createElement("span"); pastedLabel.textContent = "诊断粘贴文本"; pastedWrapper.append(pastedLabel, pastedText); settings.append(pastedWrapper);
  const projectSelect = document.createElement("select"); projectSelect.add(new Option("未关联项目", "")); field("Story Card Studio 项目", projectSelect);

  const context = document.createElement("p"); const project = document.createElement("p"); const task = document.createElement("p"); root.append(context, project, task);
  const preview = document.createElement("pre"); preview.className = "scs-preview"; preview.setAttribute("aria-live", "polite"); root.append(preview);
  const controls = document.createElement("div"); controls.className = "scs-actions"; root.append(controls);
  const addButton = (label: string, action: string, handler: () => void) => {
    const button = document.createElement("button"); button.type = "button"; button.textContent = label; button.dataset.action = action;
    button.addEventListener("click", handler); controls.append(button); return button;
  };
  addButton("测试连接", "connect", actions.onConnect);
  addButton("发送预览", "send", actions.onSend);
  if (actions.onAssociate) addButton("保存项目关联", "associate", actions.onAssociate);
  addButton("完善角色卡", "character_generate", () => actions.onRunTool("character_generate"));
  addButton("完善世界书", "lorebook_generate", () => actions.onRunTool("lorebook_generate"));
  addButton("人物契合度", "character_fit", () => actions.onRunTool("character_fit"));
  addButton("剧情分析", "plot_analysis", () => actions.onRunTool("plot_analysis"));
  addButton("连续性分析", "continuity_analysis", () => actions.onRunTool("continuity_analysis"));
  addButton("诊断选定文本的 AI 味与机械感", "style_risk", () => actions.onRunTool("style_risk"));
  if (actions.onCancelTask) addButton("取消任务", "cancel-task", actions.onCancelTask);
  if (actions.onOpenImport) addButton("打开作品导入与重建", "open-work-import", actions.onOpenImport);
  if (actions.onOpenAssistant) addButton("打开项目助手", "open-project-assistant", actions.onOpenAssistant);
  if (actions.onOpenSettingChange) addButton("创建设定变更提案", "open-setting-change", actions.onOpenSettingChange);
  if (actions.onOpenAssetLibrary) addButton("浏览角色卡与世界书素材", "open-asset-library", actions.onOpenAssetLibrary);
  addButton("打开独立 APP", "open-app", actions.onOpenApp);
  const result = document.createElement("section"); result.className = "scs-result"; root.append(result);

  return {
    element: root,
    setState(state: PanelState) {
      status.textContent = state.connection === "online" ? "服务已连接" : state.connection === "offline" ? "服务离线" : "尚未测试连接";
      context.textContent = `当前上下文：${state.contextLabel}`;
      project.textContent = `关联项目：${state.projectLabel}`;
      task.textContent = `任务：${state.taskLabel}`;
      preview.textContent = state.preview;
    },
    getSettings(): PanelSettings {
      return {
        baseUrl: baseUrl.value, token: token.value, persistToken: persistToken.checked, includeCharacter: includeCharacter.checked, includeWorldInfo: includeWorldInfo.checked, allowChat: allowChat.checked,
        range: range.value, chatRoles: chatRoles.value as PanelSettings["chatRoles"], count: Math.max(1, Math.min(200, Number(count.value) || 4)),
        manualStart: Math.max(0, Number(manualStart.value) || 0), manualEnd: Math.max(0, Number(manualEnd.value) || 0),
        groupMembers: groupMembers.value.split(",").map((item) => item.trim()).filter(Boolean), diagnosisBaseline: diagnosisBaseline.value as PanelSettings["diagnosisBaseline"], pastedText: pastedText.value, projectId: projectSelect.value,
      };
    },
    setSettings(value: Partial<PanelSettings>) {
      if (value.baseUrl !== undefined) baseUrl.value = value.baseUrl;
      if (value.token !== undefined) token.value = value.token;
      if (value.persistToken !== undefined) persistToken.checked = value.persistToken;
      if (value.includeCharacter !== undefined) includeCharacter.checked = value.includeCharacter;
      if (value.includeWorldInfo !== undefined) includeWorldInfo.checked = value.includeWorldInfo;
      if (value.allowChat !== undefined) allowChat.checked = value.allowChat;
      if (value.range !== undefined) range.value = value.range;
      if (value.chatRoles !== undefined) chatRoles.value = value.chatRoles;
      if (value.count !== undefined) count.value = String(value.count);
      if (value.manualStart !== undefined) manualStart.value = String(value.manualStart);
      if (value.manualEnd !== undefined) manualEnd.value = String(value.manualEnd);
      if (value.groupMembers !== undefined) groupMembers.value = value.groupMembers.join(", ");
      if (value.diagnosisBaseline !== undefined) diagnosisBaseline.value = value.diagnosisBaseline;
      if (value.pastedText !== undefined) pastedText.value = value.pastedText;
      if (value.projectId !== undefined) projectSelect.value = value.projectId;
    },
    setProjects(projects: Array<{ id: string; name: string }>, selected = "") {
      projectSelect.replaceChildren(new Option("新建或选择项目", ""), ...projects.map((item) => new Option(item.name, item.id)));
      projectSelect.value = selected;
    },
    showResult(items: Array<{ label: string; kind: string }>, onExport: () => void, onWrite: (selected: string[]) => void) {
      result.replaceChildren(); const heading = document.createElement("h4"); heading.textContent = "结果与差异"; result.append(heading);
      const choices: Array<{ input: HTMLInputElement; label: string }> = [];
      items.forEach((item) => {
        const row = document.createElement("label"); row.className = "scs-diff";
        const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = false;
        const text = document.createElement("span"); text.textContent = `${item.kind} · ${item.label}`;
        row.append(checkbox, text); result.append(row); choices.push({ input: checkbox, label: item.label });
      });
      const acceptAll = document.createElement("button"); acceptAll.type = "button"; acceptAll.textContent = "全部选择"; acceptAll.addEventListener("click", () => choices.forEach(({ input }) => { input.checked = true; }));
      const exportButton = document.createElement("button"); exportButton.type = "button"; exportButton.textContent = "导出完整结果"; exportButton.addEventListener("click", onExport);
      const writeButton = document.createElement("button"); writeButton.type = "button"; writeButton.textContent = "确认所选并安全写回";
      writeButton.addEventListener("click", () => onWrite(choices.filter(({ input }) => input.checked).map(({ label }) => label)));
      result.append(acceptAll, exportButton, writeButton);
    },
  };
}
