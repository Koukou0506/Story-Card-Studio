# Story Card Studio 视觉设计系统（Phase C2.0）

## 1. 文档状态与范围

本文定义 Phase C2.0 的视觉语言、语义 Token、密度规则、响应式基础和可访问性底线。它是后续 UI 实施的约束，不改变业务逻辑、领域模型、导入导出格式或本地数据结构。

本轮仅形成设计方案。生产组件、现有 CSS 和依赖均未修改。

## 2. 参考依据

### 2.1 Greenboard 页面观察

检查日期：2026-07-14。

参考地址：<https://www.greenboard.com/?ref=land-book.com>

桌面视口下可验证的结构特征：

- 1280 × 720 视口中，导航约 71px 高并使用粘性定位；
- 首屏内容块约 1236px 宽，占视口约 96.5%，页面主要依靠块内留白而不是窄内容列；
- H1 约 62px，字重 600，行高约等于字号，标题承担首要视觉重量；
- 首屏主块内边距约 18px，CTA 可点击高度约 44px；
- 大块面的实际圆角约 6px，圆角克制，不是胶囊化界面；
- 导航信息密度低，主 CTA 与文字导航有清楚的层级差；
- 内容按“大标题—短说明—单一操作—大块视觉”组织，章节之间留白明显；
- 中段使用横向切换和大尺度内容块，强调一次只阅读一个主题；
- 常见交互过渡约 0.2s，展开与淡入约 0.4s，主要改变颜色、透明度和位移；
- 页面使用轮播和大图作为营销叙事手段，这些不适合直接复制到高密度创作工具。

本项目只借鉴其留白、标题比例、粘性导航、单一主 CTA、块面节奏和克制动效。不采用 Greenboard 的 Logo、品牌文字、插图、照片、专有图标、绿色品牌配色或逐像素布局。

### 2.2 色卡验证

用户指定的文件路径为 `docs/design-reference/greenboard-palette.jpeg`，仓库实际文件是根目录 `greenboard-palette.jpeg`。本轮不移动文件，只记录路径差异。

对图片十个色块中心像素的采样结果依次为：

`#FCFCF0`、`#82816C`、`#F5F4E0`、`#999883`、`#1E1412`、`#C3C4BE`、`#9A9A90`、`#7E7E76`、`#C5C4AF`、`#294A97`。

JPEG 压缩会产生 ±1 的通道偏差，因此设计系统采用 `UI.md` 中的规范值：

`#FCFCF1`、`#81816C`、`#F4F4E0`、`#999882`、`#1E1412`、`#C2C4BD`、`#9A9A90`、`#7F7E76`、`#C4C4AF`、`#294A97`。

## 3. 视觉原则

1. **内容先于装饰**：正文、字段值、问题结论和来源证据必须比容器更醒目。
2. **宽松外壳，分层密度**：页面标题和主编辑区使用舒适密度；表格、索引、版本和问题列表允许紧凑密度。
3. **一个区域一个主操作**：每个页面区块只突出一个主 CTA，其余操作降为次级、文字或溢出菜单。
4. **层级依靠尺度与空间**：优先使用字号、字重、留白和表面色，不靠大量边框和阴影堆叠。
5. **钴蓝只表达交互**：主操作、选中、链接、焦点和少量关键数据使用 accent；不把整页染蓝。
6. **状态不能只靠颜色**：错误、警告、成功和选中状态必须同时具有图标、文字、边框或形状变化。
7. **长文可读，工具可扫**：正文阅读列限制宽度；数据工具区允许更宽但维持稳定列对齐。
8. **行为保持可逆**：生成、修订、合并、删除与写回操作持续显示影响范围和版本保护。

## 4. 语义颜色 Token

### 4.1 核心 Token

