import { describe, expect, it, vi } from "vitest";
import { MockProvider } from "@/providers/mock";
import { buildContextSnapshot } from "../integrations/sillytavern-extension/src/context-adapter";
import { StoryCardStudioClient } from "../integrations/sillytavern-extension/src/api-client";
import { executeSillyTavernTool } from "@/services/sillytavern-integration-tasks";

const character = { name: "柳青", avatar: "liu.png", data: { name: "柳青", description: "旅人", personality: "谨慎", scenario: "临水镇", first_mes: "你好", mes_example: "", creator_notes: "", system_prompt: "", post_history_instructions: "", alternate_greetings: [], tags: [], creator: "", character_version: "1", extensions: {} } };

async function snapshot() {
  return buildContextSnapshot({ characterId: 0, groupId: null, chatId: "chat", characters: [character], groups: [], chat: [{ mes: "柳青决定调查古玉。", is_user: false, name: "柳青" }], chatMetadata: {} }, { chatRange: { kind: "recent", count: 1 } });
}

describe("SillyTavern to Story Card Studio integration", () => {
  it("reuses the existing character generator and returns a writeback preview payload", async () => {
    const result = await executeSillyTavernTool(await snapshot(), "character_generate", { provider: new MockProvider(), model: "mock-model" });
    expect(result.kind).toBe("character_card");
    expect((result.payload as { spec: string }).spec).toBe("chara_card_v2");
    expect(result.warnings).toContain("结果仅供预览，尚未写回 SillyTavern。");
  });

  it("runs the existing lorebook and plot-analysis services", async () => {
    const current = await snapshot(); const provider = new MockProvider();
    const lorebook = await executeSillyTavernTool(current, "lorebook_generate", { provider, model: "mock-model" });
    const analysis = await executeSillyTavernTool(current, "plot_analysis", { provider, model: "mock-model" });
    expect(lorebook.kind).toBe("lorebook");
    expect(analysis.kind).toBe("analysis_report");
  });

  it("sends snapshot, creates task and retrieves a structured result through the client", async () => {
    const current = await snapshot(); const calls: string[] = [];
    const task = { id: "t1", projectId: "p1", snapshotId: current.snapshotId, tool: "plot_analysis", status: "completed", createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString(), error: null, result: { kind: "analysis_report", payload: { summary: "可行" }, warnings: [] } };
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      const path = String(url); calls.push(path);
      if (path.endsWith("/snapshots")) return Response.json({ snapshotId: current.snapshotId });
      if (path.endsWith("/tasks")) return Response.json(task);
      return Response.json(task);
    }) as typeof fetch;
    const client = new StoryCardStudioClient({ baseUrl: "https://studio.example", token: "workspace-token", fetcher });
    await client.uploadSnapshot("p1", current); const created = await client.createTask("p1", current.snapshotId, "plot_analysis"); const result = await client.getResult(created.id);
    expect(result?.kind).toBe("analysis_report");
    expect(calls.map((item) => new URL(item).pathname)).toEqual(["/api/integrations/sillytavern/snapshots", "/api/integrations/sillytavern/tasks", "/api/integrations/sillytavern/tasks/t1"]);
  });
});
