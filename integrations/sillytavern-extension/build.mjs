import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(dirname(root));
const output = join(root, "dist");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await build({
  entryPoints: [join(root, "src/index.ts")], outfile: join(output, "index.js"), bundle: true,
  format: "esm", platform: "browser", target: ["es2022"], minify: true, sourcemap: false,
  define: { "process.env.NODE_ENV": "\"production\"" }, logLevel: "info",
});
await Promise.all([
  cp(join(root, "manifest.json"), join(output, "manifest.json")),
  cp(join(root, "style.css"), join(output, "style.css")),
  cp(join(root, "README.md"), join(output, "README.md")),
  cp(join(root, "compatibility.json"), join(output, "compatibility.json")),
  cp(join(projectRoot, "LICENSE"), join(output, "LICENSE")),
]);
