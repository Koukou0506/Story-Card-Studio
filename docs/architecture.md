# Story Card Studio - 架构文档

## Phase A1 基础架构与 Phase A2 增量

```
┌──────────────────────────────────────────────────────────┐
│                      浏览器 (Client)                      │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────┐  │
│  │项目输入  │ │角色卡编辑 │ │质量检查  │ │  导入/导出   │  │
│  │ 组件    │ │ 组件     │ │ 组件    │ │  组件       │  │
│  └────┬────┘ └────┬─────┘ └────┬─────┘ └──────┬──────┘  │
│       └───────────┴────────────┴───────────────┘          │
│                          │                                │
│                    useDraft Hook                          │
│                   (localStorage)                          │
│                          │                                │
│                   GenerationPanel                         │
│                          │                                │
│                    fetch /api/generate                     │
└──────────────────────────┼───────────────────────────────┘
                           │
┌──────────────────────────┼───────────────────────────────┐
│                    Next.js Server                         │
│                          │                                │
│              POST /api/generate                           │
│                          │                                │
│            ┌─────────────┴─────────────┐                 │
│            │     Generator Service     │                  │
│            │  - build prompts          │                  │
│            │  - call provider          │                  │
│            │  - extract JSON           │                  │
│            │  - schema validation      │                  │
│            │  - format repair           │                  │
│            └─────────────┬─────────────┘                 │
│                          │                                │
│            ┌─────────────┴─────────────┐                 │
│            │    Provider Adapter       │                  │
│            │  ┌───────┐ ┌───────────┐  │                 │
│            │  │OpenAI │ │Anthropic │  │                  │
│            │  └───────┘ └───────────┘  │                 │
│            │  ┌───────┐               │                  │
│            │  │ Mock  │               │                  │
│            │  └───────┘               │                  │
│            └──────────────────────────┘                 │
└──────────────────────────────────────────────────────────┘
```

## 技术选型

| 层面 | 技术 | 选择理由 |
|------|------|----------|
| 框架 | Next.js 16 (App Router) | TypeScript 全栈一体化，减少配置 |
| UI | React 19 + 内联样式 + CSS | 组件数少，不需要 CSS-in-JS 库 |
| Schema 校验 | Zod 4 | 运行时校验 + TypeScript 类型推断 |
| 测试 | Vitest | 与 Vite/Next.js 生态兼容，速度快 |
| 样式 | Tailwind CSS 4 + 自定义 CSS | Tailwind 提供基础，自定义层覆盖细节 |
| 存储 | localStorage | 本阶段无需服务器存储 |
| 包管理 | npm | 无需额外全局工具 |

## 目录结构

```
ProjectA/
├── src/
│   ├── app/                      # Next.js App Router
│   │   ├── layout.tsx            # 根布局
│   │   ├── page.tsx              # 主页面（"use client"）
│   │   ├── globals.css           # 全局样式
│   │   └── api/generate/
│   │       └── route.ts          # 生成 API 路由
│   ├── domain/                   # 领域模型和 Schema
│   │   ├── character-card.ts     # Character Card V2 类型+Schema
│   │   ├── project-input.ts      # 用户输入类型+Schema
│   │   └── quality-check.ts      # 质量检查类型+Schema
│   ├── providers/                # 模型供应商 Adapter
│   │   ├── types.ts              # 统一接口定义
│   │   ├── openai.ts             # OpenAI Adapter
│   │   ├── anthropic.ts          # Anthropic Adapter
│   │   ├── mock.ts               # Mock Adapter
│   │   └── factory.ts            # Provider 工厂
│   ├── prompts/                  # 提示词模板
│   │   └── v1.ts                 # V1 提示词（版本化）
│   ├── services/                 # 业务逻辑
│   │   ├── generator.ts          # 角色卡生成服务
│   │   ├── quality-checker.ts    # 质量检查规则
│   │   └── import-export.ts      # 导入导出服务
│   ├── hooks/                    # React Hooks
│   │   ├── useLocalStorage.ts    # localStorage 持久化
│   │   └── useDraft.ts           # 草稿状态管理
│   └── components/               # UI 组件
│       ├── ProjectInput.tsx      # 项目输入区
│       ├── CharacterEditor.tsx   # 角色卡编辑区
│       ├── QualityCheck.tsx      # 质量检查区
│       ├── ImportExport.tsx      # 导入导出区
│       └── GenerationPanel.tsx   # 生成控制面板
├── tests/                        # 测试文件
│   ├── schema.test.ts
│   ├── import-export.test.ts
│   └── quality-check.test.ts
├── docs/                         # 项目文档
│   ├── compatibility.md          # 兼容性文档
│   └── architecture.md           # 本文件
├── .env.example                  # 环境变量模板
├── .env.local                    # 本地环境变量
├── next.config.ts
├── tsconfig.json
├── vitest.config.ts
└── package.json
```

## 数据流

