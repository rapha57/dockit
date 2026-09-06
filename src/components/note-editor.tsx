import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { Baseline, Bold, Code, FileCode, Italic, Link, Type } from "lucide-react";
import { htmlToMd, mdToHtml, safeHref, escapeHtml, NOTE_COLORS, toHex } from "@/lib/note-md";
import { t } from "@/lib/i18n";
import { useEdgeFade } from "@/components/edge-fade";

type NoteEditorProps = {
  value: string;
  onChange: (next: string) => void;
};

export function NoteBody({ source }: { source: string }) {
  const fade = useEdgeFade();
  const html = mdToHtml(source || "");
  if (!html) return null;
  return (
    <div
      ref={fade}
      className="note-scroll note-body text-sm leading-snug text-muted"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function NoteEditor({ value, onChange }: NoteEditorProps) {
  const [mode, setMode] = useState<"visuel" | "md">("visuel");
  const [linkOpen, setLinkOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [linkHref, setLinkHref] = useState("");
  const canvasRef = useRef<HTMLDivElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const rangeRef = useRef<Range | null>(null);
  const skipHtml = useRef(false);
  const valueRef = useRef(value);
  valueRef.current = value;

  function snapshotRange() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const el = canvasRef.current;
    if (el && el.contains(range.commonAncestorContainer)) {
      rangeRef.current = range.cloneRange();
    }
  }

  function restoreRange() {
    const el = canvasRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    const saved = rangeRef.current;
    if (saved) {
      try {
        sel.addRange(saved);
        return;
      } catch {
        /* range stale */
      }
    }
    const fallback = document.createRange();
    fallback.selectNodeContents(el);
    fallback.collapse(false);
    sel.addRange(fallback);
  }

  function hydrate(from = valueRef.current) {
    const el = canvasRef.current;
    if (!el) return;
    const html = mdToHtml(from || "");
    if (el.innerHTML !== html) el.innerHTML = html || "";
  }

  function emitHtml() {
    const el = canvasRef.current;
    if (!el) return;
    skipHtml.current = true;
    onChange(htmlToMd(el.innerHTML));
  }

  useLayoutEffect(() => {
    if (mode !== "visuel") return;
    skipHtml.current = false;
    hydrate();
  }, [mode]);

  useEffect(() => {
    if (mode !== "visuel") return;
    if (skipHtml.current) {
      skipHtml.current = false;
      return;
    }
    hydrate();
  }, [value, mode]);

  function keepSelection(e: MouseEvent) {
    e.preventDefault();
    snapshotRange();
  }

  function run(cmd: string, arg?: string) {
    restoreRange();
    document.execCommand(cmd, false, arg);
    snapshotRange();
    emitHtml();
  }

  function wrapCode() {
    restoreRange();
    const sel = window.getSelection();
    const text = sel?.toString() || "code";
    document.execCommand("insertHTML", false, `<code>${escapeHtml(text)}</code>\u00a0`);
    snapshotRange();
    emitHtml();
  }

  function applyLink() {
    const href = safeHref(linkHref);
    if (!href) return;
    restoreRange();
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) {
      document.execCommand("createLink", false, href);
    } else {
      const label = href.startsWith("mailto:") ? href.slice(7) : href;
      document.execCommand(
        "insertHTML",
        false,
        `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>\u00a0`,
      );
    }
    snapshotRange();
    emitHtml();
    setLinkOpen(false);
    setLinkHref("");
  }

  function applyColor(hex: string) {
    restoreRange();
    if (!hex) {
      document.execCommand("foreColor", false, "inherit");
    } else {
      document.execCommand("foreColor", false, hex);
    }
    snapshotRange();
    emitHtml();
    setColorOpen(false);
  }

  function toggleMode() {
    setLinkOpen(false);
    setColorOpen(false);
    if (mode === "visuel") {
      emitHtml();
      setMode("md");
      return;
    }
    setMode("visuel");
  }

  return (
    <div className="note-editor">
      <div className="note-toolbar" role="toolbar" aria-label={t("note.format")}>
        <button type="button" title={t("note.bold")} aria-label={t("note.bold")} onMouseDown={keepSelection} onClick={() => run("bold")}>
          <Bold className="size-3.5" />
        </button>
        <button
          type="button"
          title={t("note.italic")}
          aria-label={t("note.italic")}
          onMouseDown={keepSelection}
          onClick={() => run("italic")}
        >
          <Italic className="size-3.5" />
        </button>
        <button
          type="button"
          title={t("note.normal")}
          aria-label={t("note.normal")}
          onMouseDown={keepSelection}
          onClick={() => run("removeFormat")}
        >
          <Type className="size-3.5" />
        </button>
        <button type="button" title={t("note.code")} aria-label={t("note.code")} onMouseDown={keepSelection} onClick={wrapCode}>
          <Code className="size-3.5" />
        </button>
        <button
          type="button"
          title={t("note.textColor")}
          aria-label={t("note.textColor")}
          className={colorOpen ? "is-on" : undefined}
          onMouseDown={keepSelection}
          onClick={() => {
            setLinkOpen(false);
            setColorOpen((v) => !v);
          }}
        >
          <Baseline className="size-3.5" />
        </button>
        <button
          type="button"
          title={t("note.linkOrMail")}
          aria-label={t("note.link")}
          className={linkOpen ? "is-on" : undefined}
          onMouseDown={keepSelection}
          onClick={() => {
            setColorOpen(false);
            setLinkOpen((v) => !v);
          }}
        >
          <Link className="size-3.5" />
        </button>
        <span className="note-toolbar-spacer" />
        <button
          type="button"
          title={mode === "md" ? t("note.visual") : t("note.source")}
          aria-label={mode === "md" ? t("note.visual") : t("note.source")}
          className={mode === "md" ? "is-on" : undefined}
          onMouseDown={keepSelection}
          onClick={toggleMode}
        >
          <FileCode className="size-3.5" />
        </button>
      </div>
      {colorOpen && mode === "visuel" ? (
        <div className="note-swatches" role="listbox" aria-label={t("note.textColor")}>
          {NOTE_COLORS.map((c) => (
            <button
              key={c.id || "default"}
              type="button"
              role="option"
              title={t(`note.${c.id || "default"}`)}
              aria-label={t(`note.${c.id || "default"}`)}
              className={`note-swatch ${c.id ? `is-${c.id}` : "is-default"}`}
              style={c.hex ? { background: c.hex } : undefined}
              onMouseDown={keepSelection}
              onClick={() => applyColor(c.hex)}
            />
          ))}
          <input
            type="color"
            className="note-swatch is-pick"
            defaultValue="#188038"
            title={t("note.customColor")}
            aria-label={t("note.customColor")}
            onMouseDown={keepSelection}
            onChange={(e) => {
              const hex = toHex(e.target.value);
              if (hex) applyColor(hex);
            }}
          />
        </div>
      ) : null}
      {linkOpen && mode === "visuel" ? (
        <div className="note-linkbar">
          <input
            ref={linkRef}
            className="field-input h-9 flex-1 rounded-lg border border-border bg-elevated/80 px-2 text-sm outline-none"
            placeholder={t("note.linkPlaceholder")}
            value={linkHref}
            onChange={(e) => setLinkHref(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyLink();
              }
              if (e.key === "Escape") setLinkOpen(false);
            }}
          />
          <button type="button" className="note-link-ok" onMouseDown={keepSelection} onClick={applyLink}>
            {t("note.applyLink")}
          </button>
        </div>
      ) : null}
      {mode === "md" ? (
        <textarea
          className="note-md field-input"
          value={value}
          spellCheck={false}
          placeholder={t("note.mdHint")}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <div
          ref={canvasRef}
          className="note-canvas field-input"
          contentEditable
          role="textbox"
          aria-multiline="true"
          aria-label={t("note.bodyAria")}
          data-placeholder={t("note.canvasPlaceholder")}
          onInput={emitHtml}
          onBlur={emitHtml}
          onKeyUp={snapshotRange}
          onMouseUp={snapshotRange}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.preventDefault();
          }}
        />
      )}
    </div>
  );
}
