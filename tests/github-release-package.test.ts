import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("GitHub 发布契约", () => {
  test("发布信息指向正式仓库并采用 MIT", async () => {
    const [pkg, manifest, license] = await Promise.all([
      readFile("package.json", "utf8"),
      readFile("integrations/sillytavern-extension/manifest.json", "utf8"),
      readFile("LICENSE", "utf8"),
    ]);
    expect(pkg).toContain("Koukou0506/Story-Card-Studio");
    expect(manifest).toContain("Koukou0506/Story-Card-Studio");
    expect(license).toContain("MIT License");
  });

  test("标签发布生成 ZIP 和可安装扩展分支", async () => {
    const workflow = await readFile(".github/workflows/release.yml", "utf8");
    expect(workflow).toContain("story-card-studio-sillytavern-extension");
    expect(workflow).toContain("sillytavern-extension");
    expect(workflow).toContain("gh release create");
  });
});
