import {
  CharacterCandidateSchema,
  CharacterVoiceProfileSchema,
  GenericDocumentCandidateSchema,
  RelationshipCandidateSchema,
  type CharacterCandidate,
  type DocumentIngestionProject,
  type ExtractionItem,
  type GenericDocumentCandidate,
  type SourceSpan,
} from "@/domain/document-ingestion";
import { characterCandidateToCardDraft, createLorebookDraftFromCandidates } from "./converters";
import { resolveEntityCandidates } from "./entity-resolver";

const normalize = (value: string) => value.normalize("NFKC").trim().toLocaleLowerCase();

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function uniqueSpans(items: ExtractionItem[]): SourceSpan[] {
  const seen = new Set<string>();
  return items.flatMap((item) => item.sourceSpans).filter((span) => {
    const key = `${span.documentId}:${span.sourceVersion}:${span.characterStart}:${span.characterEnd}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function confidence(items: ExtractionItem[]): ExtractionItem["confidence"] {
  if (items.some((item) => item.confidence === "high")) return "high";
  if (items.some((item) => item.confidence === "medium")) return "medium";
  return "low";
}

function authority(items: ExtractionItem[]): "document_explicit" | "document_inference" {
  return items.some((item) => item.explicitFact && !item.inference) ? "document_explicit" : "document_inference";
}

function dedupeItems(items: ExtractionItem[]): ExtractionItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const span = item.sourceSpans[0];
    const key = [item.type, normalize(item.normalizedName), normalize(item.content), span?.documentId, span?.characterStart, span?.characterEnd].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function characterCandidates(items: ExtractionItem[]): CharacterCandidate[] {
  const people = items.filter((item) => item.type === "character" && item.normalizedName.trim());
  const names = unique(people.map((item) => item.normalizedName));
  return names.map((name) => {
    const related = items.filter((item) => normalize(item.normalizedName) === normalize(name));
    const ofType = (type: ExtractionItem["type"]) => related.filter((item) => item.type === type);
    const contents = (type: ExtractionItem["type"]) => unique(ofType(type).map((item) => item.content || item.originalExpression));
    const aliases = unique(ofType("alias").map((item) => item.originalExpression).filter((value) => normalize(value) !== normalize(name)));
    return CharacterCandidateSchema.parse({
      id: `character-candidate:${people.find((item) => normalize(item.normalizedName) === normalize(name))!.id}`,
      name,
      description: ofType("character").map((item) => item.content).filter(Boolean).join("；"),
      aliases,
      identity: contents("character"),
      appearance: contents("description"),
      situationalBehaviors: contents("action"),
      currentState: unique([...contents("emotion"), ...contents("current_event")]),
      goals: contents("goal"),
      speechHabits: contents("voice"),
      sourceSpans: uniqueSpans(related),
      confidence: confidence(related),
      authority: authority(related),
      conflict: false,
      decision: "pending",
    });
  });
}

function genericCandidate(item: ExtractionItem, candidateType: GenericDocumentCandidate["candidateType"], target: string): GenericDocumentCandidate {
  const content = item.normalizedName && !item.content.includes(item.normalizedName)
    ? `${item.normalizedName}：${item.content || item.originalExpression}`
    : item.content || item.originalExpression;
  return GenericDocumentCandidateSchema.parse({
    id: `${candidateType}-candidate:${item.id}`,
    name: item.normalizedName || item.originalExpression || item.type,
    description: content,
    candidateType,
    content,
    sourceSpans: item.sourceSpans,
    confidence: item.confidence,
    authority: item.explicitFact && !item.inference ? "document_explicit" : "document_inference",
    conflict: false,
    recommendedTarget: target,
    decision: "pending",
  });
}

export function consolidateDocumentExtractions(
  project: DocumentIngestionProject,
  inputItems: ExtractionItem[] = project.extractionItems,
): DocumentIngestionProject {
  const items = dedupeItems(inputItems);
  const characters = characterCandidates(items);
  const characterByName = new Map(characters.flatMap((candidate) => [candidate.name, ...candidate.aliases].map((name) => [normalize(name), candidate] as const)));

  const relationships = items.filter((item) => item.type === "relationship").flatMap((item) => {
    const names = item.normalizedName.split(/[|｜—–↔⇄、,，/]/u).map((value) => value.trim()).filter(Boolean);
    if (names.length < 2) return [];
    const left = characterByName.get(normalize(names[0]));
    const right = characterByName.get(normalize(names[1]));
    if (!left || !right || left.id === right.id) return [];
    return [RelationshipCandidateSchema.parse({
      id: `relationship-candidate:${item.id}`,
      name: `${left.name}—${right.name}`,
      description: item.content,
      characterAId: left.id,
      characterBId: right.id,
      relationType: "unknown",
      actualRelationship: item.content,
      currentState: item.content,
      directional: true,
      sourceSpans: item.sourceSpans,
      confidence: item.confidence,
      authority: item.explicitFact && !item.inference ? "document_explicit" : "document_inference",
      decision: "pending",
    })];
  });

  const worldTypes = new Set<ExtractionItem["type"]>(["location", "organization", "item", "ability", "world_rule", "term", "history_event", "secret"]);
  const worldCandidates = items.filter((item) => worldTypes.has(item.type)).map((item) => genericCandidate(item, "entity", "lorebook_draft"));
  const canonCandidates = items.filter((item) => worldTypes.has(item.type) || ["current_event", "knowledge_gain"].includes(item.type))
    .map((item) => genericCandidate(item, "canon", "canon_candidate"));
  const timelineCandidates = items.filter((item) => ["history_event", "current_event", "time_expression"].includes(item.type))
    .map((item) => genericCandidate(item, "timeline_event", "project_timeline"));
  const plotThreadCandidates = items.filter((item) => item.type === "plot_thread")
    .map((item) => genericCandidate(item, "plot_thread", "plot_thread_tracker"));
  const foreshadowCandidates = items.filter((item) => item.type === "foreshadow")
    .map((item) => genericCandidate(item, "foreshadow", "foreshadow_tracker"));

  const voiceProfiles = characters.flatMap((candidate) => {
    if (!candidate.speechHabits.length) return [];
    return [CharacterVoiceProfileSchema.parse({
      id: `voice-profile:${candidate.id}`,
      name: `${candidate.name}语言档案`,
      description: "从人物明确发言与语言描述提炼的候选。",
      characterCandidateId: candidate.id,
      tone: candidate.speechHabits.join("；"),
      sourceSpans: candidate.sourceSpans,
      confidence: candidate.confidence,
      authority: candidate.authority,
      decision: "pending",
    })];
  });

  const existingCardDecisions = new Map(project.characterCardDrafts.map((draft) => [draft.characterCandidateId, draft.decision]));
  const cards = characters.map((candidate) => {
    const draft = characterCandidateToCardDraft(candidate);
    return { ...draft, decision: existingCardDecisions.get(candidate.id) ?? draft.decision };
  });
  const lorebookDrafts = worldCandidates.length
    ? [createLorebookDraftFromCandidates(`${project.name}世界书草稿`, worldCandidates)]
    : [];

  const resolutions = resolveEntityCandidates(characters.map((candidate) => ({
    id: candidate.id,
    type: "character",
    name: candidate.name,
    aliases: candidate.aliases,
    identity: candidate.identity,
    locations: [],
    descriptions: [...candidate.appearance, ...candidate.stableTraits],
  })));

  return {
    ...project,
    status: "review",
    extractionItems: items,
    characterCandidates: characters,
    voiceProfiles,
    relationshipCandidates: relationships,
    characterCardDrafts: cards,
    lorebookDrafts,
    canonCandidates,
    timelineCandidates,
    plotThreadCandidates,
    foreshadowCandidates,
    entityResolutions: resolutions,
    modifiedAt: new Date().toISOString(),
  };
}
