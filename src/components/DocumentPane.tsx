import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type { App } from "@modelcontextprotocol/ext-apps";
import {
  BookOpen,
  Check,
  Code2,
  Copy,
  Eye,
  GitBranch,
  MessageSquarePlus,
  Minus,
  Palette,
  PanelLeft,
  Paperclip,
  Plus,
  Sparkles,
  Table2,
  WrapText,
  X,
} from "lucide-react";
import type {
  FileAnalysis,
  OutlineItem,
  SelectionInfo,
  ThemePreset,
  UserPrefs,
  ViewMode,
} from "../shared/types";
import { analyzeFile } from "../shared/outline";
import { defaultViewModeFor, formatBytes } from "../shared/fileMeta";
import {
  buildAiPrompt,
  copyToClipboard,
  dispatchAiAction,
  type AiActionKind,
} from "../shared/bridge";
import { CodeReader, type CodeReaderHandle } from "./CodeReader";
import { RichPreview, type RichPreviewHandle } from "./RichPreview";
import { FileIcon } from "./FileIcon";

export interface DocumentData {
  name: string;
  relPath?: string;
  absPath?: string;
  size: number;
  isBinary: boolean;
  isImage: boolean;
  content?: string;
  dataUrl?: string;
  truncated?: boolean;
}

export interface HeaderTabItem {
  id: string;
  name: string;
  relPath: string;
}

export interface DocumentPaneHandle {
  jumpToOutline: (item: OutlineItem) => void;
}

interface DocumentPaneProps {
  app: App | null;
  doc: DocumentData;
  analysis?: FileAnalysis;
  prefs: UserPrefs;
  isDark: boolean;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  headerTabs?: HeaderTabItem[];
  activeTabId?: string | null;
  onSelectTab?: (id: string) => void;
  onCloseTab?: (id: string, e: React.MouseEvent) => void;
  onUpdatePrefs: (patch: Partial<UserPrefs>) => void;
  onNotify: (msg: string) => void;
}

const THEME_OPTIONS: Array<{ id: ThemePreset; label: string; desc: string; swatch: string }> = [
  { id: "lapis", label: "Lapis 青金石", desc: "清透湖蓝 · 科研推荐", swatch: "#4870ac" },
  { id: "github", label: "GitHub 极简白", desc: "纯白现代无衬线", swatch: "#0969da" },
  { id: "newsprint", label: "Newsprint 书卷", desc: "微暖米纸 · 衬线护眼", swatch: "#8a4f26" },
  { id: "night", label: "Lapis Night 暗夜", desc: "静谧灰蓝 · 夜间柔和", swatch: "#7aa2f7" },
];

