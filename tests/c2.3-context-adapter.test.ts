import { describe, expect, it, vi } from "vitest";
import {
  buildContextSnapshot,
  fingerprintValue,
  hasSnapshotChanged,
  registerContextEvents,
  selectChatMessages,
} from "../integrations/sillytavern-extension/src/context-adapter";
import { createProjectAssociation, readProjectAssociation } from "../integrations/sillytavern-extension/src/association";

const character = {
  name: "柳青", avatar: "liu.png", date_last_chat: 42,
  data: { name: "柳青", description: "旅人", personality: "谨慎", scenario: "临水镇", first_mes: "你好", mes_example: "", creator_notes: "", system_prompt: "", post_history_instructions: "", alternate_greetings: [], tags: [], creator: "", character_version: "1", extensions: { world: "临水镇" }, character_book: { name: "内嵌设定", entries: [] } },
};

function context(overrides: Record<string, unknown> = {}) {
  return {
    characterId: 0, groupId: null, chatId: "chat-1", characters: [character], groups: [],
    chat: [
      { mes: "第一条", is_user: true, name: "User" },
      { mes: "第二条", is_user: false, name: "柳青" },
      { mes: "第三条", is_user: true, name: "User" },
    ],
    chatMetadata: {}, getWorldInfoNames: () => ["临水镇"],
    loadWorldInfo: async (name: string) => ({ name, entries: { 0: { uid: 0, key: ["临水镇"], content: "河港小镇" } } }),
    ...overrides,
  };
}

describe("SillyTavern context adapter", () => {
  it("reads the current Character Card V2 and Character Book with a stable snapshot fingerprint", async () => {
    const snapshot = await buildContextSnapshot(context(), { chatRange: { kind: "recent", count: 2 }, includeWorldInfo: true });
    expect(snapshot.character?.card.spec).toBe("chara_card_v2");
    expect(snapshot.character?.card.data.character_book?.name).toBe("内嵌设定");
    expect(snapshot.character?.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(snapshot.worldInfo).toHaveLength(1);
    expect(snapshot.chat.messages.map((message) => message.text)).toEqual(["第二条", "第三条"]);
  });

  it("returns a safe no-character state", async () => {
    const snapshot = await buildContextSnapshot(context({ characterId: undefined, characters: [] }), { chatRange: { kind: "recent", count: 1 } });
    expect(snapshot.character).toBeNull();
    expect(snapshot.mode).toBe("none");
  });

  it("recognizes group chat without treating characterId as a stable member", async () => {
    const snapshot = await buildContextSnapshot(context({ characterId: undefined, groupId: "g1", groups: [{ id: "g1", name: "队伍", members: ["liu.png", "mei.png"] }] }), { chatRange: { kind: "recent", count: 1 } });
    expect(snapshot.mode).toBe("group");
    expect(snapshot.group?.members).toEqual(["liu.png", "mei.png"]);
    expect(snapshot.capabilities.characterWriteback).toBe(false);
  });

  it("supports recent, manual and role-filtered chat ranges without defaulting to full chat", () => {
    const chat = context().chat as Array<{ mes: string; is_user: boolean; name: string }>;
    expect(selectChatMessages(chat, { kind: "recent", count: 1 }).map((item) => item.text)).toEqual(["第三条"]);
    expect(selectChatMessages(chat, { kind: "manual", start: 0, end: 1, roles: ["assistant"] }).map((item) => item.text)).toEqual(["第二条"]);
  });

  it("detects a changed source before writeback", async () => {
    const original = await fingerprintValue(character.data);
    expect(await hasSnapshotChanged(original, { ...character.data, description: "已修改" })).toBe(true);
  });

  it("stores only lightweight serializable project association data", () => {
    const association = createProjectAssociation({ projectId: "p1", workspaceId: "default", characterFingerprint: "abc", worldInfoFingerprint: "def" });
    expect(readProjectAssociation({ story_card_studio: association })).toEqual(association);
    expect(JSON.stringify(association)).not.toMatch(/token|apiKey|report/i);
  });

  it("debounces all required lifecycle invalidations without uploading data", async () => {
    vi.useFakeTimers(); const handlers = new Map<string, () => void>(); const invalidate = vi.fn();
    registerContextEvents({ eventTypes: Object.fromEntries(["APP_READY", "CHAT_CHANGED", "CHARACTER_EDITED", "CHARACTER_DELETED", "WORLDINFO_UPDATED", "MESSAGE_EDITED", "MESSAGE_DELETED"].map((name) => [name, name])), eventSource: { on: (event, handler) => handlers.set(event, handler) } }, invalidate, 20);
    expect([...handlers.keys()]).toEqual(["APP_READY", "CHAT_CHANGED", "CHARACTER_EDITED", "CHARACTER_DELETED", "WORLDINFO_UPDATED", "MESSAGE_EDITED", "MESSAGE_DELETED"]);
    handlers.get("MESSAGE_EDITED")?.(); handlers.get("MESSAGE_DELETED")?.(); await vi.advanceTimersByTimeAsync(20);
    expect(invalidate).toHaveBeenCalledOnce(); vi.useRealTimers();
  });
});
