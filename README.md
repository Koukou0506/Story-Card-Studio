# Story Card Studio

一个面向中文创作者的本地优先长篇创作工作台，覆盖角色、世界、分析、规划、正文与连续性管理。



## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置 API 密钥（可选）

```bash
# 复制环境变量模板
cp .env.example .env.local

# 编辑 .env.local，填入 API 密钥（可选）
# 不配置密钥时可以使用 Mock Provider
```

### 3. 启动开发环境

```bash
npm run dev
```

### Web 访问地址

- 当前电脑：<http://localhost:3000>
- 同一局域网内的手机或平板：`http://<运行本项目的电脑局域网 IP>:3000`
- 已配置 HTTPS 的工作区服务器：使用部署时配置的 HTTPS 域名

局域网 IP 会随网络环境变化，因此不要把开发终端中显示的临时 IP 当成永久地址。远程访问必须使用 HTTPS、工作区认证和受控网络，不要无认证地把端口直接暴露到公网。

### 4. 使用 Mock Provider

Mock Provider 是默认选项，无需任何 API 密钥即可体验角色卡、世界书、规划、正文与连续性流程：

1. 打开应用后，在生成面板选择 "Mock（测试用）" provider
2. 在项目输入区填写角色想法
3. 点击"开始生成"
4. 查看生成的示例角色卡
5. 切换到“世界书”，从想法、角色卡或两者联合生成结构化条目
6. 编辑、模拟激活、检查质量并导出独立 World Info，或写入角色卡 Character Book
7. 在“小说规划”创建场景计划，再到“正文写作”生成场景、比较修订并检查新增事实
8. 切换到“连续性中心”，从当前项目建立连续性资料，或加载完整 Mock 演示 Canon 冲突、Retcon、剧情线、伏笔和下一章上下文
9. 切换到“作品导入与重建”，批量导入作品文件、审查卷章与版本，并把确认后的正文版本和候选资料安全写入项目

### 5. 使用 OpenAI

在 `.env.local` 中配置：

```
DEFAULT_PROVIDER=openai
OPENAI_API_KEY=sk-your-openai-api-key
```

### 6. 使用 Anthropic

在 `.env.local` 中配置：

```
DEFAULT_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-your-anthropic-api-key
```

## 运行测试

```bash
npm test
```

查看测试覆盖率：

```bash
npx vitest run --coverage
```

## 生产构建

```bash
npm run build
npm start
```

构建产物输出到 `.next/` 目录，默认监听 3000 端口。

## 功能边界

### 当前支持 ✓