export const DocumentPane = forwardRef<DocumentPaneHandle, DocumentPaneProps>(
  (
    {
      app,
      doc,
      analysis: externalAnalysis,
      prefs,
      isDark,
      sidebarOpen,
      onToggleSidebar,
      headerTabs,
      activeTabId,
      onSelectTab,
      onCloseTab,
      onUpdatePrefs,
      onNotify,
    },
    ref,
  ) => {
    const codeRef = useRef<CodeReaderHandle | null>(null);
    const previewRef = useRef<RichPreviewHandle | null>(null);
    const popoverAreaRef = useRef<HTMLDivElement | null>(null);

    const textContent = doc.content ?? "";
    const computedAnalysis = useMemo(
      () => externalAnalysis ?? analyzeFile(doc.name, textContent),
      [externalAnalysis, doc.name, textContent],
    );

    const canPreview = computedAnalysis.previewKind !== "none";
    const isPureImage = doc.isImage && computedAnalysis.previewKind === "image";
    const hasTables =
      computedAnalysis.previewKind === "markdown" ||
      computedAnalysis.previewKind === "csv" ||
      computedAnalysis.previewKind === "notebook";

    const [viewMode, setViewMode] = useState<ViewMode>(() =>
      isPureImage ? "preview" : defaultViewModeFor(computedAnalysis.previewKind),
    );
    const [selection, setSelection] = useState<SelectionInfo | null>(null);
    const [openMenu, setOpenMenu] = useState<"ai" | "theme" | null>(null);
    const [copied, setCopied] = useState(false);

    const docIdentity = `${doc.absPath ?? ""}|${doc.relPath ?? ""}|${doc.name}`;
    useEffect(() => {
      setSelection(null);
      setOpenMenu(null);
      setViewMode(isPureImage ? "preview" : defaultViewModeFor(computedAnalysis.previewKind));
    }, [docIdentity, isPureImage, computedAnalysis.previewKind]);

    // Typora signature Ctrl+/ to toggle Source Code <-> Preview
    useEffect(() => {
      const onKeyDown = (e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "/" && canPreview && !isPureImage) {
          e.preventDefault();
          setViewMode((m) => (m === "code" ? "preview" : "code"));
        }
      };
      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    }, [canPreview, isPureImage]);

    // Close popovers on outside click
    useEffect(() => {
      if (!openMenu) return;
      const onClickOutside = (e: MouseEvent) => {
        if (popoverAreaRef.current && !popoverAreaRef.current.contains(e.target as Node)) {
          setOpenMenu(null);
        }
      };
      window.addEventListener("mousedown", onClickOutside);
      return () => window.removeEventListener("mousedown", onClickOutside);
    }, [openMenu]);

    const effectiveMode: ViewMode = !canPreview
      ? "code"
      : isPureImage
        ? "preview"
        : viewMode === "split"
          ? "preview"
          : viewMode;

    useImperativeHandle(ref, () => ({
      jumpToOutline(item: OutlineItem) {
        if (effectiveMode === "preview" && computedAnalysis.previewKind === "markdown") {
          const ok = previewRef.current?.scrollToHeading(item.name);
          if (ok) return;
        }
        if (effectiveMode === "preview" && !isPureImage) {
          setViewMode("code");
          window.setTimeout(() => codeRef.current?.scrollToLine(item.line), 80);
        } else {
          codeRef.current?.scrollToLine(item.line);
        }
      },
    }));

    const caps = app?.getHostCapabilities();
    const hasChatCapability = Boolean(caps?.message || caps?.updateModelContext);

    const handleTriggerAi = async (
      action: AiActionKind,
      customSnippet?: { title: string; code: string },
    ) => {
      setOpenMenu(null);
      const prompt = buildAiPrompt(action, {
        filename: customSnippet ? `${doc.name} (${customSnippet.title})` : doc.name,
        relPath: customSnippet ? undefined : doc.relPath,
        languageLabel: computedAnalysis.languageLabel,
        fullContent: customSnippet ? customSnippet.code : textContent,
        selection: customSnippet ? null : selection,
      });
      const result = await dispatchAiAction(app, action, prompt, prefs.aiTargetNew);
      onNotify(result.message);
    };

    const handleCopyAll = async () => {
      const ok = await copyToClipboard(textContent);
      if (ok) {
        setCopied(true);
        onNotify("已复制全文内容");
        window.setTimeout(() => setCopied(false), 1500);
      }
    };

    const currentThemeObj =
      THEME_OPTIONS.find((t) => t.id === prefs.themePreset) ?? THEME_OPTIONS[0];
    const hasSelection = Boolean(selection && selection.text.trim().length > 0);

    return (
      <div className="tp-main">
        {/* Whisper-Thin Chromeless Typora Topbar */}
        <header className="tp-topbar">
          <div className="tp-topbar-left">
            <button
              className={`ide-icon-btn ${sidebarOpen ? "active" : ""}`}
              onClick={onToggleSidebar}
              title={sidebarOpen ? "收起侧栏，沉浸全屏阅读" : "展开侧栏（最近 / 文件 / 大纲）"}
            >
              <PanelLeft size={15} />
            </button>

            {headerTabs && headerTabs.length > 0 ? (
              <div className="tp-topbar-tabs">
                {headerTabs.map((tab) => (
                  <div
                    key={tab.id}
                    className={`tp-doc-tab ${tab.id === activeTabId ? "active" : ""}`}
                    onClick={() => onSelectTab?.(tab.id)}
                    onMouseDown={(e) => {
                      if (e.button === 1) onCloseTab?.(tab.id, e);
                    }}
                    title={tab.relPath}
                  >
                    <FileIcon name={tab.name} />
                    <span className="ide-tree-label">{tab.name}</span>
                    {onCloseTab && (
                      <button
                        className="ide-tab-close"
                        onClick={(e) => onCloseTab(tab.id, e)}
                        title="关闭"
                      >
                        <X size={11} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                <FileIcon name={doc.name} />
                <span className="tp-doc-title-single" title={doc.relPath || doc.name}>
                  {doc.name}
                </span>
              </div>
            )}
          </div>

          <div className="tp-topbar-right" ref={popoverAreaRef}>
            {/* 1-Click Scientific Table Style Switcher (Card <-> Academic 三线表) */}
            {hasTables && effectiveMode === "preview" && (
              <button
                className={`tp-pill-btn ${prefs.tableStyle === "threeline" ? "active" : ""}`}
                onClick={() => {
                  const next = prefs.tableStyle === "threeline" ? "card" : "threeline";
                  onUpdatePrefs({ tableStyle: next });
                  onNotify(next === "threeline" ? "已切换为论文「学术三线表」" : "已切换为「圆角卡片表」");
                }}
                title="切换表格排版风格：圆角斑马卡片表 ↔ 论文标准学术三线表"
              >
                <Table2 size={12} />
                <span>{prefs.tableStyle === "threeline" ? "三线表" : "卡片表"}</span>
              </button>
            )}

            {/* Typora Source <-> Preview Toggle (Ctrl+/) */}
            {canPreview && !isPureImage && (
              <button
                className="tp-pill-btn"
                onClick={() => setViewMode(effectiveMode === "code" ? "preview" : "code")}
                title="切换排版预览与源码模式 (Ctrl+/)"
              >
                {effectiveMode === "code" ? <Eye size={12} /> : <Code2 size={12} />}
                <span>{effectiveMode === "code" ? "看排版" : "看源码"}</span>
              </button>
            )}

            {/* Compact AI Companion Pill + Popover */}
            {!doc.isBinary && (
              <button
                className="tp-pill-btn ai"
                onClick={() => setOpenMenu((m) => (m === "ai" ? null : "ai"))}
                title="使用 Antigravity AI 辅助解读当前文件或选中内容"
              >
                <Sparkles size={12} />
                <span>AI 伴读</span>
              </button>
            )}

            {/* Theme & Typography Popover Trigger */}
            <button
              className={`tp-pill-btn ${openMenu === "theme" ? "active" : ""}`}
              onClick={() => setOpenMenu((m) => (m === "theme" ? null : "theme"))}
              title="切换 Typora 主题与字号"
            >
              <Palette size={12} />
              <span>{currentThemeObj.label.split(" ")[1] ?? currentThemeObj.label}</span>
            </button>

            {/* Popover 1: AI Companion Menu */}
            {openMenu === "ai" && (
              <div className="tp-popover">
                <div className="tp-popover-section-label">
                  {computedAnalysis.roleDescription} · {computedAnalysis.lineCount} 行
                  {hasSelection ? `（已选选中片段）` : ""}
                </div>

                <button className="tp-menu-item" onClick={() => void handleTriggerAi("explain")}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                    <Sparkles size={13} style={{ color: "var(--tp-accent)" }} />
                    <span>大白话通俗解读</span>
                  </span>
                  <span style={{ fontSize: 10.5, color: "var(--tp-text-faint)" }}>最常用</span>
                </button>

                <button className="tp-menu-item" onClick={() => void handleTriggerAi("flowchart")}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                    <GitBranch size={13} style={{ color: "var(--tp-accent)" }} />
                    <span>生成逻辑流程图</span>
                  </span>
                </button>

                <button className="tp-menu-item" onClick={() => void handleTriggerAi("walkthrough")}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                    <BookOpen size={13} style={{ color: "var(--tp-accent)" }} />
                    <span>逐段结构导读</span>
                  </span>
                </button>

                <button className="tp-menu-item" onClick={() => void handleTriggerAi("attach")}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                    <Paperclip size={13} style={{ color: "var(--tp-accent)" }} />
                    <span>{hasChatCapability ? "挂载到输入框提问" : "复制带行号引用"}</span>
                  </span>
                </button>

                {hasChatCapability && (
                  <div
                    style={{
                      borderTop: "1px solid var(--tp-border-subtle)",
                      paddingTop: 6,
                      marginTop: 2,
                    }}
                  >
                    <button
                      className={`tp-menu-item ${prefs.aiTargetNew ? "selected" : ""}`}
                      onClick={() => onUpdatePrefs({ aiTargetNew: !prefs.aiTargetNew })}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                        <MessageSquarePlus size={13} />
                        <span>发往后台新对话</span>
                      </span>
                      <span style={{ fontSize: 11 }}>{prefs.aiTargetNew ? "已开启" : "当前对话"}</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Popover 2: Typora Theme & Reading Controls */}
            {openMenu === "theme" && (
              <div className="tp-popover">
                <div className="tp-popover-section-label">Typora 经典主题</div>
                {THEME_OPTIONS.map((t) => (
                  <button
                    key={t.id}
                    className={`tp-menu-item ${prefs.themePreset === t.id ? "selected" : ""}`}
                    onClick={() => {
                      onUpdatePrefs({ themePreset: t.id });
                      setOpenMenu(null);
                    }}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <span
                        style={{
                          width: 11,
                          height: 11,
                          borderRadius: "50%",
                          background: t.swatch,
                          flexShrink: 0,
                        }}
                      />
                      <span>{t.label}</span>
                    </span>
                    <span style={{ fontSize: 10.5, color: "var(--tp-text-faint)" }}>{t.desc}</span>
                  </button>
                ))}

                <div
                  style={{
                    borderTop: "1px solid var(--tp-border-subtle)",
                    paddingTop: 6,
                    marginTop: 2,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingLeft: 6,
                    paddingRight: 4,
                  }}
                >
                  <span style={{ fontSize: 12, color: "var(--tp-text-muted)" }}>阅读字号</span>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <button
                      className="ide-icon-btn"
                      onClick={() => onUpdatePrefs({ fontSize: Math.max(12, prefs.fontSize - 1) })}
                      title="缩小字号"
                    >
                      <Minus size={13} />
                    </button>
                    <span style={{ fontSize: 12, fontFamily: "var(--tp-font-mono)", minWidth: 34, textAlign: "center" }}>
                      {prefs.fontSize}px
                    </span>
                    <button
                      className="ide-icon-btn"
                      onClick={() => onUpdatePrefs({ fontSize: Math.min(22, prefs.fontSize + 1) })}
                      title="放大字号"
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                </div>

                {!doc.isBinary && (
                  <div style={{ display: "flex", gap: 6, paddingTop: 2 }}>
                    <button
                      className="tp-menu-item"
                      onClick={() => onUpdatePrefs({ wordWrap: !prefs.wordWrap })}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <WrapText size={13} />
                        <span>自动换行</span>
                      </span>
                      <span style={{ fontSize: 11 }}>{prefs.wordWrap ? "开" : "关"}</span>
                    </button>
                    <button className="tp-menu-item" onClick={() => void handleCopyAll()}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        {copied ? <Check size={13} /> : <Copy size={13} />}
                        <span>复制全文</span>
                      </span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        {/* Main Pure Paper Body */}
        {doc.isBinary && !doc.isImage ? (
          <div className="ide-empty-state">
            <FileIcon name={doc.name} size={28} />
            <div style={{ fontWeight: 600, color: "var(--tp-heading)" }}>{doc.name}</div>
            <div style={{ fontSize: 12.5 }}>
              二进制文件（{formatBytes(doc.size)}），暂不支持直接文本渲染。
            </div>
          </div>
        ) : effectiveMode === "preview" && canPreview ? (
          <RichPreview
            ref={previewRef}
            previewKind={computedAnalysis.previewKind}
            filename={doc.name}
            content={textContent}
            dataUrl={doc.dataUrl}
            isDark={isDark}
            fontSize={prefs.fontSize}
            onNotify={onNotify}
            onExplainSnippet={(title, code) =>
              void handleTriggerAi("explain", { title, code })
            }
            onSelectionChange={setSelection}
          />
        ) : (
          /* Unified Lapis Paper Card for Source Code (.py / .R / .ts / .json / Raw Markdown) */
          <div className="tp-code-stage">
            <div className="tp-code-card">
              <div className="tp-code-card-head">
                <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      backgroundColor: computedAnalysis.accentColor,
                    }}
                  />
                  <strong style={{ color: "var(--tp-heading)" }}>
                    {computedAnalysis.languageLabel}
                  </strong>
                  <span>·</span>
                  <span>{computedAnalysis.roleDescription}</span>
                  <span>·</span>
                  <span>{computedAnalysis.lineCount.toLocaleString()} 行</span>
                  {computedAnalysis.imports.slice(0, 4).map((imp) => (
                    <span
                      key={imp}
                      style={{
                        fontFamily: "var(--tp-font-mono)",
                        fontSize: 10.5,
                        padding: "1px 6px",
                        borderRadius: 5,
                        background: "var(--tp-paper-bg)",
                        border: "1px solid var(--tp-border)",
                      }}
                    >
                      {imp}
                    </span>
                  ))}
                </div>
                <button
                  className="ide-icon-btn"
                  style={{ width: 24, height: 24 }}
                  onClick={() => void handleCopyAll()}
                  title="复制全文代码"
                >
                  {copied ? <Check size={13} style={{ color: "#10b981" }} /> : <Copy size={13} />}
                </button>
              </div>

              <CodeReader
                ref={codeRef}
                content={textContent}
                languageId={computedAnalysis.languageId}
                isDark={isDark}
                fontSize={Math.max(12, prefs.fontSize - 1)}
                wordWrap={prefs.wordWrap}
                onSelectionChange={setSelection}
              />
            </div>
          </div>
        )}

        {/* Floating Selection AI Pill (Appears on highlighting text in Markdown OR Code!) */}
        {hasSelection && (
          <div className="ide-float-selection">
            <span className="ide-float-label">已选中片段</span>
            <button
              className="tp-pill-btn ai"
              style={{ height: 25 }}
              onClick={() => void handleTriggerAi("explain")}
            >
              <Sparkles size={11} />
              <span>大白话解读</span>
            </button>
            <button
              className="tp-pill-btn"
              style={{ height: 25 }}
              onClick={() => void handleTriggerAi("attach")}
            >
              <Paperclip size={11} />
              <span>{hasChatCapability ? "引用提问" : "复制引用"}</span>
            </button>
          </div>
        )}
      </div>
    );
  },
);

DocumentPane.displayName = "DocumentPane";
