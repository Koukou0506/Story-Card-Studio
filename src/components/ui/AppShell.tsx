"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { NAV_GROUPS, type AppView } from "./navigation";

interface AppShellProps {
  activeView: AppView;
  onNavigate: (view: AppView) => void;
  projectName: string;
  draftVersion: number;
  hasDraft: boolean;
  density: "comfortable" | "compact";
  pageTitle: string;
  pageSubtitle: string;
  pageActions?: ReactNode;
  banner?: ReactNode;
  onlineStatus?: "online" | "offline";
  saveStatus?: "saved" | "saving" | "error";
  syncStatus?: "local" | "synced" | "pending" | "conflict" | "error";
  onBack?: () => void;
  children: ReactNode;
}

export function AppShell({
  activeView,
  onNavigate,
  projectName,
  draftVersion,
  hasDraft,
  density,
  pageTitle,
  pageSubtitle,
  pageActions,
  banner,
  onlineStatus = "online",
  saveStatus = "saved",
  syncStatus = "local",
  onBack,
  children,
}: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState(false);
  const navigationTrigger = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(max-width: 1024px)");
    const update = () => setDrawerMode(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!sidebarOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = sidebar.current?.querySelector<HTMLElement>("button");
    first?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setSidebarOpen(false); navigationTrigger.current?.focus(); }
    };
    window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("keydown", escape); document.body.style.overflow = previousOverflow; };
  }, [sidebarOpen]);

  const navigate = (view: AppView) => {
    onNavigate(view);
    setSidebarOpen(false);
    window.requestAnimationFrame(() => document.getElementById("main-content")?.focus());
  };

  return (
    <div className="app-shell" data-density={density}>
      <a className="skip-link" href="#main-content">跳到主内容</a>
      {sidebarOpen && (
        <button
          className="sidebar-scrim"
          aria-label="关闭导航"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        ref={sidebar}
        className={`app-sidebar ${sidebarOpen ? "is-open" : ""}`}
        aria-label="应用导航"
        aria-hidden={drawerMode && !sidebarOpen ? true : undefined}
        inert={drawerMode && !sidebarOpen ? true : undefined}
      >
        <div className="brand-block">
          <button className="brand-mark" onClick={() => navigate("home")} aria-label="返回项目首页">
            <span aria-hidden="true">SC</span>
          </button>
          <div className="brand-copy">
            <strong>Story Card Studio</strong>
            <span>Editorial Workspace</span>
          </div>
        </div>

        <button className="project-switcher" onClick={() => navigate("home")}>
          <span className="project-switcher-label">当前项目</span>
          <strong>{projectName || "未命名项目"}</strong>
          <span>{hasDraft ? `本地草稿 · 数据 v${draftVersion}` : "本地新项目"}</span>
        </button>

        <nav className="primary-navigation" aria-label="主要功能">
          {NAV_GROUPS.filter((group) => !group.utility).map((group) => (
            <div className="navigation-group" key={group.id}>
              <div className="navigation-group-label">{group.label}</div>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  className={`navigation-item ${activeView === item.id ? "is-active" : ""}`}
                  aria-current={activeView === item.id ? "page" : undefined}
                  onClick={() => navigate(item.id)}
                  title={item.subtitle}
                >
                  <span className="navigation-index" aria-hidden="true">{item.index}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        <nav className="utility-navigation" aria-label="项目工具">
          {NAV_GROUPS.find((group) => group.utility)?.items.map((item) => (
            <button
              key={item.id}
              className={`navigation-item ${activeView === item.id ? "is-active" : ""}`}
              aria-current={activeView === item.id ? "page" : undefined}
              onClick={() => navigate(item.id)}
              title={item.subtitle}
            >
              <span className="navigation-index" aria-hidden="true">{item.index}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <div className="app-main-frame">
        <header className="context-bar">
          <button
            ref={navigationTrigger}
            className="mobile-navigation-trigger"
            aria-label="打开导航"
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen(true)}
          >
            <span aria-hidden="true">☰</span>
          </button>
          {onBack && <button className="context-back" aria-label="返回上一页" onClick={onBack}>←</button>}
          <div className="context-heading">
            <span className="context-kicker">{projectName || "未命名项目"}</span>
            <strong>{pageTitle}</strong>
          </div>
          <div className="context-status" aria-label="连接、保存与同步状态">
            <span className={`save-indicator ${saveStatus}`} aria-hidden="true" />
            <span>{onlineStatus === "online" ? "在线" : "离线"}</span>
            <span>{saveStatus === "saving" ? "保存中" : saveStatus === "error" ? "保存失败" : hasDraft ? (syncStatus === "local" ? "本地已保存" : "已保存") : "尚未保存"}</span>
            <span>{{ local: "本机", synced: "已同步", pending: "待同步", conflict: "同步冲突", error: "同步失败" }[syncStatus]}</span>
            <span>数据 v{draftVersion}</span>
          </div>
          <div className="context-actions">{pageActions}</div>
        </header>

        {banner}

        <main id="main-content" className="app-content" tabIndex={-1}>
          <header className="page-header">
            <div>
              <div className="page-eyebrow">Story Card Studio</div>
              <h1>{pageTitle}</h1>
              <p>{pageSubtitle}</p>
            </div>
            {pageActions && <div className="page-header-actions">{pageActions}</div>}
          </header>
          {children}
        </main>
      </div>
      <nav className="mobile-bottom-navigation" aria-label="移动端快捷导航">
        {([[
          "home", "首页", "01",
        ], ["planning", "规划", "06"], ["prose", "正文", "07"]] as Array<[AppView, string, string]>).map(([id, label, index]) => (
          <button key={id} className={activeView === id ? "is-active" : ""} aria-current={activeView === id ? "page" : undefined} onClick={() => navigate(id)}>
            <span aria-hidden="true">{index}</span><strong>{label}</strong>
          </button>
        ))}
        <button aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(true)}><span aria-hidden="true">•••</span><strong>更多</strong></button>
      </nav>
    </div>
  );
}
