import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { createEmptyCharacterCard } from "@/domain/character-card";
import { GET as getInfo } from "@/app/api/integrations/sillytavern/info/route";
import { POST as saveSnapshot } from "@/app/api/integrations/sillytavern/snapshots/route";

const token = "a-secure-workspace-token-123456";
function request(path: string, body?: unknown) {
  return new NextRequest(`https://studio.example${path}`, { method: body ? "POST" : "GET", headers: { origin: "https://silly.example", authorization: `Bearer ${token}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
}

describe("C2.3 integration API routes", () => {
  it("returns versioned capability information", async () => {
    process.env.WORKSPACE_ACCESS_TOKEN = token; process.env.WORKSPACE_ALLOWED_ORIGINS = "https://silly.example";
    const response = await getInfo(request("/api/integrations/sillytavern/info")); const payload = await response.json();
    expect(response.status).toBe(200); expect(payload.apiVersion).toBe("1.0.0"); expect(payload.capabilities.characterWriteback).toBe(false);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://silly.example");
  });

  it("accepts a bounded, authenticated context snapshot", async () => {
    process.env.WORKSPACE_ACCESS_TOKEN = token; process.env.WORKSPACE_ALLOWED_ORIGINS = "https://silly.example";
    const snapshot = { snapshotId: "snap-route", createdAt: new Date().toISOString(), mode: "character", chatId: "chat", character: { index: 0, name: "", avatar: "", modifiedMarker: "", fingerprint: "a".repeat(64), card: createEmptyCharacterCard() }, group: null, chat: { range: { kind: "recent", count: 1 }, messages: [], characterCount: 0, participants: [] }, worldInfo: [], capabilities: { characterWriteback: false, worldInfoWriteback: false, associationWriteback: false } };
    const response = await saveSnapshot(request("/api/integrations/sillytavern/snapshots", { projectId: "project-1", snapshot }));
    expect(response.status).toBe(201); expect(await response.json()).toEqual({ snapshotId: "snap-route" });
  });
});
