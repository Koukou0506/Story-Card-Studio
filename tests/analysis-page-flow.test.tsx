import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { PlotAnalysisWorkspace } from "@/components/PlotAnalysisWorkspace";
import { createEmptyCharacterCard } from "@/domain/character-card";

describe("剧情分析页面流程", () => {
  it("空工作区可以从一级功能区创建分析项目", async () => {
    const container = document.createElement("div"); const onAdd = vi.fn(); const root = createRoot(container);
    await act(async () => root.render(<PlotAnalysisWorkspace projects={[]} selected={null} characterCard={createEmptyCharacterCard()} lorebooks={[]}
      provider="mock" model="mock-model" onAdd={onAdd} onUpdate={vi.fn()} onDelete={vi.fn()} onSelect={vi.fn()} onSaveReport={vi.fn()}
      onAddNote={vi.fn()} onProvider={vi.fn()} />));
    const button = [...container.querySelectorAll("button")].find(item => item.textContent?.includes("新建剧情分析"));
    expect(button).toBeDefined(); await act(async () => button!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onAdd).toHaveBeenCalledOnce(); expect(onAdd.mock.calls[0][0].input.proposedPlot).toBe(""); root.unmount();
  });
});

