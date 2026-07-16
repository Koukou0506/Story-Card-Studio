"use client";

import { useMemo, useRef, useState } from "react";
import type { CharacterCardV2 } from "@/domain/character-card";
import type { Lorebook } from "@/domain/lorebook";
import { createStableId } from "@/domain/lorebook";
import type { PlotAnalysisProject } from "@/domain/plot-analysis";
import { createEmptyAnalysisProject } from "@/domain/plot-analysis";
import { CharacterPlanSchema, TimelineEventSchema, createEmptyBeat, createEmptyStoryPlan, type OutlineVariant, type PlotBeat, type StoryPlan } from "@/domain/story-planning";
import type { ProviderType } from "@/providers/types";
import { buildPlanningContext } from "@/services/planning-context-builder";
import { exportPlanningJSON, exportPlanningMarkdown, importPlanningJSON, planningFilename } from "@/services/planning-export";
import { validatePlanning } from "@/services/planning-validator";
import { cloneVariant, compareVariants } from "@/services/planning-version";
import type { PlanningMode } from "@/services/planning-generator";
import { downloadText } from "@/services/analysis-export";
import type { ChapterPlanningProject } from "@/domain/chapter-planning";
import { ChapterPlanningWorkspace } from "@/components/ChapterPlanningWorkspace";
import { usePwaRuntime } from "@/components/pwa/PwaRuntime";
import { readValidatedJsonFile } from "@/services/file-validation";

interface Props {
  plans: StoryPlan[];
  selected: StoryPlan | null;
  originalIdea?: string;
  card: CharacterCardV2;
  books: Lorebook[];
  analyses: PlotAnalysisProject[];
  provider: ProviderType;
  model: string;
  onAdd: (plan: StoryPlan) => void;
  onUpdate: (plan: StoryPlan) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string | null) => void;
  onSaveVariant: (planId: string, variant: OutlineVariant) => void;
  onCreateAnalysis: (project: PlotAnalysisProject) => void;
  chapterPlanningProjects: ChapterPlanningProject[];
  selectedChapterPlanningProject: ChapterPlanningProject | null;
  onAddChapterPlanning: (project: ChapterPlanningProject) => void;
  onUpdateChapterPlanning: (project: ChapterPlanningProject) => void;
  onDeleteChapterPlanning: (id: string) => void;
  onSelectChapterPlanning: (id: string | null) => void;
}

const modes: PlanningMode[] = ["full", "bible", "characters", "relationships", "outline", "timeline", "expand", "complete", "analysis_revision", "alternative", "local"];
const textBibleFields = ["logline", "synopsis", "corePremise", "narrativePerspective", "timeRange", "worldRulesSummary", "coreConflict", "protagonistGoal", "stakes", "costs", "endingDirection"] as const;
const arrayBibleFields = ["genre", "tone", "themes", "mainLocations", "opposingForces", "immutableConditions", "forbiddenDirections", "unresolvedQuestions"] as const;
const characterFields = ["storyFunction", "initialState", "externalGoal", "internalNeed", "desire", "fear", "falseBelief", "transformation", "endingState"] as const;

