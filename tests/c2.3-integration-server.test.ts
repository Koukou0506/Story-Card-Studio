import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createEmptyCharacterCard } from "@/domain/character-card";
import { SillyTavernContextSnapshotSchema } from "@/integrations/sillytavern/contracts";
import { authorizeSillyTavernIntegration } from "@/server/sillytavern-integration-api";
import { SillyTavernTaskStore } from "@/server/sillytavern-task-store";

const snapshot = SillyTavernContextSnapshotSchema.parse({
  snapshotId: "snapshot-1", createdAt: new Date().toISOString(), mode: "character", chatId: "chat-1",
  character: { index: 0, name: "柳青", avatar: "liu.png", modifiedMarker: "1", fingerprint: "a".repeat(64), card: createEmptyCharacterCard() },
  group: null, chat: { range: { kind: "recent", count: 1 }, messages: [], characterCount: 0, participants: [] }, worldInfo: [],
  capabilities: { characterWriteback: false, worldInfoWriteback: false, associationWriteback: true },
});

describe("C2.3 integration server boundary", () => {
  it("requires the workspace access token and allowed Origin", () => {
    process.env.WORKSPACE_ACCESS_TOKEN = "a-secure-workspace-token-123456";
    process.env.WORKSPACE_ALLOWED_ORIGINS = "https://silly.example";
    const denied = authorizeSillyTavernIntegration(new NextRequest("https://studio.example/api/integrations/sillytavern/projects", { headers: { origin: "https://silly.example", authorization: "Bearer wrong" } }));
    expect(denied?.status).toBe(401);
    const allowed = authorizeSillyTavernIntegration(new NextRequest("https://studio.example/api/integrations/sillytavern/projects", { headers: { origin: "https://silly.example", authorization: "Bearer a-secure-workspace-token-123456" } }));
    expect(allowed).toBeNull();
  });

  it("persists snapshots and exposes pending to completed task states", async () => {
    const store = new SillyTavernTaskStore(); store.saveSnapshot("project-1", snapshot);
    const runner = vi.fn(async () => ({ kind: "character_card" as const, payload: snapshot.character!.card, warnings: ["预览"] }));
    const created = store.createTask("project-1", snapshot.snapshotId, "character_generate", runner);
    expect(created.status).toBe("pending");
    await vi.waitFor(() => expect(store.getTask(created.id)?.status).toBe("completed"));
    expect(store.getTask(created.id)?.result?.kind).toBe("character_card");
  });

  it("cancels a running task without discarding its source snapshot", async () => {
    const store = new SillyTavernTaskStore(); store.saveSnapshot("project-1", snapshot);
    const task = store.createTask("project-1", snapshot.snapshotId, "plot_analysis", (_snapshot, _tool, signal) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true })));
    store.cancelTask(task.id);
    await vi.waitFor(() => expect(store.getTask(task.id)?.status).toBe("cancelled"));
    expect(store.getSnapshot(snapshot.snapshotId)).not.toBeNull();
  });
});