- 输入自然语言角色想法，调用 AI 生成结构化角色卡
- 原创和同人两种创作模式
- Character Card V2 (spec v2.0) 完整字段支持
- 表单编辑所有角色卡字段（基础 + 高级）
- 9 条自动质量检查规则
- 导出为 SillyTavern 兼容的 JSON 文件
- 导入已有角色卡 JSON 文件
- round-trip：导出后重新导入内容一致
- 未知 extensions 字段在导入/导出中完整保留
- localStorage 自动保存草稿，刷新后恢复
- Mock Provider 无需 API 密钥即可完整体验
- OpenAI 和 Anthropic Provider Adapter
- 中文界面，所有字段提供中文说明
- 与外部格式解耦的 Lorebook / Entry / ActivationRule 领域模型
- SillyTavern 1.18.0 独立 World Info JSON 导入、编辑、导出和 round-trip
- Character Card V2 `data.character_book` 读取、写回、替换和安全合并预览
- 世界书新增、复制、删除、排序、筛选、搜索、批量启停和高级规则编辑
- 世界书质量检查与目标格式兼容性警告
- 普通关键词、正则、大小写、常驻和次级逻辑的本地近似激活模拟
- 旧版角色卡本地草稿自动迁移；失败时保留原始恢复数据
- 单剧情方案分析和最多三个剧情分支比较
- 权威等级、相关性和 token 预算驱动的上下文筛选及发送前预览
- 因果、人物动机、信息能力、世界规则、连续性和关系推进报告
- 可校验来源引用、严重程度、置信度和八维整数评分
- 最小修改方案、副作用、项目备注、旧版本报告提示
- Mock Provider 离线分析，以及 Markdown / JSON 报告导出
- 旧版角色卡与世界书草稿的无损迁移
- 可锁定的故事圣经与创作约束
- 关联现有角色卡的角色规划、角色弧和关系路线
- 8–12 节点宏观大纲、九类因果依赖和简单事件时间线
- 角色、关系和世界状态变化及规划一致性检查
- 多规划版本保存、采用、废弃和差异比较
- 规划整体、节点和角色弧发送到剧情分析（不会自动应用建议）
- Mock 完整规划、Markdown/JSON 导出和 JSON round-trip
- 角色卡、世界书与剧情分析旧草稿的兼容迁移
- 故事规划节点到分卷、章节与场景的覆盖追踪
- 分卷目标、章节目标、章节钩子、场景目标/冲突/转折/结果的表单编辑
- 第一人称、第三人称限知、第三人称全知、多视角和自定义视角配置及基础越权检查
- 场景入口/出口的时间、地点、人物、身体、情绪、关系、信息和物品状态继承检查
- 作者、读者和角色信息状态，首次揭示、秘密、误导与验证状态
- 基础铺垫、强化、计划回收和实际回收记录
- 章节与场景节奏强度、信息密度、功能重复和过载提示
- 单章/单场景局部生成、锁定字段保护、章节/场景多版本保存与差异比较
- 单章、单场景和关系场景发送到剧情分析；分析建议只创建副本或备注，不会静默应用
- 章节与场景 Mock Provider、Markdown/JSON 导出、JSON round-trip 与旧项目迁移
- 从场景计划生成完整场景、开头、冲突、转折、结尾和光标续写
- 选区重写、扩写、压缩、对话/动作/心理/环境增强与节奏调整，范围外正文受保护
- Text Block 段落锁定、Draft Version、Revision、段落级差异、全部/部分接受和历史恢复
- 可复用 Style Profile，以及项目级、角色级和场景级 Language Constraint
- 按光标附近、当前场景、上一场结尾、章节摘要、手动或自动相关选择前文，并提供上下文预算提示
- 独立 Scene Plan Coverage、正文质量检查、新增事实候选与状态变化候选；候选不会自动写回设定
- 正文与场景计划发送到剧情分析，以及基于确认状态创建非采用的章节与场景更新副本
- Mock 流式临时草稿、取消后 incomplete 版本，以及 Markdown / 纯文本 / JSON 导出和 round-trip
- 角色、世界、分析与规划旧草稿的兼容迁移和原始恢复数据保护
- Canon Ledger、九级权威、候选确认、冲突处理、Retcon 历史和锁定保护
- 从角色卡、世界书、采用正文与 Candidate Fact 提取 Canon 候选，永不自动确认或合并同名事实
- 本地人物/地点/物品/事件实体索引、别名与全文元数据检索（无外部向量数据库依赖）
- 人物、关系和世界状态快照，以及角色/读者知情矩阵和获取渠道检查
- 剧情线、未解决问题、基础伏笔设置/强化/回收与全书整合时间线
- 当前采用正文的章节/场景摘要、版本过期标记和规划正文偏差处理
- 跨章节 Canon、状态、知情、时间、剧情线、伏笔和来源版本连续性检查
- 项目健康报告、只统计 accepted 正文的写作进度和可锁定下一章上下文包
- 连续性中心 Mock Provider、Markdown/JSON 导出、JSON round-trip 与旧项目迁移
- 分组侧栏、项目上下文栏、统一页面标题与本地保存状态组成的全局应用外壳
- 项目首页提供继续创作、项目进度、最近资料、健康提示和快速入口
- 舒适/紧凑两种界面密度；世界书、来源、问题和版本区保持专业紧凑布局
- 语义色彩、键盘焦点、减少动效、平板抽屉导航和移动端单列响应式支持
- 角色卡、世界书和正文写作采用列表/主画布/检查器的分层工作区结构
- 360px 起的响应式应用壳、移动抽屉、底部快捷导航、44px 触摸目标与安全区适配
- 正文移动端章节/正文/生成/检查视图切换、动态视口全屏编辑、触屏选区和段落锁定
- 可安装 PWA、离线应用壳、非破坏性更新提示和明确的离线模型禁用状态
- IndexedDB 优先的统一本机 Storage Adapter，保留 localStorage 旧草稿迁移与恢复镜像
- 可选单用户工作区服务器、HttpOnly 会话、CSRF、Origin 白名单、原子写入和乐观并发冲突保护
- 手机端完整项目、角色卡、世界书、规划、正文和连续性 JSON 文件选择、校验与导出
- “作品导入与重建”分步工作区：文件选择、内容预览、卷章与版本确认、OCR 校对、候选审查、重建方案和写入结果
- TXT UTF-8、UTF-8 BOM、UTF-16 LE/BE 与 GB18030 解码；低置信度或乱码风险时要求预览并支持手动重选编码
- 具有文本层的 PDF 逐页提取；加密文件、空文本层、阅读顺序、多栏和字符映射风险使用明确状态或警告
- 扫描/图片型 PDF 标记为 `needs_ocr`，可选用本机 Tesseract 与 Poppler 做逐页 OCR、低置信度提示、校对和检查点恢复
- EPUB 按 Spine 阅读顺序提取，DOCX 保留 Heading/脚注/修订信息，Markdown 支持标题映射和 Front Matter/代码块选项
- TXT、PDF、EPUB、DOCX 与 Markdown 可混合批量导入；单文件失败隔离，自然排序后仍可手动调整
- 重复与章节修订版本只生成审查候选；项目重建写入新正文版本、草稿或候选，不静默覆盖现有资料
- TXT/PDF 扩展名、MIME、签名、空文件、重复 SHA-256 指纹和容量校验；单文件默认 50 MiB，服务调用方可配置
- 本地规范化、可回溯偏移映射、常见中英文标题分章，以及章节重命名、拆分、合并和重排
- 章节优先、句子边界优先的可配置分块与有限重叠；区块处理支持进度、取消、重试、部分结果和检查点恢复
- Document Source、Source Span、页/章/段/字符位置、短摘录、置信度和来源版本追踪
- 默认 `local_only`；外部模型必须显式开启且只接收用户选中的区块，不接收整本小说或 PDF 密码
- 外部分析接口使用同源/工作区会话、JSON、请求体大小、频率和严格最小 DTO 保护；模型来源引用会替换为本地可信 Source Span
- 保守实体消歧；角色卡、世界书、Canon、时间线、剧情线、伏笔、Style Profile 和 Language Constraint 只生成草稿或候选
- 独立文档资产存储、按文档删除、结构化解析 JSON 和安全迁移
- 为检查点恢复保留 `chunks[].text`：项目/ingestion JSON 可能包含接近完整的提取正文；原始二进制、完整 raw/normalized 资产、PDF 密码和 Provider 密钥不进入 JSON
- 工作区跨设备同步结构化项目，但原始小说资产仍保存在各设备的 IndexedDB；完整原文跳转或重新解析需要在新设备重新附加文件

