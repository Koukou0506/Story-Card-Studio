import {
  DraftVersionSchema, EditScopeSchema, ParagraphDiffSchema, RevisionSchema,
  createDraftVersion, createTextBlocks, proseBase,
  type DraftVersion, type EditScope, type ParagraphDiff, type Revision, type SceneDraft, type TextBlock,
} from "@/domain/prose";

export function blocksToText(blocks: TextBlock[]): string {
  return [...blocks].sort((a, b) => a.order - b.order).map((item) => item.text).join("\n\n");
}

function blockRanges(blocks: TextBlock[]) {
  let cursor = 0;
  return [...blocks].sort((a, b) => a.order - b.order).map((block) => {
    const value = { block, start: cursor, end: cursor + block.text.length };
    cursor = value.end + 2;
    return value;
  });
}

export function validateEditScope(version: DraftVersion, rawScope: EditScope): EditScope {
  const scope = EditScopeSchema.parse(rawScope);
  const text = blocksToText(version.blocks);
  if (scope.type === "text_range") {
    if (scope.start === null || scope.end === null || scope.start > scope.end || scope.end > text.length) {
      throw new Error("编辑范围无效：选区起止位置超出当前正文。");
    }
    const overlap = blockRanges(version.blocks).find(({ block, start, end }) => block.locked && scope.start! < end && scope.end! > start);
    if (overlap) throw new Error(`编辑范围包含锁定段落：${overlap.block.id}`);
  }
  const ids = new Set(version.blocks.map((item) => item.id));
  for (const id of scope.textBlockIds) if (!ids.has(id)) throw new Error(`编辑范围引用了不存在的段落：${id}`);
  const locked = version.blocks.filter((item) => item.locked).map((item) => item.id);
  return { ...scope, lockedBlockIds: [...new Set([...scope.lockedBlockIds, ...locked])] };
}

function targetBlockIds(version: DraftVersion, scope: EditScope): Set<string> {
  const ordered = [...version.blocks].sort((a, b) => a.order - b.order);
  if (scope.type === "paragraph" || scope.type === "custom") return new Set(scope.textBlockIds);
  if (scope.type === "dialogue_only") return new Set(ordered.filter((item) => item.kind === "dialogue").map((item) => item.id));
  if (scope.type === "narration_only") return new Set(ordered.filter((item) => item.kind !== "dialogue").map((item) => item.id));
  if (scope.type === "opening") return new Set(ordered.slice(0, 1).map((item) => item.id));
  if (scope.type === "ending") return new Set(ordered.slice(-1).map((item) => item.id));
  return new Set(ordered.map((item) => item.id));
}

function ensurePreserved(replacement: string, required: string[]): string {
  const missing = required.filter((item) => item && !replacement.includes(item));
  return missing.length ? `${replacement.trim()}\n\n${missing.join("\n\n")}`.trim() : replacement;
}

export function applyReplacement(base: DraftVersion, replacement: string, rawScope: EditScope): TextBlock[] {
  const scope = validateEditScope(base, rawScope);
  const original = blocksToText(base.blocks);
  const lockedTexts = base.blocks.filter((item) => item.locked || scope.lockedBlockIds.includes(item.id)).map((item) => item.text);
  const preserved = [...scope.preserveVerbatim, ...base.blocks.flatMap((item) => item.preserveVerbatim)];
  if (scope.type === "text_range") {
    const next = original.slice(0, scope.start!) + ensurePreserved(replacement, preserved) + original.slice(scope.end!);
    return createTextBlocks(next, "alternative");
  }

  const targets = targetBlockIds(base, scope);
  const editableTargets = base.blocks.filter((item) => targets.has(item.id) && !item.locked && !scope.lockedBlockIds.includes(item.id));
  if (!editableTargets.length && base.blocks.length) throw new Error("编辑范围内没有可修改的段落。");
  const replacementBlocks = createTextBlocks(ensurePreserved(replacement, preserved), "alternative");
  const firstTarget = editableTargets[0]?.id;
  const result: TextBlock[] = [];
  for (const block of [...base.blocks].sort((a, b) => a.order - b.order)) {
    if (!targets.has(block.id) || block.locked || scope.lockedBlockIds.includes(block.id)) result.push(structuredClone(block));
    else if (block.id === firstTarget) result.push(...replacementBlocks);
  }
  if (!base.blocks.length) result.push(...replacementBlocks);
  const text = ensurePreserved(blocksToText(result), lockedTexts);
  const rebuilt = createTextBlocks(text, "alternative");
  return rebuilt.map((block, order) => {
    const locked = base.blocks.find((item) => item.locked && item.text === block.text);
    return locked ? { ...structuredClone(locked), order } : { ...block, order };
  });
}

export function createParagraphDiff(original: TextBlock[], suggested: TextBlock[]): ParagraphDiff[] {
  const max = Math.max(original.length, suggested.length);
  return Array.from({ length: max }, (_, order) => {
    const before = original[order];
    const after = suggested[order];
    const type = !before ? "added" : !after ? "removed" : before.text === after.text ? "unchanged" : "modified";
    return ParagraphDiffSchema.parse({
      id: proseBase("paragraph_diff").id, order, type,
      originalBlockId: before?.id ?? null, suggestedBlockId: after?.id ?? null,
      originalText: before?.text ?? "", suggestedText: after?.text ?? "",
      decision: type === "unchanged" ? "accepted" : "pending",
    });
  });
}