### 生成流程

```
用户输入 → ProjectInput
    ↓
GenerationPanel → fetch POST /api/generate
    ↓
API Route → Generator Service
    ↓
Generator → buildSystemPrompt() + buildUserMessage()
    ↓
Provider.generate() → 模型 API
    ↓
extractJSON() → repairJSON() → JSON.parse()
    ↓
CharacterDataSchema.safeParse() → Schema validation
    ↓ (失败时重试最多 2 次)
    ↓ (成功)
CharacterData → API Response
    ↓
useDraft.setCharacterData() → localStorage
    ↓
CharacterEditor ← draft.characterData
```

### 导出流程

```
CharacterEditor data
    ↓
CharacterCardV2 (spec + spec_version + data)
    ↓
exportToJSON() → JSON.stringify()
    ↓
downloadJSON() → Blob → download
```

### 导入流程

```
File (.json)
    ↓
importFromFile() → FileReader → JSON.parse()
    ↓
CharacterCardV2Schema.safeParse()
    ↓
useDraft.loadCharacterCard()
    ↓
CharacterEditor data
```

### 质量检查流程

```
CharacterData
    ↓
runQualityChecks() → 9 条规则依次检查
    ↓
QualityReport { issues[], checkedAt }
    ↓
QualityCheck 组件渲染
```

## 安全设计

1. **API 密钥隔离**：API 密钥只在服务端的 Provider Adapter 中使用，通过环境变量注入。浏览器代码从不导入或使用密钥。
2. **输入校验**：所有用户输入通过 Zod Schema 校验，API 路由拒绝格式不正确的请求。
3. **输出校验**：模型返回的 JSON 经过 extractJSON → repairJSON → Schema safeParse 三道关卡。
4. **XSS 防护**：React 默认转义所有输出。不使用 dangerouslySetInnerHTML。
5. **无日志泄露**：API 密钥和完整角色卡内容不出现在日志中。服务端错误日志只记录错误类型，不记录请求体。

## 限制与假设

1. **单用户本地**：不涉及多用户、权限、数据库。
2. **浏览器存储**：数据存储在 localStorage，清除浏览器数据会丢失。
3. **model参数**：Provider 和模型名称通过 UI 选择器传递，不硬编码。
4. **扩展字段**：extensions 以 Record<string, unknown> 存储，不解析具体内容。

## Phase A2 世界书架构

Phase A2 保留原有角色卡组件、`/api/generate`、Provider 和 A1 服务，只新增以下层次：

```text
LorebookWorkspace (React，仅调用服务)
  ├─ /api/generate-lorebook → lorebook-generator → 现有 Provider Adapter
  ├─ lorebook-quality       （纯 TypeScript）
  ├─ activation-simulator   （纯 TypeScript，本地近似）
  └─ lorebook-io
       ├─ CharacterBookAdapter
       └─ SillyTavernWorldInfoAdapter
              ↕
       Lorebook 统一领域模型
              ↕
       ProjectDraft v2 / localStorage
```

### 领域与适配边界

- `src/domain/lorebook.ts` 定义内部 `Lorebook`、`LorebookEntry`、`ActivationRule`、`LorebookMetadata` 与 `FormatSpecificData` Zod Schema。
- `src/adapters/` 独立负责识别、外部 Schema、默认值、转换、未知字段和兼容性警告。React 组件不包含外部 JSON 映射。
- 外部来源的未知根字段、条目字段和 extensions 分开保存；同格式导出时合并恢复。
- 模型只输出 `LorebookDraftOutputSchema`，程序生成 ID、时间和格式字段；模型响应不能直接下载为 SillyTavern 文件。

### 本地数据 v2 与迁移

`ProjectDraft` 数据版本为 2，新增 `lorebooks[]`、`selectedLorebookId`、`lorebookAssociations[]`、提示词版本和迁移恢复信息。无版本号的 A1 草稿按既有 `projectInput`、`characterData`、`characterCard` 原样提升；角色卡未知字段由 passthrough Schema 保留。迁移异常时创建可继续使用的空状态，但将完整原始值放入 `recoveryData` 并在 UI 提供 JSON 导出，不主动删除原 localStorage 值。

### 世界书生成

版本化提示词位于 `src/prompts/lorebook-v1.ts`。生成服务执行 JSON 提取、尾逗号修复、Zod 校验、最多两次重试、超时/取消和中文错误归类。API 密钥仍只由服务端 Provider 工厂读取；请求和日志不含密钥。

### 激活模拟限制

模拟器是确定性的本地解释器，只覆盖本应用明确实现的普通/正则关键词、大小写、四种次级逻辑、常驻和启停。不尝试复刻 SillyTavern 的递归预算、概率、向量、分组竞争或跨消息 timed effects。

## Phase A3 分析模块设计

Phase A3 继续复用现有 Provider Adapter、Zod、API Route 和 localStorage，只新增分析领域：

