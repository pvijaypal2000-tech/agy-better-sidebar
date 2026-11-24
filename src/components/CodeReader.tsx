import React, { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { EditorState, StateEffect, StateField, type Extension } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  HighlightStyle,
  StreamLanguage,
  syntaxHighlighting,
} from "@codemirror/language";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { oneDark } from "@codemirror/theme-one-dark";
import { tags as t } from "@lezer/highlight";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { xml } from "@codemirror/lang-xml";
import { yaml } from "@codemirror/lang-yaml";
import { sql } from "@codemirror/lang-sql";
import { rust } from "@codemirror/lang-rust";
import { cpp } from "@codemirror/lang-cpp";
import { java } from "@codemirror/lang-java";
import { vue } from "@codemirror/lang-vue";
import { r as rMode } from "@codemirror/legacy-modes/mode/r";
import { shell as shellMode } from "@codemirror/legacy-modes/mode/shell";
import { powerShell as psMode } from "@codemirror/legacy-modes/mode/powershell";
import { toml as tomlMode } from "@codemirror/legacy-modes/mode/toml";
import { go as goMode } from "@codemirror/legacy-modes/mode/go";
import { ruby as rubyMode } from "@codemirror/legacy-modes/mode/ruby";
import { swift as swiftMode } from "@codemirror/legacy-modes/mode/swift";
import { dockerFile as dockerMode } from "@codemirror/legacy-modes/mode/dockerfile";
import { properties as propMode } from "@codemirror/legacy-modes/mode/properties";
import type { SelectionInfo } from "../shared/types";

export interface CodeReaderHandle {
  scrollToLine: (line: number) => void;
}

interface CodeReaderProps {
  content: string;
  languageId: string;
  isDark: boolean;
  fontSize: number;
  wordWrap: boolean;
  onSelectionChange?: (selection: SelectionInfo | null) => void;
}

const setFlashLine = StateEffect.define<number | null>();

const flashLineField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const eff of tr.effects) {
      if (eff.is(setFlashLine)) {
        if (eff.value === null) return Decoration.none;
        const clamped = Math.max(1, Math.min(tr.state.doc.lines, eff.value));
        const line = tr.state.doc.line(clamped);
        return Decoration.set([
          Decoration.line({ attributes: { class: "cm-flash-line" } }).range(line.from),
        ]);
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const lightHighlight = HighlightStyle.define([
  { tag: [t.keyword, t.modifier, t.operatorKeyword], color: "#cf222e", fontWeight: "600" },
  { tag: [t.name, t.deleted, t.character, t.macroName], color: "#24292f" },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.labelName], color: "#8250df" },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: "#0550ae" },
  { tag: [t.definition(t.name), t.separator], color: "#24292f" },
  { tag: [t.typeName, t.className, t.number, t.changed, t.annotation, t.self, t.namespace], color: "#0550ae" },
  { tag: [t.operator, t.url, t.escape, t.regexp, t.link, t.special(t.string)], color: "#0a3069" },
  { tag: [t.meta, t.comment], color: "#6e7781", fontStyle: "italic" },
  { tag: t.strong, fontWeight: "bold" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: [t.atom, t.bool, t.special(t.variableName)], color: "#0550ae" },
  { tag: [t.processingInstruction, t.string, t.inserted], color: "#0a3069" },
  { tag: [t.tagName], color: "#116329" },
  { tag: [t.attributeName], color: "#8250df" },
  { tag: t.heading, fontWeight: "bold", color: "#0550ae" },
]);

function getLanguageExtension(languageId: string): Extension[] {
  switch (languageId) {
    case "typescript":
      return [javascript({ typescript: true })];
    case "tsx":
      return [javascript({ typescript: true, jsx: true })];
    case "javascript":
      return [javascript()];
    case "jsx":
      return [javascript({ jsx: true })];
    case "python":
      return [python()];
    case "html":
      return [html()];
    case "css":
      return [css()];
    case "json":
    case "notebook":
      return [json()];
    case "markdown":
    case "mermaid":
      return [markdown()];
    case "xml":
      return [xml()];
    case "yaml":
      return [yaml()];
    case "sql":
      return [sql()];
    case "rust":
      return [rust()];
    case "cpp":
      return [cpp()];
    case "java":
      return [java()];
    case "vue":
      return [vue()];
    case "r":
      return [StreamLanguage.define(rMode)];
    case "shell":
      return [StreamLanguage.define(shellMode)];
    case "powershell":
      return [StreamLanguage.define(psMode)];
    case "toml":
      return [StreamLanguage.define(tomlMode)];
    case "go":
      return [StreamLanguage.define(goMode)];
    case "ruby":
      return [StreamLanguage.define(rubyMode)];
    case "swift":
      return [StreamLanguage.define(swiftMode)];
    case "dockerfile":
      return [StreamLanguage.define(dockerMode)];
    case "ini":
      return [StreamLanguage.define(propMode)];
    default:
      return [];
  }
}

