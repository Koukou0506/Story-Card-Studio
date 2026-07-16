import { describe, expect, it } from "vitest";
import cardFixture from "./fixtures/character-card-with-book.json";
import minimalWorld from "./fixtures/minimal-world-info.json";
import advancedWorld from "./fixtures/advanced-world-info.json";
import unknownWorld from "./fixtures/unknown-world-info.json";
import invalidWorld from "./fixtures/invalid-world-info.json";
import lossyWorld from "./fixtures/lossy-world-info.json";
import { CharacterCardV2Schema } from "@/domain/character-card";
import { CharacterBookAdapter, SillyTavernWorldInfoAdapter } from "@/adapters";
import { detectLorebookFormat, previewLorebookMerge, readCharacterBook, writeCharacterBook } from "@/services/lorebook-io";

describe("Character Book Adapter", () => {
  const adapter = new CharacterBookAdapter();

  it("导入并映射 Character Card V2 data.character_book", () => {
    const card = CharacterCardV2Schema.parse(cardFixture);
    const result = readCharacterBook(card);
    expect(result.lorebook.name).toBe("柳如烟的世界书");
    expect(result.lorebook.scanDepth).toBe(4);
    expect(result.lorebook.entries[0]).toMatchObject({ externalId: 3, content: "临水镇位于江南水网之间。", insertionOrder: 100 });
    expect(result.lorebook.entries[0].activation.primaryKeys).toEqual(["临水镇"]);
  });

  it("导出并通过 Character Book Schema", () => {
    const card = CharacterCardV2Schema.parse(cardFixture);
    const imported = readCharacterBook(card).lorebook;
    const result = adapter.export(imported);
    expect(adapter.validate(result.data).success).toBe(true);
    expect(result.data.entries[0].keys).toEqual(["临水镇"]);
  });

  it("round-trip 保留未知 book、entry 与 extensions 字段", () => {
    const card = CharacterCardV2Schema.parse(cardFixture);
    const book = readCharacterBook(card).lorebook;
    book.entries[0].content = "编辑后的正文";
    const result = adapter.export(book).data as Record<string, unknown>;
    expect(result.unknownBookField).toBe("preserve");
    const entry = (result.entries as Array<Record<string, unknown>>)[0];
    expect(entry.unknownEntryField).toEqual([1, 2, 3]);
    expect((entry.extensions as Record<string, unknown>).entryUnknown).toEqual({ keep: true });
    expect(entry.content).toBe("编辑后的正文");
  });

  it("写回角色卡不破坏角色卡未知 extensions 和根字段", () => {
    const card = CharacterCardV2Schema.parse(cardFixture);
    const book = readCharacterBook(card).lorebook;
    const written = writeCharacterBook(card, book).card as unknown as Record<string, unknown>;
    expect(written.unknownRoot).toBe("keep");
    expect(((written.data as Record<string, unknown>).extensions as Record<string, unknown>).cardUnknown).toEqual({ keep: true });
  });
});

describe("SillyTavern Standalone World Info Adapter", () => {
  const adapter = new SillyTavernWorldInfoAdapter();

  it("识别并导入当前独立 entries 对象结构", () => {
    expect(detectLorebookFormat(minimalWorld)).toBe("sillytavern_world_info");
    const result = adapter.import(minimalWorld, { name: "最小世界书" });
    expect(result.lorebook.entries).toHaveLength(1);
    expect(result.lorebook.entries[0].activation.primaryKeys).toEqual(["临水镇"]);
  });

  it("映射高级字段", () => {
    const entry = adapter.import(advancedWorld).lorebook.entries[0];
    expect(entry.position).toBe("at_depth");
    expect(entry.role).toBe("user");
    expect(entry.activation).toMatchObject({ secondaryLogic: "and_all", probability: 75, scanDepth: 6, sticky: 3, cooldown: 2, delay: 1, recursive: false });
  });

  it("导出可被本应用重新导入", () => {
    const first = adapter.import(advancedWorld).lorebook;
    const exported = adapter.export(first);
    expect(adapter.validate(exported.data).success).toBe(true);
    const second = adapter.import(exported.data).lorebook;
    expect(second.entries[0].activation.primaryKeys).toEqual(first.entries[0].activation.primaryKeys);
    expect(second.entries[0].position).toBe("at_depth");
  });

  it("编辑正文后 round-trip 保留未知根与条目字段", () => {
    const book = adapter.import(unknownWorld).lorebook;
    book.entries[0].content = "修改正文但保留未知字段。";
    const exported = adapter.export(book).data as unknown as Record<string, unknown>;
    expect(exported.mysteryRootField).toEqual({ version: 9 });
    expect(((exported.entries as Record<string, Record<string, unknown>>)["7"]).mysteryEntryField).toEqual({ nested: true });
  });

  it("拒绝格式错误文件", () => expect(adapter.validate(invalidWorld).success).toBe(false));

  it("导出 Character Book 时对不可原生表达的位置给出警告", () => {
    const book = adapter.import(lossyWorld).lorebook;
    const warnings = new CharacterBookAdapter().export(book).warnings;
    expect(warnings.some(item => item.code === "character_book_position_extension" && item.lossy)).toBe(true);
  });
});

describe("世界书合并", () => {
  it("相同条目正文冲突时保留原文并显示冲突", () => {
    const adapter = new SillyTavernWorldInfoAdapter();
    const existing = adapter.import(minimalWorld).lorebook;
    const incoming = structuredClone(existing);
    incoming.entries[0].content = "冲突的新正文";
    const preview = previewLorebookMerge(existing, incoming);
    expect(preview.conflicts).toHaveLength(1);
    expect(preview.merged.entries[0].content).toBe(existing.entries[0].content);
  });
});

