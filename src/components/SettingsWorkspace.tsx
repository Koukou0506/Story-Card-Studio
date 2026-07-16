"use client";

import { useRef, useState } from "react";
import type { ProjectDraft } from "@/domain/project-draft";
import { ServerWorkspaceAdapter, StorageConflictError, createConflictProjectCopy, createProjectRecord, type WorkspaceProjectRecord, type WorkspaceProjectSummary } from "@/storage";

interface SettingsWorkspaceProps {
  density: "comfortable" | "compact";
  onDensityChange: (density: "comfortable" | "compact") => void;
  projectVersion: number;
  savedAt: string;
  hasRecovery: boolean;
  onExportRecovery: () => void;
  onClearProject: () => void;
  draft: ProjectDraft;
  onReplaceDraft: (draft: ProjectDraft) => void;
  installAvailable: boolean;
  installed: boolean;
  onInstall: () => void;
  localStorageVersion: number;
}

export function SettingsWorkspace({
  density,
  onDensityChange,
  projectVersion,
  savedAt,
  hasRecovery,
  onExportRecovery,
  onClearProject,
  draft,
  onReplaceDraft,
  installAvailable,
  installed,
  onInstall,
  localStorageVersion,
}: SettingsWorkspaceProps) {
  const adapter = useRef(new ServerWorkspaceAdapter());
  const [accessToken, setAccessToken] = useState("");
  const [workspaceProjects, setWorkspaceProjects] = useState<WorkspaceProjectSummary[]>([]);
  const [remoteProject, setRemoteProject] = useState<WorkspaceProjectRecord | null>(null);
  const [workspaceMessage, setWorkspaceMessage] = useState("工作区模式尚未连接。");
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [conflict, setConflict] = useState<WorkspaceProjectRecord | null>(null);

  const refreshProjects = async () => {
    const projects = await adapter.current.listProjects(); setWorkspaceProjects(projects);
    if (remoteProject) setRemoteProject(await adapter.current.readProject(remoteProject.id));
  };

  const login = async () => {
    setWorkspaceBusy(true);
    try { await adapter.current.login(accessToken); setAccessToken(""); await refreshProjects(); setWorkspaceMessage("工作区已连接；访问令牌未写入浏览器存储。"); }
    catch (error) { setWorkspaceMessage((error as Error).message); }
    finally { setWorkspaceBusy(false); }
  };

  const saveToWorkspace = async () => {
    setWorkspaceBusy(true); setConflict(null);
    try {
      const value = remoteProject
        ? await adapter.current.updateProject(remoteProject.id, draft, remoteProject.version)
        : await adapter.current.createProject(createProjectRecord(`project-${crypto.randomUUID()}`, draft, "server"));
      setRemoteProject(value); await refreshProjects(); setWorkspaceMessage(`工作区已保存 v${value.version}。`);
    } catch (error) {
      if (error instanceof StorageConflictError) { setConflict(error.current); setWorkspaceMessage("服务端已有较新版本，当前草稿没有覆盖它。"); }
      else setWorkspaceMessage((error as Error).message);
    } finally { setWorkspaceBusy(false); }
  };

  const preserveConflictCopy = async () => {
    const local = createProjectRecord(`project-${crypto.randomUUID()}`, draft, "conflict_copy");
    const copy = createConflictProjectCopy(local);
    const saved = await adapter.current.createProject(copy);
    setRemoteProject(saved); setConflict(null); await refreshProjects(); setWorkspaceMessage(`本机内容已保存为独立冲突副本：${saved.name}`);
  };

  const downloadRemoteBackup = async () => {
    if (!remoteProject) return;
    const text = await adapter.current.backupProject(remoteProject.id); const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `${remoteProject.name.replace(/[\\/:*?"<>|]/g, "_")}-workspace.json`; link.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="settings-layout">
      <nav className="settings-index" aria-label="设置分区">
        <a href="#settings-project">项目</a>
        <a href="#settings-writing">写作</a>
        <a href="#settings-interface">界面</a>
        <a href="#settings-mobile">移动与 PWA</a>
        <a href="#settings-workspace">工作区</a>
        <a href="#settings-privacy">隐私</a>
        <a href="#settings-danger">危险区</a>
      </nav>

      <div className="settings-content">
        <section id="settings-project" className="settings-section card">
          <div className="card-header"><span>项目与本地数据</span></div>
          <dl className="settings-facts">
            <div><dt>数据版本</dt><dd>v{projectVersion}</dd></div>
            <div><dt>最近保存</dt><dd>{new Date(savedAt).toLocaleString()}</dd></div>
            <div><dt>存储位置</dt><dd>IndexedDB 优先 / localStorage 恢复镜像</dd></div>
          </dl>
          <p className="field-hint">存储记录版本 v{localStorageVersion}；领域数据版本与存储并发版本相互独立。</p>
          <p className="field-hint">清理浏览器数据前请先从“导入导出”创建项目备份。</p>
          {hasRecovery && <button className="btn-secondary" onClick={onExportRecovery}>导出原始恢复数据</button>}
        </section>

        <section id="settings-mobile" className="settings-section card">
          <div className="card-header"><span>移动端与 PWA</span></div>
          <p>{installed ? "当前已以独立 PWA 模式运行。" : "可从浏览器菜单安装到主屏幕；iOS Safari 使用“添加到主屏幕”。"}</p>
          {installAvailable && !installed && <button className="btn-primary" onClick={onInstall}>安装 Story Card Studio</button>}
          {!installAvailable && !installed && <div className="notice">若浏览器未显示安装按钮，请使用浏览器菜单中的“安装应用”或“添加到主屏幕”。</div>}
          <ul className="plain-list"><li>离线可查看、编辑和导出本机项目。</li><li>离线时模型与工作区同步暂停，不会无限重放失败请求。</li><li>应用更新需用户确认，不会自动刷新未保存正文。</li></ul>
        </section>

        <section id="settings-workspace" className="settings-section card">
          <div className="card-header"><span>可选工作区服务器</span></div>
          <p>用于桌面和手机访问同一个用户控制的项目。服务器必须配置 HTTPS、长随机访问令牌和 Origin 白名单；不要无认证暴露到公网。</p>
          <div className="form-grid"><label>单用户访问令牌<input type="password" value={accessToken} autoComplete="current-password" onChange={(event) => setAccessToken(event.target.value)} /></label></div>
          <div className="button-row"><button className="btn-primary" disabled={workspaceBusy || accessToken.length < 1} onClick={() => void login()}>{workspaceBusy ? "连接中…" : "连接工作区"}</button><button className="btn-secondary" disabled={workspaceBusy} onClick={() => void refreshProjects().catch((error) => setWorkspaceMessage((error as Error).message))}>刷新项目</button><button className="btn-secondary" onClick={() => void adapter.current.logout().then(() => { setWorkspaceProjects([]); setRemoteProject(null); setWorkspaceMessage("已登出工作区。"); })}>登出</button></div>
          <div className="notice" role="status">{workspaceMessage}</div>
          {workspaceProjects.length > 0 && <label>服务端项目<select value={remoteProject?.id || ""} onChange={(event) => void adapter.current.readProject(event.target.value).then(setRemoteProject)}><option value="">选择项目</option>{workspaceProjects.map((project) => <option key={project.id} value={project.id}>{project.name} · v{project.version}</option>)}</select></label>}
          <div className="button-row"><button className="btn-primary" disabled={workspaceBusy} onClick={() => void saveToWorkspace()}>{remoteProject ? "按版本同步当前项目" : "创建服务端项目"}</button><button className="btn-secondary" disabled={!remoteProject} onClick={() => { if (remoteProject && confirm(`读取“${remoteProject.name}”并替换当前本机草稿？建议先导出本机备份。`)) onReplaceDraft(remoteProject.draft); }}>读取到本机</button><button className="btn-secondary" disabled={!remoteProject} onClick={() => void downloadRemoteBackup()}>下载服务端备份</button></div>
          {conflict && <div className="global-banner error" role="alert"><div><strong>保存冲突</strong><span>服务端为 v{conflict.version}，修改于 {new Date(conflict.modifiedAt).toLocaleString()}。未执行覆盖。</span></div><button className="btn-secondary" onClick={() => void preserveConflictCopy()}>把本机内容保存为冲突副本</button></div>}
        </section>

        <section id="settings-writing" className="settings-section card">
          <div className="card-header"><span>写作偏好</span></div>
          <p>Style Profile 和 Language Constraint 仍与正文项目一起保存；场景级覆盖不会改变项目默认值。</p>
          <div className="notice">正文画布默认使用无衬线 UI 字体，可在正文工作区切换为系统宋体阅读模式。</div>
        </section>

        <section id="settings-interface" className="settings-section card">
          <div className="card-header"><span>界面密度</span></div>
          <fieldset className="density-options">
            <legend>默认密度</legend>
            <label className={density === "comfortable" ? "is-selected" : ""}>
              <input type="radio" name="density" checked={density === "comfortable"} onChange={() => onDensityChange("comfortable")} />
              <strong>舒适</strong><span>适合创意、角色和正文编辑</span>
            </label>
            <label className={density === "compact" ? "is-selected" : ""}>
              <input type="radio" name="density" checked={density === "compact"} onChange={() => onDensityChange("compact")} />
              <strong>紧凑</strong><span>减少工具与数据列表的行高</span>
            </label>
          </fieldset>
          <p className="field-hint">世界书列表、来源、版本、问题和连续性数据区会始终使用紧凑密度。</p>
        </section>

        <section id="settings-privacy" className="settings-section card">
          <div className="card-header"><span>Provider 与隐私</span></div>
          <ul className="plain-list">
            <li>API 密钥只从服务端环境变量读取，不进入浏览器存储。</li>
            <li>Mock Provider 不发送外部请求。</li>
            <li>各生成页面会显示实际选中的上下文和截断提示。</li>
            <li>项目导出不包含 API 密钥或调试日志。</li>
          </ul>
        </section>

        <section id="settings-danger" className="settings-section danger-zone">
          <div><strong>清除当前本地项目</strong><p>删除角色卡、世界书、分析、规划、正文和连续性数据。此操作不可撤销。</p></div>
          <button className="btn-danger" onClick={onClearProject}>清除当前项目</button>
        </section>
      </div>
    </div>
  );
}
