import type { CharacterCardV2 } from "@/domain/character-card";
import type { Lorebook } from "@/domain/lorebook";
import type { Manuscript, CandidateFact } from "@/domain/prose";
import {
  CanonConflictSchema, CanonLedgerSchema, RetconRecordSchema, createCanonFact,
  createContinuitySource, continuityBase, continuityNow,
  type CanonConflict, type CanonFact, type CanonLedger, type RetconRecord,
} from "@/domain/continuity";

export const CANON_AUTHORITY = {
  locked_user_canon: 1, confirmed_manuscript_fact: 2, accepted_manuscript: 3,
  confirmed_source_setting: 4, adopted_story_plan: 5, confirmed_state_change: 6,
  manuscript_candidate: 7, model_inference: 8, model_suggestion: 9,
} as const;

const excerpt = (value: string) => value.replace(/\s+/g, " ").trim().slice(0, 180);

export function extractCanonCandidates(input: {
  card?: CharacterCardV2 | null; lorebooks?: Lorebook[]; manuscripts?: Manuscript[];
}): CanonFact[] {
  const facts: CanonFact[] = [];
  const card = input.card;
  if (card?.data.name) {
    for (const [field, content, factType] of [
      ["description", card.data.description, "character"], ["personality", card.data.personality, "character"], ["scenario", card.data.scenario, "event"],
    ] as const) if (content.trim()) facts.push(createCanonFact({
      title: `${card.data.name} · ${field}`, content, factType, status: "candidate", authority: CANON_AUTHORITY.confirmed_source_setting,
      entityIds: [card.data.name], sources: [createContinuitySource("character_card", card.data.name, { sourceName: card.data.name, field, excerpt: excerpt(content), version: card.data.character_version, authority: 4, classification: "source_setting" })],
    }));
  }
  for (const book of input.lorebooks ?? []) for (const entry of book.entries) if (entry.enabled && entry.content.trim()) facts.push(createCanonFact({
    title: entry.name || `${book.name}条目`, content: entry.content, factType: entry.category.includes("地点") ? "location" : entry.category.includes("人物") ? "character" : "world_rule",
    status: "candidate", authority: CANON_AUTHORITY.confirmed_source_setting, sources: [createContinuitySource("lorebook", entry.id, { sourceName: `${book.name} / ${entry.name}`, field: "content", excerpt: excerpt(entry.content), version: book.metadata.modifiedAt, authority: 4, classification: "source_setting" })],
  }));
  for (const manuscript of input.manuscripts ?? []) for (const chapter of manuscript.chapterDrafts) for (const scene of chapter.sceneDrafts) {
    for (const candidate of scene.candidateFacts) facts.push(candidateFactToCanon(candidate));
    const accepted = scene.versions.find((version) => version.id === scene.acceptedVersionId);
    if (!accepted) continue;
    for (const block of accepted.blocks.filter((item) => item.text.trim())) facts.push(createCanonFact({
      title: `${chapter.title} / ${scene.title} 正文事实候选`, content: excerpt(block.text), factType: "event", status: "candidate", authority: CANON_AUTHORITY.accepted_manuscript,
      sources: [createContinuitySource("text_block", block.id, { sourceName: `${chapter.title} / ${scene.title}`, excerpt: excerpt(block.text), version: accepted.id, authority: 3, classification: "project_fact", locked: block.locked })],
    }));
  }
  return facts;
}

export function candidateFactToCanon(candidate: CandidateFact): CanonFact {
  const factType = candidate.factType === "relationship" ? "relationship" : candidate.factType === "body_state" ? "body_state" : candidate.factType;
  return createCanonFact({
    title: candidate.content.slice(0, 36) || "正文候选事实", content: candidate.content, factType, status: "candidate", authority: CANON_AUTHORITY.manuscript_candidate,
    sources: [createContinuitySource("candidate_fact", candidate.id, { excerpt: candidate.textRange.excerpt, version: candidate.versionId, authority: 7, classification: "project_fact" })],
  });
}

export function confirmCanonFact(ledger: CanonLedger, factId: string, lock = false): CanonLedger {
  const now = continuityNow();
  return CanonLedgerSchema.parse({ ...ledger, facts: ledger.facts.map((fact) => fact.id === factId ? { ...fact, status: lock ? "locked" : "confirmed", locked: lock, authority: lock ? 1 : Math.min(fact.authority, 4), modifiedAt: now } : fact), modifiedAt: now });
}

export function mergeCanonFacts(ledger: CanonLedger, factIds: string[], merged: Partial<CanonFact>): CanonLedger {
  if (factIds.length < 2) throw new Error("至少选择两条事实后才能合并；系统不会自动合并同名事实。");
  const selected = ledger.facts.filter((fact) => factIds.includes(fact.id));
  if (selected.length !== factIds.length) throw new Error("合并包含不存在的 Canon 事实。");
  const next = createCanonFact({
    title: merged.title ?? selected[0].title, content: merged.content ?? selected.map((item) => item.content).join("；"),
    factType: merged.factType ?? selected[0].factType, status: "confirmed", authority: Math.min(...selected.map((item) => item.authority)),
    sources: selected.flatMap((item) => item.sources), relatedFactIds: factIds, ...merged,
  });
  return CanonLedgerSchema.parse({ ...ledger, facts: [...ledger.facts.map((fact) => factIds.includes(fact.id) ? { ...fact, status: "deprecated" as const, modifiedAt: continuityNow() } : fact), next], modifiedAt: continuityNow() });
}

