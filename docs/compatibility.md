# 世界书与 Character Card V2 兼容性

## 检查基线

- 检查日期：2026-07-10
- SillyTavern：官方发布线 1.18.0；同时核对 `release` 分支的 `public/scripts/world-info.js`
- Character Card：Character Card V2 Spec 2.0
- 官方依据：[SillyTavern World Info 文档](https://docs.sillytavern.app/usage/core-concepts/worldinfo/)、[SillyTavern 官方仓库](https://github.com/SillyTavern/SillyTavern)、[Character Card V2 规范](https://github.com/malfoyslastname/character-card-spec-v2/blob/main/spec_v2.md)

本应用不把任一外部 JSON 直接作为编辑状态。所有文件先经过运行时 Schema 和适配器转为内部 `Lorebook`，编辑后再由目标适配器导出并再次校验。

## 内部领域模型

- `Lorebook`：名称、简介、条目、扫描深度、token 预算、递归设置、元数据、扩展和格式专属数据。
- `LorebookEntry`：稳定内部 ID、外部 ID、名称、分类、正文、启用状态、插入顺序/位置、depth、role、激活规则和来源标记。
- `ActivationRule`：主/次关键词、次级逻辑、大小写、整词、常驻、递归、概率、扫描深度、sticky/cooldown/delay 和 group。
- `LorebookMetadata`：来源格式、关联角色、提示词版本、数据版本和创建/修改/导入时间。
- `FormatSpecificData`：分别保存 Character Book 与 SillyTavern 专属字段和未知字段。

## Character Card V2 Character Book

位置为 `card.data.character_book`。规范结构如下：

```text
CharacterBook
├─ name? / description?
├─ scan_depth? / token_budget? / recursive_scanning?
├─ extensions (必须存在，未知键不得销毁)
└─ entries[]
   ├─ keys / content / extensions / enabled / insertion_order
   └─ case_sensitive? / name? / priority? / id? / comment?
      selective? / secondary_keys? / constant? / position?
```

本应用接受规范中的数字或字符串 `id`，导入后另外生成稳定内部字符串 ID。角色卡根、`data`、Character Book、Entry 的安全未知字段通过 `.passthrough()` 与格式专属数据保存；各级 `extensions` 原样合并保留。

## SillyTavern 独立 World Info

SillyTavern 1.18.0 的原生独立 JSON 是根级 `entries` 对象，不是 Character Book 的 `entries` 数组。文件名作为 SillyTavern 中的世界书名；导出正文形态为：

```json
{
  "entries": {
    "0": {
      "uid": 0,
      "key": ["主关键词"],
      "keysecondary": [],
      "comment": "条目标题",
      "content": "注入正文",
      "constant": false,
      "selective": true,
      "selectiveLogic": 0,
      "order": 100,
      "position": 0,
      "disable": false
    }
  }
}
```

当前官方 `newWorldInfoEntryDefinition` 的主要字段还包括：`vectorized`、`addMemo`、`ignoreBudget`、`excludeRecursion`、`preventRecursion`、`delayUntilRecursion`、`probability`、`useProbability`、`depth`、`outletName`、`group`、`groupOverride`、`groupWeight`、`scanDepth`、`caseSensitive`、`matchWholeWords`、`useGroupScoring`、`automationId`、`role`、`sticky`、`cooldown`、`delay` 与 `triggers`。适配器为缺失字段应用官方默认语义，并保留所有未知根级和条目级字段。

`selectiveLogic` 当前数值映射：`0=AND ANY`、`1=NOT ALL`、`2=NOT ANY`、`3=AND ALL`。`position` 当前映射：`0=角色定义前`、`1=角色定义后`、`2=作者注释顶部`、`3=作者注释底部`、`4=聊天深度`、`5=示例消息前`、`6=示例消息后`、`7=Outlet`。`role` 为 `0=system`、`1=user`、`2=assistant`。

## 字段映射

| 内部字段 | Character Book | SillyTavern World Info | 无损情况与处理 |
|---|---|---|---|
| `name`（书） | `name` | 文件名（JSON 内无稳定标准字段） | 导入独立文件时由文件名提供；内部名称不写入原生根字段 |
| `description` | `description` | 无稳定书级字段 | 导出独立格式时保留在内部，不能供 ST 原生表达 |
| `scanDepth` | `scan_depth` | 通常是 ST 全局设置；条目可用 `scanDepth` | 书级值转独立格式不可保证无损 |
| `tokenBudget` | `token_budget` | 通常是 ST 全局设置 | 转独立格式不可保证无损 |
| `recursiveScanning` | `recursive_scanning` | 通常是 ST 全局设置 | 条目递归标记可映射，书级设置不可保证无损 |
| Entry `externalId` | `id` | `uid` / `entries` 键 | 数字或字符串均保存；内部另有稳定 ID |
| `activation.primaryKeys` | `keys` | `key` | 无损 |
| `activation.secondaryKeys` | `secondary_keys` | `keysecondary` | 无损 |
| `secondaryLogic` | `extensions.selectiveLogic` | `selectiveLogic` | CCv2 核心只定义双关键词选择，四种 ST 逻辑依赖 extension |
| `content` | `content` | `content` | 无损 |
| `enabled` | `enabled` | `!disable` | 无损 |
| `insertionOrder` | `insertion_order` | `order` | 无损 |
| `caseSensitive` | `case_sensitive` / extension | `caseSensitive` | 无损；`null` 表示跟随 ST 全局设置 |
| `constant` | `constant` | `constant` | 无损 |
| `position` 前/后角色 | `position` | `position` 0/1 | 无损 |
| 其他 `position` | `extensions.position` | `position` 2..7 | 标准 CCv2 前端可能忽略，导出时警告 |
| `probability` | `extensions.probability` | `probability` + `useProbability` | CCv2 依赖 ST extension |
| `depth` / `role` / `outletName` | `extensions.*` | 原生字段 | CCv2 依赖 ST extension |
| `sticky/cooldown/delay` | `extensions.*` | 原生字段 | CCv2 依赖 ST extension；其他前端可能忽略 |
| `group` 及组策略 | `extensions.*` | 原生字段 | CCv2 依赖 ST extension |
| `extensions` | 原生 `extensions` | 无统一根容器 | 分别保留；不会把未知键扁平丢弃 |
| 未知字段 | 格式专属数据袋 | 格式专属数据袋 | 回到同一来源格式时恢复 |

## 不能保证无损的转换

1. 独立 World Info 的书名来自文件名；Character Book 的 `name` 是 JSON 字段。
2. Character Book 的书级 `scan_depth`、`token_budget`、`recursive_scanning` 没有一一对应的独立 World Info 根字段。
3. CCv2 标准位置仅有 `before_char` / `after_char`；SillyTavern 的作者注释、示例消息、深度和 Outlet 位置只能放入 `extensions`，其他 CCv2 前端可能忽略。
4. SillyTavern 的向量激活、概率、分组竞争、Automation ID、generation triggers、预算忽略和 timed effects 不是 CCv2 核心字段。
5. 未知字段能在同格式 round-trip 中恢复；跨格式时保存在内部格式专属数据中，但目标应用不会解释另一格式的专属语义。

导出适配器会返回兼容性警告；质量检查会把目标格式无法原生表达的字段列为确定性警告，不会自动覆盖用户内容。

## 本地激活模拟边界

本地模拟实现普通关键词、JavaScript 风格 `/regex/flags`、大小写、常驻、启停和四种基础次级关键词逻辑。未完整模拟递归预算、概率随机、向量相似度、分组竞争、全局整词设置、额外扫描源、generation triggers、Automation、Outlet 展开和 timed effects 跨消息状态，因此界面固定标注“本地近似模拟”。

