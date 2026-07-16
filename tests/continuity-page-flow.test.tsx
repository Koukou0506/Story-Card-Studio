import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { ContinuityCenter } from "@/components/ContinuityCenter";
import { createEmptyProjectDraft } from "@/domain/project-draft";

describe("C1 continuity page flow", () => {
  it("creates a continuity project from the current A1-B3 project", async () => {
    const container = document.createElement("div"); const root = createRoot(container); const onAdd = vi.fn(); const draft = createEmptyProjectDraft(); draft.characterData.name = "柳如烟"; draft.characterCard.data.name = "柳如烟"; draft.characterCard.data.description = "柳家继承人";
    await act(async () => root.render(<ContinuityCenter draft={draft} projects={[]} selected={null} onAdd={onAdd} onUpdate={vi.fn()} onDelete={vi.fn()} onSelect={vi.fn()} />));
    const create = [...container.querySelectorAll("button")].find((item) => item.textContent?.includes("从当前项目建立")); expect(create).toBeDefined();
    await act(async () => create!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onAdd).toHaveBeenCalledOnce(); expect(onAdd.mock.calls[0][0].canonLedger.facts[0].status).toBe("candidate"); expect(onAdd.mock.calls[0][0].name).toContain("连续性"); root.unmount();
  });

  it("loads the complete Mock C1 flow offline", async () => {
    const container = document.createElement("div"); const root = createRoot(container); const onAdd = vi.fn(); const draft = createEmptyProjectDraft();
    await act(async () => root.render(<ContinuityCenter draft={draft} projects={[]} selected={null} onAdd={onAdd} onUpdate={vi.fn()} onDelete={vi.fn()} onSelect={vi.fn()} />));
    const mock = [...container.querySelectorAll("button")].find((item) => item.textContent?.includes("加载 Mock C1")); await act(async () => mock!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onAdd.mock.calls[0][0].healthReports).toHaveLength(1); expect(onAdd.mock.calls[0][0].contextPackages).toHaveLength(1); root.unmount();
  });
});
