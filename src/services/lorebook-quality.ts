import type { CharacterData } from "@/domain/character-card";
import type { Lorebook, LorebookSourceFormat } from "@/domain/lorebook";
import { CharacterBookAdapter, SillyTavernWorldInfoAdapter } from "@/adapters";
import { isValidRegexKey } from "./activation-simulator";

export type LorebookIssueSeverity = "error" | "warning" | "info";
export interface LorebookQualityIssue {
  code: string;
  name: string;
  severity: LorebookIssueSeverity;
  entryIds: string[];
  rationale: string;
  suggestion: string;
  certainty: "certain" | "heuristic";
}
export interface LorebookQualityReport { issues: LorebookQualityIssue[]; checkedAt: string }

const BROAD_KEYS = new Set(["人", "事", "物", "世界", "地方", "角色", "the", "a", "it", "他", "她"]);
const add = (issues: LorebookQualityIssue[], issue: LorebookQualityIssue) => issues.push(issue);

function similarity(a: string, b: string): number {
  const tokens = new Set(a.replace(/\s+/g, "").split(""));
  const other = new Set(b.replace(/\s+/g, "").split(""));
  if (!tokens.size || !other.size) return 0;
  const intersection = [...tokens].filter(token => other.has(token)).length;
  return intersection / Math.min(tokens.size, other.size);
}