export function createRevisionProposal(args: {
  sceneDraft: SceneDraft; baseVersion: DraftVersion; replacement: string; scope: EditScope;
  operationType: DraftVersion["operationType"]; instruction?: string; promptVersion?: string;
  provider?: Revision["provider"]; model?: string; sourceVersions?: Record<string, string>; incomplete?: boolean;
}): { version: DraftVersion; revision: Revision } {
  const blocks = applyReplacement(args.baseVersion, args.replacement, args.scope);
  const version = DraftVersionSchema.parse({
    ...createDraftVersion(args.sceneDraft.id), blocks, parentVersionId: args.baseVersion.id,
    name: `${args.baseVersion.name} · ${args.operationType}`, operationType: args.operationType,
    promptVersion: args.promptVersion, provider: args.provider, model: args.model,
    b2ProjectVersion: args.sourceVersions?.b2Project ?? "",
    b2ChapterVersionId: args.sourceVersions?.b2Chapter ?? "",
    b2SceneVersionId: args.sourceVersions?.b2Scene ?? "",
    status: args.incomplete ? "incomplete" : "alternative", incomplete: args.incomplete ?? false,
    wordCount: blocksToText(blocks).replace(/\s/g, "").length,
  });
  const revision = RevisionSchema.parse({
    ...proseBase("revision"), status: "alternative", sceneDraftId: args.sceneDraft.id,
    baseVersionId: args.baseVersion.id, suggestedVersionId: version.id,
    operationType: args.operationType, scope: validateEditScope(args.baseVersion, args.scope),
    userInstruction: args.instruction ?? "", promptVersion: args.promptVersion,
    provider: args.provider, model: args.model, sourceVersions: args.sourceVersions ?? {},
    diffs: createParagraphDiff(args.baseVersion.blocks, version.blocks),
  });
  return { version, revision };
}

export function appendRevisionProposal(scene: SceneDraft, proposal: { version: DraftVersion; revision: Revision }): SceneDraft {
  return {
    ...scene, versions: [...scene.versions, proposal.version], revisions: [...scene.revisions, proposal.revision],
    selectedVersionId: proposal.version.id, modifiedAt: new Date().toISOString(),
  };
}

export function acceptRevision(scene: SceneDraft, revisionId: string, acceptedDiffIds?: string[]): SceneDraft {
  const revision = scene.revisions.find((item) => item.id === revisionId);
  if (!revision) throw new Error("修订不存在。");
  const base = scene.versions.find((item) => item.id === revision.baseVersionId);
  const suggested = scene.versions.find((item) => item.id === revision.suggestedVersionId);
  if (!base || !suggested) throw new Error("修订引用的正文版本不存在。");
  const selected = acceptedDiffIds ? new Set(acceptedDiffIds) : null;
  const textParts = revision.diffs.map((diff) => {
    const accept = !selected || selected.has(diff.id) || diff.type === "unchanged";
    if (diff.type === "added") return accept ? diff.suggestedText : "";
    if (diff.type === "removed") return accept ? "" : diff.originalText;
    return accept ? diff.suggestedText : diff.originalText;
  }).filter(Boolean);
  const accepted = DraftVersionSchema.parse({
    ...suggested, id: proseBase("draft_version").id, parentVersionId: base.id,
    name: `${suggested.name} · 已接受`, status: "accepted", blocks: createTextBlocks(textParts.join("\n\n"), "accepted"),
    incomplete: false, locked: false, modifiedAt: new Date().toISOString(),
  });
  const complete = !selected || revision.diffs.filter((item) => item.type !== "unchanged").every((item) => selected.has(item.id));
  return {
    ...scene, status: "accepted", incomplete: false, versions: [...scene.versions, accepted],
    acceptedVersionId: accepted.id, selectedVersionId: accepted.id,
    revisions: scene.revisions.map((item) => item.id === revisionId ? {
      ...item, status: "reviewed", decision: complete ? "accepted" : "partially_accepted",
      diffs: item.diffs.map((diff) => ({ ...diff, decision: diff.type === "unchanged" || !selected || selected.has(diff.id) ? "accepted" : "rejected" })),
      modifiedAt: new Date().toISOString(),
    } : item), modifiedAt: new Date().toISOString(),
  };
}

export function rejectRevision(scene: SceneDraft, revisionId: string): SceneDraft {
  const revision = scene.revisions.find((item) => item.id === revisionId);
  if (!revision) return scene;
  return { ...scene, selectedVersionId: revision.baseVersionId, revisions: scene.revisions.map((item) => item.id === revisionId ? { ...item, status: "deprecated", decision: "rejected", modifiedAt: new Date().toISOString() } : item) };
}

export function restoreDraftVersion(scene: SceneDraft, versionId: string): SceneDraft {
  const source = scene.versions.find((item) => item.id === versionId);
  if (!source) throw new Error("要恢复的版本不存在。");
  const restored = DraftVersionSchema.parse({ ...structuredClone(source), id: proseBase("draft_version").id, parentVersionId: source.id, name: `${source.name} · 恢复副本`, status: "accepted", locked: false, createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString() });
  return { ...scene, status: "accepted", versions: [...scene.versions, restored], selectedVersionId: restored.id, acceptedVersionId: restored.id, incomplete: false, modifiedAt: new Date().toISOString() };
}

export function toggleBlockLock(version: DraftVersion, blockId: string): DraftVersion {
  return { ...version, status: "user_edited", blocks: version.blocks.map((item) => item.id === blockId ? { ...item, locked: !item.locked, status: !item.locked ? "locked" : "user_edited", modifiedAt: new Date().toISOString() } : item), modifiedAt: new Date().toISOString() };
}