export const CodeReader = forwardRef<CodeReaderHandle, CodeReaderProps>(
  ({ content, languageId, isDark, fontSize, wordWrap, onSelectionChange }, ref) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const viewRef = useRef<EditorView | null>(null);
    const flashTimerRef = useRef<number | null>(null);
    const selectionCbRef = useRef(onSelectionChange);
    selectionCbRef.current = onSelectionChange;

    useImperativeHandle(ref, () => ({
      scrollToLine(lineNo: number) {
        const view = viewRef.current;
        if (!view) return;
        const clamped = Math.max(1, Math.min(view.state.doc.lines, lineNo));
        const line = view.state.doc.line(clamped);
        view.dispatch({
          selection: { anchor: line.from },
          effects: [
            EditorView.scrollIntoView(line.from, { y: "center" }),
            setFlashLine.of(clamped),
          ],
        });
        if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
        flashTimerRef.current = window.setTimeout(() => {
          viewRef.current?.dispatch({ effects: setFlashLine.of(null) });
        }, 1200);
      },
    }));

    useEffect(() => {
      const host = containerRef.current;
      if (!host) return;

      const chromeTheme = EditorView.theme(
        {
          "&": {
            backgroundColor: "var(--ide-bg)",
            color: "var(--ide-text)",
            fontSize: `${fontSize}px`,
            height: "100%",
          },
          ".cm-scroller": {
            lineHeight: "1.62",
            fontFamily: "var(--ide-font-mono)",
          },
          ".cm-gutters": {
            backgroundColor: "var(--ide-bg)",
            color: "var(--ide-text-faint)",
            borderRight: "1px solid var(--ide-border-subtle)",
            paddingRight: "4px",
            userSelect: "none",
          },
          ".cm-activeLineGutter": {
            backgroundColor: "var(--ide-bg-hover)",
            color: "var(--ide-text)",
          },
          ".cm-activeLine": {
            backgroundColor: isDark
              ? "rgba(56, 189, 248, 0.06)"
              : "rgba(37, 99, 235, 0.05)",
          },
          ".cm-content": {
            padding: "10px 0 32px",
            caretColor: "transparent",
          },
          ".cm-line": {
            padding: "0 14px",
          },
          ".cm-selectionBackground, ::selection": {
            backgroundColor: isDark
              ? "rgba(56, 189, 248, 0.28) !important"
              : "rgba(37, 99, 235, 0.2) !important",
          },
          ".cm-foldGutter .cm-gutterElement": {
            padding: "0 3px",
            cursor: "pointer",
            opacity: 0.65,
          },
          ".cm-foldGutter .cm-gutterElement:hover": {
            opacity: 1,
            color: "var(--ide-accent)",
          },
          ".cm-panels": {
            backgroundColor: "var(--ide-bg-sidebar)",
            color: "var(--ide-text)",
            borderBottom: "1px solid var(--ide-border)",
          },
          ".cm-search input, .cm-search button": {
            fontFamily: "var(--ide-font-sans)",
            fontSize: "12px",
            borderRadius: "5px",
          },
        },
        { dark: isDark },
      );

      const selectionListener = EditorView.updateListener.of((update) => {
        if (!update.selectionSet) return;
        const main = update.state.selection.main;
        if (main.empty) {
          selectionCbRef.current?.(null);
          return;
        }
        const text = update.state.sliceDoc(main.from, main.to);
        if (!text.trim()) {
          selectionCbRef.current?.(null);
          return;
        }
        const fromLine = update.state.doc.lineAt(main.from).number;
        const toLine = update.state.doc.lineAt(main.to).number;
        selectionCbRef.current?.({ text, fromLine, toLine });
      });

      const extensions: Extension[] = [
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
        lineNumbers(),
        foldGutter(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        bracketMatching(),
        highlightSelectionMatches(),
        search({ top: true }),
        keymap.of([...searchKeymap, ...foldKeymap]),
        flashLineField,
        selectionListener,
        ...(wordWrap ? [EditorView.lineWrapping] : []),
        ...getLanguageExtension(languageId),
        ...(isDark ? [oneDark] : [syntaxHighlighting(lightHighlight)]),
        chromeTheme,
      ];

      const state = EditorState.create({
        doc: content,
        extensions,
      });

      const view = new EditorView({
        state,
        parent: host,
      });

      viewRef.current = view;
      selectionCbRef.current?.(null);

      return () => {
        if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
        view.destroy();
        viewRef.current = null;
      };
    }, [content, languageId, isDark, fontSize, wordWrap]);

    return <div className="cm-host" ref={containerRef} />;
  },
);

CodeReader.displayName = "CodeReader";