export function StoryPlanningWorkspace(props: Props) {
  const { isOnline } = usePwaRuntime();
  const plan = props.selected;
  const [draftVariant, setDraftVariant] = useState<OutlineVariant | null>(null);
  const [tab, setTab] = useState("bible");
  const [mode, setMode] = useState<PlanningMode>("full");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [compareId, setCompareId] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [controller, setController] = useState<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const effectivePlan = plan && !plan.originalIdea && props.originalIdea ? { ...plan, originalIdea: props.originalIdea } : plan;
  const variant = draftVariant || plan?.variants.find((item) => item.id === plan.selectedVariantId) || null;
  const context = useMemo(() => effectivePlan ? buildPlanningContext(effectivePlan, props.card, props.books, props.analyses) : null, [effectivePlan, props.card, props.books, props.analyses]);
  const issues = useMemo(() => variant ? validatePlanning(variant) : [], [variant]);

  const updatePlan = (next: StoryPlan) => props.onUpdate({ ...next, modifiedAt: new Date().toISOString() });
  const updateVariant = (next: OutlineVariant) => {
    if (!plan) return;
    if (draftVariant) setDraftVariant(next);
    else updatePlan({ ...plan, variants: plan.variants.map((item) => item.id === next.id ? next : item) });
  };
  const updateBeat = (beatId: string, patch: Partial<PlotBeat>) => {
    if (!variant) return;
    updateVariant({ ...variant, outline: { ...variant.outline, beats: variant.outline.beats.map((beat) => beat.id === beatId ? { ...beat, ...patch } : beat) } });
  };
  const createPlan = () => props.onAdd(createEmptyStoryPlan(`小说规划 ${props.plans.length + 1}`));
  const sendToA3 = (text: string, title: string) => {
    const project = createEmptyAnalysisProject();
    project.title = title;
    project.input.title = title;
    project.input.proposedPlot = text;
    project.input.participatingCharacters = variant?.characterPlans.map((item) => item.characterName) || [];
    project.selectedCharacterIds = props.card.data.name ? [props.card.data.name] : [];
    project.selectedLorebookIds = plan?.selectedLorebookIds || [];
    props.onCreateAnalysis(project);
    setMessage("已创建剧情分析输入快照；当前规划未被修改。");
  };
  const generate = async () => {
    if (!effectivePlan) return;
    if (!isOnline) { setMessage("当前离线，规划生成已暂停；已保存版本仍可编辑和导出。"); return; }
    const abort = new AbortController();
    setController(abort); setLoading(true); setMessage("");
    try {
      const response = await fetch("/api/generate-plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan: effectivePlan, mode, characterCard: props.card, lorebooks: props.books, analysisProjects: props.analyses, provider: props.provider, model: props.model }), signal: abort.signal });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || `请求失败 (${response.status})`);
      setDraftVariant(body.data);
      setMessage(`规划草稿已生成；发现 ${body.issues?.length || 0} 个一致性问题。锁定内容未覆盖，请确认后保存为新版本。`);
    } catch (error) {
      setMessage(abort.signal.aborted ? "生成已取消。" : `生成失败：${(error as Error).message}`);
    } finally { setLoading(false); setController(null); }
  };

  if (!plan) return <div className="card empty-state"><h2>小说规划基础层</h2><p>从故事圣经、角色弧和宏观情节开始。</p><button className="btn-primary" onClick={createPlan}>新建小说规划</button></div>;
  const comparisonVariant = compareId ? plan.variants.find((item) => item.id === compareId) : null;
  const comparison = comparisonVariant && variant ? compareVariants(comparisonVariant, variant) : null;
  const exportPlan = draftVariant ? { ...plan, variants: plan.variants.map((item) => item.id === draftVariant.id ? draftVariant : item) } : plan;

  return <div className="planning-layout">
    <section className="card planning-toolbar full-width">
      <select value={plan.id} onChange={(event) => props.onSelect(event.target.value)}>{props.plans.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <input value={plan.name} onChange={(event) => updatePlan({ ...plan, name: event.target.value })} />
      <button className="btn-secondary" onClick={createPlan}>新建</button>
      <button className="btn-danger" onClick={() => window.confirm("删除规划但保留角色卡、世界书和剧情分析报告？") && props.onDelete(plan.id)}>删除</button>
      <select value={variant?.id || ""} onChange={(event) => { setDraftVariant(null); updatePlan({ ...plan, selectedVariantId: event.target.value }); }}>{plan.variants.map((item) => <option key={item.id} value={item.id}>{item.adopted ? "★ " : ""}{item.name}</option>)}</select>
      {variant && <><button className="btn-secondary" onClick={() => props.onSaveVariant(plan.id, cloneVariant(variant))}>复制版本</button>{!variant.adopted && <button className="btn-primary" onClick={() => updatePlan({ ...plan, adoptedVariantId: variant.id, variants: plan.variants.map((item) => ({ ...item, adopted: item.id === variant.id })) })}>采用此版本</button>}</>}
    </section>

    <section className="card planning-context"><div className="card-header">生成与上下文</div>
      <p className="field-hint">原始创意（来自创意输入）：{effectivePlan?.originalIdea || "尚未填写"}</p>
      <textarea value={plan.generationGoal} onChange={(event) => updatePlan({ ...plan, generationGoal: event.target.value })} placeholder="本次规划目标/已有梗概" />
      {props.card.data.name && <label><input type="checkbox" checked={plan.selectedCharacterIds.includes(props.card.data.name)} onChange={(event) => updatePlan({ ...plan, selectedCharacterIds: event.target.checked ? [...new Set([...plan.selectedCharacterIds, props.card.data.name])] : plan.selectedCharacterIds.filter((id) => id !== props.card.data.name) })} /> 使用角色卡：{props.card.data.name}</label>}
      <div>{props.books.map((book) => <label key={book.id}><input type="checkbox" checked={plan.selectedLorebookIds.includes(book.id)} onChange={(event) => updatePlan({ ...plan, selectedLorebookIds: event.target.checked ? [...new Set([...plan.selectedLorebookIds, book.id])] : plan.selectedLorebookIds.filter((id) => id !== book.id) })} />{book.name}</label>)}</div>
      <div>{props.analyses.flatMap((project) => project.reports).map((report) => <label key={report.id}><input type="checkbox" checked={plan.selectedAnalysisReportIds.includes(report.id)} onChange={(event) => updatePlan({ ...plan, selectedAnalysisReportIds: event.target.checked ? [...new Set([...plan.selectedAnalysisReportIds, report.id])] : plan.selectedAnalysisReportIds.filter((id) => id !== report.id) })} /> 剧情分析：{report.inputSnapshot.title}</label>)}</div>
      <select value={mode} onChange={(event) => setMode(event.target.value as PlanningMode)}>{modes.map((item) => <option key={item} value={item}>{item}</option>)}</select>
      <div className="provider-row"><span>{props.provider} / {props.model}</span>{loading ? <button className="btn-danger" onClick={() => controller?.abort()}>取消</button> : <button className="btn-primary" disabled={!isOnline} onClick={generate}>生成规划草稿</button>}</div>
      {!isOnline && <div className="notice">离线状态下不会提交规划生成请求。</div>}
      {message && <div className="notice">{message}</div>}
      <details><summary>本次上下文 ~{context?.estimatedTokens || 0}/{plan.tokenBudget} tokens</summary>{context?.sources.map((source) => <div className={source.included ? "context-row included" : "context-row excluded"} key={source.id}><strong>{source.name}</strong><small>权威 {source.authority} · {source.locked ? "锁定" : "只读来源"} · {source.included ? "已发送" : "未发送"} · {source.reason}</small><p>{source.content.slice(0, 240)}</p></div>)}</details>
    </section>

    <section className="card planning-main"><div className="tabs">{["bible", "characters", "arcs", "outline", "timeline", "chapters", "versions", "issues"].map((item) => <button className={`tab ${tab === item ? "active" : ""}`} onClick={() => setTab(item)} key={item}>{item}</button>)}</div>
      {!variant ? <p>无版本</p> : <>
        {tab === "chapters" && <ChapterPlanningWorkspace projects={props.chapterPlanningProjects.filter(item=>item.b1PlanId===plan.id)} selected={props.selectedChapterPlanningProject?.b1PlanId===plan.id?props.selectedChapterPlanningProject:null} storyPlan={plan} card={props.card} books={props.books} analyses={props.analyses} provider={props.provider} model={props.model} onAdd={props.onAddChapterPlanning} onUpdate={props.onUpdateChapterPlanning} onDelete={props.onDeleteChapterPlanning} onSelect={props.onSelectChapterPlanning} onCreateAnalysis={props.onCreateAnalysis}/>} 
        {tab === "bible" && <div><h2>故事圣经</h2>{textBibleFields.map((field) => <label className="analysis-field" key={field}>{field}<span><input type="checkbox" checked={variant.storyBible.lockedFields.includes(field)} onChange={(event) => updateVariant({ ...variant, storyBible: { ...variant.storyBible, lockedFields: event.target.checked ? [...variant.storyBible.lockedFields, field] : variant.storyBible.lockedFields.filter((item) => item !== field) } })} />锁定</span>{field === "synopsis" ? <textarea value={variant.storyBible[field]} onChange={(event) => updateVariant({ ...variant, storyBible: { ...variant.storyBible, [field]: event.target.value } })} /> : <input value={variant.storyBible[field]} onChange={(event) => updateVariant({ ...variant, storyBible: { ...variant.storyBible, [field]: event.target.value } })} />}</label>)}{arrayBibleFields.map((field) => <label key={field}>{field}<textarea value={variant.storyBible[field].join("\n")} onChange={(event) => updateVariant({ ...variant, storyBible: { ...variant.storyBible, [field]: event.target.value.split("\n").filter(Boolean) } })} /></label>)}</div>}
        {tab === "characters" && <div><h2>角色规划</h2>{variant.characterPlans.map((character) => <div className="branch-box" key={character.id}><strong>{character.characterName}（关联角色卡：{character.linkedCharacterCardId || "未关联"}）</strong>{characterFields.map((field) => <label key={field}>{field}<input value={character[field]} onChange={(event) => updateVariant({ ...variant, characterPlans: variant.characterPlans.map((item) => item.id === character.id ? { ...item, [field]: event.target.value } : item) })} /></label>)}<p>优势：{character.strengths.join("、")}；弱点：{character.weaknesses.join("、")}</p></div>)}{props.card.data.name && <button className="btn-secondary" onClick={() => updateVariant({ ...variant, characterPlans: [...variant.characterPlans, CharacterPlanSchema.parse({ id: createStableId("character_plan"), characterId: props.card.data.name, characterName: props.card.data.name, linkedCharacterCardId: props.card.data.name, createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString() })] })}>从当前角色卡添加规划</button>}</div>}
        {tab === "arcs" && <div><h2>角色弧与关系路线</h2>{variant.characterArcs.map((arc) => <div className="branch-box" key={arc.id}><b>{arc.type}</b><label>核心矛盾<input value={arc.coreContradiction} onChange={(event) => updateVariant({ ...variant, characterArcs: variant.characterArcs.map((item) => item.id === arc.id ? { ...item, coreContradiction: event.target.value } : item) })} /></label><p>触发：{arc.incitingEventBeatId}；最终选择：{arc.finalChoiceBeatId}；结局：{arc.endingState}</p><button className="btn-secondary" onClick={() => sendToA3(JSON.stringify(arc), "角色弧人物契合度分析")}>发送到剧情分析</button></div>)}{variant.relationshipArcs.map((relationship) => <div className="branch-box" key={relationship.id}><b>{relationship.characterIds.join(" / ")}</b><label>初始关系<input value={relationship.initialRelationship} onChange={(event) => updateVariant({ ...variant, relationshipArcs: variant.relationshipArcs.map((item) => item.id === relationship.id ? { ...item, initialRelationship: event.target.value } : item) })} /></label><p>{relationship.initialRelationship} → {relationship.finalState}；转折：{relationship.turningBeatIds.join("、")}</p></div>)}</div>}
        {tab === "outline" && <div><div className="card-header"><span>宏观情节大纲（{variant.outline.structure}）</span><button className="btn-primary" onClick={() => updateVariant({ ...variant, outline: { ...variant.outline, beats: [...variant.outline.beats, createEmptyBeat(variant.outline.beats.length)] } })}>新增节点</button></div>{variant.outline.beats.map((beat, index) => <div className="beat-card" key={beat.id}><header><input value={beat.title} onChange={(event) => updateBeat(beat.id, { title: event.target.value })} /><label><input type="checkbox" checked={beat.locked} onChange={(event) => updateBeat(beat.id, { locked: event.target.checked, status: event.target.checked ? "locked" : "draft" })} />锁定</label></header><textarea value={beat.summary} placeholder="摘要" onChange={(event) => updateBeat(beat.id, { summary: event.target.value })} /><div className="compact-grid"><input value={beat.purpose} placeholder="剧情目的" onChange={(event) => updateBeat(beat.id, { purpose: event.target.value })} /><input value={beat.location} placeholder="地点" onChange={(event) => updateBeat(beat.id, { location: event.target.value })} /><input value={beat.trigger} placeholder="触发原因" onChange={(event) => updateBeat(beat.id, { trigger: event.target.value })} /><input value={beat.mainAction} placeholder="主要行动" onChange={(event) => updateBeat(beat.id, { mainAction: event.target.value })} /><input value={beat.directResult} placeholder="直接结果" onChange={(event) => updateBeat(beat.id, { directResult: event.target.value })} /><input value={beat.risksAndCosts} placeholder="风险和代价" onChange={(event) => updateBeat(beat.id, { risksAndCosts: event.target.value })} /></div><textarea value={beat.longTermConsequences.join("\n")} placeholder="长期后果（每行一项）" onChange={(event) => updateBeat(beat.id, { longTermConsequences: event.target.value.split("\n").filter(Boolean) })} /><small>角色变化 {beat.characterChanges.length} / 关系变化 {beat.relationshipChanges.length} / 世界变化 {beat.worldChanges.length} / 依赖 {beat.dependencies.length}</small><div className="button-row"><button disabled={!index} onClick={() => { const beats = [...variant.outline.beats]; [beats[index - 1], beats[index]] = [beats[index], beats[index - 1]]; updateVariant({ ...variant, outline: { ...variant.outline, beats } }); }}>上移</button><button disabled={index === variant.outline.beats.length - 1} onClick={() => { const beats = [...variant.outline.beats]; [beats[index], beats[index + 1]] = [beats[index + 1], beats[index]]; updateVariant({ ...variant, outline: { ...variant.outline, beats } }); }}>下移</button><button onClick={() => updateVariant({ ...variant, outline: { ...variant.outline, beats: [...variant.outline.beats, { ...structuredClone(beat), id: createStableId("beat"), title: `${beat.title} 副本`, locked: false, status: "draft" }] } })}>复制</button><button className="btn-secondary" onClick={() => sendToA3(JSON.stringify(beat), `情节节点分析：${beat.title}`)}>发送到剧情分析</button><button className="btn-danger" disabled={beat.locked} onClick={() => updateVariant({ ...variant, outline: { ...variant.outline, beats: variant.outline.beats.filter((item) => item.id !== beat.id) } })}>删除</button></div></div>)}<button className="btn-secondary" onClick={() => sendToA3(variant.outline.beats.map((beat) => `${beat.title}: ${beat.summary}`).join("\n"), "完整规划剧情分析")}>将规划发送到剧情分析</button></div>}
        {tab === "timeline" && <div><h2>事件时间线</h2>{[...variant.timeline.events].sort((left, right) => left.order - right.order).map((event) => <div className="timeline-item" key={event.id}><b>{event.date || (event.storyDay !== null ? `故事第 ${event.storyDay} 天` : event.relativeToEventId ? `相对 ${event.relativeToEventId}` : "仅确定顺序")}</b><span>{event.title} · {event.location}</span><small>{event.result}；对应节点：{event.plotBeatId}</small></div>)}<button className="btn-secondary" onClick={() => updateVariant({ ...variant, timeline: { ...variant.timeline, events: [...variant.timeline.events, TimelineEventSchema.parse({ id: createStableId("timeline_event"), title: `事件 ${variant.timeline.events.length + 1}`, order: variant.timeline.events.length, createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString() })] } })}>新增时间线事件</button></div>}
        {tab === "versions" && <div><h2>版本比较</h2><select value={compareId} onChange={(event) => setCompareId(event.target.value)}><option value="">选择基准版本</option>{plan.variants.filter((item) => item.id !== variant.id).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select>{comparison && <pre>{JSON.stringify(comparison, null, 2)}</pre>}<div className="button-row"><button onClick={() => updateVariant({ ...variant, name: `${variant.name} 重命名` })}>重命名</button><button onClick={() => updateVariant({ ...variant, status: "deprecated" })}>废弃但保留</button></div></div>}
        {tab === "issues" && <div><h2>一致性检查（{issues.length}）</h2><select value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)}><option value="">全部严重程度</option>{["critical", "major", "moderate", "minor", "note"].map((item) => <option key={item}>{item}</option>)}</select>{issues.filter((item) => !severityFilter || item.severity === severityFilter).map((item) => <div className={`analysis-issue ${item.severity}`} key={item.id}><b>{item.type} · {item.severity}/{item.confidence}</b><p>{item.rationale}</p><p>最小修改：{item.minimumRevision}</p><p>副作用：{item.sideEffects.join("；")}</p></div>)}</div>}
        <div className="button-row">{draftVariant && <button className="btn-primary" onClick={() => { props.onSaveVariant(plan.id, { ...draftVariant, issues, status: "draft" }); setDraftVariant(null); setMessage("草稿已保存为新版本，旧版本保留。"); }}>确认并保存为新版本</button>}<button onClick={() => downloadText(exportPlanningMarkdown(exportPlan, variant, issues), planningFilename(exportPlan, "md"), "text/markdown")}>导出 Markdown</button><button onClick={() => downloadText(exportPlanningJSON(exportPlan), planningFilename(exportPlan, "json"), "application/json")}>导出 JSON</button><button onClick={() => fileRef.current?.click()}>导入 JSON</button><input hidden ref={fileRef} type="file" accept="application/json,.json" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; try { props.onAdd(importPlanningJSON(await readValidatedJsonFile(file))); setMessage("规划 JSON 已导入。"); } catch (error) { setMessage((error as Error).message); } finally { event.currentTarget.value = ""; } }} /></div>
      </>}
    </section>
  </div>;
}
