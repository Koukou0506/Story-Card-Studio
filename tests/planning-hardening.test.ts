import { describe, expect, it } from "vitest";
import { createEmptyCharacterCard } from "@/domain/character-card";
import { CharacterArcSchema, CharacterPlanSchema, RelationshipArcSchema, TimelineEventSchema, createEmptyBeat, createEmptyStoryPlan, createEmptyVariant, PlotDependencySchema } from "@/domain/story-planning";
import { buildPlanningContext } from "@/services/planning-context-builder";
import { exportPlanningMarkdown } from "@/services/planning-export";
import { validatePlanningReferences } from "@/services/planning-references";
import { mergeGeneratedVariant } from "@/services/planning-version";
import { validatePlanning } from "@/services/planning-validator";
import { createEmptyProjectDraft, migrateProjectDraft } from "@/domain/project-draft";

describe("B1 hardening", () => {
  it("includes original idea, selected character and full existing plan in inspectable context", () => {
    const plan = createEmptyStoryPlan();
    plan.originalIdea = "一座会记忆的城市";
    plan.generationGoal = "规划城市秘密被发现的主线";
    plan.selectedCharacterIds = ["主角"];
    plan.variants[0].storyBible.coreConflict = "记忆与自由";
    const card = createEmptyCharacterCard();
    card.data.name = "主角";
    const context = buildPlanningContext(plan, card, [], []);
    expect(context.sources.map((source) => source.id)).toEqual(expect.arrayContaining(["original-idea", "generation-goal", "character-card:主角", `plan:${plan.variants[0].id}`]));
    expect(context.sources.find((source) => source.id === `plan:${plan.variants[0].id}`)?.content).toContain("记忆与自由");
  });

  it("does not delete locked beats or locked nested items during module merge", () => {
    const existing = createEmptyVariant();
    const lockedBeat = createEmptyBeat(0);
    lockedBeat.title = "必须保留的节点";
    lockedBeat.locked = true;
    existing.outline.beats = [lockedBeat];
    const lockedConstraint = existing.storyBible.constraints[0] = {
      ...existing.storyBible.constraints[0],
      content: "不可改变的约束",
      locked: true,
    };
    const generated = createEmptyVariant();
    const merged = mergeGeneratedVariant(existing, generated, ["outline", "storyBible"]);
    expect(merged.outline.beats.some((beat) => beat.id === lockedBeat.id)).toBe(true);
    expect(merged.storyBible.constraints.some((constraint) => constraint.id === lockedConstraint.id)).toBe(true);
  });

  it("validates references on character plans, arcs, relationships and timeline", () => {
    const plan = createEmptyStoryPlan();
    const variant = plan.variants[0];
    const invalid = { sourceType: "lorebook" as const, sourceId: "missing", sourceName: "missing", field: "content", excerpt: "", version: "1", valid: true };
    const base = { createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString() };
    variant.characterPlans.push(CharacterPlanSchema.parse({ ...base, id: "cp", characterId: "c", characterName: "角色", sources: [invalid] }));
    variant.characterArcs.push(CharacterArcSchema.parse({ ...base, id: "arc", characterPlanId: "cp", sources: [invalid] }));
    variant.relationshipArcs.push(RelationshipArcSchema.parse({ ...base, id: "rel", characterIds: ["a", "b"], sources: [invalid] }));
    variant.timeline.events.push(TimelineEventSchema.parse({ ...base, id: "event", title: "事件", sources: [invalid] }));
    const result = validatePlanningReferences(variant, buildPlanningContext(plan, createEmptyCharacterCard(), [], []));
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.variant.characterPlans.find((item) => item.id === "cp")?.sources[0].valid).toBe(false);
  });

  it("reports missing timeline references and relationship triggers", () => {
    const variant = createEmptyVariant();
    variant.relationshipArcs = [{ ...variant.relationshipArcs[0], characterIds: ["a", "b"] }];
    variant.timeline.events = [{ ...variant.timeline.events[0], id: "event", title: "相对事件", relativeToEventId: "missing" }];
    const types = validatePlanning(variant).map((item) => item.type);
    expect(types).toContain("relationship_without_trigger");
    expect(types).toContain("missing_timeline_reference");
  });

  it("exports without mutating timeline order and includes dependency details", () => {
    const plan = createEmptyStoryPlan();
    const first = createEmptyBeat(0);
    const second = createEmptyBeat(1);
    first.title = "先行";
    second.title = "后续";
    first.dependencies = [PlotDependencySchema.parse({ id: "dep", createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString(), fromBeatId: first.id, toBeatId: second.id, type: "causes" })];
    plan.variants[0].outline.beats = [first, second];
    plan.variants[0].timeline.events = [
      { ...plan.variants[0].timeline.events[0], id: "late", title: "晚", order: 2 },
      { ...plan.variants[0].timeline.events[0], id: "early", title: "早", order: 1 },
    ];
    const before = plan.variants[0].timeline.events.map((event) => event.id);
    const markdown = exportPlanningMarkdown(plan, plan.variants[0]);
    expect(plan.variants[0].timeline.events.map((event) => event.id)).toEqual(before);
    expect(markdown).toContain("causes:");
  });

  it("migrates an A3-era draft without dropping existing project data", () => {
    const draft = createEmptyProjectDraft();
    draft.projectInput.originalIdea = "旧创意";
    draft.characterData.name = "旧角色";
    const migrated = migrateProjectDraft({ ...draft, dataVersion: 3, storyPlans: undefined, selectedStoryPlanId: undefined });
    expect(migrated.projectInput.originalIdea).toBe("旧创意");
    expect(migrated.characterData.name).toBe("旧角色");
    expect(migrated.storyPlans).toEqual([]);
    expect(migrated.migrationError).toBeNull();
  });
});
