import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { CLAIMED_FILE_EXTENSIONS, getExtension, IMAGE_EXTENSIONS } from "../src/shared/fileMeta";
import {
  DEFAULT_PREFS,
  normalizePrefs,
  type AppStatePayload,
  type BrowseDirEntry,
  type BrowseDirResult,
  type DirEntry,
  type ReadFileResult,
  type RecentChangedItem,
  type RecentChangesResult,
  type SuggestedWorkspace,
  type UserPrefs,
} from "../src/shared/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKBENCH_URI = "ui://agy-better-sidebar/workbench.html";
const VIEWER_URI = "ui://agy-better-sidebar/viewer.html";
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MiB hard limit
const MAX_TEXT_READ_BYTES = 4 * 1024 * 1024; // 4 MiB comfortable text limit

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".hg",
  ".svn",
  "__pycache__",
  ".venv",
  "venv",
  ".pytest_cache",
  ".mypy_cache",
  ".next",
  ".nuxt",
  "dist",
  "build",
  "target",
  ".cache",
  ".idea",
  ".vs",
]);

function parseDataDir(): string {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--data-dir" && args[i + 1]) {
      return args[i + 1];
    }
    if (args[i].startsWith("--data-dir=")) {
      return args[i].slice("--data-dir=".length);
    }
  }
  return path.join(os.homedir(), ".gemini", "antigravity", "plugin_data", "agy-better-sidebar");
}

const DATA_DIR = parseDataDir();
const STATE_FILE = path.join(DATA_DIR, "state.json");

interface PersistedState {
  prefs: UserPrefs;
  lastWorkspace: string;
  recentWorkspaces: string[];
  pinnedWorkspaces: string[];
}

function normalizePath(p: string): string {
  return path.resolve(p);
}

function isExistingDir(p: string): boolean {
  try {
    return Boolean(p) && fs.existsSync(p) && fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isExistingFile(p: string): boolean {
  try {
    return Boolean(p) && fs.existsSync(p) && fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function loadState(): PersistedState {
  const fallback: PersistedState = {
    prefs: { ...DEFAULT_PREFS },
    lastWorkspace: "",
    recentWorkspaces: [],
    pinnedWorkspaces: [],
  };
  try {
    if (!fs.existsSync(STATE_FILE)) return fallback;
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) as Partial<PersistedState>;
    return {
      prefs: normalizePrefs(raw.prefs),
      lastWorkspace: typeof raw.lastWorkspace === "string" ? raw.lastWorkspace : "",
      recentWorkspaces: Array.isArray(raw.recentWorkspaces)
        ? raw.recentWorkspaces.filter((x): x is string => typeof x === "string")
        : [],
      pinnedWorkspaces: Array.isArray(raw.pinnedWorkspaces)
        ? raw.pinnedWorkspaces.filter((x): x is string => typeof x === "string")
        : [],
    };
  } catch {
    return fallback;
  }
}

function saveState(state: PersistedState): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
  } catch (err) {
    console.error("[agy-better-sidebar] failed to save state:", err);
  }
}

function addRecentWorkspace(state: PersistedState, dir: string): PersistedState {
  const norm = normalizePath(dir);
  if (!isExistingDir(norm)) return state;
  const recent = [norm, ...state.recentWorkspaces.filter((x) => x.toLowerCase() !== norm.toLowerCase())].slice(
    0,
    12,
  );
  const next: PersistedState = {
    ...state,
    lastWorkspace: norm,
    recentWorkspaces: recent,
  };
  saveState(next);
  return next;
}

function collectSuggestedWorkspaces(state: PersistedState): SuggestedWorkspace[] {
  const seen = new Set<string>();
  const out: SuggestedWorkspace[] = [];
  const push = (dir: string, label: string, kind: SuggestedWorkspace["kind"]) => {
    if (!isExistingDir(dir)) return;
    const norm = normalizePath(dir);
    const key = norm.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ path: norm, label, kind });
  };

  for (const p of state.pinnedWorkspaces) {
    push(p, path.basename(p) || p, "pinned");
  }
  for (const r of state.recentWorkspaces) {
    push(r, path.basename(r) || r, "recent");
  }

  const scratchDir = path.join(os.homedir(), ".gemini", "antigravity", "scratch");
  if (isExistingDir(scratchDir)) {
    try {
      const subs = fs
        .readdirSync(scratchDir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !d.name.startsWith("."))
        .slice(0, 12);
      for (const sub of subs) {
        push(path.join(scratchDir, sub.name), `scratch / ${sub.name}`, "scratch");
      }
    } catch {
      // ignore
    }
    push(scratchDir, "Antigravity Scratch", "common");
  }

  push(path.join(os.homedir(), "Desktop"), "Desktop", "common");
  push(path.join(os.homedir(), "Documents"), "Documents", "common");
  push(os.homedir(), "Home", "common");

  return out;
}

