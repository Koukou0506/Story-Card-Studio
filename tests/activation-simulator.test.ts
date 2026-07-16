import { describe, expect, it } from "vitest";
import { createEmptyLorebook, createEmptyLorebookEntry } from "@/domain/lorebook";
import { simulateActivation } from "@/services/activation-simulator";

function bookWithEntry() {
  const book = createEmptyLorebook();
  const entry = createEmptyLorebookEntry();
  entry.name = "古玉"; entry.content = "古玉相关设定"; entry.activation.primaryKeys = ["古玉"];
  book.entries = [entry]; return { book, entry };
}

describe("激活模拟器", () => {
  it("普通关键词默认不区分大小写", () => {
    const { book, entry } = bookWithEntry(); entry.activation.primaryKeys = ["Jade"];
    expect(simulateActivation(book, "the jade glows").activated[0].entryId).toBe(entry.id);
  });

  it("支持区分大小写", () => {
    const { book, entry } = bookWithEntry(); entry.activation.primaryKeys = ["Jade"]; entry.activation.caseSensitive = true;
    expect(simulateActivation(book, "jade").activated).toHaveLength(0);
  });

  it("支持 JavaScript 风格正则关键词", () => {
    const { book } = bookWithEntry(); book.entries[0].activation.primaryKeys = ["/古玉(?:发光)?/i"];
    expect(simulateActivation(book, "古玉发光了").activated).toHaveLength(1);
  });

  it("支持 AND ALL 次级关键词", () => {
    const { book, entry } = bookWithEntry();
    entry.activation.selective = true; entry.activation.secondaryLogic = "and_all"; entry.activation.secondaryKeys = ["密室", "祖母"];
    expect(simulateActivation(book, "古玉藏在密室").activated).toHaveLength(0);
    expect(simulateActivation(book, "祖母把古玉藏在密室").activated).toHaveLength(1);
  });

  it("常驻条目无需关键词", () => {
    const { book, entry } = bookWithEntry(); entry.activation.primaryKeys = []; entry.activation.constant = true;
    expect(simulateActivation(book, "无关文本").activated[0].constant).toBe(true);
  });

  it("禁用条目不会激活", () => {
    const { book, entry } = bookWithEntry(); entry.enabled = false;
    expect(simulateActivation(book, "古玉").activated).toHaveLength(0);
  });
});

