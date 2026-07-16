import { describe, expect, it } from "vitest";
import { createEmptyProjectDraft } from "@/domain/project-draft";
import {
  MemoryProjectStorage,
  StorageConflictError,
  createConflictProjectCopy,
  createProjectRecord,
} from "@/storage";

describe("ProjectStorageAdapter", () => {
  it("creates, reads, lists and updates a versioned project", async () => {
    const storage = new MemoryProjectStorage();
    const draft = createEmptyProjectDraft();
    draft.projectInput.projectName = "移动端项目";
    const created = await storage.createProject(createProjectRecord("project-a", draft));

    expect(created.version).toBe(1);
    expect((await storage.listProjects())[0]?.name).toBe("移动端项目");

    draft.projectInput.originalIdea = "离线修改";
    const updated = await storage.updateProject("project-a", draft, created.version);
    expect(updated.version).toBe(2);
    expect((await storage.readProject("project-a"))?.draft.projectInput.originalIdea).toBe("离线修改");
  });

  it("rejects stale writes instead of last-write-wins", async () => {
    const storage = new MemoryProjectStorage();
    const created = await storage.createProject(createProjectRecord("project-a", createEmptyProjectDraft()));
    await storage.updateProject("project-a", createEmptyProjectDraft(), created.version);

    await expect(storage.updateProject("project-a", createEmptyProjectDraft(), created.version))
      .rejects.toBeInstanceOf(StorageConflictError);
  });

  it("preserves a stale local draft as an explicit conflict copy", () => {
    const record = createProjectRecord("project-a", createEmptyProjectDraft());
    const copy = createConflictProjectCopy(record, new Date("2026-07-14T08:00:00.000Z"));
    expect(copy.id).not.toBe(record.id);
    expect(copy.name).toContain("冲突副本");
    expect(copy.origin).toBe("conflict_copy");
    expect(copy.version).toBe(1);
  });
});

