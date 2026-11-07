"use client";

/**
 * The CodeMirror 6 surface (ADR 0002). Loaded only on editing screens, never
 * on first paint. In edit mode it is a plain editor. In review mode it shows
 * the change against the saved revision as a unified diff, with accept and
 * reject on each changed chunk; the text can't be typed into there.
 */
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, bracketMatching, indentOnInput, syntaxHighlighting } from "@codemirror/language";
import { Chunk, unifiedMergeView } from "@codemirror/merge";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { EditorState, Text, type Extension } from "@codemirror/state";
import { EditorView, drawSelection, highlightActiveLine, highlightActiveLineGutter, highlightSpecialChars, keymap, lineNumbers } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { useEffect, useRef } from "react";

function languageFor(path: string): Extension {
  const ext = path.split(".").at(-1)?.toLowerCase() ?? "";
  switch (ext) {
    case "ts":
    case "mts":
    case "cts":
      return javascript({ typescript: true });
    case "tsx":
      return javascript({ typescript: true, jsx: true });
    case "js":
    case "mjs":
    case "cjs":
      return javascript();
    case "jsx":
      return javascript({ jsx: true });
    case "json":
      return json();
    case "css":
    case "scss":
      return css();
    case "md":
    case "mdx":
      return markdown();
    case "html":
    case "htm":
      return html();
    default:
      return [];
  }
}

/** Colours come from the design tokens; every pair passes WCAG AA on the surface. */
const theme = EditorView.theme({
  "&": { color: "var(--ink)", backgroundColor: "var(--surface)", fontSize: "inherit", maxHeight: "70vh", minHeight: "16rem" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.6", overflow: "auto" },
  ".cm-content": { caretColor: "var(--accent)", padding: "12px 0" },
  ".cm-gutters": { backgroundColor: "var(--surface)", color: "var(--ink-3)", border: "none" },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 12px 0 16px" },
  ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--accent) 5%, transparent)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--ink)" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "color-mix(in srgb, var(--accent) 18%, transparent) !important",
  },
  ".cm-cursor": { borderLeftColor: "var(--accent)" },
  ".cm-searchMatch": { backgroundColor: "color-mix(in srgb, var(--accent-2) 18%, transparent)" },
  ".cm-panels": { backgroundColor: "var(--surface-raised)", color: "var(--ink)", borderColor: "var(--line)" },
  ".cm-changedLine": { backgroundColor: "color-mix(in srgb, var(--verified) 8%, transparent) !important" },
  ".cm-changedText": { background: "color-mix(in srgb, var(--verified) 22%, transparent) !important" },
  ".cm-deletedChunk": { backgroundColor: "color-mix(in srgb, var(--failed) 6%, transparent) !important" },
  ".cm-deletedChunk .cm-deletedText, .cm-deletedChunk del": { background: "color-mix(in srgb, var(--failed) 20%, transparent) !important" },
  // The merge view pins the buttons absolutely, over the first added line, in fixed green and red.
  // Here they get a row of their own, so no code is hidden at phone width, as token pills.
  ".cm-deletedChunk .cm-chunkButtons": { position: "static", display: "flex", justifyContent: "flex-end", gap: "8px", padding: "6px 8px" },
  ".cm-deletedChunk button": {
    fontFamily: "var(--font-sans)",
    fontSize: "0.875rem",
    minHeight: "44px",
    margin: "0",
    padding: "0 16px",
    borderRadius: "999px",
    border: "1px solid var(--line)",
    cursor: "pointer",
  },
  ".cm-deletedChunk button[name=accept]": { background: "var(--ink)", borderColor: "var(--ink)", color: "var(--surface)" },
  ".cm-deletedChunk button[name=reject]": { background: "var(--surface)", color: "var(--ink)" },
});

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.modifier, t.controlKeyword, t.operatorKeyword, t.definitionKeyword], color: "var(--accent)" },
  { tag: [t.string, t.special(t.string), t.regexp, t.number, t.bool, t.null, t.atom], color: "var(--accent-2)" },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: "var(--ink-3)", fontStyle: "italic" },
  { tag: [t.typeName, t.className, t.namespace, t.tagName], color: "var(--accent)" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "var(--ink)", fontWeight: "500" },
  { tag: [t.propertyName, t.attributeName], color: "var(--ink-2)" },
  { tag: t.heading, fontWeight: "600" },
  { tag: t.link, color: "var(--accent)", textDecoration: "underline" },
  { tag: t.invalid, color: "var(--failed)" },
]);

/** Lines added and removed between two versions, for the review summary. */
export function diffStats(before: string, after: string): { added: number; removed: number } {
  const a = Text.of(before.split("\n"));
  const b = Text.of(after.split("\n"));
  let added = 0;
  let removed = 0;
  for (const c of Chunk.build(a, b)) {
    if (c.toA > c.fromA) removed += a.lineAt(Math.min(c.toA - 1, a.length)).number - a.lineAt(c.fromA).number + 1;
    if (c.toB > c.fromB) added += b.lineAt(Math.min(c.toB - 1, b.length)).number - b.lineAt(c.fromB).number + 1;
  }
  return { added, removed };
}

export default function CodeMirrorSurface({
  path,
  value,
  original,
  controls = true,
  label,
  onChange,
}: {
  path: string;
  value: string;
  /** When set, the surface is a review of `value` against this saved text. */
  original?: string;
  /** Accept and reject buttons on each chunk. Off for history comparisons, which only show the change. */
  controls?: boolean;
  label: string;
  onChange?: (doc: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // The view is created once per mount; the parent remounts it (with a key) to switch file or mode.
  useEffect(() => {
    if (!host.current) return;
    const narrow = window.matchMedia("(max-width: 640px)").matches;
    const review = original !== undefined;
    const extensions: Extension[] = [
      lineNumbers(),
      highlightActiveLineGutter(),
      drawSelection(),
      highlightActiveLine(),
      bracketMatching(),
      highlightSelectionMatches(),
      search({ top: true }),
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
      syntaxHighlighting(highlight),
      theme,
      languageFor(path),
      EditorView.contentAttributes.of({ "aria-label": label }),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) onChangeRef.current?.(u.state.doc.toString());
      }),
      // In review nothing may sit off to the side: a long line wraps, and characters that don't show are marked (ADR 0179).
      ...(narrow || review ? [EditorView.lineWrapping] : []),
      ...(review ? [highlightSpecialChars({ addSpecialChars: /[​-‏‪-‮⁠-⁩﻿]/ })] : []),
    ];
    if (review) {
      extensions.push(
        // Not typeable, but the accept and reject controls can still change the text.
        EditorView.editable.of(false),
        unifiedMergeView({ original, mergeControls: controls, highlightChanges: true, gutter: true, collapseUnchanged: { margin: 3, minSize: 6 } }),
      );
    } else {
      extensions.push(history(), indentOnInput());
    }
    const view = new EditorView({ parent: host.current, state: EditorState.create({ doc: value, extensions }) });
    return () => view.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mounted once; see the comment above.
  }, []);

  return <div ref={host} className="overflow-hidden rounded-md border border-line bg-surface text-base sm:text-[0.8125rem]" />;
}
