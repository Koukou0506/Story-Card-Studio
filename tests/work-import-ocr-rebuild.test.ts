import { describe, expect, it } from "vitest";
import { createEmptyProjectDraft } from "@/domain/project-draft";
import { createMockDocumentIngestionProject } from "@/services/document-ingestion/mock";
import { applyOcrCorrection, createOcrJob, runOcrJob } from "@/services/document-ingestion/ocr";
import { executeProjectRebuildPlan, planProjectRebuild } from "@/services/document-ingestion/project-rebuild";

describe("OCR 与项目重建", () => {
  it("按页保存失败检查点、恢复并保留原始识别与修正", async () => {
    const job = createOcrJob("doc-1", 3, ["chi_sim", "eng"]);
    const first = await runOcrJob({
      job, pages: [new Uint8Array([1]), new Uint8Array([2]), new Uint8Array([3])],
      adapter: { id: "test", version: "1", async recognizePage(_data, page) { if (page === 2) throw new Error("页损坏"); return { text: `第${page}页`, confidence: page === 3 ? 0.4 : 0.9 }; } },
    });
    expect(first.status).toBe("partially_completed");
    expect(first.checkpoint.failedPageNumbers).toEqual([2]);
    const resumed = await runOcrJob({
      job: first, pages: [new Uint8Array([1]), new Uint8Array([2]), new Uint8Array([3])], retryFailedOnly: true,
      adapter: { id: "test", version: "1", async recognizePage(_data, page) { return { text: `恢复第${page}页`, confidence: 0.95 }; } },
    });
    expect(resumed.status).toBe("ready_for_review");
    expect(resumed.pages.find((item) => item.pageNumber === 3)?.warnings.join(" ")).toContain("置信度");
    const corrected = applyOcrCorrection(resumed, 1, "用户修正第一页");
    expect(corrected.pages[0].rawText).toBe("第1页");
    expect(corrected.pages[0].correctedText).toBe("用户修正第一页");
  });

  it("先生成重建方案，再把正文写为新版本、资料写为草稿或候选", () => {
    const ingestion = createMockDocumentIngestionProject("project-1");
    const existing = createEmptyProjectDraft();
    const plan = planProjectRebuild({ ingestion, mode: "supplement", target: existing });
    expect(plan.operations.length).toBeGreaterThan(0);
    expect(plan.operations.every((item) => ["add", "merge", "create_version", "conflict", "skip"].includes(item.action))).toBe(true);
    expect(plan.confirmed).toBe(false);

    const executed = executeProjectRebuildPlan({ draft: existing, ingestion, plan: { ...plan, confirmed: true } });
    expect(executed.result.status).toMatch(/completed/);
    expect(executed.draft.manuscripts.length).toBeGreaterThanOrEqual(1);
    expect(executed.draft.manuscripts[0].chapterDrafts[0].sceneDrafts[0].versions[0].status).toBe("alternative");
    expect(executed.draft.lorebooks.every((item) => item.metadata.status === "draft")).toBe(true);
    expect(executed.result.log.every((item) => item.operationId)).toBe(true);

    const resumed = executeProjectRebuildPlan({ draft: executed.draft, ingestion, plan: { ...plan, confirmed: true } });
    expect(resumed.draft.manuscripts).toHaveLength(executed.draft.manuscripts.length);
    expect(resumed.draft.manuscripts[0].styleProfiles).toHaveLength(executed.draft.manuscripts[0].styleProfiles.length);
    expect(resumed.draft.manuscripts[0].languageConstraints).toHaveLength(executed.draft.manuscripts[0].languageConstraints.length);
  });

  it("未处理的重建冲突不能被确认写入", () => {
    const ingestion = createMockDocumentIngestionProject("project-1");
    const existing = createEmptyProjectDraft();
    existing.characterCard.data.name = ingestion.characterCardDrafts[0]?.card.data.name ?? "";
    const plan = planProjectRebuild({ ingestion, mode: "supplement", target: existing });
    expect(plan.conflicts.length).toBeGreaterThan(0);
    expect(() => executeProjectRebuildPlan({ draft: existing, ingestion, plan: { ...plan, confirmed: true } }))
      .toThrow("仍有未处理冲突");
  });
});
