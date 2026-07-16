import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { ProjectHome } from "@/components/ProjectHome";
import { createEmptyProjectDraft } from "@/domain/project-draft";
import { createEmptyLorebook } from "@/domain/lorebook";

describe("Phase C2.0 project home", () => {
  it("guides a new project to the original idea without calling a provider", async () => {
    const draft = createEmptyProjectDraft();
    const onNavigate = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => root.render(<ProjectHome draft={draft} onNavigate={onNavigate} />));

    expect(container.textContent).toContain("开始你的创作项目");
    expect(container.textContent).toContain("数据保存在当前浏览器");
    const action = [...container.querySelectorAll("button")].find((item) => item.textContent?.includes("写下创意"));
    await act(async () => action?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onNavigate).toHaveBeenCalledWith("input");

    root.unmount();
  });

  it("summarizes populated project data and continues the most relevant work", async () => {
    const draft = createEmptyProjectDraft();
    draft.projectInput.projectName = "雾港计划";
    draft.projectInput.originalIdea = "一名调查员追查港口旧案。";
    draft.characterData.name = "林澈";
    draft.characterCard.data.name = "林澈";
    draft.lorebooks = [createEmptyLorebook("雾港世界书")];
    const onNavigate = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => root.render(<ProjectHome draft={draft} onNavigate={onNavigate} />));

    expect(container.textContent).toContain("雾港计划");
    expect(container.textContent).toContain("林澈");
    expect(container.textContent).toContain("1 本世界书");
    const action = [...container.querySelectorAll("button")].find((item) => item.textContent?.includes("继续编辑角色卡"));
    await act(async () => action?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onNavigate).toHaveBeenCalledWith("character");

    root.unmount();
  });
});