function buildStatePayload(state: PersistedState): AppStatePayload {
  const suggested = collectSuggestedWorkspaces(state);
  const validLast = isExistingDir(state.lastWorkspace)
    ? normalizePath(state.lastWorkspace)
    : suggested[0]?.path ?? os.homedir();
  return {
    prefs: state.prefs,
    lastWorkspace: validLast,
    recentWorkspaces: state.recentWorkspaces.filter(isExistingDir),
    pinnedWorkspaces: state.pinnedWorkspaces.filter(isExistingDir),
    suggestedWorkspaces: suggested,
    homeDir: os.homedir(),
  };
}

function resolveInsideRoot(rootPath: string, relPath: string): string {
  const absRoot = normalizePath(rootPath);
  const cleanRel = (relPath || "").replace(/^[/\\]+/, "");
  const target = path.resolve(absRoot, cleanRel);
  const rootWithSep = absRoot.endsWith(path.sep) ? absRoot : absRoot + path.sep;
  if (
    target.toLowerCase() !== absRoot.toLowerCase() &&
    !target.toLowerCase().startsWith(rootWithSep.toLowerCase())
  ) {
    throw new Error("Access denied: path escapes workspace root.");
  }
  return target;
}

function listDirectory(rootPath: string, relPath = "", showHidden = false): DirEntry[] {
  const absDir = resolveInsideRoot(rootPath, relPath);
  if (!isExistingDir(absDir)) {
    throw new Error(`Directory does not exist: ${absDir}`);
  }
  const absRoot = normalizePath(rootPath);
  const rawEntries = fs.readdirSync(absDir, { withFileTypes: true });
  const results: DirEntry[] = [];

  for (const dirent of rawEntries) {
    const name = dirent.name;
    if (!showHidden && (name.startsWith(".") || IGNORED_DIRS.has(name))) {
      // Allow important config dotfiles like .env, .gitignore, .agents when hidden is off?
      // Better: show .agents / .env / .gitignore even when showHidden is false, hide noisy cache/git dirs
      const keepUsefulDotfile =
        name === ".agents" || name === ".env" || name === ".gitignore" || name === ".editorconfig";
      if (!keepUsefulDotfile) continue;
    }

    const fullPath = path.join(absDir, name);
    let isDir = dirent.isDirectory();
    let size = 0;
    let mtimeMs = 0;
    try {
      const st = fs.statSync(fullPath);
      isDir = st.isDirectory();
      size = isDir ? 0 : st.size;
      mtimeMs = st.mtimeMs;
    } catch {
      continue;
    }

    const entryRel = path.relative(absRoot, fullPath).replace(/\\/g, "/");
    results.push({
      name,
      relPath: entryRel,
      isDir,
      size,
      ext: isDir ? "" : getExtension(name),
      mtimeMs,
    });
  }

  results.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  });
  return results;
}

