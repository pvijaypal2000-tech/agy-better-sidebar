export type ThemePreset = "lapis" | "github" | "newsprint" | "night";

export type TableStylePreset = "card" | "threeline";

export type PreviewKind =
  | "none"
  | "markdown"
  | "mermaid"
  | "html"
  | "svg"
  | "csv"
  | "json"
  | "yaml"
  | "toml"
  | "notebook"
  | "image";

export type ViewMode = "code" | "preview" | "split";

export interface UserPrefs {
  themePreset: ThemePreset;
  tableStyle: TableStylePreset;
  fontSize: number;
  wordWrap: boolean;
  showHidden: boolean;
  aiTargetNew: boolean;
  showSummaryBar: boolean;
}

export const DEFAULT_PREFS: UserPrefs = {
  themePreset: "lapis",
  tableStyle: "card",
  fontSize: 15,
  wordWrap: true,
  showHidden: false,
  aiTargetNew: false,
  showSummaryBar: true,
};

export function normalizePrefs(raw?: Partial<UserPrefs> | null): UserPrefs {
  const merged = { ...DEFAULT_PREFS, ...(raw ?? {}) };
  const rawTheme = String(merged.themePreset || "lapis");
  let themePreset: ThemePreset = "lapis";
  if (rawTheme === "lapis" || rawTheme === "github" || rawTheme === "newsprint" || rawTheme === "night") {
    themePreset = rawTheme;
  } else if (rawTheme === "dark") {
    themePreset = "night";
  } else if (rawTheme === "paper") {
    themePreset = "newsprint";
  } else {
    // Migrate legacy "auto" / "light" to Lapis default per v2.0 preference
    themePreset = "lapis";
  }
  const tableStyle: TableStylePreset =
    merged.tableStyle === "threeline" ? "threeline" : "card";
  const fontSize =
    typeof merged.fontSize === "number" && merged.fontSize >= 12 && merged.fontSize <= 22
      ? merged.fontSize
      : 15;
  return {
    ...merged,
    themePreset,
    tableStyle,
    fontSize,
  };
}

export interface SuggestedWorkspace {
  path: string;
  label: string;
  kind: "recent" | "pinned" | "scratch" | "common";
}

export interface AppStatePayload {
  prefs: UserPrefs;
  lastWorkspace: string;
  recentWorkspaces: string[];
  pinnedWorkspaces: string[];
  suggestedWorkspaces: SuggestedWorkspace[];
  homeDir: string;
}

export interface DirEntry {
  name: string;
  relPath: string;
  isDir: boolean;
  size: number;
  ext: string;
  mtimeMs: number;
}

export interface RecentChangedItem {
  name: string;
  relPath: string;
  ext: string;
  size: number;
  mtimeMs: number;
  changeKind: "added" | "modified" | "recent";
  isGitTracked: boolean;
}

export interface RecentChangesResult {
  items: RecentChangedItem[];
  autoOpenPaths: string[];
  hasGit: boolean;
}

export interface BrowseDirEntry {
  name: string;
  path: string;
  isDrive?: boolean;
}

export interface BrowseDirResult {
  currentPath: string;
  parentPath: string | null;
  entries: BrowseDirEntry[];
  quickPlaces: SuggestedWorkspace[];
}

export interface ReadFileResult {
  name: string;
  relPath: string;
  absPath: string;
  ext: string;
  size: number;
  isBinary: boolean;
  isImage: boolean;
  mimeType: string;
  content?: string;
  dataUrl?: string;
  truncated?: boolean;
}

export interface OutlineItem {
  id: string;
  kind:
    | "class"
    | "function"
    | "method"
    | "component"
    | "const"
    | "heading"
    | "section"
    | "cell"
    | "key"
    | "tag"
    | "rule";
  name: string;
  detail?: string;
  line: number;
  depth: number;
}

export interface FileAnalysis {
  languageId: string;
  languageLabel: string;
  roleDescription: string;
  accentColor: string;
  lineCount: number;
  charCount: number;
  imports: string[];
  exports: string[];
  outline: OutlineItem[];
  previewKind: PreviewKind;
}

export interface SelectionInfo {
  text: string;
  fromLine: number;
  toLine: number;
}
