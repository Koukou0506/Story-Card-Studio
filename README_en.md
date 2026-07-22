**Read this in other languages: [中文](README.md), [English](README_en.md).**

# Story Card Studio

> A local-first creative workspace for Chinese-language long-form fiction. Manage characters, lore, plot planning, chapters, prose versions, and story-wide continuity in one project.

[Download the latest release](https://github.com/Koukou0506/Story-Card-Studio/releases) · [SillyTavern Extension](#sillytavern-extension) · [Documentation](#documentation)

![License](https://img.shields.io/badge/license-MIT-47624f)
![Node.js](https://img.shields.io/badge/Node.js-22%2B-5f7f68)
![Next.js](https://img.shields.io/badge/Next.js-16-1f2d25)

Story Card Studio is more than a character-card form, and it is not an unsupervised “write an entire novel” button. It is a workspace that grows with your project: start with a rough idea, build character cards and lorebooks, examine whether a plot works, plan the story and its chapters, generate or revise prose under version protection, and maintain long-form continuity through canon, timelines, plot threads, and foreshadowing.

You can explore the main workflow with the built-in Mock Provider and no API key. When a real provider is configured, its key stays in server-side environment variables and is not written to browser projects, exported files, or the SillyTavern extension.

> 📷 **Screenshot placeholder: Project home**  
> Suggested content: sidebar navigation, project overview, recent work, progress, and health notices.  
> Suggested path: `docs/images/readme/project-home.webp`; suggested size: 1600 × 900.

## Contents

- [Who it is for](#who-it-is-for)
- [Core capabilities](#core-capabilities)
- [Quick start](#quick-start)
- [Recommended workflows](#recommended-workflows)
- [Feature guide](#feature-guide)
- [Import and rebuild a work](#import-and-rebuild-a-work)
- [Mobile and cross-device use](#mobile-and-cross-device-use)
- [SillyTavern Extension](#sillytavern-extension)
- [Data and privacy](#data-and-privacy)
- [FAQ](#faq)
- [Developer information](#developer-information)

## Who it is for

- Writers organizing original characters, world rules, and story direction from scratch;
- Authors comparing plot options and checking motivation, causality, and relationship progression;
- Long-form writers breaking a story into volumes, chapters, and scenes while tracking state changes;
- Users who want AI-assisted drafting and local revision without sacrificing version control;
- Projects that need to track canon, character states, knowledge, plot threads, foreshadowing, and time;
- Writers rebuilding TXT, PDF, EPUB, DOCX, or Markdown manuscripts into structured projects;
- SillyTavern users who want to analyze selected character cards, World Info, or chat messages.

The current product is not designed for unattended full-novel generation, imitation of a specific living author, AI authorship detection, automatic online fandom research, a public community, or multi-user collaboration.

## Core capabilities

| Stage | What you can do | Protection |
| --- | --- | --- |
| Characters and lore | Generate, edit, validate, import, and export character cards and lorebooks | Unknown extension fields are preserved where possible; conflicts are not silently overwritten |
| Plot analysis | Analyze causality, motivation, information, capability, relationships, and world rules | Findings cite sources and distinguish hard errors from heuristics |
| Story planning | Build a story bible, character arcs, relationship routes, plot beats, and a timeline | Locked content is protected during partial generation |
| Chapters and scenes | Plan volumes, chapters, scenes, POV, information flow, and inherited state | Beat coverage and entry/exit continuity are checked |
| Prose writing | Generate scenes, continue, revise selections, view diffs, and restore versions | New output starts as an alternative version |
| Continuity | Manage canon, retcons, entities, state, knowledge, plot threads, and foreshadowing | Candidates require confirmation and history remains available |
| Project maintenance | Use visual views, the project assistant, change propagation, and reusable assets | Writes begin as proposals; prose changes use revisions |
| Work reconstruction | Parse multiple formats, run OCR, segment chapters, detect duplicates, and extract candidates | A rebuild plan is reviewed before existing data changes |

## Quick start

### For regular users: download a release package

1. Open [GitHub Releases](https://github.com/Koukou0506/Story-Card-Studio/releases).
2. Download the latest `story-card-studio-server-v*.zip`. If a release does not include a server package, use the source installation below.
3. Install [Node.js 22 or later](https://nodejs.org/).
4. Extract the ZIP. On Windows, double-click `start.cmd`; on macOS/Linux, run `start.sh`.
5. Open `http://localhost:3000` in a browser.

> 📷 **Screenshot placeholder: Download and first launch**  
> Suggested content: release asset, startup terminal, and browser home page.  
> Suggested path: `docs/images/readme/quick-start.webp`.

### For developers: run from source

```bash
git clone https://github.com/Koukou0506/Story-Card-Studio.git
cd Story-Card-Studio
npm install
cp .env.example .env.local
npm run dev
```

On Windows PowerShell, use `Copy-Item .env.example .env.local`. Then visit `http://localhost:3000`.

### Try it without an API key

The default Mock Provider needs no key and returns fixed sample data. It is intended for learning the interface and verifying workflows. To use a real provider, configure `.env.local`:

```dotenv
DEFAULT_PROVIDER=openai
OPENAI_API_KEY=your-key
```

Or:

```dotenv
DEFAULT_PROVIDER=anthropic
ANTHROPIC_API_KEY=your-key
```

Real provider calls may incur charges. Models and prices change, so consult the provider's official documentation rather than relying on fixed figures here.

## Recommended workflows

### From idea to prose

```text
Creative Input → Character Cards and Lorebooks → Plot Analysis → Story Planning
               → Chapters and Scenes → Drafts and Revisions → Continuity Checks
```

For a first visit, use the Mock Provider to create an idea, generate a character card and a few lore entries, analyze a short plot, build one scene plan, and generate an alternative prose draft. Finish by exporting a project JSON backup.

### Rebuild an existing work

```text
Choose Files → Extract Text/OCR → Confirm Volumes and Chapters
             → Review Duplicates and Versions → Extract Candidates
             → Review Rebuild Plan → Write Drafts or New Versions
```

### Use it from SillyTavern

```text
Choose Character, World Info, or Chat Range → Preview Payload
→ Connect Workspace → Generate/Analyze → Review Diff → Confirm Write-back or Export
```

## Feature guide

### Project home and creative input

The project home summarizes progress, recent materials, health notices, and the next place to continue. Creative Input stores the original premise, original/fandom mode, creative goals, notes, and constraints used as upstream context. Model output never replaces the original input.

### Character cards

The character workspace supports the main Character Card V2 fields. Create a draft from an idea or import an existing JSON file.

- Edit descriptions, personality, scenarios, first messages, example dialogue, and creator notes;
- Switch between basic and advanced fields and run quality checks;
- Import, export, and re-import Character Card V2 JSON;
- Preserve unknown `extensions` where possible;
- Read, merge, replace, or write back a Character Book;
- Preview conflicts before any existing card is replaced.

> 📷 **Screenshot placeholder: Character card editor**  
> Suggested content: character list, form, quality checks, and export controls.  
> Suggested path: `docs/images/readme/character-card.webp`.

### Lorebooks

The internal Lorebook model adapts to both Character Card V2 Character Books and standalone SillyTavern World Info.

- Generate from an idea, a character card, or both;
- Create, duplicate, delete, reorder, search, and batch-enable entries;
- Edit primary and secondary keys, constant activation, order, and insertion position;
- Preserve advanced data such as case sensitivity, regex, probability, scan depth, sticky, cooldown, and delay;
- Use a local approximate simulator to explain keyword activation;
- Detect empty entries, broad or duplicate keys, invalid regex, and repeated content;
- Warn when a target format cannot express a field without loss;
- Preserve unknown and format-specific data.

> 📷 **Screenshot placeholder: Lorebook and activation simulator**  
> Suggested content: entry list, keys, advanced fields, and simulation output.  
> Suggested path: `docs/images/readme/lorebook.webp`.

### Plot analysis

Analyze one proposal or compare up to three branches. The report focuses on why a plot does or does not work.

- Check causal chains, character motivation, information sources, capability, resources, and world rules;
- Examine emotional transitions, relationship stages, trust, and behavior intensity;
- Show severity, confidence, evidence, source references, and minimum revisions;
- Separate hard contradictions, heuristic risks, missing information, and aesthetic preference;
- Save reports and export Markdown or JSON;
- Mark old reports as potentially stale when their source material changes.

The context builder selects relevant characters and lore entries instead of sending the whole project by default.

> 📷 **Screenshot placeholder: Plot analysis report**  
> Suggested content: conclusion, scores, serious issues, and source references.  
> Suggested path: `docs/images/readme/plot-analysis.webp`.

### Story planning

- Story bible: premise, theme, POV, conflict, goal, stakes, cost, and ending direction;
- Character plans and arcs: needs, fears, false beliefs, choices, and linked events;
- Relationship routes: starting state, power, trust, turns, and end state;
- Free-form, three-act, four-act, or custom macro structure;
- Causal dependencies, a simple timeline, and character/relationship/world state changes;
- Multiple plan versions with adoption, deprecation, and comparison.

Fields and beats can be locked. Partial generation only changes the selected module.

### Chapters and scenes

- Build volumes and chapters from plot beats;
- Record chapter POV, time, location, goal, trigger, turn, result, and hook;
- Record scene entry state, character goals, conflict, action, turn, and exit state;
- Track what the author, reader, and each character know;
- Record setup, reinforcement, planned payoff, and actual payoff;
- Detect uncovered, duplicated, or deviated plot beats;
- Check adjacent scenes for time, location, presence, physical, emotional, relationship, knowledge, and item continuity;
- Save and compare multiple chapter or scene versions.

Mobile workflows provide buttons and step-based controls instead of requiring drag and drop.

> 📷 **Screenshot placeholder: Chapter and scene planning**  
> Suggested content: chapter list, scene card, inherited state, and issues.  
> Suggested path: `docs/images/readme/chapter-scene-planning.webp`.

### Prose writing

The prose workspace is designed around source protection. Every generation or revision first creates an alternative Draft Version or Revision.

- Generate a complete scene, opening, conflict, turn, or ending;
- Continue from the cursor, or rewrite, expand, and compress a selection;
- Enhance dialogue, action, interiority, setting, or pacing;
- Restrict changes to a document, scene, paragraph, range, dialogue, or narration with Edit Scope;
- Lock paragraphs and protect text outside the selection;
- View paragraph-level diffs, accept all or part, reject, or restore history;
- Check scene-plan coverage, POV, tense, and knowledge violations;
- Extract candidate facts and state changes without automatically updating canon;
- Export Markdown, plain text, or complete versioned JSON.

> 📷 **Screenshot placeholder: Prose editor and revision diff**  
> Suggested content: editor, generation controls, diff, and version history.  
> Suggested path: `docs/images/readme/prose-editor.webp`.

### Style profiles, language rules, and text diagnostics

A Style Profile stores abstract preferences such as sentence length, paragraph length, dialogue/action/interiority/setting ratios, emotional restraint, narrative distance, pacing, and tone. Language Constraints store project-, character-, or scene-level rules.

“AI Flavor and Mechanical Writing Diagnostics” checks repeated structures, summary-like paragraph endings, abstract emotion, over-explanation, homogeneous dialogue, and deviation from project style. Short text receives local hints rather than a false stable score. Deterministic local metrics still work when a model is unavailable.

> **Important:** This feature evaluates style risks. It cannot prove whether a text was written by AI or a human and is not evidence of cheating or authorship.

### Continuity center

- Canon Ledger with candidate, confirmed, locked, conflicted, and deprecated facts;
- Retcons that preserve old and new facts, scope, and unresolved impacts;
- Entity indexing and character, relationship, and world snapshots;
- Reader and character knowledge, misunderstanding, suspicion, public, and secret states;
- Plot threads, open questions, and foreshadow setup/reinforcement/payoff;
- A story-wide timeline combining plans, prose, and state changes;
- Plan/manuscript drift, continuity issues, and project health reports;
- A next-chapter context package with inherited states, knowledge, items, and risks.

Candidate facts never become canon automatically, and same-name entities are not merged solely by string equality.

> 📷 **Screenshot placeholder: Continuity center**  
> Suggested content: canon, plot threads, foreshadowing, issues, and health overview.  
> Suggested path: `docs/images/readme/continuity-center.webp`.

### Visual workspace, project assistant, and setting changes

The read-only visual workspace provides relationship graphs, actual/narrative timelines, plot-thread and foreshadow views, a knowledge matrix, chapter pacing, and character-presence charts. Accessible list alternatives and PNG/SVG, CSV, and JSON exports are available.

The project assistant queries the project through a restricted tool registry and cites important sources. A write request only creates a Change Proposal; confirmation is required before existing version and diff protections can execute it.

Setting Changes analyzes direct, derived, and downstream impacts of names, ages, identities, relationships, places, terms, ownership, and event timing. Users choose propagation targets. Prose is changed only through a Revision, never by bulk overwrite.

### Assets and templates

Save character cards, lore, planning templates, Style Profiles, Language Constraints, and character voice profiles as versioned assets.

- **Copy:** becomes independent inside a project;
- **Reference:** retains a link to an asset version;
- **Derive:** records a base version and project differences;
- **Project template:** previews content before creating a project.

Upstream updates create proposals and never sync automatically. Project templates exclude prose, chats, keys, and tokens by default.

## Import and rebuild a work

This workspace converts works you have the right to process into maintainable projects.

| Format | Supported scope | Main limitation |
| --- | --- | --- |
| TXT | UTF-8, BOM, UTF-16, GB18030, and other common encodings | Uncertain encoding requires preview and confirmation |
| PDF | Text-layer PDFs with page references | Multi-column layout and broken character maps may produce warnings |
| Scanned PDF | Optional local Tesseract + Poppler OCR | Extra installation required; quality depends on the scan |
| EPUB | XHTML extracted in Spine reading order | Protected/damaged files cannot be parsed; images remain references |
| DOCX | Paragraphs, headings, lists, tables, notes, comments, and revision metadata | Complex layout may be reported only as warnings |
| Markdown | Headings, front matter, quotes, links, HTML, and code-block options | Syntax is removed from analysis text while source mapping remains |

Mixed-format batch imports are supported. One failed file does not stop the entire job, and processing supports cancellation, failed-block retry, and checkpoint recovery.

The workflow is: Choose Files → Parsing Settings → Content Preview → Volume/Chapter Structure → Duplicates and Versions → OCR Review → Extraction Settings → Candidate Materials → Rebuild Plan → Write Results.

Important results carry Source Spans that can point back to a file, chapter, page, paragraph, or character range. During the final write, prose creates a new version, character cards and lorebooks become drafts, and other material remains candidate data. Existing content is not silently overwritten.

> 📷 **Screenshot placeholder: Import and rebuild**  
> Suggested content: file list, chapter confirmation, candidates, and rebuild plan.  
> Suggested path: `docs/images/readme/work-import.webp`.

## Mobile and cross-device use

Story Card Studio is a responsive web application and does not require a native mobile app.

- On the same LAN, visit `http://<computer-lan-ip>:3000`;
- Mobile drawer navigation, bottom shortcuts, single-column workspaces, and safe-area support are included;
- Prose can be edited full-screen, and tables have card or horizontal-scroll alternatives;
- The app can be installed as a PWA;
- Offline mode can open the cached shell, edit local projects, and export JSON;
- Model operations are clearly disabled while offline and failed requests are not replayed forever;
- Workspace mode allows desktop and mobile clients to read the same server project;
- Saves carry a project version, so stale clients cannot silently overwrite newer data.

Remote access requires HTTPS, authentication, and a controlled network. Never expose an unauthenticated workspace directly to the public internet.

> 📷 **Screenshot placeholder: Mobile workspace**  
> Suggested content: navigation, full-screen prose editing, and save status.  
> Suggested path: `docs/images/readme/mobile-workspace.webp`.

## SillyTavern Extension

In SillyTavern's extension installer, enter the repository URL and choose the `sillytavern-extension` branch, or download the extension ZIP from Releases:

```text
https://github.com/Koukou0506/Story-Card-Studio
```

The extension reads the current character card, Character Book, World Info, and a user-selected chat range. It connects to the workspace for character, lore, plot, continuity, and text analysis, then displays structured results and diffs.

Every transfer is user-triggered and chat content is previewed first. The extension does not store provider API keys or automatically upload conversations. If the installed SillyTavern version has no stable public write API, the extension safely falls back to exporting compatible JSON.

> 📷 **Screenshot placeholder: SillyTavern Extension**  
> Suggested content: current context, payload preview, tools, and task status.  
> Suggested path: `docs/images/readme/sillytavern-extension.webp`.

## Data and privacy

### Where data is stored

- Local projects are stored primarily in browser IndexedDB;
- Legacy localStorage drafts are migrated while retaining a recovery snapshot;
- Workspace projects live in the configured server persistence directory;
- Imported source files and extracted text use separate local asset storage;
- Project JSON may include prose and processing chunks and should be treated as private writing data.

Regularly back up exported project JSON, the workspace data directory, `.env.local`, and source assets you still need. Before deleting source or runtime folders, verify that backups can be restored.

### External model boundary

- The Mock Provider sends no external requests;
- File parsing can run in local-only mode;
- External analysis receives only selected text and necessary context;
- Long works are chunked instead of being sent as one full manuscript by default;
- Provider keys never enter browser projects, exports, PWA caches, or the extension;
- Process only material that you own or are authorized to use.

## Import, export, and compatibility

Exports include complete project JSON, Character Card V2 JSON, SillyTavern World Info, Character Books, report Markdown/JSON, prose Markdown/plain text/JSON, visual exports, and asset packs.

Character and lore adapters preserve unknown `extensions` and format-specific fields where possible. If a target format cannot express a field, the app displays a compatibility warning. See the [compatibility documentation](https://github.com/Koukou0506/Story-Card-Studio/blob/main/docs/compatibility.md).

## FAQ

### Will it overwrite my prose or settings automatically?

No. Model output starts as a draft, candidate, alternative version, or Change Proposal. Prose changes use Revision and Diff and require user acceptance.

### Can it write an entire novel automatically?

No. Generation operates on selected planning modules, chapters, scenes, or text ranges. Unattended continuous full-book writing is not provided.

### Can I use it without a real model?

Yes. The Mock Provider demonstrates the workflow, and format conversion, search, activation simulation, and several local checks need no model.

### Can I delete the downloaded source folder?

If you use a separate server runtime package, you do not need to retain a source copy used only for building. Do not delete the active runtime, workspace data, `.env.local`, or unbacked imported assets. Export and verify a project backup first.

### Why is a report marked stale?

Reports record the source versions of character cards, lorebooks, plans, or prose. When those sources change, the old report remains available but is marked for review.

### Why can a scanned PDF not be read immediately?

A scanned PDF has no text layer and requires local OCR. If OCR dependencies are not installed, the app reports the unavailable state instead of fabricating output.

### Is the text diagnostic an AI detector?

No. It reports risks such as mechanical structure, repetition, over-explanation, and style deviation. It does not estimate AI authorship probability.

## Documentation

| Document | Topic |
| --- | --- |
| [Server package](https://github.com/Koukou0506/Story-Card-Studio/blob/main/docs/server-package.md) | Startup, upgrades, directories, and migration |
| [Mobile and PWA](https://github.com/Koukou0506/Story-Card-Studio/blob/main/docs/mobile-and-pwa.md) | Mobile, offline mode, workspaces, and conflicts |
| [Document ingestion](https://github.com/Koukou0506/Story-Card-Studio/blob/main/docs/document-ingestion.md) | TXT/PDF, chunks, checkpoints, and source mapping |
| [Work reconstruction](https://github.com/Koukou0506/Story-Card-Studio/blob/main/docs/work-import-and-rebuild.md) | Multiple formats, OCR, versions, and rebuild plans |
| [Compatibility](https://github.com/Koukou0506/Story-Card-Studio/blob/main/docs/compatibility.md) | Character Book and World Info mapping |
| [Plot analysis](https://github.com/Koukou0506/Story-Card-Studio/blob/main/docs/analysis-methodology.md) | Dimensions, severity, confidence, and scores |
| [Story planning](https://github.com/Koukou0506/Story-Card-Studio/blob/main/docs/planning-methodology.md) | Story bibles, arcs, causality, and versions |
| [Chapters and scenes](https://github.com/Koukou0506/Story-Card-Studio/blob/main/docs/chapter-planning-methodology.md) | POV, information flow, and inherited state |
| [Prose generation](https://github.com/Koukou0506/Story-Card-Studio/blob/main/docs/prose-generation-methodology.md) | Edit Scope, revisions, and source protection |
| [Continuity](https://github.com/Koukou0506/Story-Card-Studio/blob/main/docs/continuity-methodology.md) | Canon, states, plot threads, and foreshadowing |
| [Text diagnostics](https://github.com/Koukou0506/Story-Card-Studio/blob/main/docs/style-risk-analysis.md) | Baselines, privacy, and comparison |
| [Architecture](https://github.com/Koukou0506/Story-Card-Studio/blob/main/docs/architecture.md) | Domain, services, storage, and UI |

## Developer information

```bash
npm run dev                         # Development server
npm run typecheck                   # TypeScript check
npm test                            # Automated tests
npm run build                       # Production build
npm start                           # Start production server
npm run package:server              # Build server package
npm run build:sillytavern-extension # Build SillyTavern extension
```

Main technologies: Next.js 16, React 19, TypeScript 5, Zod 4, Vitest, and Tailwind CSS 4.

| Environment variable | Purpose | Default |
| --- | --- | --- |
| `OPENAI_API_KEY` | OpenAI key | Empty |
| `ANTHROPIC_API_KEY` | Anthropic key | Empty |
| `DEFAULT_PROVIDER` | `openai`, `anthropic`, or `mock` | `mock` |
| `API_TIMEOUT_MS` | Provider timeout in milliseconds | `60000` |
| `WORKSPACE_ACCESS_TOKEN` | Long single-user workspace token, at least 24 characters | Empty; workspace disabled |
| `WORKSPACE_DATA_DIR` | Server project persistence directory | `.workspace-data` |
| `WORKSPACE_ALLOWED_ORIGINS` | Additional allowed origins | Empty |
| `WORKSPACE_BODY_LIMIT` | Workspace request body limit in bytes | `31457280` |

When reporting an issue, include the operating system, Node.js version, browser, and minimal reproduction steps. Remove keys, tokens, and private prose from logs and screenshots.

## License

[MIT License](LICENSE)

