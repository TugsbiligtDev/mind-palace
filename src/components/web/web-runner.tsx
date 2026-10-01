"use client";
import { css as cssLang } from "@codemirror/lang-css";
import { html as htmlLang } from "@codemirror/lang-html";
import { Prec } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { saveCode } from "@/lib/progress";
import { buildPage, type WebFiles } from "@/lib/web/core";
import { codeHighlighting } from "@/components/code/code-editor";

type Tab = "html" | "css";

// Preview widths: "Fit" fills the panel; the others show a phone or tablet screen.
const SIZES = [
  { label: "Fit", width: null },
  { label: "Phone", width: 375 },
  { label: "Tablet", width: 768 },
  { label: "Desktop", width: 1100 },
] as const;

// An HTML & CSS exercise: two editor tabs and a live preview that redraws as you type.
// The preview never runs scripts and keeps clicks on links to other pages inside the panel.
export function WebRunner({
  initial,
  starter,
  slot,
  showCss,
  onCheck,
  checking,
  minHeight = "220px",
}: {
  initial: WebFiles;
  starter: WebFiles;
  slot?: string; // where typed code is remembered (style.css under `${slot}:css`)
  showCss: boolean;
  onCheck?: (files: WebFiles) => void; // grading; shown as a "Check my page" button
  checking?: boolean;
  minHeight?: string;
}) {
  const [files, setFiles] = useState(initial);
  const [tab, setTab] = useState<Tab>("html");
  const [page, setPage] = useState(() => buildPage(initial));
  const [size, setSize] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const filesRef = useRef(files);
  const frame = useRef<HTMLIFrameElement>(null);

  // Redraw shortly after typing stops, so the preview doesn't flicker on every key.
  useEffect(() => {
    const t = setTimeout(() => setPage(buildPage(files)), 250);
    return () => clearTimeout(t);
  }, [files]);

  const change = (which: Tab, v: string) => {
    const next = { ...filesRef.current, [which]: v };
    filesRef.current = next;
    setFiles(next);
    if (slot) saveCode(which === "html" ? slot : `${slot}:css`, v);
  };

  // Links inside the preview: same-page (#id) links scroll as usual; links to other pages
  // and form submissions can't open here, so say so instead of showing a blank panel.
  function wireFrame() {
    const doc = frame.current?.contentDocument;
    if (!doc) return;
    doc.addEventListener("click", (e) => {
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!a) return;
      const href = a.getAttribute("href") ?? "";
      if (href.startsWith("#")) {
        e.preventDefault();
        const target = href === "#" ? doc.body : doc.getElementById(decodeURIComponent(href.slice(1)));
        target?.scrollIntoView({ behavior: "smooth" });
        return;
      }
      e.preventDefault();
      setNote(`This link goes to "${href}". Links to other pages don't open inside the preview.`);
    });
    doc.addEventListener("submit", (e) => {
      // A form inside a <dialog> with method="dialog" just closes the dialog: let it.
      const form = e.target as HTMLFormElement;
      const method = (e as SubmitEvent).submitter?.getAttribute("formmethod") ?? form.getAttribute("method");
      if (method?.toLowerCase() === "dialog") return;
      e.preventDefault();
      setNote("The form would be sent now. The preview doesn't send forms anywhere.");
    });
  }

  // ⌘ + Enter does nothing while a check is already running, like the greyed-out button.
  const check = useCallback(() => {
    if (!checking) onCheck?.(filesRef.current);
  }, [onCheck, checking]);

  return (
    <div className="min-w-0 space-y-3">
      <div className="overflow-hidden rounded-xl border border-border">
        <div className="flex border-b border-border bg-subtle text-xs" role="tablist" aria-label="Files">
          {(showCss ? (["html", "css"] as const) : (["html"] as const)).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`px-3.5 py-2 font-mono transition-colors ${tab === t ? "bg-card text-text" : "text-muted hover:text-text"}`}
            >
              {t === "html" ? "index.html" : "style.css"}
            </button>
          ))}
        </div>
        <FileEditor key={tab} lang={tab} value={files[tab]} onChange={(v) => change(tab, v)} onRun={check} minHeight={minHeight} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {onCheck && (
          <button
            onClick={check}
            disabled={checking}
            className="rounded-lg bg-text px-3.5 py-1.5 text-sm font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {checking ? "Checking…" : "Check my page"}
          </button>
        )}
        <button
          onClick={() => {
            change("html", starter.html);
            change("css", starter.css);
            setNote(null);
          }}
          className="rounded-lg px-3 py-1.5 text-sm text-muted transition-colors hover:bg-subtle hover:text-text"
        >
          Reset
        </button>
        {onCheck && (
          <span className="ml-auto text-xs text-muted">
            <kbd className="font-mono">⌘ + Enter</kbd>
          </span>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center gap-1 border-b border-border px-2 py-1.5 text-xs">
          <span className="mr-auto px-1 text-muted">Preview</span>
          {SIZES.map((s) => (
            <button
              key={s.label}
              onClick={() => setSize(s.width)}
              aria-pressed={size === s.width}
              className={`rounded-md px-2 py-1 transition-colors ${size === s.width ? "bg-subtle text-text" : "text-muted hover:text-text"}`}
            >
              {s.label}
              {s.width ? <span className="ml-1 text-muted tabular-nums">{s.width}</span> : null}
            </button>
          ))}
        </div>
        <div className="resize-y overflow-auto bg-[repeating-conic-gradient(var(--subtle)_0_25%,transparent_0_50%)] bg-[length:16px_16px]" style={{ height: 340 }}>
          <iframe
            ref={frame}
            title="Preview of your page"
            sandbox="allow-same-origin allow-forms"
            srcDoc={page}
            onLoad={wireFrame}
            className="mx-auto block h-full border-0 bg-white"
            style={{ width: size ? `${size}px` : "100%", maxWidth: size ? "none" : "100%" }}
          />
        </div>
      </div>
      {note && <p className="rounded-lg bg-subtle px-3 py-2 text-xs text-muted">{note}</p>}
    </div>
  );
}

// One file's editor. ⌘ + Enter runs the check, like Run in the other courses.
function FileEditor({
  lang,
  value,
  onChange,
  onRun,
  minHeight,
}: {
  lang: Tab;
  value: string;
  onChange: (v: string) => void;
  onRun: () => void;
  minHeight: string;
}) {
  const extensions = useMemo(
    () => [
      lang === "html" ? htmlLang() : cssLang(),
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
    [lang, onRun],
  );
  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={extensions}
      theme="none"
      minHeight={minHeight}
      basicSetup={{ foldGutter: false, highlightActiveLineGutter: true, autocompletion: false }}
    />
  );
}
