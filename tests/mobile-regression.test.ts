import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { NAV_GROUPS } from "@/components/ui/navigation";

describe("mobile regression contracts", () => {
  it("keeps every top-level workspace reachable through the shared navigation", () => {
    const ids = NAV_GROUPS.flatMap((group) => group.items.map((item) => item.id));
    expect(ids).toEqual(["home", "input", "character", "lorebook", "analysis", "planning", "prose", "style-risk", "continuity", "visual", "assistant", "setting-change", "asset-library", "document-ingestion", "import-export", "settings"]);
  });

  it("includes the required responsive widths, safe areas and prose pane switching", async () => {
    const css = await readFile("src/app/globals.css", "utf8");
    const prose = await readFile("src/components/ProseWorkspace.tsx", "utf8");
    const shell = await readFile("src/components/ui/AppShell.tsx", "utf8");
    expect(css).toContain("@media (max-width: 768px)");
    expect(css).toContain("env(safe-area-inset-bottom)");
    expect(css).toContain("100dvh");
    expect(css).toContain("min-height: 44px");
    expect(css).toContain('.app-shell[data-density="compact"] .navigation-item { min-height: 44px');
    expect(css).toContain(".context-back { min-width: 44px; min-height: 44px; }");
    expect(prose).toContain("prose-mobile-switcher");
    expect(prose).toContain("全屏编辑");
    expect(shell).toContain("inert={drawerMode && !sidebarOpen");
  });

  it("does not make drag-and-drop the only sorting path", async () => {
    const sources = await Promise.all(["LorebookWorkspace", "StoryPlanningWorkspace", "ChapterPlanningWorkspace"].map((name) => readFile(`src/components/${name}.tsx`, "utf8")));
    expect(sources.join("\n")).not.toContain("draggable=");
    expect(sources.join("\n")).toContain("上移");
    expect(sources.join("\n")).toContain("下移");
  });
});
