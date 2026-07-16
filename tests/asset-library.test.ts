import { describe, expect, test } from "vitest";
import { createEmptyProjectDraft } from "@/domain/project-draft";
import {
  addAssetVersion, addAssetToProject, buildAssetUpdateProposal, checkAssetDependencies,
  createLibraryAsset, createTemplateInstantiationPlan, disconnectAssetLink,
  exportAssetPack, importAssetPack, pinAssetLink,
} from "@/services/asset-library";

describe("素材与模板库", () => {
  test("修改素材创建新版本且保留旧版本", () => {
    const state = createLibraryAsset({ workspaceId: "ws", type: "style_profile", name: "克制叙事", content: { pacing: 2 } });
    const next = addAssetVersion(state, state.assets[0].assetId, { pacing: 4 }, "调整节奏");
    expect(next.assets[0].versions).toHaveLength(2);
    expect(next.assets[0].versions[0].content).toEqual({ pacing: 2 });
  });

  test("复制、引用和派生具有不同更新关系", () => {
    const state = createLibraryAsset({ workspaceId: "ws", type: "character_card", name: "侦探", content: { name: "林" } });
    const asset = state.assets[0]; const version = asset.versions[0];
    const copied = addAssetToProject(state, asset.assetId, "p1", "copy", "character_card", "c1");
    const referenced = addAssetToProject(copied, asset.assetId, "p2", "reference", "character_card", "c2", { personality: "谨慎" });
    const derived = addAssetToProject(referenced, asset.assetId, "p3", "derived", "character_card", "c3");
    expect(derived.links.map((x) => x.mode)).toEqual(["copy", "reference", "derived"]);
    expect(derived.links[0].sourceVersionId).toBe(version.versionId);
    expect(disconnectAssetLink(derived, derived.links[1].linkId).links[1].status).toBe("disconnected");
    expect(pinAssetLink(derived, derived.links[2].linkId).links[2].pinned).toBe(true);
  });

  test("上游与本地同时修改只生成冲突提案", () => {
    let state = createLibraryAsset({ workspaceId: "ws", type: "lorebook_entry", name: "王城", content: { content: "旧" } });
    state = addAssetToProject(state, state.assets[0].assetId, "p1", "reference", "lorebook_entry", "e1", { content: "本地" });
    state = addAssetVersion(state, state.assets[0].assetId, { content: "上游新" }, "更新");
    const proposal = buildAssetUpdateProposal(state, state.links[0].linkId);
    expect(proposal.status).toBe("conflict");
    expect(proposal.changeSet.status).toBe("draft");
    expect(proposal.applied).toBe(false);
  });

  test("依赖检查识别缺失和循环", () => {
    let state = createLibraryAsset({ workspaceId: "ws", type: "world_setting", name: "世界", content: {} });
    state = createLibraryAsset({ state, workspaceId: "ws", type: "magic_system", name: "魔法", content: {} });
    const [a,b] = state.assets; state.dependencies = [
      { dependencyId:"d1", assetId:a.assetId, dependencyAssetId:b.assetId, requiredVersionRange:"*", optional:false, purpose:"规则", status:"resolved" },
      { dependencyId:"d2", assetId:b.assetId, dependencyAssetId:a.assetId, requiredVersionRange:"*", optional:false, purpose:"世界", status:"resolved" },
      { dependencyId:"d3", assetId:a.assetId, dependencyAssetId:"missing", requiredVersionRange:"*", optional:false, purpose:"缺失", status:"missing" },
    ];
    const result = checkAssetDependencies(state);
    expect(result.cycles.length).toBeGreaterThan(0); expect(result.missing).toContain("missing");
  });

  test("项目模板先生成安全预览且素材包可 round-trip", () => {
    const draft = createEmptyProjectDraft(); draft.projectInput.projectName = "原项目";
    const state = createLibraryAsset({ workspaceId:"ws", type:"project_template", name:"悬疑模板", content:{ projectInput:{ projectName:"模板" }, manuscripts:[{ secret:"正文" }], providerPreferences:{ apiKey:"secret" } } });
    const plan = createTemplateInstantiationPlan(state, state.assets[0].assetId, "新项目", { includeManuscript:false });
    expect(JSON.stringify(plan.preview)).not.toContain("secret"); expect(plan.confirmed).toBe(false);
    const imported = importAssetPack(exportAssetPack(state, [state.assets[0].assetId]));
    expect(imported.assets[0].name).toBe("悬疑模板");
  });
});
