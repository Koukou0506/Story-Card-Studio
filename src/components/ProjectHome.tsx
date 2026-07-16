"use client";

import type { ProjectDraft } from "@/domain/project-draft";
import type { AppView } from "./ui/navigation";

interface ProjectHomeProps {
  draft: ProjectDraft;
  onNavigate: (view: AppView) => void;
}

function continueDestination(draft: ProjectDraft): { view: AppView; label: string; description: string } {
  if (draft.manuscripts.length > 0) {
    return { view: "prose", label: "继续写作", description: "返回最近的章节与场景正文" };
  }
  if (draft.chapterPlanningProjects.length > 0 || draft.storyPlans.length > 0) {
    return { view: "planning", label: "继续小说规划", description: "推进大纲、章节或场景" };
  }
  if (draft.characterData.name) {
    return { view: "character", label: "继续编辑角色卡", description: "完善人物设定与互动内容" };
  }
  if (draft.lorebooks.length > 0) {
    return { view: "lorebook", label: "继续编辑世界书", description: "整理条目与激活规则" };
  }
  return { view: "input", label: "写下创意", description: "从原始想法开始构建项目" };
}

export function ProjectHome({ draft, onNavigate }: ProjectHomeProps) {
  const projectName = draft.projectInput.projectName || "未命名项目";
  const hasProject = Boolean(
    draft.projectInput.originalIdea.trim()
    || draft.characterData.name
    || draft.lorebooks.length
    || draft.storyPlans.length
    || draft.manuscripts.length,
  );
  const next = continueDestination(draft);
  const continuity = draft.continuityProjects.find((item) => item.id === draft.selectedContinuityProjectId)
    ?? draft.continuityProjects.at(-1);
  const health = continuity?.healthReports.at(-1);
  const progress = continuity?.writingProgress;
  const attention = [
    draft.migrationError ? { label: "草稿迁移需要处理", view: "settings" as AppView, tone: "error" } : null,
    health?.severeIssues ? { label: `${health.severeIssues} 个严重连续性问题`, view: "continuity" as AppView, tone: "error" } : null,
    health?.candidateFacts ? { label: `${health.candidateFacts} 条事实等待确认`, view: "continuity" as AppView, tone: "warning" } : null,
    health?.staleSummaries ? { label: `${health.staleSummaries} 个摘要已过期`, view: "continuity" as AppView, tone: "warning" } : null,
  ].filter(Boolean) as Array<{ label: string; view: AppView; tone: string }>;

  if (!hasProject) {
    return (
      <section className="home-empty" aria-labelledby="home-empty-title">
        <div className="home-empty-copy">
          <span className="section-kicker">本地优先的创作工作台</span>
          <h2 id="home-empty-title">开始你的创作项目</h2>
          <p>先写下一段原始想法，再逐步建立角色、世界书、规划与正文。数据保存在当前浏览器，Mock Provider 不需要 API 密钥。</p>
          <div className="hero-actions">
            <button className="btn-primary btn-large" onClick={() => onNavigate("input")}>写下创意</button>
            <button className="btn-secondary btn-large" onClick={() => onNavigate("import-export")}>导入已有资料</button>
          </div>
        </div>
        <div className="home-empty-steps" aria-label="创作流程">
          {["建立创意与角色", "整理世界与规划", "写作、修订与维护连续性"].map((label, index) => (
            <div key={label}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{label}</strong>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <div className="project-home">
      <section className="home-hero">
        <div>
          <span className="section-kicker">继续创作</span>
          <h2>{projectName}</h2>
          <p>{draft.projectInput.originalIdea || "这个项目已经建立，可以从最近的创作内容继续。"}</p>
        </div>
        <button className="continue-card" onClick={() => onNavigate(next.view)}>
          <span>{next.description}</span>
          <strong>{next.label}</strong>
          <span aria-hidden="true">进入工作区 →</span>
        </button>
      </section>

      <section className="progress-strip" aria-label="项目进度">
        <div><span>正式字数</span><strong>{progress?.totalWords ?? 0}</strong></div>
        <div><span>规划完成</span><strong>{progress?.planningCompletion ?? 0}%</strong></div>
        <div><span>初稿完成</span><strong>{progress?.draftCompletion ?? 0}%</strong></div>
        <div><span>修订完成</span><strong>{progress?.revisionCompletion ?? 0}%</strong></div>
      </section>

      <div className="home-content-grid">
        <section className="home-panel">
          <header><span className="section-kicker">项目资料</span><h3>最近工作</h3></header>
          <div className="recent-work-grid">
            <button onClick={() => onNavigate("character")}>
              <span>角色卡</span><strong>{draft.characterData.name || "尚未建立"}</strong><small>{draft.characterData.name ? "继续编辑人物" : "创建主要角色"}</small>
            </button>
            <button onClick={() => onNavigate("lorebook")}>
              <span>世界书</span><strong>{draft.lorebooks.length} 本世界书</strong><small>{draft.lorebooks.reduce((count, book) => count + book.entries.length, 0)} 个条目</small>
            </button>
            <button onClick={() => onNavigate("planning")}>
              <span>小说规划</span><strong>{draft.storyPlans.length} 个规划</strong><small>{draft.chapterPlanningProjects.length} 个分章项目</small>
            </button>
            <button onClick={() => onNavigate("prose")}>
              <span>正文</span><strong>{draft.manuscripts.length} 个正文项目</strong><small>版本与修订独立保存</small>
            </button>
          </div>
        </section>

        <section className="home-panel attention-panel">
          <header><span className="section-kicker">项目健康</span><h3>需要处理</h3></header>
          {attention.length ? attention.map((item) => (
            <button className={`attention-item ${item.tone}`} key={item.label} onClick={() => onNavigate(item.view)}>
              <span className="status-dot" aria-hidden="true" />
              <span>{item.label}</span>
              <span aria-hidden="true">→</span>
            </button>
          )) : (
            <div className="calm-state">
              <strong>当前没有阻断项</strong>
              <p>可继续创作；项目健康检查不会自动修改任何内容。</p>
              <button className="btn-secondary" onClick={() => onNavigate("continuity")}>查看连续性中心</button>
            </div>
          )}
        </section>
      </div>

      <section className="quick-start-section">
        <header><span className="section-kicker">快速开始</span><h3>打开下一项工具</h3></header>
        <div className="quick-actions">
          <button onClick={() => onNavigate("input")}><span>02</span><strong>补充创意</strong></button>
          <button onClick={() => onNavigate("analysis")}><span>05</span><strong>分析剧情</strong></button>
          <button onClick={() => onNavigate("planning")}><span>06</span><strong>规划故事</strong></button>
          <button onClick={() => onNavigate("continuity")}><span>08</span><strong>检查连续性</strong></button>
        </div>
      </section>
    </div>
  );
}