function findFiles(
  rootPath: string,
  query = "",
  showHidden = false,
  limit = 80,
): DirEntry[] {
  const absRoot = normalizePath(rootPath);
  if (!isExistingDir(absRoot)) return [];

  const q = query.trim().toLowerCase();
  const tokens = q ? q.split(/\s+/).filter(Boolean) : [];
  const matches: Array<{ entry: DirEntry; score: number }> = [];
  const queue: string[] = [absRoot];
  let visited = 0;
  const MAX_VISITED = 4000;

  while (queue.length > 0 && visited < MAX_VISITED) {
    const current = queue.shift()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const dirent of entries) {
      visited++;
      if (visited >= MAX_VISITED) break;
      const name = dirent.name;
      if (!showHidden && (IGNORED_DIRS.has(name) || (name.startsWith(".") && name !== ".agents"))) {
        continue;
      }
      const fullPath = path.join(current, name);
      if (dirent.isDirectory()) {
        queue.push(fullPath);
        continue;
      }
      if (!dirent.isFile()) continue;

      const relPath = path.relative(absRoot, fullPath).replace(/\\/g, "/");
      const hayPath = relPath.toLowerCase();
      const hayName = name.toLowerCase();

      let score = 0;
      if (tokens.length === 0) {
        score = 1;
      } else {
        let matchedAll = true;
        for (const tok of tokens) {
          if (hayName === tok) score += 100;
          else if (hayName.startsWith(tok)) score += 60;
          else if (hayName.includes(tok)) score += 35;
          else if (hayPath.includes(tok)) score += 15;
          else {
            matchedAll = false;
            break;
          }
        }
        if (!matchedAll) continue;
      }

      let size = 0;
      let mtimeMs = 0;
      try {
        const st = fs.statSync(fullPath);
        size = st.size;
        mtimeMs = st.mtimeMs;
      } catch {
        // ignore
      }

      matches.push({
        score,
        entry: {
          name,
          relPath,
          isDir: false,
          size,
          ext: getExtension(name),
          mtimeMs,
        },
      });
    }
  }

  matches.sort((a, b) => b.score - a.score || a.entry.relPath.localeCompare(b.entry.relPath));
  return matches.slice(0, limit).map((m) => m.entry);
}

function guessImageMime(ext: string): string {
  switch (ext) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".bmp":
      return "image/bmp";
    case ".ico":
      return "image/x-icon";
    case ".avif":
      return "image/avif";
    default:
      return "application/octet-stream";
  }
}

function readWorkspaceFile(rootPath: string, relPath: string): ReadFileResult {
  const absPath = resolveInsideRoot(rootPath, relPath);
  if (!isExistingFile(absPath)) {
    throw new Error(`File not found: ${absPath}`);
  }
  const st = fs.statSync(absPath);
  const name = path.basename(absPath);
  const ext = getExtension(name);
  const normRel = path.relative(normalizePath(rootPath), absPath).replace(/\\/g, "/");

  if (IMAGE_EXTENSIONS.has(ext)) {
    if (st.size > MAX_FILE_BYTES) {
      return {
        name,
        relPath: normRel,
        absPath,
        ext,
        size: st.size,
        isBinary: true,
        isImage: true,
        mimeType: guessImageMime(ext),
        truncated: true,
      };
    }
    const buf = fs.readFileSync(absPath);
    const mime = guessImageMime(ext);
    return {
      name,
      relPath: normRel,
      absPath,
      ext,
      size: st.size,
      isBinary: true,
      isImage: true,
      mimeType: mime,
      dataUrl: `data:${mime};base64,${buf.toString("base64")}`,
    };
  }

  const readLen = Math.min(st.size, MAX_TEXT_READ_BYTES);
  const fd = fs.openSync(absPath, "r");
  const buf = Buffer.alloc(readLen);
  try {
    fs.readSync(fd, buf, 0, readLen, 0);
  } finally {
    fs.closeSync(fd);
  }

  // Detect binary content via NUL bytes in first 4 KB
  const sampleLen = Math.min(buf.length, 4096);
  let nullBytes = 0;
  for (let i = 0; i < sampleLen; i++) {
    if (buf[i] === 0) nullBytes++;
  }
  if (nullBytes > 2) {
    return {
      name,
      relPath: normRel,
      absPath,
      ext,
      size: st.size,
      isBinary: true,
      isImage: false,
      mimeType: "application/octet-stream",
    };
  }

  return {
    name,
    relPath: normRel,
    absPath,
    ext,
    size: st.size,
    isBinary: false,
    isImage: false,
    mimeType: "text/plain; charset=utf-8",
    content: buf.toString("utf8"),
    truncated: st.size > MAX_TEXT_READ_BYTES,
  };
}

