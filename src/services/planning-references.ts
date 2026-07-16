import type { OutlineVariant, PlanningSourceReference } from "@/domain/story-planning";
import type { PlanningContext } from "./planning-context-builder";

type PlanningReferenceInput = Omit<PlanningSourceReference, "classification" | "inference"> & Partial<Pick<PlanningSourceReference, "classification" | "inference">>;

export function validatePlanningReference(reference: PlanningReferenceInput, context: PlanningContext) {
  const source = context.sources.find(
    (candidate) => candidate.included
      && candidate.sourceType === reference.sourceType
      && candidate.sourceId === reference.sourceId
      && candidate.version === reference.version,
  );
  return { ...reference, classification: reference.classification ?? "source_setting", inference: reference.inference ?? false, valid: Boolean(source) };
}

export function validatePlanningReferences(variant: OutlineVariant, context: PlanningContext) {
  const warnings: string[] = [];
  const check = (reference: PlanningReferenceInput) => {
    const checked = validatePlanningReference(reference, context);
    if (!checked.valid) warnings.push(`无效规划来源：${reference.sourceName}/${reference.field}`);
    return checked;
  };
  const fallback = context.sources.filter((source) => source.included).slice(0, 3).map((source) => ({
    sourceType: source.sourceType as PlanningSourceReference["sourceType"],
    sourceId: source.sourceId,
    sourceName: source.name,
    field: "context",
    excerpt: source.content.slice(0, 120),
    version: source.version,
    valid: true,
    classification: "source_setting" as const,
    inference: false,
  }));
  const refs = (references: PlanningSourceReference[]) => (references.length ? references : fallback).map(check);
  const checked = structuredClone(variant);
  checked.storyBible.sources = refs(checked.storyBible.sources);
  checked.storyBible.constraints = checked.storyBible.constraints.map((constraint) => ({
    ...constraint,
    sources: refs(constraint.sources),
  }));
  checked.characterPlans = checked.characterPlans.map((item) => ({ ...item, sources: refs(item.sources) }));
  checked.characterArcs = checked.characterArcs.map((item) => ({ ...item, sources: refs(item.sources) }));
  checked.relationshipArcs = checked.relationshipArcs.map((item) => ({ ...item, sources: refs(item.sources) }));
  checked.outline.sections = checked.outline.sections.map((item) => ({ ...item, sources: refs(item.sources) }));
  checked.outline.beats = checked.outline.beats.map((item) => ({ ...item, sources: refs(item.sources) }));
  checked.timeline.events = checked.timeline.events.map((item) => ({ ...item, sources: refs(item.sources) }));
  return { variant: checked, warnings: [...new Set(warnings)] };
}
