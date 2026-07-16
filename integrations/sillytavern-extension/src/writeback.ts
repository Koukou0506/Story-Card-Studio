import { SillyTavernWorldInfoAdapter } from "../../../src/adapters/sillytavern-world-info";
import { CharacterCardV2Schema } from "../../../src/domain/character-card";
import { LorebookSchema } from "../../../src/domain/lorebook";
import { ProjectAssociationSchema, type IntegrationTask, type ProjectAssociation, type SillyTavernContextSnapshot } from "../../../src/integrations/sillytavern/contracts";
import { fingerprintValue } from "./context-adapter";
import { downloadJson, resolveWriteback } from "./diff";
import type { SillyTavernContextLike } from "./types";

export async function saveAssociation(context: SillyTavernContextLike, snapshot: SillyTavernContextSnapshot, association: ProjectAssociation): Promise<void> {
  if (snapshot.mode === "group" && context.chatMetadata && context.saveMetadata) {
    context.chatMetadata.story_card_studio = ProjectAssociationSchema.parse(association);
    await context.saveMetadata();
    return;
  }
  if (!snapshot.character || snapshot.mode !== "character" || !context.writeExtensionField) throw new Error("当前无法安全保存项目关联。");
  const current = Array.isArray(context.characters) ? context.characters[snapshot.character.index] as Record<string, unknown> | undefined : undefined;
  if (!current || await fingerprintValue({ avatar: current.avatar, data: current.data }) !== snapshot.character.fingerprint) throw new Error("角色已切换或修改，已阻止保存关联。");
  await context.writeExtensionField(snapshot.character.index, "story_card_studio", ProjectAssociationSchema.parse(association));
}

export async function applyTaskResult(context: SillyTavernContextLike, snapshot: SillyTavernContextSnapshot, task: IntegrationTask, confirmed: boolean, selectedPaths?: string[]): Promise<"written" | "exported" | "blocked" | "cancelled"> {
  if (!task.result) throw new Error("任务尚无可用结果。");
  if (!confirmed) return "cancelled";
  if (selectedPaths && selectedPaths.length === 0) return "cancelled";
  if (task.result.kind === "character_card") {
    const incoming = CharacterCardV2Schema.parse(task.result.payload);
    const output = snapshot.character ? structuredClone(snapshot.character.card) : structuredClone(incoming);
    if (selectedPaths && snapshot.character) {
      for (const path of selectedPaths) {
        if (path in incoming.data) output.data[path] = structuredClone(incoming.data[path]);
        else delete output.data[path];
      }
    } else Object.assign(output, structuredClone(incoming));
    downloadJson(`${snapshot.character?.name || "character"}.json`, output); return "exported";
  }
  if (task.result.kind !== "lorebook") { downloadJson(`story-card-studio-${task.id}.json`, task.result.payload); return "exported"; }
  const original = snapshot.worldInfo[0];
  const exported = new SillyTavernWorldInfoAdapter().export(LorebookSchema.parse(task.result.payload));
  if (!original) { downloadJson("world-info.json", exported.data); return "exported"; }
  const currentRaw = context.loadWorldInfo ? await context.loadWorldInfo(original.name) : null;
  const currentFingerprint = currentRaw ? await fingerprintValue(currentRaw) : "";
  const decision = await resolveWriteback({ confirmed, originalFingerprint: original?.fingerprint ?? "missing", currentFingerprint, capabilityAvailable: Boolean(original && context.saveWorldInfo) });
  if (decision.action === "blocked") return "blocked"; if (decision.action === "cancel") return "cancelled";
  const output = structuredClone(exported.data);
  if (selectedPaths && currentRaw && typeof currentRaw === "object") {
    const merged = structuredClone(currentRaw) as typeof output;
    merged.entries = merged.entries ?? {};
    for (const path of selectedPaths) {
      const uid = path.startsWith("entries.") ? path.slice("entries.".length) : path;
      if (uid in output.entries) merged.entries[uid] = structuredClone(output.entries[uid]);
      else delete merged.entries[uid];
    }
    if (decision.action === "export") { downloadJson(`${original.name}.json`, merged); return "exported"; }
    await context.saveWorldInfo!(original.name, merged, true); return "written";
  }
  if (decision.action === "export") { downloadJson(`${original.name}.json`, output); return "exported"; }
  await context.saveWorldInfo!(original.name, output, true); return "written";
}
