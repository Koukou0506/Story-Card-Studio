import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { ChapterPlanningWorkspace } from "@/components/ChapterPlanningWorkspace";
import { createEmptyCharacterCard } from "@/domain/character-card";
import { createEmptyStoryPlan } from "@/domain/story-planning";

describe("B2 planning page flow", () => {
  it("creates a B2 project from the B1 workspace", async () => {
    const container = document.createElement("div");
    const onAdd = vi.fn();
    const root = createRoot(container);
    await act(async () => root.render(<ChapterPlanningWorkspace
      projects={[]}
      selected={null}
      storyPlan={createEmptyStoryPlan()}
      card={createEmptyCharacterCard()}
      books={[]}
      analyses={[]}
      provider="mock"
      model="mock-model"
      onAdd={onAdd}
      onUpdate={vi.fn()}
      onDelete={vi.fn()}
      onSelect={vi.fn()}
      onCreateAnalysis={vi.fn()}
    />));
    const button = [...container.querySelectorAll("button")].find((item) => item.textContent?.includes("B2"));
    expect(button).toBeDefined();
    await act(async () => button!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onAdd).toHaveBeenCalledOnce();
    expect(onAdd.mock.calls[0][0].b1PlanId).toBeTruthy();
    root.unmount();
  });
});
