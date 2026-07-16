import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createEmptyProjectDraft } from "@/domain/project-draft";
import { createMockContinuityProject } from "@/services/continuity-mock";
import { AssistantToolRegistry, createDefaultAssistantRegistry } from "@/services/assistant-tools";
import { routeAssistantIntent } from "@/services/assistant-intent-router";
import { AssistantOrchestrator } from "@/services/assistant-orchestrator";
import { createAssistantContext, switchAssistantContext } from "@/services/assistant-context";

const draft = () => { const value = createEmptyProjectDraft(); value.continuityProjects = [createMockContinuityProject()]; value.characterCard.data.name = "柳如烟"; return value; };

describe("项目助手编排", () => {
  it("validates tools and separates read from confirmed writes", async () => {
    const registry = new AssistantToolRegistry();
    registry.register({ toolId: "read", name: "读取", description: "", inputSchema: z.object({ q: z.string() }), outputSchema: z.object({ value: z.string() }), permission: "read", operationType: "read", supportedScopes: ["project"], timeoutMs: 1000, sourceRequirement: false, handler: async ({ q }) => ({ value: q }) });
    expect(await registry.execute("read", { q: "x" }, { allowConfirmedWrite: false })).toEqual({ value: "x" });
    await expect(registry.execute("read", { q: 1 }, { allowConfirmedWrite: false })).rejects.toThrow();
    expect(() => registry.register({ toolId: "read", name: "重复", description: "", inputSchema: z.object({}), outputSchema: z.object({}), permission: "read", operationType: "read", supportedScopes: ["project"], timeoutMs: 1, sourceRequirement: false, handler: async () => ({}) })).toThrow("重复");
  });

  it("routes read, visual and change requests without giving the model permissions", () => {
    expect(routeAssistantIntent("搜索旧案").intent).toBe("search");
    expect(routeAssistantIntent("显示人物关系图").intent).toBe("visualize");
    expect(routeAssistantIntent("把这一段改得更紧张").intent).toBe("modify");
  });

  it("switches context explicitly and returns sourced read-only answers when the model fails", async () => {
    const project = draft(); const registry = createDefaultAssistantRegistry(project);
    const context = switchAssistantContext(createAssistantContext("project-1"), { chapterId: "chapter-2", characterIds: ["柳如烟"] });
    const orchestrator = new AssistantOrchestrator(registry, { maxToolCalls: 3, provider: { type: "mock", displayName: "broken", models: [], defaultModel: "x", async generate() { throw new Error("offline"); } } });
    const result = await orchestrator.respond({ message: "搜索柳如烟", context });
    expect(result.answer).toContain("柳如烟"); expect(result.sources.length).toBeGreaterThan(0); expect(result.modelStatus).toBe("failed_fallback");
    expect(result.toolRuns.length).toBeLessThanOrEqual(3); expect(result.context.chapterId).toBe("chapter-2");
  });
});
