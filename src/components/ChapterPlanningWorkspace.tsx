"use client";
import { usePwaRuntime } from "@/components/pwa/PwaRuntime";
import { readValidatedJsonFile } from "@/services/file-validation";

import { useMemo, useRef, useState } from "react";
import type { CharacterCardV2 } from "@/domain/character-card";
import {
  ForeshadowItemSchema,
  InformationItemSchema,
  createEmptyChapter,
  createEmptyChapterPlanningProject,
  createEmptyScene,
  createEmptyVolume,
  type ChapterPlan,
  type ChapterPlanningProject,
  type ChapterPlanVersion,
  type ScenePlan,
  type ScenePlanVersion,
  type SceneEntryState,
  type VolumePlan,
} from "@/domain/chapter-planning";
import { createStableId } from "@/domain/lorebook";
import type { Lorebook } from "@/domain/lorebook";
import { createEmptyAnalysisProject, type PlotAnalysisProject } from "@/domain/plot-analysis";
import type { StoryPlan } from "@/domain/story-planning";
import type { ProviderType } from "@/providers/types";
import { downloadText } from "@/services/analysis-export";
import { buildChapterPlanningContext } from "@/services/chapter-planning-context-builder";
import {
  chapterPlanningFilename,
  exportChapterPlanningJSON,
  exportChapterPlanningMarkdown,
  importChapterPlanningJSON,
} from "@/services/chapter-planning-export";
import type { ChapterPlanningMode } from "@/services/chapter-planning-generator";
import { validateChapterPlanning } from "@/services/chapter-planning-validator";
import {
  cloneChapterVersion,
  cloneSceneVersion,
  compareChapterVersions,
  compareSceneVersions,
} from "@/services/chapter-planning-version";

interface Props {
  projects: ChapterPlanningProject[];
  selected: ChapterPlanningProject | null;
  storyPlan: StoryPlan;
  card: CharacterCardV2;
  books: Lorebook[];
  analyses: PlotAnalysisProject[];
  provider: ProviderType;
  model: string;
  onAdd: (project: ChapterPlanningProject) => void;
  onUpdate: (project: ChapterPlanningProject) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string | null) => void;
  onCreateAnalysis: (project: PlotAnalysisProject) => void;
}

type SceneState = SceneEntryState;
type Tab = "volumes" | "chapters" | "scenes" | "information" | "coverage" | "versions" | "issues";

const modes: ChapterPlanningMode[] = [
  "volumes", "volume_chapters", "beat_chapters", "chapter_scenes", "missing_scenes",
  "regenerate_chapter", "regenerate_scene", "chapter_hook", "scene_conflict", "turning_point",
  "states", "information", "analysis_revision", "alternative_chapter", "pov", "foreshadow",
];

const splitList = (value: string) => value.split(/[，,\n]/).map((item) => item.trim()).filter(Boolean);
const recordToText = (value: Record<string, string>) => Object.entries(value).map(([key, item]) => `${key}=${item}`).join("\n");
const textToRecord = (value: string) => Object.fromEntries(value.split("\n").map((line) => line.split("=")).filter(([key, item]) => key?.trim() && item !== undefined).map(([key, ...rest]) => [key.trim(), rest.join("=").trim()]));
const itemRecordToText = (value: Record<string, string[]>) => Object.entries(value).map(([key, items]) => `${key}=${items.join("|")}`).join("\n");
const textToItemRecord = (value: string) => Object.fromEntries(value.split("\n").map((line) => line.split("=")).filter(([key, item]) => key?.trim() && item !== undefined).map(([key, ...rest]) => [key.trim(), rest.join("=").split("|").map((item) => item.trim()).filter(Boolean)]));
const stamp = () => new Date().toISOString();

function StateEditor({ title, value, onChange }: { title: string; value: SceneState; onChange: (value: SceneState) => void }) {
  return <details className="branch-box">
    <summary>{title}</summary>
    <div className="compact-grid">
      <input value={value.time} placeholder="时间" onChange={(event) => onChange({ ...value, time: event.target.value })} />
      <input value={value.location} placeholder="地点" onChange={(event) => onChange({ ...value, location: event.target.value })} />
      <input value={value.presentCharacterIds.join("，")} placeholder="在场角色 ID" onChange={(event) => onChange({ ...value, presentCharacterIds: splitList(event.target.value) })} />
      <input value={value.knownInformationIds.join("，")} placeholder="已知信息 ID" onChange={(event) => onChange({ ...value, knownInformationIds: splitList(event.target.value) })} />
    </div>
    <div className="compact-grid">
      <textarea value={recordToText(value.bodyStates)} placeholder="身体状态：角色ID=状态" onChange={(event) => onChange({ ...value, bodyStates: textToRecord(event.target.value) })} />
      <textarea value={recordToText(value.emotionStates)} placeholder="情绪状态：角色ID=状态" onChange={(event) => onChange({ ...value, emotionStates: textToRecord(event.target.value) })} />
      <textarea value={recordToText(value.currentGoals)} placeholder="当前目标：角色ID=目标" onChange={(event) => onChange({ ...value, currentGoals: textToRecord(event.target.value) })} />
      <textarea value={recordToText(value.relationshipStates)} placeholder="关系状态：关系ID=状态" onChange={(event) => onChange({ ...value, relationshipStates: textToRecord(event.target.value) })} />
      <textarea value={itemRecordToText(value.heldItems)} placeholder="持有物品：角色ID=物品|物品" onChange={(event) => onChange({ ...value, heldItems: textToItemRecord(event.target.value) })} />
      <textarea value={value.unresolvedConflicts.join("\n")} placeholder="未解决冲突（每行一项）" onChange={(event) => onChange({ ...value, unresolvedConflicts: splitList(event.target.value) })} />
    </div>
  </details>;
}

