"use client";

import { useEffect, useMemo, useState } from "react";
import type { Manuscript, SceneDraft } from "@/domain/prose";
import { EditScopeSchema } from "@/domain/prose";
import type { PersonalStyleBaseline, StyleRiskAnalysisReport, StyleRiskComparison } from "@/domain/style-risk";
import { PersonalStyleBaselineSchema, STYLE_RISK_DISCLAIMER } from "@/domain/style-risk";
import type { ProviderType } from "@/providers/types";
import { acceptRevision, blocksToText, rejectRevision } from "@/services/prose-editing";
import { analyzeStyleRiskDeterministically } from "@/services/style-risk-analysis";
import { createPersonalStyleBaseline } from "@/services/style-risk-baselines";
import { compareStyleRiskReports, createStyleRiskRevision } from "@/services/style-risk-service";

interface Props { manuscript: Manuscript | null; isOnline: boolean; provider: ProviderType; model: string; onUpdateManuscript(value: Manuscript): void }

function selectedScene(manuscript: Manuscript | null): { scene: SceneDraft; text: string } | null {
  if (!manuscript) return null; const chapter = manuscript.chapterDrafts.find((item) => item.id === manuscript.selectedChapterDraftId) ?? manuscript.chapterDrafts[0];
  const scene = chapter?.sceneDrafts.find((item) => item.id === manuscript.selectedSceneDraftId) ?? chapter?.sceneDrafts[0]; if (!scene) return null;
  const version = scene.versions.find((item) => item.id === scene.selectedVersionId) ?? scene.versions.find((item) => item.id === scene.acceptedVersionId) ?? scene.versions.at(-1);
  return version ? { scene, text: blocksToText(version.blocks) } : null;
}

function updateScene(manuscript: Manuscript, scene: SceneDraft): Manuscript {
  return { ...manuscript, chapterDrafts: manuscript.chapterDrafts.map((chapter) => ({ ...chapter, sceneDrafts: chapter.sceneDrafts.map((item) => item.id === scene.id ? scene : item) })), modifiedAt: new Date().toISOString() };
}

function localSuggestion(text: string): string {
  const sentences = text.split(/(?<=[。！？!?])/u); const seen = new Set<string>();
  return sentences.filter((sentence) => { const key = sentence.trim(); if (!key || seen.has(key)) return false; seen.add(key); return true; })
    .join("").replace(/(?:然而|因此|于是)[，,]/g, "").replace(/非常(悲伤|难过|痛苦)/g, "$1").replace(/不由得/g, "");
}

