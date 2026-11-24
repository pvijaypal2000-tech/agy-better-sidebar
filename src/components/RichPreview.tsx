import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import katex from "katex";
import "katex/dist/katex.min.css";
import mermaid from "mermaid";
import Papa from "papaparse";
import yaml from "js-yaml";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Copy,
  RotateCcw,
  Search,
  Sparkles,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { PreviewKind, SelectionInfo } from "../shared/types";
import { copyToClipboard } from "../shared/bridge";

export interface RichPreviewHandle {
  scrollToHeading: (headingText: string, indexHint?: number) => boolean;
}

interface RichPreviewProps {
  previewKind: PreviewKind;
  filename: string;
  content: string;
  dataUrl?: string;
  isDark: boolean;
  fontSize: number;
  onNotify?: (msg: string) => void;
  onExplainSnippet?: (title: string, code: string) => void;
  onSelectionChange?: (selection: SelectionInfo | null) => void;
}

/* ---------- 1. Typora Lapis Markdown + KaTeX + Mermaid + Wide Table Wrapper ---------- */

let mermaidCounter = 0;

function extractFrontmatter(md: string): { metaPairs: Array<[string, string]>; body: string } {
  const m = md.match(/^---\r?\n([\s\S]{1,1200}?)\r?\n---\r?\n/);
  if (!m) return { metaPairs: [], body: md };
  try {
    const parsed = yaml.load(m[1]);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const pairs = Object.entries(parsed as Record<string, unknown>)
        .slice(0, 8)
        .map(([k, v]) => [
          k,
          Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v),
        ] as [string, string]);
      return { metaPairs: pairs, body: md.slice(m[0].length) };
    }
  } catch {
    // not valid YAML frontmatter, keep as normal markdown
  }
  return { metaPairs: [], body: md };
}

