import type { ProseSourceReference, SceneDraft } from "@/domain/prose";
import type { ProseContext } from "./prose-context-builder";

export function validateProseSourceReference(reference: ProseSourceReference, context: ProseContext): ProseSourceReference {
  const source = context.sources.find((item) => item.included && item.sourceType === reference.sourceType && item.sourceId === reference.sourceId && item.version === reference.version);
  return { ...reference, valid: Boolean(source) };
}

export function validateSceneDraftReferences(scene: SceneDraft, context: ProseContext): { scene: SceneDraft; warnings: string[] } {
  const warnings: string[] = [];
  const validate = (reference: ProseSourceReference) => {
    const value = validateProseSourceReference(reference, context);
    if (!value.valid) warnings.push(`无效正文来源引用：${reference.sourceType}/${reference.sourceId}@${reference.version}`);
    return value;
  };
  const next = structuredClone(scene);
  next.sources = next.sources.map(validate);
  for (const version of next.versions) {
    version.sources = version.sources.map(validate);
    for (const block of version.blocks) block.sources = block.sources.map(validate);
  }
  for (const revision of next.revisions) revision.sources = revision.sources.map(validate);
  for (const item of [...next.candidateFacts, ...next.candidateStateChanges, ...next.issues]) item.sources = item.sources.map(validate);
  return { scene: next, warnings };
}
