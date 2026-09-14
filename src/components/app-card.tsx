import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { AppWindow, Copy, FileText, GripVertical, MousePointerClick, Pencil, SquareMenu, Star, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { NoteBody } from "@/components/note-editor";
import { t, td, tp } from "@/lib/i18n";
import { PortalIcon } from "@/lib/icons";
import { cardUrl, type PortalCard } from "@/lib/portal";
import { safeAppHref } from "@/lib/safe-href";
import { orderedTags, tagPaint } from "@/lib/tag-ui";
import { clearResizeCursor, finePointer, hoverResizeCursor } from "@/lib/card-resize";
import type { ProbeResult } from "@/lib/probe";

export function StatusMark({
  result,
  pending,
  onRecheck,
}: {
  result?: ProbeResult;
  pending?: boolean;
  onRecheck: () => void;
}) {
  const state = pending && !result ? "wait" : result ? (result.ok ? "up" : "down") : "wait";
  const label =
    pending && !result
      ? t("probe.checking")
      : result
        ? `${result.ok ? t("probe.up") : t("probe.down")} · ${td(result.detail)}${result.ms != null ? ` · ${result.ms} ms` : ""}`
        : t("probe.pending");
  return (
    <button
      type="button"
      className={`status-mark is-${state}`}
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onRecheck();
      }}
      onPointerDown={(e) => e.stopPropagation()}
    />
  );
}
export function FavStar({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={`fav-star ${on ? "is-on" : ""}`}
      aria-label={on ? t("fav.remove") : t("fav.add")}
      title={on ? t("fav.remove") : t("fav.add")}
      aria-pressed={on}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <Star className="size-3.5" fill={on ? "currentColor" : "none"} />
    </button>
  );
}
export type AppCardMenu = { x: number; y: number };
export type AppCardProps = {
  app: PortalCard;
  editMode: boolean;
  canDrag?: boolean;
  canResize?: boolean;
  dragging?: boolean;
  className?: string;
  activeTags?: string[];
  tagColors?: Record<string, string>;
  tagsAlpha?: boolean;
  health?: ProbeResult;
  healthPending?: boolean;
  showHealth?: boolean;
  showClicks?: boolean;
  favorite?: boolean;
  onFavorite?: (() => void) | null;
  onTag?: (name: string) => void;
  onRecheck?: () => void;
  onOpen?: () => void;
  onPointerDown?: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove?: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp?: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerCancel?: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onEdit?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  dimMenu?: boolean;
  ctxMenu?: boolean;
  ctxHideUrl?: boolean;
  cardIconBg?: boolean;
};
export function AppCard({
  app,
  editMode,
  cardIconBg,
  canDrag,
  canResize,
  dragging,
  className,
  activeTags,
  tagColors,
  tagsAlpha,
  health,
  healthPending,
  showHealth,
  showClicks,
  favorite,
  onFavorite,
  onTag,
  onRecheck,
  onOpen,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onEdit,
  onDuplicate,
  onDelete,
  dimMenu,
  ctxMenu,
  ctxHideUrl,
}: AppCardProps) {
  const extra = (app.kind || "app") === "app" ? (app.links ?? []).slice(1) : [];
  const primaryHref = safeAppHref(cardUrl(app));
  const extraLinks = extra.filter((row) => safeAppHref(row.url));
  const menuMode = (app.kind || "app") === "app" && Boolean(app.linkMenu) && extraLinks.length > 0;
  const ctxOn = ctxMenu !== false;
  const canCtx = extraLinks.length > 0 || (ctxOn && Boolean(primaryHref));
  const [menu, setMenu] = useState<AppCardMenu | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!menu || !menuRef.current) return;
    const r = menuRef.current.getBoundingClientRect();
    const pad = 8;
    const x = Math.min(menu.x, window.innerWidth - r.width - pad);
    const y = Math.min(menu.y, window.innerHeight - r.height - pad);
    menuRef.current.style.left = `${Math.max(pad, x)}px`;
    menuRef.current.style.top = `${Math.max(pad, y)}px`;
  }, [menu]);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.documentElement.classList.add("card-ctx-open");
    if (dimMenu) document.documentElement.classList.add("card-ctx-dim");
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.documentElement.classList.remove("card-ctx-open");
      document.documentElement.classList.remove("card-ctx-dim");
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menu, dimMenu]);
  if (dragging)
    return (
      <div data-card-id={app.id} data-app-card="" className={`drop-slot ${className ?? ""}`}>
        <span className="drop-slot-label">{t("nav.dropHere")}</span>
      </div>
    );
  const kind = app.kind || "app";
  const untitled = !String(app.title || "").trim();
  const headless = (kind === "note" || kind === "embed") && untitled && !editMode;
  const tagRow =
    kind === "app" ? (
      <div className="card-tags">
        {orderedTags(app.tags ?? [], tagsAlpha !== false).map((tag) => {
          const on = (activeTags ?? []).some((t) => t.toLowerCase() === tag.toLowerCase());
          const paint = tagPaint(tag, tagColors);
          return (
            <button
              key={tag}
              type="button"
              data-tone={paint.tone}
              style={paint.style}
              className={`tag-chip ${on ? "is-on" : ""}`}
              title={on ? t("nav.filterRemove", { name: tag }) : t("nav.filterAdd", { name: tag })}
              aria-pressed={on}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onTag?.(tag);
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {tag}
              {on ? <X className="ml-0.5 size-2.5" /> : null}
            </button>
          );
        })}
        {showClicks ? (
          <span
            className="card-clicks"
            title={tp("card.clicks", app.clicks || 0)}
          >
            <MousePointerClick className="size-3" aria-hidden />
            {app.clicks || 0}
          </span>
        ) : null}
      </div>
    ) : null;
  const star = onFavorite ? <FavStar on={Boolean(favorite)} onToggle={onFavorite} /> : null;
  const healthDot =
    showHealth && app.check && app.check !== "off" ? (
      <StatusMark
        result={health}
        pending={Boolean(healthPending)}
        onRecheck={() => onRecheck?.()}
      />
    ) : null;
  const annexHint = extra.length > 1 ? t("annex.hint_other") : t("annex.hint");
  const annexBtn = extra.length ? (
    <button
      type="button"
      className={`card-tool${menu ? " is-open" : ""}${app.linkMenu ? " is-hub" : ""}`}
      aria-label={extra.length > 1 ? t("annex.others") : t("annex.other")}
      aria-expanded={Boolean(menu)}
      aria-haspopup="menu"
      title={annexHint}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const r = e.currentTarget.getBoundingClientRect();
        setMenu({
          x: r.left,
          y: r.bottom + 4,
        });
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <SquareMenu className="size-3.5" />
    </button>
  ) : null;
  const corner =
    star || healthDot || editMode || annexBtn ? (
      <div className="card-corner">
        {healthDot}
        {annexBtn}
        {star}
        {editMode ? (
          <>
            <button
              type="button"
              className="card-tool"
              aria-label={t("actions.duplicate")}
              title={t("actions.duplicate")}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDuplicate?.();
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <Copy className="size-3.5" />
            </button>
            <button
              type="button"
              className="card-tool"
              aria-label={t("actions.edit")}
              title={t("actions.edit")}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onEdit?.();
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <Pencil className="size-3.5" />
            </button>
            <button
              type="button"
              className="card-tool is-danger"
              aria-label={t("actions.delete")}
              title={t("actions.delete")}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete?.();
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <Trash2 className="size-3.5" />
            </button>
          </>
        ) : null}
      </div>
    ) : null;
  const grip = canDrag ? <GripVertical className="card-grip" aria-hidden /> : null;
  const appMark = (
    <span
      className={`portal-mark flex size-11 shrink-0 items-center justify-center rounded-lg p-1.5 text-fg${
        cardIconBg === false ? " is-plain" : ""
      }`}
    >
      <PortalIcon name={app.icon} className="size-7" />
    </span>
  );
  const appCopy = (
    <div className="min-w-0 flex-1 pt-0.5">
      <h3 className="truncate font-medium tracking-tight">{app.title}</h3>
      <p className="mt-0.5 line-clamp-1 text-sm leading-snug text-muted">{app.description}</p>
    </div>
  );
  let inner;
  if (kind === "note")
    inner = (
      <div className="flex h-full items-start gap-3">
        {grip}
        <div className="flex h-full min-h-0 flex-1 flex-col">
          {String(app.title || "").trim() ? (
            <div className="note-title mb-2 flex items-center gap-2 text-muted">
              <FileText className="size-4" />
              <h3 className="truncate font-medium tracking-tight text-fg">{app.title}</h3>
            </div>
          ) : editMode ? (
            <div className="note-title invisible mb-2 flex items-center gap-2 text-muted">
              <FileText className="size-4" />
              <h3 className="truncate font-medium tracking-tight text-fg">—</h3>
            </div>
          ) : null}
          <NoteBody source={app.description} />
          {tagRow}
        </div>
      </div>
    );
  else if (kind === "embed")
    inner = (
      <div className="flex h-full min-h-0 flex-col">
        {untitled ? (
          editMode ? (
            <div className="mb-3 flex items-center gap-2 invisible">
              {grip}
              <AppWindow className="size-4 text-muted" />
              <h3 className="min-w-0 flex-1 truncate font-medium tracking-tight">—</h3>
            </div>
          ) : null
        ) : (
          <div className="mb-3 flex items-center gap-2">
            {grip}
            <AppWindow className="size-4 text-muted" />
            <h3 className="min-w-0 flex-1 truncate font-medium tracking-tight">{app.title}</h3>
          </div>
        )}
        {safeAppHref(app.url) ? (
          <iframe
            title={app.title || t("item.embed.option")}
            src={safeAppHref(app.url)}
            className={`min-h-0 w-full flex-1 rounded-lg${app.embedBorder ? " border border-border" : ""} ${
              app.embedBg === "default" ? "bg-elevated" : "bg-transparent"
            }`}
            style={
              app.embedBg && app.embedBg !== "default"
                ? { background: app.embedBg }
                : undefined
            }
            sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
            referrerPolicy="no-referrer"
          />
        ) : (
          <p className="text-sm text-muted">{t("empty.noLinks")}</p>
        )}
        {tagRow}
      </div>
    );
  else
    inner = (
      <div className="flex h-full min-h-0 flex-col">
        <div className="card-main">
          {appMark}
          {appCopy}
        </div>
        {tagRow}
      </div>
    );
  const shell = `portal-card group relative flex h-full min-h-0 flex-col rounded-xl bg-surface p-4 ${className ?? ""} ${canDrag ? "cursor-grab touch-none select-none active:cursor-grabbing" : ""} ${corner ? "has-corner" : ""} ${headless ? "is-headless" : ""} ${menu ? "is-ctx-open" : ""}`;
  const onCtx = canCtx
    ? (e: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setMenu({
          x: e.clientX,
          y: e.clientY,
        });
      }
    : void 0;
  function copyHref(raw: string, e?: { preventDefault?: () => void; stopPropagation?: () => void } | null) {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    const href = safeAppHref(raw);
    if (!href) return;
    const fallback = () => {
      try {
        const el = document.createElement("textarea");
        el.value = href;
        el.setAttribute("readonly", "");
        el.style.cssText = "position:fixed;left:-9999px;top:0";
        document.body.appendChild(el);
        el.select();
        const ok = document.execCommand("copy");
        el.remove();
        return ok;
      } catch {
        return false;
      }
    };
    const done = (ok: boolean) => {
      setMenu(null);
      if (ok) toast.success(t("toast.copied"));
      else toast.error(t("toast.generic"));
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(href).then(() => done(true)).catch(() => done(fallback()));
    } else done(fallback());
  }
  function ctxRow(href: string, name: string | undefined, key: string, openIn?: "_blank" | "_self") {
    const safe = safeAppHref(href);
    if (!safe) return null;
    const label = String(name || "").trim() || t("annex.primary");
    const target = openIn === "_self" ? "_self" : "_blank";
    const rel = target === "_self" ? void 0 : "noopener noreferrer";
    return (
      <div key={key} className="card-ctx-row">
        <a
          href={safe}
          target={target}
          rel={rel}
          role="menuitem"
          title={safe}
          onClick={() => {
            setMenu(null);
            onOpen?.();
          }}
        >
          <span className="card-ctx-copy-text min-w-0">
            <span className="card-ctx-name truncate">{label}</span>
            {ctxHideUrl ? null : <span className="card-ctx-url truncate">{safe}</span>}
          </span>
        </a>
        <button
          type="button"
          className="card-ctx-copy"
          aria-label={t("annex.copy")}
          title={t("annex.copy")}
          onClick={(ev) => copyHref(safe, ev)}
        >
          <Copy className="size-4" />
        </button>
      </div>
    );
  }
  const showPrimary = Boolean((ctxOn || menuMode) && primaryHref);
  const primaryLabel = String(app.links?.[0]?.title || "").trim() || String(app.title || "").trim();
  const ctxCount = (showPrimary ? 1 : 0) + extraLinks.length;
  const ctxHeading = ctxCount === 1 ? t("annex.one") : t("annex.linksTitle");
  const linkMenu =
    menu && canCtx && typeof document !== "undefined"
      ? createPortal(
          <>
            <div
              className={`card-ctx-back${dimMenu ? " is-dim" : ""}`}
              onPointerDown={(e) => {
                e.preventDefault();
                setMenu(null);
              }}
            />
            <div
              ref={menuRef}
              className="card-ctx"
              style={{
                left: menu.x,
                top: menu.y,
              }}
              role="menu"
              onPointerDown={(e) => e.stopPropagation()}
              onContextMenu={(e) => e.preventDefault()}
            >
              <p className="menu-kicker truncate" title={ctxHeading}>
                {ctxHeading}
              </p>
              {showPrimary ? ctxRow(primaryHref, primaryLabel || t("annex.one"), "primary", app.links[0]?.openIn) : null}
              {extraLinks.map((row, i) =>
                ctxRow(row.url, row.title, `x-${i}-${row.url}`, row.openIn),
              )}
            </div>
          </>,
          document.body,
        )
      : null;
  const href = safeAppHref(cardUrl(app));
  if (kind === "app" && !editMode)
    return (
      <div data-card-id={app.id} className={shell} onContextMenu={onCtx}>
        {href ? (
          <a
            href={href}
            target={app.links[0]?.openIn === "_self" ? "_self" : "_blank"}
            rel={app.links[0]?.openIn === "_self" ? void 0 : "noopener noreferrer"}
            className="card-hit"
            aria-label={menuMode ? t("item.linkMenu") : app.title}
            aria-haspopup={menuMode ? "menu" : undefined}
            onClick={(e) => {
              if (menuMode) {
                e.preventDefault();
                setMenu({ x: e.clientX, y: e.clientY + 4 });
                return;
              }
              onOpen?.();
            }}
            onAuxClick={(e) => {
              if (e.button === 1 && !menuMode) onOpen?.();
            }}
          />
        ) : null}
        <div className="card-main">
          {appMark}
          {appCopy}
        </div>
        {corner}
        {tagRow}
        {linkMenu}
      </div>
    );
  return (
    <div
      data-card-id={app.id}
      data-app-card=""
      onPointerDown={onPointerDown}
      onPointerMove={(e) => {
        if (canResize && e.buttons === 0 && e.pointerType !== "touch" && finePointer())
          hoverResizeCursor(e.currentTarget, e.clientX, e.clientY);
        onPointerMove?.(e);
      }}
      onPointerLeave={(e) => clearResizeCursor(e.currentTarget)}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onContextMenu={onCtx}
      className={shell}
    >
      {kind === "app" || (kind === "embed" && untitled) ? grip : null}
      {corner}
      {inner}
      {linkMenu}
    </div>
  );
}
