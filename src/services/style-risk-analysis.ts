import { createStableId } from "@/domain/lorebook";
import {
  STYLE_RISK_DISCLAIMER, STYLE_RISK_PROMPT_VERSION, STYLE_RISK_SCORE_VERSION,
  StyleRiskAnalysisReportSchema, StyleRiskAnalysisRequestSchema, StyleRiskBaselineSchema,
  StyleRiskIssueSchema, StyleRiskMetricSchema, TextRangeReferenceSchema,
  type StyleRiskAnalysisReport, type StyleRiskAnalysisRequest, type StyleRiskIssue, type TextRangeReference,
} from "@/domain/style-risk";

const CONNECTORS = ["然而", "但是", "因此", "于是", "随后", "同时", "不过", "其实", "仍然", "终于", "与此同时"];
const SUMMARY_WORDS = ["总之", "可见", "显然", "归根结底", "这意味着", "这说明", "毫无疑问", "换句话说"];
const ADVERBS = ["非常", "十分", "极其", "格外", "无比", "尤其", "显得", "缓缓", "轻轻", "深深", "不由得", "忍不住"];
const ADJECTIVES = ["美丽", "温柔", "复杂", "深刻", "强烈", "巨大", "微妙", "沉重", "温暖", "冰冷"];
const EMOTIONS = ["悲伤", "难过", "痛苦", "绝望", "愤怒", "开心", "喜悦", "恐惧", "害怕", "焦虑", "紧张", "感动", "幸福", "孤独", "失望", "羞愧", "后悔"];
const CONCRETE = ["看", "听", "闻", "触", "握", "松", "走", "停", "推", "拉", "抬", "低", "转", "咬", "敲", "风", "雨", "光", "声", "气味", "手", "眼", "脚步", "呼吸"];

function count(text: string, value: string): number { return value ? text.split(value).length - 1 : 0; }
function variance(values: number[]): number {
  if (values.length < 2) return 0; const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
}
function frequency(text: string, words: string[], minimum = 2) {
  return words.map((value) => ({ value, count: count(text, value) })).filter((item) => item.count >= minimum).sort((a, b) => b.count - a.count);
}
function repeated(values: string[], minimum = 2) {
  const counts = new Map<string, number>(); values.filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts].filter(([, value]) => value >= minimum).map(([value, valueCount]) => ({ value, count: valueCount })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)).slice(0, 30);
}
function cjkLength(text: string): number { return text.replace(/\s/g, "").length; }

export function segmentChineseSentences(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim(); if (!normalized) return [];
  const result: string[] = []; let start = 0; let index = 0;
  const closers = new Set(["”", "」", "』", "\""]);
  while (index < normalized.length) {
    const char = normalized[index]; const ellipsis = char === "…" && normalized[index + 1] === "…";
    if ("。！？!?".includes(char) || char === "…") {
      index += ellipsis ? 2 : 1;
      if (closers.has(normalized[index])) index += 1;
      const rest = normalized.slice(index);
      const attribution = rest.match(/^(?:[\p{Script=Han}]{0,8})(?:说道|说|问道|问|答道|答)[。！？!?]/u);
      if (attribution) index += attribution[0].length;
      const value = normalized.slice(start, index).trim(); if (value) result.push(value);
      while (index < normalized.length && /\s/u.test(normalized[index])) index += 1;
      start = index; continue;
    }
    index += 1;
  }
  const tail = normalized.slice(start).trim(); if (tail) result.push(tail); return result;
}

function ngrams(text: string, size = 4): string[] {
  const compact = text.replace(/[\s，。！？；：、,.!?;:…—“”「」『』]/gu, ""); const values: string[] = [];
  for (let index = 0; index <= compact.length - size; index += 1) values.push(compact.slice(index, index + size)); return values;
}
function charSet(value: string): Set<string> { return new Set(ngrams(value, 2)); }
function similarity(left: string, right: string): number {
  const a = charSet(left); const b = charSet(right); if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((item) => b.has(item)).length; return intersection / new Set([...a, ...b]).size;
}
function adjacentSimilarity(values: string[]): number {
  if (values.length < 2) return 0; const scores = values.slice(1).map((value, index) => similarity(values[index], value)); return scores.reduce((a, b) => a + b, 0) / scores.length;
}