function listWindowsDrives(): BrowseDirEntry[] {
  const drives: BrowseDirEntry[] = [];
  for (let code = 65; code <= 90; code++) {
    const letter = String.fromCharCode(code);
    const root = `${letter}:\\`;
    if (isExistingDir(root)) {
      drives.push({ name: `${letter}: 盘`, path: root, isDrive: true });
    }
  }
  return drives;
}

function browseDirectories(dirPath: string | undefined, state: PersistedState): BrowseDirResult {
  const quickPlaces = collectSuggestedWorkspaces(state);
  if (process.platform === "win32" && dirPath === "__drives__") {
    return {
      currentPath: "__drives__",
      parentPath: null,
      entries: listWindowsDrives(),
      quickPlaces,
    };
  }

  const target = dirPath && isExistingDir(dirPath) ? normalizePath(dirPath) : os.homedir();
  const parsed = path.parse(target);
  let parentPath: string | null = path.dirname(target);
  if (parentPath === target) {
    parentPath = process.platform === "win32" ? "__drives__" : null;
  }

  const entries: BrowseDirEntry[] = [];
  try {
    const raw = fs.readdirSync(target, { withFileTypes: true });
    for (const d of raw) {
      if (!d.isDirectory()) continue;
      if (d.name.startsWith("$") || d.name === "System Volume Information") continue;
      entries.push({
        name: d.name,
        path: path.join(target, d.name),
      });
    }
    entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
  } catch {
    // ignore permission errors on restricted system dirs
  }

  return {
    currentPath: target,
    parentPath: parsed.root === target && process.platform !== "win32" ? null : parentPath,
    entries,
    quickPlaces,
  };
}

const NOISY_LOCKFILES = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  "bun.lock",
  "cargo.lock",
  "poetry.lock",
  "uv.lock",
  "thumbs.db",
  ".ds_store",
]);

function hasIgnoredSegment(relPath: string, showHidden: boolean): boolean {
  const parts = relPath.split(/[/\\]+/).filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i];
    if (!showHidden && IGNORED_DIRS.has(seg)) return true;
    if (!showHidden && i < parts.length - 1 && seg.startsWith(".") && seg !== ".agents") {
      return true;
    }
  }
  return false;
}

