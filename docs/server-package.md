# Story Card Studio 服务端运行包

该压缩包包含已经构建的 Story Card Studio Web 服务，不包含 SillyTavern Extension，也不包含用户项目、密钥或工作区令牌。

## 系统要求

- Node.js 22；
- Windows、macOS 或常见 Linux；
- 远程访问时需要 HTTPS 反向代理或受控私有网络。

## 启动

Windows 双击 `start.cmd`，或在终端运行：

```powershell
./start.cmd
```

macOS/Linux：

```sh
./start.sh
```

默认访问地址为 `http://localhost:3000`。端口可通过 `PORT` 环境变量修改。

## 配置和数据

按需把 `.env.example` 复制为 `.env.local`，再配置 Provider 和工作区访问令牌。不要把 `.env.local` 上传到 GitHub。

工作区服务器项目默认保存在运行目录下的 `.workspace-data`。升级或迁移前必须备份：

- `.workspace-data`；
- `.env.local`；
- 从浏览器本机模式导出的项目 JSON。

浏览器 IndexedDB 中的本机项目不在服务端文件夹内，也不会随 ZIP 或 GitHub 源码自动备份。

## 更新

下载新版本并解压到新目录，复制旧目录的 `.env.local` 和 `.workspace-data`，确认新版本能够读取项目后再删除旧目录。不要直接用新 ZIP 覆盖唯一的数据副本。