function renderMathInMarkdown(md: string): string {
  const codePlaceholders: string[] = [];
  let protectedMd = md.replace(/(```[\s\S]*?```|`[^`\n]+`)/g, (m) => {
    const idx = codePlaceholders.length;
    codePlaceholders.push(m);
    return `@@CODE_BLOCK_${idx}@@`;
  });

  protectedMd = protectedMd.replace(/\$\$([\s\S]+?)\$\$/g, (_m, expr: string) => {
    try {
      return `\n<div class="katex-block">${katex.renderToString(expr.trim(), {
        displayMode: true,
        throwOnError: false,
      })}</div>\n`;
    } catch {
      return `$$${expr}$$`;
    }
  });

  protectedMd = protectedMd.replace(/(?<!\\)\$([^\n$]+?)\$/g, (_m, expr: string) => {
    try {
      return katex.renderToString(expr.trim(), {
        displayMode: false,
        throwOnError: false,
      });
    } catch {
      return `$${expr}$`;
    }
  });

  return protectedMd.replace(/@@CODE_BLOCK_(\d+)@@/g, (_m, i: string) => codePlaceholders[Number(i)] ?? "");
}

function wrapMarkdownTables(sanitizedHtml: string): string {
  return sanitizedHtml
    .replace(/<table(\b[^>]*)>/gi, '<div class="typora-table-scroll"><table class="typora-table"$1>')
    .replace(/<\/table>/gi, "</table></div>");
}

const MarkdownPreview = forwardRef<
  RichPreviewHandle,
  {
    content: string;
    isDark: boolean;
    fontSize: number;
    isStandaloneMermaid?: boolean;
    onSelectionChange?: (sel: SelectionInfo | null) => void;
  }
>(({ content, isDark, fontSize, isStandaloneMermaid, onSelectionChange }, ref) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const { metaPairs, html } = useMemo(() => {
    if (isStandaloneMermaid) {
      const rawHtml = marked.parse("```mermaid\n" + content + "\n```", { gfm: true }) as string;
      return {
        metaPairs: [] as Array<[string, string]>,
        html: DOMPurify.sanitize(rawHtml),
      };
    }
    const fm = extractFrontmatter(content);
    const withMath = renderMathInMarkdown(fm.body);
    const rawHtml = marked.parse(withMath, { gfm: true, breaks: false }) as string;
    const clean = DOMPurify.sanitize(rawHtml, {
      ADD_TAGS: ["math", "semantics", "mrow", "mi", "mo", "mn", "msup", "msub", "mfrac", "annotation"],
      ADD_ATTR: ["class", "style", "aria-hidden"],
    });
    return { metaPairs: fm.metaPairs, html: wrapMarkdownTables(clean) };
  }, [content, isStandaloneMermaid]);

  useImperativeHandle(ref, () => ({
    scrollToHeading(headingText: string) {
      const root = containerRef.current;
      if (!root) return false;
      const headings = Array.from(root.querySelectorAll("h1, h2, h3, h4"));
      const normTarget = headingText.trim().toLowerCase();
      const match =
        headings.find((h) => (h.textContent ?? "").trim().toLowerCase() === normTarget) ??
        headings.find((h) => (h.textContent ?? "").toLowerCase().includes(normTarget));
      if (!match) return false;
      match.scrollIntoView({ behavior: "smooth", block: "start" });
      match.classList.add("tp-heading-flash");
      window.setTimeout(() => match.classList.remove("tp-heading-flash"), 1000);
      return true;
    },
  }));

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: isDark ? "dark" : "neutral",
      fontFamily: "var(--tp-font-sans)",
    });

    const blocks = Array.from(el.querySelectorAll("pre > code.language-mermaid"));
    if (blocks.length === 0) return;

    let cancelled = false;
    (async () => {
      for (const codeEl of blocks) {
        if (cancelled) return;
        const pre = codeEl.parentElement;
        if (!pre) continue;
        const def = codeEl.textContent ?? "";
        const wrap = document.createElement("div");
        wrap.className = "mermaid-card";
        try {
          const id = `agy_mmd_${++mermaidCounter}`;
          const { svg } = await mermaid.render(id, def);
          if (cancelled) return;
          wrap.innerHTML = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } });
          pre.replaceWith(wrap);
        } catch (err) {
          wrap.style.color = "#ef4444";
          wrap.style.fontSize = "12px";
          wrap.textContent = `Mermaid 图表渲染提示: ${err instanceof Error ? err.message : String(err)}`;
          pre.replaceWith(wrap);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [html, isDark]);

  const handleMouseUp = () => {
    if (!onSelectionChange) return;
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? "";
    if (text.length > 1 && containerRef.current && sel?.anchorNode && containerRef.current.contains(sel.anchorNode)) {
      onSelectionChange({ text, fromLine: 1, toLine: Math.max(1, text.split(/\r?\n/).length) });
    } else {
      onSelectionChange(null);
    }
  };

  return (
    <div className="preview-scroll" onMouseUp={handleMouseUp}>
      <article
        ref={containerRef}
        className="typora-write"
        style={{ "--tp-doc-font-size": `${fontSize}px` } as React.CSSProperties}
      >
        {metaPairs.length > 0 && (
          <div className="tp-frontmatter">
            {metaPairs.map(([k, v]) => (
              <span key={k}>
                <strong style={{ color: "var(--tp-heading)" }}>{k}:</strong> {v}
              </span>
            ))}
          </div>
        )}
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </article>
    </div>
  );
});
MarkdownPreview.displayName = "MarkdownPreview";

/* ---------- 2. CSV / TSV Scientific Paper Table ---------- */

const CsvPreview: React.FC<{
  content: string;
  filename: string;
  fontSize: number;
  onNotify?: (msg: string) => void;
}> = ({ content, filename, fontSize, onNotify }) => {
  const [query, setQuery] = useState("");
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 300;

  const parsed = useMemo(() => {
    const delimiter = filename.toLowerCase().endsWith(".tsv") ? "\t" : undefined;
    const res = Papa.parse<string[]>(content.trim(), {
      delimiter,
      skipEmptyLines: true,
    });
    const rows = res.data ?? [];
    const headers = rows[0] ?? [];
    const body = rows.slice(1);
    return { headers, body };
  }, [content, filename]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = parsed.body;
    if (q) {
      list = list.filter((row) => row.some((cell) => String(cell ?? "").toLowerCase().includes(q)));
    }
    if (sortCol !== null) {
      list = [...list].sort((a, b) => {
        const av = a[sortCol] ?? "";
        const bv = b[sortCol] ?? "";
        const an = Number(av);
        const bn = Number(bv);
        const cmp =
          !Number.isNaN(an) && !Number.isNaN(bn) && av !== "" && bv !== ""
            ? an - bn
            : String(av).localeCompare(String(bv), undefined, { numeric: true });
        return sortAsc ? cmp : -cmp;
      });
    }
    return list;
  }, [parsed.body, query, sortCol, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const visibleRows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const toggleSort = (idx: number) => {
    if (sortCol === idx) setSortAsc(!sortAsc);
    else {
      setSortCol(idx);
      setSortAsc(true);
    }
  };

  return (
    <div className="csv-paper-stage">
      <div className="csv-paper-card">
        <div className="csv-toolbar">
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div className="ide-search-input-wrap" style={{ width: 220 }}>
              <Search size={13} style={{ color: "var(--tp-text-faint)" }} />
              <input
                className="ide-search-input"
                placeholder="检索表格内容..."
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
              />
            </div>
            <span style={{ fontSize: 12, color: "var(--tp-text-muted)" }}>
              共 <strong style={{ color: "var(--tp-heading)" }}>{filtered.length.toLocaleString()}</strong> 行 ×{" "}
              <strong style={{ color: "var(--tp-heading)" }}>{parsed.headers.length}</strong> 列 · 点表头排序 / 点单元格复制
            </span>
          </div>

          {totalPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <button
                className="tp-pill-btn"
                disabled={safePage === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                上一页
              </button>
              <span>
                {safePage + 1} / {totalPages}
              </span>
              <button
                className="tp-pill-btn"
                disabled={safePage >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              >
                下一页
              </button>
            </div>
          )}
        </div>

        <div className="csv-table-scroll">
          <div className="typora-table-scroll" style={{ margin: "10px 0 0" }}>
            <table className="typora-table" style={{ fontSize: Math.max(12, fontSize - 2) }}>
              <thead>
                <tr>
                  <th style={{ width: 46, textAlign: "right", color: "var(--tp-text-faint)" }}>#</th>
                  {parsed.headers.map((h, i) => (
                    <th key={i} onClick={() => toggleSort(i)}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        {h || `Col ${i + 1}`}
                        {sortCol === i && (sortAsc ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, rIdx) => (
                  <tr key={rIdx}>
                    <td style={{ textAlign: "right", color: "var(--tp-text-faint)", minWidth: 44 }}>
                      {safePage * PAGE_SIZE + rIdx + 1}
                    </td>
                    {parsed.headers.map((_, cIdx) => {
                      const val = row[cIdx] ?? "";
                      const isNum = val !== "" && !Number.isNaN(Number(val));
                      return (
                        <td
                          key={cIdx}
                          style={{
                            textAlign: isNum ? "right" : "left",
                            cursor: "copy",
                            fontFamily: isNum ? "var(--tp-font-mono)" : undefined,
                          }}
                          title={val}
                          onClick={async () => {
                            await copyToClipboard(val);
                            onNotify?.(`已复制：${val.slice(0, 42)}`);
                          }}
                        >
                          {val}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ---------- 3. JSON / YAML / TOML Paper Tree ---------- */

function stripJsonComments(input: string): string {
  return input
    .replace(/^\uFEFF/, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:\\])\/\/.*$/gm, "$1")
    .replace(/,\s*([}\]])/g, "$1");
}

function parseSimpleToml(input: string): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  let current: Record<string, unknown> = root;
  for (const raw of input.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const sec = line.match(/^\[([^\]]+)\]$/);
    if (sec) {
      const parts = sec[1].split(".").map((s) => s.trim());
      let cursor = root;
      for (const p of parts) {
        if (typeof cursor[p] !== "object" || cursor[p] === null) cursor[p] = {};
        cursor = cursor[p] as Record<string, unknown>;
      }
      current = cursor;
      continue;
    }
    const kv = line.match(/^([\w.-]+)\s*=\s*(.+)$/);
    if (kv) {
      const val = kv[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        current[kv[1]] = val.slice(1, -1);
      } else if (val === "true" || val === "false") {
        current[kv[1]] = val === "true";
      } else if (!Number.isNaN(Number(val))) {
        current[kv[1]] = Number(val);
      } else {
        current[kv[1]] = val;
      }
    }
  }
  return root;
}

const JsonTreeNode: React.FC<{
  label: string;
  value: unknown;
  pathStr: string;
  depth: number;
  defaultOpen: boolean;
  onNotify?: (msg: string) => void;
}> = ({ label, value, pathStr, depth, defaultOpen, onNotify }) => {
  const [open, setOpen] = useState(defaultOpen);
  const isObj = typeof value === "object" && value !== null;
  const isArr = Array.isArray(value);

  if (!isObj) {
    let color = "var(--tp-text)";
    let rendered = String(value);
    if (typeof value === "string") {
      color = "#0f766e";
      rendered = `"${value}"`;
    } else if (typeof value === "number") {
      color = "#2563eb";
    } else if (typeof value === "boolean") {
      color = "#7c3aed";
    } else if (value === null) {
      color = "#e11d48";
      rendered = "null";
    }

    return (
      <div
        className="tree-json-node"
        style={{ paddingLeft: depth * 18, display: "flex", alignItems: "baseline", gap: 6 }}
      >
        <span style={{ color: "var(--tp-heading)", fontWeight: 600 }}>{label}:</span>
        <span
          style={{ color, cursor: "copy", wordBreak: "break-all" }}
          title={`点击复制 (${pathStr})`}
          onClick={async () => {
            await copyToClipboard(typeof value === "string" ? value : JSON.stringify(value));
            onNotify?.(`已复制 ${pathStr}`);
          }}
        >
          {rendered}
        </span>
      </div>
    );
  }

  const entries = isArr
    ? value.map((v, i) => [String(i), v] as const)
    : Object.entries(value as Record<string, unknown>);

  return (
    <div className="tree-json-node">
      <div
        style={{
          paddingLeft: depth * 18,
          display: "flex",
          alignItems: "center",
          gap: 5,
          cursor: "pointer",
          userSelect: "none",
        }}
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <span style={{ color: "var(--tp-accent)", fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 11, color: "var(--tp-text-faint)" }}>
          {isArr ? `[${entries.length}]` : `{${entries.length}}`}
        </span>
      </div>
      {open &&
        entries.slice(0, 300).map(([k, v]) => (
          <JsonTreeNode
            key={k}
            label={k}
            value={v}
            pathStr={isArr ? `${pathStr}[${k}]` : `${pathStr}.${k}`}
            depth={depth + 1}
            defaultOpen={depth < 1}
            onNotify={onNotify}
          />
        ))}
    </div>
  );
};

const StructuredTreePreview: React.FC<{
  kind: "json" | "yaml" | "toml";
  content: string;
  onNotify?: (msg: string) => void;
}> = ({ kind, content, onNotify }) => {
  const result = useMemo(() => {
    try {
      if (kind === "json") return { data: JSON.parse(stripJsonComments(content)), error: null };
      if (kind === "yaml") return { data: yaml.load(content), error: null };
      return { data: parseSimpleToml(content), error: null };
    } catch (err) {
      return { data: null, error: err instanceof Error ? err.message : String(err) };
    }
  }, [kind, content]);

  if (result.error) {
    return (
      <div className="preview-scroll">
        <div
          style={{
            padding: 16,
            borderRadius: 12,
            border: "1px solid rgba(239,68,68,0.35)",
            background: "rgba(239,68,68,0.06)",
            color: "#ef4444",
            fontSize: 13,
          }}
        >
          解析 {kind.toUpperCase()} 失败：{result.error}（可点击右上角切到「源码」查看）
        </div>
      </div>
    );
  }

  return (
    <div className="preview-scroll">
      <div className="typora-write">
        <JsonTreeNode
          label="root"
          value={result.data}
          pathStr="$"
          depth={0}
          defaultOpen={true}
          onNotify={onNotify}
        />
      </div>
    </div>
  );
};

/* ---------- 4. Jupyter Notebook (.ipynb) Paper Flow ---------- */

interface NbOutput {
  output_type?: string;
  text?: string[] | string;
  ename?: string;
  evalue?: string;
  data?: Record<string, string[] | string>;
}

interface NbCell {
  cell_type?: string;
  execution_count?: number | null;
  source?: string[] | string;
  outputs?: NbOutput[];
}

function joinSource(src: string[] | string | undefined): string {
  if (!src) return "";
  return Array.isArray(src) ? src.join("") : String(src);
}

const NotebookPreview: React.FC<{
  content: string;
  isDark: boolean;
  fontSize: number;
  onNotify?: (msg: string) => void;
  onExplainSnippet?: (title: string, code: string) => void;
}> = ({ content, isDark, fontSize, onNotify, onExplainSnippet }) => {
  const parsed = useMemo(() => {
    try {
      const nb = JSON.parse(content) as { cells?: NbCell[] };
      return { cells: Array.isArray(nb.cells) ? nb.cells : [], error: null };
    } catch (err) {
      return { cells: [], error: err instanceof Error ? err.message : String(err) };
    }
  }, [content]);

  if (parsed.error) {
    return (
      <div className="preview-scroll" style={{ color: "#ef4444" }}>
        无法解析 Notebook JSON：{parsed.error}
      </div>
    );
  }

  return (
    <div className="preview-scroll">
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        {parsed.cells.map((cell, idx) => {
          const src = joinSource(cell.source);
          if (cell.cell_type === "markdown") {
            const clean = wrapMarkdownTables(
              DOMPurify.sanitize(marked.parse(renderMathInMarkdown(src), { gfm: true }) as string),
            );
            return (
              <div
                key={idx}
                className="typora-write"
                style={
                  {
                    "--tp-doc-font-size": `${fontSize}px`,
                    marginBottom: 18,
                  } as React.CSSProperties
                }
                dangerouslySetInnerHTML={{ __html: clean }}
              />
            );
          }
          const outputs = Array.isArray(cell.outputs) ? cell.outputs : [];
          return (
            <div key={idx} className="nb-cell">
              <div className="nb-cell-head">
                <span>
                  In [{cell.execution_count ?? " "}] · Cell #{idx + 1}
                </span>
                <div style={{ display: "flex", gap: 6 }}>
                  {onExplainSnippet && (
                    <button
                      className="tp-pill-btn"
                      style={{ height: 23, fontSize: 11 }}
                      onClick={() => onExplainSnippet(`Cell #${idx + 1}`, src)}
                    >
                      <Sparkles size={11} />
                      <span>解读此单元</span>
                    </button>
                  )}
                  <button
                    className="ide-icon-btn"
                    style={{ width: 22, height: 22 }}
                    title="复制单元格代码"
                    onClick={async () => {
                      await copyToClipboard(src);
                      onNotify?.(`已复制 Cell #${idx + 1}`);
                    }}
                  >
                    <Copy size={12} />
                  </button>
                </div>
              </div>
              <pre className="nb-cell-code">
                <code>{src}</code>
              </pre>
              {outputs.length > 0 && (
                <div className="nb-cell-output">
                  {outputs.map((out, oIdx) => {
                    if (out.output_type === "stream") {
                      return (
                        <pre key={oIdx} style={{ margin: "4px 0", whiteSpace: "pre-wrap" }}>
                          {joinSource(out.text)}
                        </pre>
                      );
                    }
                    if (out.output_type === "error") {
                      return (
                        <div key={oIdx} style={{ color: "#ef4444", whiteSpace: "pre-wrap" }}>
                          {out.ename}: {out.evalue}
                        </div>
                      );
                    }
                    const png = out.data?.["image/png"];
                    if (png) {
                      const b64 = joinSource(png).replace(/\s+/g, "");
                      return (
                        <img
                          key={oIdx}
                          src={`data:image/png;base64,${b64}`}
                          alt={`Cell ${idx + 1} output`}
                          style={{ maxWidth: "100%", borderRadius: 8, marginTop: 6 }}
                        />
                      );
                    }
                    const htmlOut = out.data?.["text/html"];
                    if (htmlOut) {
                      return (
                        <div
                          key={oIdx}
                          className="typora-table-scroll"
                          dangerouslySetInnerHTML={{
                            __html: DOMPurify.sanitize(joinSource(htmlOut)),
                          }}
                        />
                      );
                    }
                    const plain = out.data?.["text/plain"];
                    if (plain) {
                      return (
                        <pre key={oIdx} style={{ margin: "4px 0", whiteSpace: "pre-wrap" }}>
                          {joinSource(plain)}
                        </pre>
                      );
                    }
                    return null;
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ---------- 5. HTML Shadow DOM Safe Preview ---------- */

const HtmlPreview: React.FC<{ content: string }> = ({ content }) => {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    const sanitized = DOMPurify.sanitize(content, {
      WHOLE_DOCUMENT: false,
      ADD_TAGS: ["style", "svg", "path", "circle", "rect", "line", "polygon", "g", "defs"],
      ADD_ATTR: ["style", "class", "viewBox", "fill", "stroke", "d", "xmlns"],
    });
    shadow.innerHTML = `<style>:host{display:block;background:#fff;color:#111;padding:22px;border-radius:12px;min-height:100%;font-family:system-ui,sans-serif;}</style>${sanitized}`;
  }, [content]);

  return (
    <div className="tp-code-stage">
      <div className="tp-code-card">
        <div className="tp-code-card-head">
          <span>网页安全只读预览（已隔离外部脚本）</span>
        </div>
        <div className="preview-scroll" style={{ padding: 18 }}>
          <div ref={hostRef} style={{ minHeight: 260 }} />
        </div>
      </div>
    </div>
  );
};

/* ---------- 6. SVG & Image Zoom Stage ---------- */

const ZoomVisualPreview: React.FC<{
  svgContent?: string;
  imageDataUrl?: string;
  filename: string;
}> = ({ svgContent, imageDataUrl, filename }) => {
  const [zoom, setZoom] = useState(1);

  const safeSvg = useMemo(() => {
    if (!svgContent) return "";
    return DOMPurify.sanitize(svgContent, { USE_PROFILES: { svg: true, svgFilters: true } });
  }, [svgContent]);

  return (
    <div className="tp-code-stage">
      <div className="tp-code-card">
        <div className="tp-code-card-head">
          <span style={{ fontWeight: 600, color: "var(--tp-heading)" }}>{filename}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button
              className="ide-icon-btn"
              onClick={() => setZoom((z) => Math.max(0.25, Number((z - 0.25).toFixed(2))))}
              title="缩小"
            >
              <ZoomOut size={14} />
            </button>
            <span style={{ fontSize: 11.5, fontFamily: "var(--tp-font-mono)", minWidth: 44, textAlign: "center" }}>
              {Math.round(zoom * 100)}%
            </span>
            <button
              className="ide-icon-btn"
              onClick={() => setZoom((z) => Math.min(4, Number((z + 0.25).toFixed(2))))}
              title="放大"
            >
              <ZoomIn size={14} />
            </button>
            <button className="ide-icon-btn" onClick={() => setZoom(1)} title="重置缩放">
              <RotateCcw size={13} />
            </button>
          </div>
        </div>

        <div className="visual-stage">
          {imageDataUrl ? (
            <img
              src={imageDataUrl}
              alt={filename}
              style={{
                maxWidth: zoom === 1 ? "100%" : "none",
                maxHeight: zoom === 1 ? "100%" : "none",
                transform: zoom === 1 ? undefined : `scale(${zoom})`,
                transformOrigin: "center center",
                borderRadius: 8,
                boxShadow: "var(--tp-shadow-soft)",
              }}
            />
          ) : (
            <div
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: "center center",
                maxWidth: "100%",
              }}
              dangerouslySetInnerHTML={{ __html: safeSvg }}
            />
          )}
        </div>
      </div>
    </div>
  );
};

/* ---------- Unified Dispatcher ---------- */

export const RichPreview = forwardRef<RichPreviewHandle, RichPreviewProps>(
  (
    {
      previewKind,
      filename,
      content,
      dataUrl,
      isDark,
      fontSize,
      onNotify,
      onExplainSnippet,
      onSelectionChange,
    },
    ref,
  ) => {
    switch (previewKind) {
      case "markdown":
        return (
          <MarkdownPreview
            ref={ref}
            content={content}
            isDark={isDark}
            fontSize={fontSize}
            onSelectionChange={onSelectionChange}
          />
        );
      case "mermaid":
        return (
          <MarkdownPreview
            ref={ref}
            content={content}
            isDark={isDark}
            fontSize={fontSize}
            isStandaloneMermaid
          />
        );
      case "csv":
        return (
          <CsvPreview
            content={content}
            filename={filename}
            fontSize={fontSize}
            onNotify={onNotify}
          />
        );
      case "json":
      case "yaml":
      case "toml":
        return <StructuredTreePreview kind={previewKind} content={content} onNotify={onNotify} />;
      case "notebook":
        return (
          <NotebookPreview
            content={content}
            isDark={isDark}
            fontSize={fontSize}
            onNotify={onNotify}
            onExplainSnippet={onExplainSnippet}
          />
        );
      case "html":
        return <HtmlPreview content={content} />;
      case "svg":
        return <ZoomVisualPreview svgContent={content} filename={filename} />;
      case "image":
        return <ZoomVisualPreview imageDataUrl={dataUrl} filename={filename} />;
      default:
        return null;
    }
  },
);
RichPreview.displayName = "RichPreview";
