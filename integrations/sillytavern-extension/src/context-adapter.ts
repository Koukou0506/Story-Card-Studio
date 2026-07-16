import { CharacterCardV2Schema } from "../../../src/domain/character-card";
import { SillyTavernWorldInfoAdapter, SillyTavernWorldInfoSchema } from "../../../src/adapters/sillytavern-world-info";
import { ChatRangeSchema, SillyTavernContextSnapshotSchema, type ChatRange, type SillyTavernContextSnapshot } from "../../../src/integrations/sillytavern/contracts";
import type { STChatMessage, SillyTavernContextLike, SnapshotOptions } from "./types";

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

export async function fingerprintValue(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stable(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hasSnapshotChanged(fingerprint: string, value: unknown): Promise<boolean> {
  return fingerprint !== await fingerprintValue(value);
}

export function selectChatMessages(chat: STChatMessage[], inputRange: ChatRange) {
  const range = ChatRangeSchema.parse(inputRange);
  let indexed = chat.map((message, index) => ({ message, index }));
  if (range.kind === "last") indexed = indexed.slice(-1);
  if (range.kind === "recent") indexed = indexed.slice(-range.count);
  if (range.kind === "manual") indexed = indexed.slice(Math.min(range.start, range.end), Math.max(range.start, range.end) + 1);
  if (range.roles?.length) indexed = indexed.filter(({ message }) => range.roles!.includes(message.is_user === true ? "user" : "assistant"));
  return indexed.map(({ message, index }) => ({
    index, role: message.is_user === true ? "user" as const : "assistant" as const,
    name: typeof message.name === "string" ? message.name : message.is_user === true ? "User" : "Character",
    text: typeof message.mes === "string" ? message.mes : "",
  }));
}

function stringValue(value: unknown, fallback = ""): string { return typeof value === "string" ? value : fallback; }
function arrayValue(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }

export async function buildContextSnapshot(context: SillyTavernContextLike, options: SnapshotOptions): Promise<SillyTavernContextSnapshot> {
  const characters = arrayValue(context.characters) as Array<Record<string, unknown>>;
  const groups = arrayValue(context.groups) as Array<Record<string, unknown>>;
  const groupId = context.groupId === undefined || context.groupId === null ? null : String(context.groupId);
  const characterIndex = typeof context.characterId === "number" && Number.isInteger(context.characterId) ? context.characterId : null;
  const isGroup = Boolean(groupId);
  const character = !isGroup && characterIndex !== null ? characters[characterIndex] : undefined;
  let characterSnapshot: SillyTavernContextSnapshot["character"] = null;
  if (character) {
    const data = character.data && typeof character.data === "object" ? structuredClone(character.data) as Record<string, unknown> : {};
    const card = CharacterCardV2Schema.parse({ spec: "chara_card_v2", spec_version: "2.0", data: { ...data, name: stringValue(data.name, stringValue(character.name, "未命名角色")) } });
    characterSnapshot = {
      index: characterIndex!, name: card.data.name, avatar: stringValue(character.avatar),
      modifiedMarker: String(character.date_last_chat ?? ""),
      fingerprint: await fingerprintValue({ avatar: character.avatar, data: card.data }), card,
    };
  }
  const groupRecord = isGroup ? groups.find((item) => String(item.id) === groupId) : undefined;
  const members = arrayValue(groupRecord?.members).map(String);
  const selectedMembers = options.selectedGroupMembers?.filter((item) => members.includes(item)) ?? members;
  const group = groupRecord ? { id: groupId!, name: stringValue(groupRecord.name, "群聊"), members, selectedMembers } : null;

  const selectedMessages = selectChatMessages(arrayValue(context.chat) as STChatMessage[], options.chatRange);
  const messages = await Promise.all(selectedMessages.map(async (message) => ({ ...message, fingerprint: await fingerprintValue(message) })));
  const worldNames = new Set<string>();
  const worldFromCharacter = characterSnapshot?.card.data.extensions && (characterSnapshot.card.data.extensions as Record<string, unknown>).world;
  if (typeof worldFromCharacter === "string" && worldFromCharacter) worldNames.add(worldFromCharacter);
  const metadataWorld = context.chatMetadata?.world_info;
  if (typeof metadataWorld === "string" && metadataWorld) worldNames.add(metadataWorld);
  if (Array.isArray(metadataWorld)) metadataWorld.filter((item): item is string => typeof item === "string").forEach((item) => worldNames.add(item));
  const worldInfo: SillyTavernContextSnapshot["worldInfo"] = [];
  if (options.includeWorldInfo && context.loadWorldInfo) {
    for (const name of worldNames) {
      const raw = await context.loadWorldInfo(name);
      const parsed = SillyTavernWorldInfoSchema.safeParse(raw);
      if (!parsed.success) continue;
      const warnings = new SillyTavernWorldInfoAdapter().import(parsed.data, { name }).warnings.map((warning) => warning.message);
      worldInfo.push({ name, fingerprint: await fingerprintValue(parsed.data), data: parsed.data, warnings });
    }
  }
  const persona = options.includePersona && context.persona ? { name: stringValue(context.persona.name), description: stringValue(context.persona.description) } : null;
  return SillyTavernContextSnapshotSchema.parse({
    snapshotId: `st_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`, createdAt: new Date().toISOString(),
    mode: isGroup ? "group" : characterSnapshot ? "character" : "none", chatId: context.chatId == null ? null : String(context.chatId),
    character: characterSnapshot, group, chat: { range: options.chatRange, messages, characterCount: messages.reduce((sum, item) => sum + item.text.length, 0), participants: [...new Set(messages.map((item) => item.name))] },
    worldInfo, persona,
    capabilities: { characterWriteback: false, worldInfoWriteback: typeof context.saveWorldInfo === "function", associationWriteback: Boolean(characterSnapshot && context.writeExtensionField) },
  });
}

const CONTEXT_EVENTS = ["APP_READY", "CHAT_CHANGED", "CHARACTER_EDITED", "CHARACTER_DELETED", "WORLDINFO_UPDATED", "MESSAGE_EDITED", "MESSAGE_DELETED"] as const;

export function registerContextEvents(context: SillyTavernContextLike, onInvalidate: (event: string) => void, debounceMs = 250): () => void {
  const eventTypes = context.eventTypes ?? context.event_types ?? {};
  let timer: ReturnType<typeof setTimeout> | undefined; let latest = "";
  const handlers: Array<[string, () => void]> = [];
  for (const name of CONTEXT_EVENTS) {
    const event = eventTypes[name]; if (!event || !context.eventSource) continue;
    const handler = () => { latest = name; if (timer) clearTimeout(timer); timer = setTimeout(() => onInvalidate(latest), debounceMs); };
    context.eventSource.on(event, handler); handlers.push([event, handler]);
  }
  return () => { if (timer) clearTimeout(timer); handlers.forEach(([event, handler]) => context.eventSource?.off?.(event, handler)); };
}
