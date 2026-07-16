import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";

describe("PWA assets", () => {
  it("provides an installable standalone manifest", () => {
    const value = manifest();
    expect(value.start_url).toBe("/");
    expect(value.display).toBe("standalone");
    expect(value.icons?.some((icon) => icon.sizes === "192x192")).toBe(true);
    expect(value.icons?.some((icon) => icon.sizes === "512x512")).toBe(true);
  });

  it("keeps API and authenticated requests out of the service worker cache", async () => {
    const source = await readFile("public/sw.js", "utf8");
    expect(source).toContain("/api/");
    expect(source).toContain("authorization");
    expect(source).toContain("offline.html");
    expect(source).not.toMatch(/cache\.put\([^\n]*api/i);
  });

  it("pre-caches the current Next.js application shell on first install", async () => {
    const source = await readFile("public/sw.js", "utf8");
    expect(source).toContain("extractShellAssets");
    expect(source).toContain('/_next/static/');
    expect(source).toContain("cacheApplicationShell");
  });
});
