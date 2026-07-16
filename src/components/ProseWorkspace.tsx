"use client";

import { useMemo, useRef, useState } from "react";
import type { CharacterCardV2 } from "@/domain/character-card";
import type { ChapterPlanningProject, ScenePlanVersion } from "@/domain/chapter-planning";
import type { Lorebook } from "@/domain/lorebook";
import { createEmptyLorebook, createEmptyLorebookEntry } from "@/domain/lorebook";
import type { PlotAnalysisProject } from "@/domain/plot-analysis";
import {
  EditScopeSchema, ProseGenerationRequestSchema, createEmptyLanguageConstraint, createEmptyStyleProfile,
  type Manuscript, type ProseGenerationMode, type SceneDraft, type StyleProfile,
} from "@/domain/prose";
import type { StoryPlan } from "@/domain/story-planning";
import type { ProviderType } from "@/providers/types";
import { MockProvider } from "@/providers/mock";
import { acceptRevision, blocksToText, rejectRevision, restoreDraftVersion, toggleBlockLock } from "@/services/prose-editing";
import { exportManuscriptJSON, exportManuscriptMarkdown, exportManuscriptPlainText, importManuscriptJSON, manuscriptFilename } from "@/services/prose-export";
import { generateProseStream, type ProseGenerationResult } from "@/services/prose-generator";
import { createAnalysisFromProse, createB2UpdateCopy, createRevisionTaskFromAnalysis } from "@/services/prose-integration";
import { autosaveUserText, cloneDraftVersion, createManuscriptFromChapterPlanning, extractAbstractStyleFeatures, updateSceneDraft } from "@/services/prose-project";
import type { ProseContext } from "@/services/prose-context-builder";
import { usePwaRuntime } from "@/components/pwa/PwaRuntime";
import { readValidatedJsonFile } from "@/services/file-validation";

interface Props {
  manuscripts: Manuscript[]; selected: Manuscript | null; chapterPlanningProjects: ChapterPlanningProject[];
  selectedChapterPlanning: ChapterPlanningProject | null; storyPlans: StoryPlan[]; card: CharacterCardV2;
  books: Lorebook[]; analyses: PlotAnalysisProject[]; provider: ProviderType; model: string;
  onAdd(value: Manuscript): void; onUpdate(value: Manuscript): void; onDelete(id: string): void; onSelect(id: string | null): void;
  onCreateAnalysis(value: PlotAnalysisProject): void; onUpdateChapterPlanning(value: ChapterPlanningProject): void;
  onAddLorebook(value: Lorebook): void; onUpdateLorebook(value: Lorebook): void; onAddCharacterNote(value: string): void;
}

const MODE_LABELS: Array<[ProseGenerationMode, string]> = [
  ["full_scene", "完整场景初稿"], ["opening", "场景开头"], ["conflict", "冲突展开"], ["turning_point", "转折"], ["ending", "场景结尾"],
  ["continue", "从光标续写"], ["rewrite", "重写选区"], ["expand", "扩写选区"], ["compress", "压缩选区"], ["enhance_dialogue", "增强对话"],
  ["enhance_action", "增强动作"], ["enhance_psychology", "增强心理"], ["enhance_environment", "增强环境"], ["adjust_pacing", "调整节奏"], ["custom_revision", "自定义局部修订"],
];

function download(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type })); const link = document.createElement("a");
  link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
}

function scenePlan(project: ChapterPlanningProject, draft: SceneDraft): ScenePlanVersion | null {
  for (const volume of project.volumes) for (const chapter of volume.chapters) for (const chapterVersion of chapter.versions) {
    const scene = chapterVersion.scenes.find((item) => item.id === draft.scenePlanId);
    const version = scene?.versions.find((item) => item.id === draft.b2SceneVersionId) ?? scene?.versions.find((item) => item.id === scene.selectedVersionId) ?? scene?.versions[0];
    if (version) return version;
  }
  return null;
}

