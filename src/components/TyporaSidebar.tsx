import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  FolderSync,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import type { DirEntry, OutlineItem, RecentChangedItem } from "../shared/types";
import { FileIcon } from "./FileIcon";

export type TyporaSidebarTab = "recent" | "files" | "outline";

interface TyporaSidebarProps {
  mode: "workbench" | "viewer";
  activeTab: TyporaSidebarTab;
  onChangeTab: (tab: TyporaSidebarTab) => void;
  drawerMode: boolean;
  onClose: () => void;

  // Outline (available in both workbench & viewer)
  outlineItems: OutlineItem[];
  onSelectOutline: (item: OutlineItem) => void;

  // Workbench-only props
  workspacePath?: string;
  activeRelPath?: string | null;
  recentItems?: RecentChangedItem[];
  hasGit?: boolean;
  loadingRecent?: boolean;
  showHidden?: boolean;
  focusSearchTrigger?: number;
  onRefreshRecent?: () => void;
  onListDir?: (relPath: string) => Promise<DirEntry[]>;
  onFindFiles?: (query: string) => Promise<DirEntry[]>;
  onSelectRelPath?: (relPath: string) => void;
  onToggleHidden?: () => void;
  onOpenWorkspacePicker?: () => void;
}

const KIND_BADGE: Record<OutlineItem["kind"], { label: string; color: string }> = {
  heading: { label: "H", color: "var(--tp-accent)" },
  class: { label: "C", color: "#d97706" },
  component: { label: "⚛", color: "#0284c7" },
  function: { label: "ƒ", color: "#7c3aed" },
  method: { label: "m", color: "#4f46e5" },
  const: { label: "T", color: "#059669" },
  section: { label: "§", color: "#db2777" },
  cell: { label: "▶", color: "#ea580c" },
  key: { label: "K", color: "#ca8a04" },
  tag: { label: "<>", color: "#ea580c" },
  rule: { label: "#", color: "#9333ea" },
};