```text
PlotAnalysisWorkspace
  ├─ Analysis Context Builder（来源、权威、相关性、预算）
  ├─ POST /api/analyze-plot
  │    └─ Analysis Generator
  │         ├─ prompts/analysis-v1
  │         ├─ Provider Adapter
  │         ├─ JSON 提取/有限修复
  │         ├─ AnalysisReport Schema
  │         └─ 来源引用校验与评分规范化
  ├─ Analysis Export（Markdown / JSON）
  └─ ProjectDraft v3（项目、报告、备注、Provider 偏好）
```

### 分析领域

`src/domain/plot-analysis.ts` 定义 `PlotAnalysisProject`、`PlotProposal`、`PlotBranch`、`AnalysisContext`、`ContextSource`、`SourceReference`、`AnalysisIssue`、四类维度 Assessment、`BranchComparison`、`RevisionSuggestion` 和 `AnalysisReport`。领域模型不依赖 React 或具体 Provider，全部具有运行时 Schema、数据版本和默认值。

### 上下文与隐私

上下文构建器不会无差别发送世界书：先由用户选择书，再按剧情实体和条目关键词筛选，最后在预算内按手动选择、权威等级和相关性裁剪。界面在调用前展示完整清单。API 密钥仍只存在服务端环境变量；ProjectDraft 只保存 Provider 类型和模型名。

### 输出处理和引用

模型只生成分析主体 JSON。服务补充报告 ID、输入/上下文快照、来源版本、Provider、模型和时间；最多执行两次格式修复。所有引用必须匹配本次已包含来源的类型、实体 ID、字段与版本，不匹配者标记无效。确定性规则用于发现明显因果、信息、能力、连续性、关系和世界规则问题，但不会修改源数据。

### 数据 v3

ProjectDraft v3 增加 `analysisProjects[]`、当前分析项目、项目备注和无密钥 Provider 偏好。每个分析项目保存输入、上下文选择和报告。报告保存输入快照、上下文快照及来源版本；角色卡或世界书版本变化时 UI 标记旧报告。v1/v2 迁移显式保留角色卡、世界书和未知字段，失败时继续保留 `recoveryData`。

详细方法见 [analysis-methodology.md](analysis-methodology.md)。

## Phase B1 小说规划模块

```text
StoryPlanningWorkspace
  ├─ Planning Context Builder（创意/角色卡/世界书/A3/锁定规划）
  ├─ POST /api/generate-plan → Planning Generator → Provider Adapter
  ├─ Lock/Module Merge Guard
  ├─ Planning Validator（依赖、时间、状态、一致性）
  ├─ Variant Compare / Markdown / JSON
  └─ ProjectDraft v4（多个 StoryPlan 与 OutlineVariant）
```

领域模型位于 `src/domain/story-planning.ts`，与 UI 和 Provider 解耦。StoryPlan 持有多个版本，OutlineVariant 聚合故事圣经、角色规划、角色弧、关系路线、宏观大纲、时间线、问题和来源版本。

生成采用新版本或修订副本：程序按模式只合并选定模块，故事圣经的 `lockedFields` 和锁定 Plot Beat 永远从基线版本恢复。生成结果经过 Schema、来源、锁定和一致性检查后作为未保存草稿展示，用户确认后才进入版本数组。

Planning Context 不发送整个项目：世界书按生成目标的实体/关键词筛选，A3 报告由用户勾选，锁定内容最高优先，在 token 预算内裁剪。API 密钥仍只在服务端 Provider 工厂读取。

ProjectDraft v4 新增 `storyPlans[]` 与当前规划 ID；v1–v3 迁移显式保留角色卡、世界书、A3 项目/报告和恢复数据。详细规则见 [planning-methodology.md](planning-methodology.md)。
### B1 实现约束与数据流

- `PlanningContextBuilder` 只发送选中的角色卡、相关启用世界书条目、选定 A3 报告和现有规划；每项来源带权威等级、版本、锁定标记和 token 估算，UI 可展开查看。
- `PlanningGenerator` 始终返回新的 `OutlineVariant` 草稿。`mergeGeneratedVariant` 只合并请求模块，并在字段、节点、阶段、角色弧、关系弧和时间线事件层面恢复锁定内容；用户确认后才写入 `ProjectDraft`。
- `PlanningReferences` 在生成后按来源类型、实体 ID 和版本校验引用；被预算裁剪或不存在的来源会标记为无效并进入一致性问题。
- `PlanningValidator` 检查依赖、自依赖和循环、原因顺序、信息获得顺序、时间线引用、状态连续性、世界规则、高潮关联、锁定修改和重复内容；它只报告，不自动修复源数据。
- 版本复制保留父版本 ID、创建来源、采用状态和时间戳；Markdown/JSON 导出不改变内存事件顺序，JSON 可重新导入并保留来源、状态与版本信息。
- 与 A3 的集成通过创建新的分析输入快照完成，A3 建议不会静默修改 Story Plan。
-
- B1 本轮新增的保护逻辑集中在 `src/services/planning-context-builder.ts`、`planning-references.ts`、`planning-version.ts` 和 `planning-validator.ts`，不改变 A1–A3 的 Provider 或存储边界。