export function ProseWorkspace(props: Props) {
  const { isOnline } = usePwaRuntime();
  const [mode, setMode] = useState<ProseGenerationMode>("full_scene");
  const [targetWords, setTargetWords] = useState(1200); const [instruction, setInstruction] = useState("");
  const [person, setPerson] = useState<"first" | "third" | "follow_plan" | "custom">("follow_plan");
  const [tense, setTense] = useState<"past" | "present" | "follow_project" | "custom">("follow_project");
  const [historyMode, setHistoryMode] = useState<"near_cursor" | "scene" | "previous_scene_ending" | "chapter_summary" | "manual" | "auto_related">("auto_related");
  const [selection, setSelection] = useState({ start: 0, end: 0 }); const [context, setContext] = useState<ProseContext | null>(null);
  const [temporaryText, setTemporaryText] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [styleSample, setStyleSample] = useState("");
  const [panel, setPanel] = useState<"plan" | "context" | "quality" | "facts" | "states" | "revisions" | "versions" | "style">("plan");
  const [mobilePane, setMobilePane] = useState<"navigation" | "editor" | "tools" | "inspector">("editor");
  const [fullScreen, setFullScreen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const manuscript = props.selected;
  const chapterProject = manuscript ? props.chapterPlanningProjects.find((item) => item.id === manuscript.b2ProjectId) ?? null : props.selectedChapterPlanning;
  const chapter = manuscript?.chapterDrafts.find((item) => item.id === manuscript.selectedChapterDraftId) ?? manuscript?.chapterDrafts[0] ?? null;
  const scene = chapter?.sceneDrafts.find((item) => item.id === manuscript?.selectedSceneDraftId) ?? chapter?.sceneDrafts[0] ?? null;
  const version = scene?.versions.find((item) => item.id === scene.selectedVersionId) ?? scene?.versions.at(-1) ?? null;
  const proseText = version ? blocksToText(version.blocks) : "";
  const plan = chapterProject && scene ? scenePlan(chapterProject, scene) : null;
  const storyPlan = manuscript ? props.storyPlans.find((item) => item.id === manuscript.b1PlanId) ?? null : null;
  const latestRevision = scene?.revisions.at(-1) ?? null;
  const selectedStyle = manuscript?.styleProfiles.find((item) => item.id === manuscript.defaultStyleProfileId) ?? manuscript?.styleProfiles[0] ?? null;

  const commitScene = (next: SceneDraft) => { if (manuscript) props.onUpdate(updateSceneDraft(manuscript, next)); };
  const updateManuscript = (patch: Partial<Manuscript>) => manuscript && props.onUpdate({ ...manuscript, ...patch, modifiedAt: new Date().toISOString() });
  const chooseScene = (chapterId: string, sceneId: string) => updateManuscript({ selectedChapterDraftId: chapterId, selectedSceneDraftId: sceneId });

  const scopeForMode = () => {
    if (["continue"].includes(mode)) return EditScopeSchema.parse({ type: "text_range", start: selection.start, end: selection.start, allowNewFacts: true });
    if (["rewrite", "expand", "compress", "enhance_dialogue", "enhance_action", "enhance_psychology", "enhance_environment", "adjust_pacing", "custom_revision"].includes(mode)) {
      if (selection.end <= selection.start) throw new Error("该模式需要先在正文编辑器中选择文本范围。");
      return EditScopeSchema.parse({ type: "text_range", start: selection.start, end: selection.end, allowNewFacts: mode === "expand", customDescription: instruction });
    }
    if (mode === "opening") return EditScopeSchema.parse({ type: "opening", allowStructureChanges: false });
    if (mode === "ending") return EditScopeSchema.parse({ type: "ending", allowStructureChanges: false });
    return EditScopeSchema.parse({ type: "scene", allowStructureChanges: mode === "full_scene", allowNewFacts: false });
  };

  const handleResult = (result: ProseGenerationResult) => { commitScene(result.sceneDraft); setContext(result.context); setTemporaryText(""); setPanel("revisions"); };
  const generate = async () => {
    if (!manuscript || !chapterProject || !chapter || !scene || !version) return;
    if (!isOnline) { setError("当前离线，正文模型操作已暂停；手动编辑、版本切换和导出仍可使用。"); return; }
    setError(""); setBusy(true); setTemporaryText(""); const controller = new AbortController(); abortRef.current = controller;
    try {
      const request = ProseGenerationRequestSchema.parse({ manuscriptId: manuscript.id, chapterDraftId: chapter.id, sceneDraftId: scene.id, baseVersionId: version.id, scope: scopeForMode(), settings: { targetWords, mode, person, tense, styleProfileId: selectedStyle?.id ?? null, languageConstraintIds: manuscript.languageConstraints.filter((item) => item.enabled).map((item) => item.id), previousTextMode: historyMode, stream: props.provider === "mock", contextBudget: manuscript.tokenBudget }, instruction });
      if (props.provider === "mock") {
        const result = await generateProseStream({ manuscript, request, chapterPlanning: chapterProject, storyPlan, characterCard: props.card, lorebooks: props.books, analyses: props.analyses, provider: new MockProvider(), model: props.model, abortSignal: controller.signal }, setTemporaryText);
        handleResult(result);
      } else {
        const response = await fetch("/api/generate-prose", { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal, body: JSON.stringify({ manuscript, request, chapterPlanning: chapterProject, storyPlan, characterCard: props.card, lorebooks: props.books, analyses: props.analyses, provider: props.provider, model: props.model }) });
        const result = await response.json(); if (!response.ok || !result.success) throw new Error(result.error || `请求失败 (${response.status})`);
        commitScene(result.data); setContext(result.context); setPanel("revisions");
      }
    } catch (cause) { setError(controller.signal.aborted ? "生成已取消；若已有 Mock 流式内容，会保存为 incomplete 备选稿。" : `正文操作失败：${(cause as Error).message}`); }
    finally { setBusy(false); abortRef.current = null; }
  };

  const create = () => {
    if (!props.selectedChapterPlanning) return setError("请先在小说规划中创建并选择章节与场景规划。");
    props.onAdd(createManuscriptFromChapterPlanning(props.selectedChapterPlanning));
  };

  const changeStyle = (patch: Partial<StyleProfile>) => {
    if (!manuscript || !selectedStyle) return;
    updateManuscript({ styleProfiles: manuscript.styleProfiles.map((item) => item.id === selectedStyle.id ? { ...item, ...patch, modifiedAt: new Date().toISOString() } : item) });
  };

  if (!manuscript) return <div className="card empty-state"><h2>正文写作</h2><p>从当前场景规划创建正文项目。正文版本与规划分离，生成和修订不会覆盖采用稿。</p><button className="btn-primary" onClick={create}>从当前场景规划创建正文项目</button>{props.manuscripts.length > 0 && <div className="button-row">{props.manuscripts.map((item) => <button key={item.id} className="btn-secondary" onClick={() => props.onSelect(item.id)}>{item.name}</button>)}</div>}{error && <div className="error-message">{error}</div>}</div>;

  return <div className={`prose-workspace ${fullScreen ? "is-fullscreen" : ""}`}>
    <div className="card prose-project-toolbar"><div className="card-header">正文写作</div><div className="button-row">
      <select value={manuscript.id} onChange={(event) => props.onSelect(event.target.value)}>{props.manuscripts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <button className="btn-secondary" onClick={create}>新建正文项目</button>
      <button className="btn-secondary" onClick={() => download(exportManuscriptMarkdown(manuscript, { includeNotes: true }), manuscriptFilename(manuscript, "md"), "text/markdown")}>导出 Markdown</button>
      <button className="btn-secondary" onClick={() => download(exportManuscriptPlainText(manuscript), manuscriptFilename(manuscript, "txt"), "text/plain")}>导出纯文本</button>
      <button className="btn-secondary" onClick={() => download(exportManuscriptJSON(manuscript), manuscriptFilename(manuscript, "json"), "application/json")}>导出 JSON</button>
      <label className="btn-secondary">导入 JSON<input hidden type="file" accept="application/json,.json" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; try { props.onAdd(importManuscriptJSON(await readValidatedJsonFile(file))); } catch (cause) { setError((cause as Error).message); } finally { event.currentTarget.value = ""; } }} /></label>
      <button className="btn-danger" onClick={() => window.confirm("删除正文项目？故事规划、章节与场景和角色卡不会被删除。") && props.onDelete(manuscript.id)}>删除</button>
    </div><div className="field-hint">正文数据 v{manuscript.dataVersion} · 章节与场景来源 {manuscript.b2SourceVersion || "未记录"} · 自动保存到本地</div></div>

    <nav className="prose-mobile-switcher" aria-label="移动端正文视图">
      {(["navigation", "editor", "tools", "inspector"] as const).map((id) => <button key={id} className={mobilePane === id ? "is-active" : ""} aria-current={mobilePane === id ? "page" : undefined} onClick={() => setMobilePane(id)}>{{ navigation: "章节", editor: "正文", tools: "生成", inspector: "检查" }[id]}</button>)}
      <button aria-pressed={fullScreen} onClick={() => { setFullScreen((value) => !value); setMobilePane("editor"); }}>{fullScreen ? "退出全屏" : "全屏"}</button>
    </nav>

    <div className="prose-shell-grid" data-mobile-pane={mobilePane}>
      <div className="card prose-navigation-pane"><div className="card-header">章节与场景</div>{manuscript.chapterDrafts.map((item) => <div key={item.id} style={{ marginBottom: ".75rem" }}><strong>{item.title}</strong>{item.sceneDrafts.map((child) => <button key={child.id} className={`tab ${scene?.id === child.id ? "active" : ""}`} style={{ width: "100%", textAlign: "left", marginTop: ".25rem" }} onClick={() => { chooseScene(item.id, child.id); setMobilePane("editor"); }}>{child.order + 1}. {child.title}{child.incomplete ? " · 未完成" : ""}</button>)}</div>)}</div>

      <div className="prose-main-pane">
        <div className="card prose-editor-card"><div className="card-header"><span>正文编辑器</span><button className="btn-secondary prose-focus-button" aria-pressed={fullScreen} onClick={() => setFullScreen((value) => !value)}>{fullScreen ? "退出全屏" : "全屏编辑"}</button></div>{scene && version ? <>
          <div className="button-row"><select value={version.id} onChange={(event) => commitScene({ ...scene, selectedVersionId: event.target.value })}>{scene.versions.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.status}{item.incomplete ? " · incomplete" : ""}</option>)}</select><span className="field-hint">{version.wordCount} 字 · {version.blocks.length} 段</span><button className="btn-secondary" onClick={() => commitScene({ ...scene, incomplete: !scene.incomplete, status: scene.incomplete ? "user_edited" : "incomplete" })}>{scene.incomplete ? "标记已完成" : "标记未完成"}</button></div>
          <textarea className="prose-editor" value={proseText} onSelect={(event) => setSelection({ start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd })} onChange={(event) => commitScene(autosaveUserText(scene, version.id, event.target.value))} placeholder="可直接输入正文，或从 Scene Plan 生成备选稿。" aria-label="场景正文" />
          <div className="field-hint">选区：{selection.start}–{selection.end}。直接编辑会自动保存为独立 user_edited 版本。</div>
          <div style={{ marginTop: ".75rem" }}><strong>段落锁定</strong>{version.blocks.map((block) => <div key={block.id} className="button-row" style={{ borderTop: "1px solid var(--border)", padding: ".35rem 0" }}><button className="btn-secondary" onClick={() => commitScene({ ...scene, versions: scene.versions.map((item) => item.id === version.id ? toggleBlockLock(item, block.id) : item) })}>{block.locked ? "🔒 解锁" : "🔓 锁定"}</button><span className="field-hint">{block.text.slice(0, 70)}</span></div>)}</div>
        </> : <div className="empty-state">当前章节与场景规划没有可用场景。</div>}</div>

        <div className="card prose-generation-card"><div className="card-header">生成与局部修订</div><div className="form-grid">
          <label>模式<select value={mode} onChange={(event) => setMode(event.target.value as ProseGenerationMode)}>{MODE_LABELS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
          <label>目标字数<input type="number" min={50} max={20000} value={targetWords} onChange={(event) => setTargetWords(Number(event.target.value))} /></label>
          <label>人称<select value={person} onChange={(event) => setPerson(event.target.value as typeof person)}><option value="follow_plan">跟随场景规划</option><option value="first">第一人称</option><option value="third">第三人称</option><option value="custom">自定义</option></select></label>
          <label>时态<select value={tense} onChange={(event) => setTense(event.target.value as typeof tense)}><option value="follow_project">跟随项目</option><option value="past">过去</option><option value="present">现在</option><option value="custom">自定义</option></select></label>
          <label>前文选择<select value={historyMode} onChange={(event) => setHistoryMode(event.target.value as typeof historyMode)}><option value="auto_related">自动相关</option><option value="near_cursor">光标附近</option><option value="scene">当前 Scene 全文</option><option value="previous_scene_ending">上一 Scene 结尾</option><option value="chapter_summary">Chapter 摘要</option><option value="manual">手动（使用要求栏）</option></select></label>
        </div><label>受限要求<textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="不会覆盖选区之外的正文；锁定段落逐字保留。" /></label><div className="button-row"><button className="btn-primary" disabled={busy || !scene || !isOnline} onClick={generate}>{busy ? "生成临时草稿中…" : "生成备选版本"}</button>{busy && <button className="btn-danger" onClick={() => abortRef.current?.abort()}>取消并保留已生成部分</button>}</div>{!isOnline && <div className="notice">离线状态下不会提交正文模型请求。</div>}{temporaryText && <div className="migration-error"><strong>流式临时草稿（尚未修改采用版本）</strong><pre style={{ whiteSpace: "pre-wrap" }}>{temporaryText}</pre></div>}{error && <div className="error-message">{error}</div>}</div>
      </div>

      <div className="prose-inspector-pane"><div className="card"><div className="button-row">{(["plan", "context", "quality", "facts", "states", "revisions", "versions", "style"] as const).map((id) => <button key={id} className={`tab ${panel === id ? "active" : ""}`} onClick={() => setPanel(id)}>{{ plan: "计划", context: "上下文", quality: "检查", facts: "事实", states: "状态", revisions: "修订", versions: "版本", style: "风格" }[id]}</button>)}</div>
        {panel === "plan" && plan && <div><h3>{plan.title}</h3><p><strong>目标：</strong>{plan.sceneGoal}</p><p><strong>时间/地点：</strong>{plan.time} / {plan.location}</p><p><strong>视角：</strong>{plan.pov.perspective} · {plan.pov.povCharacterIds.join("、")}</p><p><strong>人物：</strong>{plan.presentCharacterIds.join("、")}</p><p><strong>冲突：</strong>{plan.opposingForce} / {plan.conflictType}</p><p><strong>触发/行动/转折：</strong>{plan.trigger} / {plan.action} / {plan.turningPoint}</p><p><strong>结果：</strong>{plan.result}</p><p><strong>离场：</strong>{JSON.stringify(plan.exitState)}</p><p><strong>信息/关系：</strong>{plan.informationChanges.join("；")} / {plan.relationshipChanges.join("；")}</p></div>}
        {panel === "context" && <div>{context ? <><p>{context.estimatedTokens}/{context.tokenBudget} tokens {context.truncated ? "· 已截断" : ""}</p>{context.truncationWarnings.map((item) => <div key={item} className="migration-error">{item}</div>)}{context.sources.map((item, index) => <details key={`${item.sourceId}-${index}`}><summary>{item.included ? "✓" : "○"} [{item.authority}] {item.sourceName}</summary><p>{item.reason}</p><pre style={{ whiteSpace: "pre-wrap" }}>{item.content.slice(0, 800)}</pre></details>)}</> : <p>生成后显示本次实际发送的资料；不会发送整个项目。</p>}</div>}
        {panel === "quality" && scene && <div>{scene.issues.length ? scene.issues.map((item) => <details key={item.id}><summary>[{item.severity}/{item.confidence}{item.heuristic ? "/启发式" : "/确定"}] {item.type}</summary><p>{item.rationale}</p><p>最小修改：{item.minimumRevision}</p></details>) : <p>暂无问题。生成后会运行独立正文检查。</p>}<h4>Scene Plan Coverage</h4>{scene.coverage.map((item) => <p key={item.id}><strong>{item.element}</strong>：{item.status}<br /><span className="field-hint">{item.rationale}</span></p>)}</div>}
        {panel === "facts" && scene && <div><p className="field-hint">候选不会自动写回角色卡、世界书或时间线；以下按钮均为显式用户操作。</p>{scene.candidateFacts.map((item) => <div key={item.id} style={{ borderTop: "1px solid var(--border)", padding: ".5rem 0" }}><strong>{item.factType} · {item.importance}</strong><p>{item.content}</p><div className="button-row"><button className="btn-secondary" onClick={() => commitScene({ ...scene, candidateFacts: scene.candidateFacts.map((fact) => fact.id === item.id ? { ...fact, decision: "confirmed", recommendation: "confirm_project_fact", modifiedAt: new Date().toISOString() } : fact) })}>确认为项目事实候选</button><button className="btn-secondary" onClick={() => { const entry = createEmptyLorebookEntry(); entry.name = `正文候选：${item.factType}`; entry.content = item.content; entry.category = item.factType; entry.activation.primaryKeys = []; const book = props.books[0]; if (book) props.onUpdateLorebook({ ...book, entries: [...book.entries, entry], metadata: { ...book.metadata, modifiedAt: new Date().toISOString() } }); else { const next = createEmptyLorebook("正文候选事实"); next.entries = [entry]; props.onAddLorebook(next); } commitScene({ ...scene, candidateFacts: scene.candidateFacts.map((fact) => fact.id === item.id ? { ...fact, decision: "copied_to_candidate", recommendation: "add_lorebook_draft" } : fact) }); }}>添加到世界书草稿</button><button className="btn-secondary" onClick={() => { props.onAddCharacterNote(item.content); commitScene({ ...scene, candidateFacts: scene.candidateFacts.map((fact) => fact.id === item.id ? { ...fact, decision: "copied_to_candidate", recommendation: "add_character_note" } : fact) }); }}>添加到角色备注</button><button className="btn-secondary" onClick={() => { updateManuscript({ b2CandidateCopyNotes: [...manuscript.b2CandidateCopyNotes, `时间线候选：${item.content}`] }); commitScene({ ...scene, candidateFacts: scene.candidateFacts.map((fact) => fact.id === item.id ? { ...fact, decision: "copied_to_candidate", recommendation: "add_timeline_candidate" } : fact) }); }}>添加到时间线候选</button><button className="btn-secondary" onClick={() => commitScene({ ...scene, candidateFacts: scene.candidateFacts.map((fact) => fact.id === item.id ? { ...fact, decision: "ignored", recommendation: "ignore", modifiedAt: new Date().toISOString() } : fact) })}>忽略</button></div></div>)}</div>}
        {panel === "states" && scene && <div><p className="field-hint">确认后只可创建章节与场景更新副本，不修改当前采用规划。</p>{scene.candidateStateChanges.map((item) => <div key={item.id} style={{ borderTop: "1px solid var(--border)", padding: ".5rem 0" }}><strong>{item.changeType} · {item.confidence}</strong><p>{item.before} → {item.after}</p><button className="btn-secondary" onClick={() => commitScene({ ...scene, candidateStateChanges: scene.candidateStateChanges.map((change) => change.id === item.id ? { ...change, decision: "confirmed", modifiedAt: new Date().toISOString() } : change) })}>确认候选</button></div>)}<button className="btn-primary" disabled={!chapterProject || !scene.candidateStateChanges.some((item) => item.decision === "confirmed")} onClick={() => { if (chapterProject) props.onUpdateChapterPlanning(createB2UpdateCopy(chapterProject, scene.scenePlanId, scene.candidateStateChanges.filter((item) => item.decision === "confirmed"))); }}>创建章节与场景状态更新副本</button></div>}
        {panel === "revisions" && scene && <div>{latestRevision ? <><p><strong>{latestRevision.operationType}</strong> · {latestRevision.decision}</p>{latestRevision.diffs.map((diff) => <details key={diff.id}><summary>{diff.type} · 段 {diff.order + 1}</summary><div style={{ background: "#fee", padding: ".5rem", whiteSpace: "pre-wrap" }}>− {diff.originalText}</div><div style={{ background: "#efe", padding: ".5rem", whiteSpace: "pre-wrap" }}>+ {diff.suggestedText}</div>{diff.type !== "unchanged" && <button className="btn-secondary" onClick={() => commitScene(acceptRevision(scene, latestRevision.id, [diff.id]))}>仅接受此段</button>}</details>)}<div className="button-row"><button className="btn-primary" disabled={latestRevision.suggestedVersionId === latestRevision.baseVersionId} onClick={() => commitScene(acceptRevision(scene, latestRevision.id))}>全部接受</button><button className="btn-danger" onClick={() => commitScene(rejectRevision(scene, latestRevision.id))}>全部拒绝</button><button className="btn-secondary" onClick={() => navigator.clipboard?.writeText(blocksToText(scene.versions.find((item) => item.id === latestRevision.suggestedVersionId)?.blocks ?? []))}>复制建议</button></div></> : <p>暂无正文修订。</p>}{version && props.analyses.flatMap((analysis) => analysis.reports.flatMap((report) => report.suggestions)).slice(-5).map((suggestion) => <button key={suggestion.id} className="btn-secondary" onClick={() => commitScene({ ...scene, revisions: [...scene.revisions, createRevisionTaskFromAnalysis(scene, version, suggestion)] })}>保存剧情分析建议为修订任务：{suggestion.title}</button>)}</div>}
        {panel === "versions" && scene && <div>{scene.versions.map((item) => <div key={item.id} style={{ borderTop: "1px solid var(--border)", padding: ".5rem 0" }}><strong>{item.name}</strong><p className="field-hint">{item.status} · {item.wordCount} 字 · {item.createdAt}</p><div className="button-row"><button className="btn-secondary" onClick={() => commitScene({ ...scene, selectedVersionId: item.id })}>查看</button><button className="btn-secondary" onClick={() => commitScene(restoreDraftVersion(scene, item.id))}>恢复为新版本</button><button className="btn-secondary" onClick={() => { const copy = cloneDraftVersion(item); commitScene({ ...scene, versions: [...scene.versions, copy], selectedVersionId: copy.id }); }}>复制为新版本</button><button className="btn-secondary" onClick={() => commitScene({ ...scene, versions: scene.versions.map((value) => value.id === item.id ? { ...value, locked: !value.locked, status: !value.locked ? "locked" : "alternative" } : value) })}>{item.locked ? "解锁版本" : "锁定版本"}</button></div></div>)}{version && plan && <button className="btn-primary" onClick={() => props.onCreateAnalysis(createAnalysisFromProse(scene, version, plan, scene.versions.filter((item) => item.id !== version.id).slice(-2)))}>发送正文与场景规划到剧情分析 / 版本比较</button>}</div>}
        {panel === "style" && <div><h3>Style Profile</h3>{selectedStyle && <><label>名称<input value={selectedStyle.name} onChange={(event) => changeStyle({ name: event.target.value })} /></label><label>总体语气<input value={selectedStyle.overallTone} onChange={(event) => changeStyle({ overallTone: event.target.value })} /></label><label>简洁度 {selectedStyle.concision}<input type="range" min={1} max={5} value={selectedStyle.concision} onChange={(event) => changeStyle({ concision: Number(event.target.value) })} /></label><label>节奏 {selectedStyle.pacing}<input type="range" min={1} max={5} value={selectedStyle.pacing} onChange={(event) => changeStyle({ pacing: Number(event.target.value) })} /></label><label>对话比例<input type="number" min={0} max={100} value={selectedStyle.dialogueRatio} onChange={(event) => changeStyle({ dialogueRatio: Number(event.target.value) })} /></label><label>自定义说明<textarea value={selectedStyle.customInstructions} onChange={(event) => changeStyle({ customInstructions: event.target.value })} /></label><label>样本文本（只提取抽象特征）<textarea value={styleSample} onChange={(event) => setStyleSample(event.target.value)} /></label><button className="btn-secondary" onClick={() => changeStyle({ abstractSampleFeatures: extractAbstractStyleFeatures(styleSample) })}>提取抽象特征</button>{selectedStyle.abstractSampleFeatures.map((item) => <p key={item} className="field-hint">• {item}</p>)}</>}<div className="button-row"><button className="btn-secondary" onClick={() => { const style = createEmptyStyleProfile(`风格 ${manuscript.styleProfiles.length + 1}`); style.isProjectDefault = false; updateManuscript({ styleProfiles: [...manuscript.styleProfiles, style], defaultStyleProfileId: style.id }); }}>新建风格</button>{selectedStyle && <><button className="btn-secondary" onClick={() => { const style = { ...structuredClone(selectedStyle), id: createEmptyStyleProfile().id, name: `${selectedStyle.name} 副本`, isProjectDefault: false, createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString() }; updateManuscript({ styleProfiles: [...manuscript.styleProfiles, style], defaultStyleProfileId: style.id }); }}>复制</button><button className="btn-secondary" onClick={() => updateManuscript({ defaultStyleProfileId: selectedStyle.id, styleProfiles: manuscript.styleProfiles.map((item) => ({ ...item, isProjectDefault: item.id === selectedStyle.id })) })}>设为项目默认</button><button className="btn-secondary" onClick={() => changeStyle({ sceneOverrideIds: scene ? [...new Set([...selectedStyle.sceneOverrideIds, scene.id])] : selectedStyle.sceneOverrideIds })}>用于当前场景</button><button className="btn-danger" disabled={manuscript.styleProfiles.length <= 1} onClick={() => updateManuscript({ styleProfiles: manuscript.styleProfiles.filter((item) => item.id !== selectedStyle.id), defaultStyleProfileId: manuscript.styleProfiles.find((item) => item.id !== selectedStyle.id)?.id ?? null })}>删除</button></>}</div><h3>Language Constraint</h3>{manuscript.languageConstraints.map((rule) => <div key={rule.id}><input value={rule.name} onChange={(event) => updateManuscript({ languageConstraints: manuscript.languageConstraints.map((item) => item.id === rule.id ? { ...item, name: event.target.value } : item) })} /><textarea value={rule.content} onChange={(event) => updateManuscript({ languageConstraints: manuscript.languageConstraints.map((item) => item.id === rule.id ? { ...item, content: event.target.value } : item) })} /><select value={rule.scope} onChange={(event) => updateManuscript({ languageConstraints: manuscript.languageConstraints.map((item) => item.id === rule.id ? { ...item, scope: event.target.value as typeof rule.scope } : item) })}><option value="project">项目</option><option value="character">角色</option><option value="scene">场景</option></select><select value={rule.strictness} onChange={(event) => updateManuscript({ languageConstraints: manuscript.languageConstraints.map((item) => item.id === rule.id ? { ...item, strictness: event.target.value as typeof rule.strictness } : item) })}><option value="hard">hard</option><option value="preferred">preferred</option><option value="advisory">advisory</option></select><input placeholder="正向示例（用｜分隔）" value={rule.positiveExamples.join("｜")} onChange={(event) => updateManuscript({ languageConstraints: manuscript.languageConstraints.map((item) => item.id === rule.id ? { ...item, positiveExamples: event.target.value.split("｜").filter(Boolean) } : item) })} /><input placeholder="禁用/反向示例（用｜分隔）" value={rule.negativeExamples.join("｜")} onChange={(event) => updateManuscript({ languageConstraints: manuscript.languageConstraints.map((item) => item.id === rule.id ? { ...item, negativeExamples: event.target.value.split("｜").filter(Boolean) } : item) })} /><label><input type="checkbox" checked={rule.enabled} onChange={(event) => updateManuscript({ languageConstraints: manuscript.languageConstraints.map((item) => item.id === rule.id ? { ...item, enabled: event.target.checked } : item) })} />启用</label><label><input type="checkbox" checked={rule.locked} onChange={(event) => updateManuscript({ languageConstraints: manuscript.languageConstraints.map((item) => item.id === rule.id ? { ...item, locked: event.target.checked } : item) })} />锁定</label><button className="btn-danger" onClick={() => updateManuscript({ languageConstraints: manuscript.languageConstraints.filter((item) => item.id !== rule.id) })}>删除</button></div>)}<button className="btn-secondary" onClick={() => updateManuscript({ languageConstraints: [...manuscript.languageConstraints, createEmptyLanguageConstraint()] })}>新增语言规则</button></div>}
      </div></div></div>
  </div>;
}