function formatRelTime(mtimeMs: number): string {
  const sec = Math.max(0, Math.floor((Date.now() - mtimeMs) / 1000));
  if (sec < 45) return "刚刚";
  if (sec < 3600) return `${Math.floor(sec / 60)}分前`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}小时前`;
  const days = Math.floor(sec / 86400);
  return days === 1 ? "昨天" : `${days}天前`;
}

export const TyporaSidebar: React.FC<TyporaSidebarProps> = ({
  mode,
  activeTab,
  onChangeTab,
  drawerMode,
  onClose,
  outlineItems,
  onSelectOutline,
  workspacePath = "",
  activeRelPath = null,
  recentItems = [],
  hasGit = false,
  loadingRecent = false,
  showHidden = false,
  focusSearchTrigger = 0,
  onRefreshRecent,
  onListDir,
  onFindFiles,
  onSelectRelPath,
  onToggleHidden,
  onOpenWorkspacePicker,
}) => {
  const [dirMap, setDirMap] = useState<Record<string, DirEntry[]>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<DirEntry[] | null>(null);
  const [outlineFilter, setOutlineFilter] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const wsName = workspacePath.split(/[\\/]/).filter(Boolean).pop() || "选择目录";

  const loadRootDir = async () => {
    if (mode !== "workbench" || !workspacePath || !onListDir) return;
    try {
      const entries = await onListDir("");
      setDirMap({ "": entries });
      setExpanded({});
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    setSearchQuery("");
    setSearchResults(null);
    void loadRootDir();
  }, [workspacePath, showHidden]);

  useEffect(() => {
    if (focusSearchTrigger > 0) {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }
  }, [focusSearchTrigger]);

  useEffect(() => {
    if (mode !== "workbench" || !onFindFiles) return;
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const res = await onFindFiles(q);
        if (!cancelled) setSearchResults(res);
      } catch {
        if (!cancelled) setSearchResults([]);
      }
    }, 160);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchQuery, workspacePath, showHidden, mode]);

  const toggleFolder = async (relPath: string) => {
    const nextOpen = !expanded[relPath];
    setExpanded((prev) => ({ ...prev, [relPath]: nextOpen }));
    if (nextOpen && !dirMap[relPath] && onListDir) {
      try {
        const entries = await onListDir(relPath);
        setDirMap((prev) => ({ ...prev, [relPath]: entries }));
      } catch {
        // ignore
      }
    }
  };

  const filteredOutline = useMemo(() => {
    const q = outlineFilter.trim().toLowerCase();
    if (!q) return outlineItems;
    return outlineItems.filter((it) => it.name.toLowerCase().includes(q));
  }, [outlineItems, outlineFilter]);

  const renderTree = (relPath: string, depth: number): React.ReactNode => {
    const list = dirMap[relPath];
    if (!list) return null;
    return list.map((entry) => {
      const isOpen = Boolean(expanded[entry.relPath]);
      const isSelected = !entry.isDir && activeRelPath === entry.relPath;
      return (
        <React.Fragment key={entry.relPath}>
          <button
            className={`ide-tree-row ${isSelected ? "selected" : ""}`}
            style={{ paddingLeft: 8 + depth * 14 }}
            onClick={() => {
              if (entry.isDir) {
                void toggleFolder(entry.relPath);
              } else {
                onSelectRelPath?.(entry.relPath);
                if (drawerMode) onClose();
              }
            }}
            title={entry.relPath}
          >
            {entry.isDir ? (
              <span style={{ display: "inline-flex", width: 14, color: "var(--tp-text-faint)" }}>
                {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </span>
            ) : (
              <span style={{ width: 6, flexShrink: 0 }} />
            )}
            <FileIcon name={entry.name} isDir={entry.isDir} isOpen={isOpen} />
            <span className="ide-tree-label">{entry.name}</span>
          </button>
          {entry.isDir && isOpen && renderTree(entry.relPath, depth + 1)}
        </React.Fragment>
      );
    });
  };

  const uncommittedCount = recentItems.filter((i) => i.isGitTracked).length;

  return (
    <aside className={`tp-sidebar ${drawerMode ? "drawer" : ""}`}>
      {/* Top Header */}
      <div className="tp-sidebar-top">
        {mode === "workbench" ? (
          <button
            className="tp-ws-pill"
            onClick={onOpenWorkspacePicker}
            title={`点击切换项目目录（当前：${workspacePath}）`}
          >
            <FolderSync size={14} style={{ color: "var(--tp-accent)", flexShrink: 0 }} />
            <span className="ide-tree-label">{wsName}</span>
          </button>
        ) : (
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--tp-heading)", paddingLeft: 4 }}>
            文档大纲
          </span>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          {mode === "workbench" && activeTab === "files" && onToggleHidden && (
            <button
              className={`ide-icon-btn ${showHidden ? "active" : ""}`}
              onClick={onToggleHidden}
              title={showHidden ? "隐藏系统目录" : "显示隐藏文件"}
            >
              {showHidden ? <Eye size={13} /> : <EyeOff size={13} />}
            </button>
          )}
          {mode === "workbench" && (
            <button
              className="ide-icon-btn"
              onClick={() => {
                if (activeTab === "recent") onRefreshRecent?.();
                else void loadRootDir();
              }}
              title="刷新"
            >
              <RefreshCw size={13} />
            </button>
          )}
          <button className="ide-icon-btn" onClick={onClose} title="收起侧边栏">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Typora Segmented Switcher: 最近 | 文件 | 大纲 */}
      {mode === "workbench" && (
        <div className="tp-sidebar-tabs">
          <button
            className={`tp-sidebar-tab ${activeTab === "recent" ? "active" : ""}`}
            onClick={() => onChangeTab("recent")}
          >
            <span>最近</span>
            {uncommittedCount > 0 && (
              <span
                style={{
                  fontSize: 10,
                  padding: "0 5px",
                  borderRadius: 999,
                  background: "var(--tp-accent-soft)",
                  color: "var(--tp-accent)",
                }}
              >
                {uncommittedCount}
              </span>
            )}
          </button>
          <button
            className={`tp-sidebar-tab ${activeTab === "files" ? "active" : ""}`}
            onClick={() => onChangeTab("files")}
          >
            文件
          </button>
          <button
            className={`tp-sidebar-tab ${activeTab === "outline" ? "active" : ""}`}
            onClick={() => onChangeTab("outline")}
          >
            大纲
          </button>
        </div>
      )}

      {/* Tab Body */}
      <div className="tp-sidebar-body">
        {activeTab === "outline" ? (
          <>
            {outlineItems.length > 8 && (
              <div className="ide-search-box">
                <div className="ide-search-input-wrap">
                  <Search size={12} style={{ color: "var(--tp-text-faint)" }} />
                  <input
                    className="ide-search-input"
                    placeholder="筛选章节或函数..."
                    value={outlineFilter}
                    onChange={(e) => setOutlineFilter(e.target.value)}
                  />
                </div>
              </div>
            )}
            <div className="ide-tree-scroll">
              {filteredOutline.length === 0 ? (
                <div style={{ padding: "24px 12px", textAlign: "center", fontSize: 12, color: "var(--tp-text-faint)" }}>
                  当前文件暂无章节大纲
                </div>
              ) : (
                filteredOutline.map((item) => {
                  const b = KIND_BADGE[item.kind];
                  const isH = item.kind === "heading";
                  return (
                    <button
                      key={item.id}
                      className="ide-outline-item"
                      style={{
                        paddingLeft: 10 + item.depth * 13,
                        fontWeight: isH && item.depth === 0 ? 600 : 400,
                      }}
                      onClick={() => {
                        onSelectOutline(item);
                        if (drawerMode) onClose();
                      }}
                      title={`${item.name} · 第 ${item.line} 行`}
                    >
                      {!isH && (
                        <span
                          className="ide-outline-kind"
                          style={{ color: b.color, background: "var(--tp-accent-soft)" }}
                        >
                          {b.label}
                        </span>
                      )}
                      <span className="ide-tree-label">{item.name}</span>
                      <span className="ide-outline-line">L{item.line}</span>
                    </button>
                  );
                })
              )}
            </div>
          </>
        ) : activeTab === "recent" ? (
          <div className="ide-tree-scroll">
            {loadingRecent ? (
              <div style={{ padding: 16, fontSize: 12, color: "var(--tp-text-faint)" }}>
                正在读取最新文件...
              </div>
            ) : recentItems.length === 0 ? (
              <div style={{ padding: 16, fontSize: 12, color: "var(--tp-text-faint)" }}>
                暂无近期文件
              </div>
            ) : (
              recentItems.map((item) => {
                const isSelected = activeRelPath === item.relPath;
                const badge =
                  item.changeKind === "added"
                    ? { text: "新", color: "#059669", bg: "rgba(5,150,105,0.12)" }
                    : item.changeKind === "modified"
                      ? { text: "改", color: "#d97706", bg: "rgba(217,119,6,0.12)" }
                      : null;
                return (
                  <button
                    key={item.relPath}
                    className={`ide-tree-row ${isSelected ? "selected" : ""}`}
                    onClick={() => {
                      onSelectRelPath?.(item.relPath);
                      if (drawerMode) onClose();
                    }}
                    title={`${item.relPath}${hasGit && item.isGitTracked ? " (未提交变更)" : ""}`}
                  >
                    <FileIcon name={item.name} />
                    <span className="ide-tree-label">{item.name}</span>
                    {badge ? (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "0 5px",
                          borderRadius: 4,
                          color: badge.color,
                          background: badge.bg,
                        }}
                      >
                        {badge.text}
                      </span>
                    ) : (
                      <span className="ide-tree-sub">{formatRelTime(item.mtimeMs)}</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        ) : (
          <>
            <div className="ide-search-box">
              <div className="ide-search-input-wrap">
                <Search size={12} style={{ color: "var(--tp-text-faint)" }} />
                <input
                  ref={searchInputRef}
                  className="ide-search-input"
                  placeholder="搜索文件名 (Ctrl+P)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button className="ide-tab-close" onClick={() => setSearchQuery("")}>
                    <X size={11} />
                  </button>
                )}
              </div>
            </div>
            <div className="ide-tree-scroll">
              {searchResults !== null ? (
                searchResults.length === 0 ? (
                  <div style={{ padding: 14, fontSize: 12, color: "var(--tp-text-faint)" }}>
                    无匹配文件
                  </div>
                ) : (
                  searchResults.map((entry) => (
                    <button
                      key={entry.relPath}
                      className={`ide-tree-row ${activeRelPath === entry.relPath ? "selected" : ""}`}
                      onClick={() => {
                        onSelectRelPath?.(entry.relPath);
                        if (drawerMode) onClose();
                      }}
                    >
                      <FileIcon name={entry.name} />
                      <span className="ide-tree-label">{entry.name}</span>
                    </button>
                  ))
                )
              ) : (
                renderTree("", 0)
              )}
            </div>
          </>
        )}
      </div>
    </aside>
  );
};
