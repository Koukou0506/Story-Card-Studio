import { access, cp, mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const standalone = join(root, ".next", "standalone");
const output = join(root, ".release", "server");

await access(join(standalone, "server.js")).catch(() => {
  throw new Error("未找到 standalone 构建。请先运行 npm run build。");
});
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(standalone, output, { recursive: true });
await mkdir(join(output, ".next"), { recursive: true });
await cp(join(root, ".next", "static"), join(output, ".next", "static"), { recursive: true });
await cp(join(root, "public"), join(output, "public"), { recursive: true });
await cp(join(root, ".env.example"), join(output, ".env.example"));
await cp(join(root, "LICENSE"), join(output, "LICENSE"));
await cp(join(root, "docs", "server-package.md"), join(output, "README.md"));
await writeFile(join(output, "start.cmd"), "@echo off\r\nsetlocal\r\nif not defined PORT set PORT=3000\r\nset HOSTNAME=0.0.0.0\r\nnode server.js\r\n", "utf8");
await writeFile(join(output, "start.sh"), "#!/usr/bin/env sh\nset -eu\nexport PORT=${PORT:-3000}\nexport HOSTNAME=${HOSTNAME:-0.0.0.0}\nexec node server.js\n", { encoding: "utf8", mode: 0o755 });
console.log(`服务端运行包已生成：${output}`);

