"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CharacterCardV2 } from "@/domain/character-card";
import {
  createEmptyLorebook,
  createEmptyLorebookEntry,
  createStableId,
  type Lorebook,
  type LorebookEntry,
  type LorebookGenerationInput,
} from "@/domain/lorebook";
import type { ProjectInput } from "@/domain/project-input";
import type { ProviderType } from "@/providers/types";
import { simulateActivation } from "@/services/activation-simulator";
import { runLorebookQualityChecks } from "@/services/lorebook-quality";
import {
  downloadLorebook,
  importLorebookJSON,
  previewLorebookMerge,
  readCharacterBook,
  writeCharacterBook,
} from "@/services/lorebook-io";
import { usePwaRuntime } from "@/components/pwa/PwaRuntime";
import { readValidatedJsonFile } from "@/services/file-validation";

interface Props {
  projectInput: ProjectInput;
  characterCard: CharacterCardV2;
  lorebooks: Lorebook[];
  selected: Lorebook | null;
  onAdd: (book: Lorebook) => void;
  onUpdate: (book: Lorebook) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string | null) => void;
  onLoadCharacterCard: (card: CharacterCardV2) => void;
}

const CATEGORIES = ["世界规则", "时代与背景", "地点", "人物", "组织与阵营", "种族或群体", "物品", "能力与技术", "术语", "历史事件", "社会关系", "禁忌与行为约束", "其他"];
const MODEL_OPTIONS: Record<ProviderType, string[]> = { mock: ["mock-model"], openai: ["gpt-4o-mini", "gpt-4.1"], anthropic: ["claude-haiku-4-5-20251001", "claude-sonnet-5-20251001"] };

function splitKeys(value: string): string[] {
  return value.split(/[,，\n]+/).map(item => item.trim()).filter(Boolean);
}

