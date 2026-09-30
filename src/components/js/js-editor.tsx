"use client";
import { javascript } from "@codemirror/lang-javascript";
import { keymap } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import CodeMirror from "@uiw/react-codemirror";
import { useMemo } from "react";

export function JsEditor({
  value,
  onChange,
  onRun,
  minHeight = "140px",
}: {
  value: string;
  onChange: (v: string) => void;
  onRun: () => void;
  minHeight?: string;
}) {
  const extensions = useMemo(
    () => [
      javascript(),
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
    [onRun],
  );

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <CodeMirror
        value={value}
        onChange={onChange}
        extensions={extensions}
        theme="none"
        minHeight={minHeight}
        basicSetup={{ foldGutter: false, highlightActiveLineGutter: true, autocompletion: false }}
      />
    </div>
  );
}
