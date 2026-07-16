import {
  CharacterCardDraftCandidateSchema,
  LanguageConstraintCandidateSchema,
  LorebookDraftCandidateSchema,
  StyleProfileCandidateSchema,
  type CharacterCandidate,
  type CharacterCardDraftCandidate,
  type GenericDocumentCandidate,
  type LanguageConstraintCandidate,
  type LorebookDraftCandidate,
  type SourceSpan,
  type StyleProfileCandidate,
  type StyleStatistics,
} from "@/domain/document-ingestion";
import { createEmptyCharacterCard } from "@/domain/character-card";
import { createEmptyLorebook, createEmptyLorebookEntry, createStableId } from "@/domain/lorebook";
import { LanguageConstraintSchema, StyleProfileSchema, proseBase } from "@/domain/prose";

function confidenceFromSources(spans: SourceSpan[]): "high" | "medium" | "low" {
  if (spans.some((span) => span.extractionConfidence === "high")) return "high";
  if (spans.some((span) => span.extractionConfidence === "medium")) return "medium";
  return "low";
}

export function characterCandidateToCardDraft(candidate: CharacterCandidate): CharacterCardDraftCandidate {
  const card = createEmptyCharacterCard();
  card.data.name = candidate.name;
  card.data.description = [
    candidate.identity.length ? `身份：${candidate.identity.join("；")}` : "",
    candidate.appearance.length ? `外貌：${candidate.appearance.join("；")}` : "",
    candidate.history.length ? `经历：${candidate.history.join("；")}` : "",
  ].filter(Boolean).join("\n");
  card.data.personality = candidate.stableTraits.join("；");
  card.data.scenario = candidate.currentState.join("；");
  card.data.creator_notes = [
    candidate.goals.length ? `目标候选：${candidate.goals.join("；")}` : "",
    candidate.situationalBehaviors.length ? `情境性表现（不等同永久性格）：${candidate.situationalBehaviors.join("；")}` : "",
    candidate.informationGaps.length ? `信息缺口：${candidate.informationGaps.join("；")}` : "",
  ].filter(Boolean).join("\n");
  card.data.tags = ["小说解析草稿"];
  card.data.extensions = {
    ...card.data.extensions,
    document_ingestion: {
      candidateId: candidate.id,
      aliases: candidate.aliases,
      sourceSpans: candidate.sourceSpans,
      authority: candidate.authority,
      userConfirmed: false,
    },
  };
  return CharacterCardDraftCandidateSchema.parse({
    id: createStableId("card_draft"), name: `${candidate.name}角色卡草稿`, description: "由小说来源生成，尚未确认。",
    characterCandidateId: candidate.id, card, sourceSpans: candidate.sourceSpans,
    confidence: candidate.confidence, authority: candidate.authority, conflict: candidate.conflict,
  });
}

export function createLorebookDraftFromCandidates(name: string, candidates: GenericDocumentCandidate[]): LorebookDraftCandidate {
  const lorebook = createEmptyLorebook(name);
  lorebook.entries = candidates.filter((candidate) => candidate.content.trim()).map((candidate, index) => {
    const entry = createEmptyLorebookEntry(index);
    entry.name = candidate.name || `设定候选 ${index + 1}`;
    entry.category = candidate.candidateType === "entity" ? "实体" : candidate.candidateType === "canon" ? "Canon 候选" : "世界设定";
    entry.content = candidate.content;
    entry.activation.primaryKeys = [candidate.name].filter((value) => value.trim().length >= 2);
    entry.provenance = candidate.authority === "document_explicit" ? "user_fact" : "model_inference";
    entry.extensions = {
      ...entry.extensions,
      documentSourceSpans: candidate.sourceSpans,
      documentAuthority: candidate.authority,
      userConfirmed: false,
      applicableTime: candidate.applicableTime,
    };
    return entry;
  });
  lorebook.description = "由小说文件解析生成的世界书草稿；写入前需逐条确认。";
  lorebook.extensions = { document_ingestion: { candidateIds: candidates.map((candidate) => candidate.id), userConfirmed: false } };
  const spans = candidates.flatMap((candidate) => candidate.sourceSpans);
  return LorebookDraftCandidateSchema.parse({
    id: createStableId("lorebook_draft"), name, description: lorebook.description,
    lorebook, sourceSpans: spans, confidence: confidenceFromSources(spans), authority: "document_inference",
  });
}

