import { describe, expect, it } from "vitest";
import {
  WorkspaceSessionManager,
  isAllowedWorkspaceOrigin,
  safeTokenEqual,
} from "@/server/workspace-auth";

describe("workspace authentication", () => {
  it("compares access tokens without returning plaintext material", () => {
    expect(safeTokenEqual("correct", "correct")).toBe(true);
    expect(safeTokenEqual("correct", "wrong")).toBe(false);
  });

  it("creates expiring sessions with CSRF verification", () => {
    const sessions = new WorkspaceSessionManager(1_000);
    const session = sessions.create(1_000);
    expect(sessions.verify(session.id, session.csrf, 1_500)).toBe(true);
    expect(sessions.verify(session.id, "bad", 1_500)).toBe(false);
    expect(sessions.verify(session.id, session.csrf, 2_001)).toBe(false);
  });

  it("accepts same-origin and explicit CORS allowlist only", () => {
    expect(isAllowedWorkspaceOrigin("https://studio.example", "https://studio.example", [])).toBe(true);
    expect(isAllowedWorkspaceOrigin("https://phone.example", "https://studio.example", ["https://phone.example"])).toBe(true);
    expect(isAllowedWorkspaceOrigin("https://evil.example", "https://studio.example", [])).toBe(false);
  });
});

