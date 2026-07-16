// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { createEmptyProjectDraft } from "@/domain/project-draft";
import { BrowserProjectStorage, LEGACY_DRAFT_KEY } from "@/storage/browser-storage-adapter";
import { StorageConflictError } from "@/storage/types";

describe("BrowserProjectStorage", () => {
  beforeEach(() => localStorage.clear());

  it("migrates the legacy A1-C1 draft without deleting the recovery source", async () => {
    const legacy = createEmptyProjectDraft();
    legacy.projectInput.projectName = "旧项目";
    localStorage.setItem(LEGACY_DRAFT_KEY, JSON.stringify(legacy));
    const storage = new BrowserProjectStorage(localStorage, null);

    const migrated = await storage.migrateLegacyProject();
    expect(migrated?.draft.projectInput.projectName).toBe("旧项目");
    expect(localStorage.getItem(LEGACY_DRAFT_KEY)).not.toBeNull();
    expect((await storage.healthCheck()).mode).toBe("localstorage");
  });

  it("uses optimistic versions in local fallback mode", async () => {
    const storage = new BrowserProjectStorage(localStorage, null);
    const created = await storage.createProject({
      id: "local", name: "本机", draft: createEmptyProjectDraft(), version: 1,
      modifiedAt: new Date().toISOString(), origin: "local",
    });
    await storage.updateProject("local", createEmptyProjectDraft(), created.version);
    await expect(storage.updateProject("local", createEmptyProjectDraft(), created.version)).rejects.toBeInstanceOf(StorageConflictError);
  });
});

