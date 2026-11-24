import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
fs.mkdirSync(path.join(rootDir, "dist"), { recursive: true });

await build({
  entryPoints: [path.join(rootDir, "server", "index.ts")],
  outfile: path.join(rootDir, "dist", "server.mjs"),
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  sourcemap: false,
  minify: false,
  banner: {
    js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
  },
});

// Copy built single-file HTMLs to dist root for clean loading
const wbSrc = path.join(rootDir, "dist", "ui-workbench", "workbench.html");
const fvSrc = path.join(rootDir, "dist", "ui-viewer", "viewer.html");

if (fs.existsSync(wbSrc)) {
  fs.copyFileSync(wbSrc, path.join(rootDir, "dist", "workbench.html"));
}
if (fs.existsSync(fvSrc)) {
  fs.copyFileSync(fvSrc, path.join(rootDir, "dist", "viewer.html"));
}

// Also sync prebuilt bundle into plugin/dist so git-cloned / release installs need zero build step
const pluginDist = path.join(rootDir, "plugin", "dist");
fs.mkdirSync(pluginDist, { recursive: true });
for (const f of ["server.mjs", "workbench.html", "viewer.html"]) {
  const src = path.join(rootDir, "dist", f);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(pluginDist, f));
  }
}

const stats = ["server.mjs", "workbench.html", "viewer.html"].map((f) => {
  const full = path.join(rootDir, "dist", f);
  if (!fs.existsSync(full)) return `${f}: MISSING`;
  const kb = (fs.statSync(full).size / 1024).toFixed(1);
  return `${f}: ${kb} KB`;
});

console.log("[build-server] Complete:\n  " + stats.join("\n  "));
