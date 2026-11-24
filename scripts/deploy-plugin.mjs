import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const rootDir = process.cwd();
const pluginTarget = path.join(
  os.homedir(),
  ".gemini",
  "config",
  "plugins",
  "agy-better-sidebar",
);

function copyRecursive(src, dst) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dst, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }
}

fs.mkdirSync(pluginTarget, { recursive: true });

const filesToCopy = [
  ["plugin/plugin.json", "plugin.json"],
  ["plugin/mcp_config.json", "mcp_config.json"],
  ["plugin/README.md", "README.md"],
  ["plugin/assets", "assets"],
  ["plugin/skills", "skills"],
  ["plugin/rules", "rules"],
  ["dist/server.mjs", "dist/server.mjs"],
  ["dist/workbench.html", "dist/workbench.html"],
  ["dist/viewer.html", "dist/viewer.html"],
];

for (const [srcRel, dstRel] of filesToCopy) {
  const srcAbs = path.join(rootDir, srcRel);
  const dstAbs = path.join(pluginTarget, dstRel);
  if (!fs.existsSync(srcAbs)) {
    throw new Error(`Missing build artifact for deploy: ${srcAbs}`);
  }
  copyRecursive(srcAbs, dstAbs);
}

console.log(`[deploy-plugin] Installed to ${pluginTarget}`);