function getRecentChanges(
  rootPath: string,
  showHidden = false,
  limit = 40,
): RecentChangesResult {
  const absRoot = normalizePath(rootPath);
  if (!isExistingDir(absRoot)) {
    return { items: [], autoOpenPaths: [], hasGit: false };
  }

  const byRel = new Map<string, RecentChangedItem>();
  let hasGit = false;

  // 1. Check Git uncommitted status (handles UTF-8 Chinese names & spaces via -z and core.quotepath=false)
  try {
    const topRaw = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: absRoot,
      timeout: 1800,
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString("utf8")
      .trim();

    if (topRaw && isExistingDir(topRaw)) {
      hasGit = true;
      const gitTop = normalizePath(topRaw);
      const rawPorcelain = execFileSync(
        "git",
        ["-c", "core.quotepath=false", "status", "--porcelain=v1", "-uall", "-z", "--", "."],
        {
          cwd: absRoot,
          timeout: 2500,
          windowsHide: true,
          maxBuffer: 4 * 1024 * 1024,
          stdio: ["ignore", "pipe", "ignore"],
        },
      ).toString("utf8");

      const tokens = rawPorcelain.split("\0").filter((t) => t.length > 0);
      for (let i = 0; i < tokens.length; i++) {
        const tok = tokens[i];
        if (tok.length < 4) continue;
        const xy = tok.slice(0, 2);
        const gitRel = tok.slice(3);
        if (xy[0] === "R" || xy[0] === "C") {
          i++; // skip original source path in -z format
        }
        if (xy.includes("D")) continue;

        const fullPath = path.resolve(gitTop, gitRel);
        const relToWs = path.relative(absRoot, fullPath).replace(/\\/g, "/");
        if (relToWs.startsWith("..") || path.isAbsolute(relToWs)) continue;
        if (hasIgnoredSegment(relToWs, showHidden)) continue;
        if (!isExistingFile(fullPath)) continue;

        let st: fs.Stats;
        try {
          st = fs.statSync(fullPath);
        } catch {
          continue;
        }

        const name = path.basename(fullPath);
        const isAdded = xy === "??" || xy.includes("A");
        byRel.set(relToWs.toLowerCase(), {
          name,
          relPath: relToWs,
          ext: getExtension(name),
          size: st.size,
          mtimeMs: st.mtimeMs,
          changeKind: isAdded ? "added" : "modified",
          isGitTracked: true,
        });
      }
    }
  } catch {
    // Not a Git repository or git unavailable — fallback to mtime scan seamlessly
  }

  // 2. Walk workspace for recently modified files (essential for non-Git academic folders & recently committed files)
  const queue: string[] = [absRoot];
  let visited = 0;
  const MAX_VISITED = 3000;
  const now = Date.now();
  const TWO_HOURS = 2 * 3600 * 1000;

  while (queue.length > 0 && visited < MAX_VISITED) {
    const current = queue.shift()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const dirent of entries) {
      visited++;
      if (visited >= MAX_VISITED) break;
      const name = dirent.name;
      if (!showHidden && (IGNORED_DIRS.has(name) || (name.startsWith(".") && name !== ".agents"))) {
        continue;
      }
      const fullPath = path.join(current, name);
      if (dirent.isDirectory()) {
        queue.push(fullPath);
        continue;
      }
      if (!dirent.isFile()) continue;

      const relPath = path.relative(absRoot, fullPath).replace(/\\/g, "/");
      const key = relPath.toLowerCase();
      if (byRel.has(key)) continue;

      let st: fs.Stats;
      try {
        st = fs.statSync(fullPath);
      } catch {
        continue;
      }

      const isFreshNew =
        now - st.mtimeMs < TWO_HOURS &&
        st.birthtimeMs > 0 &&
        Math.abs(st.mtimeMs - st.birthtimeMs) < 5 * 60 * 1000;

      byRel.set(key, {
        name,
        relPath,
        ext: getExtension(name),
        size: st.size,
        mtimeMs: st.mtimeMs,
        changeKind: isFreshNew ? "added" : "recent",
        isGitTracked: false,
      });
    }
  }

  const allItems = Array.from(byRel.values());
  allItems.sort((a, b) => {
    if (a.isGitTracked !== b.isGitTracked) return a.isGitTracked ? -1 : 1;
    return b.mtimeMs - a.mtimeMs;
  });

  const items = allItems.slice(0, limit);

  // Pick clean readable files for auto-open tabs (skip lockfiles and huge binaries)
  const candidates = items.filter(
    (it) =>
      !NOISY_LOCKFILES.has(it.name.toLowerCase()) &&
      it.size <= MAX_TEXT_READ_BYTES &&
      (CLAIMED_FILE_EXTENSIONS.includes(it.ext) || IMAGE_EXTENSIONS.has(it.ext)),
  );

  const gitFresh = candidates.filter((c) => c.isGitTracked);
  const timeFresh = candidates.filter((c) => now - c.mtimeMs < 6 * 3600 * 1000);

  let autoOpenPaths: string[] = [];
  if (gitFresh.length > 0) {
    autoOpenPaths = gitFresh.slice(0, 4).map((c) => c.relPath);
  } else if (timeFresh.length > 0) {
    autoOpenPaths = timeFresh.slice(0, 3).map((c) => c.relPath);
  } else if (candidates.length > 0) {
    autoOpenPaths = [candidates[0].relPath];
  }

  return { items, autoOpenPaths, hasGit };
}

function loadHtmlResource(kind: "workbench" | "viewer"): string {
  const envOverride =
    kind === "workbench"
      ? process.env.BETTER_SIDEBAR_WORKBENCH_HTML
      : process.env.BETTER_SIDEBAR_VIEWER_HTML;
  const candidate = envOverride || path.join(__dirname, `${kind}.html`);
  if (!fs.existsSync(candidate)) {
    throw new Error(`UI resource not found: ${candidate}`);
  }
  return fs.readFileSync(candidate, "utf8");
}

