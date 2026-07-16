import { EntityResolutionSchema, type EntityResolution } from "@/domain/document-ingestion";
import { createStableId } from "@/domain/lorebook";

export interface ResolvableEntity {
  id: string;
  type: string;
  name: string;
  aliases: string[];
  identity: string[];
  locations: string[];
  cooccurringEntityIds?: string[];
  identityKey?: string;
  existingEntityId?: string;
  descriptions?: string[];
  timeMarkers?: string[];
}

const normalized = (value: string) => value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, "");
const normalizedSet = (values: string[]) => new Set(values.map(normalized));
const overlap = (left: string[], right: string[]) => {
  const rightSet = normalizedSet(right);
  return left.filter((value) => rightSet.has(normalized(value))).length;
};

export function resolveEntityPair(left: ResolvableEntity, right: ResolvableEntity): EntityResolution {
  const reasons: string[] = [];
  let result: EntityResolution["result"] = "uncertain";
  let confidence: EntityResolution["confidence"] = "low";

  if (left.type !== right.type) {
    result = "different_entity";
    confidence = "high";
    reasons.push("实体类型不同");
  } else if (left.existingEntityId && left.existingEntityId === right.existingEntityId) {
    result = "same_entity";
    confidence = "high";
    reasons.push("引用相同的既有稳定实体 ID");
  } else {
    const leftNames = [left.name, ...left.aliases].map(normalized);
    const rightNames = [right.name, ...right.aliases].map(normalized);
    const nameRelated = leftNames.some((name) => rightNames.includes(name));
    const identityConflict = Boolean(left.identityKey && right.identityKey && left.identityKey !== right.identityKey);
    if (identityConflict && normalized(left.name) === normalized(right.name)) {
      result = "conflict";
      confidence = "high";
      reasons.push("名称相同但明确身份键冲突");
    } else if (!nameRelated) {
      result = "different_entity";
      confidence = "medium";
      reasons.push("名称和别名均不重合");
    } else {
      const sharedIdentity = overlap(left.identity, right.identity);
      const sharedLocations = overlap(left.locations, right.locations);
      const sharedCooccurrence = overlap(left.cooccurringEntityIds ?? [], right.cooccurringEntityIds ?? []);
      const sharedDescription = overlap(left.descriptions ?? [], right.descriptions ?? []);
      const contextScore = sharedIdentity * 2 + sharedLocations + sharedCooccurrence + sharedDescription;
      if (contextScore >= 4) {
        result = "probably_same";
        confidence = "medium";
        reasons.push("别名重合，且身份、地点或共现上下文高度一致");
      } else {
        result = "uncertain";
        confidence = "low";
        reasons.push(normalized(left.name) === normalized(right.name)
          ? "仅名称相同，不足以自动合并"
          : "存在别名重合，但上下文证据不足");
      }
    }
  }

  return EntityResolutionSchema.parse({
    id: createStableId("entity_resolution"), leftCandidateId: left.id, rightCandidateId: right.id,
    result, reasons, confidence, userConfirmed: false,
  });
}

export function resolveEntityCandidates(candidates: ResolvableEntity[]): EntityResolution[] {
  const results: EntityResolution[] = [];
  for (let left = 0; left < candidates.length; left += 1) {
    for (let right = left + 1; right < candidates.length; right += 1) {
      const resolution = resolveEntityPair(candidates[left], candidates[right]);
      if (resolution.result !== "different_entity" || resolution.confidence !== "medium") results.push(resolution);
    }
  }
  return results;
}
