import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { ProseWorkspace } from "@/components/ProseWorkspace";
import { createEmptyCharacterCard } from "@/domain/character-card";
import { createMockChapterPlanningProject } from "@/services/chapter-planning-mock";

describe("B3 prose page flow", () => {
  it("creates a Manuscript from the selected B2 project", async () => {
    const container = document.createElement("div"); const root = createRoot(container); const onAdd = vi.fn(); const b2 = createMockChapterPlanningProject();
    await act(async () => root.render(<ProseWorkspace manuscripts={[]} selected={null} chapterPlanningProjects={[b2]} selectedChapterPlanning={b2} storyPlans={[]} card={createEmptyCharacterCard()} books={[]} analyses={[]} provider="mock" model="mock-model" onAdd={onAdd} onUpdate={vi.fn()} onDelete={vi.fn()} onSelect={vi.fn()} onCreateAnalysis={vi.fn()} onUpdateChapterPlanning={vi.fn()} onAddLorebook={vi.fn()} onUpdateLorebook={vi.fn()} onAddCharacterNote={vi.fn()} />));
    const button = [...container.querySelectorAll("button")].find((item) => item.textContent?.includes("从当前 B2")); expect(button).toBeDefined();
    await act(async () => button!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onAdd).toHaveBeenCalledOnce(); expect(onAdd.mock.calls[0][0].chapterDrafts[0].sceneDrafts.length).toBeGreaterThan(0); root.unmount();
  });
});
