import { describe, expect, it } from "vitest";
import { createEmptyLorebook, createEmptyLorebookEntry } from "@/domain/lorebook";
import { runLorebookQualityChecks } from "@/services/lorebook-quality";

describe("世界书质量检查", () => {
  it("发现空正文、缺少关键词、宽泛关键词与无效正则", () => {
    const book = createEmptyLorebook();
    const empty = createEmptyLorebookEntry(); empty.name = ""; empty.content = "";
    const broad = createEmptyLorebookEntry(); broad.name = "宽泛"; broad.content = "完整正文"; broad.activation.primaryKeys = ["人", "/[/"];
    book.entries = [empty, broad];
    const codes = runLorebookQualityChecks(book).issues.map(issue => issue.code);
    expect(codes).toEqual(expect.arrayContaining(["empty_entry", "missing_primary_keys", "broad_keyword", "invalid_regex"]));
  });

  it("发现重复关键词与次级规则不完整", () => {
    const book = createEmptyLorebook();
    const a = createEmptyLorebookEntry(); a.name = "A"; a.content = "A 的完整知识正文。"; a.activation.primaryKeys = ["共同关键词"];
    const b = createEmptyLorebookEntry(); b.name = "B"; b.content = "B 的另一段完整知识。"; b.activation.primaryKeys = ["共同关键词"]; b.activation.selective = true;
    book.entries = [a, b];
    const codes = runLorebookQualityChecks(book).issues.map(issue => issue.code);
    expect(codes).toEqual(expect.arrayContaining(["duplicate_keyword", "incomplete_secondary"]));
  });

  it("发现明确矛盾、关系和年龄冲突", () => {
    const book = createEmptyLorebook();
    const a = createEmptyLorebookEntry(); a.name = "设定甲"; a.activation.primaryKeys = ["甲"]; a.content = "柳如烟是柳家继承人。张三是李四的师父。柳如烟现年20岁。";
    const b = createEmptyLorebookEntry(); b.name = "设定乙"; b.activation.primaryKeys = ["乙"]; b.content = "柳如烟不是柳家继承人。张三是李四的仇敌。柳如烟现年25岁。";
    book.entries = [a, b];
    const codes = runLorebookQualityChecks(book).issues.map(issue => issue.code);
    expect(codes).toEqual(expect.arrayContaining(["setting_contradiction", "relationship_conflict", "timeline_age_conflict"]));
  });

  it("报告目标格式不可原生表达的字段", () => {
    const book = createEmptyLorebook(); const entry = createEmptyLorebookEntry();
    entry.name = "深度"; entry.content = "深度注入规则"; entry.activation.primaryKeys = ["深度"]; entry.position = "at_depth"; book.entries = [entry];
    expect(runLorebookQualityChecks(book, { targetFormat: "character_book_v2" }).issues.some(issue => issue.code === "character_book_position_extension")).toBe(true);
  });
});