| 语义 Token | 值 | 用途与限制 |
|---|---:|---|
| `--color-bg-canvas` | `#FCFCF1` | 应用画布、长时间阅读背景 |
| `--color-bg-surface` | `#F4F4E0` | 页面分区、非浮起卡片 |
| `--color-bg-raised` | `#FFFFFF` | 编辑器、弹层、需要清晰边界的表单 |
| `--color-bg-subtle` | `#F8F8EA` | 表格表头、悬停底色、只读区域；由色卡浅色混合得到 |
| `--color-bg-muted` | `#C4C4AF` | 装饰性色块、禁用区底层，不承载小字 |
| `--color-bg-cool` | `#C2C4BD` | 中性状态区、信息摘要底层，不承载小字 |
| `--color-text-primary` | `#1E1412` | 标题、正文、字段值 |
| `--color-text-secondary` | `#5E5E50` | 辅助说明、元数据；由色卡橄榄色加深以满足对比度 |
| `--color-text-tertiary` | `#6B6A5C` | 禁用文字和非关键元数据，不用于主要正文 |
| `--color-border-subtle` | `#C4C4AF` | 分隔线和装饰边框，不单独承担控件边界 |
| `--color-border-control` | `#81816C` | 输入框、未选按钮和可交互边界 |
| `--color-action-primary` | `#294A97` | 主按钮、链接、选中、关键数据 |
| `--color-action-hover` | `#213C7C` | 主交互 Hover |
| `--color-action-active` | `#192E62` | 主交互 Active / Pressed |
| `--color-focus-ring` | `#294A97` | 3px 焦点环，外加 2px canvas 间隔 |
| `--color-disabled-bg` | `#E6E6D6` | 禁用控件背景 |
| `--color-disabled-text` | `#6B6A5C` | 禁用文字；仍保持可读，但不表示可交互 |
| `--color-error` | `#9F2F2F` | 错误与破坏性操作 |
| `--color-warning` | `#7A4F00` | 警告、兼容性风险、未确认冲突 |
| `--color-success` | `#2F6B45` | 成功、有效来源、已确认状态 |

### 4.2 状态背景

| Token | 值 | 前景 |
|---|---:|---:|
| `--color-error-subtle` | `#F7E7E5` | `--color-error` |
| `--color-warning-subtle` | `#F5ECD4` | `--color-warning` |
| `--color-success-subtle` | `#E3EFE6` | `--color-success` |
| `--color-info-subtle` | `#E7ECF7` | `--color-action-primary` |

状态背景只作为辅助提示；图标、标题和状态文字仍必须出现。

用户要求的语义映射为：背景 = `--color-bg-canvas`，表面 = `--color-bg-surface` / `--color-bg-raised`，文字 = `--color-text-primary`，次级文字 = `--color-text-secondary`，边框 = `--color-border-subtle` / `--color-border-control`，主交互 = `--color-action-primary`，Hover = `--color-action-hover`，Active = `--color-action-active`，Focus = `--color-focus-ring`，Disabled = `--color-disabled-bg` / `--color-disabled-text`，Error = `--color-error`，Warning = `--color-warning`，Success = `--color-success`。

### 4.3 颜色使用规则

- `olive`、`olive-soft`、`neutral` 和浅灰橄榄色不用于 16px 以下的普通正文；
- `--color-border-subtle` 与 canvas 的对比度仅约 1.71:1，不能单独表示输入框或按钮边界；
- 表单控件使用 `--color-border-control`，与 canvas 的对比度约 3.84:1；
- 主按钮默认使用白字配 `--color-action-primary`；
- 危险按钮在不可逆操作时才使用实心 error，其余错误采用浅底提示；
- Success 不等于“自动接受”，只表示操作成功或来源有效。

## 5. 对比度校验

按 WCAG 2.2 相对亮度公式校验。普通文字最低 4.5:1，大号文字最低 3:1，关键控件边界与焦点最低 3:1。

| 前景 | canvas `#FCFCF1` | surface `#F4F4E0` | white | 结论 |
|---|---:|---:|---:|---|
| ink `#1E1412` | 17.47:1 | 16.21:1 | 18.04:1 | AAA，所有主要文字可用 |
| secondary `#5E5E50` | 6.37:1 | 5.91:1 | 6.58:1 | AA，辅助正文可用 |
| olive `#81816C` | 3.84:1 | 3.57:1 | 3.97:1 | 仅大字、粗体或非文字 UI |
| accent `#294A97` | 8.07:1 | 7.48:1 | 8.33:1 | AAA，可用于文字和按钮 |
| error `#9F2F2F` | 6.96:1 | 6.46:1 | 7.19:1 | AA/AAA，可用于状态文字 |
| warning `#7A4F00` | 6.90:1 | 6.40:1 | 7.13:1 | AA/AAA，可用于状态文字 |
| success `#2F6B45` | 6.14:1 | 5.70:1 | 6.34:1 | AA，可用于状态文字 |
| disabled text `#6B6A5C` | 5.29:1 | 4.91:1 | 5.47:1 | 可读；语义仍由禁用状态表达 |

