import type { TextOffsetMapSegment } from "@/domain/document-ingestion";

interface MappedCharacter {
  char: string;
  rawStart: number;
  rawEnd: number;
  operation: TextOffsetMapSegment["operation"];
}

export interface TextNormalizationResult {
  rawText: string;
  normalizedText: string;
  offsetMap: TextOffsetMapSegment[];
  warnings: string[];
  removedHeaderFooterLines: string[];
}

function baseCharacters(rawText: string): { characters: MappedCharacter[]; removedControls: number } {
  const characters: MappedCharacter[] = [];
  let removedControls = 0;
  for (let index = 0; index < rawText.length; index += 1) {
    const char = rawText[index];
    if (char === "\r") {
      const end = rawText[index + 1] === "\n" ? ++index + 1 : index + 1;
      characters.push({ char: "\n", rawStart: end === index + 1 ? index : index - 1, rawEnd: end, operation: "collapsed_whitespace" });
      continue;
    }
    const code = char.charCodeAt(0);
    if (char === "\u200b" || char === "\u0000" || (code < 32 && !["\n", "\t", "\f"].includes(char))) {
      removedControls += 1;
      continue;
    }
    const normalizedChar = char === "\t" || char === "\u3000" ? " " : char;
    const previous = characters.at(-1);
    if (normalizedChar === " " && previous?.char === " ") {
      previous.rawEnd = index + 1;
      previous.operation = "collapsed_whitespace";
      continue;
    }
    characters.push({
      char: normalizedChar,
      rawStart: index,
      rawEnd: index + 1,
      operation: normalizedChar === char ? "unchanged" : "collapsed_whitespace",
    });
  }
  return { characters, removedControls };
}

function splitPagesAndLines(characters: MappedCharacter[]): MappedCharacter[][][] {
  const pages: MappedCharacter[][][] = [[]];
  let line: MappedCharacter[] = [];
  for (const character of characters) {
    if (character.char === "\f") {
      if (line.length) pages.at(-1)!.push(line);
      line = [];
      pages.push([]);
    } else if (character.char === "\n") {
      pages.at(-1)!.push(line);
      line = [];
    } else {
      line.push(character);
    }
  }
  if (line.length || !pages.at(-1)!.length) pages.at(-1)!.push(line);
  return pages;
}

const lineText = (line: MappedCharacter[]) => line.map((item) => item.char).join("").trim();

function compressMap(characters: MappedCharacter[]): TextOffsetMapSegment[] {
  const segments: TextOffsetMapSegment[] = [];
  characters.forEach((character, index) => {
    const previous = segments.at(-1);
    if (previous && previous.operation === character.operation && previous.rawEnd === character.rawStart && previous.normalizedEnd === index) {
      previous.normalizedEnd = index + 1;
      previous.rawEnd = character.rawEnd;
    } else {
      segments.push({ normalizedStart: index, normalizedEnd: index + 1, rawStart: character.rawStart, rawEnd: character.rawEnd, operation: character.operation });
    }
  });
  return segments;
}

export function normalizeDocumentText(rawText: string): TextNormalizationResult {
  const { characters, removedControls } = baseCharacters(rawText);
  const pages = splitPagesAndLines(characters);
  const boundaryCounts = new Map<string, number>();
  for (const page of pages) {
    const nonEmpty = page.filter((line) => lineText(line));
    const boundaryLines = new Set([nonEmpty[0], nonEmpty.at(-1)].map((line) => line ? lineText(line) : "").filter(Boolean));
    for (const text of boundaryLines) {
      if (text && text.length <= 80) boundaryCounts.set(text, (boundaryCounts.get(text) ?? 0) + 1);
    }
  }
  const repeated = new Set([...boundaryCounts].filter(([, count]) => count >= 2).map(([text]) => text));
  const removedHeaderFooterLines = new Set<string>();
  const output: MappedCharacter[] = [];
  for (const page of pages) {
    for (const line of page) {
      const text = lineText(line);
      const remove = repeated.has(text) || /^[-—_\s]*(?:第\s*)?\d{1,5}(?:\s*页)?[-—_\s]*$/.test(text);
      if (remove && text) {
        removedHeaderFooterLines.add(text);
        continue;
      }
      while (line.at(-1)?.char === " ") line.pop();
      output.push(...line);
      const last = line.at(-1);
      output.push({ char: "\n", rawStart: last?.rawEnd ?? 0, rawEnd: last?.rawEnd ?? 0, operation: "collapsed_whitespace" });
    }
    if (output.length && output.at(-1)?.char !== "\n") output.push({ char: "\n", rawStart: 0, rawEnd: 0, operation: "collapsed_whitespace" });
  }

  while (output[0]?.char === "\n") output.shift();
  while (output.at(-1)?.char === "\n") output.pop();
  const compact: MappedCharacter[] = [];
  for (const item of output) {
    if (item.char === "\n" && compact.at(-1)?.char === "\n" && compact.at(-2)?.char === "\n") continue;
    compact.push(item);
  }
  const warnings: string[] = [];
  if (removedControls) warnings.push(`已移除 ${removedControls} 个异常控制字符；原始文本仍保留。`);
  if (removedHeaderFooterLines.size) warnings.push(`已清理重复页眉、页脚或页码 ${removedHeaderFooterLines.size} 类；来源映射仍指向原文。`);
  return {
    rawText,
    normalizedText: compact.map((item) => item.char).join(""),
    offsetMap: compressMap(compact),
    warnings,
    removedHeaderFooterLines: [...removedHeaderFooterLines],
  };
}

export function mapNormalizedRange(offsetMap: TextOffsetMapSegment[], start: number, end: number): { rawStart: number; rawEnd: number; status: "mapped" | "approximate" | "unmapped" } {
  const matches = offsetMap.filter((segment) => segment.normalizedEnd > start && segment.normalizedStart < end);
  if (!matches.length) return { rawStart: start, rawEnd: end, status: "unmapped" };
  return {
    rawStart: Math.min(...matches.map((segment) => segment.rawStart)),
    rawEnd: Math.max(...matches.map((segment) => segment.rawEnd)),
    status: matches.every((segment) => segment.operation === "unchanged") ? "mapped" : "approximate",
  };
}
