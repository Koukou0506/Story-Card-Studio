import type { DocumentIngestionProject } from "@/domain/document-ingestion";
import { createCanonFact, createEmptyContinuityProject } from "@/domain/continuity";
import { createDraftVersion, createEmptyChapterDraft, createEmptyManuscript, createEmptySceneDraft } from "@/domain/prose";
import { createEmptyProjectDraft, type ProjectDraft } from "@/domain/project-draft";
import { ProjectRebuildPlanSchema, ProjectRebuildResultSchema, type ProjectRebuildOperation, type ProjectRebuildPlan, workImportId, workImportNow } from "@/domain/work-import";

function op(kind: ProjectRebuildOperation["kind"], sourceId: string, title: string, action: ProjectRebuildOperation["action"] = "add", conflict = false): ProjectRebuildOperation {
  return { id: workImportId("rebuild_operation"), kind, sourceId, targetId: null, action, title, reason: conflict ? "现有项目存在同名或关联内容，需要用户审查。" : "导入内容将作为草稿、候选或新正文版本写入。", conflict, selected: true };
}
export function planProjectRebuild(input: { ingestion: DocumentIngestionProject; mode: "new" | "supplement"; target?: ProjectDraft }): ProjectRebuildPlan {
  const target = input.target; const operations: ProjectRebuildOperation[] = [];
  const existingChapterTitles = new Set(target?.manuscripts.flatMap((manuscript) => manuscript.chapterDrafts.map((chapter) => chapter.title)) ?? []);
  for (const chapter of input.ingestion.chapters) operations.push(op("manuscript", chapter.id, chapter.title, existingChapterTitles.has(chapter.title) ? "create_version" : "add", existingChapterTitles.has(chapter.title)));
  for (const card of input.ingestion.characterCardDrafts) operations.push(op("character_card", card.id, card.card.data.name, target?.characterCard.data.name === card.card.data.name ? "conflict" : "add", target?.characterCard.data.name === card.card.data.name));
  for (const book of input.ingestion.lorebookDrafts) operations.push(op("lorebook", book.id, book.lorebook.name, target?.lorebooks.some((item) => item.name === book.lorebook.name) ? "merge" : "add", target?.lorebooks.some((item) => item.name === book.lorebook.name)));
  for (const candidate of input.ingestion.canonCandidates) operations.push(op("canon", candidate.id, candidate.name || candidate.content));
  for (const candidate of input.ingestion.stateCandidates) operations.push(op("state", candidate.id, candidate.name || candidate.content));
  for (const candidate of input.ingestion.timelineCandidates) operations.push(op("timeline", candidate.id, candidate.name || candidate.content));
  for (const candidate of input.ingestion.plotThreadCandidates) operations.push(op("plot_thread", candidate.id, candidate.name || candidate.content));
  for (const candidate of input.ingestion.foreshadowCandidates) operations.push(op("foreshadow", candidate.id, candidate.name || candidate.content));
  for (const candidate of input.ingestion.styleProfileCandidates) operations.push(op("style_profile", candidate.id, candidate.name));
  for (const candidate of input.ingestion.languageConstraintCandidates) operations.push(op("language_constraint", candidate.id, candidate.name));
  const now = workImportNow();
  return ProjectRebuildPlanSchema.parse({ id: workImportId("rebuild_plan"), ingestionId: input.ingestion.id, mode: input.mode, targetProjectId: input.ingestion.projectId, operations, conflicts: operations.filter((item) => item.conflict).map((item) => ({ id: workImportId("import_conflict"), operationId: item.id, description: item.reason })), createdAt: now, modifiedAt: now });
}

function chapterText(ingestion: DocumentIngestionProject, chapterId: string): string {
  const chunks = ingestion.chunks.filter((item) => item.chapterId === chapterId).sort((a, b) => a.startOffset - b.startOffset); let text = ""; let end = -1;
  for (const chunk of chunks) { const overlap = Math.max(0, end - chunk.startOffset); text += chunk.text.slice(overlap); end = Math.max(end, chunk.endOffset); }
  return text;
}
function addImportedManuscript(draft: ProjectDraft, ingestion: DocumentIngestionProject, selectedIds: Set<string>, planId: string): string | null {
  const chapterOps = ingestion.chapters.filter((chapter) => selectedIds.has(chapter.id)); if (!chapterOps.length) return null;
  const existing = draft.manuscripts.find((item) => (item as unknown as { sourceRebuildPlanId?: string }).sourceRebuildPlanId === planId); if (existing) return existing.id;
  const manuscript = createEmptyManuscript(`import:${ingestion.id}`, `导入正文：${ingestion.name}`);
  (manuscript as typeof manuscript & { sourceRebuildPlanId: string }).sourceRebuildPlanId = planId;
  manuscript.chapterDrafts = chapterOps.map((chapter, order) => {
    const chapterDraft = createEmptyChapterDraft(chapter.id, `import:${chapter.id}`, chapter.title, order);
    const scene = createEmptySceneDraft(chapterDraft.id, chapter.id, `import:${chapter.id}`, chapter.title, 0);
    const version = createDraftVersion(scene.id, chapterText(ingestion, chapter.id), "alternative");
    version.name = "导入正文版本"; version.notes = ["由作品导入创建；未自动设为采用版本。"];
    scene.versions = [version]; scene.selectedVersionId = version.id; scene.acceptedVersionId = null; scene.incomplete = !version.wordCount;
    chapterDraft.sceneDrafts = [scene]; return chapterDraft;
  });
  manuscript.selectedChapterDraftId = manuscript.chapterDrafts[0]?.id ?? null; manuscript.selectedSceneDraftId = manuscript.chapterDrafts[0]?.sceneDrafts[0]?.id ?? null;
  draft.manuscripts.push(manuscript); draft.selectedManuscriptId = manuscript.id; return manuscript.id;
}

