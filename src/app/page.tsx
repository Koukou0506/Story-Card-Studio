"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import type { CharacterCardV2 } from "@/domain/character-card";
import type { QualityReport } from "@/domain/quality-check";
import type { ProviderType } from "@/providers/types";
import { runQualityChecks } from "@/services/quality-checker";
import { useDraft } from "@/hooks/useDraft";
import { ProjectInput as ProjectInputComponent } from "@/components/ProjectInput";
import { CharacterEditor } from "@/components/CharacterEditor";
import { QualityCheck } from "@/components/QualityCheck";
import { ImportExport } from "@/components/ImportExport";
import { GenerationPanel } from "@/components/GenerationPanel";
import { ProjectHome } from "@/components/ProjectHome";
import { SettingsWorkspace } from "@/components/SettingsWorkspace";
import { AppShell } from "@/components/ui/AppShell";
import { getViewMeta, type AppView } from "@/components/ui/navigation";
import { usePwaRuntime } from "@/components/pwa/PwaRuntime";
import { migrateProjectDraft } from "@/domain/project-draft";
import { readValidatedJsonFile } from "@/services/file-validation";
import {
  CharacterSnapshotSchema,
  ForeshadowThreadSchema,
  KnowledgeStateSchema,
  OpenQuestionSchema,
  PlotThreadSchema,
  ProjectTimelineEventSchema,
  RelationshipSnapshotSchema,
  WorldSnapshotSchema,
  continuityBase,
  createCanonFact,
  createEmptyContinuityProject,
} from "@/domain/continuity";
import { createEmptyManuscript } from "@/domain/prose";
import { sourceSpanToContinuityReference } from "@/services/document-ingestion/source-reference";

const workspaceLoading = () => <div className="card" role="status">正在加载工作区…</div>;
const LorebookWorkspace = dynamic(() => import("@/components/LorebookWorkspace").then((module) => module.LorebookWorkspace), { loading: workspaceLoading });
const PlotAnalysisWorkspace = dynamic(() => import("@/components/PlotAnalysisWorkspace").then((module) => module.PlotAnalysisWorkspace), { loading: workspaceLoading });
const StoryPlanningWorkspace = dynamic(() => import("@/components/StoryPlanningWorkspace").then((module) => module.StoryPlanningWorkspace), { loading: workspaceLoading });
const ProseWorkspace = dynamic(() => import("@/components/ProseWorkspace").then((module) => module.ProseWorkspace), { loading: workspaceLoading });
const ContinuityCenter = dynamic(() => import("@/components/ContinuityCenter").then((module) => module.ContinuityCenter), { loading: workspaceLoading });
const DocumentIngestionWorkspace = dynamic(() => import("@/components/DocumentIngestionWorkspace").then((module) => module.DocumentIngestionWorkspace), { loading: workspaceLoading });
const StyleRiskWorkspace = dynamic(() => import("@/components/StyleRiskWorkspace").then((module) => module.StyleRiskWorkspace), { loading: workspaceLoading });
const VisualWorkspace = dynamic(() => import("@/components/VisualWorkspace").then((module) => module.VisualWorkspace), { loading: workspaceLoading });
const ProjectAssistantWorkspace = dynamic(() => import("@/components/ProjectAssistantWorkspace").then((module) => module.ProjectAssistantWorkspace), { loading: workspaceLoading });
const SettingChangeWorkspace = dynamic(() => import("@/components/SettingChangeWorkspace").then((module) => module.SettingChangeWorkspace), { loading: workspaceLoading });
const AssetLibraryWorkspace = dynamic(() => import("@/components/AssetLibraryWorkspace").then((module) => module.AssetLibraryWorkspace), { loading: workspaceLoading });

