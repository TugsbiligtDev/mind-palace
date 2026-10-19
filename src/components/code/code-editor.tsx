"use client";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { PostgreSQL, sql } from "@codemirror/lang-sql";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { keymap } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import CodeMirror from "@uiw/react-codemirror";
import { useMemo } from "react";

export type EditorLanguage = "sql" | "python" | "javascript";

const LANGUAGE = {
  sql: () => sql({ dialect: PostgreSQL, upperCaseKeywords: true }),
  python: () => python(),
  javascript: () => javascript(),
};

// Syntax colours come from CSS variables (globals.css), so they follow light and dark mode.
export const codeHighlighting = syntaxHighlighting(
  HighlightStyle.define([
    { tag: [t.keyword, t.operatorKeyword, t.modifier, t.controlKeyword, t.definitionKeyword], color: "var(--code-keyword)" },
    { tag: [t.string, t.special(t.string), t.regexp], color: "var(--code-string)" },
    { tag: [t.number, t.bool, t.null, t.atom, t.unit], color: "var(--code-number)" },
    { tag: [t.comment, t.lineComment, t.blockComment], color: "var(--code-comment)", fontStyle: "italic" },
    { tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName], color: "var(--code-function)" },
    { tag: [t.typeName, t.className, t.propertyName, t.standard(t.name)], color: "var(--code-type)" },
    { tag: [t.tagName, t.angleBracket], color: "var(--code-tag)" },
    { tag: [t.attributeName, t.attributeValue], color: "var(--code-number)" },
  ]),
);

// The code editor used by every exercise. ⌘ + Enter runs the code.
export function CodeEditor({
  language,
  value,
  onChange,
  onRun,
  minHeight = "140px",
}: {
  language: EditorLanguage;
  value: string;
  onChange: (v: string) => void;
  onRun: () => void;
  minHeight?: string;
}) {
  const extensions = useMemo(
    () => [
      LANGUAGE[language](),
      codeHighlighting,
      Prec.highest(
        keymap.of([
          {
            key: "Mod-Enter",
            run: () => {
              onRun();
              return true;
            },
          },
        ]),
      ),
    ],
    [language, onRun],
  );

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <CodeMirror
        value={value}
        onChange={onChange}
        extensions={extensions}
        theme="none"
        minHeight={minHeight}
        // No automatic closing brackets in SQL: beginners type CREATE TABLE line by line, and the
        // auto-inserted ")" ends up as a stray bracket after the real one.
        basicSetup={{ foldGutter: false, highlightActiveLineGutter: true, autocompletion: false, closeBrackets: language !== "sql" }}
      />
    </div>
  );
}
