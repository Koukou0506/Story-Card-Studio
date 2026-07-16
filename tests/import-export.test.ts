import { describe, it, expect } from "vitest";
import {
  exportToJSON,
  sanitizeFilename,
  generateExportFilename,
  areCardsEqual,
  cloneCharacterCard,
  mergeCharacterData,
} from "@/services/import-export";
import { createEmptyCharacterCard, createEmptyCharacterData } from "@/domain/character-card";

// ============================================
// 导入/导出服务测试
// ============================================

describe("exportToJSON", () => {
  it("应导出有效的 JSON 字符串", () => {
    const card = createEmptyCharacterCard();
    card.data.name = "测试角色";
    card.data.description = "测试描述";

    const json = exportToJSON(card);
    const parsed = JSON.parse(json);

    expect(parsed.spec).toBe("chara_card_v2");
    expect(parsed.spec_version).toBe("2.0");
    expect(parsed.data.name).toBe("测试角色");
    expect(parsed.data.description).toBe("测试描述");
  });

  it("导出的 JSON 应符合 Character Card V2 规范", () => {
    const card = createEmptyCharacterCard();
    card.data.name = "Test";
    card.data.tags = ["tag1", "tag2"];
    card.data.alternate_greetings = ["hello", "hi"];
    card.data.extensions = { "test/key": "value" };

    const json = exportToJSON(card);
    const parsed = JSON.parse(json);

    expect(parsed.spec).toBe("chara_card_v2");
    expect(parsed.spec_version).toBe("2.0");
    expect(parsed.data).toBeDefined();
    expect(Array.isArray(parsed.data.tags)).toBe(true);
    expect(Array.isArray(parsed.data.alternate_greetings)).toBe(true);
    expect(typeof parsed.data.extensions).toBe("object");
  });
});

describe("sanitizeFilename", () => {
  it("应保留正常的中文名称", () => {
    expect(sanitizeFilename("柳如烟")).toBe("柳如烟");
  });

  it("应移除 Windows 不安全字符", () => {
    expect(sanitizeFilename('test<>:"/\\|?*.json')).toBe("test.json");
  });

  it("应将空格替换为下划线", () => {
    expect(sanitizeFilename("my character card")).toBe("my_character_card");
  });

  it("应限制长度", () => {
    const longName = "a".repeat(200);
    expect(sanitizeFilename(longName).length).toBeLessThanOrEqual(100);
  });

  it("空名称应返回默认值", () => {
    expect(sanitizeFilename("")).toBe("character_card");
  });

  it("仅特殊字符的名称应返回默认值", () => {
    expect(sanitizeFilename("<>:\"")).toBe("character_card");
  });
});

describe("generateExportFilename", () => {
  it("应根据角色名称和版本生成文件名", () => {
    const card = createEmptyCharacterCard();
    card.data.name = "柳如烟";
    card.data.character_version = "1.2";

    const filename = generateExportFilename(card);
    expect(filename).toBe("柳如烟_v1.2.json");
  });

  it("未命名的角色应使用默认名称", () => {
    const card = createEmptyCharacterCard();
    const filename = generateExportFilename(card);
    expect(filename).toContain(".json");
  });
});

describe("round-trip 测试", () => {
  it("导出后重新导入应保持内容一致", () => {
    const original = createEmptyCharacterCard();
    original.data.name = "测试角色";
    original.data.description = "这是描述";
    original.data.personality = "这是性格";
    original.data.scenario = "这是场景";
    original.data.first_mes = "你好！欢迎来到我的世界。";
    original.data.mes_example = "<START>\n{{user}}: 你好\n{{char}}: 你好呀\n";
    original.data.creator_notes = "测试备注";
    original.data.system_prompt = "你是一个测试角色";
    original.data.post_history_instructions = "保持角色";
    original.data.alternate_greetings = ["备选1", "备选2"];
    original.data.tags = ["测试", "角色"];
    original.data.creator = "测试者";
    original.data.character_version = "1.5";
    original.data.extensions = {
      "test_app/v1": { key: "value", nested: { data: true } },
    };

    // 导出为 JSON
    const json = exportToJSON(original);

    // 重新解析
    const parsed = JSON.parse(json);

    // 校验
    const imported = { ...parsed };

    // 比较
    expect(areCardsEqual(original, imported)).toBe(true);
  });
});

describe("mergeCharacterData", () => {
  it("应保留现有 extensions 中的未知字段", () => {
    const existing = createEmptyCharacterData();
    existing.extensions = {
      "old_app/v1": "old_data",
      "shared_key": "old_value",
    };

    const imported = createEmptyCharacterData();
    imported.name = "新角色";
    imported.extensions = {
      "new_app/v1": "new_data",
      "shared_key": "new_value",
    };

    const merged = mergeCharacterData(existing, imported);

    // 新数据应覆盖
    expect(merged.name).toBe("新角色");

    // 旧 extensions 的未知字段应保留
    expect(merged.extensions["old_app/v1"]).toBe("old_data");

    // 相同 key 旧值被新值覆盖
    expect(merged.extensions["shared_key"]).toBe("new_value");

    // 新字段应添加
    expect(merged.extensions["new_app/v1"]).toBe("new_data");
  });
});

describe("cloneCharacterCard", () => {
  it("深拷贝应生成独立的对象", () => {
    const original = createEmptyCharacterCard();
    original.data.name = "原件";
    original.data.tags = ["tag1"];

    const clone = cloneCharacterCard(original);

    // 内容相同
    expect(clone.data.name).toBe("原件");
    expect(clone.data.tags).toEqual(["tag1"]);

    // 修改 clone 不影响 original
    clone.data.name = "副本";
    clone.data.tags.push("tag2");

    expect(original.data.name).toBe("原件");
    expect(original.data.tags).toEqual(["tag1"]);
  });
});
