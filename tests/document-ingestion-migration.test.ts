import { describe, expect, it } from "vitest";
import { createEmptyProjectDraft, migrateProjectDraft, PROJECT_DATA_VERSION } from "@/domain/project-draft";

describe("ProjectDraft v8 migration", () => {
  it("preserves all v7 data and adds safe ingestion defaults", () => {
    const current = createEmptyProjectDraft();
    const v7 = {
      ...current,
      dataVersion: 7,
      projectNotes: ["保留旧备注"],
      documentIngestions: undefined,
      selectedDocumentIngestionId: undefined,
    };

    const migrated = migrateProjectDraft(v7);

    expect(PROJECT_DATA_VERSION).toBe(9);
    expect(migrated.dataVersion).toBe(9);
    expect(migrated.projectNotes).toEqual(["保留旧备注"]);
    expect(migrated.documentIngestions).toEqual([]);
    expect(migrated.selectedDocumentIngestionId).toBeNull();
    expect(migrated.migrationError).toBeNull();
  });

  it("retains malformed legacy input as recovery data", () => {
    const raw = { dataVersion: 7, projectInput: "broken", privateLegacyField: "keep-me" };
    const migrated = migrateProjectDraft(raw);
    expect(migrated.migrationError).toContain("迁移失败");
    expect(migrated.recoveryData).toEqual(raw);
  });
});
