import type { ProjectDraft } from "@/domain/project-draft";
import { ProjectEntitySchema, EntityAliasSchema, continuityBase, createContinuitySource, type ProjectEntity, type ContinuityProject } from "@/domain/continuity";

export interface EntitySearchFilters {
  types?: ProjectEntity["entityType"][]; characterId?: string; chapterId?: string; sourceType?: string; status?: ProjectEntity["status"];
}

const normalize = (value: string) => value.normalize("NFKC").trim().toLocaleLowerCase();

/** 同名只作为搜索命中，不自动合并；稳定来源 ID 相同才复用实体。 */
export function buildProjectEntityIndex(draft: Pick<ProjectDraft, "characterCard" | "lorebooks" | "storyPlans" | "chapterPlanningProjects" | "manuscripts">, existing: ProjectEntity[] = [], continuity?: ContinuityProject): ProjectEntity[] {
  const byStableSource = new Map<string, ProjectEntity>();
  for (const item of existing) for (const source of item.sources) byStableSource.set(`${source.sourceType}:${source.sourceId}`, item);
  const entities = [...existing];
  const add = (name: string, entityType: ProjectEntity["entityType"], sourceType: Parameters<typeof createContinuitySource>[0], sourceId: string, description = "", chapterIds: string[] = [], sceneIds: string[] = []) => {
    if (!name.trim()) return;
    const sourceKey = `${sourceType}:${sourceId}`;
    const found = byStableSource.get(sourceKey);
    if (found) {
      found.chapterIds = [...new Set([...found.chapterIds, ...chapterIds])]; found.sceneIds = [...new Set([...found.sceneIds, ...sceneIds])];
      if (description && !found.description.includes(description)) found.description = `${found.description}\n${description}`.trim();
      return;
    }
    const entity = ProjectEntitySchema.parse({ ...continuityBase("entity"), entityType, name, normalizedName: normalize(name), description,
      chapterIds, sceneIds, sources: [createContinuitySource(sourceType, sourceId, { sourceName: name, excerpt: description.slice(0, 180), authority: sourceType === "manuscript" ? 3 : sourceType === "story_plan" ? 5 : 4, classification: sourceType === "manuscript" ? "project_fact" : "source_setting" })] });
    entities.push(entity); byStableSource.set(sourceKey, entity);
  };
  const card = draft.characterCard;
  add(card.data.name, "character", "character_card", card.data.name || "current_character", card.data.description);
  for (const book of draft.lorebooks) for (const entry of book.entries) {
    const type: ProjectEntity["entityType"] = entry.category.includes("人物") ? "character" : entry.category.includes("地点") ? "location" : entry.category.includes("组织") ? "organization" : entry.category.includes("物品") ? "item" : "world_rule";
    add(entry.name || entry.activation.primaryKeys[0] || "世界书条目", type, "lorebook", entry.id, entry.content);
  }
  for (const plan of draft.storyPlans) for (const variant of plan.variants) {
    for (const character of variant.characterPlans) add(character.characterName, "character", "story_plan", character.characterId, `${character.storyFunction} ${character.externalGoal}`);
    for (const location of variant.storyBible.mainLocations) add(location, "location", "story_plan", `${variant.id}:location:${normalize(location)}`, variant.storyBible.worldRulesSummary);
    for (const beat of variant.outline.beats) add(beat.title, "event", "plot_beat", beat.id, `${beat.summary} ${beat.directResult}`);
  }
  for (const b2 of draft.chapterPlanningProjects) for (const volume of b2.volumes) for (const chapter of volume.chapters) {
    const cv = chapter.versions.find((v) => v.id === chapter.adoptedVersionId) ?? chapter.versions[0]; if (!cv) continue;
    add(cv.title, "chapter", "chapter_plan", chapter.id, `${cv.chapterGoal} ${cv.result}`, [chapter.id]);
    for (const scene of cv.scenes) { const sv = scene.versions.find((v) => v.id === scene.adoptedVersionId) ?? scene.versions[0]; if (sv) add(sv.title, "scene", "scene_plan", scene.id, `${sv.sceneGoal} ${sv.result}`, [chapter.id], [scene.id]); }
  }
  for (const manuscript of draft.manuscripts) for (const chapter of manuscript.chapterDrafts) for (const scene of chapter.sceneDrafts) {
    const accepted = scene.versions.find((version) => version.id === scene.acceptedVersionId); if (!accepted) continue;
    add(scene.title, "scene", "manuscript", scene.id, accepted.blocks.map((block) => block.text).join("\n").slice(0, 1200), [chapter.chapterPlanId], [scene.scenePlanId]);
  }
  if (continuity) {
    for (const fact of continuity.canonLedger.facts.filter((f) => !["deprecated", "retconned"].includes(f.status))) {
      const type: ProjectEntity["entityType"] = fact.factType === "history" || fact.factType === "time" || fact.factType === "relationship" || fact.factType === "body_state" ? "event" : fact.factType;
      add(fact.title, type, "canon", fact.id, fact.content);
    }
    for (const event of continuity.timeline.events) add(event.title, "event", "timeline", event.id, `${event.description} ${event.location}`, event.chapterId ? [event.chapterId] : [], event.sceneId ? [event.sceneId] : []);
    for (const thread of continuity.plotThreads) add(thread.title, "plot_thread", "plot_thread", thread.id, `${thread.description} ${thread.currentState}`.trim(), thread.chapterIds);
    for (const thread of continuity.foreshadowThreads) add(thread.title, "foreshadow", "foreshadow", thread.id, `${thread.description} ${thread.expectedPayoff}`.trim());
  }
  return entities;
}

export function addEntityAlias(entity: ProjectEntity, value: string, context = ""): ProjectEntity {
  if (!value.trim() || entity.aliases.some((alias) => normalize(alias.value) === normalize(value))) return entity;
  return { ...entity, aliases: [...entity.aliases, EntityAliasSchema.parse({ ...continuityBase("alias"), entityId: entity.id, value, normalized: normalize(value), context })], modifiedAt: new Date().toISOString() };
}

export function searchProjectIndex(entities: ProjectEntity[], query: string, filters: EntitySearchFilters = {}): ProjectEntity[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  return entities.filter((entity) => {
    if (filters.types?.length && !filters.types.includes(entity.entityType)) return false;
    if (filters.status && entity.status !== filters.status) return false;
    if (filters.chapterId && !entity.chapterIds.includes(filters.chapterId)) return false;
    if (filters.sourceType && !entity.sources.some((source) => source.sourceType === filters.sourceType)) return false;
    if (filters.characterId && entity.entityType !== "character" && !entity.sources.some((source) => source.sourceId === filters.characterId)) return false;
    const haystack = normalize([entity.name, entity.description, ...entity.aliases.map((a) => a.value), ...entity.sources.flatMap((s) => [s.sourceName, s.field, s.excerpt])].join(" "));
    return terms.every((term) => haystack.includes(term));
  }).sort((a, b) => {
    const an = normalize(a.name); const bn = normalize(b.name); const q = normalize(query);
    return Number(bn === q) - Number(an === q) || Number(bn.startsWith(q)) - Number(an.startsWith(q)) || a.name.localeCompare(b.name, "zh-CN");
  });
}
