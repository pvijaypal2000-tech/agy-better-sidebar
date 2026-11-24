import type { FileAnalysis, OutlineItem } from "./types";
import { getFileMeta } from "./fileMeta";

function uniq(items: string[], max = 24): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const clean = item.trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= max) break;
  }
  return out;
}

export function analyzeFile(filename: string, content: string): FileAnalysis {
  const meta = getFileMeta(filename);
  const lines = content ? content.split(/\r?\n/) : [];
  const imports: string[] = [];
  const exportsList: string[] = [];
  const outline: OutlineItem[] = [];

  const pushOutline = (
    kind: OutlineItem["kind"],
    name: string,
    line: number,
    depth = 0,
    detail?: string,
  ) => {
    if (outline.length >= 250) return;
    outline.push({
      id: `${kind}-${line}-${outline.length}`,
      kind,
      name: name.trim().slice(0, 80),
      detail: detail?.trim().slice(0, 60),
      line,
      depth,
    });
  };

  const lang = meta.languageId;

  if (lang === "notebook") {
    try {
      const nb = JSON.parse(content) as {
        cells?: Array<{ cell_type?: string; source?: string[] | string }>;
      };
      const cells = Array.isArray(nb.cells) ? nb.cells : [];
      cells.forEach((cell, idx) => {
        const src = Array.isArray(cell.source)
          ? cell.source.join("")
          : String(cell.source ?? "");
        const firstLine =
          src
            .split(/\r?\n/)
            .map((l) => l.trim())
            .find((l) => l.length > 0) ?? "(空单元)";
        const isMd = cell.cell_type === "markdown";
        pushOutline(
          isMd ? "heading" : "cell",
          isMd ? firstLine.replace(/^#+\s*/, "") : firstLine,
          idx + 1,
          isMd ? 0 : 1,
          isMd ? "Markdown" : `Code [${idx + 1}]`,
        );
        if (!isMd) {
          for (const m of src.matchAll(/^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/gm)) {
            imports.push(m[1] ?? m[2] ?? "");
          }
        }
      });
    } catch {
      // fallback to raw JSON outline below
    }
  } else if (lang === "markdown") {
    let inFence = false;
    lines.forEach((raw, i) => {
      const lineNo = i + 1;
      if (/^\s*(`{3,}|~{3,})/.test(raw)) {
        inFence = !inFence;
        return;
      }
      if (inFence) return;
      const m = raw.match(/^(#{1,4})\s+(.+?)\s*#*$/);
      if (m) {
        const level = m[1].length;
        pushOutline("heading", m[2], lineNo, level - 1, `H${level}`);
      }
    });
  } else if (lang === "csv") {
    const headerLine = lines[0] ?? "";
    const sep = filename.toLowerCase().endsWith(".tsv") ? "\t" : ",";
    const cols = headerLine.split(sep).map((c) => c.replace(/^"|"$/g, "").trim());
    cols.slice(0, 60).forEach((col, idx) => {
      if (col) pushOutline("key", col, 1, 0, `列 ${idx + 1}`);
    });
  } else if (lang === "json") {
    lines.forEach((raw, i) => {
      const m = raw.match(/^(\s{0,4})"([^"]+)"\s*:\s*(.*)$/);
      if (m) {
        const indent = m[1].length;
        const val = m[3].trim();
        const hint = val.startsWith("{")
          ? "Object"
          : val.startsWith("[")
            ? "Array"
            : val.replace(/,$/, "").slice(0, 24);
        pushOutline("key", m[2], i + 1, indent >= 2 ? 1 : 0, hint);
      }
    });
  } else if (lang === "yaml") {
    lines.forEach((raw, i) => {
      if (/^\s*#/.test(raw)) return;
      const m = raw.match(/^(\s{0,2})([\w.-]+)\s*:\s*(.*)$/);
      if (m) {
        pushOutline("key", m[2], i + 1, m[1].length > 0 ? 1 : 0, m[3] || "block");
      }
    });
  } else if (lang === "toml") {
    lines.forEach((raw, i) => {
      const sec = raw.match(/^\s*\[([^\]]+)\]/);
      if (sec) {
        pushOutline("section", sec[1], i + 1, sec[1].includes(".") ? 1 : 0, "Section");
      }
    });
  } else if (lang === "python") {
    lines.forEach((raw, i) => {
      const lineNo = i + 1;
      const imp = raw.match(/^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/);
      if (imp) imports.push(imp[1] ?? imp[2] ?? "");

      const cls = raw.match(/^(\s*)class\s+(\w+)(?:\(([^)]*)\))?/);
      if (cls) {
        const depth = Math.min(2, Math.floor(cls[1].length / 4));
        pushOutline("class", cls[2], lineNo, depth, cls[3] ? `(${cls[3]})` : "class");
        if (depth === 0) exportsList.push(cls[2]);
        return;
      }

      const fn = raw.match(/^(\s*)(async\s+)?def\s+(\w+)\s*\(([^)]*)\)?/);
      if (fn) {
        const depth = Math.min(2, Math.floor(fn[1].length / 4));
        pushOutline(
          depth > 0 ? "method" : "function",
          fn[3],
          lineNo,
          depth,
          fn[2] ? "async def" : "def",
        );
        if (depth === 0 && !fn[3].startsWith("_")) exportsList.push(fn[3]);
        return;
      }

      const cell = raw.match(/^#\s*%%\s*(.*)$/);
      if (cell) {
        pushOutline("section", cell[1] || `代码区块 L${lineNo}`, lineNo, 0, "Cell");
        return;
      }

      if (/^if\s+__name__\s*==\s*['"]__main__['"]\s*:/.test(raw)) {
        pushOutline("section", "主程序入口 (__main__)", lineNo, 0, "entry");
      }
    });
  } else if (lang === "r") {
    lines.forEach((raw, i) => {
      const lineNo = i + 1;
      const lib = raw.match(/(?:library|require)\(\s*["']?([\w.]+)["']?\s*\)/);
      if (lib) imports.push(lib[1]);

      const fn = raw.match(/^\s*([\w.]+)\s*(?:<-|=)\s*function\s*\(/);
      if (fn) {
        pushOutline("function", fn[1], lineNo, 0, "function");
        exportsList.push(fn[1]);
        return;
      }

      const sec = raw.match(/^#\s*(.+?)\s*[-=#]{4,}\s*$/);
      if (sec) {
        pushOutline("section", sec[1], lineNo, 0, "Section");
      }
    });
  } else if (
    lang === "typescript" ||
    lang === "tsx" ||
    lang === "javascript" ||
    lang === "jsx" ||
    lang === "vue"
  ) {
    lines.forEach((raw, i) => {
      const lineNo = i + 1;
      const imp = raw.match(/^\s*import\s+.*?\s+from\s+["']([^"']+)["']/);
      if (imp) imports.push(imp[1]);
      const req = raw.match(/require\(\s*["']([^"']+)["']\s*\)/);
      if (req) imports.push(req[1]);

      if (lang === "vue") {
        const vueTag = raw.match(/^<(template|script|style)\b([^>]*)>/i);
        if (vueTag) {
          pushOutline("section", `<${vueTag[1]}>`, lineNo, 0, vueTag[2].trim() || "SFC");
          return;
        }
      }

      const expCls = raw.match(/^\s*(export\s+(?:default\s+)?)?(?:abstract\s+)?class\s+(\w+)/);
      if (expCls) {
        pushOutline("class", expCls[2], lineNo, 0, expCls[1] ? "export class" : "class");
        if (expCls[1]) exportsList.push(expCls[2]);
        return;
      }

      const expType = raw.match(/^\s*(export\s+)?(interface|type|enum)\s+(\w+)/);
      if (expType) {
        pushOutline("const", expType[3], lineNo, 0, expType[2]);
        if (expType[1]) exportsList.push(expType[3]);
        return;
      }

      const expFn = raw.match(
        /^\s*(export\s+(?:default\s+)?)?(?:async\s+)?function\s+(\w+)\s*\(/,
      );
      if (expFn) {
        const isComp = /^[A-Z]/.test(expFn[2]) && (lang === "tsx" || lang === "jsx");
        pushOutline(
          isComp ? "component" : "function",
          expFn[2],
          lineNo,
          0,
          isComp ? "Component" : "function",
        );
        if (expFn[1]) exportsList.push(expFn[2]);
        return;
      }

      const arrowFn = raw.match(
        /^\s*(export\s+)?(?:const|let)\s+(\w+)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\([^)]*\)|[\w]+)\s*=>/,
      );
      if (arrowFn) {
        const isComp = /^[A-Z]/.test(arrowFn[2]) && (lang === "tsx" || lang === "jsx");
        pushOutline(
          isComp ? "component" : "function",
          arrowFn[2],
          lineNo,
          0,
          isComp ? "Component" : "arrow fn",
        );
        if (arrowFn[1]) exportsList.push(arrowFn[2]);
        return;
      }
    });
  } else if (lang === "html") {
    lines.forEach((raw, i) => {
      const m = raw.match(
        /<(header|nav|main|section|article|aside|footer|script|style|form|div)\b([^>]*)>/i,
      );
      if (m) {
        const tag = m[1].toLowerCase();
        const idMatch = m[2].match(/\bid=["']([^"']+)["']/i);
        const clsMatch = m[2].match(/\bclass=["']([^"']+)["']/i);
        if (tag === "div" && !idMatch) return;
        const label = idMatch ? `<${tag}#${idMatch[1]}>` : `<${tag}>`;
        pushOutline("tag", label, i + 1, tag === "div" ? 1 : 0, clsMatch?.[1]?.split(" ")[0]);
      }
    });
  } else if (lang === "css") {
    lines.forEach((raw, i) => {
      const at = raw.match(/^\s*(@media|@keyframes|@layer)\s+([^{]+)/);
      if (at) {
        pushOutline("section", `${at[1]} ${at[2].trim()}`, i + 1, 0, "at-rule");
        return;
      }
      const sel = raw.match(/^([.#a-zA-Z[:][^{,]{1,50})\s*\{/);
      if (sel) {
        pushOutline("rule", sel[1].trim(), i + 1, 0, "selector");
      }
    });
  } else if (lang === "sql") {
    lines.forEach((raw, i) => {
      const m = raw.match(
        /^\s*CREATE\s+(?:OR\s+REPLACE\s+)?(TABLE|VIEW|INDEX|FUNCTION|PROCEDURE|TRIGGER)\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w."`[\]]+)/i,
      );
      if (m) {
        pushOutline("section", m[2], i + 1, 0, m[1].toUpperCase());
      }
    });
  } else if (lang === "go") {
    lines.forEach((raw, i) => {
      const typ = raw.match(/^type\s+(\w+)\s+(struct|interface)/);
      if (typ) pushOutline("class", typ[1], i + 1, 0, typ[2]);
      const fn = raw.match(/^func\s+(?:\([^)]+\)\s*)?(\w+)\s*\(/);
      if (fn) pushOutline("function", fn[1], i + 1, 0, "func");
    });
  } else if (lang === "rust") {
    lines.forEach((raw, i) => {
      const useM = raw.match(/^\s*use\s+([\w:]+)/);
      if (useM) imports.push(useM[1]);
      const item = raw.match(/^\s*(?:pub\s+)?(struct|enum|trait|impl|fn)\s+(\w+)/);
      if (item) {
        pushOutline(item[1] === "fn" ? "function" : "class", item[2], i + 1, 0, item[1]);
      }
    });
  } else if (lang === "cpp" || lang === "java") {
    lines.forEach((raw, i) => {
      const inc = raw.match(/^\s*#include\s+[<"]([^>"]+)[>"]/);
      if (inc) imports.push(inc[1]);
      const imp = raw.match(/^\s*import\s+([\w.]+);/);
      if (imp) imports.push(imp[1]);
      const cls = raw.match(/^\s*(?:public|private|protected)?\s*(?:abstract\s+)?(class|struct|interface|enum)\s+(\w+)/);
      if (cls) pushOutline("class", cls[2], i + 1, 0, cls[1]);
    });
  } else if (lang === "shell" || lang === "powershell") {
    lines.forEach((raw, i) => {
      const fn = raw.match(/^\s*(?:function\s+)?([\w-]+)\s*\(\s*\)\s*\{/) ??
        raw.match(/^\s*function\s+([\w-]+)\b/i);
      if (fn) pushOutline("function", fn[1], i + 1, 0, "fn");
    });
  }

  return {
    languageId: meta.languageId,
    languageLabel: meta.languageLabel,
    roleDescription: meta.roleDescription,
    accentColor: meta.accentColor,
    lineCount: lines.length,
    charCount: content.length,
    imports: uniq(imports, 20),
    exports: uniq(exportsList, 20),
    outline,
    previewKind: meta.previewKind,
  };
}