function scaleLength(values: number[], boundaries: [number, number, number, number]): number {
  if (!values.length) return 3;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (average < boundaries[0]) return 1;
  if (average < boundaries[1]) return 2;
  if (average < boundaries[2]) return 3;
  if (average < boundaries[3]) return 4;
  return 5;
}

export function styleStatisticsToProfileCandidate(documentId: string, chapterIds: string[], statistics: StyleStatistics, sourceSpans: SourceSpan[]): StyleProfileCandidate {
  const profile = StyleProfileSchema.parse({
    ...proseBase("style"), status: "alternative", name: "小说文风候选", description: "由确定性统计与可审查解释转换，不能保证复刻作者独特文风。",
    isProjectDefault: false,
    sentenceLength: scaleLength(statistics.sentenceLengths, [10, 18, 28, 42]),
    paragraphLength: scaleLength(statistics.paragraphLengths, [35, 80, 160, 300]),
    dialogueRatio: Math.round(statistics.dialogueRatio * 100),
    actionRatio: 25, psychologyRatio: 20, environmentRatio: 20,
    narrativeDistance: statistics.pronounPreference === "first_person" ? 2 : 3,
    overallTone: "从小说样本提炼的候选语气（待用户确认）",
    customInstructions: "仅使用抽象统计特征；不得要求逐字模仿原作。",
    abstractSampleFeatures: [
      `平均句长 ${statistics.sentenceLengths.length ? Math.round(statistics.sentenceLengths.reduce((a, b) => a + b, 0) / statistics.sentenceLengths.length) : 0} 字`,
      `对话比例 ${Math.round(statistics.dialogueRatio * 100)}%`,
      `代词倾向 ${statistics.pronounPreference}`,
    ],
  });
  return StyleProfileCandidateSchema.parse({
    id: createStableId("style_candidate"), name: profile.name, description: profile.description,
    sourceDocumentId: documentId, sourceChapterIds: chapterIds, sampleRange: `${statistics.characterCount} 字符`,
    statistics, profile, sourceSpans, confidence: sourceSpans.length ? "medium" : "low", authority: "document_inference",
  });
}

export function createLanguageConstraintCandidates(documentId: string, statistics: StyleStatistics, sourceSpans: SourceSpan[]): LanguageConstraintCandidate[] {
  const averageSentence = statistics.sentenceLengths.length
    ? Math.round(statistics.sentenceLengths.reduce((a, b) => a + b, 0) / statistics.sentenceLengths.length)
    : 0;
  const definitions = [
    { name: "句长倾向", content: `句子平均约 ${averageSentence} 字，允许随场景节奏变化。`, strictness: "preferred" as const },
    { name: "对话比例", content: `样本对话比例约 ${Math.round(statistics.dialogueRatio * 100)}%，不要求机械配平。`, strictness: "advisory" as const },
    { name: "叙事代词倾向", content: `样本倾向：${statistics.pronounPreference}；视角规则仍以项目和场景配置为准。`, strictness: "advisory" as const },
  ];
  return definitions.map((definition) => {
    const constraint = LanguageConstraintSchema.parse({
      ...proseBase("language_rule"), status: "alternative", name: definition.name, content: definition.content,
      scope: "project", strictness: definition.strictness, enabled: true, locked: false,
    });
    return LanguageConstraintCandidateSchema.parse({
      id: createStableId("language_candidate"), name: definition.name, description: definition.content,
      constraint, candidateStrictness: definition.strictness, sourceSpans, confidence: sourceSpans.length ? "medium" : "low",
      authority: "document_inference", recommendation: `review:${documentId}`,
    });
  });
}
