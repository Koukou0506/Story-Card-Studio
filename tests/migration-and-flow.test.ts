import { describe, expect, it } from "vitest";
import { createEmptyCharacterCard } from "@/domain/character-card";
import { createEmptyProjectInput } from "@/domain/project-input";
import { migrateProjectDraft, PROJECT_DATA_VERSION } from "@/domain/project-draft";
import { MockProvider } from "@/providers/mock";
import { generateLorebook } from "@/services/lorebook-generator";
import { exportStandaloneWorldInfo, importLorebookJSON } from "@/services/lorebook-io";

describe("A1 数据迁移", () => {
  it("保留 A1 项目输入、角色卡和未知扩展", () => {
    const card = createEmptyCharacterCard(); card.data.name = "旧角色"; card.data.extensions = { legacy: { keep: true } };
    const legacy = { projectInput: { ...createEmptyProjectInput(), originalIdea: "旧想法" }, characterData: card.data, characterCard: card, savedAt: "2026-01-01T00:00:00.000Z" };
    const migrated = migrateProjectDraft(legacy);
    expect(migrated.dataVersion).toBe(PROJECT_DATA_VERSION);
    expect(migrated.projectInput.originalIdea).toBe("旧想法");
    expect(migrated.characterData.extensions.legacy).toEqual({ keep: true });
    expect(migrated.lorebooks).toEqual([]);
    expect(migrated.migrationError).toBeNull();
  });

  it("迁移失败不丢弃原始数据", () => {
    const raw = ["broken", { secretDraft: true }];
    const migrated = migrateProjectDraft(raw);
    expect(migrated.migrationError).toContain("迁移失败");
    expect(migrated.recoveryData).toEqual(raw);
  });
});

describe("世界书生成到导出核心流程", () => {
  it("Mock Provider 生成内部草稿，导出并重新导入", async () => {
    const result = await generateLorebook({ originalIdea: "江南古风世界", creationMode: "original", characterData: null,
      supplementalSetting: "", scope: "地点和规则", avoidContent: "", mode: "full", existingEntries: [] },
      { provider: new MockProvider(), model: "mock-model", timeoutMs: 3000, maxRetries: 1 });
    expect(result.lorebook.entries.length).toBeGreaterThan(0);
    const exported = exportStandaloneWorldInfo(result.lorebook);
    const imported = importLorebookJSON(exported.json, { name: result.lorebook.name });
    expect(imported.lorebook.entries.map(entry => entry.content)).toEqual(result.lorebook.entries.map(entry => entry.content));
  });
});

