import { detect } from "chardet";

export type SupportedTextEncoding = "utf-8" | "utf-16le" | "utf-16be" | "gb18030";

export interface TxtParseOptions {
  encoding?: SupportedTextEncoding;
  previewCharacters?: number;
}

export interface TxtParseResult {
  text: string;
  encoding: SupportedTextEncoding;
  confidence: number;
  preview: string;
  replacementRatio: number;
  needsEncodingChoice: boolean;
  warnings: string[];
}

function hasPrefix(bytes: Uint8Array, prefix: number[]): boolean {
  return prefix.every((value, index) => bytes[index] === value);
}

function tryDecode(bytes: Uint8Array, encoding: SupportedTextEncoding, fatal = true): string | null {
  try {
    return new TextDecoder(encoding, { fatal }).decode(bytes);
  } catch {
    return null;
  }
}

function textQuality(text: string): number {
  if (!text) return 0;
  let suspicious = 0;
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (char === "\ufffd" || char === "\u0000" || (code < 32 && !"\n\r\t".includes(char))) suspicious += 1;
  }
  return Math.max(0, 1 - suspicious / text.length);
}

function literaryTextRatio(text: string): number {
  if (!text.length) return 0;
  const matches = [...text].filter((char) => /[\u3400-\u4dbf\u4e00-\u9fffA-Za-z0-9\s，。！？…“”‘’：；、—\-]/u.test(char)).length;
  return matches / text.length;
}

function replacementRatio(text: string): number {
  if (!text.length) return 0;
  return [...text].filter((char) => char === "\ufffd").length / text.length;
}

function normalizeDetectedEncoding(value: string | null): SupportedTextEncoding | null {
  const normalized = value?.toLocaleLowerCase().replace(/[-_]/g, "") ?? "";
  if (normalized === "utf8") return "utf-8";
  if (normalized === "utf16le") return "utf-16le";
  if (normalized === "utf16be") return "utf-16be";
  if (["gb18030", "gbk", "gb2312", "big5"].includes(normalized)) return "gb18030";
  return null;
}

function detectEncoding(bytes: Uint8Array): { encoding: SupportedTextEncoding; confidence: number; offset: number } {
  if (hasPrefix(bytes, [0xef, 0xbb, 0xbf])) return { encoding: "utf-8", confidence: 1, offset: 3 };
  if (hasPrefix(bytes, [0xff, 0xfe])) return { encoding: "utf-16le", confidence: 1, offset: 2 };
  if (hasPrefix(bytes, [0xfe, 0xff])) return { encoding: "utf-16be", confidence: 1, offset: 2 };

  if (bytes.length >= 4 && bytes.length % 2 === 0) {
    const little = tryDecode(bytes, "utf-16le", true);
    const big = tryDecode(bytes, "utf-16be", true);
    const littleScore = little ? literaryTextRatio(little) : 0;
    const bigScore = big ? literaryTextRatio(big) : 0;
    if (Math.max(littleScore, bigScore) > 0.82) {
      return littleScore >= bigScore
        ? { encoding: "utf-16le", confidence: 0.9, offset: 0 }
        : { encoding: "utf-16be", confidence: 0.9, offset: 0 };
    }
  }

  const sampleLength = Math.min(bytes.length, 4096);
  let oddZeros = 0;
  let evenZeros = 0;
  for (let index = 0; index < sampleLength; index += 1) {
    if (bytes[index] === 0) (index % 2 ? oddZeros++ : evenZeros++);
  }
  const littleZeroText = tryDecode(bytes, "utf-16le", true);
  const bigZeroText = tryDecode(bytes, "utf-16be", true);
  if (sampleLength >= 4 && oddZeros / sampleLength > 0.2 && littleZeroText && literaryTextRatio(littleZeroText) > 0.7) return { encoding: "utf-16le", confidence: 0.92, offset: 0 };
  if (sampleLength >= 4 && evenZeros / sampleLength > 0.2 && bigZeroText && literaryTextRatio(bigZeroText) > 0.7) return { encoding: "utf-16be", confidence: 0.92, offset: 0 };

  const utf8 = tryDecode(bytes, "utf-8", true);
  if (utf8 !== null && textQuality(utf8) > 0.98) return { encoding: "utf-8", confidence: 0.96, offset: 0 };

  const detected = normalizeDetectedEncoding(detect(bytes));
  if (detected) {
    const decoded = tryDecode(bytes, detected, true);
    if (decoded !== null && textQuality(decoded) > 0.96 && literaryTextRatio(decoded) > 0.7) return { encoding: detected, confidence: 0.82, offset: 0 };
  }

  const chinese = tryDecode(bytes, "gb18030", true);
  if (chinese !== null && textQuality(chinese) > 0.96 && literaryTextRatio(chinese) > 0.7) return { encoding: "gb18030", confidence: 0.72, offset: 0 };
  return { encoding: "utf-8", confidence: 0.2, offset: 0 };
}

export function parseTxtDocument(data: ArrayBuffer, options: TxtParseOptions = {}): TxtParseResult {
  const bytes = new Uint8Array(data);
  const detected = options.encoding
    ? { encoding: options.encoding, confidence: 1, offset: 0 }
    : detectEncoding(bytes);
  const sliced = bytes.subarray(detected.offset);
  const decoded = tryDecode(sliced, detected.encoding, false) ?? "";
  // Keep decoded line endings in the extracted source. Text normalization owns
  // CRLF/LF cleanup so Source Span offsets can still map back to this raw text.
  const text = decoded.replace(/^\ufeff/, "");
  const replacements = replacementRatio(text);
  const quality = textQuality(text);
  const warnings: string[] = [];
  const needsEncodingChoice = detected.confidence < 0.6 || replacements > 0.01 || quality < 0.95;
  if (needsEncodingChoice) warnings.push("编码置信度不足或存在乱码风险，请预览并手动选择编码。");
  if (replacements > 0.01) warnings.push(`检测到较多替换字符（${Math.round(replacements * 100)}%）。`);
  if (text.split("\n").some((line) => line.length > 20_000)) warnings.push("检测到极长单行文本，章节和段落识别可能不准确。");
  if (!text.trim()) warnings.push("解码后没有有效正文，请检查编码或文件内容。");
  return {
    text,
    encoding: detected.encoding,
    confidence: Math.min(detected.confidence, quality),
    preview: text.slice(0, options.previewCharacters ?? 1000) || "（无法生成有效预览）",
    replacementRatio: replacements,
    needsEncodingChoice,
    warnings,
  };
}
