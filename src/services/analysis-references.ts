import type { AnalysisContext, AnalysisReport, SourceReference } from "@/domain/plot-analysis";

function matchReference(reference: SourceReference, context: AnalysisContext) {
  return context.sources.find(source => source.included && source.type === reference.source_type && source.entityId === reference.source_entity_id &&
    source.field === reference.field_or_entry && source.version === reference.version);
}

export function validateSourceReference(reference: SourceReference, context: AnalysisContext): SourceReference {
  const match = matchReference(reference, context);
  return { ...reference, valid: Boolean(match), excerpt: match ? reference.excerpt.slice(0, 160) : reference.excerpt };
}

export function validateReportReferences(report: AnalysisReport, context: AnalysisContext): AnalysisReport {
  const warnings: string[] = [];
  const validate = (reference: SourceReference) => { const checked = validateSourceReference(reference, context);
    if (!checked.valid) warnings.push(`无效引用：${reference.source_name} / ${reference.field_or_entry}`); return checked; };
  const issues = report.issues.map(issue => ({ ...issue, source_references: issue.source_references.map(validate) }));
  const characterFits = report.characterFits.map(item => ({ ...item, source_references: item.source_references.map(validate) }));
  const referencedSources = report.referencedSources.map(validate);
  return { ...report, issues, characterFits, referencedSources, invalidReferenceWarnings: [...new Set([...report.invalidReferenceWarnings, ...warnings])] };
}