### 当前不支持 ✗（后续阶段）

- PNG 角色卡导出
- 从 PNG 导入角色卡
- 自动生成整本小说、无人监督连续写作、特定在世作者文风模仿和复杂富文本编辑
- 图片生成
- 自动联网搜索同人原作资料
- 多用户登录注册
- 第三方云同步
- 支付
- 社区功能
- 多语言系统
- MOBI 导入、商业云 OCR 和图片内容理解
- 无人审查的实体自动合并、候选自动确认或对既有项目资料静默覆盖

## API 调用费用

使用 OpenAI 或 Anthropic Provider 时，调用真实 API 可能产生费用：

- **OpenAI GPT-4o Mini**：约 $0.15/1M input tokens + $0.60/1M output tokens
- **OpenAI GPT-4o**：约 $2.50/1M input tokens + $10/1M output tokens
- **Anthropic Claude Haiku 4.5**：约 $1/1M input tokens + $5/1M output tokens
- **Anthropic Claude Sonnet 5**：约 $3/1M input tokens + $15/1M output tokens

单次角色卡生成通常消耗 500-2000 input tokens 和 500-2000 output tokens，费用极低。

建议先用 Mock Provider 测试界面和流程，确认满意后再切换到真实 API。

## 项目结构

```
src/
├── app/           # Next.js App Router
├── domain/        # 领域模型和 Zod Schema
├── adapters/      # Character Book / SillyTavern World Info 格式适配
├── providers/     # LLM Adapter (OpenAI/Anthropic/Mock)
├── prompts/       # 版本化提示词模板
├── services/      # 业务逻辑（含 document-ingestion 纯服务管线）
├── storage/       # 项目与小说资产存储 Adapter
├── hooks/         # React Hooks
└── components/    # UI 组件
```

详见 [docs/architecture.md](docs/architecture.md)。

剧情分析维度、权威等级、严重程度、置信度与评分规则见 [docs/analysis-methodology.md](docs/analysis-methodology.md)。