## Phase B2 分卷、分章与场景规划模块

Phase B2 作为 `StoryPlanningWorkspace` 的增量标签存在，仍以 B1 `StoryPlan` / `OutlineVariant` 为权威上游，不复制角色卡、世界书、A3 报告或 B1 规划：

```text
StoryPlanningWorkspace / chapters
  └─ ChapterPlanningWorkspace
       ├─ Volume / Chapter / Scene editors
       ├─ Chapter Planning Context Builder
       ├─ POST /api/generate-chapter-plan
       │    └─ Chapter Planning Generator
       │         ├─ prompts/chapter-planning-v1
       │         ├─ Provider Adapter（Mock/OpenAI/Anthropic）
       │         ├─ JSON 提取、有限修复与 Zod Schema
       │         ├─ 来源与锁定检查
       │         └─ 限定范围合并为新版本
       ├─ Plot Beat Coverage / Chapter & Scene Validator
       ├─ Chapter/Scene Version Compare
       └─ Markdown / JSON import-export
              └─ ProjectDraft v5 / localStorage
```

### 领域边界

`src/domain/chapter-planning.ts` 定义独立的 `ChapterPlanningProject` 聚合。聚合包含 `VolumePlan`、`ChapterPlan`、`ScenePlan`，章节和场景的内容分别放在 `ChapterPlanVersion` 与 `ScenePlanVersion` 中；容器保存顺序、锁定和采用版本，版本保存父版本、创建原因、采用/废弃状态、来源与时间戳。`SceneEntryState` 和 `SceneExitState` 记录时间、地点、在场人物、身体、情绪、目标、关系、已知信息、物品与未解决冲突。信息流与铺垫由 `InformationItem`、`InformationReveal`、`ForeshadowItem` 单独保存，避免把跨场景事实塞进自由文本。

B2 对 B1 的关联只使用稳定 ID：项目保存 `b1PlanId` 与 `b1VariantId`，Volume 可保存 `plotSectionId` 和若干 `plotBeatIds`，Chapter/Scene 版本保存 `b1PlotBeatIds`。B1 内容在 B2 中只读；覆盖服务计算每个 Beat 的完成章节、铺垫位置、回收位置及 `uncovered/planned/partially_covered/covered/duplicated/conflicted` 状态。

### 上下文、生成与锁定保护

`ChapterPlanningContextBuilder` 只收集当前 B1 采用版本、选定 Section/Beat、角色弧、关系路线、时间线、相关角色卡、相关启用世界书条目、前后相邻章节、当前场景、锁定内容和用户明确选中的 A3 报告。每段内容带来源类型、ID、版本、权威级别、锁定和可修改标志，并在项目 token 预算内裁剪；UI 可在发送前展开清单。

模型输出必须是完整 `ChapterPlanningProject` JSON。生成器执行 JSON 提取、Schema 校验、最多两次格式修复、来源校验、B1 ID 规范化、限定范围合并、覆盖和连续性检查。完整生成先成为未保存草稿；局部生成只给选定 Chapter/Scene 新增版本。`locked` 容器禁止删除，`lockedFields` 在合并时总是从基线恢复；锁定冲突进入问题列表，不自动覆盖。

### 检查范围与 A3 集成

`ChapterPlanningValidator` 检查分卷/章节/场景目标、有效变化、场景结果、B1 未覆盖或重复覆盖、人物行动目标、入口出口连续性、章节/场景视角冲突、未标记视角切换、信息揭示来源、重复首次揭示、铺垫回收顺序、无实际回收、来源失效、锁定修改、场景功能重复/过载和连续极端节奏。节奏、功能负载类结果标为启发式；确定的 ID、来源、顺序和状态冲突单独标识。用户可把连续性问题标为确认错误、有意跳跃、中间过程省略或暂不处理。

发送到 A3 会创建新的分析输入快照；A3 报告与建议不会修改 B2。根据建议修订时也只创建章节或场景副本。API 密钥仍只由服务端 Provider 工厂从环境变量读取，ProjectDraft 仅保存 Provider 类型和模型名。

### ProjectDraft v5

ProjectDraft v5 新增 `chapterPlanningProjects[]` 与 `selectedChapterPlanningProjectId`。每个 B2 项目自行保存 B1 版本引用、Volume/Chapter/Scene、采用与历史版本、覆盖、信息流、铺垫、问题、A3 报告引用、提示词版本、Provider 与模型。v1–v4 迁移显式保留角色卡、世界书、A3 报告和 B1 Story Plan，并给 B2 字段安全默认值；解析失败时不覆盖原数据，而把原值放入 `recoveryData` 供备份导出。

