import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
const version = pkg.version || "2.0.0";

const stageDir = path.join(rootDir, "releases", `agy-better-sidebar-v${version}`);
const zipPath = path.join(rootDir, "releases", `agy-better-sidebar-v${version}.zip`);

fs.rmSync(stageDir, { recursive: true, force: true });
fs.rmSync(zipPath, { force: true });
fs.mkdirSync(stageDir, { recursive: true });

function copyRec(src, dst) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const e of fs.readdirSync(src)) copyRec(path.join(src, e), path.join(dst, e));
  } else {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }
}

for (const item of [
  "install.bat",
  "install.sh",
  "LICENSE",
  "README.md",
  "DEMO_TYPORA_LAPIS.md",
  "plugin",
  "assets",
  "scripts/verify-mcp.mjs",
]) {
  copyRec(path.join(rootDir, item), path.join(stageDir, item));
}

if (process.platform === "win32") {
  execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      `Compress-Archive -Path '${stageDir}' -DestinationPath '${zipPath}' -Force`,
    ],
    { stdio: "inherit" },
  );
}

fs.rmSync(stageDir, { recursive: true, force: true });
const mb = (fs.statSync(zipPath).size / (1024 * 1024)).toFixed(2);
console.log(`[pack-release] Created ${zipPath} (${mb} MB)`);
