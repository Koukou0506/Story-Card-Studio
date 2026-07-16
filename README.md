# Story Card Studio — SillyTavern UI Extension

这是一个 Bundled UI Extension。它读取用户明确选择的 SillyTavern 上下文，并调用外部 Story Card Studio 工作区服务；不包含模型 Prompt、Provider 密钥或 Server Plugin。

## 安装与更新

推荐在 SillyTavern 的 **Extensions → Install Extension** 中填写仓库地址 `https://github.com/Koukou0506/Story-Card-Studio`，并选择 `sillytavern-extension` 分支。该分支只包含可安装扩展，不包含主应用源码。

也可以从 [GitHub Releases](https://github.com/Koukou0506/Story-Card-Studio/releases) 下载 `story-card-studio-sillytavern-extension-v*.zip`，解压到 SillyTavern 用户数据目录的 `extensions/story-card-studio` 后重新加载。源码构建方式为运行 `npm run build:sillytavern-extension`，再复制 `integrations/sillytavern-extension/dist` 的内容。

最低兼容版本为 SillyTavern 1.12.12；当前按官方 1.18.0 release API 契约测试。启动时仍会检测 `getContext`、事件和写回能力，单项能力缺失不会阻止扩展加载。

## 服务配置

在 Story Card Studio 服务端设置至少 24 位的 `WORKSPACE_ACCESS_TOKEN`，并将 SillyTavern 的 Origin 加入 `WORKSPACE_ALLOWED_ORIGINS`。远程地址必须使用 HTTPS；`localhost` 可用于本机开发。扩展内填写服务地址和工作区令牌后点击“测试连接”。令牌默认只存于当前浏览器会话；只有明确勾选后才会持久化。

连接后选择已有项目，或在第一次运行工具时创建项目。点击“保存项目关联”只会把项目 ID、工作区 ID、来源指纹和同步时间写入 `story_card_studio` 命名空间，不会写入令牌、聊天或分析报告。

## 使用

- 可分别选择发送当前角色、World Info 和聊天；聊天默认关闭且默认仅最近 4 条。
- 聊天支持最近一条、最近 N 条、手动消息索引范围、完整聊天及群聊成员筛选；发送前会显示数量、字符数和实际文本预览并再次确认。
- 工具包括角色卡完善、世界书完善、人物契合度、剧情合理性、连续性分析，以及“诊断选定文本的 AI 味与机械感”。诊断支持消息角色筛选、粘贴文本和基准选择；结果是风格风险而非 AI 作者身份判断。任务可取消，SillyTavern 上下文变化会把旧结果标记为可能过期。
- 结果提供字段级或条目级差异。破坏性差异默认不选择，必须选择并确认后才会尝试写回。
- “打开作品导入与重建”会跳转到独立应用的文件工作区；EPUB、DOCX、Markdown、PDF OCR 和多文件重建始终在 Story Card Studio 中执行，Extension 不复制解析逻辑。

## 写回、导出和隐私边界

World Info 仅在公开 `saveWorldInfo` 可用、来源指纹未变化且用户确认时写回；否则导出为 SillyTavern 可导入 JSON。当前角色卡完整更新采用合并后导出 Character Card V2 JSON，仅用 `writeExtensionField` 保存轻量关联。群聊不会把 `characterId` 当作单角色，群聊角色写回禁用。扩展不修改聊天消息。

所有外发操作都由用户触发。响应按共享 Schema 校验并只以文本渲染；不执行服务端代码，不记录令牌或完整聊天。扩展从不接收 OpenAI、Anthropic 等 Provider API Key。机械感优化稿只能复制、导出或在独立 APP 作为 Revision 查看，不修改历史聊天。

## 故障排查与卸载

- “服务离线”：确认 Story Card Studio 正在运行、地址正确、远程使用 HTTPS，并检查 CORS Origin 白名单。
- “未认证”：重新输入工作区访问令牌；它不是 Provider API Key。
- “结果过期/原数据已变化”：重新发送当前上下文并创建新任务，或只导出结果人工合并。
- 作品文件解析与重建请在独立 Story Card Studio APP 中完成。

卸载时在 SillyTavern 扩展管理器删除本扩展，或删除对应扩展目录。角色卡或聊天中的轻量 `story_card_studio` 关联可按需手动移除；它不影响原始内容。