白字与 accent、hover、active 的对比度分别为 8.33:1、10.49:1、13.06:1。

## 6. 字体与排版

不安装新字体。系统字体优先保证中文可读性和加载稳定性。

```css
--font-ui: Inter, "SF Pro Text", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
--font-reading: ui-serif, "Songti SC", "STSong", serif;
--font-mono: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
```

`--font-reading` 只用于正文写作的可选阅读模式，默认表单和工具 UI 全部使用 `--font-ui`。

| 层级 | 字号 / 行高 | 字重 | 用途 |
|---|---|---:|---|
| Display | 48 / 56px | 650–700 | 项目首页主标题，仅桌面 |
| H1 | 40 / 48px | 650–700 | 一级工作区标题 |
| H2 | 32 / 40px | 650 | 页面分区主标题 |
| H3 | 24 / 32px | 600 | 卡片组和编辑模块标题 |
| H4 | 20 / 28px | 600 | 面板标题 |
| Lead | 18 / 30px | 400 | 页面说明、摘要结论 |
| Body | 16 / 26px | 400 | 正文、表单主要内容 |
| Body small | 14 / 22px | 400–500 | 标签、工具、列表 |
| Meta | 12 / 18px | 500 | 时间、版本、计数；必须使用可访问颜色 |
| Prose | 17 / 31px | 400 | 正文编辑与阅读 |

中文标题不使用极端负字距；英文/数字展示标题可在 `-0.02em` 内微调。正文段落最大宽度控制在 42–46 个汉字视觉宽度。

## 7. 间距、圆角、边框与阴影

### 7.1 间距

以 4px 为基础单位：`4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80`。

- 控件内部：8–12px；
- 同组字段：12–16px；
- 卡片内部：20px（紧凑）或 24–32px（舒适）；
- 页面区块：32–48px；
- 页面头部到主内容：40–64px；
- 首页大区块：64–80px。

### 7.2 圆角

| Token | 值 | 用途 |
|---|---:|---|
| `--radius-xs` | 4px | 代码片段、微型标签 |
| `--radius-sm` | 8px | 小按钮、状态块 |
| `--radius-md` | 10px | 输入框、标准按钮 |
| `--radius-lg` | 16px | 常规卡片、检查项 |
| `--radius-xl` | 24px | 首页 Hero、大型空状态 |
| `--radius-pill` | 999px | 状态胶囊，不用于所有按钮 |

参考站本身的圆角较小；本项目根据 `UI.md` 的 Editorial Creative Workspace 定位，将大圆角限制在首页和大块面，数据工具仍使用 8–16px。

### 7.3 边框与阴影

- 装饰分隔：1px `--color-border-subtle`；
- 控件边界：1px `--color-border-control`；
- 选中边界：2px accent 或 3px 内嵌强调，不同时叠加重阴影；
- 常规卡片默认无阴影；
- 浮动工具条：`0 1px 2px rgba(30, 20, 18, 0.06)`；
- 弹层：`0 12px 32px rgba(30, 20, 18, 0.12)`；
- 不使用大面积发光、渐变阴影或多层拟物阴影。

## 8. 图标

- 使用统一的 1.75px 线性图标，尺寸 16 / 20 / 24px；
- 导航图标必须配文字标签，不能只用 Emoji；
- 成功、警告、错误图标必须与文字状态并存；
- 破坏性操作使用明确的“删除”文字，不只使用垃圾桶图标；
- 不复制 Greenboard 的品牌图标或插图；
- C2.0 实施阶段优先使用项目内 SVG 或 CSS 图标，不以此为由引入完整 UI 框架。

## 9. 动效

| Token | 时长 | 用途 |
|---|---:|---|
| `--motion-fast` | 120ms | Hover、Pressed、焦点 |
| `--motion-base` | 180ms | 标签切换、行展开 |
| `--motion-panel` | 240ms | 抽屉、检查器、弹层 |

统一使用 ease-out：`cubic-bezier(0.16, 1, 0.3, 1)`。

