// @vitest-environment jsdom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppShell } from "@/components/ui/AppShell";

describe("responsive application shell", () => {
  it("exposes one drawer and touch-accessible bottom shortcuts", () => {
    const html = renderToStaticMarkup(
      <AppShell activeView="prose" onNavigate={() => undefined} projectName="长篇项目" draftVersion={7}
        hasDraft density="comfortable" pageTitle="正文写作" pageSubtitle="移动编辑"
        onlineStatus="offline" saveStatus="saved" syncStatus="pending">
        <div>正文</div>
      </AppShell>,
    );
    expect(html).toContain("mobile-bottom-navigation");
    expect(html).toContain("aria-label=\"应用导航\"");
    expect(html).toContain("离线");
    expect(html).toContain("待同步");
    expect(html.match(/aria-current="page"/g)?.length).toBeGreaterThanOrEqual(1);
  });
});

