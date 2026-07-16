import { describe, expect, it } from "vitest";
import { EditScopeSchema, createDraftVersion, createEmptySceneDraft } from "@/domain/prose";
import { acceptRevision, applyReplacement, blocksToText, createRevisionProposal, rejectRevision, restoreDraftVersion, toggleBlockLock, validateEditScope } from "@/services/prose-editing";
import { autosaveUserText } from "@/services/prose-project";

function fixture() {
  const scene = createEmptySceneDraft("chapter", "scene-plan", "scene-version");
  const base = createDraftVersion(scene.id, "第一段原文。\n\n第二段必须保留。\n\n第三段原文。", "accepted");
  base.name = "采用稿"; base.blocks[1] = toggleBlockLock(base, base.blocks[1].id).blocks[1];
  scene.versions = [base]; scene.selectedVersionId = base.id; scene.acceptedVersionId = base.id;
  return { scene, base };
}

describe("B3 Edit Scope and revision protection", () => {
  it("rewrites only the selected text range", () => {
    const { base } = fixture(); const text = blocksToText(base.blocks); const start = text.indexOf("第一段");
    const blocks = applyReplacement(base, "新的第一段。", EditScopeSchema.parse({ type: "text_range", start, end: start + "第一段原文。".length }));
    const next = blocksToText(blocks);
    expect(next).toContain("新的第一段。"); expect(next).toContain("第二段必须保留。"); expect(next).toContain("第三段原文。");
  });

  it("rejects a range that overlaps a locked paragraph", () => {
    const { base } = fixture(); const text = blocksToText(base.blocks); const start = text.indexOf("第二段");
    expect(() => validateEditScope(base, EditScopeSchema.parse({ type: "text_range", start, end: start + 5 }))).toThrow("锁定段落");
  });

  it("model replacement keeps locked paragraphs byte-for-byte", () => {
    const { base } = fixture();
    const blocks = applyReplacement(base, "全部替代稿。", EditScopeSchema.parse({ type: "scene" }));
    expect(blocksToText(blocks)).toContain("第二段必须保留。");
    expect(blocks.find((item) => item.text === "第二段必须保留。")?.locked).toBe(true);
  });

  it("creates a diff and supports partial acceptance", () => {
    const { scene, base } = fixture(); const proposal = createRevisionProposal({ sceneDraft: scene, baseVersion: base, replacement: "第一段修改。", scope: EditScopeSchema.parse({ type: "paragraph", textBlockIds: [base.blocks[0].id, base.blocks[2].id] }), operationType: "rewrite" });
    const staged = { ...scene, versions: [...scene.versions, proposal.version], revisions: [proposal.revision] };
    const changed = proposal.revision.diffs.find((item) => item.type !== "unchanged")!;
    const accepted = acceptRevision(staged, proposal.revision.id, [changed.id]);
    expect(accepted.revisions[0].decision).toBe("partially_accepted");
    expect(accepted.acceptedVersionId).toBeTruthy();
  });

  it("rejects suggestions without changing the accepted version", () => {
    const { scene, base } = fixture(); const proposal = createRevisionProposal({ sceneDraft: scene, baseVersion: base, replacement: "替代", scope: EditScopeSchema.parse({ type: "scene" }), operationType: "rewrite" });
    const rejected = rejectRevision({ ...scene, versions: [...scene.versions, proposal.version], revisions: [proposal.revision] }, proposal.revision.id);
    expect(rejected.selectedVersionId).toBe(base.id); expect(rejected.revisions[0].decision).toBe("rejected");
  });

  it("restores an old version as a new accepted version", () => {
    const { scene, base } = fixture(); const restored = restoreDraftVersion(scene, base.id);
    expect(restored.versions).toHaveLength(2); expect(restored.acceptedVersionId).not.toBe(base.id); expect(blocksToText(restored.versions[1].blocks)).toBe(blocksToText(base.blocks));
  });

  it("autosave refuses to remove locked paragraph", () => {
    const { scene, base } = fixture(); const result = autosaveUserText(scene, base.id, "只剩一段");
    expect(result).toBe(scene);
  });
});
