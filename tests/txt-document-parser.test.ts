import { describe, expect, it } from "vitest";
import { parseTxtDocument } from "@/services/document-ingestion/txt-parser";

describe("TXT document parser", () => {
  it("detects UTF-8 and strips BOM", () => {
    const body = new TextEncoder().encode("第一章\r\n江风吹过。\r\n");
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...body]);
    const parsed = parseTxtDocument(bytes.buffer);
    expect(parsed.encoding).toBe("utf-8");
    expect(parsed.text).toContain("第一章");
    expect(parsed.text).toContain("\r\n");
    expect(parsed.text).not.toContain("\ufeff");
    expect(parsed.confidence).toBeGreaterThan(0.9);
  });

  it("detects UTF-16LE without silently producing NUL-filled text", () => {
    const text = "第一章\n夜色渐深。";
    const bytes = new Uint8Array(text.length * 2);
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      bytes[index * 2] = code & 0xff;
      bytes[index * 2 + 1] = code >> 8;
    }
    const parsed = parseTxtDocument(bytes.buffer);
    expect(parsed.encoding).toBe("utf-16le");
    expect(parsed.text).toBe(text);
  });

  it("detects common Chinese GB18030 bytes and supports manual encoding", () => {
    const bytes = new Uint8Array([0xb5, 0xda, 0xd2, 0xbb, 0xd5, 0xc2, 0x0a, 0xc4, 0xe3, 0xba, 0xc3]);
    const auto = parseTxtDocument(bytes.buffer);
    const manual = parseTxtDocument(bytes.buffer, { encoding: "gb18030" });
    expect(auto.encoding).toBe("gb18030");
    expect(auto.text).toBe("第一章\n你好");
    expect(manual.text).toBe("第一章\n你好");
  });

  it("requires preview selection when encoding confidence is insufficient", () => {
    const bytes = new Uint8Array([0xff, 0xff, 0x00, 0x81, 0x00, 0x81]);
    const parsed = parseTxtDocument(bytes.buffer);
    expect(parsed.needsEncodingChoice).toBe(true);
    expect(parsed.warnings.join(" ")).toContain("编码");
    expect(parsed.preview.length).toBeGreaterThan(0);
  });

  it("warns about extreme single-line files", () => {
    const parsed = parseTxtDocument(new TextEncoder().encode("字".repeat(20_001)).buffer);
    expect(parsed.warnings.join(" ")).toContain("单行");
  });
});
