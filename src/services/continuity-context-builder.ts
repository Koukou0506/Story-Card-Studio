import type { ProjectDraft } from "@/domain/project-draft";
import type { ContinuityProject } from "@/domain/continuity";

export interface ContinuityContextItem {
  sourceType: string; sourceId: string; sourceVersion: string; authority: number; locked: boolean; allowModelChange: boolean;
  title: string; content: string; included: boolean; truncated: boolean;
}
export interface ContinuityContext { items: ContinuityContextItem[]; totalCharacters: number; budget: number; truncated: boolean; allowedSourceIds: string[] }

const addWithinBudget = (items: ContinuityContextItem[], budget: number): ContinuityContext => {
  const ranked = [...items].sort((a, b) => Number(b.locked) - Number(a.locked) || a.authority - b.authority);
  let used = 0; let truncated = false;
  const output = ranked.map((item) => {
    if (used >= budget) { truncated = true; return { ...item, included: false, truncated: true, content: "" }; }
    const left = budget - used; const content = item.content.slice(0, left); used += content.length;
    if (content.length < item.content.length) truncated = true;
    return { ...item, included: true, truncated: content.length < item.content.length, content };
  });
  return { items: output, totalCharacters: used, budget, truncated, allowedSourceIds: output.filter((i) => i.included).map((i) => i.sourceId) };
};

export function buildContinuityContext(draft: ProjectDraft, project: ContinuityProject, query = "", budget = 18000): ContinuityContext {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const relevant = (text: string) => !terms.length || terms.some((term) => text.toLowerCase().includes(term));
  const items: ContinuityContextItem[] = [];
  const push = (item: Omit<ContinuityContextItem, "included" | "truncated">) => { if (item.locked || relevant(`${item.title} ${item.content}`)) items.push({ ...item, included: true, truncated: false }); };
  for (const fact of project.canonLedger.facts.filter((f) => !["deprecated", "retconned"].includes(f.status))) push({ sourceType: "canon", sourceId: fact.id, sourceVersion: fact.modifiedAt, authority: fact.authority, locked: fact.locked, allowModelChange: false, title: fact.title, content: fact.content });
  for (const summary of project.chapterSummaries.filter((s) => !s.stale)) push({ sourceType: "chapter_summary", sourceId: summary.id, sourceVersion: summary.modifiedAt, authority: 3, locked: false, allowModelChange: false, title: `章节摘要 ${summary.chapterId}`, content: summary.majorEvents.map((i) => i.content).join("；") });
  for (const thread of project.plotThreads.filter((t) => t.status === "active")) push({ sourceType: "plot_thread", sourceId: thread.id, sourceVersion: thread.modifiedAt, authority: 5, locked: false, allowModelChange: false, title: thread.title, content: `${thread.currentState}\n下一节点：${thread.nextNode}` });
  for (const state of project.characterSnapshots.sort((a, b) => b.order - a.order).slice(0, 20)) push({ sourceType: "character_snapshot", sourceId: state.id, sourceVersion: state.modifiedAt, authority: state.confirmed ? 2 : 7, locked: false, allowModelChange: false, title: `人物状态 ${state.characterId}`, content: `${state.location}；${state.body}；${state.emotion}；${state.goal}` });
  for (const manuscript of draft.manuscripts) for (const chapter of manuscript.chapterDrafts) for (const scene of chapter.sceneDrafts) { const accepted = scene.versions.find((v) => v.id === scene.acceptedVersionId); if (accepted) push({ sourceType: "draft_version", sourceId: accepted.id, sourceVersion: accepted.modifiedAt, authority: 3, locked: accepted.locked, allowModelChange: false, title: `${chapter.title} / ${scene.title}`, content: accepted.blocks.map((b) => b.text).join("\n\n") }); }
  for (const book of draft.lorebooks) for (const entry of book.entries.filter((e) => e.enabled && relevant(`${e.name} ${e.content}`))) push({ sourceType: "lorebook", sourceId: entry.id, sourceVersion: book.metadata.modifiedAt, authority: 4, locked: false, allowModelChange: false, title: `${book.name} / ${entry.name}`, content: entry.content });
  return addWithinBudget(items, budget);
}
