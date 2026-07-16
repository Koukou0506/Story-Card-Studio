import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET as listProjects } from "@/app/api/workspace/projects/route";
import { POST as login } from "@/app/api/workspace/session/route";

const previousToken = process.env.WORKSPACE_ACCESS_TOKEN;
afterEach(() => { process.env.WORKSPACE_ACCESS_TOKEN = previousToken; });

describe("workspace API security", () => {
  it("rejects project access without an authenticated session", async () => {
    process.env.WORKSPACE_ACCESS_TOKEN = "a-secure-random-token-with-32-characters";
    const response = await listProjects(new NextRequest("https://studio.example/api/workspace/projects"));
    expect(response.status).toBe(401);
  });

  it("rejects non-allowlisted origins before authentication", async () => {
    process.env.WORKSPACE_ACCESS_TOKEN = "a-secure-random-token-with-32-characters";
    const response = await listProjects(new NextRequest("https://studio.example/api/workspace/projects", { headers: { origin: "https://evil.example" } }));
    expect(response.status).toBe(403);
  });

  it("exchanges a correct token for an HttpOnly session and CSRF value", async () => {
    const token = "a-secure-random-token-with-32-characters";
    process.env.WORKSPACE_ACCESS_TOKEN = token;
    const response = await login(new NextRequest("https://studio.example/api/workspace/session", {
      method: "POST", headers: { origin: "https://studio.example", "content-type": "application/json" }, body: JSON.stringify({ accessToken: token }),
    }));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.csrf).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(JSON.stringify(payload)).not.toContain(token);
  });
});

