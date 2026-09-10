import { useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { Bold, Code, Code2, Eraser, Italic, Link, Palette } from "lucide-react";
import { htmlToMd, mdToHtml, safeHref, escapeHtml, NOTE_COLORS, toHex } from "@/lib/note-md";
import { t } from "@/lib/i18n";
import { EdgeFade } from "@/components/edge-fade";

type NoteEditorProps = {
  value: string;
  onChange: (next: string) => void;
};

export function NoteBody({ source }: { source: string }) {
  const html = mdToHtml(source || "");
  if (!html) return null;
  return (
    <EdgeFade className="note-scroll note-body text-sm leading-snug text-muted">
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </EdgeFade>
  );
}

export function NoteEditor({ value, onChange }: NoteEditorProps) {
  const [mode, setMode] = useState<"visuel" | "md">("visuel");
  const [linkOpen, setLinkOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [linkHref, setLinkHref] = useState("");
  const canvasRef = useRef<HTMLDivElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const mdRef = useRef<HTMLTextAreaElement>(null);
  const rangeRef = useRef<Range | null>(null);
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
    if (!el.textContent?.trim()) el.innerHTML = "";
    const md = htmlToMd(el.innerHTML);
    valueRef.current = md;
    onChange(md);
  }

  useLayoutEffect(() => {
    if (mode !== "visuel") return;
    const el = canvasRef.current;
    if (!el) return;
    if (document.activeElement === el) return;
    valueRef.current = value;
    hydrate(value);
  }, [mode, value]);

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

  function setMd(next: string, selStart: number, selEnd: number) {
    onChange(next);
    requestAnimationFrame(() => {
      const el = mdRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(selStart, selEnd);
    });
  }

  function wrapMd(open: string, close = open) {
    const el = mdRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const inner = value.slice(start, end);
    const next = `${value.slice(0, start)}${open}${inner}${close}${value.slice(end)}`;
    setMd(next, start + open.length, start + open.length + inner.length);
  }

  function tokenRange(text: string, caret: number): [number, number] {
    let s = caret;
    let e = caret;
    while (s > 0 && !/\s/.test(text[s - 1])) s -= 1;
    while (e < text.length && !/\s/.test(text[e])) e += 1;
    return [s, e];
  }

  function stripColorMd(s: number, e: number): { next: string; s: number; e: number } | null {
    const pre = value.slice(0, s);
    const post = value.slice(e);
    const pm = /\{([a-z0-9#]{3,8})\}$/.exec(pre);
    const sm = /^\{\/([a-z0-9#]{3,8})\}/.exec(post);
    if (!pm || !sm || pm[1] !== sm[1]) return null;
    return {
      next: `${pre.slice(0, pm.index)}${value.slice(s, e)}${post.slice(sm[0].length)}`,
      s: pm.index,
      e: pm.index + (e - s),
    };
  }

  function unwrapMd() {
    const el = mdRef.current;
    if (!el) return;
    let start = el.selectionStart;
    let end = el.selectionEnd;
    if (start === end) [start, end] = tokenRange(value, start);
    const inner = value.slice(start, end);
    for (const [open, close] of [
      ["**", "**"],
      ["*", "*"],
      ["`", "`"],
    ] as const) {
      if (
        value.slice(start - open.length, start) === open &&
        value.slice(end, end + close.length) === close
      ) {
        setMd(
          `${value.slice(0, start - open.length)}${inner}${value.slice(end + close.length)}`,
          start - open.length,
          start - open.length + inner.length,
        );
        return;
      }
    }
    const color = stripColorMd(start, end);
    if (color) setMd(color.next, color.s, color.e);
  }

  function applyLink() {
    const href = safeHref(linkHref);
    if (!href) return;
    if (mode === "md") {
      const el = mdRef.current;
      if (el) {
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const inner = value.slice(start, end);
        const label = inner || (href.startsWith("mailto:") ? href.slice(7) : href);
        const link = `[${label}](${href})`;
        setMd(`${value.slice(0, start)}${link}${value.slice(end)}`, start + link.length, start + link.length);
      }
      setLinkOpen(false);
      setLinkHref("");
      return;
    }
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
    if (mode === "md") {
      const el = mdRef.current;
      if (el) {
        const start = el.selectionStart;
        const end = el.selectionEnd;
        if (!hex) {
          const color = stripColorMd(start, end);
          if (color) setMd(color.next, color.s, color.e);
        } else {
          const named = NOTE_COLORS.find((c) => c.id && c.hex === hex);
          const key = named ? named.id : hex.replace(/^#/, "").toLowerCase();
          const mark = `{${key}}`;
          const close = named ? `{/${key}}` : `{/#}`;
          const inner = value.slice(start, end);
          setMd(
            `${value.slice(0, start)}${mark}${inner}${close}${value.slice(end)}`,
            start + mark.length,
            start + mark.length + inner.length,
          );
        }
      }
      setColorOpen(false);
      return;
    }
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
        <button type="button" title={t("note.bold")} aria-label={t("note.bold")} onMouseDown={keepSelection} onClick={() => (mode === "md" ? wrapMd("**") : run("bold"))}>
          <Bold className="size-3.5" />
        </button>
        <button
          type="button"
          title={t("note.italic")}
          aria-label={t("note.italic")}
          onMouseDown={keepSelection}
          onClick={() => (mode === "md" ? wrapMd("*") : run("italic"))}
        >
          <Italic className="size-3.5" />
        </button>
        <button
          type="button"
          title={t("note.normal")}
          aria-label={t("note.normal")}
          onMouseDown={keepSelection}
          onClick={() => (mode === "md" ? unwrapMd() : run("removeFormat"))}
        >
          <Eraser className="size-3.5" />
        </button>
        <button type="button" title={t("note.code")} aria-label={t("note.code")} onMouseDown={keepSelection} onClick={() => (mode === "md" ? wrapMd("`") : wrapCode())}>
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
          <Palette className="size-3.5" />
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
          <Code2 className="size-3.5" />
        </button>
      </div>
      {colorOpen ? (
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
          <label className="note-swatch-custom" title={t("note.customColor")}>
            <input
              type="color"
              className="note-swatch-custom-input"
              defaultValue="#188038"
              aria-label={t("note.customColor")}
              onMouseDown={keepSelection}
              onChange={(e) => {
                const hex = toHex(e.target.value);
                if (hex) applyColor(hex);
              }}
            />
            <Palette className="size-3.5" />
            {t("note.customColor")}
          </label>
        </div>
      ) : null}
      {linkOpen ? (
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
          ref={mdRef}
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