export function detectCanonConflicts(facts: CanonFact[]): CanonConflict[] {
  const conflicts: CanonConflict[] = [];
  for (let a = 0; a < facts.length; a++) for (let b = a + 1; b < facts.length; b++) {
    const left = facts[a]; const right = facts[b];
    if (left.status === "deprecated" || right.status === "deprecated") continue;
    const sharedEntity = left.entityIds.some((id) => right.entityIds.includes(id));
    const normalized = (text: string) => text.toLowerCase().replace(/\s+/g, "");
    const possibleNegation = /(不是|不再|从未|死亡|失去|禁止)/.test(left.content) !== /(不是|不再|从未|死亡|失去|禁止)/.test(right.content);
    const sameTitle = normalized(left.title) === normalized(right.title);
    if ((sharedEntity || sameTitle) && possibleNegation && normalized(left.content) !== normalized(right.content)) conflicts.push(CanonConflictSchema.parse({
      ...continuityBase("canon_conflict"), conflictType: left.factType === "time" || right.factType === "time" ? "time" : left.factType === "body_state" || right.factType === "body_state" ? "state" : "direct_content",
      factIds: [left.id, right.id], description: `“${left.title}”与“${right.title}”可能不能同时成立。`, sources: [...left.sources, ...right.sources],
    }));
  }
  return conflicts;
}

export function resolveCanonConflict(ledger: CanonLedger, conflictId: string, resolution: CanonConflict["resolution"], rationale = "", effectiveTime = ""): CanonLedger {
  const conflict = ledger.conflicts.find((item) => item.id === conflictId);
  if (!conflict) throw new Error("找不到 Canon 冲突。");
  const [oldId, newId] = conflict.factIds;
  let facts = ledger.facts;
  if (resolution === "keep_old") facts = facts.map((f) => f.id === newId ? { ...f, status: "deprecated" as const } : f);
  if (resolution === "adopt_new") facts = facts.map((f) => f.id === oldId ? { ...f, status: "deprecated" as const } : f.id === newId ? { ...f, status: "confirmed" as const } : f);
  if (resolution === "set_effective_time") facts = facts.map((f) => f.id === newId ? { ...f, effectiveFrom: effectiveTime } : f);
  return CanonLedgerSchema.parse({ ...ledger, facts, conflicts: ledger.conflicts.map((item) => item.id === conflictId ? { ...item, status: resolution === "false_positive" ? "false_positive" : resolution === "deferred" ? "deferred" : "resolved", resolution, rationale, effectiveTime, resolvedAt: continuityNow(), modifiedAt: continuityNow() } : item), modifiedAt: continuityNow() });
}

export function createRetcon(ledger: CanonLedger, oldFactId: string, newFact: Partial<CanonFact>, details: Partial<RetconRecord> = {}): CanonLedger {
  const oldFact = ledger.facts.find((fact) => fact.id === oldFactId);
  if (!oldFact) throw new Error("Retcon 的旧事实不存在。");
  if (oldFact.locked && !details.reason?.trim()) throw new Error("锁定 Canon 创建 Retcon 时必须说明原因。");
  const replacement = createCanonFact({
    title: newFact.title ?? oldFact.title, content: newFact.content ?? oldFact.content, factType: newFact.factType ?? oldFact.factType,
    entityIds: newFact.entityIds ?? oldFact.entityIds, authority: newFact.authority ?? oldFact.authority,
    effectiveFrom: newFact.effectiveFrom ?? oldFact.effectiveFrom, effectiveTo: newFact.effectiveTo ?? oldFact.effectiveTo,
    spatialScope: newFact.spatialScope ?? oldFact.spatialScope, status: "confirmed", locked: false,
    publicKnowledge: newFact.publicKnowledge ?? oldFact.publicKnowledge, knowingCharacterIds: newFact.knowingCharacterIds ?? oldFact.knowingCharacterIds,
    relatedFactIds: [...oldFact.relatedFactIds, oldFact.id], sources: newFact.sources ?? oldFact.sources, notes: newFact.notes ?? oldFact.notes,
  });
  const retcon = RetconRecordSchema.parse({ ...continuityBase("retcon"), oldFactId, newFactId: replacement.id, reason: details.reason ?? "", effectiveScope: details.effectiveScope ?? "", affectedChapterIds: details.affectedChapterIds ?? [], affectedCharacterIds: details.affectedCharacterIds ?? [], sourceIdsToReview: details.sourceIdsToReview ?? [], sources: [...oldFact.sources, ...replacement.sources] });
  return CanonLedgerSchema.parse({ ...ledger, facts: [...ledger.facts.map((fact) => fact.id === oldFactId ? { ...fact, status: "retconned" as const, modifiedAt: continuityNow() } : fact), replacement], retcons: [...ledger.retcons, retcon], modifiedAt: continuityNow() });
}
