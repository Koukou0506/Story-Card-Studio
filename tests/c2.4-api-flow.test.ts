import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as analyze } from "@/app/api/style-risk/analyze/route";
import { DELETE as deleteBaseline, GET as listBaselines, POST as createBaseline } from "@/app/api/style-risk/baselines/route";
import { POST as revise } from "@/app/api/style-risk/revision/route";
import { StoryCardStudioClient } from "../integrations/sillytavern-extension/src/api-client";

describe("C2.4 API and Extension client flow", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("runs a model-assisted report through the main API", async () => {
    vi.stubEnv("DEFAULT_PROVIDER", "mock");
    const response = await analyze(new NextRequest("http://localhost/api/style-risk/analyze", { method: "POST", body: JSON.stringify({ request: { text: "然而，他感到非常悲伤。因此，他感到非常悲伤。".repeat(15), useModel: true }, provider: "mock", model: "mock-model" }), headers: { "content-type": "application/json" } }));
    const payload = await response.json(); expect(response.status).toBe(200); expect(payload.report.modelStatus).toBe("completed"); expect(payload.report.disclaimer).toContain("不能可靠证明");
  });

  it("creates, lists and deletes an abstract personal baseline", async () => {
    const created = await createBaseline(new NextRequest("http://localhost/api/style-risk/baselines", { method: "POST", body: JSON.stringify({ name: "我的样本", text: "风吹过长街。她停在门前。".repeat(30), genre: "悬疑", pointOfView: "第三人称" }), headers: { "content-type": "application/json" } }));
    const baseline = (await created.json()).baseline; expect(baseline.sourceTextStored).toBe(false);
    expect((await (await listBaselines()).json()).baselines.some((item: { id: string }) => item.id === baseline.id)).toBe(true);
    const deleted = await deleteBaseline(new NextRequest(`http://localhost/api/style-risk/baselines?id=${baseline.id}`, { method: "DELETE" })); expect((await deleted.json()).deleted).toBe(true);
  });

  it("creates a bounded local optimization payload without an AI-detector promise", async () => {
    vi.stubEnv("DEFAULT_PROVIDER", "mock");
    const response = await revise(new NextRequest("http://localhost/api/style-risk/revision", { method: "POST", body: JSON.stringify({ text: "然而，他感到非常悲伤。", instruction: "减少重复解释", provider: "mock", model: "mock-model" }), headers: { "content-type": "application/json" } }));
    const payload = await response.json(); expect(response.status).toBe(200); expect(typeof payload.replacement).toBe("string"); expect(payload.replacement).not.toContain("绕过 AI 检测");
  });

  it("sends the selected diagnosis baseline and supports cancellation through the shared Extension client", async () => {
    let body: Record<string, unknown> = {}; const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => { if (init?.body) body = JSON.parse(String(init.body)); return Response.json({ id: "task", projectId: "p", snapshotId: "s", tool: "style_risk", options: { styleRiskBaseline: "character" }, status: init?.method === "DELETE" ? "cancelled" : "pending", createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString(), error: null, result: null }); }) as typeof fetch;
    const client = new StoryCardStudioClient({ baseUrl: "https://studio.example", token: "token", fetcher });
    await client.createStyleRiskTask("p", "s", "character"); expect(body.options).toEqual({ styleRiskBaseline: "character" }); await client.cancelTask("task"); expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
