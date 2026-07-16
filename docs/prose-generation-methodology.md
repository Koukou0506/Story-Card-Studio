# 正文生成与修订方法论（Phase B3）

版本：`prose-method-v1.0.0`  
检查日期：2026-07-13

## 1. 正文生成流程

1. 用户选择 B2 Scene Plan 和当前正文基础版本。
2. 校验 Edit Scope、段落 ID、字符偏移、锁定块与逐字保留片段。
3. Prose Context Builder 收集限定范围资料并执行预算裁剪。
4. Provider 只返回目标正文纯文本；不在同一响应要求 JSON、解释或报告。
5. 输出先进入临时或 `alternative` Draft Version，原采用稿不变。
6. 独立执行 Scene Plan Coverage、候选事实、候选状态和正文质量检查。
7. 生成 Revision 与段落差异；用户全部、部分接受或拒绝。
8. 接受时创建新的 `accepted` 版本；恢复历史同样创建副本。

## 2. 原稿保护与 Edit Scope

Edit Scope 支持 `document`、`scene`、`paragraph`、`text_range`、`dialogue_only`、`narration_only`、`opening`、`ending` 和 `custom`。每个范围保存起止位置、Text Block、结构/事实/删除权限、锁定块和逐字保留内容。

- 范围引用不存在的段落或越界偏移时拒绝调用。
- `text_range` 与锁定段落相交时拒绝调用。
- 模型返回文本只替换目标范围；前后文本从基础版本拼回。
- `TextBlock.locked` 与逐字保留片段在应用建议后再次核验。
- 生成或修订永远先保存基础版本；建议默认是 alternative。
- 流式内容只进入临时草稿。取消后已有内容可保存为 `incomplete`，采用稿不变。

## 3. 前文选择与预算

支持光标附近、当前 Scene 全部前文、上一 Scene 结尾、Chapter 摘要、用户手动选择和自动相关前文。预算按约四字符一个 token 估算，依次保留：

1. 用户指令、选区附近和锁定文本；
2. 当前 Scene Plan、Entry/Exit State 与 POV；
3. 最近未完成动作和对话、上一 Scene 结尾；
4. 相关角色、世界规则、信息与铺垫；
5. Style Profile 和 Language Constraint；
6. 较远正文以摘要替代，低相关资料裁剪。

所有上下文条目记录来源类型、ID、版本、权威等级、锁定与可修改性。UI 显示实际发送清单、token 估算和截断原因；不会无差别发送整部作品或整个世界书。

## 4. Style Profile 与 Language Constraint

Style Profile 保存简洁度、句段长度、对话/动作/心理/环境比例、感官与修辞密度、潜台词、情绪克制、节奏、叙述距离、幽默、总体语气和自定义说明。文本样本只转化为抽象特征，不建立特定在世作者模仿模式。项目可设置默认 Profile，场景可引用覆盖项。

Language Constraint 可作用于项目、角色或场景，严格程度为 `hard`、`preferred`、`advisory`。规则保存正反示例、来源、启用与锁定状态。命中 hard 反向示例属于明确问题；preferred/advisory 仅作为修订提示。

## 5. 视角、时态与场景计划覆盖

正文生成读取 B2 POV 配置。确定性检查覆盖 Chapter/Scene POV 不一致、明确的锁定内容修改和 hard 规则；人称漂移、时态漂移、非视角人物内心、叙述距离变化和信息越权在缺少语法/语义模型时标为启发式。场景可在 B2 POV 自定义规则中记录例外。

Coverage 维度为目标、冲突、主要行动、转折、结果、Exit State、信息变化、关系变化、铺垫与回收。状态包括 `missing`、`partial`、`covered`、`overexpanded`、`contradicted`、`intentionally_omitted`。第一版本地检查结合计划语义词、结构位置和叙事功能提示，不把简单字符串相等当作最终结论；结果展示正文范围、依据与启发式标记，用户保留最终判断权。

## 6. 新增事实和状态变化

Candidate Fact 分人物、地点、组织、物品、能力、世界规则、关系、历史、身体状态、秘密和时间。每项保存正文范围、是否已有、可能来源、重要度、冲突与推荐处理。用户可以确认候选、复制到世界书草稿/角色备注/时间线候选或忽略；程序不自动修改 A1、A2、B1、B2。

Candidate State Change 分人物、关系、世界、信息和物品，保存 before/after、触发正文、置信度、来源以及与 Scene Exit State 的匹配。确认后只允许创建非采用的 B2 Scene Version 副本，用户仍需在 B2 明确采用。

## 7. Revision、差异和版本

Draft Version 保存父版本、操作类型、Prompt/Provider/模型、B2 来源版本、Text Blocks、状态、字数与 incomplete 标记。Revision 保存基础/建议版本、Edit Scope、用户要求、来源版本和段落差异。差异类型为新增、删除、修改、不变；每段可独立接受或拒绝。部分接受会组合成新的 accepted 版本，不修改建议稿或基础稿。

版本状态采用 `generated`、`user_edited`、`reviewed`、`accepted`、`alternative`、`deprecated`、`locked`、`conflicted`、`incomplete`。旧报告和正文版本保留其 B2 来源版本；上游更新后仍可查看，但应视为旧资料快照。

## 8. 质量判断边界

Prose Validator 覆盖计划目标/冲突/转折/结果、Exit State、新事实、动机、对话区分、称呼、信息、身体/地点/情绪/关系、POV/人称/时态、空间和说话人、重复、禁用表达、信息倾倒、修辞、过度解释、节奏、余波、结尾与锁定内容。每项包含严重程度、置信度、范围、依据、最小修订、副作用以及确定/启发式标记。它只报告，不自动重写正文。
