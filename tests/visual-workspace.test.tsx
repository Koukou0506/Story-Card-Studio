import { createRoot } from "react-dom/client";
import { act } from "react";
import { describe, expect, it } from "vitest";
import { createEmptyProjectDraft } from "@/domain/project-draft";
import { createMockContinuityProject } from "@/services/continuity-mock";
import { VisualWorkspace } from "@/components/VisualWorkspace";

describe("可视化工作台", () => {
  it("offers every view, accessible list fallback, filters and mobile single-view mode without development codes", () => {
    const draft = createEmptyProjectDraft(); const continuity = createMockContinuityProject();
    draft.continuityProjects = [continuity]; draft.selectedContinuityProjectId = continuity.id;
    const container = document.createElement("div"); const root = createRoot(container);
    act(() => root.render(<VisualWorkspace draft={draft} onNavigate={() => undefined} />));
    expect(container.textContent).toContain("可视化工作台");
    for (const label of ["概览", "关系图", "时间线", "剧情线", "伏笔", "知情矩阵", "章节节奏", "角色出场"]) expect(container.textContent).toContain(label);
    act(() => (Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "关系图") as HTMLButtonElement).click());
    expect(container.querySelector("[aria-label='可访问列表视图']")).not.toBeNull();
    expect(container.querySelector("[data-mobile-single-view='true']")).not.toBeNull();
    expect(container.textContent).not.toMatch(/\b(?:A[123]|B[123]|C1|C2\.\d|D2)\b/);
    act(() => root.unmount());
  });
});
