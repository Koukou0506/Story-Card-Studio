import { describe, expect, it, vi } from "vitest";
import { StoryCardStudioClient, StudioClientError } from "../integrations/sillytavern-extension/src/api-client";
import { ExtensionTokenStore } from "../integrations/sillytavern-extension/src/settings";

describe("Story Card Studio Extension API client", () => {
  it("reports authentication errors without exposing the token", async () => {
    const client = new StoryCardStudioClient({ baseUrl: "https://studio.example", token: "secret-token", fetcher: vi.fn(async () => new Response(JSON.stringify({ error: "未认证" }), { status: 401, headers: { "content-type": "application/json" } })) as typeof fetch });
    await expect(client.getProjects()).rejects.toMatchObject({ code: "unauthorized" });
    await client.getProjects().catch((error: Error) => expect(error.message).not.toContain("secret-token"));
  });

  it("supports request cancellation", async () => {
    const fetcher = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }))) as typeof fetch;
    const client = new StoryCardStudioClient({ baseUrl: "https://studio.example", token: "token", fetcher });
    const controller = new AbortController(); const pending = client.getTask("task-1", controller.signal); controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "cancelled" } satisfies Partial<StudioClientError>);
  });

  it("keeps tokens in session storage unless persistence is explicitly enabled", () => {
    const store = new ExtensionTokenStore(sessionStorage, localStorage);
    store.save("session-token", false);
    expect(sessionStorage.getItem("story_card_studio_token")).toBe("session-token");
    expect(localStorage.getItem("story_card_studio_token")).toBeNull();
    store.save("persistent-token", true);
    expect(localStorage.getItem("story_card_studio_token")).toBe("persistent-token");
  });
});