## Phase B3 正文辅助生成与修订模块

Phase B3 增加独立“正文写作”一级工作区，B2 `ScenePlanVersion` 是只读上游，正文采用稿和生成建议不会写回 B2：

```text
ProseWorkspace
  ├─ Prose Context Builder（限定 Scene/Chapter/Beat/角色/世界书/前文）
  ├─ POST /api/generate-prose → Provider Adapter（responseFormat=text）
  │    ├─ prompts/prose-v1（15 种受限操作）
  │    ├─ Edit Scope / locked block guard
  │    └─ alternative Draft Version + Revision
  ├─ 独立后处理
  │    ├─ Scene Plan Coverage
  │    ├─ Candidate Fact / Candidate State Change
  │    └─ Prose Validator
  ├─ A3 分析输入 / 非采用 B2 更新副本
  ├─ Markdown / text / JSON import-export
  └─ ProjectDraft v6 / localStorage
```

### 正文领域与原稿保护

`src/domain/prose.ts` 定义 `Manuscript → ChapterDraft → SceneDraft → DraftVersion → TextBlock` 聚合，以及 `Revision`、`EditScope`、`StyleProfile`、`LanguageConstraint`、覆盖、候选和问题 Schema。正文只通过稳定 ID 关联 B1/B2。每次模型操作从一个基础版本创建 `alternative`；接受操作再创建新的 `accepted` 版本，拒绝只切回基础版本，恢复历史也会创建副本，因此不会原地覆盖采用稿。

段落锁定存在 `TextBlock.locked`。调用模型前 `validateEditScope` 校验偏移、段落 ID 和锁定交叠；应用建议时只替换范围内可编辑块，并逐字恢复锁定文本与用户要求保留的片段。直接编辑自动保存为独立 `user_edited` 版本，删除锁定段落的输入会被拒绝。

### 输出分离、上下文与 Provider

正文调用设置 `responseFormat=text`，只返回目标正文。覆盖、事实、状态与质量报告在正文保存为备选版本后独立执行，避免正文和 JSON 混合响应。OpenAI 的 JSON response format 仅用于结构化阶段；正文请求显式关闭。Provider Request 支持 temperature、max tokens、stop sequences、AbortSignal 和可选 `generateStream`。Mock Provider 实现分块流式输出；真实 Provider 在当前 API 路由走非流式回退。

上下文按权威等级和相关性选择当前 Scene、Chapter、B1 Beat、入口/出口状态、在场角色、相关启用世界书条目、信息与铺垫、Style/Language 规则和必要前文。预算不足时优先保留选区附近、最近未完成内容、入口/出口、人物和硬规则，裁剪低权威或较远材料，并在 UI 展示实际清单和截断提示。

### 后处理、集成与数据 v6

Coverage 对场景目标、冲突、行动、转折、结果、离场、信息、关系、铺垫和回收进行语义要素与叙事功能组合判断，结果明确标为启发式。Candidate Fact/State Change 只进入待确认列表；确认事实仍不直接写回 A1/A2/B1/B2。状态候选可创建新的、非采用的 B2 Scene Version。正文或两个版本可创建 A3 输入快照，A3 建议只转为 Revision Task。

ProjectDraft v6 新增 `manuscripts[]` 与 `selectedManuscriptId`。v1–v5 迁移先分别校验并保留角色卡、世界书、分析、B1、B2，再给 B3 字段安全默认值；失败时保持 `recoveryData`，不会清空浏览器原始值。API 密钥仍仅从服务端环境变量读取，正文领域只保存 Provider 类型和模型名。

详细规则见 [prose-generation-methodology.md](prose-generation-methodology.md)。

## Phase C1 长篇连续性、Canon 与进度管理

C1 新增独立“连续性中心”，从 A1–B3 读取稳定来源 ID 和当前采用版本，不改变原有领域聚合：

```text
ContinuityCenter
  ├─ Canon Ledger / Conflict Resolver / Retcon History
  ├─ Local Entity & Full-text Index
  ├─ Character / Relationship / World Snapshots
  ├─ Knowledge Matrix / Plot Threads / Open Questions
  ├─ Foreshadow Tracker / Integrated Project Timeline
  ├─ Chapter & Scene Summaries / Plan-Manuscript Drift
  ├─ Project Continuity Validator / Health / Writing Progress
  ├─ Next Chapter Context Package
  ├─ POST /api/generate-continuity
  │    ├─ prompts/continuity-v1
  │    ├─ Provider Adapter（Mock/OpenAI/Anthropic）
  │    └─ JSON 提取、最多两次修复、Zod 与来源校验
  ├─ Markdown / JSON import-export
  └─ ProjectDraft v7 / localStorage
```

### 领域和权威边界

