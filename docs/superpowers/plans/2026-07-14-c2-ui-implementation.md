# Phase C2.0 UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved layered-density visual system, grouped application shell, project home, settings, and first-batch workspace migrations without changing A1–C1 business behavior.

**Architecture:** Add a small presentation layer under `src/components/ui/` and keep `page.tsx` responsible for composing existing domain workspaces. Theme and responsive behavior live in `globals.css`; existing services, schemas, Provider adapters, storage, import/export, and migration code remain unchanged.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Tailwind CSS 4, custom CSS, Vitest + jsdom.

## Global Constraints

- Preserve all A1–C1 data and business flows.
- Do not install a UI framework or icon package.
- Do not modify domain model semantics, Provider adapters, import/export formats, or migration rules.
- Use the approved direction C: comfortable editorial shell plus compact data workspaces.
- Use semantic tokens from `docs/design-system.md`.
- Remove the standalone quality top-level navigation entry; keep character quality available inside the character workspace.
- Add a real project home and settings entry.
- Maintain keyboard focus, ARIA labels, reduced motion, and tablet fallbacks.

---

### Task 1: Shared navigation model and App Shell

**Files:**
- Create: `src/components/ui/navigation.ts`
- Create: `src/components/ui/AppShell.tsx`
- Create: `tests/ui-shell.test.tsx`

**Interfaces:**
- Produces: `AppView`, `NAV_GROUPS`, `getViewMeta(view)`, and `AppShell`.
- `AppShell` consumes `activeView`, `onNavigate`, project metadata, density, page title/subtitle/actions, and children.

- [ ] **Step 1: Write the failing shell test**

Test grouped navigation labels, `aria-current="page"`, `main#main-content`, save state, and the settings entry.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm.cmd test -- tests/ui-shell.test.tsx`

Expected: FAIL because `@/components/ui/AppShell` does not exist.

- [ ] **Step 3: Implement navigation model and App Shell**

Use native buttons and semantic `nav`, provide a skip link, group views as Home / Create / Plan / Write / Maintain / Utility, and expose a compact data attribute for CSS.

- [ ] **Step 4: Run focused test and verify GREEN**

Run: `npm.cmd test -- tests/ui-shell.test.tsx`

Expected: PASS.

### Task 2: Project Home and Settings

**Files:**
- Create: `src/components/ProjectHome.tsx`
- Create: `src/components/SettingsWorkspace.tsx`
- Create: `tests/project-home.test.tsx`

**Interfaces:**
- `ProjectHome` consumes the existing `ProjectDraft`, current selected objects, and `onNavigate`.
- `SettingsWorkspace` consumes UI density, density updater, project version, recovery availability, recovery export, and clear-project callback.

- [ ] **Step 1: Write failing home tests**

Test the empty-project CTA, populated-project continue action, progress summary, and absence of automatic model calls.

- [ ] **Step 2: Run focused test and verify RED**

Run: `npm.cmd test -- tests/project-home.test.tsx`

Expected: FAIL because `ProjectHome` does not exist.

- [ ] **Step 3: Implement Home and Settings**

Use existing draft data only. Settings explains server-only API keys, stores UI density separately from project domain data, and places clear-project actions in a danger zone.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm.cmd test -- tests/project-home.test.tsx`

Expected: PASS.

### Task 3: Compose the new shell in the main page

**Files:**
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes `AppShell`, `ProjectHome`, `SettingsWorkspace`, and all existing workspaces unchanged.
- Produces grouped navigation and inline character quality without changing `useDraft`.

- [ ] **Step 1: Add a failing integration assertion to `tests/ui-shell.test.tsx`**

Assert that quality is not a top-level navigation destination and that the shell exposes Home and Settings.

- [ ] **Step 2: Verify RED against current `page.tsx` composition**

Run: `npm.cmd test -- tests/ui-shell.test.tsx`

- [ ] **Step 3: Refactor page composition**

Replace the top tab strip and header with `AppShell`; add `home` and `settings`; move character quality into the character inspector; keep every existing callback and workspace prop.

- [ ] **Step 4: Verify GREEN**

