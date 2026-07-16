import { describe, it, expect } from "vitest";
import {
  CharacterCardV2Schema,
  CharacterDataSchema,
  createEmptyCharacterCard,
  createEmptyCharacterData,
  validateCharacterCardV2,
  safeParseCharacterCardV2,
} from "@/domain/character-card";

// ============================================
// Character Card V2 Schema 测试
// ============================================

describe("CharacterCardV2Schema", () => {
  it("应该接受有效的 V2 卡片", () => {
    const card = {
      spec: "chara_card_v2" as const,
      spec_version: "2.0" as const,
      data: {
        name: "测试角色",
        description: "一个测试角色",
        personality: "友善",
        scenario: "咖啡店",
        first_mes: "你好！",
        mes_example: "<START>\n{{user}}: hi\n{{char}}: 你好\n",
        creator_notes: "",
        system_prompt: "",
        post_history_instructions: "",
        alternate_greetings: [],
        tags: [],
        creator: "test",
        character_version: "1.0",
        extensions: {},
      },
    };

    const result = CharacterCardV2Schema.safeParse(card);
    expect(result.success).toBe(true);
  });

  it("应该拒绝缺少 spec 字段的数据", () => {
    const result = CharacterCardV2Schema.safeParse({
      spec_version: "2.0",
      data: { name: "test" },
    });
    expect(result.success).toBe(false);
  });

  it("应该拒绝错误的 spec 值", () => {
    const result = CharacterCardV2Schema.safeParse({
      spec: "chara_card_v1",
      spec_version: "2.0",
      data: { name: "test" },
    });
    expect(result.success).toBe(false);
  });

  it("应该拒绝错误的 spec_version 值", () => {
    const result = CharacterCardV2Schema.safeParse({
      spec: "chara_card_v2",
      spec_version: "1.0",
      data: { name: "test" },
    });
    expect(result.success).toBe(false);
  });

  it("空 data 字段应填充默认值", () => {
    const result = CharacterCardV2Schema.safeParse({
      spec: "chara_card_v2",
      spec_version: "2.0",
      data: {},
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.data.name).toBe("");
      expect(result.data.data.description).toBe("");
      expect(result.data.data.alternate_greetings).toEqual([]);
      expect(result.data.data.tags).toEqual([]);
      expect(result.data.data.extensions).toEqual({});
    }
  });

  it("应正确创建空白卡片", () => {
    const card = createEmptyCharacterCard();
    expect(card.spec).toBe("chara_card_v2");
    expect(card.spec_version).toBe("2.0");
    expect(card.data.name).toBe("");
  });

  it("应正确创建空白数据", () => {
    const data = createEmptyCharacterData();
    expect(data.name).toBe("");
    expect(data.alternate_greetings).toEqual([]);
    expect(data.tags).toEqual([]);
  });

  it("validateCharacterCardV2 应在数据有效时返回卡片", () => {
    const card = createEmptyCharacterCard();
    const validated = validateCharacterCardV2(card);
    expect(validated.spec).toBe("chara_card_v2");
  });

  it("safeParseCharacterCardV2 应在数据有效时返回 success", () => {
    const card = createEmptyCharacterCard();
    const result = safeParseCharacterCardV2(card);
    expect(result.success).toBe(true);
  });

  it("safeParseCharacterCardV2 应在数据无效时返回 error", () => {
    const result = safeParseCharacterCardV2({ spec: "invalid" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeTruthy();
    }
  });
});

describe("CharacterDataSchema", () => {
  it("应接受最小数据（所有字段有默认值）", () => {
    const result = CharacterDataSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("应接受带有 character_book 的数据", () => {
    const result = CharacterDataSchema.safeParse({
      name: "test",
      character_book: {
        entries: [
          {
            keys: ["key1"],
            content: "lore content",
            extensions: {},
            enabled: true,
            insertion_order: 100,
          },
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  it("应保留未知 extensions 字段", () => {
    const result = CharacterDataSchema.safeParse({
      name: "test",
      extensions: {
        "custom/v1": { foo: "bar" },
        "another_app/data": 42,
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.extensions).toEqual({
        "custom/v1": { foo: "bar" },
        "another_app/data": 42,
      });
    }
  });
});
