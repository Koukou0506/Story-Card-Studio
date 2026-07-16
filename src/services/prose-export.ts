import { ManuscriptSchema, type DraftVersion, type Manuscript, type SceneDraft } from "@/domain/prose";
import { sanitizeFilename } from "./import-export";
import { blocksToText } from "./prose-editing";

function selectedVersion(scene: SceneDraft, acceptedOnly = true): DraftVersion | undefined {
  const id = acceptedOnly ? scene.acceptedVersionId : scene.selectedVersionId;
  return scene.versions.find((item) => item.id === id) ?? scene.versions.find((item) => item.id === scene.selectedVersionId) ?? scene.versions.at(-1);
}

export function exportManuscriptJSON(manuscript: Manuscript): string {
  return JSON.stringify(ManuscriptSchema.parse(manuscript), null, 2);
}

export function importManuscriptJSON(value: string): Manuscript {
  try { return ManuscriptSchema.parse(JSON.parse(value)); }
  catch (error) { throw new Error(`正文 JSON 校验失败：${(error as Error).message}`); }
}

export function exportScenePlainText(scene: SceneDraft, acceptedOnly = true): string {
  const version = selectedVersion(scene, acceptedOnly);
  return version ? blocksToText(version.blocks) : "";
}

export function exportManuscriptPlainText(manuscript: Manuscript, options?: { chapterDraftIds?: string[]; sceneDraftIds?: string[]; acceptedOnly?: boolean }): string {
  const chapterIds = new Set(options?.chapterDraftIds ?? []); const sceneIds = new Set(options?.sceneDraftIds ?? []);
  return manuscript.chapterDrafts.slice().sort((a, b) => a.order - b.order)
    .filter((chapter) => !chapterIds.size || chapterIds.has(chapter.id))
    .flatMap((chapter) => chapter.sceneDrafts.slice().sort((a, b) => a.order - b.order)
      .filter((scene) => !sceneIds.size || sceneIds.has(scene.id)).map((scene) => exportScenePlainText(scene, options?.acceptedOnly ?? true)))
    .filter(Boolean).join("\n\n");
}

export function exportManuscriptMarkdown(manuscript: Manuscript, options?: { chapterDraftIds?: string[]; sceneDraftIds?: string[]; acceptedOnly?: boolean; includeNotes?: boolean }): string {
  const chapterIds = new Set(options?.chapterDraftIds ?? []); const sceneIds = new Set(options?.sceneDraftIds ?? []);
  const lines = [`# ${manuscript.name}`, ""];
  for (const chapter of manuscript.chapterDrafts.slice().sort((a, b) => a.order - b.order)) {
    if (chapterIds.size && !chapterIds.has(chapter.id)) continue;
    const scenes = chapter.sceneDrafts.slice().sort((a, b) => a.order - b.order).filter((scene) => !sceneIds.size || sceneIds.has(scene.id));
    if (!scenes.length) continue;
    lines.push(`## ${chapter.title}`, "");
    for (const scene of scenes) {
      const version = selectedVersion(scene, options?.acceptedOnly ?? true);
      if (!version) continue;
      lines.push(`### ${scene.title}`, "", blocksToText(version.blocks), "");
      if (options?.includeNotes) lines.push(`> 版本：${version.name} · ${version.status}${version.incomplete ? " · 未完成" : ""}`, "");
    }
  }
  return lines.join("\n").trim() + "\n";
}

export const manuscriptFilename = (manuscript: Manuscript, ext: "md" | "txt" | "json") => `${sanitizeFilename(manuscript.name || "manuscript")}.${ext}`;
