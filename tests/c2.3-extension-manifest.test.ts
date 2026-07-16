import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("C2.3 SillyTavern Extension manifest", () => {
  it("declares the current bundled extension contract", () => {
    const manifest = JSON.parse(readFileSync(resolve("integrations/sillytavern-extension/manifest.json"), "utf8"));
    expect(manifest).toMatchObject({
      display_name: "Story Card Studio",
      js: "index.js",
      css: "style.css",
      minimum_client_version: "1.12.12",
      auto_update: true,
    });
    expect(manifest.hooks.activate).toBe("onActivate");
    const compatibility = JSON.parse(readFileSync(resolve("integrations/sillytavern-extension/compatibility.json"), "utf8"));
    expect(compatibility).toMatchObject({
      extensionVersion: manifest.version,
      minimumSillyTavernVersion: manifest.minimum_client_version,
      contractTestedSillyTavernVersion: "1.18.0",
    });
  });
});
