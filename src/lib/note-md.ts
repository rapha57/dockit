const HOLD = "\uE000";
const AMP = "\u0026amp;";
const LT = "\u0026lt;";
const GT = "\u0026gt;";
const QUOT = "\u0026quot;";

export const NOTE_COLORS = [
  { id: "", label: "Par défaut", hex: "" },
  { id: "ink", label: "Encre", hex: "#111827" },
  { id: "dim", label: "Discret", hex: "#6b7280" },
  { id: "red", label: "Rouge", hex: "#e11d48" },
  { id: "green", label: "Vert", hex: "#188038" },
  { id: "blue", label: "Bleu", hex: "#2563eb" },
  { id: "amber", label: "Ambre", hex: "#c2410c" },
] as const;

const NAMED_COLOR: Set<string> = new Set(
  NOTE_COLORS.map((c) => c.id).filter((id) => id.length > 0),
);
const HEX_TO_NAME = new Map<string, string>(
  NOTE_COLORS.filter((c) => c.id && c.hex).map((c) => [c.hex, c.id]),
);

export function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, AMP)
    .replace(/</g, LT)
    .replace(/>/g, GT)
    .replace(/"/g, QUOT);
}

export function safeHref(raw: string): string | null {
  const href = String(raw || "").trim();
  if (!href) return null;
  if (/^https?:\/\//i.test(href)) return href;
  if (/^mailto:/i.test(href)) {
    const rest = href.slice(7);
    if (!rest || /\s/.test(rest)) return null;
    return href;
  }
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(href)) return `mailto:${href}`;
  return null;
}

export function toHex(color: string): string | null {
  const s = String(color || "").trim().toLowerCase();
  if (!s || s === "inherit" || s === "currentcolor" || s === "canvastext") return null;
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  if (/^#[0-9a-f]{3}$/.test(s)) {
    return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  }
  const m = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!m) return null;
  const h = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
  return `#${h(Number(m[1]))}${h(Number(m[2]))}${h(Number(m[3]))}`;
}

function wrapColorHtml(id: string, hex: string, inner: string) {
  if (id && NAMED_COLOR.has(id)) return `<span class="note-${id}">${inner}</span>`;
  const safe = toHex(hex.startsWith("#") ? hex : `#${hex}`);
  if (!safe) return inner;
  return `<span style="color:${safe}">${inner}</span>`;
}