export function StyleRiskWorkspace({ manuscript, isOnline, provider, model, onUpdateManuscript }: Props) {
  const current = useMemo(() => selectedScene(manuscript), [manuscript]);
  const [text, setText] = useState(""); const [source, setSource] = useState<"paste" | "selection" | "scene" | "chapter" | "dialogue" | "narration" | "character_dialogue" | "sample">("paste");
  const [baselineMode, setBaselineMode] = useState<"generic" | "project" | "personal" | "character" | "multi">("generic"); const [useModel, setUseModel] = useState(false);
  const [selection, setSelection] = useState({ start: 0, end: 0 }); const [report, setReport] = useState<StyleRiskAnalysisReport | null>(null);
  const [selectedIssues, setSelectedIssues] = useState<string[]>([]); const [suggestion, setSuggestion] = useState(""); const [comparison, setComparison] = useState<StyleRiskComparison | null>(null);
  const [personalBaselines, setPersonalBaselines] = useState<PersonalStyleBaseline[]>([]); const [sampleName, setSampleName] = useState("我的文风样本"); const [sampleGenre, setSampleGenre] = useState(""); const [samplePov, setSamplePov] = useState(""); const [sampleScope, setSampleScope] = useState("指定章节"); const [sampleCharacters, setSampleCharacters] = useState(""); const [dialogueCharacter, setDialogueCharacter] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const styleProfile = manuscript?.styleProfiles.find((item) => item.id === manuscript.defaultStyleProfileId) ?? manuscript?.styleProfiles[0] ?? null;
  const constraints = manuscript?.languageConstraints.filter((item) => item.enabled) ?? [];
  useEffect(() => { try { const raw = localStorage.getItem("story-card-studio-style-risk-baselines"); if (raw) setPersonalBaselines(PersonalStyleBaselineSchema.array().parse(JSON.parse(raw))); } catch { /* invalid old cache stays isolated */ } }, []);
  useEffect(() => { localStorage.setItem("story-card-studio-style-risk-baselines", JSON.stringify(personalBaselines)); }, [personalBaselines]);

  const chooseSource = (next: typeof source) => {
    setSource(next); if (!manuscript || !current) return;
    if (next === "scene") setText(current.text);
    if (next === "chapter") {
      const chapter = manuscript.chapterDrafts.find((item) => item.sceneDrafts.some((scene) => scene.id === current.scene.id));
      setText(chapter?.sceneDrafts.map((scene) => { const version = scene.versions.find((item) => item.id === scene.acceptedVersionId) ?? scene.versions.at(-1); return version ? blocksToText(version.blocks) : ""; }).filter(Boolean).join("\n\n") ?? "");
    }
    if (next === "dialogue") setText([...current.text.matchAll(/[“「『"]([^”」』"\n]+)[”」』"]/gu)].map((item) => item[0]).join("\n"));
    if (next === "narration") setText(current.text.replace(/[“「『"][^”」』"\n]+[”」』"]/gu, "").replace(/\n{3,}/g, "\n\n").trim());
    if (next === "character_dialogue") {
      const escaped = dialogueCharacter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      setText([...current.text.matchAll(new RegExp(`[“「『\"]([^”」』\"\\n]+)[”」』\"]\\s*${escaped}(?:说道|说|问|答)`, "gu"))].map((item) => item[1]).join("\n"));
    }
  };
  const request = (value: string, external = useModel) => ({
    text: value, mode: baselineMode, scopeType: source === "selection" ? "selection" as const : source === "scene" ? "scene" as const : source === "chapter" ? "chapter" as const : source === "dialogue" ? "dialogue" as const : source === "narration" ? "narration" as const : source === "character_dialogue" ? "character_dialogue" as const : "document" as const,
    useModel: external, styleProfile: baselineMode === "project" || baselineMode === "multi" ? styleProfile : null,
    constraints: baselineMode === "project" || baselineMode === "character" || baselineMode === "multi" ? constraints : [], baselines: baselineMode === "personal" || baselineMode === "multi" ? personalBaselines : [],
  });
  const diagnose = async (value = text) => {
    if (!value.trim()) { setError("请粘贴或选择需要诊断的文本。"); return; } setBusy(true); setError("");
    try {
      let next: StyleRiskAnalysisReport;
      if (useModel && isOnline) {
        const response = await fetch("/api/style-risk/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request: request(value, true), provider, model }) });
        const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "诊断失败"); next = payload.report;
      } else next = analyzeStyleRiskDeterministically(request(value, false));
      setReport(next); setSelectedIssues([]); setSuggestion(""); setComparison(null);
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  };
  const saveBaseline = () => {
    if (!text.trim()) { setError("请先提供自己的历史文本样本。"); return; }
    const baseline = createPersonalStyleBaseline({ name: sampleName, text, genre: sampleGenre, sampleScope, pointOfView: samplePov, characterIds: sampleCharacters.split(/[，,]/).map((item) => item.trim()).filter(Boolean) });
    setPersonalBaselines((items) => [...items, baseline]); setBaselineMode("personal");
  };
  const optimize = async () => {
    const start = selection.end > selection.start ? selection.start : 0; const end = selection.end > selection.start ? selection.end : text.length;
    const target = text.slice(start, end); let next = localSuggestion(target); setBusy(true); setError("");
    if (useModel && isOnline) {
      try { const response = await fetch("/api/style-risk/revision", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: target, issueIds: selectedIssues, instruction: "只处理所选机械感问题，不改变剧情事实、关系和行动结果。", provider, model }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "优化失败"); next = String(payload.replacement || next); }
      catch (cause) { setError(`模型优化不可用，已保留本地最小建议：${(cause as Error).message}`); }
    }
    setSuggestion(next);
    if (manuscript && current) {
      const base = current.scene.versions.find((item) => item.id === current.scene.selectedVersionId) ?? current.scene.versions.at(-1);
      if (base) {
        try {
          const baseText = blocksToText(base.blocks); const actualStart = source === "selection" ? start : 0; const actualEnd = source === "selection" ? end : baseText.length;
          const created = createStyleRiskRevision({ sceneDraft: current.scene, baseVersion: base, replacement: next, scope: EditScopeSchema.parse({ type: "text_range", start: actualStart, end: actualEnd, allowNewFacts: false, allowDeleteInformation: false }), issueIds: selectedIssues, instruction: "仅处理所选机械感问题；不改变剧情事实、关系和行动结果。", provider: "user" });
          onUpdateManuscript(updateScene(manuscript, created.sceneDraft));
        } catch (cause) { setError((cause as Error).message); }
      }
    }
    setComparison(compareStyleRiskReports(request(target, false), request(next, false)));
    setBusy(false);
  };
  const latest = current?.scene.revisions.at(-1) ?? null;
  const commitRevision = (accept: boolean, diffId?: string) => {
    if (!manuscript || !current || !latest) return; const next = accept ? acceptRevision(current.scene, latest.id, diffId ? [diffId] : undefined) : rejectRevision(current.scene, latest.id); onUpdateManuscript(updateScene(manuscript, next));
  };

  return <section className="style-risk-workspace">
    <div className="card"><div className="card-header">AI 味与文本机械感诊断</div><div className="notice" role="note">{STYLE_RISK_DISCLAIMER}</div>
      <div className="button-row">{(["paste", "selection", "scene", "chapter", "dialogue", "narration", "character_dialogue", "sample"] as const).map((item) => <button className={source === item ? "btn-primary" : "btn-secondary"} key={item} onClick={() => chooseSource(item)}>{{ paste: "粘贴文本", selection: "当前选区", scene: "当前场景", chapter: "当前章节", dialogue: "仅对话", narration: "仅叙述", character_dialogue: "指定角色对话", sample: "用户历史样本" }[item]}</button>)}</div>
      {source === "character_dialogue" && <label>角色名称<input value={dialogueCharacter} onChange={(event) => setDialogueCharacter(event.target.value)} onBlur={() => chooseSource("character_dialogue")} /></label>}
      <label>诊断文本<textarea rows={14} value={text} onChange={(event) => setText(event.target.value)} onSelect={(event) => setSelection({ start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd })} /></label>
      <div className="form-grid"><label>诊断基准<select value={baselineMode} onChange={(event) => setBaselineMode(event.target.value as typeof baselineMode)}><option value="generic">通用中文小说</option><option value="project">当前项目文风与语言规则</option><option value="personal">个人样本</option><option value="character">当前角色语言</option><option value="multi">多基准对比</option></select></label>
      <label><input type="checkbox" checked={useModel} onChange={(event) => setUseModel(event.target.checked)} /> 使用模型辅助判断</label></div>
      <div className="button-row"><button className="btn-primary" disabled={busy} onClick={() => void diagnose()}>{busy ? "诊断中…" : useModel ? "运行诊断" : "纯本地确定性诊断"}</button>{useModel && !isOnline && <span className="field-hint">当前离线，将自动使用本地结果。</span>}</div>
      {source === "sample" && <div className="form-grid"><label>样本文件<input type="file" accept="text/plain,.txt" onChange={async (event) => { const file = event.target.files?.[0]; if (file) setText(await file.text()); }} /></label><label>样本名称<input value={sampleName} onChange={(event) => setSampleName(event.target.value)} /></label><label>题材<input value={sampleGenre} onChange={(event) => setSampleGenre(event.target.value)} /></label><label>叙事视角<input value={samplePov} onChange={(event) => setSamplePov(event.target.value)} /></label><label>章节/范围<input value={sampleScope} onChange={(event) => setSampleScope(event.target.value)} /></label><label>特定角色对话（逗号分隔）<input value={sampleCharacters} onChange={(event) => setSampleCharacters(event.target.value)} /></label><div><button className="btn-secondary" onClick={saveBaseline}>只保存统计和抽象文风基准</button>{personalBaselines.map((item) => <p key={item.id}>{item.name} · {item.sampleSize} 字 <button onClick={() => setPersonalBaselines((values) => values.filter((value) => value.id !== item.id))}>删除</button></p>)}</div></div>}
      {error && <div className="error-message">{error}</div>}
    </div>
    {report && <div className="card"><h2>{report.summary}</h2><p><strong>使用基准：</strong>{report.baselines.map((item) => item.name).join("、")}</p><p><strong>总体机械感风险：</strong>{report.overallRisk} {report.overallScore === null ? "（短文本不评分）" : `${report.overallScore}/100`}</p>
      <div className="metric-grid">{report.metrics.map((metric) => <div key={metric.id}><strong>{metric.label}</strong><div>{Number.isInteger(metric.value) ? metric.value : metric.value.toFixed(2)}{metric.unit}</div></div>)}</div>
      <h3>问题</h3>{report.issues.length ? report.issues.map((issue) => <label className={`analysis-issue ${issue.severity}`} key={issue.id}><input type="checkbox" checked={selectedIssues.includes(issue.id)} onChange={(event) => setSelectedIssues((values) => event.target.checked ? [...values, issue.id] : values.filter((id) => id !== issue.id))} /><strong>[{issue.severity}/{issue.confidence}/{issue.isDeterministic ? "确定性" : "启发式"}] {issue.title}</strong><p>{issue.conclusion}</p><p>范围：{issue.textRange.mappingStatus} · {issue.excerpt || "未定位"}</p><p>依据：{issue.evidence.join("；")}</p><p>最小修改：{issue.minimumRevision}</p></label>) : <p>未发现明显风险；这不表示文本质量或作者身份得到证明。</p>}
      <p><strong>不建议机械修改：</strong>{report.doNotChange.join("；")}</p><button className="btn-primary" disabled={!selectedIssues.length || busy} onClick={() => void optimize()}>为所选问题创建局部优化 Revision</button>
    </div>}
    {(suggestion || latest) && <div className="card"><h2>修订与 Diff</h2>{latest ? latest.diffs.map((diff) => <details key={diff.id}><summary>{diff.type} · 段 {diff.order + 1}</summary><pre>− {diff.originalText}</pre><pre>+ {diff.suggestedText}</pre>{diff.type !== "unchanged" && <button className="btn-secondary" onClick={() => commitRevision(true, diff.id)}>仅接受此段</button>}</details>) : <><pre>原文：{text.slice(selection.start, selection.end || text.length)}</pre><pre>建议：{suggestion}</pre></>}
      <div className="button-row">{latest && <><button className="btn-primary" onClick={() => commitRevision(true)}>全部接受</button><button className="btn-danger" onClick={() => commitRevision(false)}>全部拒绝</button></>}<button className="btn-secondary" onClick={() => void diagnose(suggestion)}>重新检测优化稿</button></div>
      {comparison && <p>{comparison.warning}<br />总体分数：{comparison.beforeOverallScore ?? "不稳定"} → {comparison.afterOverallScore ?? "不稳定"}</p>}
    </div>}
  </section>;
}
