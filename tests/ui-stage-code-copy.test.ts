import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { describe, expect, it } from "vitest";
import ts from "typescript";

const roots = ["src/components", "src/app/page.tsx", "integrations/sillytavern-extension/src"];
const reportFiles = [
  "src/services/planning-export.ts", "src/services/chapter-planning-export.ts",
  "src/services/prose-export.ts", "src/services/continuity-export.ts",
];
const stageCode = /(?:Phase\s+)?(?:A[123]|B[123]|C1|C2\.[1-4]|D1)(?![\w.])/g;

function filesAt(path: string): string[] {
  if (statSync(path).isFile()) return [path];
  return readdirSync(path).flatMap((name) => filesAt(join(path, name)));
}

function maintainedCopy(source: string): string[] {
  const file = ts.createSourceFile("copy.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const values: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteralLike(node) || ts.isJsxText(node) || ts.isTemplateExpression(node)) values.push(node.getText(file));
    ts.forEachChild(node, visit);
  };
  visit(file);
  return values;
}

describe("用户界面命名", () => {
  it("应用维护的静态用户文案不使用开发阶段代号", () => {
    const files = [...roots.flatMap(filesAt), ...reportFiles].filter((file) => [".ts", ".tsx"].includes(extname(file)));
    const violations = files.flatMap((file) => maintainedCopy(readFileSync(file, "utf8"))
      .filter((text) => { stageCode.lastIndex = 0; return stageCode.test(text); })
      .map((text) => `${file}: ${text.slice(0, 100)}`));
    expect(violations).toEqual([]);
  });

  it("不对用户正文中的阶段代号做替换", () => {
    const userText = "A1 是人物写在信里的编号，B2 是仓库门牌，C2.4 是实验记录。";
    expect(userText).toBe("A1 是人物写在信里的编号，B2 是仓库门牌，C2.4 是实验记录。");
  });
});