export default function Home() {
  const pwa = usePwaRuntime();
  const projectImportRef = useRef<HTMLInputElement>(null);
  const {
    draft,
    selectedLorebook,
    updateProjectInput,
    setCharacterData,
    updateCharacterField,
    loadCharacterCard,
    addLorebook,
    updateLorebook,
    deleteLorebook,
    selectLorebook,
    selectedAnalysisProject,
    addAnalysisProject,
    updateAnalysisProject,
    deleteAnalysisProject,
    selectAnalysisProject,
    saveAnalysisReport,
    addProjectNote,
    updateAnalysisProviderPreference,
    selectedStoryPlan,
    addStoryPlan,
    updateStoryPlan,
    deleteStoryPlan,
    selectStoryPlan,
    savePlanningVariant,
    selectedChapterPlanningProject,
    addChapterPlanningProject,
    updateChapterPlanningProject,
    deleteChapterPlanningProject,
    selectChapterPlanningProject,
    selectedManuscript,
    addManuscript,
    updateManuscript,
    deleteManuscript,
    selectManuscript,
    selectedContinuityProject,
    addContinuityProject,
    updateContinuityProject,
    deleteContinuityProject,
    selectContinuityProject,
    selectedDocumentIngestion,
    addDocumentIngestion,
    updateDocumentIngestion,
    deleteDocumentIngestion,
    selectDocumentIngestion,
    replaceDraft,
    clearDraft,
    storageStatus,
    storageVersion,
    conflictCopyId,
    hasDraft,
  } = useDraft();
  const [activeView, setActiveView] = useState<AppView>("home");
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [qualityReport, setQualityReport] = useState<QualityReport | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem("story-card-studio-ui-density");
    if (saved === "comfortable" || saved === "compact") setDensity(saved);
    const requestedView = new URLSearchParams(window.location.search).get("view");
    if (requestedView && getViewMeta(requestedView as AppView).id === requestedView) setActiveView(requestedView as AppView);
  }, []);

  const updateDensity = (next: "comfortable" | "compact") => {
    setDensity(next);
    window.localStorage.setItem("story-card-studio-ui-density", next);
  };

  const showToast = useCallback((type: "success" | "error" | "info", text: string) => {
    setToast({ type, text });
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  const handleGenerate = useCallback(async (config: { provider: ProviderType; model: string }) => {
    if (!pwa.isOnline) { setGenerateError("当前离线，模型操作已暂停。你仍可编辑和导出本机草稿。"); return; }
    setIsGenerating(true);
    setGenerateError(null);
    const controller = new AbortController();
    setAbortController(controller);
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: draft.projectInput, provider: config.provider, model: config.model }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || `请求失败 (${response.status})`);
      setCharacterData(result.data);
      setQualityReport(runQualityChecks(result.data));
      showToast("success", `角色卡生成成功 · ${result.meta?.model || config.model}`);
      setActiveView("character");
    } catch (error) {
      setGenerateError(controller.signal.aborted
        ? "生成已取消。"
        : `生成失败：${(error as Error).message}\n请检查 Provider 配置，或改用 Mock Provider。`);
    } finally {
      setIsGenerating(false);
      setAbortController(null);
    }
  }, [draft.projectInput, pwa.isOnline, setCharacterData, showToast]);

  const handleQuality = useCallback(() => {
    const report = runQualityChecks(draft.characterData);
    setQualityReport(report);
    showToast(
      report.issues.length ? "info" : "success",
      report.issues.length ? `角色卡发现 ${report.issues.length} 个问题。` : "角色卡质量检查通过。",
    );
  }, [draft.characterData, showToast]);

  const handleImport = useCallback((card: CharacterCardV2) => {
    loadCharacterCard(card);
    setQualityReport(runQualityChecks(card.data));
  }, [loadCharacterCard]);

  const exportRecovery = () => {
    const blob = new Blob([JSON.stringify(draft.recoveryData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "story-card-studio-recovery.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadProject = () => {
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url; link.download = `${(draft.projectInput.projectName || "story-card-project").replace(/[\\/:*?"<>|]/g, "_")}.json`; link.click(); URL.revokeObjectURL(url);
  };

  const importProject = async (file?: File) => {
    if (!file) return;
    try {
      const next = migrateProjectDraft(JSON.parse(await readValidatedJsonFile(file)));
      replaceDraft(next); showToast("success", "项目 JSON 已导入；旧数据结构已安全迁移。"); setActiveView("home");
    } catch (error) { showToast("error", `项目导入失败：${(error as Error).message}`); }
    finally { if (projectImportRef.current) projectImportRef.current.value = ""; }
  };

  const clearCurrentProject = () => {
    if (!window.confirm("确定清除当前项目的全部本地数据吗？此操作不可撤销。建议先导出备份。")) return;
    clearDraft();
    setQualityReport(null);
    setActiveView("home");
    showToast("info", "当前本地项目已清除。");
  };

  const renderWorkspace = (): ReactNode => {
    switch (activeView) {
      case "home":
        return <ProjectHome draft={draft} onNavigate={setActiveView} />;
      case "input":
        return (
          <div className="creative-workspace">
            <section className="creative-editor" aria-label="创意输入表单">
              <ProjectInputComponent value={draft.projectInput} onChange={updateProjectInput} disabled={isGenerating} />
            </section>
            <aside className="creative-inspector" aria-label="角色卡生成控制">
              <GenerationPanel
                onGenerate={handleGenerate}
                onCancel={() => abortController?.abort()}
                isGenerating={isGenerating}
                disabled={!draft.projectInput.originalIdea.trim() || !pwa.isOnline}
                error={generateError}
                offline={!pwa.isOnline}
              />
              <div className="card compact-card">
                <div className="card-header"><span>项目资料状态</span></div>
                <dl className="mini-facts">
                  <div><dt>角色卡</dt><dd>{draft.characterData.name || "尚未生成"}</dd></div>
                  <div><dt>世界书</dt><dd>{draft.lorebooks.length} 本</dd></div>
                  <div><dt>规划</dt><dd>{draft.storyPlans.length} 个</dd></div>
                </dl>
                {draft.characterData.name && <button className="btn-secondary" onClick={() => setActiveView("character")}>打开角色卡</button>}
              </div>
            </aside>
          </div>
        );
      case "character":
        return (
          <div className="character-workspace">
            <aside className="workspace-list-pane card compact-card" aria-label="角色与版本">
              <div className="card-header"><span>当前角色</span></div>
              <div className="character-list-item is-active">
                <span className="character-avatar" aria-hidden="true">{draft.characterData.name?.slice(0, 1) || "角"}</span>
                <div><strong>{draft.characterData.name || "未命名角色"}</strong><span>Character Card V2</span></div>
              </div>
              <dl className="mini-facts">
                <div><dt>版本</dt><dd>{draft.characterData.character_version || "1.0"}</dd></div>
                <div><dt>标签</dt><dd>{draft.characterData.tags.length}</dd></div>
                <div><dt>扩展字段</dt><dd>{Object.keys(draft.characterData.extensions).length}</dd></div>
              </dl>
              <button className="btn-secondary" onClick={handleQuality} disabled={!draft.characterData.name}>运行质量检查</button>
            </aside>
            <section className="workspace-primary-pane" aria-label="角色卡编辑器">
              <CharacterEditor data={draft.characterData} onChange={updateCharacterField} disabled={isGenerating} />
            </section>
            <aside className="workspace-inspector-pane" aria-label="生成与质量检查器">
              <details className="inspector-disclosure" open={!draft.characterData.name}>
                <summary>生成或更新角色卡</summary>
                <GenerationPanel
                  onGenerate={handleGenerate}
                  onCancel={() => abortController?.abort()}
                  isGenerating={isGenerating}
                  disabled={!draft.projectInput.originalIdea.trim() || !pwa.isOnline}
                  error={generateError}
                  offline={!pwa.isOnline}
                />
              </details>
              <QualityCheck report={qualityReport} />
            </aside>
          </div>
        );
      case "lorebook":
        return (
          <LorebookWorkspace
            projectInput={draft.projectInput}
            characterCard={draft.characterCard}
            lorebooks={draft.lorebooks}
            selected={selectedLorebook}
            onAdd={addLorebook}
            onUpdate={updateLorebook}
            onDelete={deleteLorebook}
            onSelect={selectLorebook}
            onLoadCharacterCard={handleImport}
          />
        );
      case "analysis":
        return (
          <PlotAnalysisWorkspace
            projects={draft.analysisProjects}
            selected={selectedAnalysisProject}
            characterCard={draft.characterCard}
            lorebooks={draft.lorebooks}
            provider={draft.providerPreferences.analysisProvider}
            model={draft.providerPreferences.analysisModel}
            onAdd={addAnalysisProject}
            onUpdate={updateAnalysisProject}
            onDelete={deleteAnalysisProject}
            onSelect={selectAnalysisProject}
            onSaveReport={saveAnalysisReport}
            onAddNote={addProjectNote}
            onProvider={updateAnalysisProviderPreference}
          />
        );
      case "planning":
        return (
          <StoryPlanningWorkspace
            plans={draft.storyPlans}
            selected={selectedStoryPlan}
            originalIdea={draft.projectInput.originalIdea}
            card={draft.characterCard}
            books={draft.lorebooks}
            analyses={draft.analysisProjects}
            provider={draft.providerPreferences.generationProvider}
            model={draft.providerPreferences.generationModel}
            onAdd={addStoryPlan}
            onUpdate={updateStoryPlan}
            onDelete={deleteStoryPlan}
            onSelect={selectStoryPlan}
            onSaveVariant={savePlanningVariant}
            onCreateAnalysis={(value) => { addAnalysisProject(value); setActiveView("analysis"); }}
            chapterPlanningProjects={draft.chapterPlanningProjects}
            selectedChapterPlanningProject={selectedChapterPlanningProject}
            onAddChapterPlanning={addChapterPlanningProject}
            onUpdateChapterPlanning={updateChapterPlanningProject}
            onDeleteChapterPlanning={deleteChapterPlanningProject}
            onSelectChapterPlanning={selectChapterPlanningProject}
          />
        );
      case "prose":
        return (
          <ProseWorkspace
            manuscripts={draft.manuscripts}
            selected={selectedManuscript}
            chapterPlanningProjects={draft.chapterPlanningProjects}
            selectedChapterPlanning={selectedChapterPlanningProject}
            storyPlans={draft.storyPlans}
            card={draft.characterCard}
            books={draft.lorebooks}
            analyses={draft.analysisProjects}
            provider={draft.providerPreferences.generationProvider}
            model={draft.providerPreferences.generationModel}
            onAdd={addManuscript}
            onUpdate={updateManuscript}
            onDelete={deleteManuscript}
            onSelect={selectManuscript}
            onCreateAnalysis={(value) => { addAnalysisProject(value); setActiveView("analysis"); }}
            onUpdateChapterPlanning={updateChapterPlanningProject}
            onAddLorebook={addLorebook}
            onUpdateLorebook={updateLorebook}
            onAddCharacterNote={(value) => updateCharacterField("creator_notes", `${draft.characterData.creator_notes}${draft.characterData.creator_notes ? "\n" : ""}[正文候选] ${value}`)}
          />
        );
      case "style-risk":
        return (
          <StyleRiskWorkspace
            manuscript={selectedManuscript}
            isOnline={pwa.isOnline}
            provider={draft.providerPreferences.generationProvider}
            model={draft.providerPreferences.generationModel}
            onUpdateManuscript={updateManuscript}
          />
        );
      case "continuity":
        return (
          <ContinuityCenter
            draft={draft}
            projects={draft.continuityProjects}
            selected={selectedContinuityProject}
            onAdd={addContinuityProject}
            onUpdate={updateContinuityProject}
            onDelete={deleteContinuityProject}
            onSelect={selectContinuityProject}
          />
        );
      case "document-ingestion":
        return (
          <DocumentIngestionWorkspace
            projects={draft.documentIngestions}
            selected={selectedDocumentIngestion}
            projectId={draft.projectInput.projectName || "local-project"}
            existingCharacterName={draft.characterData.name}
            isOnline={pwa.isOnline}
            onAdd={addDocumentIngestion}
            onUpdate={updateDocumentIngestion}
            onDelete={deleteDocumentIngestion}
            onSelect={selectDocumentIngestion}
            onWriteCharacterCard={(card) => {
              loadCharacterCard(card);
              showToast("success", `角色卡草稿“${card.data.name}”已载入编辑器；请审查后再导出。`);
            }}
            onWriteLorebook={(book) => {
              addLorebook(book);
              showToast("success", `世界书草稿“${book.name}”已加入项目，尚未自动激活。`);
            }}
            onWriteCanonCandidate={(candidate) => {
              const target = selectedContinuityProject ? structuredClone(selectedContinuityProject) : createEmptyContinuityProject("小说导入候选");
              const sources = candidate.sourceSpans.map((span) => sourceSpanToContinuityReference(
                span,
                selectedDocumentIngestion?.documentSources.find((source) => source.id === span.documentId),
              ));
              const base = { ...continuityBase("document_candidate"), sources };
              switch (candidate.candidateType) {
                case "timeline_event":
                  target.timeline.events.push(ProjectTimelineEventSchema.parse({ ...base, status: "candidate", title: candidate.name, description: candidate.content, timeType: candidate.applicableTime ? "relative" : "unknown", start: candidate.applicableTime, characterIds: candidate.entityIds }));
                  break;
                case "plot_thread":
                  target.plotThreads.push(PlotThreadSchema.parse({ ...base, status: "candidate", title: candidate.name, description: candidate.content, characterIds: candidate.entityIds, currentState: "候选" }));
                  break;
                case "open_question":
                  target.openQuestions.push(OpenQuestionSchema.parse({ ...base, status: "unanswered", question: candidate.content || candidate.name, characterIds: candidate.entityIds }));
                  break;
                case "foreshadow":
                  target.foreshadowThreads.push(ForeshadowThreadSchema.parse({ ...base, status: "candidate", title: candidate.name, description: candidate.content }));
                  break;
                case "character_snapshot":
                  target.characterSnapshots.push(CharacterSnapshotSchema.parse({ ...base, status: "candidate", characterId: candidate.entityIds[0] || candidate.id, time: candidate.applicableTime, goal: candidate.content, confirmed: false }));
                  break;
                case "relationship_snapshot":
                  if (candidate.entityIds.length >= 2) target.relationshipSnapshots.push(RelationshipSnapshotSchema.parse({ ...base, status: "candidate", characterIds: candidate.entityIds.slice(0, 2), relationship: candidate.content, confirmed: false }));
                  else target.canonLedger.facts.push(createCanonFact({ status: "candidate", title: candidate.name, content: candidate.content, factType: "relationship", authority: 8, sources }));
                  break;
                case "knowledge_state":
                  target.knowledgeStates.push(KnowledgeStateSchema.parse({ ...base, status: "candidate", informationId: candidate.id, title: candidate.name, content: candidate.content }));
                  break;
                case "world_state":
                  target.worldSnapshots.push(WorldSnapshotSchema.parse({ ...base, status: "candidate", entityId: candidate.entityIds[0] || candidate.id, state: candidate.content, confirmed: false }));
                  break;
                default:
                  target.canonLedger.facts.push(createCanonFact({
                    status: "candidate", title: candidate.name || "小说导入候选事实", content: candidate.content,
                    entityIds: candidate.entityIds, authority: candidate.authority === "document_explicit" ? 7 : 8,
                    effectiveFrom: candidate.applicableTime, sources,
                  }));
              }
              target.modifiedAt = new Date().toISOString();
              if (selectedContinuityProject) updateContinuityProject(target); else addContinuityProject(target);
              showToast("success", "候选已写入连续性中心的对应候选区；未自动确认 Canon。" );
            }}
            onWriteStyleProfile={(profile) => {
              const accepted = { ...profile, status: "accepted" as const, modifiedAt: new Date().toISOString() };
              if (selectedManuscript) updateManuscript({ ...selectedManuscript, styleProfiles: [...selectedManuscript.styleProfiles.filter((item) => item.id !== accepted.id), accepted], defaultStyleProfileId: accepted.id, modifiedAt: new Date().toISOString() });
              else {
                const manuscript = createEmptyManuscript(selectedChapterPlanningProject?.id || "document-import", "小说导入文风档案");
                manuscript.styleProfiles = [...manuscript.styleProfiles, accepted]; manuscript.defaultStyleProfileId = accepted.id;
                addManuscript(manuscript);
              }
              showToast("success", "Style Profile 候选已确认并保存；不代表能完美复制原作者文风。");
            }}
            onWriteLanguageConstraints={(constraints) => {
              const accepted = constraints.map((item) => ({ ...item, status: "accepted" as const, strictness: item.strictness === "hard" ? "preferred" as const : item.strictness, modifiedAt: new Date().toISOString() }));
              if (selectedManuscript) updateManuscript({ ...selectedManuscript, languageConstraints: [...selectedManuscript.languageConstraints, ...accepted], modifiedAt: new Date().toISOString() });
              else {
                const manuscript = createEmptyManuscript(selectedChapterPlanningProject?.id || "document-import", "小说导入语言规则");
                manuscript.languageConstraints = accepted; addManuscript(manuscript);
              }
              showToast("success", `${accepted.length} 条语言规则已保存为 preferred/advisory，未自动设为 hard。`);
            }}
            projectDraft={draft}
            onReplaceProjectDraft={replaceDraft}
          />
        );
      case "visual":
        return <VisualWorkspace draft={draft} onNavigate={setActiveView} />;
      case "assistant":
        return <ProjectAssistantWorkspace draft={draft} onUpdateDraft={replaceDraft} onNavigate={setActiveView} />;
      case "setting-change":
        return <SettingChangeWorkspace draft={draft} onUpdateDraft={replaceDraft} />;
      case "asset-library":
        return <AssetLibraryWorkspace draft={draft} onUpdateDraft={replaceDraft} />;
      case "import-export":
        return (
          <div className="format-center-grid">
            <ImportExport card={draft.characterCard} onImport={handleImport} disabled={isGenerating} />
            <div className="card format-card">
              <div className="card-header"><span>世界书格式</span></div>
              <p>独立 SillyTavern World Info 与 Character Book 的导入、导出、读取、替换和安全合并在世界书工作区完成。</p>
              <ul className="plain-list">
                <li>保留未知字段和格式专属数据</li>
                <li>合并冲突不会被静默覆盖</li>
                <li>支持导出后重新导入</li>
              </ul>
              <button className="btn-primary" onClick={() => setActiveView("lorebook")}>打开世界书格式工具</button>
            </div>
            <div className="card format-card full-width">
              <div className="card-header"><span>项目 JSON 备份与恢复</span></div>
              <p>完整备份包含角色卡、世界书、分析、规划、正文和连续性数据，不包含 API 密钥、会话或调试日志。手机端使用系统文件选择器，不依赖拖拽。</p>
              <div className="button-row">
                <button className="btn-primary" onClick={downloadProject}>导出完整项目</button>
                <button className="btn-secondary" onClick={() => projectImportRef.current?.click()}>导入项目 JSON</button>
                <input ref={projectImportRef} hidden type="file" accept="application/json,.json" onChange={(event) => void importProject(event.target.files?.[0])} />
              </div>
              {draft.recoveryData !== undefined && <button className="btn-secondary" onClick={exportRecovery}>导出恢复数据</button>}
            </div>
          </div>
        );
      case "settings":
        return (
          <SettingsWorkspace
            density={density}
            onDensityChange={updateDensity}
            projectVersion={draft.dataVersion}
            savedAt={draft.savedAt}
            hasRecovery={draft.recoveryData !== undefined}
            onExportRecovery={exportRecovery}
            onClearProject={clearCurrentProject}
            draft={draft}
            onReplaceDraft={replaceDraft}
            installAvailable={pwa.installAvailable}
            installed={pwa.installed}
            onInstall={() => void pwa.install()}
            localStorageVersion={storageVersion}
          />
        );
    }
  };

  const meta = getViewMeta(activeView);
  const pageActions = activeView === "character"
    ? <button className="btn-secondary" onClick={handleQuality} disabled={!draft.characterData.name}>检查角色卡</button>
    : activeView === "home"
      ? <button className="btn-secondary" onClick={() => setActiveView("settings")}>项目设置</button>
      : undefined;

  return (
    <AppShell
      activeView={activeView}
      onNavigate={setActiveView}
      projectName={draft.projectInput.projectName}
      draftVersion={draft.dataVersion}
      hasDraft={hasDraft}
      density={density}
      pageTitle={meta.title}
      pageSubtitle={meta.subtitle}
      pageActions={pageActions}
      onlineStatus={pwa.isOnline ? "online" : "offline"}
      saveStatus={storageStatus === "saving" ? "saving" : storageStatus === "saved" ? "saved" : "error"}
      syncStatus={storageStatus === "conflict" ? "conflict" : "local"}
      banner={<>
        {!pwa.isOnline && <div className="global-banner warning" role="status"><div><strong>当前离线</strong><span>本机草稿可继续编辑和导出；模型操作与工作区同步已暂停。</span></div></div>}
        {pwa.updateAvailable && <div className="global-banner info" role="status"><div><strong>发现应用更新</strong><span>更新不会自动刷新或覆盖未保存正文。</span></div><div className="button-row"><button className="btn-primary" disabled={storageStatus === "saving"} onClick={pwa.activateUpdate}>保存完成后更新</button><button className="btn-secondary" onClick={pwa.dismissUpdate}>稍后</button></div></div>}
        {conflictCopyId && <div className="global-banner error" role="alert"><div><strong>检测到本机保存冲突</strong><span>当前草稿已保留为冲突副本 {conflictCopyId}，没有覆盖较新版本。</span></div></div>}
        {draft.migrationError && <div className="global-banner error" role="alert"><div><strong>草稿迁移提示</strong><span>{draft.migrationError}</span></div><button className="btn-secondary" onClick={exportRecovery}>导出原始恢复数据</button></div>}
      </>}
    >
      {renderWorkspace()}
      <div className="sr-only" aria-live="polite" aria-atomic="true">{toast?.text || ""}</div>
      {toast && <div className={`toast ${toast.type}`} role="status">{toast.text}</div>}
    </AppShell>
  );
}