Run: `npm.cmd test -- tests/ui-shell.test.tsx tests/analysis-page-flow.test.tsx tests/prose-page-flow.test.tsx tests/continuity-page-flow.test.tsx`

Expected: PASS.

### Task 4: Semantic tokens and responsive shared components

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Provides semantic color, type, spacing, radius, shadow, density, layout, focus, and motion classes.
- Existing class names remain supported during migration.

- [ ] **Step 1: Add static CSS contract assertions to `tests/ui-shell.test.tsx`**

Assert the stylesheet contains the approved canvas, accent, focus-visible, reduced-motion, shell grid, and tablet breakpoint contracts.

- [ ] **Step 2: Run focused test and verify RED**

Run: `npm.cmd test -- tests/ui-shell.test.tsx`

- [ ] **Step 3: Implement the semantic theme**

Replace A1 root colors, add typography and density tokens, style shared shell/components, retain legacy class compatibility, add focus-visible, 44px comfortable targets, reduced motion, and 1024/768px fallbacks.

- [ ] **Step 4: Verify GREEN**

Run: `npm.cmd test -- tests/ui-shell.test.tsx`

Expected: PASS.

### Task 5: First-batch workspace migration

**Files:**
- Modify: `src/components/CharacterEditor.tsx`
- Modify: `src/components/LorebookWorkspace.tsx`
- Modify: `src/components/ProseWorkspace.tsx`
- Modify: `src/components/ProjectInput.tsx`
- Modify: `src/components/GenerationPanel.tsx`

**Interfaces:**
- Existing props and business callbacks remain unchanged.
- Adds layout and accessibility class names only, plus native button semantics for collapsible controls.

- [ ] **Step 1: Add focused accessibility assertions**

Extend UI tests to require accessible collapsible buttons and named workspace regions.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm.cmd test -- tests/ui-shell.test.tsx tests/prose-page-flow.test.tsx`

- [ ] **Step 3: Migrate first-batch workspaces**

Make character editing a list/editor/inspector composition, convert lorebook to sidebar/list/inspector layout, replace prose inline three-column sizing with responsive classes, move prose actions into a calmer toolbar, and use semantic section classes for project input.

- [ ] **Step 4: Verify GREEN**

Run: `npm.cmd test -- tests/ui-shell.test.tsx tests/prose-page-flow.test.tsx tests/chapter-planning-page-flow.test.tsx`

Expected: PASS.

### Task 6: Compatibility theme for second-batch pages and final verification

**Files:**
- Modify: `src/components/ContinuityCenter.tsx`
- Modify: `src/components/PlotAnalysisWorkspace.tsx`
- Modify: `src/components/StoryPlanningWorkspace.tsx`
- Modify: `src/components/ImportExport.tsx`
- Modify: `src/components/QualityCheck.tsx`
- Modify: `README.md`

**Interfaces:**
- Existing domain behavior and page props remain unchanged.
- Replace hard-coded visual constants with semantic variables and add page-level class hooks.

- [ ] **Step 1: Add regression assertions for the existing page flows**

Ensure analysis, planning, prose, and continuity empty states still create their projects through the same callbacks.

- [ ] **Step 2: Run regression tests before migration**

Run: `npm.cmd test -- tests/analysis-page-flow.test.tsx tests/chapter-planning-page-flow.test.tsx tests/prose-page-flow.test.tsx tests/continuity-page-flow.test.tsx`

Expected: PASS baseline.

- [ ] **Step 3: Apply compatibility theme and documentation update**

Add page hooks, replace C1 hex colors with semantic tokens, keep all actions, and document the new C2.0 shell and density system in README.

- [ ] **Step 4: Run complete verification**

Run: `npm.cmd run typecheck`

Run: `npm.cmd test`

Run: `npm.cmd run build`

Expected: typecheck PASS, all tests PASS, production build PASS.

- [ ] **Step 5: Run local UI smoke check**

Verify Home, Character, Lorebook, Prose, Continuity, Settings, keyboard focus, and tablet layout. If the app browser cannot reach localhost, record the environment limitation and use jsdom plus source assertions instead of claiming visual browser coverage.
