import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  App,
  applyDocumentTheme,
  applyHostStyleVariables,
} from "@modelcontextprotocol/ext-apps";
import { AlertCircle, Sparkles } from "lucide-react";
import {
  DEFAULT_PREFS,
  normalizePrefs,
  type AppStatePayload,
  type OutlineItem,
  type UserPrefs,
} from "./shared/types";
import { decodeBase64Utf8 } from "./shared/bridge";
import { getExtension, IMAGE_EXTENSIONS } from "./shared/fileMeta";
import { analyzeFile } from "./shared/outline";
import { useResolvedTheme } from "./shared/useHostTheme";
import { TyporaSidebar } from "./components/TyporaSidebar";
import {
  DocumentPane,
  type DocumentData,
  type DocumentPaneHandle,
} from "./components/DocumentPane";

interface IncomingFileArg {
  name?: string;
  resourceUri?: string;
}

export const ViewerApp: React.FC = () => {
  const appRef = useRef<App | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const docPaneRef = useRef<DocumentPaneHandle | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const loadedUriRef = useRef<string | null>(null);

  const [hostTheme, setHostTheme] = useState<"light" | "dark">("light");
  const [prefs, setPrefs] = useState<UserPrefs>(DEFAULT_PREFS);
  const [doc, setDoc] = useState<DocumentData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(680);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [toast, setToast] = useState<string | null>(null);

  const isDark = useResolvedTheme(hostTheme, prefs.themePreset, prefs.tableStyle);
  const isNarrow = containerWidth < 740;

  const notify = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const w = Math.round(e.contentRect.width);
        setContainerWidth(w);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const loadAntigravityFile = useCallback(async (app: App, fileArg: IncomingFileArg) => {
    const uri = fileArg.resourceUri;
    const name = fileArg.name || uri?.split("/").pop() || "untitled";
    if (!uri) return;
    if (loadedUriRef.current === uri) return;
    loadedUriRef.current = uri;

    setLoading(true);
    setError(null);

    try {
      const result = await app.readServerResource({ uri });
      const item = result.contents?.[0];
      if (!item) {
        throw new Error("宿主未返回文件内容");
      }

      const ext = getExtension(name);
      const isImage = IMAGE_EXTENSIONS.has(ext);

      if ("blob" in item && typeof item.blob === "string") {
        const approxBytes = Math.floor((item.blob.length * 3) / 4);
        if (isImage) {
          const mime = item.mimeType || "image/png";
          setDoc({
            name,
            size: approxBytes,
            isBinary: true,
            isImage: true,
            dataUrl: `data:${mime};base64,${item.blob}`,
          });
        } else {
          const decoded = decodeBase64Utf8(item.blob);
          setDoc({
            name,
            size: approxBytes,
            isBinary: false,
            isImage: false,
            content: decoded,
          });
        }
      } else if ("text" in item && typeof item.text === "string") {
        setDoc({
          name,
          size: new TextEncoder().encode(item.text).length,
          isBinary: false,
          isImage: false,
          content: item.text,
        });
      } else {
        throw new Error("不支持的资源内容格式");
      }
    } catch (err) {
      loadedUriRef.current = null;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const app = new App(
      { name: "agy-better-sidebar-viewer", version: "2.0.0" },
      {},
      { autoResize: false },
    );
    appRef.current = app;

    let pendingFile: IncomingFileArg | null = null;
    let isConnected = false;

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

    const handleFilePayload = (fileObj?: IncomingFileArg | null) => {
      if (!fileObj?.resourceUri) return;
      if (isConnected) {
        void loadAntigravityFile(app, fileObj);
      } else {
        pendingFile = fileObj;
      }
    };

    app.ontoolinput = (params) => {
      const args = params?.arguments as { file?: IncomingFileArg } | undefined;
      if (args?.file) handleFilePayload(args.file);
    };

    app.ontoolresult = (result) => {
      const sc = result?.structuredContent as
        | { file?: IncomingFileArg | null; prefs?: Partial<UserPrefs> }
        | undefined;
      if (sc?.prefs) {
        setPrefs((prev) => normalizePrefs({ ...prev, ...sc.prefs }));
      }
      if (sc?.file) handleFilePayload(sc.file);
    };

    (async () => {
      try {
        await app.connect();
        isConnected = true;
        applyHostCtx(app.getHostContext());

        if (pendingFile) {
          void loadAntigravityFile(app, pendingFile);
        }

        try {
          const res = await app.callServerTool({
            name: "app_get_state",
            arguments: {},
          });
          const st = res.structuredContent as unknown as AppStatePayload | undefined;
          if (st?.prefs) {
            setPrefs((prev) => normalizePrefs({ ...prev, ...st.prefs }));
          }
        } catch {
          // ignore
        }
      } catch (err) {
        setLoading(false);
        setError(err instanceof Error ? err.message : String(err));
      }
    })();

    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, [loadAntigravityFile]);

  const handleUpdatePrefs = useCallback(async (patch: Partial<UserPrefs>) => {
    setPrefs((prev) => {
      const next = normalizePrefs({ ...prev, ...patch });
      appRef.current
        ?.callServerTool({ name: "app_save_prefs", arguments: { prefs: next } })
        .catch(() => {});
      return next;
    });
  }, []);

  const analysis = useMemo(
    () => (doc && !doc.isBinary ? analyzeFile(doc.name, doc.content ?? "") : null),
    [doc],
  );

  const handleSelectOutline = (item: OutlineItem) => {
    docPaneRef.current?.jumpToOutline(item);
  };

  return (
    <div className="tp-shell" ref={rootRef}>
      {error ? (
        <div className="tp-main">
          <div className="ide-empty-state">
            <AlertCircle size={26} style={{ color: "#ef4444" }} />
            <div style={{ fontWeight: 600, color: "var(--tp-heading)" }}>读取文件失败</div>
            <div style={{ fontSize: 12.5, maxWidth: 380 }}>{error}</div>
          </div>
        </div>
      ) : loading || !doc ? (
        <div className="tp-main">
          <div className="ide-empty-state">
            <Sparkles size={24} style={{ color: "var(--tp-accent)" }} />
            <div style={{ fontSize: 13 }}>正在展开 Typora 纸面...</div>
          </div>
        </div>
      ) : (
        <>
          {sidebarOpen && (
            <>
              {isNarrow && (
                <div className="tp-backdrop" onClick={() => setSidebarOpen(false)} />
              )}
              <TyporaSidebar
                mode="viewer"
                activeTab="outline"
                onChangeTab={() => {}}
                drawerMode={isNarrow}
                onClose={() => setSidebarOpen(false)}
                outlineItems={analysis?.outline ?? []}
                onSelectOutline={handleSelectOutline}
              />
            </>
          )}

          <DocumentPane
            ref={docPaneRef}
            app={appRef.current}
            doc={doc}
            analysis={analysis ?? undefined}
            prefs={prefs}
            isDark={isDark}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen((v) => !v)}
            onUpdatePrefs={(p) => void handleUpdatePrefs(p)}
            onNotify={notify}
          />
        </>
      )}

      {toast && <div className="ide-toast">{toast}</div>}
    </div>
  );
};
