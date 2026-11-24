import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  App,
  applyDocumentTheme,
  applyHostStyleVariables,
} from "@modelcontextprotocol/ext-apps";
import {
  FolderOpen,
  PanelLeft,
  Search,
  Sparkles,
} from "lucide-react";
import {
  DEFAULT_PREFS,
  normalizePrefs,
  type AppStatePayload,
  type BrowseDirResult,
  type DirEntry,
  type OutlineItem,
  type ReadFileResult,
  type RecentChangedItem,
  type RecentChangesResult,
  type UserPrefs,
} from "./shared/types";
import { analyzeFile } from "./shared/outline";
import { useResolvedTheme } from "./shared/useHostTheme";
import { TyporaSidebar, type TyporaSidebarTab } from "./components/TyporaSidebar";
import {
  DocumentPane,
  type DocumentData,
  type DocumentPaneHandle,
} from "./components/DocumentPane";
import { WorkspacePickerModal } from "./components/WorkspacePickerModal";
import { FileIcon } from "./components/FileIcon";

interface OpenTab {
  id: string;
  relPath: string;
  doc: DocumentData;
}

export const WorkbenchApp: React.FC = () => {
  const appRef = useRef<App | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const docPaneRef = useRef<DocumentPaneHandle | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const tabsRef = useRef<OpenTab[]>([]);
  const autoOpenedWsRef = useRef<string>("");

  const [connected, setConnected] = useState(false);
  const [hostTheme, setHostTheme] = useState<"light" | "dark">("light");
  const [prefs, setPrefs] = useState<UserPrefs>(DEFAULT_PREFS);
  const [statePayload, setStatePayload] = useState<AppStatePayload | null>(null);
  const [workspacePath, setWorkspacePath] = useState<string>("");
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [loadingFile, setLoadingFile] = useState<string | null>(null);

  const [recentItems, setRecentItems] = useState<RecentChangedItem[]>([]);
  const [hasGit, setHasGit] = useState<boolean>(false);
  const [loadingRecent, setLoadingRecent] = useState<boolean>(false);

  const [containerWidth, setContainerWidth] = useState<number>(760);
  const [sidebarTab, setSidebarTab] = useState<TyporaSidebarTab>("recent");
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [pickerOpen, setPickerOpen] = useState<boolean>(false);
  const [focusSearchTrigger, setFocusSearchTrigger] = useState<number>(0);
  const [toast, setToast] = useState<string | null>(null);

  tabsRef.current = tabs;

  const isDark = useResolvedTheme(hostTheme, prefs.themePreset, prefs.tableStyle);
  const isNarrow = containerWidth < 740;

  const notify = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const callTool = useCallback(
    async <T,>(name: string, args: Record<string, unknown> = {}): Promise<T> => {
      const app = appRef.current;
      if (!app) throw new Error("Not connected to MCP host");
      const res = await app.callServerTool({ name, arguments: args });
      if (res.isError) {
        const errText =
          res.content?.find((c) => c.type === "text")?.text || "Tool call failed";
        throw new Error(errText);
      }
      return (res.structuredContent ?? {}) as T;
    },
    [],
  );

  const readToTab = useCallback(
    async (ws: string, relPath: string): Promise<OpenTab | null> => {
      try {
        const data = await callTool<ReadFileResult>("app_read_file", {
          rootPath: ws,
          relPath,
        });
        return {
          id: `${ws}::${data.relPath}`,
          relPath: data.relPath,
          doc: {
            name: data.name,
            relPath: data.relPath,
            absPath: data.absPath,
            size: data.size,
            isBinary: data.isBinary,
            isImage: data.isImage,
            content: data.content,
            dataUrl: data.dataUrl,
            truncated: data.truncated,
          },
        };
      } catch {
        return null;
      }
    },
    [callTool],
  );

  const openFileByRelPath = useCallback(
    async (ws: string, relPath: string) => {
      if (!ws || !relPath) return;
      const cleanRel = relPath.replace(/\\/g, "/");
      const tabId = `${ws}::${cleanRel}`;
      const existing = tabsRef.current.find((t) => t.id === tabId);
      if (existing) {
        setActiveTabId(existing.id);
        return;
      }
      setLoadingFile(cleanRel);
      try {
        const newTab = await readToTab(ws, cleanRel);
        if (!newTab) {
          notify(`无法读取文件：${cleanRel}`);
          return;
        }
        setTabs((prev) => {
          const withoutDup = prev.filter((t) => t.id !== newTab.id);
          return [...withoutDup, newTab];
        });
        setActiveTabId(newTab.id);
      } finally {
        setLoadingFile(null);
      }
    },
    [readToTab, notify],
  );

  const preloadRecentTabs = useCallback(
    async (ws: string, relPaths: string[], preferredActiveRel?: string | null) => {
      if (!ws || relPaths.length === 0) return;
      const ordered = preferredActiveRel
        ? [preferredActiveRel, ...relPaths.filter((p) => p !== preferredActiveRel)].slice(0, 4)
        : relPaths.slice(0, 4);

      setLoadingFile(ordered[0]);
      try {
        const loaded = (await Promise.all(ordered.map((p) => readToTab(ws, p)))).filter(
          (t): t is OpenTab => t !== null,
        );
        if (loaded.length === 0) return;
        setTabs((prev) => {
          const loadedIds = new Set(loaded.map((t) => t.id));
          const rest = prev.filter((t) => !loadedIds.has(t.id));
          return [...loaded, ...rest];
        });
        setActiveTabId(loaded[0].id);
        if (window.innerWidth < 740) {
          setSidebarOpen(false);
        }
      } finally {
        setLoadingFile(null);
      }
    },
    [readToTab],
  );

  const refreshRecentChanges = useCallback(
    async (ws: string, shouldAutoOpen: boolean, explicitInitialFile?: string | null) => {
      if (!ws) return;
      setLoadingRecent(true);
      try {
        const res = await callTool<RecentChangesResult>("app_get_recent_changes", {
          rootPath: ws,
          showHidden: prefs.showHidden,
          limit: 40,
        });
        setRecentItems(res.items ?? []);
        setHasGit(Boolean(res.hasGit));

        if (shouldAutoOpen) {
          const autoList = res.autoOpenPaths ?? [];
          if (explicitInitialFile || autoList.length > 0) {
            await preloadRecentTabs(ws, autoList, explicitInitialFile);
          }
        }
      } catch {
        setRecentItems([]);
      } finally {
        setLoadingRecent(false);
      }
    },
    [callTool, prefs.showHidden, preloadRecentTabs],
  );

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        setContainerWidth(Math.round(e.contentRect.width));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setSidebarTab("files");
        setSidebarOpen(true);
        setFocusSearchTrigger((n) => n + 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const app = new App(
      { name: "agy-better-sidebar-workbench", version: "2.0.0" },
      {},
      { autoResize: false },
    );
    appRef.current = app;

    let initializedFromToolResult = false;

    const applyHostCtx = (ctx: ReturnType<App["getHostContext"]>) => {
      if (!ctx) return;
      if (ctx.theme === "dark" || ctx.theme === "light") {
        setHostTheme(ctx.theme);
        applyDocumentTheme(ctx.theme);
      }
      if (ctx.styles?.variables) {
        applyHostStyleVariables(ctx.styles.variables);
      }
    };

    app.onhostcontextchanged = (ctx) => {
      applyHostCtx(ctx as ReturnType<App["getHostContext"]>);
    };

    app.ontoolresult = (result) => {
      const sc = result?.structuredContent as
        | {
            initialWorkspace?: string;
            initialFile?: string | null;
            state?: AppStatePayload;
          }
        | undefined;
      if (!sc) return;
      initializedFromToolResult = true;
      if (sc.state) {
        setStatePayload(sc.state);
        setPrefs(normalizePrefs(sc.state.prefs));
      }
      const ws = sc.initialWorkspace || sc.state?.lastWorkspace || "";
      if (ws) {
        autoOpenedWsRef.current = "";
        setWorkspacePath(ws);
        if (sc.initialFile) {
          void openFileByRelPath(ws, sc.initialFile);
        }
      }
    };

    (async () => {
      try {
        await app.connect();
        setConnected(true);
        applyHostCtx(app.getHostContext());

        window.setTimeout(async () => {
          if (initializedFromToolResult) return;
          try {
            const res = await app.callServerTool({
              name: "app_get_state",
              arguments: {},
            });
            const st = res.structuredContent as unknown as AppStatePayload | undefined;
            if (st) {
              setStatePayload(st);
              setPrefs(normalizePrefs(st.prefs));
              if (st.lastWorkspace) setWorkspacePath(st.lastWorkspace);
            }
          } catch {
            // ignore
          }
        }, 220);
      } catch (err) {
        console.error("[Better Sidebar] MCP connect error:", err);
      }
    })();

    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, [openFileByRelPath]);

  useEffect(() => {
    if (!connected || !workspacePath) return;
    const shouldAutoOpen = autoOpenedWsRef.current !== workspacePath && tabsRef.current.length === 0;
    autoOpenedWsRef.current = workspacePath;
    void refreshRecentChanges(workspacePath, shouldAutoOpen);
  }, [connected, workspacePath, prefs.showHidden, refreshRecentChanges]);

  const handleUpdatePrefs = useCallback(
    async (patch: Partial<UserPrefs>) => {
      const next = normalizePrefs({ ...prefs, ...patch });
      setPrefs(next);
      try {
        const st = await callTool<AppStatePayload>("app_save_prefs", { prefs: next });
        setStatePayload(st);
      } catch {
        // ignore
      }
    },
    [prefs, callTool],
  );

  const handleSelectWorkspace = useCallback(
    async (newPath: string) => {
      autoOpenedWsRef.current = "";
      setTabs([]);
      setActiveTabId(null);
      setWorkspacePath(newPath);
      setSidebarTab("recent");
      setSidebarOpen(true);
      try {
        const st = await callTool<AppStatePayload>("app_save_prefs", {
          lastWorkspace: newPath,
        });
        setStatePayload(st);
      } catch {
        // ignore
      }
    },
    [callTool],
  );

  const handleTogglePin = useCallback(
    async (pinPath: string) => {
      try {
        const st = await callTool<AppStatePayload>("app_save_prefs", {
          togglePinWorkspace: pinPath,
        });
        setStatePayload(st);
      } catch {
        // ignore
      }
    },
    [callTool],
  );

  const handleListDir = useCallback(
    async (relPath: string): Promise<DirEntry[]> => {
      if (!workspacePath) return [];
      const res = await callTool<{ entries: DirEntry[] }>("app_list_dir", {
        rootPath: workspacePath,
        relPath,
        showHidden: prefs.showHidden,
      });
      return res.entries ?? [];
    },
    [workspacePath, prefs.showHidden, callTool],
  );

  const handleFindFiles = useCallback(
    async (query: string): Promise<DirEntry[]> => {
      if (!workspacePath) return [];
      const res = await callTool<{ entries: DirEntry[] }>("app_find_files", {
        rootPath: workspacePath,
        query,
        showHidden: prefs.showHidden,
        limit: 80,
      });
      return res.entries ?? [];
    },
    [workspacePath, prefs.showHidden, callTool],
  );

  const handleBrowseDirs = useCallback(
    async (dirPath?: string): Promise<BrowseDirResult> => {
      return callTool<BrowseDirResult>("app_browse_dirs", { dirPath });
    },
    [callTool],
  );

  const closeTab = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      const next = prev.filter((t) => t.id !== id);
      if (activeTabId === id) {
        const neighbor = next[idx] ?? next[idx - 1] ?? null;
        setActiveTabId(neighbor?.id ?? null);
      }
      return next;
    });
  };

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;
  const activeAnalysis = useMemo(
    () =>
      activeTab && !activeTab.doc.isBinary
        ? analyzeFile(activeTab.doc.name, activeTab.doc.content ?? "")
        : null,
    [activeTab],
  );

  const headerTabs = useMemo(
    () =>
      tabs.map((t) => ({
        id: t.id,
        name: t.doc.name,
        relPath: t.relPath,
      })),
    [tabs],
  );

  const wsTitle = workspacePath.split(/[\\/]/).filter(Boolean).pop() || "未选择目录";

  const handleSelectOutline = (item: OutlineItem) => {
    docPaneRef.current?.jumpToOutline(item);
  };

  return (
    <div className="tp-shell" ref={rootRef}>
      {/* Unified Typora Left Sidebar (最近 | 文件 | 大纲) */}
      {sidebarOpen && (
        <>
          {isNarrow && activeTab && (
            <div className="tp-backdrop" onClick={() => setSidebarOpen(false)} />
          )}
          <TyporaSidebar
            mode="workbench"
            activeTab={sidebarTab}
            onChangeTab={setSidebarTab}
            drawerMode={isNarrow && Boolean(activeTab)}
            onClose={() => setSidebarOpen(false)}
            outlineItems={activeAnalysis?.outline ?? []}
            onSelectOutline={handleSelectOutline}
            workspacePath={workspacePath}
            activeRelPath={activeTab?.relPath ?? null}
            recentItems={recentItems}
            hasGit={hasGit}
            loadingRecent={loadingRecent}
            showHidden={prefs.showHidden}
            focusSearchTrigger={focusSearchTrigger}
            onRefreshRecent={() => void refreshRecentChanges(workspacePath, false)}
            onListDir={handleListDir}
            onFindFiles={handleFindFiles}
            onSelectRelPath={(relPath) => void openFileByRelPath(workspacePath, relPath)}
            onToggleHidden={() => void handleUpdatePrefs({ showHidden: !prefs.showHidden })}
            onOpenWorkspacePicker={() => setPickerOpen(true)}
          />
        </>
      )}

      {/* Right Paper Surface */}
      {loadingFile && !activeTab ? (
        <div className="tp-main">
          <div className="ide-empty-state">
            <Sparkles size={22} style={{ color: "var(--tp-accent)" }} />
            <div>正在展开 {loadingFile}...</div>
          </div>
        </div>
      ) : activeTab ? (
        <DocumentPane
          ref={docPaneRef}
          app={appRef.current}
          doc={activeTab.doc}
          analysis={activeAnalysis ?? undefined}
          prefs={prefs}
          isDark={isDark}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
          headerTabs={headerTabs}
          activeTabId={activeTabId}
          onSelectTab={setActiveTabId}
          onCloseTab={closeTab}
          onUpdatePrefs={(p) => void handleUpdatePrefs(p)}
          onNotify={notify}
        />
      ) : (
        <div className="tp-main">
          <header className="tp-topbar">
            <div className="tp-topbar-left">
              <button
                className={`ide-icon-btn ${sidebarOpen ? "active" : ""}`}
                onClick={() => setSidebarOpen((v) => !v)}
                title="展开/收起侧栏"
              >
                <PanelLeft size={15} />
              </button>
              <span className="tp-doc-title-single">Better Sidebar · Typora 阅读空间</span>
            </div>
          </header>

          <div className="ide-empty-state">
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: 14,
                background: "var(--tp-accent-soft)",
                color: "var(--tp-accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 4,
              }}
            >
              <Sparkles size={22} />
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, fontFamily: "var(--tp-font-heading)", color: "var(--tp-heading)" }}>
              {wsTitle}
            </div>
            <div style={{ fontSize: 13, maxWidth: 420 }}>
              选择左侧任意文档或代码，即刻以 Typora Lapis 清透排版展开阅读。
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button className="tp-pill-btn ai" onClick={() => setPickerOpen(true)}>
                <FolderOpen size={13} />
                <span>切换项目目录</span>
              </button>
              <button
                className="tp-pill-btn"
                onClick={() => {
                  setSidebarTab("files");
                  setSidebarOpen(true);
                  setFocusSearchTrigger((n) => n + 1);
                }}
              >
                <Search size={13} />
                <span>搜索文件 (Ctrl+P)</span>
              </button>
            </div>

            {recentItems.length > 0 && (
              <div className="ide-welcome-grid">
                {recentItems.slice(0, 8).map((f) => (
                  <button
                    key={f.relPath}
                    className="ide-welcome-card"
                    onClick={() => void openFileByRelPath(workspacePath, f.relPath)}
                  >
                    <FileIcon name={f.name} />
                    <span className="ide-tree-label">{f.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {pickerOpen && (
        <WorkspacePickerModal
          currentWorkspace={workspacePath}
          pinnedWorkspaces={statePayload?.pinnedWorkspaces ?? []}
          suggestedWorkspaces={statePayload?.suggestedWorkspaces ?? []}
          onBrowse={handleBrowseDirs}
          onSelectWorkspace={(p) => void handleSelectWorkspace(p)}
          onTogglePin={(p) => void handleTogglePin(p)}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {toast && <div className="ide-toast">{toast}</div>}
    </div>
  );
};
