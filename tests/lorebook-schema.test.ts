import { describe, expect, it } from "vitest";
import { ActivationRuleSchema, createEmptyLorebook, createEmptyLorebookEntry, LorebookSchema } from "@/domain/lorebook";

describe("内部 Lorebook Schema", () => {
  it("创建与校验独立于外部格式的空世界书", () => {
    const book = createEmptyLorebook("测试世界");
    book.entries.push(createEmptyLorebookEntry());
    expect(LorebookSchema.safeParse(book).success).toBe(true);
    expect(book.metadata.sourceFormat).toBe("internal");
    expect(book.entries[0].formatSpecificData).toEqual({ characterBook: {}, sillyTavern: {} });
  });

  it("拒绝没有稳定内部 ID 的条目", () => {
    const book = createEmptyLorebook();
    const entry = { ...createEmptyLorebookEntry(), id: "" };
    expect(LorebookSchema.safeParse({ ...book, entries: [entry] }).success).toBe(false);
  });

  it("为激活规则填充确定默认值", () => {
    expect(ActivationRuleSchema.parse({})).toMatchObject({ primaryKeys: [], constant: false, probability: 100, secondaryLogic: "and_any" });
  });
});