小说规划结构、因果、时间线、状态和版本规则见 [docs/planning-methodology.md](docs/planning-methodology.md)。
分卷、章节、场景、视角、信息流、状态继承和故事规划节点覆盖规则见 [docs/chapter-planning-methodology.md](docs/chapter-planning-methodology.md)。
正文生成、Edit Scope、前文预算、风格规则、覆盖、候选提取和版本保护见 [docs/prose-generation-methodology.md](docs/prose-generation-methodology.md)。
Canon 权威、Retcon、快照、知情、剧情线、伏笔、偏差和项目健康规则见 [docs/continuity-methodology.md](docs/continuity-methodology.md)。
视觉 Token、排版、间距、动效和响应式规则见 [docs/design-system.md](docs/design-system.md)。
现有页面审计与重构边界见 [docs/ui-audit.md](docs/ui-audit.md)，关键页面结构见 [docs/ui-page-blueprints.md](docs/ui-page-blueprints.md)。
手机/PWA 使用、本机与工作区模式、HTTPS、离线和冲突处理见 [docs/mobile-and-pwa.md](docs/mobile-and-pwa.md)。
基础文件解析、分块/检查点、来源追踪、隐私、删除、恢复和限制见 [docs/document-ingestion.md](docs/document-ingestion.md)。
EPUB、DOCX、Markdown、多文件、OCR、版本识别和项目重建见 [docs/work-import-and-rebuild.md](docs/work-import-and-rebuild.md)。

## SillyTavern UI Extension

可在 SillyTavern 的扩展安装界面填写 `https://github.com/Koukou0506/Story-Card-Studio`，分支选择 `sillytavern-extension`；也可从 [GitHub Releases](https://github.com/Koukou0506/Story-Card-Studio/releases) 下载 ZIP。扩展连接现有工作区 API，支持选择性发送角色卡、World Info 和聊天，运行角色/世界书生成与剧情分析，并在来源指纹校验和用户确认后安全写回或导出。安装、令牌、群聊与隐私说明见 [Extension README](integrations/sillytavern-extension/README.md)。不需要安装 SillyTavern Server Plugin。

维护者发布步骤见 [GitHub 发布指南](docs/github-release.md)。

## AI 味与文本机械感诊断

“AI 味诊断”支持粘贴文本、当前选区、场景和章节，使用通用中文小说、项目 Style Profile、Language Constraint、角色语言或个人样本基准。纯本地确定性指标不依赖模型；模型辅助失败时仍保留基础报告。局部优化复用正文 Revision 与 Diff，不会覆盖选区之外或锁定内容。该功能不能判断 AI 作者身份，详见 [docs/style-risk-analysis.md](docs/style-risk-analysis.md)。

## 手机、PWA 与跨设备工作区

手机浏览器直接访问与桌面相同的 Web 地址即可使用。支持的浏览器会在设置页显示“安装 Story Card Studio”；iPhone/iPad 请在 Safari 分享菜单中选择“添加到主屏幕”。安装后仍是同一个 Web App，不需要 App Store。

本机模式把项目优先保存在当前浏览器 IndexedDB，并保留旧 localStorage 草稿作为迁移/恢复镜像。离线可打开已缓存应用壳，查看和编辑本机项目并导出 JSON；模型操作和工作区同步会暂停，失败请求不会无限重放。

跨设备时，在用户控制的服务端配置下列工作区环境变量，通过 HTTPS 启动同一 Next.js 应用。桌面和手机在设置页使用同一个长随机访问令牌登录，然后显式读取或同步项目。每次保存带版本号；旧版本会收到冲突并停止覆盖，可以把本机内容另存为冲突副本。

推荐把服务放在 HTTPS 反向代理、受控局域网或 Tailscale/WireGuard 等私有网络之后。不要在没有认证和 TLS 的情况下直接暴露到公网。完整安装、备份、离线限制和冲突处理见 [docs/mobile-and-pwa.md](docs/mobile-and-pwa.md)。

## 兼容性

详见 [docs/compatibility.md](docs/compatibility.md)。

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `OPENAI_API_KEY` | OpenAI API 密钥 | （空） |
| `ANTHROPIC_API_KEY` | Anthropic API 密钥 | （空） |
| `DEFAULT_PROVIDER` | 默认 Provider: openai / anthropic / mock | mock |
| `API_TIMEOUT_MS` | API 超时时间（毫秒） | 60000 |
| `WORKSPACE_ACCESS_TOKEN` | 启用单用户工作区的长随机访问令牌（至少 24 位） | （空，工作区关闭） |
| `WORKSPACE_DATA_DIR` | 服务端项目 JSON 的持久目录 | `.workspace-data` |
| `WORKSPACE_ALLOWED_ORIGINS` | 允许的额外 Origin，逗号分隔；同源自动允许 | （空） |
| `WORKSPACE_BODY_LIMIT` | 工作区请求体字节上限 | 31457280 |

## 技术栈

- **框架**: Next.js 16 (App Router)
- **UI**: React 19
- **语言**: TypeScript 5（严格模式）
- **Schema 校验**: Zod 4
- **测试**: Vitest
- **样式**: Tailwind CSS 4 + 自定义 CSS

## 许可证

MIT