export function executeProjectRebuildPlan(input: { draft?: ProjectDraft; ingestion: DocumentIngestionProject; plan: ProjectRebuildPlan }): { draft: ProjectDraft; result: ReturnType<typeof ProjectRebuildResultSchema.parse> } {
  if (!input.plan.confirmed) throw new Error("请先确认项目重建方案。" );
  if (input.plan.conflicts.some((item) => item.resolution === "pending")) throw new Error("重建方案仍有未处理冲突。" );
  const draft = structuredClone(input.plan.mode === "new" ? createEmptyProjectDraft() : (input.draft ?? createEmptyProjectDraft())); const log: Array<{ operationId: string; status: "completed" | "failed" | "skipped"; targetId: string | null; error: string | null }> = [];
  const selected = input.plan.operations.filter((item) => item.selected && item.action !== "skip" && item.action !== "conflict"); const selectedSourceIds = new Set(selected.map((item) => item.sourceId));
  const manuscriptTarget = addImportedManuscript(draft, input.ingestion, selectedSourceIds, input.plan.id);
  for (const operation of input.plan.operations) {
    if (!operation.selected || operation.action === "skip" || operation.action === "conflict") { log.push({ operationId: operation.id, status: "skipped", targetId: null, error: operation.action === "conflict" ? "冲突尚未解决" : null }); continue; }
    try {
      let targetId: string | null = operation.kind === "manuscript" ? manuscriptTarget : null;
      if (operation.kind === "lorebook") {
        const candidate = input.ingestion.lorebookDrafts.find((item) => item.id === operation.sourceId);
        if (candidate && !draft.lorebooks.some((item) => (item as unknown as { sourceCandidateId?: string }).sourceCandidateId === candidate.id)) {
          const book = structuredClone(candidate.lorebook); (book.metadata as typeof book.metadata & { status: string }).status = "draft"; (book as typeof book & { sourceCandidateId: string }).sourceCandidateId = candidate.id; draft.lorebooks.push(book); targetId = book.id;
        }
      }
      if (["canon", "state", "timeline", "plot_thread", "foreshadow"].includes(operation.kind)) {
        let continuity = draft.continuityProjects[0]; if (!continuity) { continuity = createEmptyContinuityProject("导入候选"); draft.continuityProjects.push(continuity); draft.selectedContinuityProjectId = continuity.id; }
        const candidate = [...input.ingestion.canonCandidates, ...input.ingestion.stateCandidates, ...input.ingestion.timelineCandidates, ...input.ingestion.plotThreadCandidates, ...input.ingestion.foreshadowCandidates].find((item) => item.id === operation.sourceId);
        if (candidate && !continuity.canonLedger.facts.some((item) => item.notes.includes(`source-candidate:${candidate.id}`))) {
          const fact = createCanonFact({ status: "candidate", title: candidate.name || "导入候选", content: candidate.content || candidate.description, authority: 8, notes: [`source-candidate:${candidate.id}`] }); continuity.canonLedger.facts.push(fact); targetId = fact.id;
        }
      }
      if (operation.kind === "style_profile" || operation.kind === "language_constraint") {
        const manuscript = draft.manuscripts.find((item) => item.id === manuscriptTarget) ?? draft.manuscripts[0];
        if (manuscript && operation.kind === "style_profile") { const item = input.ingestion.styleProfileCandidates.find((value) => value.id === operation.sourceId); if (item) { const value = { ...item.profile, status: "generated" as const }; if (!manuscript.styleProfiles.some((profile) => profile.id === value.id)) manuscript.styleProfiles.push(value); targetId = value.id; } }
        if (manuscript && operation.kind === "language_constraint") { const item = input.ingestion.languageConstraintCandidates.find((value) => value.id === operation.sourceId); if (item) { const value = { ...item.constraint, status: "generated" as const, strictness: item.candidateStrictness }; if (!manuscript.languageConstraints.some((constraint) => constraint.id === value.id)) manuscript.languageConstraints.push(value); targetId = value.id; } }
      }
      log.push({ operationId: operation.id, status: "completed", targetId, error: null });
    } catch (error) { log.push({ operationId: operation.id, status: "failed", targetId: null, error: (error as Error).message }); }
  }
  draft.savedAt = workImportNow(); const failed = log.filter((item) => item.status === "failed").length; const completed = log.filter((item) => item.status === "completed").length;
  const result = ProjectRebuildResultSchema.parse({ id: workImportId("rebuild_result"), planId: input.plan.id, status: failed ? (completed ? "partially_completed" : "failed") : "completed", log, createdAt: workImportNow(), modifiedAt: workImportNow() });
  return { draft, result };
}
