import type { ChapterPlanningProject } from "@/domain/chapter-planning";
import {
  DraftVersionSchema, ManuscriptSchema, createEmptyChapterDraft, createEmptyManuscript,
  createEmptyLanguageConstraint, createEmptySceneDraft, createTextBlocks, proseBase,
  type DraftVersion, type Manuscript, type SceneDraft,
} from "@/domain/prose";

export function createManuscriptFromChapterPlanning(project: ChapterPlanningProject): Manuscript {
  const manuscript = createEmptyManuscript(project.id, `${project.name} · 正文`);
  manuscript.b1PlanId = project.b1PlanId;
  manuscript.b1VariantId = project.b1VariantId;
  manuscript.b2SourceVersion = project.modifiedAt;
  manuscript.provider = project.provider;
  manuscript.model = project.model || "mock-model";
  if (project.provider === "mock") {
    const demoRule = createEmptyLanguageConstraint();
    demoRule.name = "Mock 演示：避免陈词滥调";
    demoRule.content = "避免直接使用陈词滥调。";
    demoRule.strictness = "hard";
    demoRule.negativeExamples = ["不由得"];
    manuscript.languageConstraints.push(demoRule);
  }
  for (const volume of project.volumes.slice().sort((a, b) => a.order - b.order)) for (const chapter of volume.chapters.slice().sort((a, b) => a.order - b.order)) {
    const chapterVersion = chapter.versions.find((item) => item.id === chapter.selectedVersionId) ?? chapter.versions[0];
    if (!chapterVersion) continue;
    const chapterDraft = createEmptyChapterDraft(chapter.id, chapterVersion.id, chapterVersion.title, manuscript.chapterDrafts.length);
    for (const scene of chapterVersion.scenes.slice().sort((a, b) => a.order - b.order)) {
      const sceneVersion = scene.versions.find((item) => item.id === scene.selectedVersionId) ?? scene.versions[0];
      if (!sceneVersion) continue;
      chapterDraft.sceneDrafts.push(createEmptySceneDraft(chapterDraft.id, scene.id, sceneVersion.id, sceneVersion.title, scene.order));
    }
    manuscript.chapterDrafts.push(chapterDraft);
  }
  manuscript.selectedChapterDraftId = manuscript.chapterDrafts[0]?.id ?? null;
  manuscript.selectedSceneDraftId = manuscript.chapterDrafts[0]?.sceneDrafts[0]?.id ?? null;
  return ManuscriptSchema.parse(manuscript);
}

export function updateSceneDraft(manuscript: Manuscript, scene: SceneDraft): Manuscript {
  return { ...manuscript, chapterDrafts: manuscript.chapterDrafts.map((chapter) => chapter.id === scene.chapterDraftId ? { ...chapter, sceneDrafts: chapter.sceneDrafts.map((item) => item.id === scene.id ? scene : item), modifiedAt: new Date().toISOString() } : chapter), modifiedAt: new Date().toISOString() };
}

/** 用户直接编辑会先保留现有版本，再创建/更新独立 user_edited 自动保存版本。 */
export function autosaveUserText(scene: SceneDraft, baseVersionId: string, text: string): SceneDraft {
  const base = scene.versions.find((item) => item.id === baseVersionId);
  if (!base) throw new Error("自动保存的基础版本不存在。");
  const locked = base.blocks.filter((item) => item.locked);
  if (locked.some((item) => !text.includes(item.text))) return scene;
  const withLocks = () => createTextBlocks(text, "user_edited").map((block, order) => {
    const original = locked.find((item) => item.text === block.text);
    return original ? { ...structuredClone(original), order } : block;
  });
  if (base.provider === "user" && base.status === "user_edited") {
    const updated = DraftVersionSchema.parse({ ...base, blocks: withLocks(), wordCount: text.replace(/\s/g, "").length, incomplete: true, modifiedAt: new Date().toISOString() });
    return { ...scene, status: "user_edited", versions: scene.versions.map((item) => item.id === base.id ? updated : item), selectedVersionId: updated.id, incomplete: true, modifiedAt: new Date().toISOString() };
  }
  const existing = scene.versions.find((item) => item.parentVersionId === base.id && item.provider === "user" && item.status === "user_edited");
  const payload = DraftVersionSchema.parse({
    ...(existing ?? base), id: existing?.id ?? proseBase("draft_version").id,
    parentVersionId: base.id, name: existing?.name ?? `${base.name} · 用户编辑`, provider: "user", model: "",
    status: "user_edited", operationType: "custom_revision", blocks: withLocks(),
    wordCount: text.replace(/\s/g, "").length, incomplete: true,
    createdAt: existing?.createdAt ?? new Date().toISOString(), modifiedAt: new Date().toISOString(),
  });
  return { ...scene, status: "user_edited", versions: existing ? scene.versions.map((item) => item.id === existing.id ? payload : item) : [...scene.versions, payload], selectedVersionId: payload.id, incomplete: true, modifiedAt: new Date().toISOString() };
}

export function cloneDraftVersion(version: DraftVersion, name = `${version.name} · 副本`): DraftVersion {
  return DraftVersionSchema.parse({ ...structuredClone(version), ...proseBase("draft_version"), name, parentVersionId: version.id, status: "alternative", locked: false });
}

export function extractAbstractStyleFeatures(sample: string): string[] {
  const sentences = sample.split(/[。！？]/).filter(Boolean);
  const paragraphs = sample.split(/\n{2,}/).filter(Boolean);
  const dialogue = (sample.match(/[“「『\"][^”」』\"]+[”」』\"]/g) ?? []).join("").length;
  const features = [
    `平均句长约 ${Math.round(sample.length / Math.max(1, sentences.length))} 字`,
    `平均段长约 ${Math.round(sample.length / Math.max(1, paragraphs.length))} 字`,
    `对话占比约 ${Math.round(dialogue / Math.max(1, sample.length) * 100)}%`,
  ];
  if ((sample.match(/仿佛|如同|宛如|好似/g) ?? []).length >= 2) features.push("修辞密度偏高");
  if ((sample.match(/忽然|立刻|猛地|骤然/g) ?? []).length >= 2) features.push("动作节奏偏快");
  return features;
}