`src/domain/continuity.ts` 定义 `ContinuityProject` 聚合，以及 Canon、实体、三类状态快照、知情状态、剧情线、问题、伏笔、全书时间线、摘要、偏差、连续性问题、健康、进度和上下文包 Schema。所有 C1 主模型都有稳定 ID、数据版本、状态、来源、时间戳和安全默认值。C1 只通过来源类型、来源 ID 和版本引用 A1–B3；不复制或取代角色卡、世界书、Story Plan、B2 规划和 Manuscript。

Canon 使用九级权威：用户锁定 Canon 最高，用户确认正文、采用正文、确认角色卡/世界书、采用规划、确认状态、未确认候选、模型推断和模型建议依次降低。提取内容永远先进入 `candidate`，同名内容不会自动合并。冲突由用户明确选择保留、采用、分时生效、共存、Retcon、误报或暂缓。Retcon 保留旧事实并产生新事实及影响清单，不反向覆盖来源。

### 派生、检查与上下文

实体索引使用本地 Unicode 规范化和全文/元数据匹配，不依赖外部向量数据库。状态快照主要从 B2 Entry/Exit 和经确认候选派生；摘要只读取 B3 accepted 版本，版本切换会把旧摘要标为 stale。写作进度也只统计 accepted 正文。时间线合并 B1、B2、Canon 和 C1 事件，并保留每项来源。

连续性检查区分可确定的 ID、状态、来源和顺序冲突与人物恢复、剧情停滞、伏笔匹配等启发式判断。偏差处理、Canon 确认、Retcon、问题处理和下一章包发送都需要用户操作；模型建议不自动修改 Canon、规划或正文。上下文构建器按锁定、权威和相关性排序，在字符预算内裁剪，并向用户展示实际包含项。

### ProjectDraft v7 与安全

ProjectDraft v7 新增 `continuityProjects[]` 与 `selectedContinuityProjectId`。v1–v6 迁移继续逐项校验并保留角色卡、世界书、A3、B1、B2 和 B3 Manuscript，C1 字段使用空数组和 null 安全默认值；失败时完整原值进入 `recoveryData`。Provider 密钥继续只由服务端工厂从环境变量读取，C1 本地数据只保存 Provider 类型、模型和 Prompt/来源版本。

详细规则见 [continuity-methodology.md](continuity-methodology.md)。

## Phase C2.1 移动端、PWA 与跨设备工作区

C2.1 不新增第二套应用。现有 App Router 页面和 A1–C1 领域聚合继续作为唯一业务实现，移动层只改变壳、信息密度、辅助面板呈现和持久化边界：

```text
Responsive App Shell
  ├─ Desktop sidebar / tablet drawer / mobile bottom shortcuts
  ├─ Connectivity + save + workspace sync status
  ├─ PWA Runtime（manifest / service worker / install / update）
  └─ Existing A1–C1 workspaces（single-column mobile composition）

ProjectStorageAdapter
  ├─ BrowserProjectStorage（IndexedDB，legacy localStorage recovery）
  └─ ServerWorkspaceStorage（authenticated API + optimistic concurrency）
       └─ ServerFileWorkspaceStore（user-controlled WORKSPACE_DATA_DIR）
```

### 响应式和离线边界

全局壳在桌面使用固定侧栏，在平板和手机使用同一个焦点可管理抽屉；手机增加首页、规划、正文和更多四个底部快捷入口。页面主内容在 768px 以下始终单列，次要面板按标签或底部区域切换，正文可以进入动态视口全屏模式。所有排序保留按钮路径，文件导入使用原生选择器，主要触摸目标至少 44px，并为安全区预留底部空间。

Service Worker 只缓存公开应用壳、构建静态资源、图标和离线页。`/api/`、Provider 请求/响应、认证数据、项目 JSON 和用户文件明确绕过 Cache Storage。更新不会自动刷新；用户确认且草稿保存后才激活。离线时本机项目可读写，模型操作禁用且不建立失败请求重放队列。

### 本机与工作区存储

浏览器本机模式由统一异步 `ProjectStorageAdapter` 管理，优先写 IndexedDB，并把旧 `story-card-studio-draft` 迁移为带项目 ID、版本和修改时间的记录。旧值和 `recoveryData` 保留为恢复渠道；数据库不可用或容量不足时回退 localStorage 并允许导出。C2.1 完成时 ProjectDraft 的领域数据版本为 v7；存储记录版本与领域版本相互独立。C2.2 在此边界上把领域数据升级为 v8，而不改变工作区乐观并发版本的含义。

可选工作区模式通过同源 API 访问用户控制的服务端 JSON 工作区。每次保存携带 `expectedVersion`，不匹配时返回 409；客户端停止覆盖并保留本机副本。服务端使用原子写入、单用户 HttpOnly 会话、CSRF、Origin/CORS 白名单、登录频率限制和请求体大小限制。Provider 密钥仍只存在服务端环境变量，工作区接口和 PWA 缓存都不会返回或保存密钥。

