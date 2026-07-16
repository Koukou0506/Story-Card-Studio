import { describe, expect, it } from "vitest";
import { parseEpubDocument } from "@/services/document-ingestion/epub-parser";
import { parseDocxDocument } from "@/services/document-ingestion/docx-parser";
import { parseMarkdownDocument } from "@/services/document-ingestion/markdown-parser";
import { createStoredZip } from "./helpers/stored-zip";

describe("作品导入格式 Adapter", () => {
  it("按 EPUB spine 而不是压缩包顺序提取正文，并在缺少目录时警告", async () => {
    const data = createStoredZip({
      "mimetype": "application/epub+zip",
      "META-INF/container.xml": `<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>`,
      "OEBPS/content.opf": `<package><manifest><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/><item id="b" href="b.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="b"/><itemref idref="a"/></spine></package>`,
      "OEBPS/a.xhtml": `<html><body><h1>第一章</h1><p>先出现于压缩包。</p><script>danger()</script></body></html>`,
      "OEBPS/b.xhtml": `<html><body><h1>第二章</h1><p>先出现在阅读顺序。</p></body></html>`,
    });
    const parsed = await parseEpubDocument(data);
    expect(parsed.sections.map((item) => item.title)).toEqual(["第二章", "第一章"]);
    expect(parsed.rawText.indexOf("第二章")).toBeLessThan(parsed.rawText.indexOf("第一章"));
    expect(parsed.rawText).not.toContain("danger");
    expect(parsed.warnings.join(" ")).toContain("目录");
    expect(parsed.sourceFragments[0].epubSpineIndex).toBe(0);
  });

  it("拒绝 EPUB 路径穿越条目", async () => {
    const data = createStoredZip({ "mimetype": "application/epub+zip", "../evil.xhtml": "x" });
    await expect(parseEpubDocument(data)).rejects.toThrow(/路径|穿越/);
  });

  it("提取 DOCX Heading、修订后文本和脚注", async () => {
    const data = createStoredZip({
      "[Content_Types].xml": "<Types/>",
      "word/document.xml": `<w:document xmlns:w="w"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>第一章</w:t></w:r></w:p><w:p><w:r><w:t>保留</w:t></w:r><w:del><w:r><w:delText>旧稿</w:delText></w:r></w:del><w:ins><w:r><w:t>新稿</w:t></w:r></w:ins><w:footnoteReference w:id="2"/></w:p></w:body></w:document>`,
      "word/footnotes.xml": `<w:footnotes xmlns:w="w"><w:footnote w:id="2"><w:p><w:r><w:t>脚注内容</w:t></w:r></w:p></w:footnote></w:footnotes>`,
    });
    const parsed = await parseDocxDocument(data, { revisionMode: "final", includeFootnotes: true });
    expect(parsed.sections[0]).toMatchObject({ title: "第一章", headingLevel: 1 });
    expect(parsed.rawText).toContain("保留新稿");
    expect(parsed.rawText).not.toContain("旧稿");
    expect(parsed.rawText).toContain("脚注内容");
    expect(parsed.sourceFragments.some((item) => item.docxPart === "footnote")).toBe(true);
  });

  it("将 Markdown 标题映射为章节并保留原始行范围", () => {
    const parsed = parseMarkdownDocument(`---\ntitle: 示例\n---\n# 第一卷\n\n第一段。\n\n第二章\n---\n> 引用正文\n\n\`\`\`js\nalert(1)\n\`\`\``, {
      ignoreFrontMatter: true, ignoreCodeBlocks: true, keepQuotes: true, volumeHeadingLevel: 1, chapterHeadingLevel: 2,
    });
    expect(parsed.rawText).not.toContain("title: 示例");
    expect(parsed.rawText).not.toContain("alert(1)");
    expect(parsed.rawText).toContain("引用正文");
    expect(parsed.sections.map((item) => item.title)).toEqual(["第一卷", "第二章"]);
    expect(parsed.sourceFragments.every((item) => (item.markdownLineStart ?? 0) > 0)).toBe(true);
  });
});
