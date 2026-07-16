// @vitest-environment jsdom
import React from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { createEmptyProjectDraft } from "@/domain/project-draft";
import { useProjectStorage } from "@/hooks/useProjectStorage";
import { LEGACY_DRAFT_KEY } from "@/storage/browser-storage-adapter";

function StorageProbe() {
  const fallback = createEmptyProjectDraft();
  fallback.projectInput.projectName = "服务端默认项目";
  const { draft } = useProjectStorage(fallback);
  return <span>{draft.projectInput.projectName}</span>;
}

describe("project storage hydration", () => {
  beforeEach(() => localStorage.clear());

  it("keeps the first client render identical to SSR even when a legacy draft exists", () => {
    const legacy = createEmptyProjectDraft();
    legacy.projectInput.projectName = "手机本地草稿";
    localStorage.setItem(LEGACY_DRAFT_KEY, JSON.stringify(legacy));

    const markup = renderToString(<StorageProbe />);

    expect(markup).toContain("服务端默认项目");
    expect(markup).not.toContain("手机本地草稿");
  });
});
