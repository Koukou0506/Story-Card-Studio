import { describe, expect, it } from "vitest";
import { MockProvider } from "@/providers/mock";
import type { IProviderAdapter } from "@/providers/types";
import { EditScopeSchema, createDraftVersion, createEmptySceneDraft } from "@/domain/prose";
import { analyzeStyleRisk, compareStyleRiskReports, createStyleRiskRevision } from "@/services/style-risk-service";
import { blocksToText } from "@/services/prose-editing";

describe("C2.4 model fallback, comparison and B3 revision reuse", () => {
  it("keeps deterministic results when model analysis fails", async () => {
    const mock = new MockProvider(); const provider: IProviderAdapter = { type: mock.type, displayName: mock.displayName, models: mock.models, defaultModel: mock.defaultModel, generate: async () => { throw new Error("offline"); } };
    const result = await analyzeStyleRisk({ text: "然而他很悲伤。".repeat(30), mode: "generic", scopeType: "document", useModel: true }, { provider, model: "mock-model" });
    expect(result.modelStatus).toBe("failed");
    expect(result.metrics.length).toBeGreaterThan(0);
  });

  it("drops invalid model ranges instead of highlighting the wrong text", async () => {
    const mock = new MockProvider(); const provider: IProviderAdapter = { type: mock.type, displayName: mock.displayName, models: mock.models, defaultModel: mock.defaultModel, generate: async () => ({ model: "x", content: JSON.stringify({ issues: [{ category: "over_explanation", title: "问题", severity: "moderate", confidence: "medium", excerpt: "不存在的摘录", conclusion: "重复解释", evidence: ["模型判断"], explanation: "范围无效", minimumRevision: "删减", alternatives: [], possibleSideEffects: [] }] }) }) };
    const result = await analyzeStyleRisk({ text: "有效正文。".repeat(40), mode: "generic", scopeType: "document", useModel: true }, { provider, model: "x" });
    const modelIssue = result.issues.find((item) => !item.isDeterministic);
    expect(modelIssue?.textRange.mappingStatus).toBe("unmapped");
  });

  it("creates a B3 Revision and preserves text outside the selected range", () => {
    const scene = createEmptySceneDraft("chapter", "plan", "v1"); const base = createDraftVersion(scene.id, "第一段保留。\n\n第二段机械重复。\n\n第三段保留。", "accepted");
    scene.versions = [base]; scene.acceptedVersionId = base.id; scene.selectedVersionId = base.id;
    const original = blocksToText(base.blocks); const start = original.indexOf("第二段");
    const result = createStyleRiskRevision({ sceneDraft: scene, baseVersion: base, replacement: "第二段改得自然。", scope: EditScopeSchema.parse({ type: "text_range", start, end: start + "第二段机械重复。".length }), issueIds: ["issue-1"], instruction: "减少重复" });
    const suggested = result.sceneDraft.versions.find((item) => item.id === result.revision.suggestedVersionId)!;
    expect(blocksToText(suggested.blocks)).toBe("第一段保留。\n\n第二段改得自然。\n\n第三段保留。");
    expect(result.revision.operationType).toBe("custom_revision");
  });

  it("rejects revisions that overlap locked text", () => {
    const scene = createEmptySceneDraft("chapter", "plan", "v1"); const base = createDraftVersion(scene.id, "锁定原文。\n\n可编辑原文。", "accepted"); base.blocks[0].locked = true;
    scene.versions = [base]; const text = blocksToText(base.blocks);
    expect(() => createStyleRiskRevision({ sceneDraft: scene, baseVersion: base, replacement: "替换", scope: EditScopeSchema.parse({ type: "text_range", start: 0, end: text.indexOf("。") + 1 }), issueIds: [], instruction: "修改" })).toThrow("锁定段落");
  });

  it("compares before and after without treating lower risk as guaranteed quality", () => {
    const beforeText = "然而，他感到悲伤。因此，他感到悲伤。".repeat(20);
    const afterText = "他停在门边，手指压住冰冷的门闩。".repeat(20);
    const comparison = compareStyleRiskReports(
      { text: beforeText, mode: "generic", scopeType: "document" },
      { text: afterText, mode: "generic", scopeType: "document" },
    );
    expect(comparison.resolvedIssueIds.length).toBeGreaterThanOrEqual(0);
    expect(comparison.warning).toContain("不等于文本质量一定提高");
  });
});
