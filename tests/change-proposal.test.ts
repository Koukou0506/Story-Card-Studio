import { describe, expect, it } from "vitest";
import { createEmptySceneDraft } from "@/domain/prose";
import { createChangeProposal, decideChangeProposal, executeRevisionProposal } from "@/services/change-proposal";

describe("Change Proposal", () => {
  it("does not mutate source, supports partial acceptance and blocks stale versions", () => {
    const scene = createEmptySceneDraft("chapter", "scene", "plan", "场景"); const base = scene.versions[0]; base.blocks[0] = { ...base.blocks[0], text: "旧文本" };
    const before = structuredClone(scene); const proposal = createChangeProposal({ conversationId: "c", userRequest: "修改", operation: "revision", targetType: "scene", targetIds: [scene.id], currentValue: "旧文本", proposedValue: "新文本", sourceVersion: base.id });
    expect(scene).toEqual(before); expect(proposal.status).toBe("awaiting_confirmation");
    expect(decideChangeProposal(proposal, "partial", ["paragraph-1"]).status).toBe("partially_accepted");
    expect(() => executeRevisionProposal(scene, { ...proposal, status: "accepted" }, "other-version")).toThrow("版本冲突");
    const executed = executeRevisionProposal(scene, { ...proposal, status: "accepted" }, base.id);
    expect(executed.scene.revisions).toHaveLength(1); expect(executed.proposal.status).toBe("executed");
  });
});
