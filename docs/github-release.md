# GitHub 发布指南

目标仓库：`https://github.com/Koukou0506/Story-Card-Studio`

## 首次发布

1. 在 GitHub 新建空仓库 `Koukou0506/Story-Card-Studio`，不要自动生成 README、许可证或 `.gitignore`。
2. 在项目目录初始化并推送：

```powershell
git init
git branch -M main
git remote add origin https://github.com/Koukou0506/Story-Card-Studio.git
git add .
git commit -m "Initial public release"
git push -u origin main
```

3. 确认仓库 Settings → Actions → General → Workflow permissions 为 **Read and write permissions**。
4. 创建首个版本标签：

```powershell
git tag v0.2.0
git push origin v0.2.0
```

标签会触发 Release 工作流：验证主应用、构建扩展、更新 `sillytavern-extension` 分支，并在 Release 中附加 ZIP。

## 用户下载与安装

- 普通下载：打开仓库 Releases，下载 `story-card-studio-sillytavern-extension-v*.zip`。
- SillyTavern 在线安装：扩展面板 → Install Extension，仓库地址填写 `https://github.com/Koukou0506/Story-Card-Studio`，分支填写 `sillytavern-extension`。
- 手动安装：解压 ZIP 到 SillyTavern 用户扩展目录的 `story-card-studio` 文件夹，然后刷新 SillyTavern。

## 后续发布

先同步 `package.json` 与 `integrations/sillytavern-extension/manifest.json` 的版本，再提交并创建新标签。不要复用旧标签；使用 `v0.2.1`、`v0.3.0` 等新版本。

## 发布安全

`.env.local`、工作区项目数据、依赖目录和构建缓存均被 `.gitignore` 排除。提交前仍应运行 `git status --short`，确认没有密钥、令牌、用户正文或私有项目数据。