export function LorebookWorkspace(props: Props) {
  const { isOnline } = usePwaRuntime();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("全部");
  const [advanced, setAdvanced] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [simulationText, setSimulationText] = useState("");
  const [supplement, setSupplement] = useState("");
  const [scope, setScope] = useState("");
  const [avoid, setAvoid] = useState("");
  const [generationMode, setGenerationMode] = useState<LorebookGenerationInput["mode"]>("full");
  const [source, setSource] = useState<"idea" | "character" | "both">("both");
  const [provider, setProvider] = useState<ProviderType>("mock");
  const [model, setModel] = useState("mock-model");
  const [generating, setGenerating] = useState(false);
  const [controller, setController] = useState<AbortController | null>(null);
  const [message, setMessage] = useState("");
  const [embedMode, setEmbedMode] = useState<"cancel" | "replace" | "merge">("cancel");
  const [visibleCount, setVisibleCount] = useState(30);
  const fileRef = useRef<HTMLInputElement>(null);

  const book = props.selected;
  const filtered = useMemo(() => !book ? [] : book.entries.filter(entry => {
    const term = search.toLocaleLowerCase();
    const matchesSearch = !term || entry.name.toLocaleLowerCase().includes(term) || entry.content.toLocaleLowerCase().includes(term) || entry.activation.primaryKeys.some(key => key.toLocaleLowerCase().includes(term));
    return matchesSearch && (category === "全部" || entry.category === category);
  }), [book, search, category]);
  useEffect(() => setVisibleCount(30), [book?.id, search, category]);
  const visibleEntries = filtered.slice(0, visibleCount);
  const quality = useMemo(() => book ? runLorebookQualityChecks(book, { characterData: props.characterCard.data, targetFormat: "sillytavern_world_info" }) : null, [book, props.characterCard.data]);
  const simulation = useMemo(() => book ? simulateActivation(book, simulationText) : null, [book, simulationText]);
  const mergePreview = useMemo(() => {
    if (!book || !props.characterCard.data.character_book) return null;
    try { return previewLorebookMerge(readCharacterBook(props.characterCard).lorebook, book); } catch { return null; }
  }, [book, props.characterCard]);

  const update = (next: Lorebook) => props.onUpdate({ ...next, metadata: { ...next.metadata, modifiedAt: new Date().toISOString() } });
  const updateEntry = (id: string, mutate: (entry: LorebookEntry) => LorebookEntry) => {
    if (!book) return;
    update({ ...book, entries: book.entries.map(entry => entry.id === id ? mutate(structuredClone(entry)) : entry) });
  };
  const toggleExpanded = (id: string) => setExpanded(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  const generate = async () => {
    if (!isOnline) { setMessage("当前离线，世界书模型生成已暂停；现有条目仍可编辑和导出。"); return; }
    const abort = new AbortController();
    setController(abort); setGenerating(true); setMessage("");
    const input: LorebookGenerationInput = {
      originalIdea: source === "character" ? "" : props.projectInput.originalIdea,
      creationMode: props.projectInput.creationMode,
      characterData: source === "idea" ? null : props.characterCard.data,
      supplementalSetting: supplement,
      scope,
      avoidContent: avoid || props.projectInput.forbiddenContent,
      mode: generationMode,
      existingEntries: book?.entries || [],
    };
    try {
      const response = await fetch("/api/generate-lorebook", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input, provider, model }), signal: abort.signal });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || `请求失败 (${response.status})`);
      const generated = result.data as Lorebook;
      if (book && generationMode !== "full") {
        const preview = previewLorebookMerge(book, generated);
        update(preview.merged);
        setMessage(`已生成并安全合并：新增 ${preview.added.length}，修改 ${preview.modified.length}，冲突 ${preview.conflicts.length}（冲突保留原文）。`);
      } else props.onAdd(generated);
      setMessage(prev => prev || `世界书草稿生成成功（${result.meta?.model}）。`);
    } catch (error) {
      setMessage(abort.signal.aborted ? "世界书生成已取消。" : `生成失败：${(error as Error).message}`);
    } finally { setGenerating(false); setController(null); }
  };

  const importFile = async (file?: File) => {
    if (!file) return;
    try {
      const imported = importLorebookJSON(await readValidatedJsonFile(file), { name: file.name.replace(/\.json$/i, "") });
      props.onAdd(imported.lorebook);
      setMessage(`已导入 ${imported.lorebook.name}；兼容性警告 ${imported.warnings.length} 条。`);
    } catch (error) { setMessage(`导入失败：${(error as Error).message}`); }
    if (fileRef.current) fileRef.current.value = "";
  };

  const embed = () => {
    if (!book || embedMode === "cancel") { setMessage("已取消写入角色卡。"); return; }
    const target = embedMode === "merge" && mergePreview ? mergePreview.merged : book;
    if (embedMode === "merge" && mergePreview?.conflicts.length) {
      setMessage(`合并检测到 ${mergePreview.conflicts.length} 个正文冲突；已保留角色卡原条目，未静默覆盖。`);
    }
    const result = writeCharacterBook(props.characterCard, target);
    props.onLoadCharacterCard(result.card);
    setMessage(`已${embedMode === "replace" ? "替换" : "合并"} data.character_book；警告 ${result.warnings.length} 条。`);
  };

  return (
    <div className="lorebook-layout">
      <div className="card lorebook-sidebar">
        <div className="card-header"><span>世界书总览</span><button className="btn-primary" onClick={() => props.onAdd(createEmptyLorebook())}>新建世界书</button></div>
        <select value={book?.id || ""} onChange={event => props.onSelect(event.target.value || null)} style={{ width: "100%", marginBottom: ".75rem" }}>
          <option value="">选择世界书</option>{props.lorebooks.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        {book && <>
          <input value={book.name} onChange={event => update({ ...book, name: event.target.value })} style={{ width: "100%", marginBottom: ".5rem" }} aria-label="世界书名称" />
          <textarea value={book.description} onChange={event => update({ ...book, description: event.target.value })} placeholder="世界书简介" style={{ width: "100%" }} />
          <div className="stat-grid">
            <span>条目 {book.entries.length}</span><span>启用 {book.entries.filter(e => e.enabled).length}</span><span>常驻 {book.entries.filter(e => e.enabled && e.activation.constant).length}</span><span>正文 {book.entries.reduce((n, e) => n + e.content.length, 0)} 字</span><span>关联角色 {book.metadata.linkedCharacterIds.length || (props.characterCard.data.name ? 1 : 0)}</span><span>来源 {book.metadata.sourceFormat}</span>
          </div>
          <div className="field-hint">最近修改：{new Date(book.metadata.modifiedAt).toLocaleString()} · 自动保存草稿</div>
          <div className="button-row">
            <button className="btn-primary" onClick={() => { update(book); setMessage("世界书草稿已保存到本地项目。 "); }}>保存草稿</button>
            <button className="btn-secondary" onClick={() => props.onAdd({ ...structuredClone(book), id: createStableId("lorebook"), name: `${book.name} 副本`, metadata: { ...book.metadata, createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString() } })}>复制</button>
            <button className="btn-danger" onClick={() => { if (window.confirm(`确定删除世界书“${book.name}”吗？角色卡不会被删除。`)) props.onDelete(book.id); }}>删除</button>
          </div>
        </>}
        <hr />
        <div className="field-label">从想法/角色卡生成</div>
        <div className="compact-grid">
          <select value={source} onChange={e => setSource(e.target.value as typeof source)}><option value="idea">从现有想法</option><option value="character">从当前角色卡</option><option value="both">想法和角色卡联合</option></select>
          <select value={generationMode} onChange={e => setGenerationMode(e.target.value as typeof generationMode)}><option value="full">生成完整世界书</option><option value="fill_missing">仅补充缺失条目</option><option value="update_related">更新相关条目</option><option value="extract_character">提取角色世界设定</option></select>
          <select value={provider} onChange={e => { const next = e.target.value as ProviderType; setProvider(next); setModel(MODEL_OPTIONS[next][0]); }}><option value="mock">Mock</option><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option></select>
          <select value={model} onChange={e => setModel(e.target.value)}>{MODEL_OPTIONS[provider].map(item => <option key={item}>{item}</option>)}</select>
        </div>
        <textarea value={supplement} onChange={e => setSupplement(e.target.value)} placeholder="用户补充设定" style={{ width: "100%" }} />
        <input value={scope} onChange={e => setScope(e.target.value)} placeholder="希望生成的世界书范围" style={{ width: "100%", marginTop: ".4rem" }} />
        <input value={avoid} onChange={e => setAvoid(e.target.value)} placeholder="希望避免的内容" style={{ width: "100%", marginTop: ".4rem" }} />
        <div className="button-row">{generating ? <button className="btn-danger" onClick={() => controller?.abort()}>取消生成</button> : <button className="btn-primary" disabled={!isOnline} onClick={generate}>生成世界书草稿</button>}</div>
        {!isOnline && <div className="notice">离线状态下不会提交模型请求。</div>}
        {message && <div className="notice">{message}</div>}
      </div>

      <div className="card lorebook-entry-pane">
        <div className="card-header"><span>条目编辑器</span>{book && <button className="btn-primary" onClick={() => update({ ...book, entries: [...book.entries, createEmptyLorebookEntry(book.entries.length)] })}>新增条目</button>}</div>
        {!book ? <div className="empty-state">新建、选择或导入一个世界书后开始编辑。</div> : <>
          <div className="compact-grid"><input value={search} onChange={e => setSearch(e.target.value)} placeholder="按名称、关键词或正文搜索" /><select value={category} onChange={e => setCategory(e.target.value)}><option>全部</option>{CATEGORIES.map(item => <option key={item}>{item}</option>)}</select></div>
          <div className="button-row"><button className="btn-secondary" onClick={() => update({ ...book, entries: book.entries.map(e => ({ ...e, enabled: true })) })}>批量启用</button><button className="btn-secondary" onClick={() => update({ ...book, entries: book.entries.map(e => ({ ...e, enabled: false })) })}>批量停用</button><button className="btn-secondary" onClick={() => setAdvanced(!advanced)}>{advanced ? "隐藏" : "显示"}高级规则</button><button className="btn-secondary" onClick={() => setExpanded(new Set(expanded.size ? [] : filtered.map(e => e.id)))}>{expanded.size ? "全部收起" : "全部展开"}</button></div>
          <div className="entry-list">{visibleEntries.map((entry) => {
            const index = book.entries.findIndex(item => item.id === entry.id);
            const warnings = quality?.issues.filter(issue => issue.entryIds.includes(entry.id)) || [];
            return <div className="entry-card" key={entry.id}>
              <button type="button" className="entry-heading" aria-expanded={expanded.has(entry.id)} onClick={() => toggleExpanded(entry.id)}><span>{entry.enabled ? "🟢" : "⚪"} {entry.name || "未命名条目"}</span><span>{warnings.length ? `⚠ ${warnings.length}` : ""} {expanded.has(entry.id) ? "▲" : "▼"}</span></button>
              {expanded.has(entry.id) && <div className="entry-body">
                <div className="compact-grid"><input value={entry.name} onChange={e => updateEntry(entry.id, x => ({ ...x, name: e.target.value }))} placeholder="条目名称" /><select value={entry.category} onChange={e => updateEntry(entry.id, x => ({ ...x, category: e.target.value }))}>{CATEGORIES.map(item => <option key={item}>{item}</option>)}</select></div>
                <input value={entry.activation.primaryKeys.join(", ")} onChange={e => updateEntry(entry.id, x => ({ ...x, activation: { ...x.activation, primaryKeys: splitKeys(e.target.value) } }))} placeholder="主关键词，用逗号分隔；支持 /正则/flags" style={{ width: "100%" }} />
                <textarea value={entry.content} onChange={e => updateEntry(entry.id, x => ({ ...x, content: e.target.value }))} placeholder="独立完整的条目正文" style={{ width: "100%", minHeight: "110px" }} />
                <div className="check-row"><label><input type="checkbox" checked={entry.enabled} onChange={e => updateEntry(entry.id, x => ({ ...x, enabled: e.target.checked }))} /> 启用</label><label><input type="checkbox" checked={entry.activation.constant} onChange={e => updateEntry(entry.id, x => ({ ...x, activation: { ...x.activation, constant: e.target.checked } }))} /> 始终激活</label><label>顺序 <input type="number" value={entry.insertionOrder} onChange={e => updateEntry(entry.id, x => ({ ...x, insertionOrder: Number(e.target.value) }))} /></label><select value={entry.position} onChange={e => updateEntry(entry.id, x => ({ ...x, position: e.target.value as LorebookEntry["position"] }))}><option value="before_character">角色定义前</option><option value="after_character">角色定义后</option><option value="before_examples">示例消息前</option><option value="after_examples">示例消息后</option><option value="author_note_top">作者注释顶部</option><option value="author_note_bottom">作者注释底部</option><option value="at_depth">聊天深度</option><option value="outlet">Outlet</option></select></div>
                {advanced && <div className="advanced-box">
                  <input value={entry.activation.secondaryKeys.join(", ")} onChange={e => updateEntry(entry.id, x => ({ ...x, activation: { ...x.activation, secondaryKeys: splitKeys(e.target.value), selective: splitKeys(e.target.value).length > 0 } }))} placeholder="次级关键词" />
                  <select value={entry.activation.secondaryLogic} onChange={e => updateEntry(entry.id, x => ({ ...x, activation: { ...x.activation, secondaryLogic: e.target.value as LorebookEntry["activation"]["secondaryLogic"] } }))}><option value="and_any">AND ANY</option><option value="and_all">AND ALL</option><option value="not_any">NOT ANY</option><option value="not_all">NOT ALL</option></select>
                  <label>大小写 <select value={String(entry.activation.caseSensitive)} onChange={e => updateEntry(entry.id, x => ({ ...x, activation: { ...x.activation, caseSensitive: e.target.value === "null" ? null : e.target.value === "true" } }))}><option value="null">跟随全局</option><option value="false">不区分</option><option value="true">区分</option></select></label>
                  <label>概率 <input type="number" min="0" max="100" value={entry.activation.probability} onChange={e => updateEntry(entry.id, x => ({ ...x, activation: { ...x.activation, probability: Number(e.target.value) } }))} /></label>
                  <label>扫描深度 <input type="number" value={entry.activation.scanDepth ?? ""} onChange={e => updateEntry(entry.id, x => ({ ...x, activation: { ...x.activation, scanDepth: e.target.value === "" ? null : Number(e.target.value) } }))} /></label>
                  {(["sticky", "cooldown", "delay"] as const).map(field => <label key={field}>{field} <input type="number" value={entry.activation[field] ?? ""} onChange={e => updateEntry(entry.id, x => ({ ...x, activation: { ...x.activation, [field]: e.target.value === "" ? null : Number(e.target.value) } }))} /></label>)}
                  <label>depth <input type="number" value={entry.depth} onChange={e => updateEntry(entry.id, x => ({ ...x, depth: Number(e.target.value) }))} /></label><label>role <select value={entry.role} onChange={e => updateEntry(entry.id, x => ({ ...x, role: e.target.value as LorebookEntry["role"] }))}><option>system</option><option>user</option><option>assistant</option></select></label><label>group <input value={entry.activation.group} onChange={e => updateEntry(entry.id, x => ({ ...x, activation: { ...x.activation, group: e.target.value } }))} /></label>
                  <label><input type="checkbox" checked={entry.activation.recursive} onChange={e => updateEntry(entry.id, x => ({ ...x, activation: { ...x.activation, recursive: e.target.checked } }))} /> 允许递归</label>
                  <div className="field-hint">extensions {Object.keys(entry.extensions).length} 个；格式专属字段 {Object.keys(entry.formatSpecificData.sillyTavern).length + Object.keys(entry.formatSpecificData.characterBook).length} 个，编辑正文不会清除。</div>
                  <details style={{ width: "100%" }}><summary>查看 extensions 与格式专属字段</summary><pre style={{ whiteSpace: "pre-wrap", maxHeight: "220px", overflow: "auto" }}>{JSON.stringify({ extensions: entry.extensions, formatSpecificData: entry.formatSpecificData }, null, 2)}</pre></details>
                </div>}
                {warnings.map(issue => <div className="warning-line" key={issue.code}>{issue.name}：{issue.rationale}</div>)}
                <div className="button-row"><button className="btn-secondary" disabled={index === 0} onClick={() => { const entries = [...book.entries]; [entries[index - 1], entries[index]] = [entries[index], entries[index - 1]]; update({ ...book, entries }); }}>上移</button><button className="btn-secondary" disabled={index === book.entries.length - 1} onClick={() => { const entries = [...book.entries]; [entries[index + 1], entries[index]] = [entries[index], entries[index + 1]]; update({ ...book, entries }); }}>下移</button><button className="btn-secondary" onClick={() => update({ ...book, entries: [...book.entries, { ...structuredClone(entry), id: createStableId("entry"), externalId: null, name: `${entry.name} 副本` }] })}>复制</button><button className="btn-danger" onClick={() => { if (window.confirm(`删除条目“${entry.name || "未命名"}”？`)) update({ ...book, entries: book.entries.filter(item => item.id !== entry.id) }); }}>删除</button></div>
              </div>}
            </div>;
          })}</div>
          {visibleCount < filtered.length && <button className="btn-secondary load-more" onClick={() => setVisibleCount((count) => count + 30)}>再显示 30 条（剩余 {filtered.length - visibleCount}）</button>}
        </>}
      </div>

      {book && <div className="card lorebook-inspector"><div className="card-header"><span>质量检查与激活模拟</span><span>{quality?.issues.length || 0} 个问题</span></div>
        <div className="main-grid"><div><h3>世界书质量检查</h3>{quality?.issues.length === 0 ? <div className="notice">未发现主要结构问题。</div> : quality?.issues.map((issue, index) => <div className={`quality-row ${issue.severity}`} key={`${issue.code}-${index}`}><strong>{issue.severity === "error" ? "错误" : issue.severity === "warning" ? "警告" : "提示"} · {issue.name}</strong><div>{issue.rationale}</div><div>建议：{issue.suggestion}</div><small>{issue.certainty === "certain" ? "确定错误" : "启发式判断"}</small></div>)}</div>
          <div><h3>激活模拟器</h3><textarea value={simulationText} onChange={e => setSimulationText(e.target.value)} placeholder="输入模拟聊天文本" style={{ width: "100%", minHeight: "110px" }} /><div className="notice">{simulation?.approximationNotice}</div>{simulation?.activated.map(result => <div className="simulation-row" key={result.entryId}><strong>{result.entryName}</strong> · {result.constant ? "常驻" : `命中 ${result.matchedPrimaryKeys.join("、")}`} · 次级条件 {result.secondaryPassed ? "通过" : "失败"} · 顺序 {result.insertionOrder}</div>)}<div className="field-hint">估算注入 {simulation?.estimatedInjectionLength || 0} 字；关键词冲突 {simulation?.keywordConflicts.length || 0} 组</div></div></div>
      </div>}

      <div className="card lorebook-format-panel"><div className="card-header"><span>世界书导入导出与角色卡</span></div>
        <div className="button-row"><button className="btn-secondary" onClick={() => fileRef.current?.click()}>导入独立世界书/Character Book</button><input ref={fileRef} type="file" accept=".json" hidden onChange={e => importFile(e.target.files?.[0])} />
          <button className="btn-secondary" onClick={() => { try { props.onAdd(readCharacterBook(props.characterCard).lorebook); setMessage("已从当前角色卡读取 Character Book。"); } catch (error) { setMessage((error as Error).message); } }}>从角色卡读取 Character Book</button>
          <button className="btn-primary" disabled={!book} onClick={() => { if (book) { const warnings = downloadLorebook(book); setMessage(`已导出独立 SillyTavern 世界书；警告 ${warnings.length} 条。`); } }}>导出独立世界书</button>
        </div>
        {book && <div className="embed-panel"><strong>写入当前角色卡 data.character_book</strong><select value={embedMode} onChange={e => setEmbedMode(e.target.value as typeof embedMode)}><option value="cancel">取消</option><option value="replace">替换（明确覆盖现有 Character Book）</option><option value="merge">合并（冲突保留原条目）</option></select><button className="btn-primary" onClick={embed}>执行</button>{props.characterCard.data.character_book && mergePreview && <div className="field-hint">合并预览：新增 {mergePreview.added.length}、修改 {mergePreview.modified.length}、冲突 {mergePreview.conflicts.length}、保留 {mergePreview.preserved.length}。冲突不会被静默覆盖。</div>}</div>}
      </div>
    </div>
  );
}
