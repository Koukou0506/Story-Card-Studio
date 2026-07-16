import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("PWA runtime", () => {
  it("registers the service worker and requires an explicit update action", async () => {
    const source = await readFile("src/components/pwa/PwaRuntime.tsx", "utf8");
    expect(source).toContain('register("/sw.js"');
    expect(source).toContain("updateAvailable");
    expect(source).toContain("SKIP_WAITING");
    expect(source).not.toMatch(/window\.location\.reload\(\).*updatefound/s);
  });
});