export function mdToHtml(src: string): string {
  if (!src) return "";
  const fences: string[] = [];
  let s = String(src).replace(/```(?:([^\n]*)\n)?([\s\S]*?)```/g, (_, lang, code) => {
    const body = String(code).replace(/^\n/, "").replace(/\n$/, "");
    const langClean = String(lang || "").trim();
    const langAttr = langClean ? ` data-lang="${escapeHtml(langClean)}"` : "";
    fences.push(`<pre><code${langAttr}>${escapeHtml(body)}</code></pre>`);
    return `${HOLD}F${fences.length - 1}${HOLD}`;
  });
  s = escapeHtml(s);
  const inlines: string[] = [];
  const hold = (html: string) => {
    inlines.push(html);
    return `${HOLD}I${inlines.length - 1}${HOLD}`;
  };
  function inlineMd(src: string): string {
    let t = src;
    t = t.replace(/`([^`]+)`/g, (_, c) => hold(`<code>${c}</code>`));
    t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, href) => {
      const h = safeHref(String(href).replace(new RegExp(AMP, "g"), "&"));
      if (!h) return text;
      const extra = h.startsWith("mailto:") ? "" : ' rel="noopener noreferrer" target="_blank"';
      return hold(`<a href="${escapeHtml(h)}"${extra}>${text}</a>`);
    });
    t = t.replace(/\{#([0-9a-fA-F]{3,8})\}([\s\S]*?)\{\/#\}/g, (_, hex, inner) =>
      hold(wrapColorHtml("", `#${hex}`, inlineMd(inner))),
    );
    t = t.replace(/\{(ink|dim|red|green|blue|amber)\}([\s\S]*?)\{\/\1\}/g, (_, id, inner) =>
      hold(wrapColorHtml(id, "", inlineMd(inner))),
    );
    let prev = "";
    while (prev !== t) {
      prev = t;
      t = t.replace(/\*\*([^*]+)\*\*/g, (_, x) => hold(`<strong>${x}</strong>`));
      t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, (_, p, x) => `${p}${hold(`<em>${x}</em>`)}`);
    }
    t = t.replace(/(^|[\s>(])(https?:\/\/[^\s<]+)/g, (_, p, u) => {
      const trail = u.match(/[),.;!?]+$/)?.[0] || "";
      const core = trail ? u.slice(0, -trail.length) : u;
      const h = safeHref(core.replace(new RegExp(AMP, "g"), "&"));
      if (!h) return `${p}${u}`;
      return `${p}${hold(`<a href="${escapeHtml(h)}" rel="noopener noreferrer" target="_blank">${core}</a>`)}${trail}`;
    });
    t = t.replace(/(^|[\s>(])([^\s@<&]+@[^\s@<&]+\.[^\s@<&]+)/g, (_, p, e) => {
      const trail = e.match(/[),.;!?]+$/)?.[0] || "";
      const core = trail ? e.slice(0, -trail.length) : e;
      const h = safeHref(core);
      if (!h) return `${p}${e}`;
      return `${p}${hold(`<a href="${escapeHtml(h)}">${core}</a>`)}${trail}`;
    });
    return t;
  }
  s = inlineMd(s);
  s = s.replace(/\n/g, "<br>");
  const total = inlines.length + fences.length;
  for (let i = 0; i < total; i++) {
    s = s.replace(new RegExp(`${HOLD}([IF])(\\d+)${HOLD}`, "g"), (_, kind, idx) =>
      kind === "I" ? inlines[Number(idx)] || "" : fences[Number(idx)] || "",
    );
  }
  return s;
}

function colorMark(el: HTMLElement, inner: string): string {
  const named = [...el.classList].map((c) => c.replace(/^note-/, "")).find((c) => NAMED_COLOR.has(c));
  if (named) return `{${named}}${inner}{/${named}}`;
  const hex = toHex(el.getAttribute("color") || el.style.color || "");
  if (!hex) return inner;
  const known = HEX_TO_NAME.get(hex);
  if (known) return `{${known}}${inner}{/${known}}`;
  return `{${hex}}${inner}{/#}`;
}

function serializeNode(node: Node): string {
  if (node.nodeType === 3) return node.textContent || "";
  if (node.nodeType !== 1) return "";
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  if (tag === "br") return "\n";
  if (tag === "pre") {
    const code = Array.from(el.childNodes).find(
      (n) => n.nodeType === 1 && (n as HTMLElement).tagName === "CODE",
    ) as HTMLElement | undefined;
    const lang = code?.getAttribute("data-lang") || "";
    const text = (el.textContent || "").replace(/\n$/, "");
    return `\`\`\`${lang}\n${text}\n\`\`\``;
  }
  const inner = Array.from(el.childNodes).map(serializeNode).join("");
  if (tag === "strong" || tag === "b") return inner ? `**${inner}**` : "";
  if (tag === "em" || tag === "i") return inner ? `*${inner}*` : "";
  if (tag === "code") return inner ? `\`${inner}\`` : "";
  if (tag === "a") {
    const href = safeHref(el.getAttribute("href") || "");
    if (!href) return inner;
    return `[${inner || href}](${href})`;
  }
  if (tag === "span" || tag === "font") return colorMark(el, inner);
  if (tag === "p" || tag === "div" || tag === "li") {
    if (!inner) return "\n";
    return inner.endsWith("\n") ? inner : `${inner}\n`;
  }
  return inner;
}

export function htmlToMd(html: string): string {
  if (typeof document === "undefined") return String(html || "");
  const wrap = document.createElement("div");
  wrap.innerHTML = html || "";
  return serializeNode(wrap)
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+/, "")
    .trimEnd();
}
