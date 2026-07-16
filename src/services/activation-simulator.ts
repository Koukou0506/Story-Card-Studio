import type { Lorebook, LorebookEntry } from "@/domain/lorebook";

export interface ActivationResult {
  entryId: string;
  entryName: string;
  activated: boolean;
  constant: boolean;
  matchedPrimaryKeys: string[];
  matchedSecondaryKeys: string[];
  secondaryPassed: boolean;
  reason: string;
  insertionOrder: number;
  contentLength: number;
}

export interface ActivationSimulation {
  results: ActivationResult[];
  activated: ActivationResult[];
  estimatedInjectionLength: number;
  keywordConflicts: Array<{ keyword: string; entryIds: string[] }>;
  approximationNotice: string;
}

function regexFromKey(key: string): RegExp | null {
  if (!key.startsWith("/")) return null;
  const lastSlash = key.lastIndexOf("/");
  if (lastSlash <= 0) return null;
  try {
    return new RegExp(key.slice(1, lastSlash), key.slice(lastSlash + 1));
  } catch {
    return null;
  }
}

export function isValidRegexKey(key: string): boolean {
  if (!key.startsWith("/")) return true;
  return regexFromKey(key) !== null;
}

function keyMatches(text: string, key: string, caseSensitive: boolean): boolean {
  const regex = regexFromKey(key);
  if (regex) {
    regex.lastIndex = 0;
    return regex.test(text);
  }
  return caseSensitive
    ? text.includes(key)
    : text.toLocaleLowerCase().includes(key.toLocaleLowerCase());
}

function evaluateEntry(entry: LorebookEntry, text: string): ActivationResult {
  const caseSensitive = entry.activation.caseSensitive ?? false;
  const primary = entry.activation.primaryKeys.filter(key => keyMatches(text, key, caseSensitive));
  const secondary = entry.activation.secondaryKeys.filter(key => keyMatches(text, key, caseSensitive));
  const totalSecondary = entry.activation.secondaryKeys.length;
  let secondaryPassed = true;
  if (entry.activation.selective && totalSecondary > 0) {
    secondaryPassed = {
      and_any: secondary.length > 0,
      and_all: secondary.length === totalSecondary,
      not_any: secondary.length === 0,
      not_all: secondary.length < totalSecondary,
    }[entry.activation.secondaryLogic];
  }
  const keywordActivated = primary.length > 0 && secondaryPassed;
  const activated = entry.enabled && (entry.activation.constant || keywordActivated);
  return {
    entryId: entry.id,
    entryName: entry.name || "未命名条目",
    activated,
    constant: entry.activation.constant,
    matchedPrimaryKeys: primary,
    matchedSecondaryKeys: secondary,
    secondaryPassed,
    reason: !entry.enabled ? "条目已停用" : entry.activation.constant ? "始终激活" : !primary.length
      ? "没有主关键词命中" : secondaryPassed ? "关键词条件通过" : "次级关键词条件未通过",
    insertionOrder: entry.insertionOrder,
    contentLength: entry.content.length,
  };
}

export function simulateActivation(book: Lorebook, text: string): ActivationSimulation {
  const results = book.entries.map(entry => evaluateEntry(entry, text));
  const activated = results.filter(result => result.activated)
    .sort((a, b) => a.insertionOrder - b.insertionOrder);
  const keywordMap = new Map<string, Set<string>>();
  for (const entry of book.entries.filter(e => e.enabled)) {
    for (const key of entry.activation.primaryKeys) {
      const normalized = key.toLocaleLowerCase();
      if (!keywordMap.has(normalized)) keywordMap.set(normalized, new Set());
      keywordMap.get(normalized)!.add(entry.id);
    }
  }
  return {
    results,
    activated,
    estimatedInjectionLength: activated.reduce((sum, result) => sum + result.contentLength, 0),
    keywordConflicts: [...keywordMap.entries()].filter(([, ids]) => ids.size > 1)
      .map(([keyword, ids]) => ({ keyword, entryIds: [...ids] })),
    approximationNotice: "本地近似模拟：未模拟递归预算、概率随机、向量匹配、分组竞争和 timed effects 的跨消息状态，结果不保证与 SillyTavern 完全一致。",
  };
}