export function mapExcerptToRange(text: string, excerpt: string, scopeType: TextRangeReference["scopeType"] = "document"): TextRangeReference {
  const value = excerpt.trim(); if (!value) return TextRangeReferenceSchema.parse({ excerpt, scopeType, mappingStatus: "unmapped" });
  const start = text.indexOf(value); if (start < 0) return TextRangeReferenceSchema.parse({ excerpt: value, scopeType, mappingStatus: "unmapped" });
  const unique = text.indexOf(value, start + value.length) < 0;
  return TextRangeReferenceSchema.parse({ start: unique ? start : null, end: unique ? start + value.length : null, excerpt: value, scopeType, mappingStatus: unique ? "exact" : "uncertain" });
}

function issue(input: Partial<StyleRiskIssue> & Pick<StyleRiskIssue, "category" | "title" | "severity" | "confidence" | "conclusion" | "minimumRevision">, text: string, excerpt = ""): StyleRiskIssue {
  return StyleRiskIssueSchema.parse({
    id: createStableId("style_issue"), dataVersion: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    textRange: mapExcerptToRange(text, excerpt, input.textRange?.scopeType ?? "document"), excerpt, evidence: [], metricValues: {}, baselineValues: {}, explanation: "",
    alternatives: [], possibleSideEffects: ["过度删改可能损害人物声音、节奏或必要信息。"], isDeterministic: true, sourceReferences: [], status: "open", ...input,
  });
}

function genericBaseline(characterCount: number) {
  return StyleRiskBaselineSchema.parse({
    name: "通用中文小说启发式", baselineType: "generic_chinese_fiction", sampleScope: "中文叙事文本启发式区间", sampleSize: characterCount,
    featureStatistics: { sentenceVarianceMinimum: 18, dialogueRatioRange: [0.08, 0.7], connectorDensityWarning: 0.025 }, confidence: "medium", isUserConfirmed: true,
  });
}