详细使用、安全部署、离线和冲突规则见 [mobile-and-pwa.md](mobile-and-pwa.md)。

## Phase C2.2 小说文件解析与逆向建模

C2.2 新增一级“小说导入”工作区，但不复制 A1 角色卡、A2 世界书、B3 Style Profile/Language Constraint 或 C1 Canon/连续性模型。文档解析域只负责文件来源、章节、区块、任务、来源位置和未确认候选；写入既有模块时通过转换服务创建草稿或候选。

```text
NovelImportWorkspace
  ├─ 上传 / 文本预览 / 章节确认 / 解析配置
  │    └─ Local Document Pipeline
  │         ├─ File Validator（TXT/PDF、签名、SHA-256、默认 50 MiB）
  │         ├─ TXT Parser（UTF-8/BOM、UTF-16 LE/BE、GB18030）
  │         ├─ PDF.js Text-layer Parser（ready / needs_password / needs_ocr）
  │         ├─ Text Normalizer + normalized-to-raw offset map
  │         ├─ Chapter Segmenter + manual corrections
  │         └─ Chapter-first Chunk Planner + bounded overlap
  ├─ 处理进度
  │    └─ Extraction Orchestrator
  │         ├─ bounded queue / retry / cancel
  │         ├─ per-chunk checkpoint / partial result
  │         └─ optional selected-chunk Provider extraction
  ├─ 候选审查 / 来源跳转 / 解析报告
  │    ├─ conservative Entity Resolver
  │    ├─ deterministic Style Statistics
  │    └─ SourceSpan → existing document source reference
  └─ 写入项目（explicit user action）
       ├─ Character Card draft（A1）
       ├─ Lorebook draft（A2）
       ├─ Style/Profile language candidates（B3）
       └─ Canon/state/timeline/thread/foreshadow candidates（C1）

DocumentIngestionProject（ProjectDraft v8：元数据、检查点、候选与重跑用 chunk text）
  ↕ asset references
DocumentAssetStorage
  ├─ BrowserDocumentAssetStorage（独立 IndexedDB）
  ├─ MemoryDocumentAssetStorage（无 IDBFactory 环境的回退/测试）
  └─ asset kinds: original / raw_text / normalized_text（page_map 类型预留）
```

### 领域与数据边界

`src/domain/document-ingestion.ts` 定义版本化 `DocumentIngestionProject` 聚合。`DocumentSource` 保存文件名、类型、大小、编码、页/章/段/字符数、指纹、解析状态、权利确认、外部模型权限、警告、来源版本和资产引用，本身不保存完整正文或 PDF 密码。章节、区块、检查点、候选、实体消歧和转换草稿都使用 Zod Schema；默认状态是 `draft`、`pending` 或 `local_only`。为支持检查点恢复和 Provider 重跑，`DocumentChunk.text` 会随 ProjectDraft 保存，全部区块可能覆盖大部分或全部提取正文。

ProjectDraft 从 v7 升级为 v8，新增 `documentIngestions[]` 和 `selectedDocumentIngestionId`。v7 迁移保留 A1–C1 的角色卡、世界书、分析、B1/B2 规划、B3 正文和 C1 连续性数据，并给 C2.2 字段空数组/null 安全默认值。解析失败时完整原值进入 `recoveryData`，不会用空状态清除旧项目。`DOCUMENT_INGESTION_DATA_VERSION` 独立于 ProjectDraft 版本，当前为 1。

### 文件、文本和资产

文件入口要求用户先确认处理权利，然后校验扩展名、MIME、文件签名、空文件、容量和重复 SHA-256 指纹。单文件默认上限为 50 MiB，并允许调用方通过 `maxBytes` 配置。TXT 解码覆盖 UTF-8、UTF-8 BOM、UTF-16 LE/BE 和 GB18030；低置信度、替换字符或异常单行形成警告，并允许以明确编码重新解析。

PDF.js 只提取已有文本层，并保留逐页字符范围。加密文件返回 `needs_password`，无文本层返回 `needs_ocr`；`OcrAdapter` 只是后续替换边界，C2.2 不内置完整 OCR，也不会把空文本当作解析成功。多栏/阅读顺序、空页和字符映射异常形成风险警告。

原始二进制、完整 raw 文本和完整 normalized 文本不随 ProjectDraft 高频自动保存。`DocumentAssetStorage` 按文档分别保存这些资产，并支持字符范围读取、指纹查询和按 `documentId` 删除；`page_map` 是接口预留类型，当前 PDF 页范围保存在解析结果与 Source Span 中，不另写 page-map 资产。浏览器资产库使用独立 IndexedDB；只有执行环境缺少 `IDBFactory` 时使用内存实现，IndexedDB 打开或事务错误必须显式上报。ProjectDraft 仍保存用于检查点/重跑的 `DocumentChunk.text`，因此项目记录和 JSON 导出需要按正文敏感数据保护。

### 规范化、分章、分块与 Source Span