export function runLorebookQualityChecks(
  book: Lorebook,
  options?: { characterData?: CharacterData; targetFormat?: LorebookSourceFormat },
): LorebookQualityReport {
  const issues: LorebookQualityIssue[] = [];
  const keyOwners = new Map<string, string[]>();
  for (const entry of book.entries) {
    if (!entry.name.trim() || !entry.content.trim()) add(issues, {
      code: "empty_entry", name: "条目名称或正文为空", severity: "error", entryIds: [entry.id],
      rationale: "名称或正文为空会使条目无法识别或注入无效内容。", suggestion: "补充明确名称和可独立理解的正文。", certainty: "certain",
    });
    if (entry.enabled && !entry.activation.constant && entry.activation.primaryKeys.length === 0) add(issues, {
      code: "missing_primary_keys", name: "非常驻条目没有主关键词", severity: "error", entryIds: [entry.id],
      rationale: "启用且非常驻的条目没有可用于激活的主关键词。", suggestion: "添加少量准确关键词，或明确设为始终激活。", certainty: "certain",
    });
    const broad = entry.activation.primaryKeys.filter(key => key.length < 2 || BROAD_KEYS.has(key.toLocaleLowerCase()));
    if (broad.length) add(issues, {
      code: "broad_keyword", name: "关键词过短或过于宽泛", severity: "warning", entryIds: [entry.id],
      rationale: `以下关键词容易误触发：${broad.join("、")}`, suggestion: "改为更具体的专名、短语或有边界的正则。", certainty: "heuristic",
    });
    const invalidRegex = [...entry.activation.primaryKeys, ...entry.activation.secondaryKeys].filter(key => !isValidRegexKey(key));
    if (invalidRegex.length) add(issues, {
      code: "invalid_regex", name: "无效正则", severity: "error", entryIds: [entry.id],
      rationale: `无法解析：${invalidRegex.join("、")}`, suggestion: "按 JavaScript /表达式/flags 格式修正。", certainty: "certain",
    });
    if (entry.activation.selective && entry.activation.secondaryKeys.length === 0) add(issues, {
      code: "incomplete_secondary", name: "次级关键词规则不完整", severity: "error", entryIds: [entry.id],
      rationale: "已启用组合触发，但次级关键词为空。", suggestion: "添加次级关键词或关闭组合触发。", certainty: "certain",
    });
    if (/^(他|她|它|此人|此地|这里|该组织)[，,是]/.test(entry.content.trim())) add(issues, {
      code: "title_dependency", name: "正文可能依赖标题才能理解", severity: "warning", entryIds: [entry.id],
      rationale: "正文以缺少明确先行实体的代词开头。", suggestion: "在正文首句写明实体全名。", certainty: "heuristic",
    });
    if (entry.provenance === "model_inference") add(issues, {
      code: "unconfirmed_fan_inference", name: "同人内容包含未经确认的推断", severity: "warning", entryIds: [entry.id],
      rationale: "条目标记为模型推断，尚未转为用户确认事实。", suggestion: "核对原作或保持推断标签，不要当作确定事实导出。", certainty: "certain",
    });
    entry.activation.primaryKeys.forEach(key => {
      const normalized = key.toLocaleLowerCase();
      keyOwners.set(normalized, [...(keyOwners.get(normalized) || []), entry.id]);
    });
  }
  for (const [key, ids] of keyOwners) if (new Set(ids).size > 1) add(issues, {
    code: "duplicate_keyword", name: "相同关键词出现在多个条目", severity: "warning", entryIds: [...new Set(ids)],
    rationale: `关键词“${key}”会同时命中多个条目。`, suggestion: "细化关键词或确认同时激活是有意行为。", certainty: "certain",
  });
  for (let i = 0; i < book.entries.length; i++) for (let j = i + 1; j < book.entries.length; j++) {
    if (book.entries[i].content.length >= 30 && similarity(book.entries[i].content, book.entries[j].content) > 0.82) add(issues, {
      code: "high_duplication", name: "条目之间高度重复", severity: "warning", entryIds: [book.entries[i].id, book.entries[j].id],
      rationale: "两条正文的字符集合高度重叠。", suggestion: "合并重复知识，或明确每条的独立职责。", certainty: "heuristic",
    });
  }
  const constants = book.entries.filter(entry => entry.enabled && entry.activation.constant);
  if (constants.length > Math.max(3, Math.ceil(book.entries.length * 0.4))) add(issues, {
    code: "too_many_constant", name: "常驻条目过多", severity: "warning", entryIds: constants.map(e => e.id),
    rationale: `${constants.length}/${book.entries.length} 个条目始终激活。`, suggestion: "只保留确需每轮注入的核心规则，其余使用准确关键词。", certainty: "heuristic",
  });
  const constantLength = constants.reduce((sum, entry) => sum + entry.content.length, 0);
  if (constantLength > 3000) add(issues, {
    code: "constant_too_long", name: "常驻正文过长", severity: "warning", entryIds: constants.map(e => e.id),
    rationale: `常驻正文约 ${constantLength} 字，持续占用上下文。`, suggestion: "压缩常驻规则并拆出按需激活内容。", certainty: "heuristic",
  });
  if (options?.characterData) {
    const charText = [options.characterData.description, options.characterData.personality, options.characterData.scenario].join("\n");
    for (const entry of book.entries) if (entry.content.length > 40 && similarity(entry.content, charText) > 0.8) add(issues, {
      code: "duplicates_character", name: "正文与角色卡明显重复", severity: "warning", entryIds: [entry.id],
      rationale: "条目正文与角色卡永久字段高度重叠。", suggestion: "世界书只保留需要条件激活的环境知识。", certainty: "heuristic",
    });
  }
  const joined = book.entries.map(entry => ({ id: entry.id, text: entry.content }));
  const positiveFacts = new Map<string, string[]>();
  const negativeFacts = new Map<string, string[]>();
  const relationships = new Map<string, Array<{ relation: string; id: string }>>();
  const ages = new Map<string, Array<{ age: number; id: string }>>();
  for (const item of joined) {
    for (const match of item.text.matchAll(/([\p{L}\d]{2,12})(?<!不)是([\p{L}\d]{2,12})/gu)) {
      const key = `${match[1]}::${match[2]}`; positiveFacts.set(key, [...(positiveFacts.get(key) || []), item.id]);
    }
    for (const match of item.text.matchAll(/([\p{L}\d]{2,12})不是([\p{L}\d]{2,12})/gu)) {
      const key = `${match[1]}::${match[2]}`; negativeFacts.set(key, [...(negativeFacts.get(key) || []), item.id]);
    }
    for (const match of item.text.matchAll(/([\p{L}]{2,10})是([\p{L}]{2,10})的(父亲|母亲|兄长|弟弟|姐姐|妹妹|师父|徒弟|恋人|仇敌)/gu)) {
      const key = `${match[1]}::${match[2]}`; relationships.set(key, [...(relationships.get(key) || []), { relation: match[3], id: item.id }]);
    }
    for (const match of item.text.matchAll(/([\p{L}]{2,10})(?:现年|年龄为|年仅)(\d{1,3})岁/gu)) {
      ages.set(match[1], [...(ages.get(match[1]) || []), { age: Number(match[2]), id: item.id }]);
    }
  }
  for (const [fact, ids] of positiveFacts) if (negativeFacts.has(fact)) add(issues, {
    code: "setting_contradiction", name: "设定之间存在明显矛盾", severity: "error",
    entryIds: [...new Set([...ids, ...negativeFacts.get(fact)!])], rationale: `同一设定“${fact.replace("::", "是")}”同时被肯定和否定。`,
    suggestion: "核对用户事实并统一冲突陈述。", certainty: "certain",
  });
  for (const [, values] of relationships) if (new Set(values.map(value => value.relation)).size > 1) add(issues, {
    code: "relationship_conflict", name: "人物身份或关系不一致", severity: "warning", entryIds: [...new Set(values.map(value => value.id))],
    rationale: `同一人物对被描述为不同关系：${[...new Set(values.map(value => value.relation))].join("、")}。`,
    suggestion: "确认关系变化是否有时间背景，否则统一人物关系。", certainty: "heuristic",
  });
  for (const [person, values] of ages) if (new Set(values.map(value => value.age)).size > 1) add(issues, {
    code: "timeline_age_conflict", name: "时间线或年龄存在明显冲突", severity: "warning", entryIds: [...new Set(values.map(value => value.id))],
    rationale: `${person} 出现多个年龄：${[...new Set(values.map(value => value.age))].join("、")} 岁。`,
    suggestion: "注明不同时间点，或修正不一致年龄。", certainty: "heuristic",
  });
  if (options?.targetFormat) {
    const adapter = options.targetFormat === "character_book_v2" ? new CharacterBookAdapter() : new SillyTavernWorldInfoAdapter();
    const exported = adapter.export(book);
    exported.warnings.forEach(warning => add(issues, {
      code: warning.code, name: "目标导出格式不能完整表达字段", severity: "warning", entryIds: warning.entryId ? [warning.entryId] : [],
      rationale: warning.message, suggestion: "保留格式专属字段，并在目标应用中核对行为。", certainty: "certain",
    }));
    const validation = adapter.validate(exported.data);
    if (!validation.success) add(issues, {
      code: "target_json_invalid", name: "JSON 不符合目标格式", severity: "error", entryIds: [],
      rationale: validation.error, suggestion: "修正字段后再导出。", certainty: "certain",
    });
  }
  const order = { error: 0, warning: 1, info: 2 } as const;
  issues.sort((a, b) => order[a.severity] - order[b.severity]);
  return { issues, checkedAt: new Date().toISOString() };
}
