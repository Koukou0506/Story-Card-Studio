"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectDraft } from "@/domain/project-draft";
import { BrowserProjectStorage, LEGACY_DRAFT_KEY } from "@/storage/browser-storage-adapter";
import { StorageConflictError, createConflictProjectCopy, createProjectRecord } from "@/storage/types";

export type LocalSaveStatus = "saved" | "saving" | "error" | "conflict";

export function useProjectStorage(fallback: ProjectDraft, projectId = "default") {
  const fallbackRef = useRef(fallback);
  // The first client render must match SSR. Browser data is loaded after hydration.
  const [draft, setDraftState] = useState<ProjectDraft>(fallbackRef.current);
  const draftRef = useRef(draft);
  const changedSinceMountRef = useRef(false);
  const [storageStatus, setStorageStatus] = useState<LocalSaveStatus>("saved");
  const [storageVersion, setStorageVersion] = useState(1);
  const [conflictCopyId, setConflictCopyId] = useState<string | null>(null);
  const adapterRef = useRef<BrowserProjectStorage | null>(null);
  const versionRef = useRef(1);
  const pendingRef = useRef<ProjectDraft | null>(null);
  const savingRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  if (typeof window !== "undefined" && !adapterRef.current) adapterRef.current = new BrowserProjectStorage();

  const flushStorage = useCallback(async () => {
    const adapter = adapterRef.current;
    if (!adapter || savingRef.current) return;
    savingRef.current = true;
    try {
      while (pendingRef.current) {
        const value = pendingRef.current;
        pendingRef.current = null;
        setStorageStatus("saving");
        try { window.localStorage.setItem(LEGACY_DRAFT_KEY, JSON.stringify(value)); } catch { /* IndexedDB remains primary; UI reports hard failures below */ }
        const current = await adapter.readProject(projectId);
        const record = current
          ? await adapter.updateProject(projectId, value, versionRef.current)
          : await adapter.createProject(createProjectRecord(projectId, value));
        versionRef.current = record.version;
        setStorageVersion(record.version);
        setStorageStatus("saved");
      }
    } catch (error) {
      if (error instanceof StorageConflictError) {
        const local = createProjectRecord(projectId, pendingRef.current ?? draftRef.current);
        const copy = createConflictProjectCopy({ ...local, version: versionRef.current });
        try { await adapter.createProject(copy); setConflictCopyId(copy.id); } catch { /* localStorage mirror still preserves the draft */ }
        setStorageStatus("conflict");
      } else setStorageStatus("error");
    } finally { savingRef.current = false; }
  }, [projectId]);

  const queueSave = useCallback((value: ProjectDraft) => {
    changedSinceMountRef.current = true;
    draftRef.current = value;
    pendingRef.current = value;
    setStorageStatus("saving");
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => void flushStorage(), 350);
  }, [flushStorage]);

  const setDraft = useCallback((value: ProjectDraft | ((previous: ProjectDraft) => ProjectDraft)) => {
    setDraftState((previous) => {
      const next = value instanceof Function ? value(previous) : value;
      queueSave(next);
      return next;
    });
  }, [queueSave]);

  const replaceDraft = useCallback((value: ProjectDraft) => setDraft(value), [setDraft]);

  const clearDraft = useCallback(() => {
    const next = fallbackRef.current;
    draftRef.current = next;
    setDraftState(next);
    pendingRef.current = null;
    window.localStorage.removeItem(LEGACY_DRAFT_KEY);
    const adapter = adapterRef.current;
    if (adapter) void adapter.readProject(projectId).then((record) => record ? adapter.deleteProject(projectId, record.version) : undefined).catch(() => setStorageStatus("error"));
    versionRef.current = 1; setStorageVersion(1); setStorageStatus("saved");
  }, [projectId]);

  useEffect(() => {
    let active = true;
    const adapter = adapterRef.current;
    if (!adapter) return;
    void adapter.migrateLegacyProject(projectId).then((record) => {
      if (!active || !record) return;
      versionRef.current = record.version; setStorageVersion(record.version);
      setDraftState((current) => {
        const next = changedSinceMountRef.current ? current : record.draft;
        draftRef.current = next;
        return next;
      });
    }).catch(() => setStorageStatus("error"));
    const persist = () => void flushStorage();
    const visibility = () => { if (document.visibilityState === "hidden") persist(); };
    window.addEventListener("pagehide", persist); document.addEventListener("visibilitychange", visibility);
    return () => {
      active = false;
      window.removeEventListener("pagehide", persist); document.removeEventListener("visibilitychange", visibility);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      void flushStorage();
    };
  }, [flushStorage, projectId]);

  return { draft, setDraft, replaceDraft, clearDraft, storageStatus, storageVersion, conflictCopyId, flushStorage };
}