export function ChapterPlanningWorkspace(props: Props) {
  const { isOnline } = usePwaRuntime();
  const project = props.selected;
  const [draft, setDraft] = useState<ChapterPlanningProject | null>(null);
  const [tab, setTab] = useState<Tab>("volumes");
  const [mode, setMode] = useState<ChapterPlanningMode>("volumes");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [controller, setController] = useState<AbortController | null>(null);
  const [compareId, setCompareId] = useState("");
  const [chapterFilter, setChapterFilter] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const current = draft ?? project;
  const b1VersionStale = Boolean(current && !props.storyPlan.variants.some((item) => item.id === current.b1VariantId));
  const variant = props.storyPlan.variants.find((item) => item.id === current?.b1VariantId)
    ?? props.storyPlan.variants.find((item) => item.id === props.storyPlan.selectedVariantId)
    ?? props.storyPlan.variants[0];
  const volume = current?.volumes.find((item) => item.id === current.selectedVolumeId) ?? current?.volumes[0];
  const chapter = volume?.chapters.find((item) => item.id === current?.selectedChapterId) ?? volume?.chapters[0];
  const chapterVersion = chapter?.versions.find((item) => item.id === chapter.selectedVersionId) ?? chapter?.versions[0];
  const scene = chapterVersion?.scenes.find((item) => item.id === current?.selectedSceneId) ?? chapterVersion?.scenes[0];
  const sceneVersion = scene?.versions.find((item) => item.id === scene.selectedVersionId) ?? scene?.versions[0];
  const validation = useMemo(() => current && variant ? validateChapterPlanning(current, variant) : null, [current, variant]);
  const context = useMemo(() => current ? buildChapterPlanningContext({
    project: current,
    storyPlan: props.storyPlan,
    characterCard: props.card,
    lorebooks: props.books,
    analyses: props.analyses,
    chapterId: chapter?.id,
    sceneId: scene?.id,
    plotBeatIds: chapterVersion?.b1PlotBeatIds,
  }) : null, [current, props.storyPlan, props.card, props.books, props.analyses, chapter?.id, scene?.id, chapterVersion?.b1PlotBeatIds]);
  const analysisReports = props.analyses.flatMap((analysis) => analysis.reports.map((report) => ({ analysis, report })));

  const save = (next: ChapterPlanningProject) => draft
    ? setDraft(next)
    : props.onUpdate({ ...next, modifiedAt: stamp() });

  const replaceVolume = (next: VolumePlan) => current && save({
    ...current,
    volumes: current.volumes.map((item) => item.id === next.id ? next : item),
  });

  const replaceChapter = (volumeId: string, next: ChapterPlan) => {
    if (!current) return;
    save({
      ...current,
      volumes: current.volumes.map((item) => item.id === volumeId
        ? { ...item, chapters: item.chapters.map((chapterItem) => chapterItem.id === next.id ? next : chapterItem) }
        : item),
    });
  };

  const replaceChapterVersion = (owner: ChapterPlan, next: ChapterPlanVersion) => replaceChapter(owner.volumeId, {
    ...owner,
    versions: owner.versions.map((item) => item.id === next.id ? next : item),
  });

  const replaceScene = (owner: ChapterPlan, ownerVersion: ChapterPlanVersion, next: ScenePlan) => replaceChapterVersion(owner, {
    ...ownerVersion,
    scenes: ownerVersion.scenes.map((item) => item.id === next.id ? next : item),
  });

  const replaceSceneVersion = (owner: ScenePlan, next: ScenePlanVersion) => {
    if (!chapter || !chapterVersion) return;
    replaceScene(chapter, chapterVersion, {
      ...owner,
      versions: owner.versions.map((item) => item.id === next.id ? next : item),
    });
  };

  const createProject = () => {
    if (!variant) return;
    const next = createEmptyChapterPlanningProject(props.storyPlan.id, variant.id);
    next.name = `${props.storyPlan.name} · 分章与场景规划`;
    props.onAdd(next);
  };

  const sendToAnalysis = (title: string, content: unknown, focus: "comprehensive" | "character_fit" | "relationship" = "comprehensive") => {
    const analysis = createEmptyAnalysisProject();
    analysis.title = title;
    analysis.input.title = title;
    analysis.input.proposedPlot = JSON.stringify(content, null, 2);
    analysis.input.focuses = [focus];
    analysis.selectedLorebookIds = props.storyPlan.selectedLorebookIds;
    props.onCreateAnalysis(analysis);
    setMessage("已创建剧情分析快照；原章节与场景规划未被修改。");
  };

  const compareChapterVersionsInAnalysis = () => {
    if (!chapter || chapter.versions.length < 2) return;
    const analysis = createEmptyAnalysisProject();
    analysis.title = `章节方案比较：${chapterVersion?.title ?? chapter.id}`;
    analysis.input.title = analysis.title;
    analysis.input.focuses = ["branch_comparison"];
    analysis.input.proposedPlot = "比较以下章节方案，不自动修改章节与场景规划。";
    analysis.input.branches = chapter.versions.slice(0, 3).map((item) => ({
      id: item.id,
      name: item.name,
      description: JSON.stringify(item),
      expectedEffect: item.result,
      acceptableChanges: item.creationReason,
    }));
    analysis.proposal.branches = structuredClone(analysis.input.branches);
    props.onCreateAnalysis(analysis);
    setMessage("已创建剧情分析多方案比较快照；原章节版本未修改。");
  };

  const generate = async () => {
    if (!current) return;
    if (!isOnline) { setMessage("当前离线，章节与场景生成已暂停；现有规划仍可编辑和导出。"); return; }
    const abort = new AbortController();
    setController(abort);
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/generate-chapter-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: current,
          storyPlan: props.storyPlan,
          characterCard: props.card,
          lorebooks: props.books,
          analysisProjects: props.analyses,
          provider: props.provider,
          model: props.model,
          mode,
          scope: {
            volumeId: volume?.id,
            chapterId: chapter?.id,
            sceneId: scene?.id,
            plotBeatIds: chapterVersion?.b1PlotBeatIds,
          },
        }),
        signal: abort.signal,
      });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || "生成失败");
      setDraft(body.data);
      setMessage(`草稿已生成，发现 ${body.issues.length} 个检查项。确认后才会保存。`);
    } catch (error) {
      setMessage(abort.signal.aborted ? "生成已取消。" : `生成失败：${(error as Error).message}`);
    } finally {
      setLoading(false);
      setController(null);
    }
  };

  if (!project) return <div className="card empty-state">
    <h2>分卷、分章与场景规划</h2>
    <p>从当前故事规划采用版本建立可独立保存的章节与场景规划，不会修改故事规划原数据。</p>
    <button className="btn-primary" onClick={createProject} disabled={!variant}>新建章节与场景规划</button>
  </div>;
  if (!current) return null;

  const addChapter = () => {
    if (!volume) return;
    const next = createEmptyChapter(volume.id, volume.chapters.length);
    save({
      ...current,
      volumes: current.volumes.map((item) => item.id === volume.id ? { ...item, chapters: [...item.chapters, next] } : item),
      selectedChapterId: next.id,
    });
  };

  const addScene = () => {
    if (!volume || !chapter || !chapterVersion) return;
    const next = createEmptyScene(chapter.id, chapterVersion.scenes.length);
    const nextVersion = { ...chapterVersion, scenes: [...chapterVersion.scenes, next] };
    const nextChapter = { ...chapter, versions: chapter.versions.map((item) => item.id === nextVersion.id ? nextVersion : item) };
    save({
      ...current,
      volumes: current.volumes.map((item) => item.id === volume.id
        ? { ...item, chapters: item.chapters.map((chapterItem) => chapterItem.id === chapter.id ? nextChapter : chapterItem) }
        : item),
      selectedSceneId: next.id,
    });
  };

  return <div className="planning-layout">
    <section className="card planning-toolbar full-width">
      <select value={project.id} onChange={(event) => props.onSelect(event.target.value)}>
        {props.projects.filter((item) => item.b1PlanId === props.storyPlan.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <input value={current.name} onChange={(event) => save({ ...current, name: event.target.value })} />
      <button onClick={createProject}>新建</button>
      <button className="btn-danger" onClick={() => confirm("删除此章节与场景规划？故事规划、剧情分析、角色卡和世界书不会被删除。") && props.onDelete(project.id)}>删除</button>
      <select value={mode} onChange={(event) => setMode(event.target.value as ChapterPlanningMode)}>
        {modes.map((item) => <option key={item}>{item}</option>)}
      </select>
      {loading
        ? <button className="btn-danger" onClick={() => controller?.abort()}>取消</button>
        : <button className="btn-primary" disabled={!isOnline} onClick={generate}>生成草稿</button>}
      {!isOnline && <div className="notice">离线状态下不会提交章节规划请求。</div>}
      {draft && <>
        <button className="btn-primary" onClick={() => {
          props.onUpdate({ ...draft, issues: validation?.issues ?? [], plotBeatCoverage: validation?.coverage ?? [] });
          setDraft(null);
          setMessage("章节与场景草稿已保存。");
        }}>确认保存</button>
        <button onClick={() => setDraft(null)}>放弃草稿</button>
      </>}
    </section>

    <section className="card planning-context">
      <h3>限定上下文</h3>
      <p>故事规划：{variant?.name ?? "未选择"}；Provider：{props.provider}/{props.model || "default"}</p>
      {b1VersionStale && <div className="notice">该章节与场景规划关联的故事规划版本已不再存在；当前仅以最新可用版本预览，旧数据仍保留。</div>}
      {analysisReports.length > 0 && <details>
        <summary>选择本次使用的剧情分析报告</summary>
        {analysisReports.map(({ report }) => <label key={report.id}>
          <input type="checkbox" checked={current.selectedAnalysisReportIds.includes(report.id)} onChange={(event) => save({
            ...current,
            selectedAnalysisReportIds: event.target.checked
              ? [...new Set([...current.selectedAnalysisReportIds, report.id])]
              : current.selectedAnalysisReportIds.filter((id) => id !== report.id),
          })} />
          {report.inputSnapshot.title} · {report.createdAt}
        </label>)}
      </details>}
      <details>
        <summary>本次资料约 {context?.estimatedTokens ?? 0}/{current.tokenBudget} tokens</summary>
        {context?.sources.map((source) => <div className={source.included ? "context-row included" : "context-row excluded"} key={source.id}>
          <b>{source.name}</b>
          <small>权威 {source.authority} · {source.locked ? "锁定" : source.modifiable ? "可修改" : "只读"} · {source.reason}</small>
          <p>{source.content.slice(0, 180)}</p>
        </div>)}
      </details>
      {message && <div className="notice">{message}</div>}
    </section>

    <section className="card planning-main">
      <div className="tabs">
        {(["volumes", "chapters", "scenes", "information", "coverage", "versions", "issues"] as Tab[]).map((item) => <button key={item} className={`tab ${tab === item ? "active" : ""}`} onClick={() => setTab(item)}>{item}</button>)}
      </div>

      {tab === "volumes" && <div>
        <div className="card-header"><h2>分卷规划</h2><button onClick={() => {
          const next = createEmptyVolume(current.volumes.length);
          save({ ...current, volumes: [...current.volumes, next], selectedVolumeId: next.id });
        }}>新增分卷</button></div>
        {[...current.volumes].sort((a, b) => a.order - b.order).map((item, index) => <div className="branch-box" key={item.id}>
          <header>
            <button onClick={() => save({ ...current, selectedVolumeId: item.id })}>{item.title}</button>
            <label><input type="checkbox" checked={item.locked} onChange={(event) => replaceVolume({ ...item, locked: event.target.checked, status: event.target.checked ? "locked" : "draft" })} />锁定</label>
          </header>
          <input value={item.title} onChange={(event) => replaceVolume({ ...item, title: event.target.value })} />
          <textarea value={item.goal} placeholder="卷目标" onChange={(event) => replaceVolume({ ...item, goal: event.target.value })} />
          <textarea value={item.coreConflict} placeholder="核心冲突" onChange={(event) => replaceVolume({ ...item, coreConflict: event.target.value })} />
          <div className="compact-grid">
            <input value={item.subtitle} placeholder="副标题" onChange={(event) => replaceVolume({ ...item, subtitle: event.target.value })} />
            <input value={item.volumeFunction} placeholder="卷功能" onChange={(event) => replaceVolume({ ...item, volumeFunction: event.target.value })} />
            <input value={item.openingState} placeholder="开始状态" onChange={(event) => replaceVolume({ ...item, openingState: event.target.value })} />
            <input value={item.endingState} placeholder="结束状态" onChange={(event) => replaceVolume({ ...item, endingState: event.target.value })} />
            <input value={item.relationshipGoal} placeholder="关系推进目标" onChange={(event) => replaceVolume({ ...item, relationshipGoal: event.target.value })} />
            <input value={item.climax} placeholder="卷高潮" onChange={(event) => replaceVolume({ ...item, climax: event.target.value })} />
            <input type="number" value={item.expectedChapterCount} aria-label="预计章节数" onChange={(event) => replaceVolume({ ...item, expectedChapterCount: Number(event.target.value) })} />
          </div>
          <textarea value={item.keyInformation.join("\n")} placeholder="关键信息（每行一项）" onChange={(event) => replaceVolume({ ...item, keyInformation: event.target.value.split("\n").filter(Boolean) })} />
          <textarea value={item.legacyQuestions.join("\n")} placeholder="遗留问题（每行一项）" onChange={(event) => replaceVolume({ ...item, legacyQuestions: event.target.value.split("\n").filter(Boolean) })} />
          <small>故事节点：{item.plotBeatIds.join("、") || "未关联"}</small>
          <div className="button-row">
            <button disabled={!index} onClick={() => {
              const volumes = [...current.volumes];
              const from = volumes.findIndex((entry) => entry.id === item.id);
              [volumes[from - 1], volumes[from]] = [volumes[from], volumes[from - 1]];
              save({ ...current, volumes: volumes.map((entry, order) => ({ ...entry, order })) });
            }}>上移</button>
            <button onClick={() => {
              const copy = { ...structuredClone(item), id: createStableId("volume"), title: `${item.title} 副本`, locked: false, createdAt: stamp(), modifiedAt: stamp() };
              save({ ...current, volumes: [...current.volumes, copy], selectedVolumeId: copy.id });
            }}>复制</button>
            <button className="btn-danger" disabled={item.locked} onClick={() => save({ ...current, volumes: current.volumes.filter((entry) => entry.id !== item.id) })}>删除</button>
          </div>
        </div>)}
      </div>}

      {tab === "chapters" && <div>
        <div className="card-header"><h2>章节规划</h2><button disabled={!volume} onClick={addChapter}>新增章节</button></div>
        <input value={chapterFilter} placeholder="按标题、角色或 Plot Beat 筛选" onChange={(event) => setChapterFilter(event.target.value)} />
        <div className="button-row">{volume?.chapters.filter((item) => {
          if (!chapterFilter.trim()) return true;
          const selected = item.versions.find((entry) => entry.id === item.selectedVersionId) ?? item.versions[0];
          const haystack = [selected?.title, ...(selected?.characterIds ?? []), ...(selected?.b1PlotBeatIds ?? [])].join(" ").toLocaleLowerCase();
          return haystack.includes(chapterFilter.trim().toLocaleLowerCase());
        }).map((item) => {
          const selected = item.versions.find((entry) => entry.id === item.selectedVersionId) ?? item.versions[0];
          return <button key={item.id} className={chapter?.id === item.id ? "btn-primary" : ""} onClick={() => save({ ...current, selectedChapterId: item.id })}>{selected?.title ?? item.id}</button>;
        })}</div>
        {volume && chapter && chapterVersion && <div className="beat-card">
          <header><h3>{chapterVersion.title}</h3><label><input type="checkbox" checked={chapter.locked} onChange={(event) => replaceChapter(volume.id, { ...chapter, locked: event.target.checked, status: event.target.checked ? "locked" : "draft" })} />锁定章节</label></header>
          <div className="compact-grid">
            <input value={chapterVersion.title} placeholder="标题" onChange={(event) => replaceChapterVersion(chapter, { ...chapterVersion, title: event.target.value })} />
            <input value={chapterVersion.time} placeholder="时间" onChange={(event) => replaceChapterVersion(chapter, { ...chapterVersion, time: event.target.value })} />
            <input value={chapterVersion.location} placeholder="地点" onChange={(event) => replaceChapterVersion(chapter, { ...chapterVersion, location: event.target.value })} />
            <input value={chapterVersion.characterIds.join("，")} placeholder="主要角色 ID" onChange={(event) => replaceChapterVersion(chapter, { ...chapterVersion, characterIds: splitList(event.target.value) })} />
            <input value={chapterVersion.chapterGoal} placeholder="章节目标" onChange={(event) => replaceChapterVersion(chapter, { ...chapterVersion, chapterGoal: event.target.value })} />
            <input value={chapterVersion.mainConflict} placeholder="主要冲突" onChange={(event) => replaceChapterVersion(chapter, { ...chapterVersion, mainConflict: event.target.value })} />
            <input value={chapterVersion.trigger} placeholder="触发事件" onChange={(event) => replaceChapterVersion(chapter, { ...chapterVersion, trigger: event.target.value })} />
            <input value={chapterVersion.mainAction} placeholder="主要行动" onChange={(event) => replaceChapterVersion(chapter, { ...chapterVersion, mainAction: event.target.value })} />
            <input value={chapterVersion.coreTurn} placeholder="核心转折" onChange={(event) => replaceChapterVersion(chapter, { ...chapterVersion, coreTurn: event.target.value })} />
            <input value={chapterVersion.result} placeholder="章节结果" onChange={(event) => replaceChapterVersion(chapter, { ...chapterVersion, result: event.target.value })} />
            <input value={chapterVersion.hook.content} placeholder="结束钩子" onChange={(event) => replaceChapterVersion(chapter, { ...chapterVersion, hook: { ...chapterVersion.hook, content: event.target.value } })} />
            <input type="number" value={chapterVersion.estimatedWords} aria-label="预计篇幅" onChange={(event) => replaceChapterVersion(chapter, { ...chapterVersion, estimatedWords: Number(event.target.value) })} />
            <select value={chapterVersion.pov.perspective} aria-label="章节视角" onChange={(event) => replaceChapterVersion(chapter, { ...chapterVersion, pov: { ...chapterVersion.pov, perspective: event.target.value as ChapterPlanVersion["pov"]["perspective"] } })}>
              {["first_person", "third_limited", "third_omniscient", "multiple", "custom"].map((item) => <option key={item}>{item}</option>)}
            </select>
          </div>
          <StateEditor title="章节开篇状态" value={chapterVersion.openingState} onChange={(value) => replaceChapterVersion(chapter, { ...chapterVersion, openingState: value })} />
          <label>故事规划节点<select multiple value={chapterVersion.b1PlotBeatIds} onChange={(event) => replaceChapterVersion(chapter, { ...chapterVersion, b1PlotBeatIds: [...event.target.selectedOptions].map((option) => option.value) })}>
            {variant?.outline.beats.map((beat) => <option key={beat.id} value={beat.id}>{beat.title}</option>)}
          </select></label>
          <textarea value={chapterVersion.stateChanges.join("\n")} placeholder="状态变化（每行一项）" onChange={(event) => replaceChapterVersion(chapter, { ...chapterVersion, stateChanges: splitList(event.target.value) })} />
          <textarea value={chapterVersion.informationChanges.join("\n")} placeholder="信息变化（每行一项）" onChange={(event) => replaceChapterVersion(chapter, { ...chapterVersion, informationChanges: splitList(event.target.value) })} />
          <textarea value={chapterVersion.relationshipChanges.join("\n")} placeholder="关系变化（每行一项）" onChange={(event) => replaceChapterVersion(chapter, { ...chapterVersion, relationshipChanges: event.target.value.split("\n").filter(Boolean) })} />
          <textarea value={chapterVersion.worldStateChanges.join("\n")} placeholder="世界状态变化（每行一项）" onChange={(event) => replaceChapterVersion(chapter, { ...chapterVersion, worldStateChanges: event.target.value.split("\n").filter(Boolean) })} />
          <textarea value={chapterVersion.notes.join("\n")} placeholder="备注" onChange={(event) => replaceChapterVersion(chapter, { ...chapterVersion, notes: event.target.value.split("\n") })} />
          <div className="button-row">
            <button disabled={chapter.order === 0} onClick={() => {
              const chapters = [...volume.chapters];
              const index = chapters.findIndex((item) => item.id === chapter.id);
              [chapters[index - 1], chapters[index]] = [chapters[index], chapters[index - 1]];
              replaceVolume({ ...volume, chapters: chapters.map((item, order) => ({ ...item, order })) });
            }}>上移</button>
            <button onClick={() => sendToAnalysis(`章节分析：${chapterVersion.title}`, chapterVersion)}>发送到剧情分析</button>
            <button onClick={() => {
              const copy = structuredClone(chapter);
              copy.id = createStableId("chapter");
              copy.locked = false;
              copy.order = volume.chapters.length;
              copy.versions = copy.versions.map((entry) => ({ ...entry, id: createStableId("chapter_version"), title: `${entry.title} 副本`, volumeId: volume.id }));
              copy.selectedVersionId = copy.versions[0]?.id ?? null;
              replaceVolume({ ...volume, chapters: [...volume.chapters, copy] });
            }}>复制章节</button>
            <button className="btn-danger" disabled={chapter.locked} onClick={() => replaceVolume({ ...volume, chapters: volume.chapters.filter((item) => item.id !== chapter.id) })}>删除章节</button>
          </div>
        </div>}
      </div>}

      {tab === "scenes" && <div>
        <div className="card-header"><h2>场景卡</h2><button disabled={!chapterVersion} onClick={addScene}>新增场景</button></div>
        <div className="button-row">{chapterVersion?.scenes.map((item) => {
          const selected = item.versions.find((entry) => entry.id === item.selectedVersionId) ?? item.versions[0];
          return <button key={item.id} className={scene?.id === item.id ? "btn-primary" : ""} onClick={() => save({ ...current, selectedSceneId: item.id })}>{selected?.title ?? item.id}</button>;
        })}</div>
        {chapter && chapterVersion && scene && sceneVersion && <div className="beat-card">
          <header><h3>{sceneVersion.title}</h3><label><input type="checkbox" checked={scene.locked} onChange={(event) => replaceScene(chapter, chapterVersion, { ...scene, locked: event.target.checked, status: event.target.checked ? "locked" : "draft" })} />锁定场景</label></header>
          <div className="compact-grid">
            <input value={sceneVersion.title} placeholder="标题" onChange={(event) => replaceSceneVersion(scene, { ...sceneVersion, title: event.target.value })} />
            <input value={sceneVersion.time} placeholder="时间" onChange={(event) => replaceSceneVersion(scene, { ...sceneVersion, time: event.target.value })} />
            <input value={sceneVersion.location} placeholder="地点" onChange={(event) => replaceSceneVersion(scene, { ...sceneVersion, location: event.target.value })} />
            <select value={sceneVersion.pov.perspective} aria-label="场景视角" onChange={(event) => replaceSceneVersion(scene, { ...sceneVersion, pov: { ...sceneVersion.pov, perspective: event.target.value as ScenePlanVersion["pov"]["perspective"] } })}>
              {["first_person", "third_limited", "third_omniscient", "multiple", "custom"].map((item) => <option key={item}>{item}</option>)}
            </select>
            <input value={sceneVersion.pov.povCharacterIds.join("，")} placeholder="视角角色 ID" onChange={(event) => replaceSceneVersion(scene, { ...sceneVersion, pov: { ...sceneVersion.pov, povCharacterIds: splitList(event.target.value) } })} />
            <input value={sceneVersion.presentCharacterIds.join("，")} placeholder="在场角色 ID" onChange={(event) => replaceSceneVersion(scene, { ...sceneVersion, presentCharacterIds: splitList(event.target.value) })} />
            <input value={sceneVersion.sceneGoal} placeholder="场景目标" onChange={(event) => replaceSceneVersion(scene, { ...sceneVersion, sceneGoal: event.target.value })} />
            <input value={recordToText(sceneVersion.characterGoals)} placeholder="角色目标：ID=目标" onChange={(event) => replaceSceneVersion(scene, { ...sceneVersion, characterGoals: textToRecord(event.target.value) })} />
            <input value={sceneVersion.opposingForce} placeholder="对抗力量" onChange={(event) => replaceSceneVersion(scene, { ...sceneVersion, opposingForce: event.target.value })} />
            <input value={sceneVersion.conflictType} placeholder="冲突类型" onChange={(event) => replaceSceneVersion(scene, { ...sceneVersion, conflictType: event.target.value })} />
            <input value={sceneVersion.trigger} placeholder="触发" onChange={(event) => replaceSceneVersion(scene, { ...sceneVersion, trigger: event.target.value })} />
            <input value={sceneVersion.action} placeholder="行动" onChange={(event) => replaceSceneVersion(scene, { ...sceneVersion, action: event.target.value })} />
            <input value={sceneVersion.turningPoint} placeholder="转折" onChange={(event) => replaceSceneVersion(scene, { ...sceneVersion, turningPoint: event.target.value })} />
            <input value={sceneVersion.result} placeholder="结果" onChange={(event) => replaceSceneVersion(scene, { ...sceneVersion, result: event.target.value })} />
            <input value={sceneVersion.emotionalChange} placeholder="情绪变化" onChange={(event) => replaceSceneVersion(scene, { ...sceneVersion, emotionalChange: event.target.value })} />
            <input value={sceneVersion.relationshipChanges.join("，")} placeholder="关系变化" onChange={(event) => replaceSceneVersion(scene, { ...sceneVersion, relationshipChanges: splitList(event.target.value) })} />
            <input value={sceneVersion.informationChanges.join("，")} placeholder="信息变化" onChange={(event) => replaceSceneVersion(scene, { ...sceneVersion, informationChanges: splitList(event.target.value) })} />
            <input value={sceneVersion.informationRevealIds.join("，")} placeholder="信息揭示 ID" onChange={(event) => replaceSceneVersion(scene, { ...sceneVersion, informationRevealIds: splitList(event.target.value) })} />
            <input value={sceneVersion.foreshadowSetupIds.join("，")} placeholder="铺垫 ID" onChange={(event) => replaceSceneVersion(scene, { ...sceneVersion, foreshadowSetupIds: splitList(event.target.value) })} />
            <input value={sceneVersion.foreshadowPayoffIds.join("，")} placeholder="回收 ID" onChange={(event) => replaceSceneVersion(scene, { ...sceneVersion, foreshadowPayoffIds: splitList(event.target.value) })} />
            <input value={sceneVersion.newSettings.join("，")} placeholder="新增设定（需标记）" onChange={(event) => replaceSceneVersion(scene, { ...sceneVersion, newSettings: splitList(event.target.value), newSettingMarked: Boolean(event.target.value.trim()) })} />
            <input value={sceneVersion.sensoryFocus} placeholder="感官重点" onChange={(event) => replaceSceneVersion(scene, { ...sceneVersion, sensoryFocus: event.target.value })} />
            <input value={sceneVersion.dialogueFunction} placeholder="对话功能" onChange={(event) => replaceSceneVersion(scene, { ...sceneVersion, dialogueFunction: event.target.value })} />
            <input value={sceneVersion.nextSceneConnection} placeholder="下一场连接" onChange={(event) => replaceSceneVersion(scene, { ...sceneVersion, nextSceneConnection: event.target.value })} />
            <input type="number" value={sceneVersion.estimatedWords} aria-label="场景预计篇幅" onChange={(event) => replaceSceneVersion(scene, { ...sceneVersion, estimatedWords: Number(event.target.value) })} />
          </div>
          <div className="compact-grid">
            {(["pacingIntensity", "conflictIntensity", "emotionalIntensity", "informationDensity", "actionDensity"] as const).map((field) => <label key={field}>{field}<input type="range" min="1" max="5" value={sceneVersion[field]} onChange={(event) => replaceSceneVersion(scene, { ...sceneVersion, [field]: Number(event.target.value) })} /></label>)}
          </div>
          <StateEditor title="场景入口状态" value={sceneVersion.entryState} onChange={(value) => replaceSceneVersion(scene, { ...sceneVersion, entryState: value })} />
          <StateEditor title="场景出口状态" value={sceneVersion.exitState} onChange={(value) => replaceSceneVersion(scene, { ...sceneVersion, exitState: value })} />
          <textarea value={sceneVersion.notes.join("\n")} placeholder="场景备注" onChange={(event) => replaceSceneVersion(scene, { ...sceneVersion, notes: event.target.value.split("\n") })} />
          <div className="button-row">
            <button disabled={scene.order === 0} onClick={() => {
              const scenes = [...chapterVersion.scenes];
              const index = scenes.findIndex((item) => item.id === scene.id);
              [scenes[index - 1], scenes[index]] = [scenes[index], scenes[index - 1]];
              replaceChapterVersion(chapter, { ...chapterVersion, scenes: scenes.map((item, order) => ({ ...item, order })) });
            }}>上移</button>
            <button onClick={() => {
              const copy = structuredClone(scene);
              copy.id = createStableId("scene");
              copy.chapterId = chapter.id;
              copy.order = chapterVersion.scenes.length;
              copy.locked = false;
              copy.versions = copy.versions.map((entry) => ({ ...entry, id: createStableId("scene_version"), title: `${entry.title} 副本`, createdAt: stamp(), modifiedAt: stamp() }));
              copy.selectedVersionId = copy.versions[0]?.id ?? null;
              replaceChapterVersion(chapter, { ...chapterVersion, scenes: [...chapterVersion.scenes, copy] });
            }}>复制场景</button>
            <button onClick={() => sendToAnalysis(`场景分析：${sceneVersion.title}`, sceneVersion, "character_fit")}>发送到剧情分析</button>
            <button onClick={() => sendToAnalysis(`关系推进分析：${sceneVersion.title}`, sceneVersion, "relationship")}>关系分析</button>
            <button className="btn-danger" disabled={scene.locked} onClick={() => replaceChapterVersion(chapter, { ...chapterVersion, scenes: chapterVersion.scenes.filter((item) => item.id !== scene.id) })}>删除场景</button>
          </div>
        </div>}
      </div>}

      {tab === "information" && <div>
        <div className="card-header"><h2>信息流、铺垫与回收</h2><div className="button-row">
          <button onClick={() => {
            const now = stamp();
            const item = InformationItemSchema.parse({ id: createStableId("information"), createdAt: now, modifiedAt: now, title: "新信息" });
            save({ ...current, informationItems: [...current.informationItems, item] });
          }}>新增信息</button>
          <button onClick={() => {
            const now = stamp();
            const item = ForeshadowItemSchema.parse({ id: createStableId("foreshadow"), createdAt: now, modifiedAt: now, label: "新铺垫" });
            save({ ...current, foreshadows: [...current.foreshadows, item] });
          }}>新增铺垫</button>
        </div></div>
        {current.informationItems.map((info) => <div className="branch-box" key={info.id}>
          <input value={info.title} onChange={(event) => save({ ...current, informationItems: current.informationItems.map((item) => item.id === info.id ? { ...item, title: event.target.value } : item) })} />
          <textarea value={info.content} onChange={(event) => save({ ...current, informationItems: current.informationItems.map((item) => item.id === info.id ? { ...item, content: event.target.value } : item) })} />
          <small>作者：{info.authorKnows ? "知情" : "未知"}；读者：{info.readerState}；{info.secrecy}/{info.verification}</small>
        </div>)}
        {current.foreshadows.map((item) => <div className="branch-box" key={item.id}>
          <input value={item.label} onChange={(event) => save({ ...current, foreshadows: current.foreshadows.map((entry) => entry.id === item.id ? { ...entry, label: event.target.value } : entry) })} />
          <p>设置：{item.setupLocationIds.join("、") || "无"}；强化：{item.reinforcementLocationIds.join("、") || "无"}；计划回收：{item.plannedPayoffLocationIds.join("、") || "无"}；实际回收：{item.actualPayoffLocationIds.join("、") || "无"}</p>
          <small>{item.state} · {item.notes}</small>
        </div>)}
      </div>}

      {tab === "coverage" && <div>
        <h2>故事节点覆盖</h2>
        {(validation?.coverage ?? current.plotBeatCoverage).map((item) => <div className={`analysis-issue ${item.status}`} key={item.plotBeatId}>
          <b>{variant?.outline.beats.find((beat) => beat.id === item.plotBeatId)?.title ?? item.plotBeatId}</b>
          <p>{item.status}；完成章节：{item.completionChapterIds.join("、") || "无"}；铺垫：{item.setupLocationIds.join("、") || "无"}；回收：{item.payoffLocationIds.join("、") || "无"}</p>
        </div>)}
      </div>}

      {tab === "versions" && <div>
        <h2>章节与场景版本</h2>
        {chapter && chapterVersion && <div className="branch-box">
          <h3>{chapterVersion.title}</h3>
          <select value={chapter.selectedVersionId ?? ""} onChange={(event) => replaceChapter(chapter.volumeId, { ...chapter, selectedVersionId: event.target.value })}>
            {chapter.versions.map((item) => <option key={item.id} value={item.id}>{item.adopted ? "✓ " : ""}{item.name}</option>)}
          </select>
          <button onClick={() => {
            const copy = cloneChapterVersion(chapterVersion);
            replaceChapter(chapter.volumeId, { ...chapter, versions: [...chapter.versions, copy], selectedVersionId: copy.id });
          }}>复制章节版本</button>
          <button disabled={chapter.versions.length < 2} onClick={compareChapterVersionsInAnalysis}>发送版本到剧情分支比较</button>
          <select value={compareId} onChange={(event) => setCompareId(event.target.value)}><option value="">选择比较版本</option>{chapter.versions.filter((item) => item.id !== chapterVersion.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          {compareId && chapter.versions.some((item) => item.id === compareId) && <pre>{JSON.stringify(compareChapterVersions(chapter.versions.find((item) => item.id === compareId)!, chapterVersion), null, 2)}</pre>}
          {analysisReports.filter(({ report }) => current.selectedAnalysisReportIds.includes(report.id)).flatMap(({ report }) => report.suggestions).map((suggestion) => <div className="notice" key={suggestion.id}>
            <b>{suggestion.title}</b><p>{suggestion.minimumChange}</p>
            <div className="button-row">
              <button onClick={() => replaceChapterVersion(chapter, { ...chapterVersion, notes: [...chapterVersion.notes, `剧情分析：${suggestion.title}：${suggestion.minimumChange}`] })}>保存为章节备注</button>
              <button onClick={() => {
                const copy = cloneChapterVersion(chapterVersion, "a3_suggestion");
                copy.notes.push(`剧情分析：${suggestion.title}：${suggestion.minimumChange}`);
                replaceChapter(chapter.volumeId, { ...chapter, versions: [...chapter.versions, copy], selectedVersionId: copy.id });
              }}>根据建议创建副本</button>
            </div>
          </div>)}
        </div>}
        {scene && sceneVersion && <div className="branch-box">
          <h3>{sceneVersion.title}</h3>
          <select value={scene.selectedVersionId ?? ""} onChange={(event) => replaceScene(chapter!, chapterVersion!, { ...scene, selectedVersionId: event.target.value })}>{scene.versions.map((item) => <option key={item.id} value={item.id}>{item.adopted ? "✓ " : ""}{item.name}</option>)}</select>
          <button onClick={() => {
            const copy = cloneSceneVersion(sceneVersion);
            replaceScene(chapter!, chapterVersion!, { ...scene, versions: [...scene.versions, copy], selectedVersionId: copy.id });
          }}>复制场景版本</button>
          {scene.versions.length > 1 && <pre>{JSON.stringify(compareSceneVersions(scene.versions[0], sceneVersion), null, 2)}</pre>}
        </div>}
      </div>}

      {tab === "issues" && <div>
        <h2>一致性检查（{validation?.issues.length ?? 0}）</h2>
        {validation?.issues.map((item) => <div className={`analysis-issue ${item.severity}`} key={item.id}>
          <b>{item.type} · {item.severity}/{item.confidence}{item.heuristic ? " · 启发式" : " · 确定检查"}</b>
          <p>{item.rationale}</p><p>最小修改：{item.minimumRevision}</p>
          <select value={item.resolution} onChange={(event) => {
            const issues = validation.issues.map((entry) => entry.id === item.id ? { ...entry, resolution: event.target.value as typeof entry.resolution } : entry);
            save({ ...current, issues });
          }}>{["unresolved", "confirmed_error", "intentional_jump", "omitted_transition", "deferred"].map((value) => <option key={value}>{value}</option>)}</select>
        </div>)}
      </div>}

      <div className="button-row">
        <button onClick={() => downloadText(exportChapterPlanningMarkdown({ ...current, issues: validation?.issues ?? current.issues, plotBeatCoverage: validation?.coverage ?? current.plotBeatCoverage }), chapterPlanningFilename(current, "md"), "text/markdown")}>导出 Markdown</button>
        <button onClick={() => downloadText(exportChapterPlanningJSON(current), chapterPlanningFilename(current, "json"), "application/json")}>导出 JSON</button>
        <button onClick={() => fileInput.current?.click()}>导入 JSON</button>
        <input hidden ref={fileInput} type="file" accept="application/json" onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          try {
            props.onAdd(importChapterPlanningJSON(await readValidatedJsonFile(file)));
            setMessage("章节与场景 JSON 已导入。");
          } catch (error) {
            setMessage(`导入失败：${(error as Error).message}`);
          }
        }} />
      </div>
    </section>
  </div>;
}