- 只动画 `opacity` 和 `transform`，必要时动画颜色；
- 不动画大范围高度导致的页面跳动；
- 加载使用骨架屏或小型进度，不使用全页旋转器；
- Toast 从右上轻移 8px 并淡入，不横跨整屏；
- `prefers-reduced-motion: reduce` 下取消位移和循环动画，仅保留即时状态变化；
- 不采用参考站的营销轮播作为工具页的主要导航。

## 10. 页面宽度与响应式基础

| Token / 断点 | 值 | 行为 |
|---|---:|---|
| `--shell-max` | 1600px | 应用外壳最大宽度 |
| `--content-max` | 1440px | 常规工作区最大宽度 |
| `--form-max` | 1120px | 长表单最大宽度 |
| `--reading-max` | 760px | 正文阅读和编辑列 |
| 桌面 | ≥1280px | 240px 导航 + 主区 + 可选 320px 检查器 |
| 紧凑桌面 | 1024–1279px | 80px 收窄导航或可折叠 240px 导航；检查器可收起 |
| 平板 | 768–1023px | 导航抽屉；主内容单列；检查器为右侧抽屉或底部面板 |
| C2.1 移动端 | <768px | 本轮只保证结构不阻断，完整交互留给 C2.1 |

页面水平留白：桌面 64px、紧凑桌面 40px、平板 24px。正文写作中央列始终以 760px 为上限，侧栏不挤压正文到 560px 以下。

## 11. 分层密度

推荐提供两种组件密度，而不是全局“放大”或“压缩”：

| 密度 | 行高 / 控件高 | 适用页面 |
|---|---:|---|
| Comfortable | 44–48px | 首页、创意输入、角色卡、正文写作、空状态 |
| Compact | 34–40px | 世界书条目列表、来源表、版本、连续性、问题和时间线 |

页面可以组合密度，但同一面板内必须一致。用户切换密度时只改变间距和行高，不改变信息层级、字段顺序或功能。

## 12. 共享组件规范

后续实施优先建立以下共享视觉组件，不改变其业务数据接口：

- `AppShell`：项目导航、上下文顶栏、全局状态；
- `PageHeader`：标题、说明、状态和单一主操作；
- `Button`：primary / secondary / ghost / danger；
- `Field`：标签、说明、错误、字符计数和关联 ID；
- `Card` / `Section`：舒适与紧凑两种密度；
- `Tabs` / `SegmentedControl`：页面内最多 5 个常用项，更多项进入侧栏或溢出菜单；
- `Toolbar`：筛选、搜索、批量操作，支持粘性；
- `SplitPane`：列表、编辑器、检查器三段布局；
- `StatusBadge`：文字 + 图标 + 色彩；
- `IssueRow`：严重程度、置信度、依据、建议和处理状态；
- `SourceReference`：来源类型、版本、有效性和摘录；
- `EmptyState` / `LoadingState` / `ErrorState`；
- `Toast` / `InlineNotice` / `ConfirmDialog`；
- `VersionSwitcher` / `DiffViewer`。

## 13. 交互与可访问性底线

- 所有键盘可操作元素必须有 3px focus ring，不能只改变颜色；
- 当前一级导航使用 `aria-current="page"`，标签使用正确的 tab / tabpanel 关系；
- 表单标签使用 `label` + `htmlFor`，错误通过 `aria-describedby` 关联；
- Toast 和异步错误使用适当的 `aria-live`，不依赖 4 秒后自动消失的唯一提示；
- 提供“跳到主内容”链接；
- 触控目标至少 44 × 44px，紧凑表格中的次要图标按钮至少 36 × 36px，并提供可见标签或 Tooltip；
- 删除、替换、合并和写回角色卡必须显示影响范围；
- 表格在窄屏转换为主从列表，不靠水平滚动承载核心编辑；
- 所有信息状态都同时提供文字，不只使用红、黄、绿；
- 支持 200% 页面缩放，不遮挡主要操作。

## 14. 实施边界

Phase C2.0 后续实施只负责视觉系统和布局迁移：

- 不改变 Provider、Schema、数据迁移、导入导出和生成流程；
- 不删除 A1–C1 功能；
- 不安装新的 UI 框架；
- 不把复杂工作区重新实现为另一套应用；
- 第一批先迁移应用外壳、项目首页、角色卡、世界书和正文写作；
- 第二批再迁移剧情分析、小说规划、连续性中心、导入导出和设置。