规范化统一换行和部分空白，移除异常控制字符，并在可判定时清理重复页眉、页脚或页码。`TextOffsetMapSegment` 保留规范化位置到原始位置的映射及变换类型；跳转结果因此可以准确标为 `mapped`、`approximate` 或 `unmapped`。

章节服务先识别常见中文和英文标题，无标题文本使用低置信度 fallback 章节；重命名、拆分、相邻合并和重排都产生手动确认状态。区块规划先服从章节边界，再尽量在段落/句末结束。默认目标为 6000 字符、重叠 400 字符；每块保存来源范围、估算 token、重叠、处理状态、重试计数和提取版本，重叠提取按内容及来源区间去重。

`SourceSpan` 保存文档/来源版本、章、可用的页和段、字符区间、最长 280 字符的短摘录、置信度和映射状态。转换到 B3/C1 时使用既有 `document` 来源类型，来源跳转描述包含章、页、段和字符范围；近似映射不会伪装成精确引用。

### 长任务、Provider 与候选写入

`ExtractionOrchestrator` 以有界并发队列处理区块，默认并发 2、最大 5。任务检查点保存完成/失败区块、最后顺序、阶段和时间；取消保留部分结果，恢复跳过已完成区块，失败重试耗尽后保留 `partially_completed` 状态。检查点存入 ingestion 任务记录后才具有跨刷新恢复语义。

默认流程完全本地，可完成解析、分块、来源映射和确定性文体统计，Document Source 权限为 `local_only`。外部 Provider 只有在用户显式允许并触发分析后才接收所选区块，权限记录为 `chunks_only`；每次请求只有一个 `DocumentChunk`。单一区块达到文档约 90% 时禁止发送，避免以区块名义提交整本短文档。`POST /api/analyze-document` 使用递归 strict 的最小 DTO，只允许分块必要字段、可选 Provider/模型和受限分析开关；任务错误、重试状态、额外正文和密钥字段均不可进入 Provider。接口强制 `application/json`、限制 256 KiB 总请求体和 50,000 字符单块，校验同源/Origin、拒绝跨站浏览器请求，在工作区模式要求有效会话，并按来源限制频率。Provider 不接收 PDF 密码。一次提取及其最多两次 JSON 修复共享同一总 deadline；结构化返回经过 JSON 提取、Schema 校验后，模型返回的来源元数据会以本地 canonical Source Span 重建，越界引用被剔除，结果仍只进入候选集合。

实体解析采用保守分类：只有共享稳定实体 ID 才判定 `same_entity`；`probably_same`、同名冲突和其他不确定关系都要求用户决定。角色卡和世界书转换结果保持 `draft`，Style Profile 保持 `alternative`，Language Constraint 只生成 preferred/advisory，Canon、状态、时间线、剧情线和伏笔保持 candidate。“写入项目”是显式操作，默认创建新草稿、比较或待合并候选，不覆盖已确认数据，也不自动确认候选或实体合并。

### 隐私、导出、删除与恢复

小说资产、Provider 请求/响应、密码、会话和密钥不进入 Service Worker Cache。Provider 密钥只存在服务端环境变量；日志不得记录完整小说、完整请求文本、PDF 密码或令牌。ingestion JSON 经过 Schema 校验并清理密码、密钥和诊断日志等敏感旁路字段；它不内嵌原文件或完整 raw/normalized 资产，但会保留 `chunks[].text` 以便恢复，因此导出本身仍可能包含接近完整的提取正文。

工作区提供两种不同删除语义：删除原文件/提取文本时，按文档删除 `original`、`raw_text`、`normalized_text` 以及以后可能存在的 `page_map` 资产，并清空章节段落文本与 `chunks[].text`，但保留结构化候选及短来源摘录；来源跳转随后显示资产不可用。删除整个导入项目时，按所有关联 `documentId` 删除资产，并从 ProjectDraft 移除对应 ingestion 聚合。已经由用户确认并写入 A1/A2/B3/C1 的独立资料不会级联删除。

恢复分为三层：任务检查点与 `chunks[].text` 恢复未完成区块，文档资产允许重新选编码/分章/解析，ProjectDraft `recoveryData` 保存迁移失败的原始项目。JSON 不含原始二进制或完整 raw/normalized 资产；若资产和区块文本都已删除，只能恢复候选和短摘录，不能保证重新解析或完整来源跳转。

工作区同步只覆盖结构化 ProjectDraft。浏览器 IndexedDB 中的原始文件、raw 文本和 normalized 文本是设备本地资产，不会被工作区 API 自动上传到其他设备；跨设备打开时可以继续查看候选、章节元数据和已保存区块，但完整原文跳转、重新解码或重新解析需要在目标设备重新附加原文件。这一边界避免把用户小说资产默认变成云端文件存储。

完整支持范围、操作说明和已知限制见 [document-ingestion.md](document-ingestion.md)。
