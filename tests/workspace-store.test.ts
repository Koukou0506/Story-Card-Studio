import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createEmptyProjectDraft } from "@/domain/project-draft";
import { createProjectRecord, StorageConflictError } from "@/storage";
import { ServerFileWorkspaceStore } from "@/server/workspace-store";

const dirs: string[] = [];
afterEach(async () => Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))));

describe("ServerFileWorkspaceStore", () => {
  it("persists records atomically and enforces expectedVersion", async () => {
    const dir = await mkdtemp(join(tmpdir(), "story-card-workspace-"));
    dirs.push(dir);
    const store = new ServerFileWorkspaceStore(dir);
    const created = await store.createProject(createProjectRecord("shared", createEmptyProjectDraft()));
    const updated = await store.updateProject("shared", createEmptyProjectDraft(), created.version);

    expect(updated.version).toBe(2);
    await expect(store.updateProject("shared", createEmptyProjectDraft(), 1)).rejects.toBeInstanceOf(StorageConflictError);
    expect(JSON.parse(await readFile(join(dir, "shared.json"), "utf8")).version).toBe(2);
  });

  it("rejects unsafe project identifiers", async () => {
    const dir = await mkdtemp(join(tmpdir(), "story-card-workspace-"));
    dirs.push(dir);
    const store = new ServerFileWorkspaceStore(dir);
    await expect(store.readProject("../secret")).rejects.toThrow(/项目 ID/);
  });
});