export function analyzeStyleRiskDeterministically(raw: Partial<StyleRiskAnalysisRequest> & Pick<StyleRiskAnalysisRequest, "text">): StyleRiskAnalysisReport {
  const request = StyleRiskAnalysisRequestSchema.parse(raw); const text = request.text; const compact = text.replace(/\s/g, "");
  const paragraphs = text.replace(/\r\n/g, "\n").split(/\n\s*\n|\n/).map((item) => item.trim()).filter(Boolean);
  const sentences = segmentChineseSentences(text); const sentenceLengths = sentences.map(cjkLength); const paragraphLengths = paragraphs.map(cjkLength);
  const dialogueMatches = [...text.matchAll(/[“「『"]([^”」』"\n]+)[”」』"]/gu)]; const dialogueChars = dialogueMatches.reduce((sum, item) => sum + cjkLength(item[1]), 0);
  const punctuation: Record<string, number> = {}; for (const mark of text.match(/[，。！？；：、,.!?;:…—]/gu) ?? []) punctuation[mark] = (punctuation[mark] ?? 0) + 1;
  const repeatedNgrams = repeated(ngrams(text, 4), 2).filter((item) => item.value.length === 4);
  const openings = repeated(sentences.map((item) => item.replace(/^[“「『"\s]+/u, "").slice(0, 4)), 2);
  const endings = repeated(paragraphs.map((item) => item.replace(/[”」』"。！？!?\s]+$/u, "").slice(-5)), 2);
  const frequentConnectors = frequency(text, CONNECTORS); const frequentSummaryWords = frequency(text, SUMMARY_WORDS);
  const frequentAdverbs = frequency(text, ADVERBS); const frequentAdjectives = frequency(text, ADJECTIVES);
  const abstractEmotionCount = EMOTIONS.reduce((sum, value) => sum + count(text, value), 0); const concreteCount = CONCRETE.reduce((sum, value) => sum + count(text, value), 0);
  const constraintViolations = request.constraints.filter((rule) => rule.enabled).flatMap((rule) => {
    const patterns = [...rule.negativeExamples, ...[...rule.content.matchAll(/(?:禁止|避免|不得使用)[“"「]?([^，”"」；。\s]+)/gu)].map((item) => item[1])].filter(Boolean);
    const matches = [...new Set(patterns)].flatMap((value) => [...text.matchAll(new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gu"))].map((match) => ({ value, start: match.index, end: match.index + value.length })));
    return matches.length ? [{ constraintId: rule.id, name: rule.name, strictness: rule.strictness, locked: rule.locked, matches }] : [];
  });
  const speakerWords = new Map<string, Set<string>>();
  for (const match of dialogueMatches) {
    const after = text.slice((match.index ?? 0) + match[0].length, (match.index ?? 0) + match[0].length + 12);
    const speaker = after.match(/^\s*([\p{Script=Han}]{1,6})(?:说道|说|问|答)/u)?.[1] ?? "unknown";
    const words = speakerWords.get(speaker) ?? new Set<string>(); ngrams(match[1], 2).forEach((word) => words.add(word)); speakerWords.set(speaker, words);
  }
  const speakers = [...speakerWords.values()]; const dialogueOverlap = speakers.length >= 2 ? adjacentSimilarity(speakers.map((set) => [...set].join(""))) : null;
  const features = {
    characterCount: compact.length, sentenceCount: sentences.length, paragraphCount: paragraphs.length,
    averageSentenceLength: sentenceLengths.length ? sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length : 0,
    sentenceLengths, sentenceLengthVariance: variance(sentenceLengths), paragraphLengths, paragraphLengthVariance: variance(paragraphLengths),
    dialogueRatio: compact.length ? dialogueChars / compact.length : 0, narrationRatio: compact.length ? 1 - dialogueChars / compact.length : 1, punctuation,
    exclamationFrequency: compact.length ? ((punctuation["！"] ?? 0) + (punctuation["!"] ?? 0)) / compact.length : 0,
    questionFrequency: compact.length ? ((punctuation["？"] ?? 0) + (punctuation["?"] ?? 0)) / compact.length : 0,
    ellipsisFrequency: compact.length ? (punctuation["…"] ?? 0) / compact.length : 0,
    semicolonColonFrequency: compact.length ? ["；", ";", "：", ":"].reduce((sum, mark) => sum + (punctuation[mark] ?? 0), 0) / compact.length : 0,
    frequentConnectors, frequentSummaryWords, frequentAdverbs, frequentAdjectives, repeatedNgrams, repeatedSentenceOpenings: openings, repeatedParagraphEndings: endings,
    adjacentSentenceSimilarity: adjacentSimilarity(sentences), adjacentParagraphSimilarity: adjacentSimilarity(paragraphs), repeatedAddresses: repeated([...text.matchAll(/[\p{Script=Han}]{1,5}(?:先生|小姐|姑娘|大人|师父|老师|殿下|陛下)/gu)].map((item) => item[0])),
    dialogueVocabularyOverlap: dialogueOverlap, abstractEmotionDensity: compact.length ? abstractEmotionCount / compact.length : 0,
    concreteActionSensoryDensity: compact.length ? concreteCount / compact.length : 0, languageConstraintViolations: constraintViolations,
  };

  const issues: StyleRiskIssue[] = [];
  if (sentences.length >= 4 && features.sentenceLengthVariance < 14) issues.push(issue({ category: "uniform_sentence_length", title: "句长变化偏少", severity: "minor", confidence: "medium", conclusion: "连续句子的长度较为均匀。", evidence: [`句长方差 ${features.sentenceLengthVariance.toFixed(1)}`], metricValues: { sentenceLengthVariance: features.sentenceLengthVariance }, minimumRevision: "只在确有节奏需要的位置调整少量长短句。" }, text, sentences.slice(0, 2).join("")));
  if (repeatedNgrams.length) issues.push(issue({ category: "repeated_ngram", title: "短语重复", severity: "moderate", confidence: "high", conclusion: "存在重复四字片段。", evidence: repeatedNgrams.slice(0, 5).map((item) => `${item.value}×${item.count}`), metricValues: { repeatedNgrams: repeatedNgrams.length }, minimumRevision: "保留有意复沓，删减无功能的重复。" }, text, repeatedNgrams[0].value));
  if (openings.length) issues.push(issue({ category: "repeated_opening", title: "句首模式重复", severity: "minor", confidence: "high", conclusion: "多个句子以相同片段开头。", evidence: openings.map((item) => `${item.value}×${item.count}`), minimumRevision: "调整部分句子的切入点，不必机械追求差异。" }, text, openings[0].value));
  if (endings.length) issues.push(issue({ category: "summary_ending", title: "段尾模式重复", severity: "minor", confidence: "medium", conclusion: "多个段落以相似片段收束。", evidence: endings.map((item) => `${item.value}×${item.count}`), minimumRevision: "让部分段落停在动作、意象或未完成反应上。" }, text, endings[0].value));
  if (frequentConnectors.some((item) => item.count >= 3)) issues.push(issue({ category: "connector_overuse", title: "连接词集中", severity: "minor", confidence: "high", conclusion: "显式连接词出现较密。", evidence: frequentConnectors.map((item) => `${item.value}×${item.count}`), minimumRevision: "删除读者可从上下文推断的连接词。" }, text, frequentConnectors[0].value));
  if (features.abstractEmotionDensity > features.concreteActionSensoryDensity * 1.35 && abstractEmotionCount >= 3) issues.push(issue({ category: "abstract_emotion", title: "抽象情绪词偏多", severity: "moderate", confidence: "medium", conclusion: "情绪命名多于动作和感官线索。", evidence: [`抽象情绪密度 ${(features.abstractEmotionDensity * 100).toFixed(2)}%`], minimumRevision: "将一部分情绪命名替换为具体反应，但保留必要直述。" }, text, EMOTIONS.find((word) => text.includes(word)) ?? ""));
  for (const violation of constraintViolations) {
    const hardLocked = violation.strictness === "hard" && violation.locked;
    issues.push(issue({ category: "language_constraint", title: `违反语言规则：${violation.name}`, severity: hardLocked ? "critical" : violation.strictness === "hard" ? "major" : "moderate", confidence: "high", conclusion: "文本命中已启用的禁用表达。", evidence: violation.matches.map((item) => item.value), minimumRevision: "在不改变事实和人物声音的前提下替换该表达。" }, text, violation.matches[0].value));
  }

  const baselines = [...request.baselines];
  let styleDeviation = 0;
  if (request.styleProfile) {
    const targetSentence = [8, 14, 22, 32, 45][request.styleProfile.sentenceLength - 1];
    styleDeviation = Math.min(100, Math.round(Math.abs(features.averageSentenceLength - targetSentence) * 3 + Math.abs(features.dialogueRatio * 100 - request.styleProfile.dialogueRatio)));
    baselines.push(StyleRiskBaselineSchema.parse({ name: request.styleProfile.name, baselineType: "project_style", sampleScope: "当前项目 Style Profile", sampleSize: compact.length, featureStatistics: { targetSentenceLength: targetSentence, targetDialogueRatio: request.styleProfile.dialogueRatio }, styleProfileId: request.styleProfile.id, languageConstraintIds: request.constraints.map((item) => item.id), confidence: "high", isUserConfirmed: request.styleProfile.status === "accepted" }));
    if (styleDeviation >= 35) issues.push(issue({ category: "style_deviation", title: "偏离项目文风基准", severity: styleDeviation >= 65 ? "major" : "moderate", confidence: compact.length >= 300 ? "medium" : "low", conclusion: "句长或对话比例与项目 Style Profile 存在明显差异。", evidence: [`偏离指标 ${styleDeviation}`], metricValues: { averageSentenceLength: features.averageSentenceLength, dialogueRatio: features.dialogueRatio * 100 }, baselineValues: { sentenceLength: targetSentence, dialogueRatio: request.styleProfile.dialogueRatio }, minimumRevision: "仅调整最明显偏离处，并优先保留当前场景的有效节奏。" }, text));
  }
  if (request.mode === "character") baselines.unshift(StyleRiskBaselineSchema.parse({ name: "当前角色语言档案", baselineType: "character_voice", sampleScope: "角色级 Language Constraint", sampleSize: compact.length, featureStatistics: { enabledRules: request.constraints.length }, languageConstraintIds: request.constraints.map((item) => item.id), confidence: request.constraints.length ? "medium" : "low", isUserConfirmed: request.constraints.some((item) => item.status === "accepted") }));
  baselines.push(genericBaseline(compact.length));
  const structure = Math.min(100, Math.round((features.adjacentSentenceSimilarity * 35) + repeatedNgrams.length * 4 + openings.length * 8 + (features.sentenceLengthVariance < 14 && sentences.length >= 4 ? 25 : 0)));
  const template = Math.min(100, frequentConnectors.reduce((sum, item) => sum + item.count * 5, 0) + frequentSummaryWords.reduce((sum, item) => sum + item.count * 8, 0) + frequentAdverbs.reduce((sum, item) => sum + item.count * 2, 0));
  const emotion = Math.min(100, Math.round(features.abstractEmotionDensity * 1500)); const dialogueRisk = dialogueOverlap === null ? 0 : Math.round(dialogueOverlap * 100);
  const dimensionRisks = { structureRepetition: structure, overExplanation: 0, abstractEmotion: emotion, dialogueHomogeneity: dialogueRisk, templateExpression: template, projectStyleDeviation: styleDeviation };
  const metrics = [
    ["characterCount", "字数", compact.length, "字", "structure"], ["averageSentenceLength", "平均句长", features.averageSentenceLength, "字", "structure"],
    ["sentenceLengthVariance", "句长方差", features.sentenceLengthVariance, "", "structure"], ["dialogueRatio", "对话比例", features.dialogueRatio * 100, "%", "dialogue"],
    ["repeatedNgrams", "重复 N-gram", repeatedNgrams.length, "组", "wording"], ["abstractEmotionDensity", "抽象情绪密度", features.abstractEmotionDensity * 100, "%", "emotion"],
    ["concreteActionSensoryDensity", "动作与感官密度", features.concreteActionSensoryDensity * 100, "%", "narration"], ["constraintViolations", "语言规则违规", constraintViolations.length, "条", "style"],
  ].map(([key, label, value, unit, dimension]) => StyleRiskMetricSchema.parse({ key, label, value, unit, dimension }));
  const sampleSufficient = compact.length >= 300; const rawScore = Math.round((structure + template + emotion + dialogueRisk + styleDeviation) / 5);
  const overallScore = sampleSufficient ? rawScore : null; const overallRisk = !sampleSufficient ? "unstable" as const : rawScore >= 65 ? "high" as const : rawScore >= 35 ? "medium" as const : "low" as const;
  return StyleRiskAnalysisReportSchema.parse({
    requestId: request.sourceId, promptVersion: STYLE_RISK_PROMPT_VERSION, scoreVersion: STYLE_RISK_SCORE_VERSION,
    summary: sampleSufficient ? `当前文本机械感风险为${overallRisk === "high" ? "高" : overallRisk === "medium" ? "中" : "低"}；应结合创作目的人工判断。` : "样本过短，仅提供局部提示，不输出稳定总体结论。",
    overallRisk, overallScore, sampleSufficient, confidence: sampleSufficient ? "medium" : "low", baselines, features, metrics, issues, dimensionRisks,
    majorContributors: [...issues].sort((a, b) => ({ critical: 5, major: 4, moderate: 3, minor: 2, note: 1 }[b.severity] - { critical: 5, major: 4, moderate: 3, minor: 2, note: 1 }[a.severity])).slice(0, 3).map((item) => item.title),
    doNotChange: ["有意的角色口头禅、节奏性复沓和剧情必要信息不应仅因指标被删除。"], modelStatus: "not_requested", warnings: sampleSufficient ? [] : ["少于 300 个中文字符，风险分数不稳定。"], disclaimer: STYLE_RISK_DISCLAIMER,
  });
}