function fileUriToPath(uri: string): string | null {
  try {
    if (!uri.startsWith("file://")) return null;
    return fileURLToPath(uri);
  } catch {
    return null;
  }
}

async function tryGetHostRoot(server: Server): Promise<string | null> {
  try {
    const caps = server.getClientCapabilities();
    if (!caps?.roots) return null;
    const res = await Promise.race([
      server.listRoots(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 500)),
    ]);
    const first = res?.roots?.[0]?.uri;
    if (!first) return null;
    const p = fileUriToPath(first);
    return p && isExistingDir(p) ? p : null;
  } catch {
    return null;
  }
}

const server = new Server(
  {
    name: "agy-better-sidebar",
    version: "2.0.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  },
);

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: WORKBENCH_URI,
        name: "Better Sidebar IDE Workbench",
        description: "Antigravity IDE-style read-only side workbench with file tree, multi-tab code viewer, outline, rich previews, and AI companion.",
        mimeType: "text/html;profile=mcp-app",
        _meta: {
          ui: { prefersBorder: false },
        },
      },
      {
        uri: VIEWER_URI,
        name: "Better Sidebar File Viewer",
        description: "Antigravity IDE-style custom file viewer replacing default code, data, Markdown, HTML, SVG, and Jupyter views.",
        mimeType: "text/html;profile=mcp-app",
        _meta: {
          ui: { prefersBorder: false },
        },
      },
    ],
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;
  if (uri === WORKBENCH_URI) {
    return {
      contents: [
        {
          uri: WORKBENCH_URI,
          mimeType: "text/html;profile=mcp-app",
          text: loadHtmlResource("workbench"),
          _meta: { ui: { prefersBorder: false } },
        },
      ],
    };
  }
  if (uri === VIEWER_URI) {
    return {
      contents: [
        {
          uri: VIEWER_URI,
          mimeType: "text/html;profile=mcp-app",
          text: loadHtmlResource("viewer"),
          _meta: { ui: { prefersBorder: false } },
        },
      ],
    };
  }
  throw new Error(`Unknown UI resource: ${uri}`);
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "open_sidebar_workbench",
        title: "Better Sidebar",
        description:
          "Open the Antigravity IDE-style Better Sidebar read-only workbench in the side panel to browse project files, view syntax-highlighted code with structural outlines, render Markdown/Mermaid/Jupyter/CSV/JSON/HTML/SVG previews, and trigger AI code explanations.",
        inputSchema: {
          type: "object",
          properties: {
            workspacePath: {
              type: "string",
              description: "Optional absolute path to the project folder to open.",
            },
            openFile: {
              type: "string",
              description: "Optional relative or absolute file path to immediately preview.",
            },
          },
        },
        _meta: {
          ui: { resourceUri: WORKBENCH_URI },
          "com.google.antigravity/ui": {
            entrypoints: [
              { type: "aux_pane", title: "Better Sidebar" },
              { type: "global", title: "Better Sidebar" },
            ],
          },
        },
      },
      {
        name: "open_file_viewer",
        title: "Better Sidebar Viewer",
        description:
          "Custom read-only IDE file viewer for code, data, Markdown, Mermaid, HTML, SVG, and Jupyter Notebook files.",
        inputSchema: {
          type: "object",
          properties: {
            file: {
              type: "object",
              properties: {
                name: { type: "string" },
                resourceUri: { type: "string" },
              },
            },
          },
        },
        _meta: {
          ui: { resourceUri: VIEWER_URI },
          "com.google.antigravity/ui": {
            entrypoints: [
              {
                type: "file",
                title: "Better Sidebar Viewer",
                extensions: CLAIMED_FILE_EXTENSIONS,
              },
            ],
          },
        },
      },
      {
        name: "app_get_state",
        title: "Get Sidebar State",
        description: "App-only: returns saved theme/reading preferences and workspace list.",
        inputSchema: { type: "object", properties: {} },
        _meta: { ui: { visibility: ["app"] } },
      },
      {
        name: "app_save_prefs",
        title: "Save Sidebar Preferences",
        description: "App-only: persists user preferences, recent workspaces, and pinned folders.",
        inputSchema: {
          type: "object",
          properties: {
            prefs: { type: "object" },
            lastWorkspace: { type: "string" },
            togglePinWorkspace: { type: "string" },
          },
        },
        _meta: { ui: { visibility: ["app"] } },
      },
      {
        name: "app_list_dir",
        title: "List Workspace Directory",
        description: "App-only: lists files and folders inside a workspace directory.",
        inputSchema: {
          type: "object",
          required: ["rootPath"],
          properties: {
            rootPath: { type: "string" },
            relPath: { type: "string" },
            showHidden: { type: "boolean" },
          },
        },
        _meta: { ui: { visibility: ["app"] } },
      },
      {
        name: "app_find_files",
        title: "Find Workspace Files",
        description: "App-only: fuzzy filename search inside a workspace directory.",
        inputSchema: {
          type: "object",
          required: ["rootPath"],
          properties: {
            rootPath: { type: "string" },
            query: { type: "string" },
            showHidden: { type: "boolean" },
            limit: { type: "number" },
          },
        },
        _meta: { ui: { visibility: ["app"] } },
      },
      {
        name: "app_read_file",
        title: "Read Workspace File",
        description: "App-only: reads a local file inside the active workspace (read-only).",
        inputSchema: {
          type: "object",
          required: ["rootPath", "relPath"],
          properties: {
            rootPath: { type: "string" },
            relPath: { type: "string" },
          },
        },
        _meta: { ui: { visibility: ["app"] } },
      },
      {
        name: "app_browse_dirs",
        title: "Browse Local Folders",
        description: "App-only: lists subdirectories for selecting a workspace folder.",
        inputSchema: {
          type: "object",
          properties: {
            dirPath: { type: "string" },
          },
        },
        _meta: { ui: { visibility: ["app"] } },
      },
      {
        name: "app_get_recent_changes",
        title: "Get Recent File Changes",
        description:
          "App-only: returns Git uncommitted changes and most recently modified files in the workspace.",
        inputSchema: {
          type: "object",
          required: ["rootPath"],
          properties: {
            rootPath: { type: "string" },
            showHidden: { type: "boolean" },
            limit: { type: "number" },
          },
        },
        _meta: { ui: { visibility: ["app"] } },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;

  try {
    if (name === "open_sidebar_workbench") {
      let state = loadState();
      const requestedWs = typeof args.workspacePath === "string" ? args.workspacePath.trim() : "";
      let requestedFile = typeof args.openFile === "string" ? args.openFile.trim() : "";

      let activeWs = "";
      if (requestedWs && isExistingDir(requestedWs)) {
        activeWs = normalizePath(requestedWs);
        state = addRecentWorkspace(state, activeWs);
      } else if (requestedFile && isExistingFile(requestedFile)) {
        const absFile = normalizePath(requestedFile);
        activeWs = path.dirname(absFile);
        requestedFile = path.basename(absFile);
        state = addRecentWorkspace(state, activeWs);
      } else {
        const hostRoot = await tryGetHostRoot(server);
        if (hostRoot) {
          activeWs = hostRoot;
          state = addRecentWorkspace(state, activeWs);
        }
      }

      const payload = buildStatePayload(state);
      const finalWs = activeWs || payload.lastWorkspace;

      if (requestedFile && path.isAbsolute(requestedFile) && isExistingDir(finalWs)) {
        const rel = path.relative(finalWs, requestedFile);
        if (!rel.startsWith("..")) {
          requestedFile = rel.replace(/\\/g, "/");
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `Opened Better Sidebar IDE workbench for ${finalWs}${requestedFile ? ` (file: ${requestedFile})` : ""}.`,
          },
        ],
        structuredContent: {
          initialWorkspace: finalWs,
          initialFile: requestedFile || null,
          state: payload,
        },
      };
    }

    if (name === "open_file_viewer") {
      const state = loadState();
      const fileObj = (args.file as { name?: string; resourceUri?: string } | undefined) ?? null;
      return {
        content: [
          {
            type: "text",
            text: fileObj?.name
              ? `Opened ${fileObj.name} in Better Sidebar Viewer.`
              : "Opened Better Sidebar Viewer.",
          },
        ],
        structuredContent: {
          file: fileObj,
          prefs: state.prefs,
        },
      };
    }

    if (name === "app_get_state") {
      let state = loadState();
      const hostRoot = await tryGetHostRoot(server);
      if (hostRoot) {
        state = addRecentWorkspace(state, hostRoot);
      }
      const payload = buildStatePayload(state);
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: true }) }],
        structuredContent: payload as unknown as Record<string, unknown>,
      };
    }

    if (name === "app_save_prefs") {
      let state = loadState();
      if (args.prefs && typeof args.prefs === "object") {
        state = {
          ...state,
          prefs: normalizePrefs({ ...state.prefs, ...(args.prefs as Partial<UserPrefs>) }),
        };
      }
      if (typeof args.lastWorkspace === "string" && isExistingDir(args.lastWorkspace)) {
        state = addRecentWorkspace(state, args.lastWorkspace);
      }
      if (typeof args.togglePinWorkspace === "string" && isExistingDir(args.togglePinWorkspace)) {
        const norm = normalizePath(args.togglePinWorkspace);
        const exists = state.pinnedWorkspaces.some((p) => p.toLowerCase() === norm.toLowerCase());
        state = {
          ...state,
          pinnedWorkspaces: exists
            ? state.pinnedWorkspaces.filter((p) => p.toLowerCase() !== norm.toLowerCase())
            : [norm, ...state.pinnedWorkspaces].slice(0, 12),
        };
      }
      saveState(state);
      const payload = buildStatePayload(state);
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: true }) }],
        structuredContent: payload as unknown as Record<string, unknown>,
      };
    }

    if (name === "app_list_dir") {
      const rootPath = String(args.rootPath ?? "");
      const relPath = typeof args.relPath === "string" ? args.relPath : "";
      const showHidden = Boolean(args.showHidden);
      const entries = listDirectory(rootPath, relPath, showHidden);
      return {
        content: [{ type: "text", text: `Listed ${entries.length} entries` }],
        structuredContent: { rootPath: normalizePath(rootPath), relPath, entries },
      };
    }

    if (name === "app_find_files") {
      const rootPath = String(args.rootPath ?? "");
      const query = typeof args.query === "string" ? args.query : "";
      const showHidden = Boolean(args.showHidden);
      const limit = typeof args.limit === "number" ? Math.min(200, Math.max(1, args.limit)) : 80;
      const entries = findFiles(rootPath, query, showHidden, limit);
      return {
        content: [{ type: "text", text: `Found ${entries.length} files` }],
        structuredContent: { entries },
      };
    }

    if (name === "app_read_file") {
      const rootPath = String(args.rootPath ?? "");
      const relPath = String(args.relPath ?? "");
      const fileData = readWorkspaceFile(rootPath, relPath);
      return {
        content: [{ type: "text", text: `Read ${fileData.name} (${fileData.size} bytes)` }],
        structuredContent: fileData as unknown as Record<string, unknown>,
      };
    }

    if (name === "app_browse_dirs") {
      const state = loadState();
      const dirPath = typeof args.dirPath === "string" ? args.dirPath : undefined;
      const result = browseDirectories(dirPath, state);
      return {
        content: [{ type: "text", text: `Browsed ${result.currentPath}` }],
        structuredContent: result as unknown as Record<string, unknown>,
      };
    }

    if (name === "app_get_recent_changes") {
      const rootPath = String(args.rootPath ?? "");
      const showHidden = Boolean(args.showHidden);
      const limit = typeof args.limit === "number" ? Math.min(100, Math.max(1, args.limit)) : 40;
      const result = getRecentChanges(rootPath, showHidden, limit);
      return {
        content: [
          {
            type: "text",
            text: `Found ${result.items.length} recent items (${result.autoOpenPaths.length} auto-open)`,
          },
        ],
        structuredContent: result as unknown as Record<string, unknown>,
      };
    }

    return {
      isError: true,
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      isError: true,
      content: [{ type: "text", text: msg }],
      structuredContent: { error: msg },
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("[agy-better-sidebar] fatal server error:", err);
  process.exit(1);
});
