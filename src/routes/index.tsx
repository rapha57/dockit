import { createFileRoute } from "@tanstack/react-router";
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  ArrowDownAZ,
  ArrowUpZA,
  ArrowRightLeft,
  ArrowUpRight,
  AppWindow,
  BadgeInfo,
  BarChart3,
  Bug,
  Check,
  Copy,
  ChevronDown,
  CircleUser,
  Clock,
  Download,
  FileText,
  Folder,
  Globe,
  GripVertical,
  LayoutGrid,
  Link,
  History,
  ListChecks,
  Lock,
  LogIn,
  LogOut,
  Menu,
  Minus,
  MoreHorizontal,
  MousePointerClick,
  Palette,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Settings2,
  Shield,
  Smile,
  Sparkles,
  Star,
  Tags,
  Trash2,
  Undo2,
  Upload,
  User,
  Users,
  X,
  ScrollText,
  ScanSearch,
  Server,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/field";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/empty-state";
import { EdgeFade } from "@/components/edge-fade";
import { ConfirmDialog, askConfirm } from "@/components/confirm-dialog";
import { ModalShell } from "@/components/modal-shell";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AccessUsers,
  AccessGroups,
  AccessRoles,
  ConfirmPopup,
  MovePickDialog,
  MoveSectionDialog,
  useColSort,
  SortLabel,
} from "@/components/access";
import { ExpandRow, useExpandSession } from "@/components/expand-row";
import {
  PortalIcon,
  DockitMark,
  BmcMark,
  ICON_OPTIONS,
  PRODUCT_ICONS,
  iconifySrc,
  fileToDataUrl,
  urlToDataUrl,
  toFaviconDataUrl,
} from "@/lib/icons";
import { ThemeCss, ThemeToggle, useTheme } from "@/components/theme";
import { NoteBody, NoteEditor } from "@/components/note-editor";
import {
  createApp,
  createCategory,
  createTab,
  curationStart,
  curationStatus,
  curationStop,
  deleteApp,
  deleteCategory,
  deleteTab,
  duplicateTab,
  exportAudit,
  exportPortal,
  getCuration,
  getPortal,
  grabSiteFavicon,
  importPortal,
  manageTags,
  rememberTab,
  moveApp,
  moveCategory,
  previewMoveCategory,
  reorderApps,
  reorderCategories,
  reorderTabs,
  proxyLogin,
  recordClick,
  resetClicks,
  resetPortal,
  saveCustomIcon,
  startOidc,
  unlockEdit,
  updateOidcSettings,
  updateLdapSettings,
  updateLoginOrder,
  updateApp,
  arrangeCategory,
  appsAlphaDir,
  updateCategory,
  updateSettings,
  updateTab,
  updateThemeCss,
  updateFavsOptions,
  listHistory,
  restoreHistory,
  purgeTrash,
} from "@/lib/portal";
import { auditCsv } from "@/lib/history";
import type { AuditRow, TrashRow } from "@/lib/history";
import { probePreview, probeTargets } from "@/lib/probe";
import type { ProbeResult } from "@/lib/probe";
import { checkLatestRelease } from "@/lib/release";
import { safeAppHref } from "@/lib/safe-href";
import { cardUrl } from "@/lib/portal";
import { findUrlDuplicates } from "@/lib/dup-url";
import { collectInventory, inventoryCsv, inventoryPdf } from "@/lib/inventory";
import { CSS_MAX, sanitizeThemeCss } from "@/lib/theme-css";
import { DEFAULT_UI_PREFS, clearUiPrefs, readUiPrefs, writeUiPrefs } from "@/lib/ui-prefs";
import {
  t,
  te,
  tp,
  td,
  asLocale,
  localeTag,
  applyDisplayPrefs,
  asDateFormat,
  asTimeFormat,
  asTimeZone,
  asNumberFormat,
  formatNumber,
  formatWhen,
  listTimeZones,
} from "@/lib/i18n";
import {
  TAG_PALETTE,
  defaultTagHex,
  randomTagHex,
  remapTagHex,
  tagInk,
  tagTone,
} from "@/lib/tag-colors";
import type {
  CheckMode,
  ClickStats,
  CurationCheck,
  CurationJobView,
  CustomIcon,
  DocTab,
  ItemKind,
  PortalApp,
  PortalCategory,
  PortalSettings,
  SessionInfo,
} from "@/lib/portal";
import type { Category, CategoryMoveImpact } from "@/lib/acl";
import type { Directory } from "@/lib/ldap-runtime";
export const Route = createFileRoute("/")({
  loader: async () => {
    const data = await getPortal({
      data: {},
    });
    applyDisplayPrefs(data.settings);
    return data;
  },
  component: Home,
});
type PortalData = Awaited<ReturnType<typeof getPortal>>;
type MenuTab = PortalData["tabs"][number];
type CatalogTab = PortalData["catalog"][number];
type DirectoryEntry = PortalData["directory"][number];
const TOKEN_KEY = "portal-edit-token";
const SESSION_KEY = "portal-session";
const PORTAL_VERSION = "2026.09.07.1";
const EDIT_MODE_KEY = "portal-edit-mode";
const OIDC_NEXT_KEY = "portal-oidc-next";
function versionParts(raw: unknown) {
  return String(raw || "")
    .replace(/^v/i, "")
    .split(".")
    .map((n) => Number(n) || 0);
}
function isNewerVersion(latest: unknown, current: unknown) {
  const a = versionParts(latest);
  const b = versionParts(current);
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if ((a[i] || 0) > (b[i] || 0)) return true;
    if ((a[i] || 0) < (b[i] || 0)) return false;
  }
  return false;
}
let editArmed = false;
function lockSelection(e?: { preventDefault?: () => void } | null) {
  e?.preventDefault?.();
  try {
    window.getSelection()?.removeAllRanges();
  } catch {
    // ignore
  }
}
function setDragUi(on: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("is-dragging", on);
  if (on) lockSelection();
}
function nudgeScroll(clientX: number | undefined, clientY: number | undefined, tabRow?: HTMLElement | null) {
  const edge = 64;
  const speed = 28;
  const h = window.innerHeight;
  let y = clientY;
  if (arguments.length === 1) {
    y = clientX;
    clientX = window.innerWidth / 2;
  }
  if (y === undefined) return;
  if (y < edge) window.scrollBy(0, -Math.ceil((1 - y / edge) * speed));
  else if (y > h - edge) window.scrollBy(0, Math.ceil((1 - (h - y) / edge) * speed));
  if (!tabRow || typeof clientX !== "number") return;
  const r = tabRow.getBoundingClientRect();
  const te = 44;
  if (y < r.top - 16 || y > r.bottom + 16) return;
  if (clientX < r.left + te)
    tabRow.scrollLeft -= Math.ceil((1 - Math.max(0, clientX - r.left) / te) * speed);
  else if (clientX > r.right - te)
    tabRow.scrollLeft += Math.ceil((1 - Math.max(0, r.right - clientX) / te) * speed);
}
function swallowGhostClick() {
  const block = (ev: MouseEvent) => {
    if ((ev.target as HTMLElement | null)?.closest("header")) return;
    ev.preventDefault();
    ev.stopPropagation();
    window.removeEventListener("click", block, true);
  };
  window.addEventListener("click", block, true);
  window.setTimeout(() => window.removeEventListener("click", block, true), 180);
}
function reindexApps(apps: PortalApp[], categoryId: string) {
  return apps.map((a, i) => ({
    ...a,
    categoryId,
    sortOrder: i + 1,
  }));
}
function placeCarriedApp(
  categories: PortalCategory[],
  app: PortalApp | null | undefined,
  destCatId: string | null | undefined,
  insertAt: number,
) {
  if (!app || !destCatId) return null;
  const stripped = categories.map((c) => ({
    ...c,
    apps: c.apps.filter((a) => a.id !== app.id),
  }));
  if (!stripped.some((c) => c.id === destCatId)) return null;
  return stripped.map((c) => {
    if (c.id !== destCatId) return c;
    const apps = [...c.apps];
    const idx = Math.max(0, Math.min(insertAt, apps.length));
    apps.splice(idx, 0, {
      ...app,
      categoryId: c.id,
    });
    return {
      ...c,
      apps: reindexApps(apps, c.id),
    };
  });
}
function placeApp(
  categories: PortalCategory[],
  appId: string,
  destCatId: string | null | undefined,
  insertAt: number,
) {
  let moved: PortalApp | undefined;
  const stripped = categories.map((c) => {
    const hit = c.apps.find((a) => a.id === appId);
    if (!hit) return c;
    moved = hit;
    return {
      ...c,
      apps: c.apps.filter((a) => a.id !== appId),
    };
  });
  if (!moved) return null;
  const app = moved;
  return stripped.map((c) => {
    if (c.id !== destCatId) return c;
    const apps = [...c.apps];
    const idx = Math.max(0, Math.min(insertAt, apps.length));
    apps.splice(idx, 0, {
      ...app,
      categoryId: c.id,
    });
    return {
      ...c,
      apps: reindexApps(apps, c.id),
    };
  });
}
function placeCategory(categories: PortalCategory[], catId: string, insertAt: number) {
  const from = categories.findIndex((c) => c.id === catId);
  if (from < 0) return null;
  const next = categories.filter((c) => c.id !== catId);
  const idx = Math.max(0, Math.min(insertAt, next.length));
  next.splice(idx, 0, categories[from]);
  return next.map((c, i) => ({
    ...c,
    sortOrder: i + 1,
  }));
}
function placeCarriedCategory(
  categories: PortalCategory[],
  cat: PortalCategory | null | undefined,
  insertAt: number,
) {
  if (!cat) return null;
  const stripped = categories.filter((c) => c.id !== cat.id);
  const idx = Math.max(0, Math.min(insertAt, stripped.length));
  const next = [...stripped];
  next.splice(idx, 0, cat);
  return next.map((c, i) => ({
    ...c,
    sortOrder: i + 1,
  }));
}
function placeTabs<T extends { id: string; sortOrder: number }>(tabs: T[], tabId: string, insertAt: number) {
  const from = tabs.findIndex((t) => t.id === tabId);
  if (from < 0) return null;
  const next = tabs.filter((t) => t.id !== tabId);
  const idx = Math.max(0, Math.min(insertAt, next.length));
  next.splice(idx, 0, tabs[from]);
  return next.map((t, i) => ({
    ...t,
    sortOrder: i + 1,
  }));
}
function pickVisibleTabIds(
  tabs: { id: string }[] | null | undefined,
  widths: Map<string, number>,
  activeId: string | null | undefined,
  avail: number,
  favW: number,
  plusW: number,
  moreW: number,
  gap: number,
) {
  const ids = (tabs || []).map((t) => t.id);
  const wOf = (id: string) => widths.get(id) || 72;
  function total(vis: string[], showMore: boolean) {
    const n = 1 + vis.length + (showMore ? 1 : 0) + (plusW > 0 ? 1 : 0);
    let w = favW + (showMore ? moreW : 0) + plusW;
    for (const id of vis) w += wOf(id);
    return w + Math.max(0, n - 1) * gap;
  }
  function pack(showMore: boolean) {
    const vis: string[] = [];
    for (const id of ids) {
      if (total([...vis, id], showMore) <= avail || id === activeId) vis.push(id);
    }
    if (activeId && ids.includes(activeId) && !vis.includes(activeId)) vis.push(activeId);
    while (total(vis, showMore) > avail) {
      const drop = [...vis].reverse().find((id) => id !== activeId);
      if (!drop) break;
      vis.splice(vis.indexOf(drop), 1);
    }
    return vis;
  }
  let vis = pack(false);
  let hid = ids.filter((id) => !vis.includes(id));
  if (hid.length) {
    vis = pack(true);
    hid = ids.filter((id) => !vis.includes(id));
  }
  return hid;
}
function hoverInsertAt(ids: string[], dragId: string, anchorId: string | null | undefined, after: boolean) {
  const rest = ids.filter((id) => id !== dragId);
  const ai = rest.indexOf(anchorId ?? "");
  return (ai < 0 ? rest.length : ai) + (after ? 1 : 0);
}
function pointerAfter(e: { clientX: number; clientY: number }, el: Element) {
  const r = el.getBoundingClientRect();
  if (r.height > r.width * 1.1) return e.clientY > r.top + r.height * 0.35;
  return e.clientX - r.left + (e.clientY - r.top) > (r.width + r.height) / 2;
}
function itemSpanClass(app: { colSpan: number; rowSpan: number }) {
  return `${app.colSpan === 3 ? "item-span-3" : app.colSpan === 2 ? "item-span-2" : ""} ${app.rowSpan === 3 ? "item-h-3" : app.rowSpan === 2 ? "item-h-2" : "item-h-1"}`.trim();
}
const RESIZE_EDGE = 8;
function finePointer() {
  return typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches;
}
function gridColCount() {
  if (typeof window === "undefined") return 1;
  if (window.matchMedia("(min-width: 64rem)").matches) return 3;
  if (window.matchMedia("(min-width: 40rem)").matches) return 2;
  return 1;
}
function spanSize(n: number): 1 | 2 | 3 {
  return n === 2 || n === 3 ? n : 1;
}
function nearestSpan(sizes: number[], value: number, max: number) {
  let best = 1;
  let dist = Infinity;
  for (let n = 1; n <= max; n++) {
    const d = Math.abs(sizes[n - 1] - value);
    if (d < dist) {
      dist = d;
      best = n;
    }
  }
  return best;
}
type ResizeBox = { left: number; top: number; width: number; height: number };
function liveResizeBox(
  start: ResizeBox,
  edge: { x: number; y: number },
  dx: number,
  dy: number,
  widths: number[],
  heights: number[],
  maxCols: number,
) {
  const minW = widths[0];
  const maxW = widths[Math.max(0, Math.min(maxCols, 3) - 1)];
  const minH = heights[0];
  const maxH = heights[2];
  const right = start.left + start.width;
  const bottom = start.top + start.height;
  let width = start.width;
  let height = start.height;
  let left = start.left;
  let top = start.top;
  if (edge.x === 1) width = Math.min(maxW, Math.max(minW, start.width + dx));
  else if (edge.x === -1) {
    width = Math.min(maxW, Math.max(minW, start.width - dx));
    left = right - width;
  }
  if (edge.y === 1) height = Math.min(maxH, Math.max(minH, start.height + dy));
  else if (edge.y === -1) {
    height = Math.min(maxH, Math.max(minH, start.height - dy));
    top = bottom - height;
  }
  return {
    left,
    top,
    width,
    height,
  };
}
function applyLiveBox(el: HTMLElement, box: ResizeBox) {
  el.style.left = `${Math.round(box.left)}px`;
  el.style.top = `${Math.round(box.top)}px`;
  el.style.width = `${Math.round(box.width)}px`;
  el.style.height = `${Math.round(box.height)}px`;
}
function itemTrackHeights(grid: HTMLElement | null) {
  const gap = grid ? parseFloat(getComputedStyle(grid).rowGap) || 16 : 16;
  return [1, 2, 3].map((n) => n * 48 + (n * 6 - 1) * gap);
}
function itemColWidths(grid: HTMLElement, cols: number) {
  const w = grid.getBoundingClientRect().width;
  const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
  const colW = cols <= 1 ? w : (w - gap * (cols - 1)) / cols;
  return [1, 2, 3].map((n) => {
    const s = Math.min(n, cols);
    return s * colW + Math.max(0, s - 1) * gap;
  });
}
type ResizeEdge = { x: number; y: number } | null;
function resizeCursor(edge: ResizeEdge) {
  if (!edge) return "";
  if (edge.x && edge.y) return edge.x === edge.y ? "nwse-resize" : "nesw-resize";
  return edge.x ? "ew-resize" : "ns-resize";
}
function resizeEdgeAt(rect: { left: number; top: number; width: number; height: number }, x: number, y: number, maxCols: number): ResizeEdge {
  const left = x - rect.left;
  const top = y - rect.top;
  const onW = maxCols > 1 && left <= RESIZE_EDGE;
  const onE = maxCols > 1 && left >= rect.width - RESIZE_EDGE;
  const onN = top <= RESIZE_EDGE;
  const onS = top >= rect.height - RESIZE_EDGE;
  if (!onW && !onE && !onN && !onS) return null;
  return {
    x: onE ? 1 : onW ? -1 : 0,
    y: onS ? 1 : onN ? -1 : 0,
  };
}
function cardResizeEdge(card: HTMLElement | null, clientX: number, clientY: number): ResizeEdge {
  if (!card) return null;
  const tools = card.querySelector(".card-corner");
  if (tools) {
    const r = tools.getBoundingClientRect();
    if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom)
      return null;
  }
  const grip = card.querySelector(".card-grip");
  if (grip) {
    const r = grip.getBoundingClientRect();
    const pad = 8;
    if (
      clientX >= r.left - pad &&
      clientX <= r.right + pad &&
      clientY >= r.top - pad &&
      clientY <= r.bottom + pad
    )
      return null;
  }
  return resizeEdgeAt(card.getBoundingClientRect(), clientX, clientY, gridColCount());
}
function hoverResizeCursor(card: HTMLElement, clientX: number, clientY: number) {
  const edge = cardResizeEdge(card, clientX, clientY);
  const cur = resizeCursor(edge);
  if ((card.dataset.resize || "") === cur) return;
  if (cur) {
    card.dataset.resize = cur;
    card.style.cursor = cur;
  } else {
    delete card.dataset.resize;
    card.style.cursor = "";
  }
}
function clearResizeCursor(card: HTMLElement | null) {
  if (!card) return;
  delete card.dataset.resize;
  card.style.cursor = "";
}
function setResizeUi(on: boolean, cursor?: string) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("is-card-resizing", on);
  document.documentElement.style.cursor = on ? cursor || "nwse-resize" : "";
}
function allowsFavorite(app: PortalApp, settings: PortalSettings | null | undefined) {
  const kind = app.kind || "app";
  if (kind === "note") return Boolean(settings?.favNotes);
  if (kind === "embed") return Boolean(settings?.favEmbeds);
  return true;
}
function itemMatches(app: PortalApp, needle: string, tags: string[], downSet: Set<string> | null | undefined) {
  if (downSet && !downSet.has(app.id)) return false;
  let extra = needle;
  const fromHash: string[] = [];
  if (extra.startsWith("#")) {
    const hashed = extra
      .slice(1)
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    fromHash.push(...hashed);
    extra = "";
  }
  const required = [...tags, ...fromHash];
  if (required.length > 0) {
    if ((app.kind || "app") !== "app") return false;
    const have = new Set((app.tags ?? []).map((x) => x.toLowerCase()));
    if (!required.every((t) => have.has(t.toLowerCase()))) return false;
  }
  if (!extra) return true;
  return `${app.title} ${app.description} ${app.url} ${app.tags.join(" ")} ${app.kind}`
    .toLowerCase()
    .includes(extra);
}
function fold(s: unknown) {
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
function copyLabel(raw: unknown, fallback?: string) {
  const text = String(raw || "").trim();
  const fb = fallback || t("copy.fallback");
  const base = (text || fb).replace(/\s*\((copie|copy)\)\s*$/i, "");
  return `${base} (${t("copy.suffix")})`.slice(0, 80);
}
function typingTarget(el: EventTarget | null) {
  if (!el || !(el instanceof Element)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return Boolean(el.closest("input, textarea, select, [contenteditable='true']"));
}
function collectTags(catalog: DocTab[] | null | undefined, tagColors: Record<string, string> | null | undefined, alpha: boolean) {
  const map = new Map<string, { name: string; count: number }>();
  for (const tab of catalog ?? [])
    for (const cat of tab.categories)
      for (const app of cat.apps) {
        if ((app.kind || "app") !== "app") continue;
        for (const tag of app.tags) {
          const key = tag.toLowerCase();
          const cur = map.get(key);
          if (cur) cur.count += 1;
          else
            map.set(key, {
              name: tag,
              count: 1,
            });
        }
      }
  for (const name of Object.keys(tagColors ?? {})) {
    const key = name.toLowerCase();
    if (!map.has(key))
      map.set(key, {
        name,
        count: 0,
      });
  }
  const rows = [...map.values()];
  if (alpha === false) return rows;
  return rows.sort((a, b) => a.name.localeCompare(b.name, localeTag(), { sensitivity: "base" }));
}
function orderedTags(names: string[] | null | undefined, alpha: boolean) {
  const list = Array.isArray(names) ? [...names] : [];
  if (alpha === false) return list;
  return list.sort((a, b) => String(a).localeCompare(String(b), localeTag(), { sensitivity: "base" }));
}
function lookupTagColor(name: string, colors: Record<string, string> | null | undefined) {
  if (!colors) return void 0;
  if (colors[name]) return remapTagHex(colors[name]);
  const key = name.toLowerCase();
  for (const [k, v] of Object.entries(colors)) if (k.toLowerCase() === key) return remapTagHex(v);
}
function tagPaint(name: string, colors: Record<string, string> | null | undefined) {
  const hex = lookupTagColor(name, colors) || defaultTagHex(name);
  return {
    tone: tagTone(name),
    style: {
      ["--tag-bg"]: hex,
      ["--tag-fg"]: tagInk(hex),
    } as CSSProperties,
  };
}
const ITEM_GRID = "item-grid";
function fmtCount(n: number) {
  return formatNumber(n);
}
function StatsBar({
  stats,
  infoBar,
  geekTip,
  downCount,
  downOn,
  probeBlink,
  onDown,
  onStats,
}: {
  stats: ClickStats | null | undefined;
  infoBar: boolean;
  geekTip?: boolean;
  downCount: number;
  downOn: boolean;
  probeBlink?: boolean;
  onDown?: () => void;
  onStats?: () => void;
}) {
  const span = Number(stats?.spanDays) || 0;
  const fullCatalog = stats?.fullCatalog !== false;
  const metrics = infoBar && fullCatalog
    ? [
        {
          key: "today",
          label: t("info.day"),
          value: stats?.today ?? 0,
          hint: t("info.today"),
        },
        span >= 1
          ? {
              key: "week",
              label: t("info.week"),
              value: stats?.week ?? 0,
              hint: t("info.last7"),
            }
          : null,
        span >= 7
          ? {
              key: "month",
              label: t("info.month"),
              value: stats?.month ?? 0,
              hint: t("info.last30"),
            }
          : null,
        span >= 30
          ? {
              key: "year",
              label: t("info.year"),
              value: stats?.year ?? 0,
              hint: t("info.last12"),
            }
          : null,
      ].filter((m): m is { key: string; label: string; value: number; hint: string } => m !== null)
    : [];
  if (!metrics.length && downCount === 0 && !onStats) return null;
  return (
    <div className="info-bar" role="status" aria-label={t("aria.information")}>
      {" "}
      <div className="info-bar-inner">
        {metrics.length || onStats ? (
          <div className="info-metrics" tabIndex={0}>
            {" "}
            <MousePointerClick className="info-click-ico" aria-hidden />
            {geekTip !== false ? (
              <span className="info-tip" role="tooltip">
                <span className="info-tip-text">
                  {t(fullCatalog ? "stats.clicksTip" : "stats.clicksTipVisible")}
                </span>
                <Smile className="info-tip-smile" aria-hidden />
              </span>
            ) : null}
            {metrics.map((m, i) => (
              <span key={m.key} className="info-metric" title={m.hint}>
                {i > 0 ? <span className="info-dot" aria-hidden /> : null}
                <b>{fmtCount(m.value)}</b> <span>{m.label}</span>
                {m.key === "year" && onStats ? (
                  <button
                    type="button"
                    className="info-stats-btn"
                    aria-label={t("stats.title")}
                    title={t("stats.topApps")}
                    onClick={(e) => {
                      e.stopPropagation();
                      onStats();
                    }}
                  >
                    {" "}
                    <BarChart3 className="size-3" />
                  </button>
                ) : null}
              </span>
            ))}
            {onStats && !metrics.some((m) => m.key === "year") ? (
              <button
                type="button"
                className="info-stats-btn"
                aria-label={t("stats.title")}
                title={t("stats.topApps")}
                onClick={onStats}
              >
                {" "}
                <BarChart3 className="size-3" />
              </button>
            ) : null}
          </div>
        ) : (
          <span />
        )}
        {downCount > 0 ? (
          <button
            type="button"
            className={`info-bar-warn ${downOn ? "is-on" : ""} ${probeBlink ? "is-blink" : ""}`}
            onClick={onDown}
            aria-pressed={downOn}
            title={downOn ? t("stats.showAll") : t("stats.showDown")}
          >
            {" "}
            <AlertTriangle className="size-3" />
            {tp("info.downCount", downCount)}
          </button>
        ) : null}
      </div>
    </div>
  );
}
function readToken() {
  if (typeof window === "undefined") return "";
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}
function readSessionInfo() {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
async function pinSessCookie(token: string | null | undefined) {
  if (!token || typeof fetch === "undefined") return;
  const res = await fetch("/__dockit/session", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({
      token,
    }),
  });
  if (!res.ok) throw new Error("errors.sessionCookieDenied");
}
async function clearSessCookie() {
  if (typeof fetch === "undefined") return;
  try {
    await fetch("/__dockit/session", {
      method: "DELETE",
      credentials: "include",
    });
  } catch {
    // ignore
  }
}
function writeSessionInfo(session: SessionInfo | null | undefined) {
  try {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}
function writeEditMode(on: boolean) {
  editArmed = on;
  try {
    if (on) sessionStorage.setItem(EDIT_MODE_KEY, "1");
    else sessionStorage.removeItem(EDIT_MODE_KEY);
  } catch {
    // ignore
  }
}
function sessionGone(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err || "");
  if (msg !== "errors.sessionExpired" && !/session expir/i.test(msg)) return false;
  try {
    window.dispatchEvent(new Event("portal-session-gone"));
  } catch {
    // ignore
  }
  return true;
}
function prettyLogin(name: unknown) {
  const s = String(name || "").trim();
  if (!s) return "";
  const lower = s.toLocaleLowerCase(localeTag());
  return lower.charAt(0).toLocaleUpperCase(localeTag()) + lower.slice(1);
}
function accountStatusLabel(loggedIn: boolean, role: string | null | undefined) {
  if (!loggedIn) return t("account.guest");
  if (role === "editeur") return t("account.editor");
  if (role === "lecteur") return t("account.viewer");
  if (role === "admin" || role === "owner") return t("account.admin");
  return t("account.member") || prettyLogin(role);
}
function AccountMenu({
  loggedIn,
  editMode,
  canEdit,
  canOpenSettings,
  canManageUsers,
  canHistory,
  canCuration,
  role,
  openFavs,
  onLogin,
  onEdit,
  onSettings,
  onHistory,
  onCuration,
  onUsers,
  onOpenFavs,
  onResetLocal,
  onLogout,
}: {
  loggedIn: boolean;
  editMode: boolean;
  canEdit: boolean;
  canOpenSettings: boolean;
  canManageUsers: boolean;
  canHistory: boolean;
  canCuration: boolean;
  role: string;
  openFavs: boolean;
  onLogin: () => void;
  onEdit: () => void;
  onSettings: () => void;
  onHistory: () => void;
  onCuration: () => void;
  onUsers: () => void;
  onOpenFavs: (on: boolean) => void;
  onResetLocal: () => void;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [open]);
  const showEdit = loggedIn && canEdit && !editMode;
  const showSettings = loggedIn && canOpenSettings;
  const showHistory = loggedIn && canHistory;
  const showUsers = loggedIn && canManageUsers;
  const showCuration = loggedIn && canCuration;
  const status = accountStatusLabel(loggedIn, role);
  const localPrefs = (
    <>
      {" "}
      <div className="menu-sep" />
      <p className="menu-kicker">{t("account.browser")}</p>
      <label className="account-check is-local">
        {" "}
        <input
          type="checkbox"
          checked={Boolean(openFavs)}
          onChange={(e) => onOpenFavs(e.target.checked)}
        />
        {t("account.openFavs")}
      </label>{" "}
      <button
        type="button"
        role="menuitem"
        className="is-local is-danger"
        onClick={async () => {
          setOpen(false);
          if (
            !(await askConfirm({
              title: t("account.resetPrefs"),
              body: t("account.resetPrefsConfirm"),
              okLabel: t("account.resetPrefs"),
            }))
          )
            return;
          onResetLocal();
        }}
      >
        {" "}
        <RotateCcw className="size-4 shrink-0" />
        {t("account.resetPrefs")}
      </button>
    </>
  );
  return (
    <div className="account-menu" ref={ref}>
      {" "}
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t("aria.account")}
        title={t("aria.account")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {" "}
        <CircleUser className={`account-ico size-4${loggedIn ? " is-on" : ""}`} />
      </Button>
      {open ? (
        <div className="account-panel" role="menu">
          {" "}
          <p className="menu-kicker">{status}</p>
          {!loggedIn ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onLogin();
              }}
            >
              {" "}
              <LogIn className="size-4 shrink-0" />
              {t("account.login")}
            </button>
          ) : null}
          {showEdit ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onEdit();
              }}
            >
              {" "}
              <Pencil className="size-4 shrink-0" />
              {t("account.edit")}
            </button>
          ) : null}
          {showSettings ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onSettings();
              }}
            >
              {" "}
              <Settings className="size-4 shrink-0" />
              {t("settings.title")}
            </button>
          ) : null}
          {showUsers ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onUsers();
              }}
            >
              {" "}
              <Users className="size-4 shrink-0" />
              {t("access.title")}
            </button>
          ) : null}
          {showHistory ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onHistory();
              }}
            >
              {" "}
              <History className="size-4 shrink-0" />
              {t("history.title")}
            </button>
          ) : null}
          {showCuration ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onCuration();
              }}
            >
              {" "}
              <ScanSearch className="size-4 shrink-0" />
              {t("curation.title")}
            </button>
          ) : null}
          {loggedIn && (showEdit || showSettings || showHistory || showUsers || showCuration) ? (
            <div className="menu-sep" />
          ) : null}
          {loggedIn ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
            >
              {" "}
              <LogOut className="size-4 shrink-0" />
              {t("account.logout")}
            </button>
          ) : null}
          {localPrefs}
        </div>
      ) : null}
    </div>
  );
}
type DragKind = "tab" | "cat" | "app";
type DragState = { kind: DragKind; id: string } | null;
type OverState =
  | { kind: "tab"; insertAt: number }
  | { kind: "cat"; insertAt: number }
  | { kind: "app"; catId: string; insertAt: number }
  | { kind: "tab-carry"; tabId: string }
  | null;
type DragFoldState = { sourceId: string | undefined; left: boolean; openId: string | null } | null;
type TabHoverState = { tabId: string; at: number } | null;
type CatHoverState = { catId: string; at: number } | null;
type MoreHoverState = { at: number } | null;
type CarryState = { app?: PortalApp; fromTabId: string; cat?: PortalCategory | null } | null;
type ResizeLiveState = { origin: HTMLElement; placeholder: HTMLElement | null } | null;
type ModalState = { kind: string; [key: string]: unknown };
type AccessPayload = {
  restricted?: boolean;
  viewers?: string[];
  editors?: string[];
  hideLabel?: boolean;
};
type CardFormPayload = {
  categoryId: string;
  kind: ItemKind;
  title: string;
  description: string;
  url: string;
  icon: string;
  tags: string[];
  colSpan: 1 | 2 | 3;
  rowSpan: 1 | 2 | 3;
  check?: CheckMode;
  checkHost?: string;
  links?: { title: string; url: string; openIn?: "_blank" | "_self" }[];
  linkMenu?: boolean;
  embedBorder?: boolean;
  embedBg?: string;
  tagColors?: Record<string, string>;
};
function Home() {
  const initial: PortalData = Route.useLoaderData();
  const [data, setData] = useState<PortalData>(initial);
  applyDisplayPrefs(data.settings);
  const [editMode, setEditMode] = useState(false);
  const [token, setToken] = useState("");
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [hideDevBanner, setHideDevBanner] = useState(false);
  const [hideNoPassBanner, setHideNoPassBanner] = useState(false);
  const [modal, setModal] = useState<ModalState>({
    kind: "none",
  });
  const adminTabRef = useRef("general");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [tagHi, setTagHi] = useState(0);
  const [downFilter, setDownFilter] = useState(false);
  const [clickStats, setClickStats] = useState<ClickStats>(
    initial.clickStats || {
      all: 0,
      today: 0,
      week: 0,
      month: 0,
      year: 0,
      spanDays: 0,
      fullCatalog: true,
    },
  );
  const [ui, setUi] = useState(DEFAULT_UI_PREFS);
  const [page, setPage] = useState("tab");
  const [health, setHealth] = useState<Record<string, ProbeResult>>({});
  const healthBusy = useRef(false);
  const [drag, setDrag] = useState<DragState>(null);
  const [over, setOver] = useState<OverState>(null);
  const [dragFold, setDragFold] = useState<DragFoldState>(null);
  const [tabOverflow, setTabOverflow] = useState<string[]>([]);
  const [moreOpen, setMoreOpen] = useState(false);
  const [tabOverMore, setTabOverMore] = useState(false);
  const dragRef = useRef(drag);
  const overRef = useRef(over);
  const didDragRef = useRef(false);
  const dataRef = useRef(data);
  const searchRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef(modal);
  const editModeRef = useRef(editMode);
  const sessionRef = useRef(session);
  const queryRef = useRef(query);
  const pageRef = useRef(page);
  const tokenRef = useRef(token);
  const hotkeysRef = useRef({
    requestEdit: () => {},
    openNewCard: () => {},
    focusSearch: (_extra?: string) => {},
  });
  const tabListRef = useRef<HTMLDivElement>(null);
  const tabStripRef = useRef<HTMLDivElement>(null);
  const tabMoreRef = useRef<HTMLDivElement>(null);
  const morePanelRef = useRef<HTMLDivElement>(null);
  const tabWidthRef = useRef(new Map<string, number>());
  const moreOpenRef = useRef(false);
  const tabOverMoreRef = useRef(false);
  const moreHoverRef = useRef<MoreHoverState>(null);
  const tabInsertRef = useRef(0);
  const activeTabRef = useRef(data.activeTabId);
  const dragOriginRef = useRef<{ x: number; y: number } | null>(null);
  const ghostRef = useRef<HTMLElement | null>(null);
  const markerRef = useRef<HTMLElement | null>(null);
  const carryRef = useRef<CarryState>(null);
  const tabHoverRef = useRef<TabHoverState>(null);
  const catHoverRef = useRef<CatHoverState>(null);
  const dragFoldRef = useRef<DragFoldState>(null);
  const dragPtrRef = useRef({
    x: 0,
    y: 0,
  });
  const dragScrollRafRef = useRef(0);
  const ghostOff = useRef({
    x: 0,
    y: 0,
  });
  const unbindDragRef = useRef<(() => void) | null>(null);
  const resizeLiveRef = useRef<ResizeLiveState>(null);
  dragRef.current = drag;
  overRef.current = over;
  dataRef.current = data;
  modalRef.current = modal;
  editModeRef.current = editMode;
  sessionRef.current = session;
  queryRef.current = query;
  pageRef.current = page;
  tokenRef.current = token;
  activeTabRef.current = data.activeTabId;
  function unbindDrag() {
    unbindDragRef.current?.();
    unbindDragRef.current = null;
  }
  function endLiveResize() {
    const live = resizeLiveRef.current;
    if (!live) return;
    resizeLiveRef.current = null;
    live.placeholder?.remove();
    const el = live.origin;
    if (!el) return;
    el.classList.remove("is-live-resize");
    el.style.left = "";
    el.style.top = "";
    el.style.width = "";
    el.style.height = "";
  }
  function stopDragScroll() {
    if (dragScrollRafRef.current) cancelAnimationFrame(dragScrollRafRef.current);
    dragScrollRafRef.current = 0;
  }
  function startDragScroll() {
    if (dragScrollRafRef.current) return;
    const loop = () => {
      dragScrollRafRef.current = 0;
      if (!dragRef.current) return;
      nudgeScroll(dragPtrRef.current.x, dragPtrRef.current.y, tabListRef.current);
      dragScrollRafRef.current = requestAnimationFrame(loop);
    };
    dragScrollRafRef.current = requestAnimationFrame(loop);
  }
  function clearCarry() {
    carryRef.current = null;
    tabHoverRef.current = null;
    catHoverRef.current = null;
    dragFoldRef.current = null;
    stopDragScroll();
    setDragFold(null);
  }
  function canEditTabId(tabId: string) {
    const sess = sessionRef.current;
    if (!sess) return false;
    if (sess.role === "admin") return true;
    return sess.tabPerms?.[tabId] === "edit";
  }
  function hitMoreSlot(clientX: number, clientY: number) {
    const pad = 12;
    const panel = morePanelRef.current;
    const wrap = tabMoreRef.current;
    if (panel) {
      const r = panel.getBoundingClientRect();
      const w = wrap?.getBoundingClientRect();
      const left = Math.min(r.left, w?.left ?? r.left) - pad;
      const right = Math.max(r.right, w?.right ?? r.right) + pad;
      const top = Math.min(r.top, w?.top ?? r.top) - pad;
      if (
        clientX >= left &&
        clientX <= right &&
        clientY >= top &&
        clientY <= r.bottom + pad
      )
        return true;
    }
    if (wrap) {
      const r = wrap.getBoundingClientRect();
      if (
        clientX >= r.left - pad &&
        clientX <= r.right + 28 &&
        clientY >= r.top - pad &&
        clientY <= r.bottom + (moreOpenRef.current ? 8 : 56)
      )
        return true;
    }
    return false;
  }
  function hitTabCarry(clientX: number, clientY: number): { tabId: string; blocked: boolean } | null {
    const stack = document.elementsFromPoint(clientX, clientY);
    for (const node of stack) {
      if (!(node instanceof HTMLElement)) continue;
      if (node === ghostRef.current) continue;
      const el = node.closest("[data-tab-id]");
      const tabId = (el as HTMLElement | null)?.dataset?.tabId;
      if (!tabId) continue;
      if (!canEditTabId(tabId))
        return {
          tabId,
          blocked: true,
        };
      return {
        tabId,
        blocked: false,
      };
    }
    return null;
  }
  function overForCarry(tabId: string): OverState {
    const cur = dataRef.current;
    const cats =
      (cur.catalog ?? []).find((t) => t.id === tabId)?.categories ||
      (tabId === cur.activeTabId ? cur.categories : []);
    const cat = cats[0];
    const appId = carryRef.current?.app?.id;
    if (!cat)
      return {
        kind: "tab-carry",
        tabId,
      };
    return {
      kind: "app",
      catId: cat.id,
      insertAt: cat.apps.filter((a) => a.id !== appId).length,
    };
  }
  function overForCarryCat(tabId: string): OverState {
    const cur = dataRef.current;
    const cats =
      (cur.catalog ?? []).find((t) => t.id === tabId)?.categories ||
      (tabId === cur.activeTabId ? cur.categories : []);
    return {
      kind: "cat",
      insertAt: cats.filter((c) => c.id !== dragRef.current?.id).length,
    };
  }
  function killGhost() {
    ghostRef.current?.remove();
    ghostRef.current = null;
    markerRef.current?.remove();
    markerRef.current = null;
  }
  function spawnGhost(from: HTMLElement, e: { clientX: number; clientY: number }, rect?: DOMRect) {
    ghostRef.current?.remove();
    const r = rect || from.getBoundingClientRect();
    const node = from.cloneNode(true) as HTMLElement;
    node.removeAttribute("data-app-id");
    node.removeAttribute("data-cat-id");
    node.removeAttribute("data-tab-id");
    node.classList.add("drag-ghost");
    node.style.position = "fixed";
    node.style.left = `${r.left}px`;
    node.style.top = `${r.top}px`;
    node.style.width = `${r.width}px`;
    node.style.height = `${r.height}px`;
    node.style.maxHeight = `${r.height}px`;
    node.style.margin = "0";
    node.style.zIndex = "80";
    node.style.pointerEvents = "none";
    document.body.appendChild(node);
    ghostRef.current = node;
    ghostOff.current = {
      x: e.clientX - r.left,
      y: e.clientY - r.top,
    };
  }
  function moveGhost(x: number, y: number) {
    const node = ghostRef.current;
    if (!node) return;
    node.style.left = `${x - ghostOff.current.x}px`;
    node.style.top = `${y - ghostOff.current.y}px`;
  }
  function finishAppDrag(ev?: { clientX: number; clientY: number }) {
    const x = ev?.clientX ?? dragPtrRef.current.x;
    const y = ev?.clientY ?? dragPtrRef.current.y;
    const tabHit = hitTabCarry(x, y);
    if (tabHit?.blocked) {
      unbindDrag();
      if (didDragRef.current) swallowGhostClick();
      killGhost();
      const from = carryRef.current?.fromTabId;
      clearCarry();
      setDrag(null);
      setOver(null);
      setDragUi(false);
      if (from && from !== dataRef.current.activeTabId) goTab(from);
      toast.error(t("toast.noEditTab"));
      return;
    }
    if (tabHit?.tabId) {
      unbindDrag();
      if (didDragRef.current) swallowGhostClick();
      killGhost();
      const from = carryRef.current?.fromTabId;
      clearCarry();
      setDrag(null);
      setOver(null);
      setDragUi(false);
      if (from && from !== dataRef.current.activeTabId) goTab(from);
      return;
    }
    unbindDrag();
    if (didDragRef.current) swallowGhostClick();
    commitDrag();
  }
  function bindTabDrag(tabId: string, origin: HTMLElement | null) {
    unbindDrag();
    const move = (ev: PointerEvent) => {
      if (dragRef.current?.kind !== "tab" || dragRef.current.id !== tabId) return;
      const o = dragOriginRef.current;
      if ((o ? Math.hypot(ev.clientX - o.x, ev.clientY - o.y) : 0) > 10 && !didDragRef.current) {
        didDragRef.current = true;
        setDragUi(true);
        if (origin) {
          spawnGhost(origin, ev);
          if (ghostRef.current) ghostRef.current.style.zIndex = "95";
        }
        if (tabOverflow.length) setMoreOpen(true);
      }
      if (!didDragRef.current) return;
      dragPtrRef.current = {
        x: ev.clientX,
        y: ev.clientY,
      };
      moveGhost(ev.clientX, ev.clientY);
      const row = tabListRef.current?.getBoundingClientRect();
      const more = tabMoreRef.current?.getBoundingClientRect();
      const overBar =
        row &&
        ev.clientY >= row.top - 8 &&
        ev.clientY <= row.bottom + 8 &&
        ev.clientX >= row.left &&
        ev.clientX < (more ? more.left - 8 : row.right);
      if (overBar) {
        const dragTab = dragRef.current;
        const stripTabs = tabListRef.current
          ? [...tabListRef.current.querySelectorAll<HTMLElement>(".tab-item[data-tab-id]")].filter(
              (el) => !el.classList.contains("is-overflow") && el.offsetWidth,
            )
          : [];
        const last = stripTabs[stripTabs.length - 1];
        const atEnd =
          dragTab?.kind === "tab" && last
            ? ev.clientX >= last.getBoundingClientRect().right + 8
            : false;
        if (atEnd && dragTab && tabOverflow.includes(dragTab.id)) {
          tabOverMoreRef.current = true;
          setTabOverMore(true);
        } else {
          tabOverMoreRef.current = false;
          setTabOverMore(false);
        }
      } else {
        const inMore = hitMoreSlot(ev.clientX, ev.clientY);
        if (inMore) {
          setMoreOpen(true);
          tabOverMoreRef.current = true;
          setTabOverMore(true);
        }
      }
      const insertAt = tabInsertAt(
        ev.clientX,
        ev.clientY,
        tabId,
        tabOverMoreRef.current,
      );
      tabInsertRef.current = insertAt;
      setOver((cur) =>
        cur?.kind === "tab" && cur.insertAt === insertAt
          ? cur
          : {
              kind: "tab",
              insertAt,
            },
      );
    };
    const up = () => {
      unbindDrag();
      endTabPointer(tabId, didDragRef.current);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, {
      once: true,
    });
    window.addEventListener("pointercancel", up, {
      once: true,
    });
    unbindDragRef.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }
  function openMoveCat(
    category: PortalCategory,
    fromTabId: string | undefined,
    destTabId: string,
    insertAt: number | undefined,
  ) {
    setBusy(true);
    previewMoveCategory({
      data: {
        token: tokenRef.current,
        categoryId: category.id,
        destTabId,
      },
    })
      .then((impact: CategoryMoveImpact & { insertAt?: number }) =>
        setModal({
          kind: "move-cat",
          impact: {
            ...impact,
            insertAt: typeof insertAt === "number" ? insertAt : impact.insertAt,
          },
        }),
      )
      .catch((err) => {
        if (!sessionGone(err)) toast.error(te(err));
      })
      .finally(() => setBusy(false));
  }
  function bindCatDrag(catId: string, origin: HTMLElement) {
    unbindDrag();
    const ghostRect = origin.getBoundingClientRect();
    const ghostNode = origin.cloneNode(true) as HTMLElement;
    const move = (ev: PointerEvent) => {
      if (dragRef.current?.kind !== "cat" || dragRef.current.id !== catId) return;
      dragPtrRef.current = {
        x: ev.clientX,
        y: ev.clientY,
      };
      const o = dragOriginRef.current;
      if ((o ? Math.hypot(ev.clientX - o.x, ev.clientY - o.y) : 0) > 10 && !didDragRef.current) {
        didDragRef.current = true;
        setDragUi(true);
        spawnGhost(ghostNode, ev, ghostRect);
        startDragScroll();
      }
      if (!didDragRef.current) return;
      nudgeScroll(ev.clientX, ev.clientY, tabListRef.current);
      moveGhost(ev.clientX, ev.clientY);
      const tabHit = hitTabCarry(ev.clientX, ev.clientY);
      const moreHit = hitMoreSlot(ev.clientX, ev.clientY);
      if (moreHit && !tabHit) {
        const hover = moreHoverRef.current;
        if (!hover) moreHoverRef.current = { at: Date.now() };
        else if (Date.now() - hover.at > 320) setMoreOpen(true);
        return;
      }
      if (tabHit && !tabHit.blocked) {
        setOver({
          kind: "tab-carry",
          tabId: tabHit.tabId,
        });
        if (tabHit.tabId !== dataRef.current.activeTabId) {
          const hover = tabHoverRef.current;
          if (!hover || hover.tabId !== tabHit.tabId)
            tabHoverRef.current = {
              tabId: tabHit.tabId,
              at: Date.now(),
            };
          else if (Date.now() - hover.at > 320) {
            goTab(tabHit.tabId);
            setMoreOpen(false);
            setOver(overForCarryCat(tabHit.tabId));
            tabHoverRef.current = {
              tabId: tabHit.tabId,
              at: Number.POSITIVE_INFINITY,
            };
          }
        }
        return;
      }
      tabHoverRef.current = null;
      moreHoverRef.current = null;
      if (moreOpenRef.current && !moreHit) setMoreOpen(false);
      const insertAt = hitCatInsert(ev.clientY, catId);
      setOver((cur) =>
        cur?.kind === "cat" && cur.insertAt === insertAt
          ? cur
          : {
              kind: "cat",
              insertAt,
            },
      );
    };
    const up = (ev: PointerEvent) => {
      unbindDrag();
      killGhost();
      if (!didDragRef.current) {
        setDrag(null);
        setOver(null);
        setDragUi(false);
        clearCarry();
        return;
      }
      swallowGhostClick();
      const from = carryRef.current?.fromTabId;
      const cat =
        carryRef.current?.cat || dataRef.current.categories.find((c) => c.id === catId);
      const tabHit = hitTabCarry(ev.clientX, ev.clientY);
      if (tabHit?.blocked) {
        setDrag(null);
        setOver(null);
        setDragUi(false);
        if (from && from !== dataRef.current.activeTabId) goTab(from);
        clearCarry();
        toast.error(t("toast.noEditTab"));
        return;
      }
      const destTabId =
        tabHit?.tabId && tabHit.tabId !== from
          ? tabHit.tabId
          : from && dataRef.current.activeTabId !== from
            ? dataRef.current.activeTabId
            : null;
      const insertAt = overRef.current?.kind === "cat" ? overRef.current.insertAt : undefined;
      if (destTabId && cat) {
        setDrag(null);
        setOver(null);
        setDragUi(false);
        clearCarry();
        openMoveCat(cat, from, destTabId, insertAt);
        return;
      }
      clearCarry();
      commitDrag();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, {
      once: true,
    });
    window.addEventListener("pointercancel", up, {
      once: true,
    });
    unbindDragRef.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }
  function bindAppDrag(appId: string, origin: HTMLElement) {
    unbindDrag();
    const sourceCatId =
      origin.closest<HTMLElement>("[data-cat-id]")?.dataset?.catId ||
      dataRef.current.categories.find((c) => c.apps.some((a) => a.id === appId))?.id;
    const move = (ev: PointerEvent) => {
      if (dragRef.current?.kind !== "app" || dragRef.current.id !== appId) return;
      dragPtrRef.current = {
        x: ev.clientX,
        y: ev.clientY,
      };
      const o = dragOriginRef.current;
      if ((o ? Math.hypot(ev.clientX - o.x, ev.clientY - o.y) : 0) > 8 && !didDragRef.current) {
        didDragRef.current = true;
        setDragUi(true);
        spawnGhost(origin, ev);
        startDragScroll();
      }
      if (!didDragRef.current) return;
      nudgeScroll(ev.clientX, ev.clientY, tabListRef.current);
      moveGhost(ev.clientX, ev.clientY);
      const tabHit = hitTabCarry(ev.clientX, ev.clientY);
      const moreHit = hitMoreSlot(ev.clientX, ev.clientY);
      if (moreHit && !tabHit) {
        const hover = moreHoverRef.current;
        if (!hover) moreHoverRef.current = { at: Date.now() };
        else if (Date.now() - hover.at > 320) setMoreOpen(true);
        return;
      }
      if (tabHit && !tabHit.blocked) {
        setOver({
          kind: "tab-carry",
          tabId: tabHit.tabId,
        });
        if (tabHit.tabId !== dataRef.current.activeTabId) {
          const hover = tabHoverRef.current;
          if (!hover || hover.tabId !== tabHit.tabId)
            tabHoverRef.current = {
              tabId: tabHit.tabId,
              at: Date.now(),
            };
          else if (Date.now() - hover.at > 320) {
            const dest = (dataRef.current.catalog ?? []).find((t) => t.id === tabHit.tabId);
            if (!dest?.categories?.length) {
              toast.error(t("toast.needCategory"));
              tabHoverRef.current = {
                tabId: tabHit.tabId,
                at: Number.POSITIVE_INFINITY,
              };
              return;
            }
            goTab(tabHit.tabId);
            setMoreOpen(false);
            setOver(overForCarry(tabHit.tabId));
            tabHoverRef.current = {
              tabId: tabHit.tabId,
              at: Number.POSITIVE_INFINITY,
            };
            if (dataRef.current.settings.cardDragCollapse !== false) {
              dragFoldRef.current = {
                sourceId: sourceCatId,
                left: true,
                openId: null,
              };
              setDragFold({
                sourceId: sourceCatId,
                left: true,
                openId: null,
              });
              catHoverRef.current = null;
            }
          }
        }
        return;
      }
      tabHoverRef.current = null;
      moreHoverRef.current = null;
      if (moreOpenRef.current && !moreHit) setMoreOpen(false);
      if (
        dataRef.current.settings.cardDragCollapse !== false &&
        sourceCatId &&
        (dataRef.current.categories || []).length > 1
      ) {
        if (!dragFoldRef.current)
          dragFoldRef.current = {
            sourceId: sourceCatId,
            left: false,
            openId: sourceCatId,
          };
        let overCatId: string | null = null;
        for (const node of document.elementsFromPoint(ev.clientX, ev.clientY)) {
          if (!(node instanceof HTMLElement)) continue;
          if (node === ghostRef.current || node === markerRef.current) continue;
          const s = node.closest<HTMLElement>("[data-cat-id]");
          if (s?.dataset?.catId) {
            overCatId = s.dataset.catId;
            break;
          }
        }
        const fold = dragFoldRef.current!;
        if (!fold.left) {
          if (overCatId && overCatId !== sourceCatId) {
            const next = {
              sourceId: sourceCatId,
              left: true,
              openId: null,
            };
            dragFoldRef.current = next;
            setDragFold(next);
            catHoverRef.current = {
              catId: overCatId,
              at: Date.now(),
            };
          }
        } else if (overCatId) {
          const hover = catHoverRef.current;
          if (!hover || hover.catId !== overCatId)
            catHoverRef.current = {
              catId: overCatId,
              at: Date.now(),
            };
          else if (Date.now() - hover.at > 320 && fold.openId !== overCatId) {
            const next = {
              ...fold,
              openId: overCatId,
            };
            dragFoldRef.current = next;
            setDragFold(next);
            catHoverRef.current = {
              catId: overCatId,
              at: Number.POSITIVE_INFINITY,
            };
          }
        } else catHoverRef.current = null;
      }
      const hit = hitAppInsert(ev.clientX, ev.clientY, appId);
      if (!hit) return;
      const cur = overRef.current;
      if (cur?.kind === "app" && cur.catId === hit.catId && cur.insertAt === hit.insertAt) return;
      setOver(hit);
    };
    const up = (ev: PointerEvent) => finishAppDrag(ev);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, {
      once: true,
    });
    window.addEventListener("pointercancel", up, {
      once: true,
    });
    unbindDragRef.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }
  function bindAppResize(app: PortalApp, origin: HTMLElement, edge: { x: number; y: number }, ev: { clientX: number; clientY: number; pointerId: number }) {
    unbindDrag();
    endLiveResize();
    const grid = origin.closest<HTMLElement>("[data-app-grid]");
    const maxCols = gridColCount();
    const startPtr = {
      x: ev.clientX,
      y: ev.clientY,
    };
    const startRect = origin.getBoundingClientRect();
    const start = {
      left: startRect.left,
      top: startRect.top,
      width: startRect.width,
      height: startRect.height,
    };
    const startCol = spanSize(app.colSpan);
    const startRow = spanSize(app.rowSpan);
    const widths = grid
      ? itemColWidths(grid, maxCols)
      : [start.width, start.width, start.width];
    const heights = itemTrackHeights(grid);
    let box = {
      ...start,
    };
    let liveCol: number = startCol;
    let liveRow: number = startRow;
    const slot = document.createElement("div");
    slot.className = `resize-slot drop-slot ${itemSpanClass(app)}`;
    slot.setAttribute("data-resize-slot", "");
    const slotLab = document.createElement("span");
    slotLab.className = "drop-slot-label";
    slotLab.textContent = t("nav.dropHere");
    slot.appendChild(slotLab);
    origin.after(slot);
    origin.classList.add("is-live-resize");
    applyLiveBox(origin, start);
    resizeLiveRef.current = {
      origin,
      placeholder: slot,
    };
    const cursor = resizeCursor(edge);
    writeEditMode(true);
    setResizeUi(true, cursor);
    try {
      origin.setPointerCapture?.(ev.pointerId);
    } catch {
      // ignore
    }
    const paintSlot = (col: number, row: number) => {
      slot.className = `resize-slot drop-slot ${itemSpanClass({
        colSpan: col,
        rowSpan: row,
      })}`;
    };
    const move = (e: PointerEvent) => {
      e.preventDefault();
      box = liveResizeBox(
        start,
        edge,
        e.clientX - startPtr.x,
        e.clientY - startPtr.y,
        widths,
        heights,
        maxCols,
      );
      applyLiveBox(origin, box);
      const col = edge.x ? nearestSpan(widths, box.width, maxCols) : startCol;
      const row = edge.y ? nearestSpan(heights, box.height, 3) : startRow;
      if (col === liveCol && row === liveRow) return;
      liveCol = col;
      liveRow = row;
      paintSlot(col, row);
    };
    const up = () => {
      unbindDrag();
      const col = edge.x ? nearestSpan(widths, box.width, maxCols) : startCol;
      const row = edge.y ? nearestSpan(heights, box.height, 3) : startRow;
      endLiveResize();
      setResizeUi(false);
      if (col === startCol && row === startRow) return;
      persistAppSpan(app, col as 1 | 2 | 3, row as 1 | 2 | 3);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, {
      once: true,
    });
    window.addEventListener("pointercancel", up, {
      once: true,
    });
    unbindDragRef.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      try {
        origin.releasePointerCapture?.(ev.pointerId);
      } catch {
        // ignore
      }
    };
  }
  function persistAppSpan(app: PortalApp, colSpan: 1 | 2 | 3, rowSpan: 1 | 2 | 3) {
    const current = dataRef.current;
    const categoryId =
      app.categoryId || current.categories.find((c) => c.apps.some((a) => a.id === app.id))?.id;
    if (!categoryId) return;
    if (spanSize(app.colSpan) === colSpan && spanSize(app.rowSpan) === rowSpan) return;
    const snapshot = current.categories;
    const nextCats = current.categories.map((c) => ({
      ...c,
      apps: c.apps.map((a) =>
        a.id === app.id
          ? {
              ...a,
              colSpan,
              rowSpan,
            }
          : a,
      ),
    }));
    setData({
      ...current,
      categories: nextCats,
    });
    updateApp({
      data: {
        token: tokenRef.current,
        id: app.id,
        categoryId,
        kind: app.kind || "app",
        title: app.title || "",
        description: app.description || "",
        url: app.url || "",
        icon: app.icon || "Link",
        tags: app.tags || [],
        colSpan,
        rowSpan,
        check: app.check || "off",
        checkHost: app.checkHost || "",
        links: app.links || [],
      },
    })
      .then((next) => {
        setData(next);
        stayEditing();
      })
      .catch((err) => {
        if (!sessionGone(err)) toast.error(te(err));
        setData({
          ...current,
          categories: snapshot,
        });
        stayEditing();
      });
  }
  useEffect(() => {
    const t = readToken();
    setToken(t);
    const saved = readSessionInfo();
    if (saved) setSession(saved);
    getPortal({
      data: t
        ? {
            token: t,
          }
        : {},
    })
      .then((next) => {
        setData(next);
        if (next.session) {
          setSession(next.session);
          writeSessionInfo(next.session);
          try {
            const jump = sessionStorage.getItem(OIDC_NEXT_KEY);
            if (jump) {
              sessionStorage.removeItem(OIDC_NEXT_KEY);
              if (jump === "admin")
                setModal({
                  kind: "admin",
                  tab: next.session.canManageSettings
                    ? "general"
                    : next.session.canManageUsers
                      ? "users"
                      : "about",
                });
              else if (jump === "history" && next.session.canEdit)
                setModal({
                  kind: "history",
                  tab: "recovery",
                });
              else if (jump === "edit" && next.session.canEdit) setEditMode(true);
            }
          } catch {
            // ignore
          }
        } else {
          setToken("");
          setSession(null);
          writeSessionInfo(null);
          exitEdit();
          try {
            sessionStorage.removeItem(TOKEN_KEY);
          } catch {
            // ignore
          }
        }
      })
      .catch(() => void 0);
    try {
      if (t && (editArmed || sessionStorage.getItem(EDIT_MODE_KEY) === "1")) setEditMode(true);
    } catch {
      // ignore
    }
    const forceIdle = () => {
      unbindDragRef.current?.();
      unbindDragRef.current = null;
      ghostRef.current?.remove();
      ghostRef.current = null;
      markerRef.current?.remove();
      markerRef.current = null;
      didDragRef.current = false;
      dragRef.current = null;
      overRef.current = null;
      carryRef.current = null;
      tabHoverRef.current = null;
      if (dragScrollRafRef.current) cancelAnimationFrame(dragScrollRafRef.current);
      dragScrollRafRef.current = 0;
      setDrag(null);
      setOver(null);
      setDragUi(false);
      document.documentElement.classList.remove("is-dragging");
      const live = resizeLiveRef.current;
      resizeLiveRef.current = null;
      live?.placeholder?.remove();
      if (live?.origin) {
        live.origin.classList.remove("is-live-resize");
        live.origin.style.left = "";
        live.origin.style.top = "";
        live.origin.style.width = "";
        live.origin.style.height = "";
      }
      setResizeUi(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === "Escape" &&
        (dragRef.current ||
          document.documentElement.classList.contains("is-dragging") ||
          document.documentElement.classList.contains("is-card-resizing"))
      )
        forceIdle();
    };
    const onHide = () => {
      if (document.hidden) forceIdle();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", forceIdle);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", forceIdle);
      document.removeEventListener("visibilitychange", onHide);
      forceIdle();
    };
  }, []);
  useEffect(() => {
    const block = (e: Event) => {
      if (dragRef.current || document.documentElement.classList.contains("is-card-resizing"))
        e.preventDefault();
    };
    document.addEventListener("selectstart", block);
    return () => document.removeEventListener("selectstart", block);
  }, []);
  useEffect(() => {
    const prefs = readUiPrefs();
    setUi(prefs);
    if (prefs.openFavs) setPage("favs");
  }, []);
  useEffect(() => {
    setHideDevBanner(false);
    setHideNoPassBanner(false);
  }, [token, session?.username]);
  function enterEdit() {
    writeEditMode(true);
    setEditMode(true);
  }
  function exitEdit() {
    didDragRef.current = false;
    writeEditMode(false);
    setEditMode(false);
  }
  async function tryProxyAuth() {
    try {
      if (sessionStorage.getItem("proxy-auth-tried")) return;
      sessionStorage.setItem("proxy-auth-tried", "1");
    } catch {
      return;
    }
    try {
      const res = await proxyLogin({ data: {} });
      setToken(res.token);
      setSession(res.session);
      writeSessionInfo(res.session);
      try {
        sessionStorage.removeItem("proxy-auth-tried");
      } catch {
        // ignore
      }
      const next = await getPortal({
        data: { token: res.token, tabId: data.activeTabId },
      });
      setData(next);
    } catch {
      // no header / disabled — the lock screen remains
    }
  }
  const proxyAuthHint = Boolean(data.settings.proxyAuthEnabled);
  useEffect(() => {
    if (!proxyAuthHint) return;
    if (tokenRef.current || sessionRef.current || readToken()) return;
    void tryProxyAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- silent SSO attempt once per tab on mount
  }, [proxyAuthHint]);
  function requestLogin() {
    if (sessionRef.current || tokenRef.current || readToken()) return;
    if (proxyAuthHint) {
      let tried = false;
      try {
        tried = !sessionStorage.getItem("proxy-auth-tried");
      } catch {
        tried = false;
      }
      if (tried) {
        void tryProxyAuth().then(() => {
          if (sessionRef.current || tokenRef.current) return;
          setModal({
            kind: "lock",
            next: "session",
          });
        });
        return;
      }
    }
    setModal({
      kind: "lock",
      next: "session",
    });
  }
  function requestEdit() {
    didDragRef.current = false;
    if (editModeRef.current) {
      exitEdit();
      return;
    }
    const sess = sessionRef.current || readSessionInfo();
    if (sess && !sess.canEdit) {
      toast.error(t("toast.readonly"));
      return;
    }
    if (sess?.canEdit || tokenRef.current || readToken()) {
      enterEdit();
      return;
    }
    setModal({
      kind: "lock",
      next: "edit",
    });
  }
  function stayEditing() {
    if (editArmed) setEditMode(true);
  }
  function requestAdmin(tab: string) {
    adminTabRef.current = tab;
    const sess = sessionRef.current;
    if (sess) {
      const next = sess.canManageSettings ? tab : "about";
      setModal({
        kind: "admin",
        tab: next,
      });
      return;
    }
    setModal({
      kind: "lock",
      next: "admin",
    });
  }
  function requestHistory() {
    const sess = sessionRef.current || readSessionInfo();
    if (!sess?.canAudit && !sess?.canRestore) {
      toast.error(t("toast.readonly"));
      return;
    }
    setModal({
      kind: "history",
      tab: sess.canRestore ? "recovery" : "audit",
    });
  }
  function requestUsers() {
    const sess = sessionRef.current || readSessionInfo();
    if (!sess?.canManageUsers) {
      setModal({
        kind: "lock",
        next: "users",
      });
      return;
    }
    setModal({
      kind: "users",
    });
  }
  function requestCuration() {
    const sess = sessionRef.current || readSessionInfo();
    if (!sess) {
      setModal({
        kind: "lock",
        next: "curation",
      });
      return;
    }
    if (!sess.canCuration) {
      toast.error(t("toast.readonly"));
      return;
    }
    setModal({
      kind: "curation",
    });
  }
  function clearAuth() {
    void clearSessCookie();
    try {
      sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      // ignore
    }
    writeSessionInfo(null);
    setToken("");
    setSession(null);
    exitEdit();
    setModal({
      kind: "none",
    });
    setBusy(false);
  }
  function logoutEdit() {
    clearAuth();
    toast.success(t("toast.loggedOut"));
    getPortal({
      data: {},
    })
      .then(setData)
      .catch(() => void 0);
  }
  function expireSession() {
    if (!readToken() && !readSessionInfo()) return;
    clearAuth();
    toast.error(t("toast.sessionExpired"));
    getPortal({
      data: {},
    })
      .then(setData)
      .catch(() => void 0);
  }
  useEffect(() => {
    const onGone = () => expireSession();
    window.addEventListener("portal-session-gone", onGone);
    return () => window.removeEventListener("portal-session-gone", onGone);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- event-listener-only effect; expireSession is stable per render
  }, []);
  useEffect(() => {
    if (!token && !session) return;
    const exp = Number(session?.exp) || 0;
    let timer = 0;
    if (exp) {
      const wait = Math.max(0, exp - Date.now());
      timer = window.setTimeout(() => expireSession(), Math.min(wait, 2147483647));
    }
    const check = () => {
      if (exp && Date.now() >= exp) {
        expireSession();
        return;
      }
      getPortal({
        data: {
          token,
        },
      })
        .then((next) => {
          if (!readToken() && !readSessionInfo()) return;
          if (!next.session) expireSession();
          else {
            setSession(next.session);
            writeSessionInfo(next.session);
          }
        })
        .catch((err) => {
          if (sessionGone(err)) return;
        });
    };
    const onFocus = () => {
      if (!document.hidden) check();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      if (timer) window.clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- poller keyed on token/expiry on purpose; reads latest via refs
  }, [token, session?.exp]);
  async function apply(fn: () => Promise<PortalData>, opts?: { close?: boolean; onDone?: () => void }) {
    setBusy(true);
    try {
      const next = await Promise.race([
        fn(),
        new Promise<never>((_, reject) => {
          window.setTimeout(() => reject(new Error("errors.timeout")), 12e3);
        }),
      ]);
      setData(next);
      if (next.session) {
        setSession(next.session);
        writeSessionInfo(next.session);
      }
      if (opts?.close !== false)
        setModal({
          kind: "none",
        });
      opts?.onDone?.();
    } catch (err) {
      if (sessionGone(err)) return;
      toast.error(te(err));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.key === "Dead") return;
      if (modalRef.current?.kind && modalRef.current.kind !== "none") return;
      const mod = e.ctrlKey || e.metaKey;
      const code = e.code;
      const letter = (e.key || "").toLowerCase();
      if (mod && !e.altKey && !e.shiftKey) {
        if (code === "KeyE" || letter === "e") {
          e.preventDefault();
          e.stopPropagation();
          hotkeysRef.current.requestEdit();
          return;
        }
        if (code === "KeyN" || letter === "n") {
          e.preventDefault();
          e.stopPropagation();
          hotkeysRef.current.openNewCard();
          return;
        }
        return;
      }
      if (typingTarget(e.target)) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "/") {
        e.preventDefault();
        hotkeysRef.current.focusSearch();
        return;
      }
      if (e.key.length === 1) {
        e.preventDefault();
        hotkeysRef.current.focusSearch(e.key);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
  function focusSearch(extra?: string) {
    const el = searchRef.current;
    if (!el) return;
    el.focus();
    if (typeof extra === "string") {
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const next = `${el.value.slice(0, start)}${extra}${el.value.slice(end)}`;
      setQuery(next);
      setTagHi(0);
      requestAnimationFrame(() => {
        try {
          const pos = start + extra.length;
          el.setSelectionRange(pos, pos);
        } catch {
          // ignore
        }
      });
    }
  }
  function openNewCard() {
    const cur = dataRef.current;
    const sess = sessionRef.current;
    if (pageRef.current === "favs") {
      toast.error(t("toast.needSpaceForCard"));
      return;
    }
    if (!sess?.canEdit) {
      requestEdit();
      return;
    }
    if (sess.role !== "admin" && sess.tabPerms?.[cur.activeTabId] !== "edit") {
      toast.error(t("toast.noEditTab"));
      return;
    }
    if (!editModeRef.current) enterEdit();
    const cat = cur.categories?.[0];
    if (!cat) {
      toast.error(t("toast.needCategory"));
      return;
    }
    setModal({
      kind: "app",
      categoryId: cat.id,
    });
  }
  hotkeysRef.current = {
    requestEdit,
    openNewCard,
    focusSearch,
  };
  function duplicateApp(app: PortalApp, categoryId: string) {
    apply(async () => {
      const next = await createApp({
        data: {
          token,
          categoryId,
          kind: app.kind || "app",
          title: copyLabel(app.title, itemKind(app.kind).option),
          description: app.description || "",
          url: app.url || "",
          icon: app.icon || "Link",
          tags: app.tags || [],
          colSpan: app.colSpan === 2 || app.colSpan === 3 ? app.colSpan : 1,
          rowSpan: app.rowSpan === 2 || app.rowSpan === 3 ? app.rowSpan : 1,
          check: app.check || "off",
          checkHost: app.checkHost || "",
          links: app.links || [],
        },
      });
      toast.success(t("toast.cardDuplicated"));
      return next;
    });
  }
  function duplicateCategory(cat: PortalCategory, tabId: string) {
    apply(async () => {
      const next = await createCategory({
        data: {
          token,
          tabId,
          name: copyLabel(cat.name, t("item.category")),
          icon: cat.icon || "Folder",
          restricted: Boolean(cat.restricted),
          viewers: cat.viewers || [],
          editors: cat.editors || [],
        },
      });
      toast.success(t("toast.categoryDuplicated"));
      return next;
    });
  }
  function sortCategoryCards(cat: PortalCategory) {
    if (!cat?.apps?.length) return;
    const nextDir = appsAlphaDir(cat.apps, data.settings.locale) === "az" ? "za" : "alpha";
    apply(async () => {
      const next = await arrangeCategory({
        data: {
          token,
          categoryId: cat.id,
          sort: nextDir,
        },
      });
      toast.success(t(nextDir === "za" ? "toast.cardsSortedZa" : "toast.cardsSorted"));
      return next;
    }, {
      close: false,
    });
  }
  function catSortButton(cat: PortalCategory) {
    const za = appsAlphaDir(cat.apps, data.settings.locale) === "az";
    return (
      <button
        type="button"
        className="card-tool"
        aria-label={za ? t("cat.sortZa") : t("cat.sortAlpha")}
        title={za ? t("cat.sortZa") : t("cat.sortAlpha")}
        onClick={() => sortCategoryCards(cat)}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {za ? <ArrowUpZA className="size-3.5" /> : <ArrowDownAZ className="size-3.5" />}
      </button>
    );
  }
  async function resetCategoryCards(cat: PortalCategory) {
    if (!cat?.apps?.length) return;
    if (
      !(await askConfirm({
        title: t("cat.resetLayout"),
        body: t("cat.resetLayoutConfirm"),
        okLabel: t("cat.resetLayout"),
      }))
    )
      return;
    apply(async () => {
      const next = await arrangeCategory({
        data: {
          token,
          categoryId: cat.id,
          resetSpans: true,
        },
      });
      toast.success(t("toast.cardsReset"));
      return next;
    }, {
      close: false,
    });
  }
  function duplicateSpace(tab: MenuTab) {
    apply(async () => {
      const next = await duplicateTab({
        data: {
          token,
          id: tab.id,
        },
      });
      toast.success(t("toast.spaceDuplicated"));
      return next;
    });
  }
  function bumpClick(app: PortalApp) {
    if ((app.kind || "app") !== "app") return;
    setData((cur) => {
      const bump = (item: PortalApp) =>
        item.id === app.id
          ? {
              ...item,
              clicks: (item.clicks || 0) + 1,
            }
          : item;
      return {
        ...cur,
        categories: cur.categories.map((c) => ({
          ...c,
          apps: c.apps.map(bump),
        })),
        catalog: (cur.catalog ?? []).map((t) => ({
          ...t,
          categories: t.categories.map((c) => ({
            ...c,
            apps: c.apps.map(bump),
          })),
        })),
      };
    });
    setClickStats((cur) => {
      if (cur.fullCatalog === false) return cur;
      return {
        ...cur,
        all: (cur.all || 0) + 1,
        today: (cur.today || 0) + 1,
        week: (cur.week || 0) + 1,
        month: (cur.month || 0) + 1,
        year: (cur.year || 0) + 1,
        spanDays: cur.spanDays || 0,
      };
    });
    recordClick({
      data: {
        id: app.id,
        token,
      },
    })
      .then((row) => {
        if (row?.clickStats) setClickStats(row.clickStats);
      })
      .catch(() => void 0);
  }
  async function recheckApp(app: PortalApp) {
    if (!app.check || app.check === "off") return;
    try {
      const row = (
        await probeTargets({
          data: {
            token: token || undefined,
            ids: [app.id],
          },
        })
      )[0];
      if (row)
        setHealth((cur) => ({
          ...cur,
          [row.id]: row,
        }));
    } catch (err) {
      toast.error(te(err));
    }
  }
  async function switchTab(tabId: string) {
    if (tabId === dataRef.current.activeTabId) return;
    const current = dataRef.current;
    const entry = (current.catalog ?? []).find((t) => t.id === tabId);
    activeTabRef.current = tabId;
    if (entry) {
      setData({
        ...current,
        activeTabId: tabId,
        categories: entry.categories,
      });
      rememberTab({
        data: {
          tabId,
          token: token || void 0,
        },
      }).catch(() => void 0);
      return;
    }
    try {
      const next = await getPortal({
        data: {
          tabId,
          token: token || void 0,
        },
      });
      if (activeTabRef.current === tabId) setData(next);
    } catch (err) {
      if (sessionGone(err)) return;
      toast.error(te(err));
    }
  }
  function goTab(tabId: string) {
    setPage("tab");
    if (tabId !== dataRef.current.activeTabId) switchTab(tabId);
  }
  function tabHasCards(tabId: string) {
    const row = (data.catalog ?? []).find((t) => t.id === tabId);
    const cats = row?.categories || (tabId === data.activeTabId ? data.categories : []);
    return (cats || []).some((c) => (c.apps || []).length);
  }
  function toggleFav(id: string) {
    setUi((cur) => {
      const favIds = cur.favIds.includes(id)
        ? cur.favIds.filter((x) => x !== id)
        : [...cur.favIds, id].slice(0, 80);
      return writeUiPrefs({
        ...cur,
        favIds,
      });
    });
  }
  function setOpenFavs(openFavs: boolean) {
    setUi((cur) =>
      writeUiPrefs({
        ...cur,
        openFavs,
      }),
    );
  }
  function toggleCollapsed(id: string) {
    setUi((cur) => {
      const collapsedCats = (cur.collapsedCats ?? []).includes(id)
        ? cur.collapsedCats.filter((x) => x !== id)
        : [...(cur.collapsedCats ?? []), id].slice(0, 80);
      return writeUiPrefs({
        ...cur,
        collapsedCats,
      });
    });
  }
  function resetLocalPrefs() {
    setUi(clearUiPrefs());
    setPage("tab");
    try {
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.add("light");
      window.dispatchEvent(new Event("portal-theme"));
    } catch {
      // ignore
    }
    toast.success(t("toast.prefsReset"));
  }
  const collapsedSet = useMemo(() => new Set(ui.collapsedCats ?? []), [ui.collapsedCats]);
  const searching = query.trim().length > 0 || tagFilter.length > 0 || downFilter;
  function isCatCollapsed(catId: string) {
    if (searching) return false;
    if (drag?.kind === "app" && dragFold?.left) return catId !== dragFold.openId;
    return collapsedSet.has(catId);
  }
  const onFavs = page === "favs" && !searching;
  const canEditActive =
    session?.role === "admin" || session?.tabPerms?.[data.activeTabId] === "edit";
  const canEditTab = (tabId: string) => session?.role === "admin" || session?.tabPerms?.[tabId] === "edit";
  const canReorderTabs = Boolean(
    editMode && !searching && (session?.role === "admin" || session?.canCreateTabs),
  );
  const canDrag = editMode && !searching && page !== "favs" && canEditActive;
  const canResize = canDrag && data.settings.cardResize !== false;
  function toggleTag(name: string) {
    setTagFilter((cur) => {
      const key = name.toLowerCase();
      if (cur.some((t) => t.toLowerCase() === key))
        return cur.filter((t) => t.toLowerCase() !== key);
      if (cur.length >= 3) {
        toast.error(t("toast.maxTags"));
        return cur;
      }
      return [...cur, name];
    });
  }
  function applyTagFromSearch(name: string) {
    setTagFilter((cur) => {
      const key = name.toLowerCase();
      if (cur.some((t) => t.toLowerCase() === key)) return cur;
      if (cur.length >= 3) {
        toast.error(t("toast.maxTags"));
        return cur;
      }
      return [...cur, name];
    });
    setQuery("");
    setTagHi(0);
  }
  const downIds = useMemo(() => {
    if (data.settings.healthChecks === false) return [] as string[];
    const ids: string[] = [];
    for (const [id, row] of Object.entries(health)) if (row && row.ok === false) ids.push(id);
    return ids;
  }, [health, data.settings.healthChecks]);
  useEffect(() => {
    if (downFilter && downIds.length === 0) setDownFilter(false);
  }, [downFilter, downIds]);
  useEffect(() => {
    if (data.clickStats) setClickStats(data.clickStats);
  }, [data.clickStats]);
  const searchHits = useMemo(() => {
    const s = query.trim().toLowerCase();
    const tags = tagFilter;
    const downSet = downFilter ? new Set(downIds) : null;
    if (!s && tags.length === 0 && !downFilter) return [];
    return (data.catalog ?? [])
      .map((tab) => {
        const tabHit = Boolean(s) && tab.name.toLowerCase().includes(s);
        const categories = tab.categories
          .map((c) => {
            const catHit = tabHit || (Boolean(s) && c.name.toLowerCase().includes(s));
            return {
              ...c,
              apps:
                catHit && tags.length === 0 && !downSet
                  ? c.apps
                  : c.apps.filter((a) => itemMatches(a, s, tags, downSet)),
            };
          })
          .filter((c) => c.apps.length > 0);
        return {
          ...tab,
          categories,
        };
      })
      .filter((t) => t.categories.length > 0);
  }, [data.catalog, query, tagFilter, downFilter, downIds]);
  const allTags = useMemo(
    () => collectTags(data.catalog, data.settings.tagColors, data.settings.tagsAlpha !== false),
    [data.catalog, data.settings.tagColors, data.settings.tagsAlpha],
  );
  const tagMatches = useMemo(() => {
    const s = fold(query.trim());
    if (!s) return [];
    return allTags
      .filter(
        (t) =>
          fold(t.name).includes(s) &&
          !tagFilter.some((x) => x.toLowerCase() === t.name.toLowerCase()),
      )
      .slice(0, 8);
  }, [query, allTags, tagFilter]);
  const favSet = useMemo(() => new Set(ui.favIds), [ui.favIds]);
  const favGroups = useMemo(() => {
    const order = new Map(ui.favIds.map((id, i) => [id, i]));
    const groups = [];
    for (const tab of data.catalog ?? [])
      for (const cat of tab.categories) {
        const apps = cat.apps
          .filter((a) => favSet.has(a.id) && allowsFavorite(a, data.settings))
          .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
        if (apps.length)
          groups.push({
            tab,
            cat,
            apps,
          });
      }
    return groups;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- settings-only fields used; catalog/favSet/ui.favIds cover the rest
  }, [data.catalog, favSet, ui.favIds]);
  const favCount = favGroups.reduce((n, g) => n + g.apps.length, 0);
  const probeList = useMemo(() => {
    if (data.settings.healthChecks === false) return [];
    const out = [];
    for (const tab of data.catalog ?? [])
      for (const cat of tab.categories)
        for (const app of cat.apps) {
          if ((app.kind || "app") !== "app" || app.check === "off" || !app.check) continue;
          if (app.check === "http")
            out.push({
              id: app.id,
              mode: "http",
              url: app.url,
            });
          else if (app.check === "icmp")
            out.push({
              id: app.id,
              mode: "icmp",
              host: app.checkHost,
            });
        }
    return out;
  }, [data.catalog, data.settings.healthChecks]);
  const probeKey = probeList
    .map((t) => `${t.id}:${t.mode}:${t.url ?? ""}:${t.host ?? ""}`)
    .join("|");
  useEffect(() => {
    if (!probeList.length) {
      setHealth({});
      return;
    }
    let cancelled = false;
    async function run() {
      if (healthBusy.current) return;
      healthBusy.current = true;
      try {
        const chunkSize = 4;
        for (let i = 0; i < probeList.length; i += chunkSize) {
          if (cancelled) return;
          const chunk = probeList.slice(i, i + chunkSize);
          try {
            const rows = await probeTargets({
              data: {
                token: token || undefined,
                ids: chunk.map((t) => t.id),
              },
            });
            if (cancelled) return;
            setHealth((cur) => {
              const next = {
                ...cur,
              };
              for (const row of rows) next[row.id] = row;
              return next;
            });
          } catch {
            // ignore
          }
        }
      } finally {
        healthBusy.current = false;
      }
    }
    let idleId = 0;
    const kick = () => {
      if (cancelled) return;
      run();
    };
    if (typeof requestIdleCallback === "function")
      idleId = requestIdleCallback(kick, {
        timeout: 800,
      });
    else idleId = window.setTimeout(kick, 280);
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      run();
    }, 6e4);
    return () => {
      cancelled = true;
      if (typeof cancelIdleCallback === "function") cancelIdleCallback(idleId);
      window.clearTimeout(idleId);
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- probe run keyed on probeKey, not the array identity
  }, [probeKey, token]);
  const filtered = useMemo(() => {
    if (searching) return searchHits.flatMap((t) => t.categories);
    return data.categories;
  }, [searching, searchHits, data.categories]);
  const carryFromTabId = carryRef.current?.fromTabId;
  const carryDestTabId =
    over?.kind === "tab-carry"
      ? over.tabId
      : carryFromTabId && carryFromTabId !== data.activeTabId
        ? data.activeTabId
        : null;
  const displayTabs = useMemo(() => {
    let tabs = data.tabs;
    if (
      canReorderTabs &&
      drag &&
      over &&
      drag.kind === "tab" &&
      over.kind === "tab" &&
      !tabOverMore
    )
      tabs = placeTabs(data.tabs, drag.id, over.insertAt) ?? data.tabs;
    if (editMode || searching) return tabs;
    return tabs.filter((t) => tabHasCards(t.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- helper reads refs; list identity deps cover the recompute
  }, [
    data.tabs,
    data.catalog,
    data.categories,
    data.activeTabId,
    canReorderTabs,
    drag,
    over,
    editMode,
    searching,
    tabOverMore,
  ]);
  const moreMenuTabs = displayTabs.filter(
    (tab) => tabOverflow.includes(tab.id) && !(drag?.kind === "tab" && drag.id === tab.id),
  );
  const moreGapAt =
    drag?.kind === "tab" && tabOverMore && over?.kind === "tab"
      ? data.tabs
          .map((t) => t.id)
          .filter((id) => id !== drag.id)
          .slice(0, over.insertAt)
          .filter((id) => tabOverflow.includes(id)).length
      : -1;
  useEffect(() => {
    if (editMode || searching || page !== "tab") return;
    if (tabHasCards(data.activeTabId)) return;
    const next = (data.tabs || []).find((t) => t.id !== data.activeTabId && tabHasCards(t.id));
    if (next) goTab(next.id);
    else setPage("favs");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- redirect-on-empty guard; helpers read refs, run on data change only
  }, [editMode, searching, page, data.activeTabId, data.catalog, data.tabs]);
  moreOpenRef.current = moreOpen;
  tabOverMoreRef.current = tabOverMore;
  useLayoutEffect(() => {
    const row = tabListRef.current;
    const strip = tabStripRef.current;
    if (!row || !strip) return;
    const compute = () => {
      if (dragRef.current?.kind === "tab") return;
      const gap = Number.parseFloat(getComputedStyle(strip).gap) || 0;
      const avail = strip.clientWidth;
      if (!avail) return;
      const fav = strip.querySelector<HTMLElement>("[data-tab-slot=fav]");
      const favW = fav?.offsetWidth || 0;
      const plus = strip.querySelector<HTMLElement>("[data-tab-slot=plus]");
      const plusW = plus?.offsetWidth || 0;
      const moreEl = strip.querySelector<HTMLElement>("[data-tab-slot=more]");
      const moreW = moreEl?.offsetWidth || 0;
      for (const el of strip.querySelectorAll<HTMLElement>(".tab-item[data-tab-id]")) {
        if (el.classList.contains("is-overflow")) continue;
        const id = el.dataset.tabId;
        if (id && el.offsetWidth) tabWidthRef.current.set(id, el.offsetWidth);
      }
      const activeId = page === "favs" ? null : data.activeTabId;
      const hid = pickVisibleTabIds(
        displayTabs,
        tabWidthRef.current,
        activeId,
        avail,
        favW,
        plusW,
        moreW,
        gap,
      );
      setTabOverflow((cur) =>
        cur.length === hid.length && cur.every((id, i) => id === hid[i]) ? cur : hid,
      );
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(row);
    ro.observe(strip);
    return () => ro.disconnect();
  }, [displayTabs, editMode, data.activeTabId, page, canReorderTabs, searching, drag?.kind]);
  useEffect(() => {
    if (!tabOverflow.length && moreOpen) setMoreOpen(false);
  }, [tabOverflow, moreOpen]);
  useLayoutEffect(() => {
    if (!moreOpen) return;
    const btn = tabMoreRef.current?.querySelector(".tab-more");
    const panel = morePanelRef.current;
    if (!btn || !panel) return;
    const place = () => {
      const r = btn.getBoundingClientRect();
      const w = panel.offsetWidth;
      const left = Math.min(Math.max(8, r.right - w), window.innerWidth - w - 8);
      panel.style.top = `${r.bottom + 6}px`;
      panel.style.left = `${Math.max(8, left)}px`;
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [moreOpen]);
  useEffect(() => {
    if (!moreOpen) return;
    const close = (e: PointerEvent) => {
      if (dragRef.current?.kind === "tab") return;
      if (
        tabMoreRef.current?.contains(e.target as Node) ||
        morePanelRef.current?.contains(e.target as Node)
      )
        return;
      setMoreOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);
  const displayCategories = useMemo(() => {
    const base = filtered;
    if (!canDrag || !drag || !over) return base;
    if (drag.kind === "cat") {
      const carry = carryRef.current;
      const inView = base.some((c) => c.id === drag.id);
      if (carry?.cat && !inView) {
        const insertAt = over.kind === "cat" ? over.insertAt : base.length;
        return placeCarriedCategory(base, carry.cat, insertAt) ?? base;
      }
      if (over.kind === "cat") return placeCategory(base, drag.id, over.insertAt) ?? base;
    }
    if (drag.kind === "app") {
      const carry = carryRef.current;
      const inView = base.some((c) => c.apps.some((a) => a.id === drag.id));
      if (carry && !inView) {
        const catId = over.kind === "app" && over.catId ? over.catId : base[0]?.id;
        const insertAt = over.kind === "app" ? over.insertAt : base[0]?.apps.length || 0;
        if (!catId) return base;
        return placeCarriedApp(base, carry.app, catId, insertAt) ?? base;
      }
      if (over.kind === "app") return placeApp(base, drag.id, over.catId, over.insertAt) ?? base;
    }
    return base;
  }, [filtered, canDrag, drag, over]);
  function sameLayout(a: PortalCategory[], b: PortalCategory[]) {
    return (
      JSON.stringify(
        a.map((c) => ({
          id: c.id,
          apps: c.apps.map((x) => x.id),
        })),
      ) ===
      JSON.stringify(
        b.map((c) => ({
          id: c.id,
          apps: c.apps.map((x) => x.id),
        })),
      )
    );
  }
  function persistMove(app: PortalApp, fromTabId: string, destTabId: string, nextCats: PortalCategory[]) {
    const current = dataRef.current;
    const snapshot = {
      categories: current.categories,
      catalog: current.catalog,
      activeTabId: current.activeTabId,
    };
    const dest = nextCats.find((c) => c.apps.some((a) => a.id === app.id));
    const placed = dest?.apps.find((a) => a.id === app.id);
    if (!dest || !placed) return;
    const catalog = (current.catalog ?? []).map((t) => {
      if (t.id === fromTabId)
        return {
          ...t,
          categories: t.categories.map((c) => ({
            ...c,
            apps: c.apps.filter((a) => a.id !== app.id),
          })),
        };
      if (t.id === destTabId)
        return {
          ...t,
          categories: nextCats,
        };
      return t;
    });
    setData({
      ...current,
      categories: nextCats,
      catalog,
      activeTabId: destTabId,
    });
    moveApp({
      data: {
        token: tokenRef.current,
        id: app.id,
        destTabId,
        destCategoryId: dest.id,
        sortOrder: placed.sortOrder || 1,
      },
    })
      .then((next) => {
        setData(next);
        stayEditing();
      })
      .catch((err) => {
        toast.error(te(err));
        setData({
          ...current,
          ...snapshot,
        });
        stayEditing();
      });
  }
  function persistTabs(nextTabs: MenuTab[]) {
    const current = dataRef.current;
    if (nextTabs.map((t) => t.id).join() === current.tabs.map((t) => t.id).join()) return;
    const snapshot = current.tabs;
    setData({
      ...current,
      tabs: nextTabs,
    });
    reorderTabs({
      data: {
        token,
        tabId: current.activeTabId,
        order: nextTabs.map((t) => t.id),
      },
    })
      .then((next) => {
        const latest = dataRef.current;
        setData({
          ...next,
          activeTabId: latest.activeTabId,
          categories: next.activeTabId === latest.activeTabId ? next.categories : latest.categories,
        });
        stayEditing();
      })
      .catch((err) => {
        if (sessionGone(err)) return;
        toast.error(te(err));
        setData({
          ...current,
          tabs: snapshot,
        });
        stayEditing();
      });
  }
  function persistLayout(nextCats: PortalCategory[]) {
    const current = dataRef.current;
    if (sameLayout(current.categories, nextCats)) return;
    const snapshot = current.categories;
    setData({
      ...current,
      categories: nextCats,
    });
    const placements = nextCats.flatMap((c) =>
      c.apps.map((a, i) => ({
        id: a.id,
        categoryId: c.id,
        sortOrder: i + 1,
      })),
    );
    const catChanged =
      nextCats.map((c) => c.id).join() !== current.categories.map((c) => c.id).join();
    const tabId = activeTabRef.current || current.activeTabId;
    (catChanged
      ? reorderCategories({
          data: {
            token,
            tabId,
            order: nextCats.map((c) => c.id),
          },
        }).then(() =>
          reorderApps({
            data: {
              token,
              tabId,
              placements,
            },
          }),
        )
      : reorderApps({
          data: {
            token,
            tabId,
            placements,
          },
        })
    )
      .then((next) => {
        const latest = dataRef.current;
        if (next.activeTabId !== latest.activeTabId && next.activeTabId !== current.activeTabId) {
          stayEditing();
          return;
        }
        setData(next);
        stayEditing();
      })
      .catch((err) => {
        toast.error(te(err));
        setData({
          ...current,
          categories: snapshot,
        });
        stayEditing();
      });
  }
  function commitDrag() {
    const d = dragRef.current;
    const o = overRef.current;
    const current = dataRef.current;
    unbindDrag();
    setDrag(null);
    setOver(null);
    killGhost();
    setDragUi(false);
    stopDragScroll();
    catHoverRef.current = null;
    dragFoldRef.current = null;
    setDragFold(null);
    window.setTimeout(() => {
      didDragRef.current = false;
    }, 50);
    if (!d || !o) return;
    if (d.kind === "tab" && o.kind === "tab") {
      const next = placeTabs(current.tabs, d.id, o.insertAt);
      if (next) persistTabs(next);
      return;
    }
    if (d.kind === "app" && o.kind === "app") {
      const carry = carryRef.current;
      const destTabId = current.activeTabId;
      if (carry && carry.fromTabId !== destTabId && carry.app) {
        const nextCats = placeCarriedApp(current.categories, carry.app, o.catId, o.insertAt);
        if (nextCats) persistMove(carry.app, carry.fromTabId, destTabId, nextCats);
        clearCarry();
        return;
      }
      const next =
        placeApp(current.categories, d.id, o.catId, o.insertAt) ||
        (carry && placeCarriedApp(current.categories, carry.app, o.catId, o.insertAt));
      clearCarry();
      if (next) persistLayout(next);
      return;
    }
    if (d.kind === "cat" && o.kind === "cat") {
      const next = placeCategory(current.categories, d.id, o.insertAt);
      if (next) persistLayout(next);
    }
  }
  function tabInsertAt(clientX: number, clientY: number, dragId: string, forceMore: boolean) {
    const ids = dataRef.current.tabs.map((t) => t.id).filter((id) => id !== dragId);
    const panel = morePanelRef.current;
    const useMore = forceMore || Boolean(panel);
    if (useMore && panel) {
      const box = panel.getBoundingClientRect();
      const inPanel =
        forceMore ||
        (clientX >= box.left &&
          clientX <= box.right &&
          clientY >= box.top &&
          clientY <= box.bottom);
      if (inPanel) {
        const nodes = [...panel.querySelectorAll<HTMLElement>("[data-tab-id]")];
        let last = -1;
        for (const el of nodes) {
          const id = el.dataset.tabId;
          if (!id || id === dragId) continue;
          const at = ids.indexOf(id);
          if (at >= 0) last = at;
          const r = el.getBoundingClientRect();
          if (clientY < r.top + r.height / 2) return at < 0 ? ids.length : at;
        }
        if (nodes.length) return last < 0 ? ids.length : last + 1;
      }
    }
    if (forceMore) {
      const ov = tabOverflow.filter((id) => id !== dragId);
      if (!ov.length) return ids.length;
      const at = ids.indexOf(ov[0]);
      return at < 0 ? ids.length : at;
    }
    const root = tabListRef.current;
    if (!root) return ids.length;
    const nodes = [...root.querySelectorAll<HTMLElement>(".tab-item[data-tab-id]")].filter(
      (el) => !el.classList.contains("is-overflow") && el.offsetWidth,
    );
    let last = -1;
    for (const el of nodes) {
      const id = el.dataset.tabId;
      if (!id || id === dragId) continue;
      const at = ids.indexOf(id);
      if (at >= 0) last = at;
      const r = el.getBoundingClientRect();
      if (clientX < r.left + r.width / 2) return at < 0 ? ids.length : at;
    }
    return last < 0 ? ids.length : last + 1;
  }
  function endTabPointer(tabId: string, moved: boolean) {
    tabOverMoreRef.current = false;
    setTabOverMore(false);
    if (!moved) {
      setDrag(null);
      setOver(null);
      killGhost();
      setDragUi(false);
      goTab(tabId);
      return;
    }
    swallowGhostClick();
    const next = placeTabs(dataRef.current.tabs, tabId, tabInsertRef.current);
    setDrag(null);
    setOver(null);
    killGhost();
    setDragUi(false);
    window.setTimeout(() => {
      didDragRef.current = false;
    }, 50);
    if (next) persistTabs(next);
  }
  function hitAppInsert(
    clientX: number,
    clientY: number,
    dragId: string,
  ): { kind: "app"; catId: string; insertAt: number } | null {
    const stack = document.elementsFromPoint(clientX, clientY);
    let card: HTMLElement | undefined;
    let section: HTMLElement | undefined;
    let overSelf = false;
    for (const node of stack) {
      if (!(node instanceof HTMLElement)) continue;
      if (node === ghostRef.current || node === markerRef.current) continue;
      const c = node.closest<HTMLElement>("[data-app-id]");
      if (c?.dataset.appId === dragId) overSelf = true;
      else if (c?.dataset.appId && !card) card = c;
      const s = node.closest<HTMLElement>("[data-cat-id]");
      if (s && !section) section = s;
    }
    if (overSelf) {
      const cur = overRef.current;
      if (cur?.kind === "app") return cur;
    }
    if (!section?.dataset.catId) return null;
    const catId = section.dataset.catId;
    const cat = dataRef.current.categories.find((c) => c.id === catId);
    if (!cat) return null;
    const destId = card?.dataset.appId;
    if (destId && destId !== dragId && card) {
      const after = pointerAfter(
        {
          clientX,
          clientY,
        },
        card,
      );
      return {
        kind: "app",
        catId,
        insertAt: hoverInsertAt(
          cat.apps.map((a) => a.id),
          dragId,
          destId,
          after,
        ),
      };
    }
    return {
      kind: "app",
      catId,
      insertAt: cat.apps.filter((a) => a.id !== dragId).length,
    };
  }
  function hitCatInsert(clientY: number, dragId: string) {
    const others = [...document.querySelectorAll<HTMLElement>("[data-cat-id]")].filter(
      (el) => el.dataset.catId && el.dataset.catId !== dragId,
    );
    for (let i = 0; i < others.length; i++) {
      const r = (
        others[i].querySelector("[data-cat-handle]") ??
        others[i].querySelector("h2") ??
        others[i]
      ).getBoundingClientRect();
      if (clientY < r.top + r.height / 2) return i;
    }
    return others.length;
  }
  const picker = {
    token,
    library: data.customIcons ?? [],
    online: Boolean(data.settings.onlineIcons),
    navRichIcons: Boolean(data.settings.navRichIcons),
    onLibrary: (customIcons: CustomIcon[]) =>
      setData({
        ...data,
        customIcons,
      }),
  };
  useEffect(() => {
    const loc = asLocale(data.settings?.locale);
    applyDisplayPrefs(data.settings);
    document.documentElement.lang = loc;
    const name = String(data.settings.documentTitle || "").trim() || "Dockit";
    document.title = name;
    const raw = String(data.settings.favicon || "").trim() || "/favicon.svg";
    const href = raw.startsWith("data:")
      ? raw
      : `${raw}${raw.includes("?") ? "&" : "?"}v=${PORTAL_VERSION}`;
    document
      .querySelectorAll("link[rel='icon'], link[rel='shortcut icon']")
      .forEach((el) => el.remove());
    const link = document.createElement("link");
    link.rel = "icon";
    link.href = href;
    if (raw.startsWith("data:image/svg") || raw.includes(".svg")) link.type = "image/svg+xml";
    else if (raw.startsWith("data:image/png") || raw.includes(".png")) link.type = "image/png";
    else if (raw.startsWith("data:image/webp")) link.type = "image/webp";
    else if (raw.startsWith("data:image/jpeg")) link.type = "image/jpeg";
    else if (raw.includes("image/x-icon") || raw.includes(".ico")) link.type = "image/x-icon";
    document.head.appendChild(link);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- document title/favicon effect; settings identity not needed
  }, [
    data.settings.documentTitle,
    data.settings.favicon,
    data.settings.locale,
    data.settings.dateFormat,
    data.settings.timeFormat,
    data.settings.timezone,
  ]);
  return (
    <div className="min-h-dvh">
      {" "}
      <ThemeCss light={data.settings.cssLight || ""} dark={data.settings.cssDark || ""} />{" "}
      {data.runtime?.isDev && !hideDevBanner ? (
        <div className="security-banner is-dev" role="status">
          {" "}
          <Bug className="size-3.5 shrink-0" />
          {t("banner.dev")}
          <button
            type="button"
            className="banner-close"
            aria-label={t("actions.close")}
            title={t("actions.close")}
            onClick={() => setHideDevBanner(true)}
          >
            {" "}
            <X strokeWidth={2.75} />
          </button>
        </div>
      ) : null}
      {session?.mustChangePassword ? (
        <div className="security-banner" role="status">
          {" "}
          <AlertTriangle className="size-3.5 shrink-0" />
          {t("banner.weakPassword")}
        </div>
      ) : null}
      {data.runtime?.isDev && data.settings.devAdminNoPassword && !hideNoPassBanner ? (
        <div className="security-banner" role="status">
          {" "}
          <AlertTriangle className="size-3.5 shrink-0" />
          {t("banner.noPassword")}
          <button
            type="button"
            className="banner-close"
            aria-label={t("actions.close")}
            title={t("actions.close")}
            onClick={() => setHideNoPassBanner(true)}
          >
            {" "}
            <X strokeWidth={2.75} />
          </button>
        </div>
      ) : null}{" "}
      <header className="sticky top-0 z-20 border-b border-border bg-header">
        {" "}
        <div className="mx-auto flex min-w-0 max-w-6xl items-center gap-2 px-4 py-3 sm:gap-3 sm:px-6">
          {" "}
          <div className="flex min-w-0 items-center gap-3">
            {" "}
            <div className="flex size-10 shrink-0 items-center justify-center">
              {data.settings.logo ? (
                <img src={data.settings.logo} alt="" className="size-10 object-contain" />
              ) : (
                <DockitMark className="dockit-mark size-9" />
              )}
            </div>{" "}
            <div className="hidden min-w-0 sm:block sm:max-w-72">
              {" "}
              <h1 className="truncate text-base font-semibold tracking-tight">
                {data.settings.title}
              </h1>{" "}
              <p className="hidden truncate text-xs text-muted sm:block">
                {data.settings.subtitle || "Pin your URLs"}
              </p>
            </div>
          </div>{" "}
          <div className="search-box relative flex min-h-10 min-w-0 flex-1 items-center rounded-lg border border-border bg-surface pl-9">
            {" "}
            <Search className="pointer-events-none absolute left-3 size-4 text-muted" />
            <input
              ref={searchRef}
              className="h-10 min-w-[6rem] flex-1 bg-transparent text-sm outline-none placeholder:text-subtle"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setTagHi(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" && tagMatches.length) {
                  e.preventDefault();
                  setTagHi((i) => (i + 1) % tagMatches.length);
                  return;
                }
                if (e.key === "ArrowUp" && tagMatches.length) {
                  e.preventDefault();
                  setTagHi((i) => (i - 1 + tagMatches.length) % tagMatches.length);
                  return;
                }
                if (e.key === "Enter" && tagMatches.length) {
                  e.preventDefault();
                  applyTagFromSearch(tagMatches[tagHi % tagMatches.length].name);
                  return;
                }
                if (e.key === "Escape" && (query || tagFilter.length || downFilter)) {
                  e.preventDefault();
                  setQuery("");
                  setDownFilter(false);
                  return;
                }
                if (e.key === "Backspace" && !query && tagFilter.length)
                  setTagFilter((cur) => cur.slice(0, -1));
              }}
              placeholder={tagFilter.length ? t("nav.addTagOrName") : t("nav.search")}
              title={t("nav.searchTitle")}
              type="search"
              autoComplete="off"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={tagMatches.length > 0}
            />
            {tagFilter.length || downFilter ? (
              <div className="search-tags">
                {downFilter ? (
                  <button
                    type="button"
                    className="tag-chip is-on stats-hs-chip"
                    title={t("info.removeHs")}
                    onClick={() => setDownFilter(false)}
                  >
                    {t("info.hs")}
                    <X className="ml-0.5 size-2.5" />
                  </button>
                ) : null}
                {tagFilter.map((name) => {
                  const paint = tagPaint(name, data.settings.tagColors);
                  return (
                    <button
                      key={name}
                      type="button"
                      data-tone={paint.tone}
                      style={paint.style}
                      className="tag-chip is-on"
                      title={t("nav.removeTag", { name })}
                      onClick={() => toggleTag(name)}
                    >
                      {name}
                      <X className="ml-0.5 size-2.5" />
                    </button>
                  );
                })}
              </div>
            ) : null}
            {tagMatches.length > 0 ? (
              <div className="search-suggest" role="listbox">
                {tagMatches.map((t, i) => {
                  const paint = tagPaint(t.name, data.settings.tagColors);
                  const hi = tagMatches.length ? tagHi % tagMatches.length : 0;
                  return (
                    <button
                      key={t.name}
                      type="button"
                      role="option"
                      aria-selected={i === hi}
                      className={i === hi ? "is-hi" : ""}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        applyTagFromSearch(t.name);
                      }}
                    >
                      {" "}
                      <span data-tone={paint.tone} style={paint.style} className="tag-chip">
                        {t.name}
                      </span>{" "}
                      <span className="text-xs text-muted">{t.count}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>{" "}
          <div className="flex shrink-0 items-center gap-0.5">
            {" "}
            <ThemeToggle />
            <AccountMenu
              loggedIn={Boolean(token || session)}
              editMode={editMode}
              canEdit={Boolean(session?.canEdit)}
              canOpenSettings={Boolean(session?.canManageSettings)}
              role={session?.role || ""}
              openFavs={ui.openFavs}
              onLogin={() => requestLogin()}
              onEdit={() => requestEdit()}
              onSettings={() => requestAdmin("general")}
              canManageUsers={Boolean(session?.canManageUsers)}
              canHistory={Boolean(session?.canAudit || session?.canRestore)}
              canCuration={Boolean(session?.canCuration)}
              onHistory={() => requestHistory()}
              onCuration={() => requestCuration()}
              onUsers={() => requestUsers()}
              onOpenFavs={setOpenFavs}
              onResetLocal={resetLocalPrefs}
              onLogout={logoutEdit}
            />
            {editMode ? (
              <Button
                variant="default"
                size="sm"
                title={t("nav.done")}
                aria-label={t("nav.done")}
                onClick={() => requestEdit()}
              >
                {" "}
                <Check className="size-4" />
                <span className="hidden sm:inline">{t("nav.done")}</span>
              </Button>
            ) : null}
          </div>
        </div>
        {displayTabs.length > 0 && (
          <div ref={tabListRef} className="tab-row">
            <div ref={tabStripRef} className="tab-strip">
            <button
              type="button"
              data-tab-slot="fav"
              onClick={() => {
                if (didDragRef.current) {
                  didDragRef.current = false;
                  return;
                }
                setPage("favs");
              }}
              className={`tab-item ${onFavs ? "is-on" : ""} ${data.settings.favsHideLabel ? "is-icon" : ""}`}
              aria-pressed={onFavs}
              aria-label={t("nav.favorites")}
              title={t("nav.favorites")}
            >
              {" "}
              <Star className="tab-ico" fill={onFavs || favCount > 0 ? "currentColor" : "none"} />
              {data.settings.favsHideLabel ? null : <span>{t("nav.favorites")}</span>}
              {favCount > 0 ? (
                <span className="count-chip" data-tone={tagTone(t("nav.favorites"))}>
                  {favCount}
                </span>
              ) : null}
              {editMode && onFavs && session?.canEdit ? (
                <span
                  className="ml-1 flex items-center gap-[0.35rem]"
                  data-tab-action=""
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  {" "}
                  <span
                    role="button"
                    className="card-tool"
                    aria-label={t("aria.editSpace")}
                    title={t("aria.editSpace")}
                    onClick={() =>
                      setModal({
                        kind: "favs",
                      })
                    }
                  >
                    {" "}
                    <Pencil className="size-3.5" />
                  </span>
                </span>
              ) : null}
            </button>
            {displayTabs.map((tab, tabIndex) => (
              <Fragment key={tab.id}>
                {tabOverflow.includes(tab.id) &&
                drag?.kind === "tab" &&
                drag.id === tab.id &&
                !tabOverMore &&
                displayTabs.slice(tabIndex + 1).some((t) => !tabOverflow.includes(t.id)) ? (
                  <div className="drop-slot tab-gap">
                    <span className="drop-slot-label">{t("nav.dropHere")}</span>
                  </div>
                ) : null}
              <button
                key={tab.id}
                type="button"
                data-tab-id={tab.id}
                onClick={() => {
                  if (didDragRef.current) {
                    didDragRef.current = false;
                    return;
                  }
                  goTab(tab.id);
                }}
                onPointerDown={(e) => {
                  if (!canReorderTabs) return;
                  if ((e.target as HTMLElement).closest("[data-tab-action]")) return;
                  lockSelection(e);
                  didDragRef.current = false;
                  dragOriginRef.current = {
                    x: e.clientX,
                    y: e.clientY,
                  };
                  writeEditMode(true);
                  setDrag({
                    kind: "tab",
                    id: tab.id,
                  });
                  tabInsertRef.current = tabIndex;
                  setOver({
                    kind: "tab",
                    insertAt: tabIndex,
                  });
                  bindTabDrag(tab.id, e.currentTarget);
                }}
                className={`tab-item ${canReorderTabs ? "cursor-grab touch-none active:cursor-grabbing" : ""} ${drag?.kind === "tab" && drag.id === tab.id ? "is-src" : ""} ${carryDestTabId === tab.id ? "is-drop" : ""} ${tab.id === data.activeTabId && page !== "favs" ? "is-on" : searching && searchHits.some((h) => h.id === tab.id) ? "text-fg" : searching ? "text-subtle" : ""} ${tab.hideLabel ? "is-icon" : ""} ${tabOverflow.includes(tab.id) ? "is-overflow" : ""}`}
                title={tab.name}
                aria-label={tab.name}
              >
                {canReorderTabs ? (
                  <GripVertical className="tab-ico text-subtle" aria-hidden />
                ) : null}{" "}
                <PortalIcon name={tab.icon} className="tab-ico" />
                {tab.hideLabel ? null : <span className="tab-item-name">{tab.name}</span>}
                {tab.restricted ? (
                  <span title={t("aria.restrictedTab")}>
                    <Lock className="tab-ico text-muted" aria-label={t("aria.restrictedTab")} />
                  </span>
                ) : null}
                {editMode &&
                  tab.id === data.activeTabId &&
                  (session?.role === "admin" || session?.tabPerms?.[tab.id] === "edit") && (
                    <span
                      className="ml-1 flex items-center gap-[0.35rem]"
                      data-tab-action=""
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      {" "}
                      {session?.role === "admin" || session?.canCreateTabs ? (
                        <span
                          role="button"
                          className="card-tool"
                          aria-label={t("aria.duplicateSpace")}
                          title={t("aria.duplicateSpace")}
                          onClick={() => duplicateSpace(tab)}
                        >
                          {" "}
                          <Copy className="size-3.5" />
                        </span>
                      ) : null}{" "}
                      <span
                        role="button"
                        className="card-tool"
                        aria-label={t("aria.editSpace")}
                        title={t("aria.editSpace")}
                        onClick={() =>
                          setModal({
                            kind: "tab",
                            tab,
                          })
                        }
                      >
                        {" "}
                        <Pencil className="size-3.5" />
                      </span>
                      {data.tabs.length > 1 && (
                        <span
                          role="button"
                          className="card-tool is-danger"
                          aria-label={t("aria.deleteSpace")}
                          title={t("aria.deleteSpace")}
                          onClick={() =>
                            setModal({
                              kind: "confirm-tab",
                              tab,
                            })
                          }
                        >
                          {" "}
                          <Trash2 className="size-3.5" />
                        </span>
                      )}
                    </span>
                  )}
              </button>
              </Fragment>
            ))}
            </div>
            <div className="tab-row-end">
            <div ref={tabMoreRef} className="tab-more-wrap" data-tab-slot="more">
              <button
                type="button"
                className={`tab-item tab-more ${tabOverflow.length ? "" : "is-off"}`}
                aria-label={t("nav.moreSpaces")}
                title={t("nav.moreSpaces")}
                aria-haspopup="menu"
                aria-expanded={moreOpen}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setMoreOpen((v) => !v);
                }}
              >
                <MoreHorizontal className="tab-ico" />
                {tabOverflow.length > 1 ? (
                  <span className="count-chip">{tabOverflow.length}</span>
                ) : null}
              </button>
              {moreOpen && tabOverflow.length && typeof document !== "undefined"
                ? createPortal(
                    <div
                      ref={morePanelRef}
                      className="account-panel tab-more-panel"
                      role="menu"
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <p className="menu-kicker">{t("nav.moreSpaces")}</p>
                      {moreMenuTabs.map((tab, i) => (
                        <Fragment key={tab.id}>
                          {moreGapAt === i ? (
                            <div className="drop-slot tab-more-gap">
                              <span className="drop-slot-label">{t("nav.dropHere")}</span>
                            </div>
                          ) : null}
                          <button
                            type="button"
                            data-tab-id={tab.id}
                            role="menuitem"
                            className={`${canReorderTabs ? "cursor-grab touch-none active:cursor-grabbing" : ""} ${carryDestTabId === tab.id ? "is-drop" : ""}`}
                            onClick={() => {
                              if (didDragRef.current) {
                                didDragRef.current = false;
                                return;
                              }
                              goTab(tab.id);
                              setMoreOpen(false);
                            }}
                            onPointerDown={(e) => {
                              if (!canReorderTabs) return;
                              e.stopPropagation();
                              lockSelection(e);
                              didDragRef.current = false;
                              dragOriginRef.current = {
                                x: e.clientX,
                                y: e.clientY,
                              };
                              writeEditMode(true);
                              tabOverMoreRef.current = true;
                              setTabOverMore(true);
                              setDrag({
                                kind: "tab",
                                id: tab.id,
                              });
                              const idx = displayTabs.findIndex((t) => t.id === tab.id);
                              tabInsertRef.current = idx < 0 ? displayTabs.length : idx;
                              setOver({
                                kind: "tab",
                                insertAt: idx < 0 ? displayTabs.length : idx,
                              });
                              bindTabDrag(tab.id, e.currentTarget);
                            }}
                          >
                            {canReorderTabs ? (
                              <GripVertical className="tab-ico text-subtle" aria-hidden />
                            ) : null}
                            <PortalIcon name={tab.icon} className="tab-ico" />
                            <span className="min-w-0 truncate">{tab.name}</span>
                            {tab.restricted ? (
                              <Lock className="tab-ico ml-auto text-muted" aria-hidden />
                            ) : null}
                          </button>
                        </Fragment>
                      ))}
                      {moreGapAt === moreMenuTabs.length ? (
                        <div className="drop-slot tab-more-gap">
                          <span className="drop-slot-label">{t("nav.dropHere")}</span>
                        </div>
                      ) : null}
                    </div>,
                    document.body,
                  )
                : null}
            </div>
            {editMode && (session?.role === "admin" || session?.canCreateTabs) && (
              <button
                type="button"
                data-tab-slot="plus"
                onClick={() =>
                  setModal({
                    kind: "tab",
                  })
                }
                className="flex h-10 shrink-0 items-center gap-1 border-b-2 border-transparent px-3 text-sm text-muted hover:text-fg"
              >
                {" "}
                <Plus className="size-4" />
                {t("nav.space")}
              </button>
            )}
            </div>
          </div>
        )}
      </header>{" "}
      <main
        className={`mx-auto max-w-6xl px-4 py-10 sm:px-6 ${data.settings.infoBar !== false ? "pb-16" : ""}`}
      >
        {onFavs ? (
          <div>
            {favGroups.length === 0 ? (
              <div className="empty-page">
                {" "}
                <div className="empty-page-mark">
                  {" "}
                  <Star className="size-7" />
                </div>{" "}
                <p>{t("empty.favs")}</p>
              </div>
            ) : (
              <div className="space-y-12">
                {favGroups.map((group) => (
                  <section key={`${group.tab.id}:${group.cat.id}`} className="cat-section">
                    {" "}
                    <div className="cat-head">
                      {" "}
                      <div className="cat-head-main">
                        {" "}
                        <button
                          type="button"
                          onClick={() => goTab(group.tab.id)}
                          className="flex min-w-0 items-center gap-3 text-muted hover:text-fg"
                        >
                          {" "}
                          <span className="portal-mark flex size-9 items-center justify-center rounded-lg text-fg">
                            {" "}
                            <PortalIcon name={group.tab.icon} className="size-4" />
                          </span>{" "}
                          <span className="truncate text-xl font-semibold tracking-tight">
                            {group.tab.name}
                          </span>
                        </button>{" "}
                        <span className="text-subtle">/</span>
                        <span className="portal-mark flex size-9 items-center justify-center rounded-lg text-fg">
                          {" "}
                          <PortalIcon name={group.cat.icon} className="size-4" />
                        </span>{" "}
                        <h2 className="truncate text-xl font-semibold tracking-tight">
                          {group.cat.name}
                        </h2>
                        {data.settings.catCounts ? (
                          <span className="count-chip" data-tone={tagTone(group.cat.name)}>
                            {group.apps.length}
                          </span>
                        ) : null}
                      </div>
                    </div>{" "}
                    <div className={ITEM_GRID}>
                      {group.apps.map((app) => (
                        <AppCard
                          key={app.id}
                          app={app}
                          editMode={false}
                          className={itemSpanClass(app)}
                          onTag={toggleTag}
                          activeTags={tagFilter}
                          tagColors={data.settings.tagColors}
                          tagsAlpha={data.settings.tagsAlpha !== false}
                          cardIconBg={data.settings.cardIconBg !== false}
                          health={data.settings.healthChecks ? health[app.id] : void 0}
                          healthPending={
                            data.settings.healthChecks && app.check !== "off" && !health[app.id]
                          }
                          showHealth={data.settings.healthChecks}
                          showClicks={data.settings.usageStats}
                          favorite={favSet.has(app.id)}
                          onFavorite={
                            allowsFavorite(app, data.settings) ? () => toggleFav(app.id) : void 0
                          }
                          onRecheck={() => void recheckApp(app)}
                          onOpen={() => bumpClick(app)}
                          dimMenu={Boolean(data.settings.annexFade)}
                          ctxMenu={data.settings.cardContextMenu !== false}
                          onEdit={() => void 0}
                          onDelete={() => void 0}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        ) : (
            searching
              ? filtered.length === 0
              : editMode
                ? filtered.length === 0
                : !displayCategories.some((c) => c.apps.length)
          ) ? (
          searching ? (
            <p className="py-16 text-center text-sm text-muted">
              {t("empty.noResults")}
              {query.trim()
                ? t("empty.forQuery", {
                    q: query.trim(),
                  })
                : ""}
              {tagFilter.length
                ? t(tagFilter.length > 1 ? "empty.withTags" : "empty.withTag", {
                    tags: tagFilter.join(" + "),
                  })
                : ""}
              {downFilter ? t("empty.amongDown") : ""}
            </p>
          ) : editMode ? (
            <EmptyState
              editMode={canEditActive}
              onAdd={
                canEditActive
                  ? () =>
                      setModal({
                        kind: "category",
                      })
                  : void 0
              }
            />
          ) : null
        ) : searching ? (
          <div className="space-y-14">
            {" "}
            <p className="text-sm text-muted">
              {tp(
                "empty.hits",
                searchHits.reduce(
                  (n, tab) => n + tab.categories.reduce((m, c) => m + c.apps.length, 0),
                  0,
                ),
              )}{" "}
              {tp("empty.inSpaces", searchHits.length)}
            </p>
            {searchHits.map((tab) => (
              <div key={tab.id} className="space-y-10">
                {" "}
                <button
                  type="button"
                  onClick={() => goTab(tab.id)}
                  className="flex items-center gap-2 text-sm font-medium text-muted hover:text-fg"
                >
                  {" "}
                  <PortalIcon name={tab.icon} className="size-4" />
                  {tab.name}
                  <span className="count-chip" data-tone={tagTone(tab.name)}>
                    {tab.categories.reduce((n, c) => n + c.apps.length, 0)}
                  </span>
                </button>
                {tab.categories.map((cat) => (
                  <section key={cat.id} className="cat-section">
                    {" "}
                    <div className="cat-head">
                      {" "}
                      <div className="cat-head-main">
                        {" "}
                        <span className="portal-mark flex size-9 items-center justify-center rounded-lg text-fg">
                          {" "}
                          <PortalIcon name={cat.icon} className="size-4" />
                        </span>{" "}
                        <h2 className="truncate text-xl font-semibold tracking-tight">
                          {cat.name}
                        </h2>
                        {data.settings.catCounts ? (
                          <span className="count-chip" data-tone={tagTone(cat.name)}>
                            {cat.apps.length}
                          </span>
                        ) : null}
                      </div>
                      {editMode && canEditTab(tab.id) ? (
                        <div className="flex items-center gap-[0.35rem]">
                          {" "}
                          <button
                            type="button"
                            className="card-tool"
                            aria-label={t("actions.addCard")}
                            title={t("actions.addCard")}
                            onClick={() =>
                              setModal({
                                kind: "app",
                                categoryId: cat.id,
                              })
                            }
                          >
                            {" "}
                            <Plus className="size-3.5" />
                          </button>{" "}
                          <button
                            type="button"
                            className="card-tool"
                            aria-label={t("access.moveSection")}
                            title={t("access.moveSection")}
                            onClick={() =>
                              setModal({
                                kind: "move-pick",
                                category: cat,
                                fromTabId: tab.id,
                              })
                            }
                          >
                            {" "}
                            <ArrowRightLeft className="size-3.5" />
                          </button>{" "}
                          {cat.apps.length ? (
                            <>
                              {catSortButton(cat)}{" "}
                              <button
                                type="button"
                                className="card-tool"
                                aria-label={t("cat.resetLayout")}
                                title={t("cat.resetLayout")}
                                onClick={() => void resetCategoryCards(cat)}
                                onPointerDown={(e) => e.stopPropagation()}
                              >
                                <LayoutGrid className="size-3.5" />
                              </button>{" "}
                            </>
                          ) : null}
                          <button
                            type="button"
                            className="card-tool"
                            aria-label={t("actions.duplicate")}
                            title={t("actions.duplicate")}
                            onClick={() => duplicateCategory(cat, tab.id)}
                          >
                            {" "}
                            <Copy className="size-3.5" />
                          </button>{" "}
                          <button
                            type="button"
                            className="card-tool"
                            aria-label={t("aria.editCategory")}
                            title={t("aria.editCategory")}
                            onClick={() =>
                              setModal({
                                kind: "category",
                                category: cat,
                              })
                            }
                          >
                            {" "}
                            <Pencil className="size-3.5" />
                          </button>{" "}
                          <button
                            type="button"
                            className="card-tool is-danger"
                            aria-label={t("aria.deleteCategory")}
                            title={t("aria.deleteCategory")}
                            onClick={() =>
                              setModal({
                                kind: "confirm-cat",
                                category: cat,
                              })
                            }
                          >
                            {" "}
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      ) : null}
                    </div>{" "}
                    <div className={ITEM_GRID}>
                      {cat.apps.map((app) => (
                        <AppCard
                          key={app.id}
                          app={app}
                          editMode={editMode && canEditTab(tab.id)}
                          className={itemSpanClass(app)}
                          onTag={toggleTag}
                          activeTags={tagFilter}
                          tagColors={data.settings.tagColors}
                          tagsAlpha={data.settings.tagsAlpha !== false}
                          cardIconBg={data.settings.cardIconBg !== false}
                          health={data.settings.healthChecks ? health[app.id] : void 0}
                          healthPending={
                            data.settings.healthChecks && app.check !== "off" && !health[app.id]
                          }
                          showHealth={data.settings.healthChecks}
                          showClicks={data.settings.usageStats}
                          favorite={favSet.has(app.id)}
                          onFavorite={
                            editMode
                              ? void 0
                              : allowsFavorite(app, data.settings)
                                ? () => toggleFav(app.id)
                                : void 0
                          }
                          onRecheck={() => void recheckApp(app)}
                          onOpen={() => bumpClick(app)}
                          dimMenu={Boolean(data.settings.annexFade)}
                          ctxMenu={data.settings.cardContextMenu !== false}
                          onEdit={() =>
                            setModal({
                              kind: "app",
                              categoryId: cat.id,
                              app,
                            })
                          }
                          onDuplicate={() => duplicateApp(app, cat.id)}
                          onDelete={() =>
                            setModal({
                              kind: "confirm-app",
                              app,
                            })
                          }
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className={drag?.kind === "cat" ? "space-y-3" : "space-y-12"}>
            {displayCategories.map((cat, catIndex) => {
              if (!editMode && cat.apps.length === 0) return null;
              if (drag?.kind === "cat" && drag.id === cat.id)
                return (
                  <div key={cat.id} data-cat-id={cat.id} className="drop-slot drop-slot-cat">
                    {" "}
                    <span className="drop-slot-label">{t("nav.dropHere")}</span>
                  </div>
                );
              const collapsed = isCatCollapsed(cat.id);
              return (
                <section
                  key={cat.id}
                  data-cat-id={cat.id}
                  className={`cat-section${drag?.kind === "app" && over?.kind === "app" && over.catId === cat.id ? " is-drop" : ""}`}
                >
                  {" "}
                  <div className={`cat-head ${collapsed ? "is-collapsed" : ""}`}>
                    {" "}
                    <div
                      data-cat-handle=""
                      className={`cat-head-main select-none ${canDrag ? "cursor-grab touch-none active:cursor-grabbing" : "cursor-pointer"}`}
                      onClick={() => {
                        if (canDrag || didDragRef.current) return;
                        toggleCollapsed(cat.id);
                      }}
                      onPointerDown={(e) => {
                        if (!canDrag) return;
                        lockSelection(e);
                        didDragRef.current = false;
                        dragOriginRef.current = {
                          x: e.clientX,
                          y: e.clientY,
                        };
                        writeEditMode(true);
                        carryRef.current = {
                          cat: {
                            ...cat,
                          },
                          fromTabId: dataRef.current.activeTabId,
                        };
                        bindCatDrag(
                          cat.id,
                          e.currentTarget.closest(".cat-head") ||
                            e.currentTarget.closest("[data-cat-id]") ||
                            e.currentTarget,
                        );
                        setDrag({
                          kind: "cat",
                          id: cat.id,
                        });
                        setOver({
                          kind: "cat",
                          insertAt: catIndex,
                        });
                      }}
                    >
                      {canDrag ? (
                        <GripVertical className="size-4 shrink-0 text-subtle" aria-hidden />
                      ) : null}{" "}
                      <span className="portal-mark flex size-9 items-center justify-center rounded-lg text-fg">
                        {" "}
                        <PortalIcon name={cat.icon} className="size-4" />
                      </span>{" "}
                      <h2 className="truncate text-xl font-semibold tracking-tight">{cat.name}</h2>{" "}
                      {data.settings.catCounts ? (
                        <span className="count-chip" data-tone={tagTone(cat.name)}>
                          {cat.apps.length}
                        </span>
                      ) : null}
                    </div>{" "}
                    <div className="flex items-center gap-[0.35rem]">
                      {" "}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={collapsed ? t("cat.expand") : t("cat.collapse")}
                        title={collapsed ? t("cat.expand") : t("cat.collapse")}
                        aria-expanded={!collapsed}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          toggleCollapsed(cat.id);
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        {" "}
                        <ChevronDown
                          className={`size-4 text-muted transition-transform ${collapsed ? "-rotate-90" : ""}`}
                        />
                      </Button>
                      {editMode && canEditActive && (
                        <>
                          {" "}
                          <button
                            type="button"
                            className="card-tool"
                            aria-label={t("actions.addCard")}
                            title={t("actions.addCard")}
                            onClick={() =>
                              setModal({
                                kind: "app",
                                categoryId: cat.id,
                              })
                            }
                          >
                            {" "}
                            <Plus className="size-3.5" />
                          </button>{" "}
                          <button
                            type="button"
                            className="card-tool"
                            aria-label={t("access.moveSection")}
                            title={t("access.moveSection")}
                            onClick={() =>
                              setModal({
                                kind: "move-pick",
                                category: cat,
                                fromTabId: data.activeTabId,
                              })
                            }
                          >
                            {" "}
                            <ArrowRightLeft className="size-3.5" />
                          </button>{" "}
                          {cat.apps.length ? (
                            <>
                              {catSortButton(cat)}{" "}
                              <button
                                type="button"
                                className="card-tool"
                                aria-label={t("cat.resetLayout")}
                                title={t("cat.resetLayout")}
                                onClick={() => void resetCategoryCards(cat)}
                                onPointerDown={(e) => e.stopPropagation()}
                              >
                                <LayoutGrid className="size-3.5" />
                              </button>{" "}
                            </>
                          ) : null}
                          <button
                            type="button"
                            className="card-tool"
                            aria-label={t("actions.duplicate")}
                            title={t("actions.duplicate")}
                            onClick={() => duplicateCategory(cat, data.activeTabId)}
                          >
                            {" "}
                            <Copy className="size-3.5" />
                          </button>{" "}
                          <button
                            type="button"
                            className="card-tool"
                            aria-label={t("aria.editCategory")}
                            title={t("aria.editCategory")}
                            onClick={() =>
                              setModal({
                                kind: "category",
                                category: cat,
                              })
                            }
                          >
                            {" "}
                            <Pencil className="size-3.5" />
                          </button>{" "}
                          <button
                            type="button"
                            className="card-tool is-danger"
                            aria-label={t("aria.deleteCategory")}
                            title={t("aria.deleteCategory")}
                            onClick={() =>
                              setModal({
                                kind: "confirm-cat",
                                category: cat,
                              })
                            }
                          >
                            {" "}
                            <Trash2 className="size-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {collapsed || drag?.kind === "cat" ? null : cat.apps.length === 0 ? (
                    <p className="empty-well flex items-center justify-center gap-1 px-4 py-8 text-center text-sm text-muted">
                      {canDrag
                        ? [t("empty.noCardsDrop"), " ", <Plus className="size-3.5" />]
                        : t("empty.noCardsAdd")}
                    </p>
                  ) : (
                    <div data-app-grid="" className={ITEM_GRID}>
                      {cat.apps.map((app) => (
                        <AppCard
                          key={app.id}
                          app={app}
                          editMode={editMode && canEditActive}
                          canDrag={canDrag}
                          canResize={canResize && app.kind !== "app"}
                          dragging={drag?.kind === "app" && drag.id === app.id}
                          className={itemSpanClass(app)}
                          onTag={toggleTag}
                          activeTags={tagFilter}
                          tagColors={data.settings.tagColors}
                          tagsAlpha={data.settings.tagsAlpha !== false}
                          cardIconBg={data.settings.cardIconBg !== false}
                          health={data.settings.healthChecks ? health[app.id] : void 0}
                          healthPending={
                            data.settings.healthChecks && app.check !== "off" && !health[app.id]
                          }
                          showHealth={data.settings.healthChecks}
                          showClicks={data.settings.usageStats}
                          favorite={favSet.has(app.id)}
                          onFavorite={
                            editMode
                              ? void 0
                              : allowsFavorite(app, data.settings)
                                ? () => toggleFav(app.id)
                                : void 0
                          }
                          onRecheck={() => void recheckApp(app)}
                          onOpen={() => bumpClick(app)}
                          dimMenu={Boolean(data.settings.annexFade)}
                          ctxMenu={data.settings.cardContextMenu !== false}
                          onPointerDown={(e) => {
                            if (!canDrag) return;
                            if ((e.target as HTMLElement).closest("button")) return;
                            if (e.button != null && e.button !== 0) return;
                            if (canResize && e.pointerType !== "touch" && finePointer()) {
                              const edge = cardResizeEdge(e.currentTarget, e.clientX, e.clientY);
                              if (edge) {
                                lockSelection(e);
                                bindAppResize(app, e.currentTarget, edge, e);
                                return;
                              }
                            }
                            lockSelection(e);
                            didDragRef.current = false;
                            dragOriginRef.current = {
                              x: e.clientX,
                              y: e.clientY,
                            };
                            writeEditMode(true);
                            carryRef.current = {
                              app: {
                                ...app,
                              },
                              fromTabId: dataRef.current.activeTabId,
                            };
                            setDrag({
                              kind: "app",
                              id: app.id,
                            });
                            const from = dataRef.current.categories.find((c) =>
                              c.apps.some((a) => a.id === app.id),
                            );
                            setOver({
                              kind: "app",
                              catId: from?.id ?? cat.id,
                              insertAt: from?.apps.findIndex((a) => a.id === app.id) ?? 0,
                            });
                            bindAppDrag(app.id, e.currentTarget);
                          }}
                          onEdit={() =>
                            setModal({
                              kind: "app",
                              categoryId: cat.id,
                              app,
                            })
                          }
                          onDuplicate={() => duplicateApp(app, cat.id)}
                          onDelete={() =>
                            setModal({
                              kind: "confirm-app",
                              app,
                            })
                          }
                        />
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
            {editMode && canEditActive && !searching ? (
              <EmptyState
                editMode
                compact
                onAdd={() =>
                  setModal({
                    kind: "category",
                  })
                }
              />
            ) : null}
          </div>
        )}
      </main>{" "}
      <StatsBar
        stats={clickStats}
        infoBar={data.settings.infoBar !== false}
        downCount={
          data.settings.infoBar !== false && data.settings.healthChecks !== false
            ? downIds.length
            : 0
        }
        downOn={downFilter}
        probeBlink={Boolean(data.settings.probeBlink)}
        geekTip={data.settings.infoGeek !== false}
        onDown={() => setDownFilter((v) => !v)}
        onStats={
          data.settings.infoBar !== false && data.settings.infoStats !== false
            ? () =>
                setModal({
                  kind: "stats",
                })
            : void 0
        }
      />
      {modal.kind !== "none" && (
        <ModalShell
          wide={
            modal.kind === "admin" ||
            modal.kind === "stats" ||
            modal.kind === "app" ||
            modal.kind === "history" ||
            modal.kind === "curation" ||
            modal.kind === "users"
          }
          onClose={() => {
            setBusy(false);
            setModal({
              kind: "none",
            });
          }}
        >
          {modal.kind === "lock" && (
            <LockForm
              busy={busy}
              oidcEnabled={Boolean(data.settings.oidcEnabled)}
              oidcAutoRedirect={Boolean(data.settings.oidcAutoRedirect)}
              oidcLabel={data.settings.oidcLabel || "SSO"}
              ldapEnabled={Boolean(data.settings.ldapEnabled)}
              ldapDomain={data.settings.ldapDomain || ""}
              ldapRealms={data.settings.ldapRealms || []}
              loginOrder={data.settings.loginOrder}
              noPassword={Boolean(data.runtime?.isDev && data.settings.devAdminNoPassword)}
              onCancel={() =>
                setModal({
                  kind: "none",
                })
              }
              onOidc={async () => {
                setBusy(true);
                try {
                  try {
                    sessionStorage.setItem(OIDC_NEXT_KEY, (modal.next as string) || "session");
                  } catch {
                    // ignore
                  }
                  const res = await startOidc({
                    data: {},
                  });
                  if (!res?.url) throw new Error("errors.oidcFail");
                  window.location.assign(res.url);
                } catch (err) {
                  toast.error(te(err));
                  setBusy(false);
                }
              }}
              onUnlock={async (username, password, domain) => {
                setBusy(true);
                try {
                  const res = await Promise.race([
                    unlockEdit({
                      data: {
                        username,
                        password,
                        domain: domain === "ad" ? "ad" : "local",
                      },
                    }),
                    new Promise<never>((_, reject) => {
                      window.setTimeout(() => reject(new Error("errors.timeout")), 12e3);
                    }),
                  ]);
                  if (res.sessionHttpOnly) {
                    await pinSessCookie(res.token);
                    try {
                      sessionStorage.removeItem(TOKEN_KEY);
                    } catch {
                      // ignore
                    }
                  } else {
                    try {
                      sessionStorage.setItem(TOKEN_KEY, res.token);
                    } catch {
                      // ignore
                    }
                  }
                  setToken(res.token);
                  setSession(res.session);
                  writeSessionInfo(res.session);
                  const next = await getPortal({
                    data: {
                      token: res.token,
                      tabId: data.activeTabId,
                    },
                  });
                  setData(next);
                  if (modal.next === "admin")
                    setModal({
                      kind: "admin",
                      tab: res.session?.canManageSettings ? adminTabRef.current : "about",
                    });
                  else if (modal.next === "history")
                    setModal({
                      kind: "history",
                      tab: "recovery",
                    });
                  else if (modal.next === "users" && res.session?.canManageUsers)
                    setModal({
                      kind: "users",
                    });
                  else if (modal.next === "curation" && res.session?.canCuration)
                    setModal({
                      kind: "curation",
                    });
                  else if (modal.next === "edit" && res.session?.canEdit) {
                    enterEdit();
                    setModal({
                      kind: "none",
                    });
                  } else
                    setModal({
                      kind: "none",
                    });
                } catch (err) {
                  toast.error(te(err));
                } finally {
                  setBusy(false);
                }
              }}
            />
          )}
          {modal.kind === "stats" && (
            <StatsPanel
              catalog={data.catalog}
              scoped={clickStats.fullCatalog === false}
              onClose={() =>
                setModal({
                  kind: "none",
                })
              }
            />
          )}
          {modal.kind === "users" && (
            <AccessFrame
              token={token}
              session={session}
              tabs={data.tabs}
              settings={data.settings}
              busy={busy}
              onClose={() =>
                setModal({
                  kind: "none",
                })
              }
              onSaveOidc={(payload) =>
                apply(
                  async () => {
                    const next = await updateOidcSettings({
                      data: {
                        token,
                        tabId: data.activeTabId,
                        ...payload,
                      },
                    });
                    toast.success(t("toast.saved"));
                    return next;
                  },
                  {
                    close: false,
                  },
                )
              }
              onSaveLdap={(payload) =>
                apply(
                  async () => {
                    const next = await updateLdapSettings({
                      data: {
                        token,
                        tabId: data.activeTabId,
                        ...payload,
                      },
                    });
                    toast.success(t("toast.saved"));
                    return next;
                  },
                  {
                    close: false,
                  },
                )
              }
              onSaveLoginOrder={(loginOrder) =>
                apply(
                  async () => {
                    const next = await updateLoginOrder({
                      data: {
                        token,
                        tabId: data.activeTabId,
                        loginOrder,
                      },
                    });
                    return next;
                  },
                  {
                    close: false,
                  },
                )
              }
            />
          )}
          {modal.kind === "history" && (
            <HistoryPanel
              key={(modal.tab as string) || "recovery"}
              token={token}
              tab={(modal.tab as string) || "recovery"}
              onClose={() =>
                setModal({
                  kind: "none",
                })
              }
              onRestored={(next: PortalData) => {
                setData(next);
                if (next.session) {
                  setSession(next.session);
                  writeSessionInfo(next.session);
                }
              }}
            />
          )}
          {modal.kind === "curation" && (
            <CurationPanel
              token={token}
              busy={busy}
              tabPerms={session?.tabPerms || {}}
              picker={picker}
              catalog={data.catalog}
              probes={data.settings.healthChecks !== false}
              knownTags={allTags}
              tagColors={data.settings.tagColors}
              editContext={(cardId) => {
                for (const tb of data.catalog) {
                  for (const cat of tb.categories) {
                    const app = cat.apps.find((a) => a.id === cardId);
                    if (app) {
                      return {
                        app,
                        categoryId: cat.id,
                        categories: data.categories.some((c) => c.id === cat.id) ? data.categories : tb.categories,
                      };
                    }
                  }
                }
                return null;
              }}
              onSaveCard={(app, payload, onDone) =>
                apply(() => updateApp({ data: { token, id: app.id, ...payload } }), {
                  close: false,
                  onDone,
                })
              }
              onClose={() =>
                setModal({
                  kind: "none",
                })
              }
            />
          )}
          {modal.kind === "admin" && (
            <AdminPanel
              tab={(modal.tab as string) || "general"}
              settings={data.settings}
              runtime={data.runtime}
              catalog={data.catalog}
              tags={allTags}
              tabs={data.tabs}
              directory={data.directory || []}
              token={token}
              session={session}
              busy={busy}
              onTab={(tab: string) =>
                setModal({
                  kind: "admin",
                  tab,
                })
              }
              onCancel={() =>
                setModal({
                  kind: "none",
                })
              }
              onSaveSettings={(payload, opts) =>
                apply(
                  () =>
                    updateSettings({
                      data: {
                        token,
                        tabId: data.activeTabId,
                        ...payload,
                      },
                    }),
                  opts,
                )
              }
              onResetClicks={async () => {
                setBusy(true);
                try {
                  const next = await resetClicks({
                    data: {
                      token,
                      tabId: data.activeTabId,
                    },
                  });
                  setData(next);
                  if (next.clickStats) setClickStats(next.clickStats);
                  else
                    setClickStats({
                      all: 0,
                      today: 0,
                      week: 0,
                      month: 0,
                      year: 0,
                      spanDays: 0,
                    });
                  toast.success(t("toast.clicksReset"));
                } catch (err) {
                  if (sessionGone(err)) return;
                  toast.error(te(err));
                } finally {
                  setBusy(false);
                }
              }}
              onApplyTags={async (payload) => {
                const colorOnly =
                  Boolean(payload.colors) && !payload.rename && !payload.remove && !payload.create;
                if (!colorOnly) setBusy(true);
                try {
                  const next = await manageTags({
                    data: {
                      token,
                      tabId: data.activeTabId,
                      ...payload,
                    },
                  });
                  setData(next);
                  if (!colorOnly) toast.success(t("toast.tagsUpdated"));
                } catch (err) {
                  if (sessionGone(err)) return;
                  toast.error(te(err));
                } finally {
                  if (!colorOnly) setBusy(false);
                }
              }}
              onSaveTheme={(payload) =>
                apply(
                  async () => {
                    const next = await updateThemeCss({
                      data: {
                        token,
                        tabId: data.activeTabId,
                        ...payload,
                      },
                    });
                    toast.success(t("toast.themesSaved"));
                    return next;
                  },
                  {
                    close: false,
                  },
                )
              }
              onResetPortal={() =>
                apply(async () => {
                  const next = await resetPortal({
                    data: {
                      token,
                    },
                  });
                  if (next.clickStats) setClickStats(next.clickStats);
                  toast.success(t("toast.portalReset"));
                  return next;
                })
              }
              onImportPortal={(payload) =>
                apply(async () => {
                  const next = await importPortal({
                    data: {
                      token,
                      payload,
                    },
                  });
                  if (next.clickStats) setClickStats(next.clickStats);
                  toast.success(t("toast.imported"));
                  return next;
                })
              }
            />
          )}
          {modal.kind === "tab" && (
            <ItemForm
              kind="tab"
              initial={(modal.tab as MenuTab | null) ?? null}
              busy={busy}
              picker={picker}
              canAcl={session?.role === "admin"}
              people={data.directory || []}
              onCancel={() =>
                setModal({
                  kind: "none",
                })
              }
              onSave={(name, icon, access) =>
                apply(() =>
                  modal.tab
                    ? updateTab({
                        data: {
                          token,
                          id: (modal.tab as MenuTab).id,
                          name,
                          icon,
                          ...access,
                        },
                      })
                    : createTab({
                        data: {
                          token,
                          name,
                          icon,
                          ...access,
                        },
                      }),
                )
              }
            />
          )}
          {modal.kind === "favs" && (
            <FavsForm
              hideLabel={Boolean(data.settings.favsHideLabel)}
              busy={busy}
              onCancel={() =>
                setModal({
                  kind: "none",
                })
              }
              onSave={(hideLabel) =>
                apply(() =>
                  updateFavsOptions({
                    data: {
                      token,
                      hideLabel,
                      tabId: data.activeTabId,
                    },
                  }),
                )
              }
            />
          )}
          {modal.kind === "category" && (
            <ItemForm
              kind="category"
              initial={(modal.category as PortalCategory | null) ?? null}
              busy={busy}
              picker={picker}
              canAcl={session?.role === "admin"}
              people={data.directory || []}
              onCancel={() =>
                setModal({
                  kind: "none",
                })
              }
              onSave={(name, icon, access) =>
                apply(() =>
                  modal.category
                    ? updateCategory({
                        data: {
                          token,
                          id: (modal.category as PortalCategory).id,
                          name,
                          icon,
                          ...access,
                        },
                      })
                    : createCategory({
                        data: {
                          token,
                          tabId: data.activeTabId,
                          name,
                          icon,
                          ...access,
                        },
                      }),
                )
              }
            />
          )}
          {modal.kind === "app" && (
            <CardForm
              categories={
                modal.app && !data.categories.some((c) => c.id === (modal.app as PortalApp).categoryId)
                  ? (data.catalog.find((tb) =>
                      tb.categories.some((c) => c.id === (modal.app as PortalApp).categoryId),
                    )?.categories ?? data.categories)
                  : data.categories
              }
              categoryId={(modal.categoryId as string) || ""}
              catalog={data.catalog}
              initial={(modal.app as PortalApp | null) ?? null}
              busy={busy}
              picker={picker}
              probes={data.settings.healthChecks !== false}
              knownTags={allTags}
              tagColors={data.settings.tagColors}
              onCancel={() =>
                setModal({
                  kind: "none",
                })
              }
              onSave={(payload) =>
                apply(() =>
                  modal.app
                    ? updateApp({
                        data: {
                          token,
                          id: (modal.app as PortalApp).id,
                          ...payload,
                        },
                      })
                    : createApp({
                        data: {
                          token,
                          ...payload,
                        },
                      }),
                )
              }
            />
          )}
          {modal.kind === "move-pick" && (
            <MovePickDialog
              category={modal.category as Category | null | undefined}
              tabs={data.tabs}
              fromTabId={modal.fromTabId as string | undefined}
              busy={busy}
              onCancel={() =>
                setModal({
                  kind: "none",
                })
              }
              onContinue={(destTabId) =>
                openMoveCat(
                  modal.category as PortalCategory,
                  modal.fromTabId as string | undefined,
                  destTabId,
                  undefined,
                )
              }
            />
          )}
          {modal.kind === "move-cat" && (
            <MoveSectionDialog
              impact={modal.impact as CategoryMoveImpact & { insertAt?: number }}
              busy={busy}
              onCancel={() =>
                setModal({
                  kind: "none",
                })
              }
              onConfirm={() =>
                apply(() =>
                  moveCategory({
                    data: {
                      token,
                      categoryId: (modal.impact as CategoryMoveImpact).categoryId,
                      destTabId: (modal.impact as CategoryMoveImpact).toId,
                      ...(typeof (modal.impact as { insertAt?: number }).insertAt === "number"
                        ? { insertAt: (modal.impact as { insertAt?: number }).insertAt }
                        : {}),
                    },
                  }),
                )
              }
            />
          )}
          {modal.kind === "confirm-cat" && (
            <ConfirmDialog
              inline
              title={t("confirm.deleteCategory")}
              body={t("confirm.deleteCategoryBody", {
                name: (modal.category as PortalCategory).name,
              })}
              busy={busy}
              onCancel={() =>
                setModal({
                  kind: "none",
                })
              }
              onOk={() =>
                apply(() =>
                  deleteCategory({
                    data: {
                      token,
                      id: (modal.category as PortalCategory).id,
                    },
                  }),
                )
              }
            />
          )}
          {modal.kind === "confirm-app" && (
            <ConfirmDialog
              inline
              title={itemKind((modal.app as PortalApp).kind).remove}
              body={t("item.removedBody", {
                name:
                String((modal.app as PortalApp).title || "").trim() ||
                itemKind((modal.app as PortalApp).kind).option,
              })}
              busy={busy}
              onCancel={() =>
                setModal({
                  kind: "none",
                })
              }
              onOk={() =>
                apply(() =>
                  deleteApp({
                    data: {
                      token,
                      id: (modal.app as PortalApp).id,
                    },
                  }),
                )
              }
            />
          )}
          {modal.kind === "confirm-tab" && (
            <ConfirmDialog
              inline
              title={t("confirm.deleteSpace")}
              body={t("confirm.deleteSpaceBody", {
                name: (modal.tab as MenuTab).name,
              })}
              busy={busy}
              onCancel={() =>
                setModal({
                  kind: "none",
                })
              }
              onOk={() =>
                apply(() =>
                  deleteTab({
                    data: {
                      token,
                      id: (modal.tab as MenuTab).id,
                    },
                  }),
                )
              }
            />
          )}
        </ModalShell>
      )}
    </div>
  );
}
function StatusMark({
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
function FavStar({ on, onToggle }: { on: boolean; onToggle: () => void }) {
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
      {" "}
      <Star className="size-3.5" fill={on ? "currentColor" : "none"} />
    </button>
  );
}
type AppCardMenu = { x: number; y: number };
type AppCardProps = {
  app: PortalApp;
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
  cardIconBg?: boolean;
};
function AppCard({
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
      <div data-app-id={app.id} data-app-card="" className={`drop-slot ${className ?? ""}`}>
        {" "}
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
            {" "}
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
      className={`card-tool${menu ? " is-open" : ""}`}
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
      {" "}
      <Menu className="size-3.5" />
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
            {" "}
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
              {" "}
              <Copy className="size-3.5" />
            </button>{" "}
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
              {" "}
              <Pencil className="size-3.5" />
            </button>{" "}
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
              {" "}
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
      {" "}
      <PortalIcon name={app.icon} className="size-7" />
    </span>
  );
  const appCopy = (
    <div className="min-w-0 flex-1 pt-0.5">
      {" "}
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
              {" "}
              <FileText className="size-4" />
              <h3 className="truncate font-medium tracking-tight text-fg">{app.title}</h3>
            </div>
          ) : editMode ? (
            <div className="note-title invisible mb-2 flex items-center gap-2 text-muted">
              <FileText className="size-4" />
              <h3 className="truncate font-medium tracking-tight text-fg">—</h3>
            </div>
          ) : null}{" "}
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
        {" "}
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
          <Link className="size-4 shrink-0" aria-hidden />
          <span className="card-ctx-copy-text min-w-0">
            <span className="card-ctx-name truncate">{label}</span>
            <span className="card-ctx-url truncate">{safe}</span>
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
  const primaryLabel = String(extra[0]?.title || "").trim() || String(app.title || "").trim();
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
              <div className="menu-sep" />
              {showPrimary ? ctxRow(primaryHref, primaryLabel || t("annex.one"), "primary", app.links[0]?.openIn) : null}
              {showPrimary && extraLinks.length ? <div className="menu-sep" /> : null}
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
      <div data-app-id={app.id} className={shell} onContextMenu={onCtx}>
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
        ) : null}{" "}
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
      data-app-id={app.id}
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
function BrandPick({
  label,
  hint,
  resetLabel,
  accept,
  src,
  variant,
  onFile,
  onReset,
  children,
}: {
  label: string;
  hint?: string;
  resetLabel: string;
  accept: string;
  src: string;
  variant?: string;
  onFile: (file: File) => Promise<void>;
  onReset: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="brand-slot">
      {" "}
      <span>{label}</span>
      <label
        className={`brand-preview${variant === "tab" ? " is-tab" : ""}`}
        title={t("settings.importBrand", { label: label.toLowerCase() })}
      >
        {children}
        <Upload className="brand-preview-action size-3.5" aria-hidden />
        <input
          type="file"
          accept={accept}
          className="hidden"
          aria-label={t("settings.importBrand", { label: label.toLowerCase() })}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try {
              await onFile(file);
            } catch (err) {
              toast.error(te(err));
            }
          }}
        />
      </label>
      {src ? (
        <button type="button" className="settings-link" onClick={onReset}>
          {resetLabel}
        </button>
      ) : (
        <p className="settings-hint">{hint}</p>
      )}
    </div>
  );
}
function settingsSections() {
  const raw: [string, typeof Settings2][] = [
    ["general", Settings2],
    ["locales", Globe],
    ["themes", Palette],
    ["presentation", Sparkles],
    ["reachability", Activity],
    ["tags", Tags],
    ["security", Shield],
    ["debug", Bug],
    ["info", MousePointerClick],
    ["backup", Download],
    ["reset", RotateCcw],
    ["about", BadgeInfo],
  ];
  return raw.map(([id, icon]) => ({
    id,
    icon,
    label: t(`sections.${id}.label`),
    lead: t(`sections.${id}.lead`),
  }));
}
function collectTopApps(catalog: CatalogTab[] | null | undefined, limit = 10) {
  const rows: { id: string; title: string; icon: string; tab: string; clicks: number }[] = [];
  for (const tab of catalog ?? [])
    for (const cat of tab.categories)
      for (const app of cat.apps) {
        if ((app.kind || "app") !== "app") continue;
        rows.push({
          id: app.id,
          title: app.title,
          icon: app.icon,
          tab: tab.name,
          clicks: app.clicks || 0,
        });
      }
  return rows
    .sort((a, b) => b.clicks - a.clicks || a.title.localeCompare(b.title, localeTag()))
    .slice(0, limit);
}
function formatHistoryWhen(at: number) {
  return formatWhen(at);
}
function historyScopeLabel(scope: string | undefined, kind: string | undefined) {
  if (scope === "tab" || kind === "tab") return t("nav.space");
  if (scope === "category" || kind === "category") return t("item.category");
  if (kind === "note") return t("history.scopeNote");
  if (kind === "embed") return t("history.scopeEmbed");
  return t("history.scopeCard");
}
function historyCountLabel(n: number | undefined) {
  if (!n) return "";
  return tp("history.cardCount", n);
}
function historyMatches(needle: string, parts: (string | undefined | null)[]) {
  if (!needle) return true;
  return parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(needle);
}
function HistoryPanel({
  token,
  tab,
  onClose,
  onRestored,
}: {
  token: string;
  tab: string;
  onClose: () => void;
  onRestored: (next: PortalData) => void;
}) {
  const [pane, setPane] = useState(tab === "audit" ? "audit" : "recovery");
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [trash, setTrash] = useState<TrashRow[]>([]);
  const [canPurge, setCanPurge] = useState(false);
  const [canAudit, setCanAudit] = useState(true);
  const [canRestore, setCanRestore] = useState(true);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  async function reload() {
    const res = await listHistory({
      data: {
        token,
      },
    });
    setAudit(res.audit || []);
    setTrash(res.trash || []);
    setCanPurge(Boolean(res.canEmpty));
    setCanAudit(res.canAudit !== false);
    setCanRestore(res.canRestore !== false);
    setReady(true);
  }
  useEffect(() => {
    reload().catch((err) => {
      setReady(true);
      if (sessionGone(err)) return;
      toast.error(te(err));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload reads latest token from props; fetch once on mount
  }, [token]);
  const needle = q.trim().toLowerCase();
  const col = useColSort();
  const trashRows = col.apply(
    (filter === "all" ? trash : trash.filter((row) => row.scope === filter)).filter((row) =>
      historyMatches(needle, [
        row.label,
        row.path,
        row.actor,
        historyScopeLabel(row.scope, row.kind),
        historyCountLabel(row.count),
        formatHistoryWhen(row.at),
      ]),
    ),
    (row, key) => {
      if (key === "a") return row.label || "";
      if (key === "b") return row.path || "";
      if (key === "date") return Number(row.at) || 0;
      return "";
    },
  );
  const auditRows = col.apply(
    audit
      .filter((row) => filter === "all" || String(row.type || "").startsWith(`${filter}.`))
      .filter((row) =>
        historyMatches(needle, [
          t(`audit.${row.type}`),
          row.label,
          row.path,
          row.actor,
          formatHistoryWhen(row.at),
        ]),
      ),
    (row, key) => {
      if (key === "a") return t(`audit.${row.type}`);
      if (key === "b") return [row.label, row.path].filter(Boolean).join(" ");
      if (key === "date") return Number(row.at) || 0;
      return "";
    },
  );
  async function restore(row: TrashRow) {
    if (busy) return;
    setBusy(true);
    try {
      const next = await restoreHistory({
        data: {
          token,
          id: row.id,
          scope: row.scope,
          targetId: row.targetId,
        },
      });
      onRestored?.(next);
      toast.success(t("history.restored"));
      await reload();
    } catch (err) {
      if (sessionGone(err)) return;
      toast.error(te(err));
    } finally {
      setBusy(false);
    }
  }
  async function downloadAudit() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await exportAudit({
        data: {
          token,
        },
      });
      const blob = new Blob([auditCsv(res.rows || [])], {
        type: "text/csv;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(t("history.exported"));
    } catch (err) {
      if (sessionGone(err)) return;
      toast.error(te(err));
    } finally {
      setBusy(false);
    }
  }
  async function purge() {
    if (!canPurge || busy) return;
    if (
      !(await askConfirm({
        title: t("actions.emptyTrash"),
        body: t("confirm.emptyTrash"),
        okLabel: t("actions.emptyTrash"),
      }))
    )
      return;
    setBusy(true);
    try {
      const res = await purgeTrash({
        data: {
          token,
        },
      });
      if (res.portal) onRestored?.(res.portal);
      setAudit(res.audit || []);
      setTrash(res.trash || []);
      toast.success(t("history.purged"));
    } catch (err) {
      if (sessionGone(err)) return;
      toast.error(te(err));
    } finally {
      setBusy(false);
    }
  }
  const current =
    pane === "audit"
      ? {
          label: t("history.audit"),
          lead: t("history.auditLead"),
        }
      : {
          label: t("history.recovery"),
          lead: t("history.recoveryLead"),
        };
  const emptyText =
    needle || filter !== "all"
      ? t("empty.noResults")
      : pane === "audit"
        ? t("history.noAudit")
        : t("history.nothing");
  const rows = pane === "audit" ? auditRows : trashRows;
  return (
    <div className="settings-frame is-wide is-access">
      <nav className="settings-nav" aria-label={t("history.sectionsAria")}>
        <p className="menu-title">{t("history.title")}</p>
        {canRestore ? (
          <button
            type="button"
            className={`settings-nav-item ${pane === "recovery" ? "is-on" : ""}`}
            onClick={() => {
              setPane("recovery");
              setQ("");
            }}
          >
            <Undo2 className="size-4 shrink-0" />
            {t("history.recovery")}
          </button>
        ) : null}
        {canAudit ? (
          <button
            type="button"
            className={`settings-nav-item ${pane === "audit" ? "is-on" : ""}`}
            onClick={() => {
              setPane("audit");
              setQ("");
            }}
          >
            <ScrollText className="size-4 shrink-0" />
            {t("history.audit")}
          </button>
        ) : null}
      </nav>
      <div className="settings-body">
        <div className="settings-head">
          <div className="settings-head-copy">
            <h3 className="dialog-title">{current.label}</h3>
            <p className="settings-lead">{current.lead}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label={t("actions.close")}
            title={t("actions.close")}
          >
            <X className="size-4" />
          </Button>
        </div>
        <div className="settings-pane is-access">
          <div className="am-work">
            <div className="am-toolbar">
              <label className="am-search">
                <Search className="size-3.5" aria-hidden />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t("nav.search")}
                  aria-label={t("nav.search")}
                />
              </label>
              <div className="am-filters" role="tablist" aria-label={t("access.filterAll")}>
                {[
                  ["all", t("access.filterAll")],
                  ["card", t("history.cards")],
                  ["category", t("history.categories")],
                  ["tab", t("history.spaces")],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={filter === id}
                    className={filter === id ? "is-on" : ""}
                    onClick={() => setFilter(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {pane === "recovery" && canPurge ? (
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  className="am-create shrink-0 ml-auto"
                  disabled={busy || trash.length === 0}
                  onClick={() => void purge()}
                >
                  <Trash2 className="size-3.5" />
                  {t("actions.emptyTrash")}
                </Button>
              ) : null}
              {pane === "audit" ? (
                <button
                  type="button"
                  className="am-create shrink-0"
                  disabled={busy || !ready}
                  onClick={() => void downloadAudit()}
                >
                  <Download className="size-3.5" />
                  {t("actions.exportCsv")}
                </button>
              ) : null}
            </div>
            {ready && rows.length ? (
              <div className={`am-list-head is-history${pane === "recovery" ? " is-recovery" : ""}`}>
                <div className="am-row-cells">
                  <SortLabel id="a" sort={col.sort} onToggle={col.toggle}>
                    {pane === "audit" ? t("audit.csvAction") : t("audit.csvItem")}
                  </SortLabel>
                  <SortLabel id="b" sort={col.sort} onToggle={col.toggle}>
                    {pane === "audit" ? t("audit.csvItem") : t("audit.csvPlace")}
                  </SortLabel>
                  <SortLabel id="date" sort={col.sort} onToggle={col.toggle}>
                    {t("audit.csvDate")}
                  </SortLabel>
                  {pane === "recovery" ? <span className="am-row-action" /> : null}
                </div>
              </div>
            ) : null}
            <EdgeFade className="am-list-wrap">
              {!ready ? (
                <div className="am-list" aria-busy="true" aria-label={t("history.loading")}>
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-full" />
                </div>
              ) : !rows.length ? (
                <EmptyState compact icon={pane === "audit" ? ScrollText : Undo2} text={emptyText} />
              ) : (
                <div className={`am-list is-history${pane === "recovery" ? " is-recovery" : ""}`} role="list">
                  {pane === "audit"
                    ? auditRows.map((row) => (
                        <div key={row.id} className="am-row is-static" role="listitem">
                          <div className="am-row-head">
                            <div className="am-row-cells">
                              <span className="am-row-title">{t(`audit.${row.type}`)}</span>
                              <span className="am-dim">
                                {[row.label, row.path].filter(Boolean).join(" · ") || "—"}
                              </span>
                              <span className="am-dim">
                                {[formatHistoryWhen(row.at), row.actor].filter(Boolean).join(" · ")}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))
                    : trashRows.map((row) => (
                        <div
                          key={`${row.id}:${row.scope}:${row.targetId}`}
                          className="am-row is-static"
                          role="listitem"
                        >
                          <div className="am-row-head">
                            <div className="am-row-cells">
                              <span className="am-row-title">
                                {row.label}
                                <span className="am-row-sub">
                                  {historyScopeLabel(row.scope, row.kind)}
                                </span>
                              </span>
                              <span className="am-dim">
                                {[row.path, historyCountLabel(row.count)].filter(Boolean).join(" · ") ||
                                  "—"}
                              </span>
                              <span className="am-dim">
                                {[formatHistoryWhen(row.at), row.actor].filter(Boolean).join(" · ")}
                              </span>
                              <span className="am-row-action">
                                <button
                                  type="button"
                                  className="card-tool am-row-restore"
                                  aria-label={t("actions.restore")}
                                  title={t("actions.restore")}
                                  disabled={busy}
                                  onClick={() => void restore(row)}
                                >
                                  <Undo2 className="size-3.5" />
                                </button>
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                </div>
              )}
            </EdgeFade>
          </div>
        </div>
      </div>
    </div>
  );
}
function StatsPanel({
  catalog,
  scoped,
  onClose,
}: {
  catalog: CatalogTab[];
  scoped: boolean;
  onClose: () => void;
}) {
  const top = useMemo(() => collectTopApps(catalog, 10).filter((r) => r.clicks > 0), [catalog]);
  const max = Math.max(1, ...top.map((r) => r.clicks));
  const total = top.reduce((sum, row) => sum + row.clicks, 0);
  return (
    <div className="stats-panel">
      {" "}
      <div className="mb-5 flex items-start justify-between gap-3">
        {" "}
        <div>
          {" "}
          <h3 className="dialog-title">{t("stats.title")}</h3>
          <p className="mt-1 text-sm text-muted">{t(scoped ? "stats.leadVisible" : "stats.lead")}</p>
        </div>{" "}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label={t("actions.close")}
            title={t("actions.close")}
        >
          {" "}
          <X className="size-4" />
        </Button>
      </div>
      {top.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted">{t("empty.noClicks")}</p>
      ) : (
        <ol className="stats-list">
          {top.map((row, index) => (
            <li key={row.id} className="stats-row">
              {" "}
              <span className="stats-rank">{index + 1}</span>
              <span className="portal-mark flex size-8 items-center justify-center rounded-md">
                {" "}
                <PortalIcon name={row.icon} className="size-4" />
              </span>{" "}
              <div className="min-w-0">
                {" "}
                <p className="truncate text-sm font-medium">{row.title}</p>
                <p className="truncate text-xs text-muted">{row.tab}</p>
                <div className="stats-meter mt-1.5">
                  {" "}
                  <span
                    style={{
                      width: `${Math.max(6, (row.clicks / max) * 100)}%`,
                    }}
                  />
                </div>
              </div>{" "}
              <span className="stats-count">{row.clicks}</span>
            </li>
          ))}
        </ol>
      )}{" "}
      <p className="mt-5 text-xs text-subtle">{tp("info.total", total)}</p>
    </div>
  );
}
type TagsPayload = {
  create?: string[];
  rename?: { from: string; to: string }[];
  remove?: string[];
  colors?: Record<string, string>;
};
type CurationViewData = Awaited<ReturnType<typeof getCuration>>;
function curationTone(status: CurationCheck["status"]): string {
  if (status === "valid") return "text-ok";
  if (status === "redirect") return "text-muted";
  if (status === "error" || status === "timeout") return "text-danger";
  return "text-subtle";
}
function curationStatusLabel(check: CurationCheck): string {
  if (check.status === "valid") return String(check.httpStatus || "200");
  if (check.status === "redirect") {
    const target = check.finalUrl || "";
    let short = target;
    try {
      const from = new URL(check.url);
      const to = new URL(target);
      short = to.host === from.host ? `${to.pathname}${to.search}` : target;
    } catch {
      // keep full URL
    }
    return check.httpStatus ? `${check.httpStatus} → ${short}` : short;
  }
  if (check.status === "timeout") return t("curation.statusTimeout");
  if (check.status === "error") return check.httpStatus ? String(check.httpStatus) : t("curation.statusError");
  return t("curation.statusUnknown");
}
function curationStatusTitle(check: CurationCheck): string | undefined {
  if (check.status === "redirect") return check.finalUrl || undefined;
  if (check.detail) return td(check.detail);
  return undefined;
}
function CurationPanel({
  token,
  busy,
  tabPerms,
  picker,
  catalog,
  probes,
  knownTags,
  tagColors,
  editContext,
  onSaveCard,
  onClose,
}: {
  token: string;
  busy: boolean;
  tabPerms: Record<string, "view" | "edit">;
  picker: {
    token: string;
    library: CustomIcon[];
    online: boolean;
    navRichIcons: boolean;
    onLibrary: (icons: CustomIcon[]) => void;
  };
  catalog: CatalogTab[];
  probes?: boolean;
  knownTags?: { name: string; count: number }[];
  tagColors?: Record<string, string>;
  editContext: (
    cardId: string,
  ) => { app: PortalApp; categoryId: string; categories: PortalCategory[] } | null;
  onSaveCard: (app: PortalApp, payload: CardFormPayload, onDone: () => void) => void;
  onClose: () => void;
}) {
  const [pane, setPane] = useState<"results" | "apps">("results");
  const [view, setView] = useState<CurationViewData | null>(null);
  const [ready, setReady] = useState(false);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [job, setJob] = useState<CurationJobView | null>(null);
  const [edit, setEdit] = useState<{ app: PortalApp; categoryId: string; categories: PortalCategory[] } | null>(
    null,
  );
  const jobRunningRef = useRef(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const reloadRef = useRef<() => void>(() => {});
  useEffect(() => {
    let alive = true;
    let timer = 0;
    async function reload() {
      try {
        const res = await getCuration({ data: { token } });
        if (alive) setView(res);
      } catch {
        // ignore — initial load reports its own errors
      }
    }
    reloadRef.current = reload;
    async function tick() {
      try {
        const res = await curationStatus({ data: { token } });
        if (!alive) return;
        setJob(res);
        const wasRunning = jobRunningRef.current;
        jobRunningRef.current = res.running;
        if (wasRunning && !res.running) void reload();
      } catch (err) {
        if (!alive || sessionGone(err)) return;
      }
      if (alive) timer = window.setTimeout(() => void tick(), 800);
    }
    getCuration({ data: { token } })
      .then((res) => {
        if (!alive) return;
        setView(res);
        setReady(true);
      })
      .catch((err) => {
        if (!alive) return;
        setReady(true);
        if (sessionGone(err)) return;
        toast.error(te(err));
      });
    void tick();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [token]);
  const lastLogLine = job?.log.length ? job.log[job.log.length - 1] : "";
  useEffect(() => {
    const el = logEndRef.current?.parentElement;
    if (el) el.scrollTop = el.scrollHeight;
  }, [job?.log.length, lastLogLine]);
  function checksOf(cardId: string): Record<string, CurationCheck> | undefined {
    const base = view?.checks?.[cardId];
    return base ? { ...base } : undefined;
  }
  const counts = useMemo(() => {
    let valid = 0;
    let redirect = 0;
    let error = 0;
    let timeout = 0;
    let pending = 0;
    for (const ref of view?.queue || []) {
      const raw = checksOf(ref.cardId)?.[ref.key];
      const check = raw && raw.url === ref.url ? raw : undefined;
      if (!check) {
        pending++;
        continue;
      }
      if (check.status === "valid") valid++;
      else if (check.status === "redirect") redirect++;
      else if (check.status === "timeout") timeout++;
      else error++;
    }
    const checked = valid + redirect + error + timeout;
    return { valid, redirect, error, timeout, checked, pending, total: checked + pending };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- checksOf reads view state
  }, [view]);
  const groups = useMemo(() => {
    const prio: Record<CurationCheck["status"], number> = { error: 4, timeout: 3, redirect: 2, valid: 1, unknown: 0 };
    const out: {
      cardId: string;
      tabId: string;
      title: string;
      icon: string;
      place: string;
      links: { key: string; label: string; url: string; check?: CurationCheck }[];
      worst?: CurationCheck;
      anyCheck: boolean;
      counts: { valid: number; redirect: number; error: number; timeout: number };
      mixed: boolean;
    }[] = [];
    for (const item of view?.items || []) {
      const checks = checksOf(item.cardId);
      const links = item.links.map((link) => {
        const raw = checks?.[link.key];
        return { key: link.key, label: link.label, url: link.url, check: raw && raw.url === link.url ? raw : undefined };
      });
      const counts = { valid: 0, redirect: 0, error: 0, timeout: 0 };
      for (const link of links) {
        if (!link.check || link.check.status === "unknown") continue;
        counts[link.check.status] += 1;
      }
      const states = [counts.valid > 0, counts.redirect > 0, counts.error > 0, counts.timeout > 0].filter(
        (on) => on,
      ).length;
      let worst: CurationCheck | undefined;
      for (const link of links) {
        if (!link.check) continue;
        if (!worst || prio[link.check.status] > prio[worst.status]) worst = link.check;
      }
      out.push({
        cardId: item.cardId,
        tabId: item.tabId,
        title: item.title,
        icon: item.icon,
        place: [item.tabName, item.categoryName].filter(Boolean).join(" · "),
        links,
        worst,
        anyCheck: links.some((l) => l.check),
        counts,
        mixed: links.length > 1 && states > 1,
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- checksOf reads view state
  }, [view]);
  const filteredGroups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const base = needle
      ? groups.filter(
          (group) =>
            group.title.toLowerCase().includes(needle) ||
            group.place.toLowerCase().includes(needle) ||
            group.links.some(
              (link) =>
                link.label.toLowerCase().includes(needle) || link.url.toLowerCase().includes(needle),
            ),
        )
      : groups;
    if (filter === "all") return base;
    return base.filter((group) => {
      if (filter === "unknown") return !group.anyCheck;
      return group.links.some((link) => {
        const status = link.check?.status;
        if (filter === "valid") return status === "valid";
        if (filter === "redirect") return status === "redirect";
        if (filter === "error") return status === "error" || status === "timeout";
        return false;
      });
    });
  }, [groups, filter, q]);
  async function runScan() {
    if (job?.running || !view || !view.queue.length) return;
    try {
      const res = await curationStart({ data: { token } });
      if (!res.started) toast.info(t("curation.busy"));
    } catch (err) {
      if (sessionGone(err)) return;
      toast.error(te(err));
    }
  }
  async function stopScan() {
    try {
      await curationStop({ data: { token } });
    } catch (err) {
      if (sessionGone(err)) return;
      toast.error(te(err));
    }
  }
  const col = useColSort();
  const useJob = Boolean(job && (job.running || job.done > 0));
  const total = useJob && job ? job.total : counts.total;
  const done = useJob && job ? job.done : counts.checked;
  const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const boxCounts = useJob && job
    ? {
        valid: job.counts.valid,
        redirect: job.counts.redirect,
        error: job.counts.error,
        timeout: job.counts.timeout,
        pending: Math.max(0, job.total - job.done),
      }
    : counts;
  const lastRunAt = Math.max(view?.lastRunAt || 0, job?.finishedAt || 0);
  const boxTitle = job?.running
    ? t("curation.running")
    : lastRunAt
      ? t("curation.lastRun", { when: formatWhen(lastRunAt) })
      : t("curation.neverRun");
  const currentPane =
    pane === "results"
      ? { label: t("curation.results"), lead: t("curation.resultsLead") }
      : { label: t("curation.apps"), lead: t("curation.appsLead") };
  function statusCell(check: CurationCheck | undefined, pending = false) {
    if (!check) {
      return (
        <span className="am-status text-subtle">
          <Minus className="size-3.5 shrink-0" />
          <span className="am-status-text">
            {pending ? t("curation.statusPending") : t("curation.statusUnknown")}
          </span>
        </span>
      );
    }
    const title = curationStatusTitle(check);
    return (
      <span className={`am-status ${curationTone(check.status)}`} title={title}>
        {check.status === "valid" ? (
          <Check className="size-3.5 shrink-0" />
        ) : check.status === "redirect" ? (
          <ArrowUpRight className="size-3.5 shrink-0" />
        ) : check.status === "timeout" ? (
          <Clock className="size-3.5 shrink-0" />
        ) : check.status === "error" ? (
          <X className="size-3.5 shrink-0" />
        ) : (
          <Minus className="size-3.5 shrink-0" />
        )}
        <span className="am-status-text">{curationStatusLabel(check)}</span>
      </span>
    );
  }
  return (
    <>
      <div className="settings-frame is-wide is-access">
        <nav className="settings-nav" aria-label={t("curation.sectionsAria")}>
          <p className="menu-title">{t("curation.title")}</p>
          <button
            type="button"
            className={`settings-nav-item ${pane === "results" ? "is-on" : ""}`}
            onClick={() => setPane("results")}
          >
            <ListChecks className="size-4 shrink-0" />
            {t("curation.results")}
          </button>
          <button
            type="button"
            className={`settings-nav-item ${pane === "apps" ? "is-on" : ""}`}
            onClick={() => setPane("apps")}
          >
            <LayoutGrid className="size-4 shrink-0" />
            {t("curation.apps")}
          </button>
        </nav>
      <div className="settings-body">
        <div className="settings-head">
          <div className="settings-head-copy">
            <h3 className="dialog-title">{currentPane.label}</h3>
            <p className="settings-lead">{currentPane.lead}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label={t("actions.close")}
            title={t("actions.close")}
          >
            <X className="size-4" />
          </Button>
        </div>
        {pane === "results" ? (
          <div className="settings-pane is-access">
            <div className="am-work">
              {ready ? (
                <div className="curation-progress">
                  <div className="curation-progress-row">
                    <span className="curation-progress-title">{boxTitle}</span>
                    {total ? (
                      <span className="shrink-0 text-xs tabular-nums text-muted">
                        {formatNumber(done)} / {formatNumber(total)}
                      </span>
                    ) : null}
                  </div>
                  {total ? (
                    <>
                      <div
                        className="h-1.5 w-full overflow-hidden rounded-full bg-elevated"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={total}
                        aria-valuenow={done}
                      >
                        <div
                          className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="curation-counts">
                        <span className="inline-flex items-center gap-1 text-ok">
                          <Check className="size-3.5" />
                          {t("curation.countValid", { n: formatNumber(boxCounts.valid) })}
                        </span>
                        <span className="inline-flex items-center gap-1 text-muted">
                          <ArrowUpRight className="size-3.5" />
                          {t("curation.countRedirect", { n: formatNumber(boxCounts.redirect) })}
                        </span>
                        <span className="inline-flex items-center gap-1 text-danger">
                          <X className="size-3.5" />
                          {t("curation.countError", { n: formatNumber(boxCounts.error) })}
                        </span>
                        <span className="inline-flex items-center gap-1 text-danger">
                          <Clock className="size-3.5" />
                          {t("curation.countTimeout", { n: formatNumber(boxCounts.timeout) })}
                        </span>
                        {boxCounts.pending ? (
                          <span>{t("curation.countPending", { n: formatNumber(boxCounts.pending) })}</span>
                        ) : null}
                      </div>
                      {job?.running && job.current ? (
                        <p className="curation-progress-current">
                          {t("curation.lastItem")} {job.current}
                        </p>
                      ) : null}
                    </>
                  ) : null}
                </div>
              ) : null}
              <div className="curation-log-box">
                <EdgeFade className="curation-log" aria-live="polite">
                  {job?.log.length ? (
                    job.log.map((line, i) => (
                      <div
                        key={i}
                        className={`curation-log-line${
                          line.startsWith("✓")
                            ? " is-ok"
                            : line.startsWith("↗")
                              ? " is-redirect"
                              : line.startsWith("✕")
                                ? " is-error"
                                : ""
                        }`}
                      >
                        {line}
                      </div>
                    ))
                  ) : (
                    <p className="curation-log-empty">{t("curation.logEmpty")}</p>
                  )}
                  <div ref={logEndRef} />
                </EdgeFade>
              </div>
              <div className="am-actions is-center">
                {job?.running ? (
                  <Button type="button" size="sm" variant="danger" onClick={() => void stopScan()}>
                    <X className="size-3.5" />
                    {t("curation.cancel")}
                  </Button>
                ) : (
                  <Button type="button" size="sm" disabled={!ready || !total} onClick={() => void runScan()}>
                    <ScanSearch className="size-3.5" />
                    {t("curation.run")}
                  </Button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="settings-pane is-access">
            <div className="am-work">
              <div className="am-toolbar">
                <label className="am-search">
                  <Search className="size-3.5" aria-hidden />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder={t("nav.search")}
                    aria-label={t("nav.search")}
                  />
                </label>
                <div className="am-filters" role="tablist" aria-label={t("curation.apps")}>
                  {(
                    [
                      ["all", t("access.filterAll")],
                      ["valid", t("curation.filterOk")],
                      ["redirect", t("curation.filterRedirect")],
                      ["error", t("curation.filterError")],
                      ["unknown", t("curation.filterUnknown")],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={filter === id}
                      className={filter === id ? "is-on" : ""}
                      onClick={() => setFilter(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="am-list-head is-curation">
                <span className="am-chevron-spacer" aria-hidden />
                <div className="am-row-cells">
                  <SortLabel id="a" sort={col.sort} onToggle={col.toggle}>
                    {t("curation.colCard")}
                  </SortLabel>
                  <SortLabel id="b" sort={col.sort} onToggle={col.toggle}>
                    {t("curation.colLink")}
                  </SortLabel>
                  <SortLabel id="c" sort={col.sort} onToggle={col.toggle}>
                    {t("curation.colResult")}
                  </SortLabel>
                  <span className="am-row-action" />
                </div>
              </div>
              <EdgeFade className="am-list-wrap">
                {!ready ? (
                  <div className="am-list" aria-busy="true" aria-label={t("curation.loading")}>
                    <Skeleton className="h-9 w-full" />
                    <Skeleton className="h-9 w-full" />
                    <Skeleton className="h-9 w-full" />
                    <Skeleton className="h-9 w-full" />
                  </div>
                ) : !filteredGroups.length ? (
                  <EmptyState
                    compact
                    icon={LayoutGrid}
                    text={view?.items.length ? t("curation.emptyFilter") : t("curation.empty")}
                  />
                ) : (
                  <div className="am-list is-curation" role="list">
                    {col
                      .apply(filteredGroups, (group, key) => {
                        if (key === "a") return group.title;
                        if (key === "b") return group.links.length;
                        return group.worst
                          ? { error: 4, timeout: 3, redirect: 2, valid: 1, unknown: 0 }[group.worst.status]
                          : -1;
                      })
                      .map((group) => {
                      const canEdit = tabPerms[group.tabId] === "edit";
                      const expanded = openId === group.cardId;
                      return (
                        <ExpandRow
                          key={group.cardId}
                          id={group.cardId}
                          expanded={expanded}
                          onToggle={() => setOpenId(expanded ? null : group.cardId)}
                          cells={
                            <>
                              <span className="am-row-title is-curation-card">
                                <PortalIcon name={group.icon} className="size-4 shrink-0" />
                                <span className="curation-card-name">{group.title}</span>
                                {group.place ? (
                                  <span className="curation-card-place">{group.place}</span>
                                ) : null}
                              </span>
                              <span className="am-row-link">
                                {group.mixed ? (
                                  <span className="curation-split">
                                    {group.counts.valid ? (
                                      <span className="inline-flex items-center gap-1 text-ok">
                                        <Check className="size-3" />
                                        {formatNumber(group.counts.valid)}
                                      </span>
                                    ) : null}
                                    {group.counts.redirect ? (
                                      <span className="inline-flex items-center gap-1 text-muted">
                                        <ArrowUpRight className="size-3" />
                                        {formatNumber(group.counts.redirect)}
                                      </span>
                                    ) : null}
                                    {group.counts.error ? (
                                      <span className="inline-flex items-center gap-1 text-danger">
                                        <X className="size-3" />
                                        {formatNumber(group.counts.error)}
                                      </span>
                                    ) : null}
                                    {group.counts.timeout ? (
                                      <span className="inline-flex items-center gap-1 text-danger">
                                        <Clock className="size-3" />
                                        {formatNumber(group.counts.timeout)}
                                      </span>
                                    ) : null}
                                  </span>
                                ) : group.links.length ? (
                                  tp("curation.linkCount", group.links.length)
                                ) : (
                                  "—"
                                )}
                              </span>
                              {statusCell(group.worst, !group.links.length)}
                              <span className="am-row-action">
                                <button
                                  type="button"
                                  className="card-tool"
                                  disabled={!canEdit}
                                  title={t("curation.editCard")}
                                  aria-label={t("curation.editCard")}
                                  onClick={() => setEdit(editContext(group.cardId))}
                                >
                                  <Pencil className="size-3.5" />
                                </button>
                              </span>
                            </>
                          }
                        >
                          <div className="curation-sub">
                            {group.links.length ? (
                              group.links.map((link) => (
                                <div key={link.key} className="curation-sub-row">
                                  <div className="curation-sub-line">
                                    <span className="curation-sub-label">{link.label || "—"}</span>
                                    {statusCell(link.check, true)}
                                  </div>
                                  <p className="curation-sub-url" title={link.url}>
                                    {link.url || "—"}
                                  </p>
                                </div>
                              ))
                            ) : (
                              <div className="curation-sub-row">
                                <div className="curation-sub-line">
                                  <span className="curation-sub-label">—</span>
                                  {statusCell(undefined, false)}
                                </div>
                                <p className="curation-sub-url">{t("curation.statusUnknown")}</p>
                              </div>
                            )}
                          </div>
                        </ExpandRow>
                      );
                    })}
                  </div>
                )}
              </EdgeFade>
            </div>
          </div>
        )}
      </div>
    </div>
    {edit ? (
      <ModalShell size="wide" label={t("curation.editCard")} onClose={() => setEdit(null)}>
        <CardForm
          categories={edit.categories}
          categoryId={edit.categoryId}
          catalog={catalog}
          initial={edit.app}
          busy={busy}
          picker={picker}
          probes={probes}
          knownTags={knownTags}
          tagColors={tagColors}
          onCancel={() => setEdit(null)}
          onSave={(payload) =>
            onSaveCard(edit.app, payload, () => {
              setEdit(null);
              reloadRef.current();
            })
          }
        />
      </ModalShell>
    ) : null}
    </>
  );
}
function AdminPanel({
  tab,
  settings,
  runtime,
  catalog,
  tags,
  token,
  session,
  busy,
  onTab,
  onCancel,
  onSaveSettings,
  onResetClicks,
  onApplyTags,
  onSaveTheme,
  onResetPortal,
  onImportPortal,
}: {
  tab: string;
  settings: PortalSettings;
  runtime?: PortalData["runtime"];
  catalog: CatalogTab[];
  tags: { name: string; count: number }[];
  tabs: MenuTab[];
  directory: DirectoryEntry[];
  token: string;
  session: SessionInfo | null;
  busy: boolean;
  onTab: (id: string) => void;
  onCancel: () => void;
  onSaveSettings: (payload: SettingsPayload, opts?: { close?: boolean }) => void;
  onResetClicks: () => void;
  onApplyTags: (payload: TagsPayload) => void;
  onSaveTheme: (payload: { cssLight: string; cssDark: string }) => void;
  onResetPortal: () => void;
  onImportPortal: (payload: unknown) => void;
}) {
  const sections = settingsSections().filter((s) => {
    if (s.id === "about") return true;
    return session?.canManageSettings;
  });
  const current = sections.find((s) => s.id === tab) ?? sections[0];
  return (
    <div className="settings-frame is-wide is-access">
      {" "}
      <nav className="settings-nav" aria-label={t("settings.sectionsAria")}>
        {" "}
        <p className="menu-title">{t("settings.title")}</p>
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`settings-nav-item${tab === s.id ? " is-on" : ""}`}
            onClick={() => onTab(s.id)}
          >
            {" "}
            <s.icon className="size-4 shrink-0" />
            {s.label}
          </button>
        ))}
      </nav>{" "}
      <div className="settings-body">
        {" "}
        <div className="settings-head">
          {" "}
          <div className="settings-head-copy">
            {" "}
            <h3 className="dialog-title">{current?.label || t("settings.title")}</h3>
            {current?.lead ? <p className="settings-lead">{current.lead}</p> : null}
          </div>{" "}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onCancel}
            aria-label={t("actions.close")}
            title={t("actions.close")}
          >
            {" "}
            <X className="size-4" />
          </Button>
        </div>
        {tab === "general" ? (
          <EdgeFade className="settings-pane">
            {" "}
            <SettingsForm
              initial={settings}
              busy={busy}
              embedded
              onCancel={onCancel}
              onSave={(payload) => onSaveSettings(payload)}
            />
          </EdgeFade>
        ) : tab === "locales" ? (
          <EdgeFade className="settings-pane">
            {" "}
            <LocalesForm initial={settings} onSave={(payload) => onSaveSettings(payload)} />
          </EdgeFade>
        ) : tab === "presentation" ? (
          <EdgeFade className="settings-pane">
            {" "}
            <PresentationForm initial={settings} onSave={(payload) => onSaveSettings(payload)} />
          </EdgeFade>
        ) : tab === "reachability" ? (
          <EdgeFade className="settings-pane">
            {" "}
            <ReachabilityForm initial={settings} onSave={(payload) => onSaveSettings(payload)} />
          </EdgeFade>
        ) : tab === "security" ? (
          <EdgeFade className="settings-pane">
            {" "}
            <SecurityForm
              initial={settings}
              onSave={(payload) => onSaveSettings(payload)}
            />
          </EdgeFade>
        ) : tab === "debug" ? (
          <EdgeFade className="settings-pane">
            {" "}
            <DebugPanel
              settings={settings}
              runtime={runtime}
              session={session}
              busy={busy}
              onSave={(payload) => onSaveSettings(payload)}
            />
          </EdgeFade>
        ) : tab === "info" ? (
          <EdgeFade className="settings-pane">
            {" "}
            <InfoBarForm
              initial={settings}
              onSave={(payload) => onSaveSettings(payload)}
            />
          </EdgeFade>
        ) : tab === "themes" ? (
          <EdgeFade className="settings-pane">
            {" "}
            <ThemeForm initial={settings} busy={busy} onCancel={onCancel} onSave={onSaveTheme} />
          </EdgeFade>
        ) : tab === "backup" ? (
          <EdgeFade className="settings-pane">
            {" "}
            <BackupForm
              token={token}
              busy={busy}
              catalog={catalog}
              title={settings.title}
              onImport={onImportPortal}
            />
          </EdgeFade>
        ) : tab === "reset" && session?.canManageSettings ? (
          <EdgeFade className="settings-pane">
            <div className="settings-stack">
              <div className="settings-card">
                <p className="settings-kicker">{t("info.resetKicker")}</p>
                <p className="settings-hint">{t("info.resetHint")}</p>
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  className="am-create self-start"
                  disabled={busy || !onResetClicks}
                  onClick={async () => {
                    if (!onResetClicks) return;
                    if (
                      !(await askConfirm({
                        title: t("confirm.resetClicks"),
                        body: t("info.resetConfirm"),
                        okLabel: t("info.resetAction"),
                      }))
                    )
                      return;
                    onResetClicks();
                  }}
                >
                  {t("info.resetAction")}
                </Button>
              </div>
              <div className="settings-card">
                <p className="settings-kicker">{t("sections.reset.label")}</p>
                <p className="settings-hint">{t("settings.resetBody")}</p>
                {session?.role === "admin" ? (
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    className="am-create self-start"
                    disabled={busy}
                    onClick={async () => {
                      if (
                        !(await askConfirm({
                          title: t("sections.reset.label"),
                          body: t("settings.resetConfirm"),
                          okLabel: t("sections.reset.label"),
                        }))
                      )
                        return;
                      onResetPortal();
                    }}
                  >
                    {t("settings.resetAction")}
                  </Button>
                ) : null}
              </div>
            </div>
          </EdgeFade>
        ) : tab === "about" || !session?.canManageSettings ? (
          <EdgeFade className="settings-pane">
            {" "}
            <AboutForm />
          </EdgeFade>
        ) : (
          <div className="settings-pane is-fill">
            {" "}
            <TagManager
              tags={tags}
              colors={settings.tagColors}
              busy={busy}
              embedded
              settings={settings}
              pruneOrphanTags={Boolean(settings.pruneOrphanTags)}
              tagsAlpha={settings.tagsAlpha !== false}
              onCancel={onCancel}
              onSave={(payload) =>
                onSaveSettings(payload, {
                  close: false,
                })
              }
              onApply={onApplyTags}
            />
          </div>
        )}
        {tab === "general" ||
        tab === "locales" ||
        tab === "presentation" ||
        tab === "reachability" ||
        tab === "security" ||
        tab === "info" ||
        tab === "themes" ||
        tab === "tags" ? (
          <FormActions busy={busy} hideCancel form="settings-form" />
        ) : null}
      </div>
    </div>
  );
}
function AboutForm() {
  const [release, setRelease] = useState<{ kind: string; latest?: string; url?: string } | null>(
    null,
  );
  useEffect(() => {
    let live = true;
    checkLatestRelease({
      data: {},
    })
      .then((row) => {
        if (!live) return;
        const latest = String(row?.latest || "").trim();
        if (!latest) {
          setRelease({
            kind: "none",
          });
          return;
        }
        setRelease(
          isNewerVersion(latest, PORTAL_VERSION)
            ? {
                kind: "update",
                latest,
                url: String(row?.url || ""),
              }
            : {
                kind: "ok",
              },
        );
      })
      .catch(() => {
        if (live)
          setRelease({
            kind: "none",
          });
      });
    return () => {
      live = false;
    };
  }, []);
  return (
    <div className="settings-stack">
      <div className="about-hero">
        <DockitMark className="dockit-mark about-mark" />
        <p className="about-name">Dockit</p>
        {release?.kind === "ok" || release?.kind === "update" ? (
          <a
            href="https://buymeacoffee.com/rapha57"
            target="_blank"
            rel="noopener noreferrer"
            className="about-coffee"
          >
            <BmcMark className="about-bmc" />
            {t("about.coffee")}
          </a>
        ) : null}
      </div>
      <div className="settings-card">
        <dl className="about-dl">
          <dt>{t("about.created")}</dt>
          <dd>{t("about.createdOn")}</dd>
          <dt>{t("about.build")}</dt>
          <dd className="about-build">
            {PORTAL_VERSION}
            {release?.kind === "ok" ? (
              <span className="about-build-badge">{t("about.upToDate")}</span>
            ) : release?.kind === "update" ? (
              <a
                className="about-build-badge is-update"
                href={release.url}
                target="_blank"
                rel="noopener noreferrer"
                title={t("about.openVersion", {
                  v: release.latest,
                })}
              >
                {t("about.update", {
                  v: release.latest,
                })}
              </a>
            ) : release?.kind === "offline" ? (
              <span className="about-build-badge is-offline">{t("about.offline")}</span>
            ) : null}
          </dd>
        </dl>
      </div>
      <div className="settings-card">
        <p className="settings-kicker">{t("about.tech")}</p>
        <dl className="about-dl">
          <dt>{t("about.stackApp")}</dt>
          <dd>React 19 · TanStack Start · Vite · Nitro</dd>
          <dt>{t("about.stackUi")}</dt>
          <dd>Tailwind CSS · Lucide</dd>
          <dt>{t("about.stackData")}</dt>
          <dd>Zod</dd>
          <dt>{t("about.license")}</dt>
          <dd>
            <a
              href="https://opensource.org/licenses/MIT"
              target="_blank"
              rel="noopener noreferrer"
            >
              MIT
            </a>
          </dd>
          <dt>{t("about.source")}</dt>
          <dd>
            <a
              href="https://github.com/rapha57/dockit"
              target="_blank"
              rel="noopener noreferrer"
            >
              github.com/rapha57/dockit
            </a>
          </dd>
        </dl>
      </div>
    </div>
  );
}
function OidcForm({
  initial,
  onSave,
}: {
  initial: PortalSettings;
  onSave: (payload: OidcPayload) => void;
  busy: boolean;
}) {
  const [oidcEnabled, setOidcEnabled] = useState(Boolean(initial.oidcEnabled));
  const [oidcIssuer, setOidcIssuer] = useState(initial.oidcIssuer || "");
  const [oidcClientId, setOidcClientId] = useState(initial.oidcClientId || "");
  const [oidcClientSecret, setOidcClientSecret] = useState("");
  const [oidcLabel, setOidcLabel] = useState(initial.oidcLabel || "SSO");
  const [oidcAutoCreate, setOidcAutoCreate] = useState(Boolean(initial.oidcAutoCreate));
  const [oidcAutoRedirect, setOidcAutoRedirect] = useState(Boolean(initial.oidcAutoRedirect));
  const redirectUri =
    typeof window !== "undefined" ? `${window.location.origin}/oidc/callback` : "/oidc/callback";
  return (
    <form
      id="oidc-form"
      className="settings-stack"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          oidcEnabled,
          oidcIssuer: oidcIssuer.trim(),
          oidcClientId: oidcClientId.trim(),
          oidcClientSecret,
          oidcLabel: oidcLabel.trim() || "SSO",
          oidcAutoCreate,
          oidcAutoRedirect,
        });
      }}
    >
      {" "}
      <div className="settings-card">
        {" "}
        <p className="settings-kicker">{t("oidc.boxService")}</p>
        <div className="settings-toggles">
          {" "}
          <label>
            {" "}
            <input
              type="checkbox"
              checked={oidcEnabled}
              onChange={(e) => setOidcEnabled(e.target.checked)}
            />
            {t("oidc.enable")}
          </label>{" "}
          <label>
            {" "}
            <input
              type="checkbox"
              checked={oidcAutoCreate}
              onChange={(e) => setOidcAutoCreate(e.target.checked)}
            />
            {t("oidc.autoCreate")}
          </label>{" "}
          <label className="is-child">
            {" "}
            <input
              type="checkbox"
              checked={oidcAutoRedirect}
              disabled={!oidcEnabled}
              onChange={(e) => setOidcAutoRedirect(e.target.checked)}
            />
            {t("oidc.autoRedirect")}
          </label>
        </div>{" "}
        <Field label={t("oidc.buttonLabel")}>
          {" "}
          <Input
            value={oidcLabel}
            onChange={(e) => setOidcLabel(e.target.value)}
            placeholder="SSO"
          />
        </Field>
      </div>{" "}
      <div className="settings-card">
        {" "}
        <p className="settings-kicker">{t("oidc.boxClient")}</p>
        <Field label={t("oidc.issuer")} hint={t("oidc.issuerHint")}>
          <Input
            value={oidcIssuer}
            onChange={(e) => setOidcIssuer(e.target.value)}
            placeholder="https://keycloak.exemple/realms/dockit"
            required={oidcEnabled}
          />
        </Field>{" "}
        <Field label={t("oidc.clientId")}>
          {" "}
          <Input
            value={oidcClientId}
            onChange={(e) => setOidcClientId(e.target.value)}
            required={oidcEnabled}
          />
        </Field>{" "}
        <Field label={t("oidc.clientSecret")} hint={t("oidc.secretHint")}>
          <Input
            type="password"
            value={oidcClientSecret}
            onChange={(e) => setOidcClientSecret(e.target.value)}
            placeholder={
              initial.oidcHasSecret ? t("oidc.secretUnchanged") : t("oidc.secretOptional")
            }
          />
        </Field>
      </div>{" "}
      <div className="settings-card">
        {" "}
        <p className="settings-kicker">{t("oidc.redirect")}</p>
        <p className="settings-hint">{redirectUri}</p>
      </div>
    </form>
  );
}
type LdapDirRow = Directory & { hasBindPassword?: boolean };
function blankLdapDir(): LdapDirRow {
  return {
    id: crypto.randomUUID(),
    enabled: false,
    host: "",
    port: 636,
    tls: true,
    tlsVerify: true,
    bindDn: "",
    bindPassword: "",
    baseDn: "",
    userFilter: "",
    domain: "",
    autoCreate: false,
  };
}
function seedLdapDirs(initial: PortalSettings): LdapDirRow[] {
  if (Array.isArray(initial.ldapDirectories) && initial.ldapDirectories.length) {
    return initial.ldapDirectories.map((d) => ({
      ...blankLdapDir(),
      ...d,
      bindPassword: "",
    }));
  }
  if (initial.ldapHost || initial.ldapDomain || initial.ldapEnabled) {
    return [
      {
        ...blankLdapDir(),
        id: "ad",
        enabled: Boolean(initial.ldapEnabled),
        host: initial.ldapHost || "",
        port: Number(initial.ldapPort) || (initial.ldapTls === false ? 389 : 636),
        tls: initial.ldapTls !== false,
        tlsVerify: initial.ldapTlsVerify !== false,
        bindDn: initial.ldapBindDn || "",
        bindPassword: "",
        baseDn: initial.ldapBaseDn || "",
        userFilter: initial.ldapUserFilter || "",
        domain: initial.ldapDomain || "",
        autoCreate: Boolean(initial.ldapAutoCreate),
        hasBindPassword: Boolean(initial.ldapHasBindPassword),
      },
    ];
  }
  return [];
}
type SettingsPayload = {
  title: string;
  subtitle: string;
  logo: string;
  healthChecks: boolean;
  usageStats: boolean;
  infoBar: boolean;
  favNotes: boolean;
  favEmbeds: boolean;
  onlineIcons: boolean;
  navRichIcons: boolean;
  locale: "en" | "fr";
  dateFormat: "ymd" | "yyyy" | "dmy" | "mdy" | "iso";
  timeFormat: "24h" | "12h";
  timezone: string;
  numberFormat: "auto" | "space-comma" | "comma-dot" | "dot-comma" | "apostrophe-comma";
  proxyAuthEnabled?: boolean;
  proxyAuthHeader?: string;
  probeBlink: boolean;
  annexFade: boolean;
  catCounts: boolean;
  pruneOrphanTags: boolean;
  tagsAlpha: boolean;
  cardResize: boolean;
  cardIconBg?: boolean;
  cardContextMenu: boolean;
  cardDragCollapse: boolean;
  infoStats: boolean;
  infoGeek: boolean;
  probeTlsVerify: boolean;
  probeAuthOnly: boolean;
  sessionHttpOnly: boolean;
  devAdminNoPassword: boolean;
  documentTitle: string;
  favicon: string;
};
function settingsBase(initial: PortalSettings): SettingsPayload {
  return {
    title: initial.title,
    subtitle: initial.subtitle || "",
    logo: initial.logo || "",
    healthChecks: initial.healthChecks !== false,
    usageStats: initial.usageStats !== false,
    infoBar: initial.infoBar !== false,
    favNotes: Boolean(initial.favNotes),
    favEmbeds: Boolean(initial.favEmbeds),
    onlineIcons: Boolean(initial.onlineIcons),
    navRichIcons: Boolean(initial.navRichIcons),
    locale: asLocale(initial.locale),
    dateFormat: asDateFormat(initial.dateFormat),
    timeFormat: asTimeFormat(initial.timeFormat),
    timezone: asTimeZone(initial.timezone),
    numberFormat: asNumberFormat(initial.numberFormat),
    probeBlink: Boolean(initial.probeBlink),
    annexFade: Boolean(initial.annexFade),
    catCounts: Boolean(initial.catCounts),
    pruneOrphanTags: Boolean(initial.pruneOrphanTags),
    tagsAlpha: initial.tagsAlpha !== false,
    cardResize: initial.cardResize !== false,
    cardContextMenu: initial.cardContextMenu !== false,
    cardDragCollapse: initial.cardDragCollapse !== false,
    infoStats: initial.infoStats !== false,
    infoGeek: initial.infoGeek !== false,
    probeTlsVerify: Boolean(initial.probeTlsVerify),
    probeAuthOnly: Boolean(initial.probeAuthOnly),
    sessionHttpOnly: Boolean(initial.sessionHttpOnly),
    devAdminNoPassword: Boolean(initial.devAdminNoPassword),
    documentTitle: initial.documentTitle || "Dockit",
    favicon: initial.favicon || "",
  };
}
function SettingsForm({
  initial,
  embedded,
  onCancel,
  onSave,
}: {
  initial: PortalSettings;
  busy: boolean;
  embedded?: boolean;
  onCancel: () => void;
  onSave: (payload: SettingsPayload) => void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [subtitle, setSubtitle] = useState(initial.subtitle);
  const [logo, setLogo] = useState(initial.logo || "");
  const [documentTitle, setDocumentTitle] = useState(initial.documentTitle || "Dockit");
  const [favicon, setFavicon] = useState(initial.favicon || "");
  async function applyLogo(next: string) {
    setLogo(next);
    if (!next) {
      setFavicon("");
      return;
    }
    try {
      setFavicon(await toFaviconDataUrl(next));
    } catch {
      setFavicon(next);
    }
  }
  return (
    <form
      id="settings-form"
      className="settings-stack"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          ...settingsBase(initial),
          title: title.trim() || "Dockit",
          subtitle: subtitle.trim(),
          logo,
          documentTitle: documentTitle.trim() || "Dockit",
          favicon,
        });
      }}
    >
      {!embedded && (
        <div className="mb-4 flex items-center justify-between">
          {" "}
          <h3 className="dialog-title">{t("settings.portalParams")}</h3>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onCancel}
            aria-label={t("actions.close")}
            title={t("actions.close")}
          >
            {" "}
            <X className="size-4" />
          </Button>
        </div>
      )}{" "}
      <div className="settings-card">
        {" "}
        <p className="settings-kicker">{t("settings.brand")}</p>
        <div className="brand-row">
          {" "}
          <BrandPick
            label={t("settings.logo")}
            hint={t("settings.logoHint")}
            resetLabel={t("settings.resetLogo")}
            accept="image/png,image/svg+xml,image/webp,image/jpeg"
            src={logo}
            onFile={async (file) => {
              await applyLogo(await fileToDataUrl(file));
            }}
            onReset={() => void applyLogo("")}
          >
            {logo ? (
              <img src={logo} alt="" className="brand-preview-img" />
            ) : (
              <DockitMark className="dockit-mark brand-mark" />
            )}
          </BrandPick>{" "}
          <BrandPick
            label={t("settings.favicon")}
            hint={t("settings.faviconHint")}
            resetLabel={t("settings.resetFavicon")}
            accept="image/png,image/svg+xml,image/webp,image/jpeg,image/x-icon,image/vnd.microsoft.icon,.ico"
            src={favicon}
            variant="tab"
            onFile={async (file) => {
              setFavicon(await toFaviconDataUrl(await fileToDataUrl(file)));
            }}
            onReset={() => setFavicon("")}
          >
            {favicon ? (
              <img key="ico" src={favicon} alt="" className="brand-tab-ico" />
            ) : logo ? (
              <img key="ico" src={logo} alt="" className="brand-tab-ico" />
            ) : (
              <DockitMark key="ico" className="dockit-mark brand-tab-ico" />
            )}{" "}
            <span key="title" className="brand-tab-title">
              {documentTitle.trim() || "Dockit"}
            </span>
          </BrandPick>
        </div>{" "}
        <p className="settings-hint">{t("settings.brandClick")}</p>
      </div>{" "}
      <div className="settings-card">
        {" "}
        <p className="settings-kicker">{t("settings.texts")}</p>
        <div className="field-row">
          {" "}
          <Field label={t("settings.portalName")}>
            {" "}
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </Field>{" "}
          <Field label={t("settings.subtitle")}>
            {" "}
            <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
          </Field>
        </div>{" "}
        <Field label={t("settings.documentTitle")}>
          {" "}
          <Input
            value={documentTitle}
            onChange={(e) => setDocumentTitle(e.target.value)}
            placeholder="Dockit"
          />
        </Field>
      </div>
    </form>
  );
}
function TimeZoneField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const groups = useMemo(() => listTimeZones(), []);
  return (
    <Field label={t("lang.timezone")}>
      {" "}
      <Select value={value} onChange={(e) => onChange(asTimeZone(e.target.value))}>
        {" "}
        <option value="">{t("lang.timezoneLocal")}</option>
        {groups.map((g) => (
          <optgroup key={g.region} label={g.region}>
            {g.zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.label}
              </option>
            ))}
          </optgroup>
        ))}
      </Select>{" "}
      <p className="settings-hint">{t("lang.timezoneHint")}</p>
    </Field>
  );
}
const REGIONS: {
  id: string;
  labelKey: string;
  locale: "en" | "fr";
  dateFormat: "ymd" | "yyyy" | "dmy" | "mdy" | "iso";
  timeFormat: "24h" | "12h";
  numberFormat: "auto" | "space-comma" | "comma-dot" | "dot-comma" | "apostrophe-comma";
}[] = [
  { id: "en-US", labelKey: "lang.regionEnUs", locale: "en", dateFormat: "mdy", timeFormat: "12h", numberFormat: "comma-dot" },
  { id: "en-GB", labelKey: "lang.regionEnGb", locale: "en", dateFormat: "dmy", timeFormat: "24h", numberFormat: "comma-dot" },
  { id: "fr-FR", labelKey: "lang.regionFrFr", locale: "fr", dateFormat: "dmy", timeFormat: "24h", numberFormat: "space-comma" },
  { id: "fr-CH", labelKey: "lang.regionFrCh", locale: "fr", dateFormat: "dmy", timeFormat: "24h", numberFormat: "apostrophe-comma" },
  { id: "fr-BE", labelKey: "lang.regionFrBe", locale: "fr", dateFormat: "dmy", timeFormat: "24h", numberFormat: "dot-comma" },
  { id: "fr-LU", labelKey: "lang.regionFrLu", locale: "fr", dateFormat: "dmy", timeFormat: "24h", numberFormat: "space-comma" },
];
function LocalesForm({
  initial,
  onSave,
}: {
  initial: PortalSettings;
  onSave: (payload: SettingsPayload) => void;
}) {
  const [locale, setLocaleDraft] = useState(asLocale(initial.locale));
  const [dateFormat, setDateDraft] = useState(asDateFormat(initial.dateFormat));
  const [timeFormat, setTimeDraft] = useState(asTimeFormat(initial.timeFormat));
  const [timezone, setZoneDraft] = useState(asTimeZone(initial.timezone));
  const [numberFormat, setNumberDraft] = useState(asNumberFormat(initial.numberFormat));
  const [regionId, setRegionId] = useState(
    () =>
      REGIONS.find(
        (r) =>
          r.locale === asLocale(initial.locale) &&
          r.dateFormat === asDateFormat(initial.dateFormat) &&
          r.timeFormat === asTimeFormat(initial.timeFormat) &&
          r.numberFormat === asNumberFormat(initial.numberFormat),
      )?.id ?? null,
  );
  const sample = formatWhen(new Date(), true, {
    dateFormat,
    timeFormat,
    timezone,
  });
  const currentRegion = regionId ?? "custom";
  return (
    <form
      id="settings-form"
      className="settings-stack locales-stack"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          ...settingsBase(initial),
          locale: asLocale(locale),
          dateFormat: asDateFormat(dateFormat),
          timeFormat: asTimeFormat(timeFormat),
          timezone: asTimeZone(timezone),
          numberFormat: asNumberFormat(numberFormat),
        });
      }}
    >
      {" "}
      <div className="settings-card">
        <p className="settings-kicker">{t("lang.sectionRegion")}</p>
        <Field label={t("lang.region")}>
          {" "}
          <Select
            value={currentRegion}
            onChange={(e) => {
              const reg = REGIONS.find((r) => r.id === e.target.value);
              if (reg) {
                setRegionId(reg.id);
                setLocaleDraft(reg.locale);
                setDateDraft(reg.dateFormat);
                setTimeDraft(reg.timeFormat);
                setNumberDraft(reg.numberFormat);
              }
            }}
          >
            {" "}
            {REGIONS.map((r) => (
              <option key={r.id} value={r.id}>
                {t(r.labelKey)}
              </option>
            ))}
            <option value="custom">{t("lang.regionCustom")}</option>
          </Select>{" "}
          <p className="settings-hint">{t("lang.regionHint")}</p>
        </Field>
        <Field label={t("lang.label")}>
          {" "}
          <Select value={locale} onChange={(e) => { setRegionId(null); setLocaleDraft(asLocale(e.target.value)); }}>
            {" "}
            <option value="en">{t("lang.en")}</option>
            <option value="fr">{t("lang.fr")}</option>
          </Select>{" "}
          <p className="settings-hint">{t("lang.hint")}</p>
        </Field>
      </div>{" "}
      <div className="settings-card">
        <p className="settings-kicker">{t("lang.sectionFormat")}</p>
        <div className="field-row">
          {" "}
          <Field label={t("lang.dateFormat")}>
            {" "}
            <Select value={dateFormat} onChange={(e) => { setRegionId(null); setDateDraft(asDateFormat(e.target.value)); }}>
              {" "}
              <option value="ymd">{t("lang.dateYmd")}</option>
              <option value="yyyy">{t("lang.dateYyyy")}</option>
              <option value="dmy">{t("lang.dateDmy")}</option>
              <option value="mdy">{t("lang.dateMdy")}</option>
              <option value="iso">{t("lang.dateIso")}</option>
            </Select>{" "}
            <p className="settings-hint">{t("lang.dateHint")}</p>
          </Field>{" "}
          <Field label={t("lang.timeFormat")}>
            {" "}
            <Select value={timeFormat} onChange={(e) => { setRegionId(null); setTimeDraft(asTimeFormat(e.target.value)); }}>
              {" "}
              <option value="24h">{t("lang.time24")}</option>
              <option value="12h">{t("lang.time12")}</option>
            </Select>{" "}
            <p className="settings-hint">{t("lang.timeHint")}</p>
          </Field>
        </div>{" "}
        <TimeZoneField value={timezone} onChange={setZoneDraft} />
      </div>{" "}
      <div className="settings-card">
        <p className="settings-kicker">{t("lang.sectionNumbers")}</p>
        <Field label={t("lang.numberFormat")}>
          {" "}
          <Select
            value={numberFormat}
            onChange={(e) => { setRegionId(null); setNumberDraft(asNumberFormat(e.target.value)); }}
          >
            {" "}
            <option value="auto">{t("lang.numberAuto")}</option>
            <option value="space-comma">{t("lang.numberSpaceComma")}</option>
            <option value="comma-dot">{t("lang.numberCommaDot")}</option>
            <option value="dot-comma">{t("lang.numberDotComma")}</option>
            <option value="apostrophe-comma">{t("lang.numberApostropheComma")}</option>
          </Select>{" "}
          <p className="settings-hint">{t("lang.numberHint")}</p>
        </Field>
      </div>{" "}
      <div className="settings-card">
        <p className="settings-kicker">{t("lang.sectionSample")}</p>
        <div className="lang-sample" aria-hidden>
          <span className="lang-sample-row">
            <span className="lang-sample-label">{t("lang.sampleDate")}</span>
            <span className="lang-sample-value">{sample}</span>
          </span>
          <span className="lang-sample-row">
            <span className="lang-sample-label">{t("lang.sampleNumbers")}</span>
            <span className="lang-sample-value">{formatNumber(1234567.89, numberFormat)}</span>
          </span>
        </div>
      </div>
    </form>
  );
}
function BackupForm({
  token,
  busy,
  catalog,
  title,
  onImport,
}: {
  token: string;
  busy: boolean;
  catalog: CatalogTab[];
  title: string;
  onImport: (payload: unknown) => void;
}) {
  const [pending, setPending] = useState(false);
  const working = busy || pending;
  async function doExport() {
    setPending(true);
    try {
      const payload = await exportPortal({
        data: {
          token,
        },
      });
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dockit-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(t("backup.downloaded"));
    } catch (err) {
      toast.error(te(err));
    } finally {
      setPending(false);
    }
  }
  async function doImport(file: File) {
    if (!file) return;
    if (file.size > 5e6) {
      toast.error(t("backup.fileTooBig"));
      return;
    }
    if (
      !(await askConfirm({
        title: t("actions.importJson"),
        body: t("confirm.importPortal"),
        okLabel: t("actions.importJson"),
      }))
    )
      return;
    setPending(true);
    try {
      const text = await file.text();
      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error("errors.badBackup");
      }
      await onImport(payload);
    } catch (err) {
      toast.error(te(err));
    } finally {
      setPending(false);
    }
  }
  function inventoryRows() {
    return collectInventory(catalog);
  }
  function downloadCsv() {
    const rows = inventoryRows();
    const blob = new Blob([inventoryCsv(rows)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${t("inventory.fileName")}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(t("backup.csvDownloaded"));
  }
  function downloadPdf() {
    try {
      const blob = new Blob([inventoryPdf(inventoryRows(), title || "Dockit") as BlobPart], {
        type: "application/pdf",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${t("inventory.fileName")}-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(t("backup.pdfDownloaded"));
    } catch (err) {
      toast.error(te(err));
    }
  }
  return (
    <div className="settings-stack">
      {" "}
      <div className="settings-card">
        {" "}
        <p className="settings-kicker">{t("backup.portal")}</p>
        <p className="settings-hint">{t("backup.importHint")}</p>
        <div className="settings-actions is-start">
          {" "}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="am-create"
            disabled={working}
            onClick={() => void doExport()}
          >
            {" "}
            <Download className="size-3.5" />
            {t("actions.exportJson")}
          </Button>{" "}
          <label className={`settings-file ${working ? "is-disabled" : ""}`}>
            {" "}
            <Upload className="size-3.5" />
            {t("actions.importJson")}
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              disabled={working}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void doImport(file);
              }}
            />
          </label>
        </div>
      </div>{" "}
      <div className="settings-card">
        {" "}
        <p className="settings-kicker">{t("backup.inventory")}</p>
        <p className="settings-hint">{t("backup.inventoryHint")}</p>
        <div className="settings-actions is-start">
          {" "}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="am-create"
            disabled={working}
            onClick={downloadCsv}
          >
            {" "}
            <Download className="size-3.5" />
            {t("actions.exportCsv")}
          </Button>{" "}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="am-create"
            disabled={working}
            onClick={downloadPdf}
          >
            {" "}
            <FileText className="size-3.5" />
            {t("actions.exportPdf")}
          </Button>
        </div>
      </div>
    </div>
  );
}
function PresentationForm({
  initial,
  onSave,
}: {
  initial: PortalSettings;
  onSave: (payload: SettingsPayload) => void;
}) {
  const [usageStats, setUsageStats] = useState(initial.usageStats !== false);
  const [favNotes, setFavNotes] = useState(Boolean(initial.favNotes));
  const [favEmbeds, setFavEmbeds] = useState(Boolean(initial.favEmbeds));
  const [onlineIcons, setOnlineIcons] = useState(Boolean(initial.onlineIcons));
  const [navRichIcons, setNavRichIcons] = useState(Boolean(initial.navRichIcons));
  const [annexFade, setAnnexFade] = useState(Boolean(initial.annexFade));
  const [catCounts, setCatCounts] = useState(Boolean(initial.catCounts));
  const [cardResize, setCardResize] = useState(initial.cardResize !== false);
  const [cardContextMenu, setCardContextMenu] = useState(initial.cardContextMenu !== false);
  const [cardDragCollapse, setCardDragCollapse] = useState(initial.cardDragCollapse !== false);
  const [cardIconBg, setCardIconBg] = useState(initial.cardIconBg !== false);
  const [infoBar, setInfoBar] = useState(initial.infoBar !== false);
  return (
    <form
      id="settings-form"
      className="settings-stack"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          ...settingsBase(initial),
          usageStats,
          favNotes,
          favEmbeds,
          onlineIcons,
          navRichIcons,
          annexFade,
          catCounts,
          cardResize,
          cardContextMenu,
          cardDragCollapse,
          cardIconBg,
          infoBar,
        });
      }}
    >
      {" "}
      <div className="settings-card">
        {" "}
        <p className="settings-kicker">{t("history.cards")}</p>
        <div className="settings-toggles">
          {" "}
          <label>
            {" "}
            <input
              type="checkbox"
              checked={usageStats}
              onChange={(e) => setUsageStats(e.target.checked)}
            />
            {t("pres.clickCount")}
          </label>
          <p className="settings-hint">{t("pres.clickCountHint")}</p>
          <label>
            {" "}
            <input
              type="checkbox"
              checked={catCounts}
              onChange={(e) => setCatCounts(e.target.checked)}
            />
            {t("pres.catCounts")}
          </label>
          <p className="settings-hint">{t("pres.catCountsHint")}</p>
          <label>
            {" "}
            <input
              type="checkbox"
              checked={favEmbeds}
              onChange={(e) => setFavEmbeds(e.target.checked)}
            />
            {t("pres.favEmbeds")}
          </label>
          <p className="settings-hint">{t("pres.favEmbedsHint")}</p>
          <label>
            {" "}
            <input
              type="checkbox"
              checked={favNotes}
              onChange={(e) => setFavNotes(e.target.checked)}
            />
            {t("pres.favNotes")}
          </label>
          <p className="settings-hint">{t("pres.favNotesHint")}</p>
          <label>
            <input
              type="checkbox"
              checked={cardResize}
              onChange={(e) => setCardResize(e.target.checked)}
            />
            {t("pres.cardResize")}
          </label>
          <p className="settings-hint">{t("pres.cardResizeHint")}</p>
          <label>
            <input
              type="checkbox"
              checked={cardIconBg}
              onChange={(e) => setCardIconBg(e.target.checked)}
            />
            {t("pres.cardIconBg")}
          </label>
          <p className="settings-hint">{t("pres.cardIconBgHint")}</p>
          <label>
            <input
              type="checkbox"
              checked={cardContextMenu}
              onChange={(e) => setCardContextMenu(e.target.checked)}
            />
            {t("pres.cardContextMenu")}
          </label>
          <p className="settings-hint">{t("pres.cardContextMenuHint")}</p>
          <label>
            <input
              type="checkbox"
              checked={cardDragCollapse}
              onChange={(e) => setCardDragCollapse(e.target.checked)}
            />
            {t("pres.cardDragCollapse")}
          </label>
          <p className="settings-hint">{t("pres.cardDragCollapseHint")}</p>
        </div>
      </div>{" "}
      <div className="settings-card">
        {" "}
        <p className="settings-kicker">{t("pres.icons")}</p>
        <div className="settings-toggles">
          <label>
            <input
              type="checkbox"
              checked={onlineIcons}
              onChange={(e) => setOnlineIcons(e.target.checked)}
            />
            {t("pres.onlineIcons")}
          </label>
          <p className="settings-hint">{t("pres.onlineIconsHint")}</p>
          <label>
            <input
              type="checkbox"
              checked={navRichIcons}
              onChange={(e) => setNavRichIcons(e.target.checked)}
            />
            {t("pres.navRichIcons")}
          </label>
          <p className="settings-hint">{t("pres.navRichIconsHint")}</p>
        </div>
      </div>{" "}
      <div className="settings-card">
        {" "}
        <p className="settings-kicker">{t("pres.menus")}</p>
        <div className="settings-toggles">
          {" "}
          <label>
            {" "}
            <input
              type="checkbox"
              checked={annexFade}
              onChange={(e) => setAnnexFade(e.target.checked)}
            />
            {t("pres.annexFade")}
          </label>
          <p className="settings-hint">{t("pres.annexFadeHint")}</p>
        </div>
      </div>{" "}
      <div className="settings-card">
        {" "}
        <p className="settings-kicker">{t("pres.infoBar")}</p>
        <div className="settings-toggles">
          {" "}
          <label>
            {" "}
            <input
              type="checkbox"
              checked={infoBar}
              onChange={(e) => setInfoBar(e.target.checked)}
            />
            {t("pres.showInfoBar")}
          </label>
          <p className="settings-hint">{t("pres.showInfoBarHint")}</p>
        </div>
      </div>
    </form>
  );
}
function ReachabilityForm({
  initial,
  onSave,
}: {
  initial: PortalSettings;
  onSave: (payload: SettingsPayload) => void;
}) {
  const [healthChecks, setHealthChecks] = useState(initial.healthChecks !== false);
  const [probeBlink, setProbeBlink] = useState(Boolean(initial.probeBlink));
  const infoBar = initial.infoBar !== false;
  return (
    <form
      id="settings-form"
      className="settings-stack"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          ...settingsBase(initial),
          healthChecks,
          probeBlink,
        });
      }}
    >
      {" "}
      <div className="settings-card">
        {" "}
        <p className="settings-kicker">{t("reach.probes")}</p>
        <div className="settings-toggles">
          <label>
            <input
              type="checkbox"
              checked={healthChecks}
              onChange={(e) => setHealthChecks(e.target.checked)}
            />
            {t("reach.httpIcmp")}
          </label>
          <p className="settings-hint">{t("reach.perCard")}</p>
          <label className={`is-child ${infoBar && healthChecks ? "" : "is-disabled"}`}>
            <input
              type="checkbox"
              checked={probeBlink}
              disabled={!infoBar || !healthChecks}
              onChange={(e) => setProbeBlink(e.target.checked)}
            />
            {t("reach.blink")}
          </label>
          <p className="settings-hint">{t("reach.blinkHint")}</p>
          {!infoBar ? <p className="settings-hint">{t("reach.infoHidden")}</p> : null}
        </div>
      </div>
    </form>
  );
}
function SecurityForm({
  initial,
  onSave,
}: {
  initial: PortalSettings;
  onSave: (payload: SettingsPayload) => void;
}) {
  const [probeTlsVerify, setProbeTlsVerify] = useState(Boolean(initial.probeTlsVerify));
  const [probeAuthOnly, setProbeAuthOnly] = useState(Boolean(initial.probeAuthOnly));
  const [sessionHttpOnly, setSessionHttpOnly] = useState(Boolean(initial.sessionHttpOnly));
  const [proxyAuthEnabled, setProxyAuthEnabled] = useState(Boolean(initial.proxyAuthEnabled));
  const [proxyAuthHeader, setProxyAuthHeader] = useState(initial.proxyAuthHeader || "X-Remote-User");
  return (
    <form
      id="settings-form"
      className="settings-stack"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          ...settingsBase(initial),
          probeTlsVerify,
          probeAuthOnly,
          sessionHttpOnly,
          proxyAuthEnabled,
          proxyAuthHeader: proxyAuthHeader.trim().slice(0, 64),
        });
      }}
    >
      {" "}
      <div className="settings-card">
        {" "}
        <p className="settings-kicker">{t("reach.probes")}</p>
        <div className="settings-toggles">
          <label>
            <input
              type="checkbox"
              checked={probeTlsVerify}
              onChange={(e) => setProbeTlsVerify(e.target.checked)}
            />
            {t("sec.tls")}
          </label>
          <p className="settings-hint">{t("sec.tlsHint")}</p>
          <label>
            <input
              type="checkbox"
              checked={probeAuthOnly}
              onChange={(e) => setProbeAuthOnly(e.target.checked)}
            />
            {t("sec.authOnly")}
          </label>
          <p className="settings-hint">{t("sec.authOnlyHint")}</p>
        </div>
      </div>{" "}
      <div className="settings-card">
        {" "}
        <p className="settings-kicker">{t("sec.session")}</p>
        <div className="settings-toggles">
          <label>
            <input
              type="checkbox"
              checked={sessionHttpOnly}
              onChange={(e) => setSessionHttpOnly(e.target.checked)}
            />
            {t("sec.httpOnly")}
          </label>
          <p className="settings-hint">{t("sec.httpOnlyHint")}</p>
        </div>
      </div>{" "}

      <div className="settings-card">
        {" "}
        <p className="settings-kicker">{t("sec.proxyAuth")}</p>
        <div className="settings-toggles">
          <label>
            <input
              type="checkbox"
              checked={proxyAuthEnabled}
              onChange={(e) => setProxyAuthEnabled(e.target.checked)}
            />
            {t("sec.proxyAuthOn")}
          </label>
          <p className="settings-hint">{t("sec.proxyAuthHint")}</p>
        </div>
        <Field
          className={`is-child ${proxyAuthEnabled ? "" : "is-disabled"}`}
          label={t("sec.proxyAuthHeader")}
        >
          {" "}
          <Input
            value={proxyAuthHeader}
            disabled={!proxyAuthEnabled}
            placeholder="X-Remote-User"
            onChange={(e) => setProxyAuthHeader(e.target.value)}
          />
        </Field>
      </div>
    </form>
  );
}
function DebugPanel({
  settings,
  runtime,
  session,
  busy,
  onSave,
}: {
  settings: PortalSettings;
  runtime?: PortalData["runtime"];
  session: SessionInfo | null;
  busy: boolean;
  onSave: (payload: SettingsPayload) => void;
}) {
  const s = settings || ({} as PortalSettings);
  const r =
    runtime ||
    ({
      isDev: false,
      publicOrigin: "",
      trustProxy: false,
    } as NonNullable<PortalData["runtime"]>);
  const rows = [
    r.isDev
      ? {
          level: "warn",
          title: t("debug.devTitle"),
          detail: t("debug.devDetail"),
        }
      : {
          level: "ok",
          title: t("debug.prodTitle"),
          detail: t("debug.prodDetail"),
        },
    session?.mustChangePassword
      ? {
          level: "error",
          title: t("debug.weakTitle"),
          detail: t("debug.weakDetail"),
        }
      : null,
    r.isDev && s.devAdminNoPassword
      ? {
          level: "error",
          title: t("debug.noPwTitle"),
          detail: t("debug.noPwDetail"),
        }
      : null,
    s.oidcEnabled && !r.publicOrigin
      ? {
          level: "warn",
          title: t("debug.oidcOriginTitle"),
          detail: t("debug.oidcOriginDetail"),
        }
      : null,
    s.oidcEnabled && !r.trustProxy
      ? {
          level: "warn",
          title: t("debug.proxyTitle"),
          detail: t("debug.proxyDetail"),
        }
      : null,
    s.oidcAutoCreate
      ? {
          level: "warn",
          title: t("debug.autoCreateTitle"),
          detail: t("debug.autoCreateDetail"),
        }
      : null,
    (Array.isArray(s.ldapDirectories) ? s.ldapDirectories : []).some(
      (d) => d.enabled && d.tls === false,
    ) ||
    (s.ldapEnabled && s.ldapTls === false)
      ? {
          level: "warn",
          title: t("debug.ldapTlsTitle"),
          detail: t("debug.ldapTlsDetail"),
        }
      : null,
    (Array.isArray(s.ldapDirectories) ? s.ldapDirectories : []).some(
      (d) => d.enabled && d.autoCreate,
    ) || s.ldapAutoCreate
      ? {
          level: "warn",
          title: t("debug.ldapAutoTitle"),
          detail: t("debug.ldapAutoDetail"),
        }
      : null,
    !s.sessionHttpOnly
      ? {
          level: "info",
          title: t("debug.tokenTitle"),
          detail: t("debug.tokenDetail"),
        }
      : {
          level: "ok",
          title: t("debug.cookieTitle"),
          detail: t("debug.cookieDetail"),
        },
    s.healthChecks !== false && !s.probeTlsVerify
      ? {
          level: "info",
          title: t("debug.tlsTitle"),
          detail: t("debug.tlsDetail"),
        }
      : null,
    s.healthChecks !== false && !s.probeAuthOnly
      ? {
          level: "info",
          title: t("debug.publicTitle"),
          detail: t("debug.publicDetail"),
        }
      : null,
  ].filter((row): row is { level: string; title: string; detail: string } => row !== null);
  return (
    <div className="settings-stack">
      {" "}
      <div className="settings-card">
        <p className="settings-kicker">{t("debug.checks")}</p>
        <p className="settings-hint">{t("debug.intro")}</p>
        {rows.map((row) => (
        <div key={row.title} className={`debug-row is-${row.level}`}>
          {" "}
          <span className="debug-level">
            {row.level === "error"
              ? t("debug.critical")
              : row.level === "warn"
                ? t("debug.warn")
                : row.level === "ok"
                  ? t("debug.ok")
                  : t("debug.info")}
          </span>{" "}
          <div>
            {" "}
            <p className="debug-title">{row.title}</p>
            <p className="settings-hint">{row.detail}</p>
          </div>
        </div>
        ))}
      </div>

      <div className="settings-card">
        <p className="settings-kicker">{t("sec.dev")}</p>
        <div className="settings-toggles">
          <label className={runtime?.isDev ? "" : "is-disabled"}>
            <input
              type="checkbox"
              checked={Boolean(s.devAdminNoPassword)}
              disabled={!runtime?.isDev || busy}
              onChange={(e) =>
                onSave({ ...settingsBase(s), devAdminNoPassword: e.target.checked })
              }
            />
            {t("sec.noPassword")}
          </label>
          <p className="settings-hint">
            {runtime?.isDev ? t("sec.noPasswordHintDev") : t("sec.noPasswordHintProd")}
          </p>
        </div>
      </div>
    </div>
  );
}
function InfoBarForm({
  initial,
  onSave,
}: {
  initial: PortalSettings;
  onSave: (payload: SettingsPayload) => void;
}) {
  const [infoStats, setInfoStats] = useState(initial.infoStats !== false);
  const [infoGeek, setInfoGeek] = useState(initial.infoGeek !== false);
  const infoBar = initial.infoBar !== false;
  return (
    <form
      id="settings-form"
      className="settings-stack"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          ...settingsBase(initial),
          infoStats,
          infoGeek,
        });
      }}
    >
      {" "}
      <div className="settings-card">
        {" "}
        <p className="settings-kicker">{t("stats.title")}</p>
        <div className="settings-toggles">
          <label className={infoBar ? "" : "is-disabled"}>
            <input
              type="checkbox"
              checked={infoStats}
              disabled={!infoBar}
              onChange={(e) => setInfoStats(e.target.checked)}
            />
            {t("info.statsIcon")}
          </label>
          <p className="settings-hint">{infoBar ? t("info.statsHint") : t("info.statsHintHidden")}</p>
          <label className={infoBar ? "" : "is-disabled"}>
            <input
              type="checkbox"
              checked={infoGeek}
              disabled={!infoBar}
              onChange={(e) => setInfoGeek(e.target.checked)}
            />
            {t("info.geek")}
          </label>
          {infoBar ? <p className="settings-hint">{t("info.geekHint")}</p> : null}
        </div>
      </div>
    </form>
  );
}
type ThemeColors = { bg: string; surface: string; header: string };
const THEME_COLOR_FIELDS: { id: keyof ThemeColors; cssVar: string }[] = [
  {
    id: "bg",
    cssVar: "--color-bg",
  },
  {
    id: "surface",
    cssVar: "--color-surface",
  },
  {
    id: "header",
    cssVar: "--color-header",
  },
];
const LIGHT_COLORS = {
  bg: "#fcfcfd",
  surface: "#ffffff",
  header: "#fcfcfc",
};
const DARK_COLORS = {
  bg: "#0e1116",
  surface: "#171b22",
  header: "#12151b",
};
const MANAGED_BLOCK_RE =
  /html\.(?:light|dark)\s*\{\s*(?:--color-(?:bg|surface|header)\s*:\s*#[0-9a-fA-F]{3,8}\s*;\s*)+\}/g;
function expandHex(raw: string) {
  const s = raw.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s))
    return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase();
  return null;
}
function hexLuma(raw: unknown) {
  const hex = expandHex(String(raw || ""));
  if (!hex) return 1;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function parseThemeCss(css: string, fallback: ThemeColors) {
  const colors = {
    ...fallback,
  };
  for (const field of THEME_COLOR_FIELDS) {
    const re = new RegExp(`${field.cssVar.replace(/-/g, "\\-")}\\s*:\\s*(#[0-9a-fA-F]{3,8})`, "g");
    let match;
    let last = null;
    while ((match = re.exec(css))) last = match[1];
    const hex = last ? expandHex(last) : null;
    if (hex) colors[field.id] = hex;
  }
  return {
    colors,
    extra: css.replace(MANAGED_BLOCK_RE, "").trim(),
  };
}
function composeThemeCss(mode: string, colors: ThemeColors, extra: string) {
  const block = `html.${mode} {\n  --color-bg: ${colors.bg};\n  --color-surface: ${colors.surface};\n  --color-header: ${colors.header};\n}`;
  const rest = extra.trim();
  return rest ? `${rest}\n${block}\n` : `${block}\n`;
}
function ThemeColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="theme-chip">
      {" "}
      <span>{label}</span>
      <span
        className={`theme-hex${hexLuma(value) < 0.55 ? " is-dark" : ""}`}
        style={{
          background: value,
        }}
      >
        {" "}
        <input
          type="color"
          value={value}
          aria-label={`${label} (hex ${value})`}
          title={value}
          onChange={(e) => onChange(e.target.value.toLowerCase())}
        />{" "}
        <span className="theme-hex-code">{value}</span>
      </span>
    </label>
  );
}
function ThemeForm({
  initial,
  onSave,
}: {
  initial: PortalSettings;
  busy: boolean;
  onCancel: () => void;
  onSave: (payload: { cssLight: string; cssDark: string }) => void;
}) {
  const { theme, apply } = useTheme();
  const [pane, setPane] = useState(theme);
  const lightParsed = parseThemeCss(initial.cssLight || "", LIGHT_COLORS);
  const darkParsed = parseThemeCss(initial.cssDark || "", DARK_COLORS);
  const [lightColors, setLightColors] = useState(lightParsed.colors);
  const [darkColors, setDarkColors] = useState(darkParsed.colors);
  const [lightExtra, setLightExtra] = useState(lightParsed.extra);
  const [darkExtra, setDarkExtra] = useState(darkParsed.extra);
  const colors = pane === "light" ? lightColors : darkColors;
  const setColors = pane === "light" ? setLightColors : setDarkColors;
  const extra = pane === "light" ? lightExtra : darkExtra;
  const setExtra = pane === "light" ? setLightExtra : setDarkExtra;
  useEffect(() => {
    const el = document.createElement("style");
    el.id = "portal-user-theme-draft";
    document.head.appendChild(el);
    return () => {
      el.remove();
    };
  }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const el = document.getElementById("portal-user-theme-draft");
      if (!el) return;
      const css =
        theme === "dark"
          ? composeThemeCss("dark", darkColors, darkExtra)
          : composeThemeCss("light", lightColors, lightExtra);
      el.textContent = sanitizeThemeCss(css);
    });
    return () => cancelAnimationFrame(frame);
  }, [theme, lightColors, darkColors, lightExtra, darkExtra]);
  return (
    <form
      id="settings-form"
      className="settings-stack theme-stack"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          cssLight: composeThemeCss("light", lightColors, lightExtra),
          cssDark: composeThemeCss("dark", darkColors, darkExtra),
        });
      }}
    >
      {" "}
      <div className="settings-card">
        {" "}
        <p className="settings-kicker">{t("theme.colors")}</p>
        <div className="am-filters" role="tablist" aria-label={t("theme.colors")}>
          <button
            type="button"
            role="tab"
            aria-selected={pane === "light"}
            className={pane === "light" ? "is-on" : ""}
            onClick={() => {
              setPane("light");
              apply("light");
            }}
          >
            {t("theme.light")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={pane === "dark"}
            className={pane === "dark" ? "is-on" : ""}
            onClick={() => {
              setPane("dark");
              apply("dark");
            }}
          >
            {t("theme.dark")}
          </button>
        </div>
        <div className="theme-palette">
          {THEME_COLOR_FIELDS.map((field) => (
            <ThemeColorField
              key={field.id}
              label={t(`theme.${field.id}`)}
              value={colors[field.id]}
              onChange={(next) =>
                setColors((prev) => ({
                  ...prev,
                  [field.id]: next,
                }))
              }
            />
          ))}
        </div>
        <div className="theme-css-meta">
          {" "}
          <span />
          <button
            type="button"
            className="settings-link"
            onClick={() => setColors({ ...(pane === "light" ? LIGHT_COLORS : DARK_COLORS) })}
          >
            {t("theme.resetColors")}
          </button>
        </div>
      </div>{" "}
      <div className="settings-card">
        {" "}
        <p className="settings-kicker">{t("theme.css")}</p>
        <textarea
          className="field-input theme-extra-css w-full resize-y rounded-lg border border-border bg-transparent p-2.5 font-mono leading-relaxed text-fg outline-none placeholder:text-subtle"
          value={extra}
          spellCheck={false}
          maxLength={CSS_MAX}
          placeholder={t("theme.cssHint")}
          onChange={(e) => setExtra(e.target.value)}
        />{" "}
        <div className="theme-css-meta">
          {" "}
          <span>
            {extra.length.toLocaleString(localeTag())} / {CSS_MAX.toLocaleString(localeTag())}
          </span>{" "}
          <button
            type="button"
            className="settings-link"
            onClick={() => {
              setExtra("");
            }}
          >
            {t("theme.reset")}
          </button>
        </div>
      </div>
    </form>
  );
}
function LockForm({
  busy,
  oidcEnabled,
  oidcAutoRedirect,
  oidcLabel,
  ldapEnabled,
  ldapDomain,
  ldapRealms,
  loginOrder,
  noPassword,
  onCancel,
  onUnlock,
  onOidc,
}: {
  busy: boolean;
  oidcEnabled: boolean;
  oidcAutoRedirect?: boolean;
  oidcLabel: string;
  ldapEnabled: boolean;
  ldapDomain: string;
  ldapRealms?: { id: string; label: string }[];
  loginOrder?: string[];
  noPassword: boolean;
  onCancel: () => void;
  onUnlock: (username: string, password: string, domain: string) => void;
  onOidc?: () => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const realms = Array.isArray(ldapRealms)
    ? ldapRealms
    : ldapEnabled && ldapDomain
      ? [
          {
            id: "ad",
            label: ldapDomain,
          },
        ]
      : [];
  const showDomain = realms.length > 0;
  const [ssoTried, setSsoTried] = useState(false);
  useEffect(() => {
    if (!oidcEnabled || !oidcAutoRedirect || ssoTried || !onOidc) return;
    let last = 0;
    try {
      last = Number(sessionStorage.getItem("oidc-auto") || 0);
    } catch {
      // ignore
    }
    if (Date.now() - last < 30000) return;
    try {
      sessionStorage.setItem("oidc-auto", String(Date.now()));
    } catch {
      // ignore
    }
    setSsoTried(true);
    onOidc();
  }, [oidcEnabled, oidcAutoRedirect, ssoTried, onOidc]);
  const domainOptions = [];
  for (const id of Array.isArray(loginOrder) && loginOrder.length
    ? loginOrder
    : ["local", ...realms.map((r) => r.id)]) {
    if (id === "local")
      domainOptions.push({
        value: "local",
        label: t("lock.local"),
      });
    else {
      const realm = realms.find((r) => r.id === id) || (id === "ad" ? realms[0] : null);
      if (realm)
        domainOptions.push({
          value: realm.id,
          label: realm.label,
        });
    }
  }
  if (!domainOptions.some((o) => o.value === "local"))
    domainOptions.unshift({
      value: "local",
      label: t("lock.local"),
    });
  const [domain, setDomain] = useState(domainOptions[0]?.value || "local");
  return (
    <form
      className="settings-stack"
      onSubmit={(e) => {
        e.preventDefault();
        const name = username.trim() || "admin";
        const bypass = noPassword && (!username.trim() || name.toLowerCase() === "admin");
        onUnlock(name, password, bypass ? "local" : showDomain ? domain : "local");
      }}
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 className="dialog-title">{t("account.login")}</h3>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onCancel}
          aria-label={t("actions.close")}
          title={t("actions.close")}
        >
          <X className="size-4" />
        </Button>
      </div>
      <Field label={t("lock.username")}>
        <div className="field-ico-wrap">
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            required={!noPassword}
          />
          <User className="field-ico" aria-hidden />
        </div>
      </Field>
      <Field label={t("lock.password")}>
        <div className="field-ico-wrap">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required={!noPassword}
          />
          <Lock className="field-ico" aria-hidden />
        </div>
      </Field>
      {showDomain ? (
        <Field label={t("lock.domain")}>
          <div className="field-ico-wrap">
            <Select value={domain} onChange={(e) => setDomain(e.target.value)}>
              {domainOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
            <Server className="field-ico" aria-hidden />
          </div>
        </Field>
      ) : null}
      <div className="settings-actions">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t("actions.cancel")}
        </Button>
        <Button type="submit" variant={noPassword ? "debug" : "default"} disabled={busy}>
          {t("lock.submit")}
        </Button>
      </div>
      {oidcEnabled ? (
        <>
          <div className="lock-or">{t("lock.or")}</div>
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={busy}
            onClick={() => void onOidc?.()}
          >
            <Globe className="size-4" />
            {oidcLabel || "SSO"}
          </Button>
          {ssoTried ? <p className="settings-hint">{t("lock.ssoRedirect")}</p> : null}
        </>
      ) : null}
    </form>
  );
}
function issuerHost(url: unknown) {
  try {
    return new URL(String(url || "")).host || "";
  } catch {
    return "";
  }
}
function IdentitySourcesPanel({
  settings,
  busy,
  onSaveLdap,
  onSaveOidc,
  onSaveLoginOrder,
}: {
  settings: PortalSettings;
  busy: boolean;
  onSaveLdap: (payload: LdapPayload) => void;
  onSaveOidc: (payload: OidcPayload) => void;
  onSaveLoginOrder: (order: string[]) => void;
}) {
  const expand = useExpandSession();
  const listRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ key: string; pointerId: number } | null>(null);
  const didDrag = useRef(false);
  const snap = useRef("");
  const [dirs, setDirs] = useState<LdapDirRow[]>(() => seedLdapDirs(settings));
  const [order, setOrder] = useState(() =>
    Array.isArray(settings.loginOrder) && settings.loginOrder.length
      ? settings.loginOrder
      : ["local", ...seedLdapDirs(settings).map((d) => d.id)],
  );
  const orderRef = useRef(order);
  orderRef.current = order;
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; name?: string } | null>(null);
  const [oidcDraft, setOidcDraft] = useState(false);
  function patchDir(id: string, next: Partial<LdapDirRow>) {
    setDirs((cur) => {
      const out = cur.map((d) =>
        d.id === id
          ? {
              ...d,
              ...next,
            }
          : d,
      );
      expand.markDirty(JSON.stringify(out) !== snap.current);
      return out;
    });
  }
  function persistDirs(nextDirs?: LdapDirRow[], nextOrder?: string[]) {
    const list = nextDirs || dirs;
    onSaveLdap({
      ldapDirectories: list.map((d) => ({
        id: d.id,
        enabled: Boolean(d.enabled),
        host: String(d.host || "").trim(),
        port: Number(d.port) || (d.tls === false ? 389 : 636),
        tls: d.tls !== false,
        tlsVerify: d.tlsVerify !== false,
        bindDn: String(d.bindDn || "").trim(),
        bindPassword: d.bindPassword || "",
        baseDn: String(d.baseDn || "").trim(),
        userFilter: String(d.userFilter || "").trim(),
        domain: String(d.domain || "").trim(),
        autoCreate: Boolean(d.autoCreate),
      })),
    });
    if (nextOrder) onSaveLoginOrder(nextOrder);
    snap.current = JSON.stringify(list);
    expand.markDirty(false);
  }
  const oidcOn =
    Boolean(settings.oidcEnabled) && Boolean(settings.oidcIssuer) && Boolean(settings.oidcClientId);
  const ranked = [];
  for (const id of order) {
    if (id === "local") {
      ranked.push({
        id: "local",
        name: t("lock.local"),
        type: t("access.idpTypeLocal"),
        host: "",
        on: true,
        draggable: true,
      });
      continue;
    }
    const d = dirs.find((x) => x.id === id);
    if (!d) continue;
    ranked.push({
      id: d.id,
      name: d.domain || t("ldap.directory"),
      type: t("access.idpTypeAd"),
      host: d.host || "",
      on: Boolean(d.enabled),
      draggable: true,
      dir: d,
    });
  }
  if (!ranked.some((r) => r.id === "local"))
    ranked.unshift({
      id: "local",
      name: t("lock.local"),
      type: t("access.idpTypeLocal"),
      host: "",
      on: true,
      draggable: true,
    });
  const extras = [];
  const showOidc = oidcOn || Boolean(settings.oidcEnabled) || oidcDraft;
  if (showOidc) {
    extras.push({
      id: "oidc",
      name: settings.oidcLabel || t("access.oidc"),
      type: t("access.idpTypeOidc"),
      host: issuerHost(settings.oidcIssuer),
      on: oidcOn,
      draggable: false,
    });
  }
  const defaultId =
    order.find((id) => id === "local" || dirs.some((d) => d.id === id && d.enabled)) || "local";
  function toggleRow(id: string, edit: boolean) {
    if (didDrag.current) {
      didDrag.current = false;
      return;
    }
    if (expand.openId === id) {
      expand.requestClose();
      return;
    }
    expand.requestOpen(id, {
      edit: Boolean(edit),
      apply: () => {
        snap.current = JSON.stringify(dirs);
        expand.markDirty(false);
      },
    });
  }
  function addAd() {
    if (dirs.length >= 8) return;
    const d = blankLdapDir();
    const nextDirs = [...dirs, d];
    const nextOrder = [...order.filter((id) => id !== d.id), d.id];
    if (!nextOrder.includes("local")) nextOrder.unshift("local");
    setDirs(nextDirs);
    setOrder(nextOrder);
    snap.current = JSON.stringify(nextDirs);
    expand.requestOpen(d.id, {
      edit: true,
      apply: () => expand.markDirty(false),
    });
  }
  function setDefault(id: string) {
    if (!id || id === "oidc") return;
    const next = [id, ...order.filter((x) => x !== id)];
    if (!next.includes("local")) next.unshift("local");
    setOrder(next);
    onSaveLoginOrder(next);
  }
  function removeProvider(id: string) {
    if (id === "local") return;
    if (id === "oidc") {
      onSaveOidc({
        oidcEnabled: false,
        oidcIssuer: settings.oidcIssuer || "",
        oidcClientId: settings.oidcClientId || "",
        oidcClientSecret: "",
        oidcLabel: settings.oidcLabel || "SSO",
        oidcAutoCreate: Boolean(settings.oidcAutoCreate),
      });
      setOidcDraft(false);
      expand.requestClose();
      return;
    }
    const nextDirs = dirs.filter((d) => d.id !== id);
    const nextOrder = order.filter((x) => x !== id);
    setDirs(nextDirs);
    setOrder(nextOrder);
    persistDirs(nextDirs, nextOrder);
    expand.markDirty(false);
    expand.requestClose();
  }
  function moveOrder(id: string, dir: number) {
    const i = order.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    const next = [...order];
    const [row] = next.splice(i, 1);
    next.splice(j, 0, row);
    setOrder(next);
    onSaveLoginOrder(next);
  }
  function endDrag(el: HTMLElement | null, pointerId?: number) {
    dragRef.current = null;
    setDragKey(null);
    try {
      if (pointerId != null) el?.releasePointerCapture(pointerId);
    } catch {
      // ignore
    }
  }
  function onGripDown(e: ReactPointerEvent<HTMLElement>, key: string) {
    if (order.length < 2 || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      key,
      pointerId: e.pointerId,
    };
    didDrag.current = false;
    setDragKey(key);
  }
  function onGripMove(e: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const root = listRef.current;
    if (!root) return;
    const others = [...root.querySelectorAll<HTMLElement>("[data-row-id]")].filter((row) => {
      const id = row.getAttribute("data-row-id");
      return id && id !== drag.key && order.includes(id);
    });
    let to = others.length;
    for (let i = 0; i < others.length; i++) {
      const box = others[i].getBoundingClientRect();
      if (e.clientY < box.top + box.height / 2) {
        to = i;
        break;
      }
    }
    setOrder((cur) => {
      const from = cur.findIndex((id) => id === drag.key);
      if (from < 0 || from === to) return cur;
      didDrag.current = true;
      const rest = cur.filter((id) => id !== drag.key);
      rest.splice(to, 0, cur[from]);
      return rest;
    });
  }
  function onGripUp(e: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    endDrag(e.currentTarget, e.pointerId);
    if (didDrag.current) onSaveLoginOrder(orderRef.current);
  }
  type ProviderRow = {
    id: string;
    name: string;
    type: string;
    host: string;
    on: boolean;
    draggable: boolean;
    dir?: LdapDirRow;
  };
  function renderCard(r: ProviderRow) {
    const open = expand.openId === r.id;
    const isDefault = r.id === defaultId;
    const dir = r.dir || dirs.find((d) => d.id === r.id);
    return (
      <ExpandRow
        key={r.id}
        id={r.id}
        className="is-provider"
        expanded={open}
        dragging={dragKey === r.id}
        grip={r.draggable}
        onToggle={() => toggleRow(r.id, r.id !== "local")}
        onAltMove={r.draggable ? (dir) => moveOrder(r.id, dir) : undefined}
        onGripDown={r.draggable ? (e) => onGripDown(e, r.id) : undefined}
        onGripMove={r.draggable ? onGripMove : undefined}
        onGripUp={r.draggable ? onGripUp : undefined}
        cells={[
          <span key="n" className="am-row-title">
            {r.name}
            {r.host ? <span className="am-row-sub">{r.host}</span> : null}
          </span>,
          <span key="s" className={`am-status${r.on ? "" : " is-off"}`}>
            {r.on ? t("access.active") : t("access.disabled")}
          </span>,
          <span key="d">
            {isDefault ? <span className="am-badge">{t("access.idpDefault")}</span> : null}
          </span>,
        ]}
      >
        {r.id === "local" ? (
          <p className="am-note">{t("access.idpLocalHint")}</p>
        ) : r.id === "oidc" ? (
          <>
            <OidcForm
              initial={settings}
              busy={busy}
              onSave={(payload) => {
                onSaveOidc(payload);
                expand.markDirty(false);
              }}
            />
            <div className="am-actions">
              <button
                type="button"
                className="am-text-btn is-danger"
                onClick={() =>
                  setConfirm({
                    id: "oidc",
                  })
                }
              >
                {t("access.idpRemove")}
              </button>
              <Button type="submit" form="oidc-form" size="sm" disabled={busy}>
                {t("actions.save")}
              </Button>
            </div>
          </>
        ) : dir ? (
          <form
            id={`ldap-form-${dir.id}`}
            className="settings-stack"
            onSubmit={(e) => {
              e.preventDefault();
              persistDirs(dirs, order);
            }}
          >
            <LdapDirFields d={dir} patch={(next) => patchDir(dir.id, next)} />
            <div className="am-actions">
              <button
                type="button"
                className="am-text-btn"
                onClick={() => {
                  persistDirs(
                    dirs.map((d) =>
                      d.id === dir.id
                        ? {
                            ...d,
                            enabled: !d.enabled,
                          }
                        : d,
                    ),
                    order,
                  );
                  setDirs((cur) =>
                    cur.map((d) =>
                      d.id === dir.id
                        ? {
                            ...d,
                            enabled: !d.enabled,
                          }
                        : d,
                    ),
                  );
                }}
              >
                {dir.enabled ? t("access.disable") : t("access.enable")}
              </button>
              <button type="button" className="am-text-btn" onClick={() => setDefault(dir.id)}>
                {t("access.idpSetDefault")}
              </button>
              <button
                type="button"
                className="am-text-btn is-danger"
                onClick={() =>
                  setConfirm({
                    id: dir.id,
                    name: dir.domain || t("ldap.directory"),
                  })
                }
              >
                {t("access.idpRemove")}
              </button>
              <Button type="submit" size="sm" disabled={busy}>
                {t("actions.save")}
              </Button>
            </div>
          </form>
        ) : null}
      </ExpandRow>
    );
  }
  return (
    <div className="am-work">
      <div className="am-toolbar">
        <span className="am-toolbar-title">{t("access.idpSources")}</span>
        <button
          type="button"
          className="am-create shrink-0"
          onClick={addAd}
          disabled={dirs.length >= 8}
        >
          <Plus className="size-3.5" /> {t("access.idpAddAd")}
        </button>
        <button
          type="button"
          className="am-create shrink-0"
          onClick={() => {
            setOidcDraft(true);
            toggleRow("oidc", true);
          }}
        >
          <Plus className="size-3.5" /> {t("access.idpAddOidc")}
        </button>
      </div>
      <EdgeFade className="am-list-wrap">
        <div ref={listRef} className="am-providers" role="list">
          {ranked.map(renderCard)}
          {extras.map(renderCard)}
        </div>
      </EdgeFade>
      {confirm ? (
        <ConfirmPopup
          title={t("access.idpRemove")}
          body={confirm.id === "oidc" ? t("access.oidcLead") : t("access.ldapLead")}
          busy={busy}
          okLabel={t("access.idpRemove")}
          onCancel={() => setConfirm(null)}
          onOk={() => {
            removeProvider(confirm.id);
            setConfirm(null);
          }}
        />
      ) : null}
      {expand.ask ? (
        <ConfirmPopup
          title={t("access.discardTitle")}
          body={t("access.discardBody")}
          okLabel={t("access.discard")}
          onCancel={expand.dismissAsk}
          onOk={expand.confirmAsk}
        />
      ) : null}
    </div>
  );
}
function LdapDirFields({ d, patch }: { d: LdapDirRow; patch: (next: Partial<LdapDirRow>) => void }) {
  const tlsOn = d.tls !== false;
  return (
    <>
      <div className="settings-toggles">
        <label>
          <input
            type="checkbox"
            checked={Boolean(d.enabled)}
            onChange={(e) =>
              patch({
                enabled: e.target.checked,
              })
            }
          />
          {t("ldap.enable")}
        </label>
        <label>
          <input
            type="checkbox"
            checked={Boolean(d.autoCreate)}
            onChange={(e) =>
              patch({
                autoCreate: e.target.checked,
              })
            }
          />
          {t("ldap.autoCreate")}
        </label>
        <label>
          <input
            type="checkbox"
            checked={tlsOn}
            onChange={(e) => {
              const on = e.target.checked;
              patch({
                tls: on,
                port: d.port === 389 || d.port === 636 ? (on ? 636 : 389) : d.port,
              });
            }}
          />
          {t("ldap.tls")}
        </label>
        <label className={`is-child ${tlsOn ? "" : "is-disabled"}`}>
          <input
            type="checkbox"
            checked={d.tlsVerify !== false}
            disabled={!tlsOn}
            onChange={(e) =>
              patch({
                tlsVerify: e.target.checked,
              })
            }
          />
          {t("ldap.tlsVerify")}
        </label>
      </div>
      <div className="field-row">
        <Field label={t("ldap.domain")} hint={t("ldap.domainHint")}>
          <Input
            value={d.domain}
            onChange={(e) =>
              patch({
                domain: e.target.value,
              })
            }
            placeholder="CORP"
            required={Boolean(d.enabled)}
          />
        </Field>
        <Field label={t("ldap.host")} hint={t("ldap.hostHint")}>
          <Input
            value={d.host}
            onChange={(e) =>
              patch({
                host: e.target.value,
              })
            }
            placeholder="dc.example.local"
            required={Boolean(d.enabled)}
          />
        </Field>
      </div>
      <Field label={t("ldap.port")}>
        <Input
          type="number"
          min={1}
          max={65535}
          value={d.port}
          onChange={(e) =>
            patch({
              port: Number(e.target.value) || 0,
            })
          }
        />
      </Field>
      <Field label={t("ldap.bindDn")} hint={t("ldap.bindHint")}>
        <Input
          value={d.bindDn}
          onChange={(e) =>
            patch({
              bindDn: e.target.value,
            })
          }
          placeholder="CN=dockit,OU=Services,DC=example,DC=local"
        />
      </Field>
      <Field label={t("ldap.bindPassword")}>
        <Input
          type="password"
          value={d.bindPassword}
          onChange={(e) =>
            patch({
              bindPassword: e.target.value,
            })
          }
          placeholder={d.hasBindPassword ? t("oidc.secretUnchanged") : t("oidc.secretOptional")}
        />
      </Field>
      <Field label={t("ldap.baseDn")}>
        <Input
          value={d.baseDn}
          onChange={(e) =>
            patch({
              baseDn: e.target.value,
            })
          }
          placeholder="DC=example,DC=local"
          required={Boolean(d.enabled) && Boolean(String(d.bindDn || "").trim())}
        />
      </Field>
      <Field label={t("ldap.filter")} hint={t("ldap.filterHint")}>
        <Input
          value={d.userFilter}
          onChange={(e) =>
            patch({
              userFilter: e.target.value,
            })
          }
          placeholder="(&(objectClass=user)(sAMAccountName={username}))"
        />
      </Field>
    </>
  );
}
type OidcPayload = {
  oidcEnabled: boolean;
  oidcIssuer: string;
  oidcClientId: string;
  oidcClientSecret?: string;
  oidcLabel?: string;
  oidcAutoCreate?: boolean;
  oidcAutoRedirect?: boolean;
};
type LdapDirectoryPayload = {
  id: string;
  enabled: boolean;
  host: string;
  port?: number;
  tls?: boolean;
  tlsVerify?: boolean;
  bindDn?: string;
  bindPassword?: string;
  baseDn?: string;
  userFilter?: string;
  domain?: string;
  autoCreate?: boolean;
};
type LdapPayload = { ldapDirectories: LdapDirectoryPayload[] };
function AccessFrame({
  token,
  session,
  tabs,
  settings,
  busy,
  onClose,
  onSaveOidc,
  onSaveLdap,
  onSaveLoginOrder,
}: {
  token: string;
  session: SessionInfo | null;
  tabs: MenuTab[];
  settings: PortalSettings;
  busy: boolean;
  onClose: () => void;
  onSaveOidc: (payload: OidcPayload) => void;
  onSaveLdap: (payload: LdapPayload) => void;
  onSaveLoginOrder: (order: string[]) => void;
}) {
  const [section, setSection] = useState("users");
  const canAccess = Boolean(
    session?.canManageUsers ||
    session?.canManageGroups ||
    session?.canManageRoles ||
    session?.role === "admin",
  );
  const canSettings = Boolean(session?.canManageSettings || session?.role === "admin");
  const pane = canAccess || canSettings ? section : "users";
  const current =
    pane === "auth"
      ? {
          label: t("access.auth"),
          lead: t("access.authLead"),
        }
      : pane === "groups"
        ? {
            label: t("access.groups"),
            lead: t("access.groupsLead"),
          }
        : pane === "roles"
          ? {
              label: t("access.roles"),
              lead: t("access.rolesLead"),
            }
          : {
              label: t("access.users"),
              lead: t("access.usersLead"),
            };
  const accessPane = true;
  return (
    <div className="settings-frame is-wide is-access">
      {" "}
      <nav className="settings-nav" aria-label={t("access.sectionsAria")}>
        {" "}
        <p className="menu-title">{t("access.title")}</p>
        <button
          type="button"
          className={`settings-nav-item ${pane === "users" ? "is-on" : ""}`}
          onClick={() => setSection("users")}
        >
          {" "}
          <Users className="size-4 shrink-0" />
          {t("access.users")}
        </button>
        {canAccess ? (
          <button
            type="button"
            className={`settings-nav-item ${pane === "groups" ? "is-on" : ""}`}
            onClick={() => setSection("groups")}
          >
            {" "}
            <Folder className="size-4 shrink-0" />
            {t("access.groups")}
          </button>
        ) : null}
        {canAccess ? (
          <button
            type="button"
            className={`settings-nav-item ${pane === "roles" ? "is-on" : ""}`}
            onClick={() => setSection("roles")}
          >
            {" "}
            <Shield className="size-4 shrink-0" />
            {t("access.roles")}
          </button>
        ) : null}
        {canSettings ? (
          <button
            type="button"
            className={`settings-nav-item ${pane === "auth" ? "is-on" : ""}`}
            onClick={() => setSection("auth")}
          >
            {" "}
            <LogIn className="size-4 shrink-0" />
            {t("access.auth")}
          </button>
        ) : null}
      </nav>{" "}
      <div className="settings-body">
        {" "}
        <div className="settings-head">
          {" "}
          <div className="settings-head-copy">
            {" "}
            <h3 className="dialog-title">{current.label}</h3>
            <p className="settings-lead">{current.lead}</p>
          </div>{" "}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label={t("actions.close")}
            title={t("actions.close")}
          >
            {" "}
            <X className="size-4" />
          </Button>
        </div>{" "}
        <div className={`settings-pane${accessPane ? " is-access" : ""}`}>
          {pane === "auth" ? (
            <IdentitySourcesPanel
              settings={settings}
              busy={busy}
              onSaveLdap={onSaveLdap}
              onSaveOidc={onSaveOidc}
              onSaveLoginOrder={onSaveLoginOrder}
            />
          ) : pane === "roles" ? (
            <AccessRoles token={token} tabs={tabs} directories={seedLdapDirs(settings)} />
          ) : pane === "groups" ? (
            <AccessGroups
              token={token}
              actor={session ?? undefined}
              tabs={tabs}
              directories={seedLdapDirs(settings)}
            />
          ) : (
            <AccessUsers token={token} actor={session ?? undefined} tabs={tabs} />
          )}
        </div>
      </div>
    </div>
  );
}
function IconPicker({
  value,
  onChange,
  token,
  library,
  onLibrary,
  online,
  siteUrl,
  pictosOnly,
  header,
}: {
  value: string;
  onChange: (v: string) => void;
  token: string;
  library: CustomIcon[];
  onLibrary: (icons: CustomIcon[]) => void;
  online: boolean;
  siteUrl?: string;
  pictosOnly?: boolean;
  header?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [remote, setRemote] = useState<{ id: string; src: string }[]>([]);
  const [busyIcon, setBusyIcon] = useState(false);
  const [tab, setTab] = useState<"all" | "icons" | "symbols">("all");
  const query = q.trim().toLowerCase();
  useEffect(() => {
    if (!open || pictosOnly || !online || query.length < 2) {
      if (!open || pictosOnly || query.length < 2) setRemote([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`https://api.iconify.design/search?query=${encodeURIComponent(query)}&limit=48`, {
        signal: ctrl.signal,
      })
        .then((r) => r.json())
        .then((json) => {
          const ids = ((json.icons ?? []) as string[]).slice(0, 48);
          setRemote(
            ids
              .map((id) => ({ id, src: iconifySrc(id) }))
              .filter((x) => x.src),
          );
        })
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, online, open, pictosOnly]);
  function close() {
    setOpen(false);
    setQ("");
    setTab("all");
  }
  function choose(next: string) {
    onChange(next);
    close();
  }
  async function pickRemote(src: string) {
    setBusyIcon(true);
    try {
      choose(await urlToDataUrl(src));
    } catch (err) {
      toast.error(te(err));
    } finally {
      setBusyIcon(false);
    }
  }
  async function importFile(file: File) {
    if (!file) return;
    setBusyIcon(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const name = file.name.replace(/\.[^.]+$/, "").slice(0, 80) || "icone";
      if (token)
        onLibrary(
          await saveCustomIcon({
            data: {
              token,
              name,
              dataUrl,
            },
          }),
        );
      choose(dataUrl);
    } catch (err) {
      if (sessionGone(err)) return;
      toast.error(te(err));
    } finally {
      setBusyIcon(false);
    }
  }
  async function grabFavicon() {
    const href = safeAppHref(siteUrl);
    if (!href) {
      toast.error(t("icons.needUrl"));
      return;
    }
    if (!token) {
      toast.error(t("icons.needSession"));
      return;
    }
    const current = (value || "").trim();
    if (
      current &&
      current !== "Link" &&
      current !== "AppWindow" &&
      !(await askConfirm({
        title: t("icons.choose"),
        body: t("icons.replaceConfirm"),
        okLabel: t("actions.save"),
      }))
    )
      return;
    setBusyIcon(true);
    try {
      const row = await grabSiteFavicon({
        data: {
          token,
          url: href,
        },
      });
      if (!row?.dataUrl) throw new Error("errors.noFavicon");
      choose(row.dataUrl);
      toast.success(t("toast.faviconApplied"));
    } catch (err) {
      if (sessionGone(err)) return;
      toast.error(te(err));
    } finally {
      setBusyIcon(false);
    }
  }
  const searching = q.trim().length >= 2 && online && !pictosOnly;
  const gridItems: {
    key: string;
    title: string;
    value: string;
    src?: string;
    Icon?: LucideIcon;
    remote?: boolean;
    code?: string;
  }[] = (() => {
    const needle = q.trim().toLowerCase();
    const customs = library.map((p) => ({
      key: `c-${p.id}`,
      title: p.name || p.id,
      value: p.dataUrl,
      src: p.dataUrl,
      code: p.name || p.id,
    }));
    const prods = PRODUCT_ICONS.map((p) => ({
      key: `p-${p.slug}`,
      title: p.label,
      value: p.slug,
      src: p.src,
      code: p.slug,
    }));
    const syms = ICON_OPTIONS.map((o) => ({
      key: `s-${o.name}`,
      title: t(`iconLabel.${o.name}`),
      value: o.name,
      Icon: o.Icon,
      code: o.name,
    }));
    const base = pictosOnly
      ? syms
      : tab === "symbols"
        ? syms
        : tab === "icons"
          ? [...customs, ...prods]
          : [...customs, ...prods, ...syms];
    const remoteHits = searching
      ? remote.map((p) => ({
          key: `r-${p.id}`,
          title: p.id,
          value: p.src,
          src: p.src,
          remote: true,
          code: p.id,
        }))
      : [];
    return [...remoteHits, ...base].filter(
      (item) =>
        !needle ||
        item.title.toLowerCase().includes(needle) ||
        item.value.toLowerCase().includes(needle),
    );
  })();
  return (
    <>
      {" "}
      <button
        type="button"
        className={`brand-preview icon-trigger${header ? " is-header" : ""}`}
        title={t("icons.choose")}
        aria-label={t("icons.choose")}
        onClick={() => setOpen(true)}
      >
        {" "}
        <PortalIcon name={value} className={header ? "size-7" : "size-6"} />
      </button>
      {open ? (
        <ModalShell onClose={close} padded={false} label={t("icons.choose")}>
          <div className="icon-pick-frame">
          <div className="icon-pick-head">
            <h3 className="dialog-title">{t("item.icon")}</h3>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={close}
              aria-label={t("actions.close")}
              title={t("actions.close")}
            >
              <X className="size-4" />
            </Button>
          </div>
          <EdgeFade className="icon-pick-body">
            <div className="icon-pick-tool">
              <div className="am-search">
                <Search className="size-3.5" aria-hidden />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={
                    pictosOnly
                      ? t("icons.filterLib")
                      : !online
                        ? `${t("icons.filterLib")} (${t("icons.onlineOff")})`
                        : t("icons.filterOnline")
                  }
                  aria-label={t("icons.filterOnline")}
                  autoFocus
                />
              </div>
            </div>
            {!pictosOnly ? (
              <div className="icon-pick-tabsrow">
                <div className="am-filters" role="tablist" aria-label={t("item.icon")}>
                  {(
                    [
                      ["all", t("icons.tabAll")],
                      ["icons", t("icons.tabIcons")],
                      ["symbols", t("icons.tabSymbols")],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={tab === id}
                      className={tab === id ? "is-on" : ""}
                      onClick={() => setTab(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="icon-pick-actions">
                  {siteUrl != null ? (
                    <button
                      type="button"
                      className="am-create shrink-0"
                      disabled={busyIcon || !token}
                      title={t("icons.faviconHint")}
                      onClick={() => void grabFavicon()}
                    >
                      <Globe className="size-3.5" />
                      {busyIcon ? t("icons.fetching") : t("icons.siteFavicon")}
                    </button>
                  ) : null}
                  <label className="am-create shrink-0 cursor-pointer">
                    <Upload className="size-3.5" />
                    {t("icons.importPng")}
                    <input
                      type="file"
                      accept="image/png,image/svg+xml,image/webp,image/jpeg,image/gif,image/x-icon,.png,.svg,.webp,.jpg,.jpeg,.ico"
                      className="hidden"
                      disabled={busyIcon}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) void importFile(file);
                      }}
                    />
                  </label>
                </div>
              </div>
            ) : null}
            {gridItems.length ? (
            <div className="icon-pick-grid">
              {gridItems.map((item) =>
                  item.src ? (
                    <button
                      key={item.key}
                      type="button"
                      title={item.code || item.title}
                      onClick={() => {
                        if (item.remote && item.src) void pickRemote(item.src);
                        else choose(item.value);
                      }}
                      className={`flex size-11 items-center justify-center rounded-lg border ${
                        value === item.value
                          ? "border-transparent bg-elevated ring-1 ring-border"
                          : "border-transparent hover:bg-elevated"
                      }`}
                    >
                      <img src={item.src} alt="" className="size-6 object-contain" />
                    </button>
                  ) : (
                    <button
                      key={item.key}
                      type="button"
                      title={item.code || item.title}
                      onClick={() => choose(item.value)}
                      className={`flex size-11 items-center justify-center rounded-lg border ${
                        value === item.value
                          ? "border-transparent bg-elevated text-fg ring-1 ring-border"
                          : "border-transparent text-muted hover:bg-elevated hover:text-fg"
                      }`}
                    >
                      {item.Icon ? <item.Icon className="size-6" /> : null}
                    </button>
                  ),
              )}
            </div>
            ) : (
              <p className="am-note">{t("empty.noResults")}</p>
            )}
          </EdgeFade>
          </div>
        </ModalShell>
      ) : null}
    </>
  );
}
const FIELD_SM = "h-9 rounded-md bg-transparent";
function AclFields({
  restricted,
  setRestricted,
  seeHint,
}: {
  restricted: boolean;
  setRestricted: (v: boolean) => void;
  viewers: string[];
  setViewers: (v: string[]) => void;
  editors: string[];
  setEditors: (v: string[]) => void;
  people?: DirectoryEntry[];
  seeHint?: string;
  editHint?: string;
}) {
  return (
    <div className="settings-card">
      <p className="settings-kicker">{t("space.visibility")}</p>
      <div className="settings-toggles">
        <label>
          <input
            type="checkbox"
            checked={restricted}
            onChange={(e) => setRestricted(e.target.checked)}
          />
          {t("space.restrict")}
        </label>
        {seeHint ? <p className="settings-hint">{seeHint}</p> : null}
        <p className="settings-hint">{t("access.restrictedHint")}</p>
      </div>
    </div>
  );
}
function ItemForm({
  kind,
  initial,
  busy,
  picker,
  people,
  canAcl,
  onCancel,
  onSave,
}: {
  kind: "tab" | "category";
  initial?: MenuTab | PortalCategory | null;
  busy: boolean;
  picker: {
    token: string;
    library: CustomIcon[];
    online: boolean;
    navRichIcons: boolean;
    onLibrary: (icons: CustomIcon[]) => void;
  };
  people: DirectoryEntry[];
  canAcl: boolean;
  onCancel: () => void;
  onSave: (name: string, icon: string, access: AccessPayload) => void;
}) {
  const isTab = kind === "tab";
  const [name, setName] = useState(initial?.name ?? "");
  const [icon, setIcon] = useState(initial?.icon ?? (isTab ? "Layers" : "Folder"));
  const [restricted, setRestricted] = useState(Boolean(initial?.restricted));
  const [hideLabel, setHideLabel] = useState(Boolean(isTab && initial && "hideLabel" in initial ? (initial as MenuTab).hideLabel : false));
  const [viewers, setViewers] = useState(initial?.viewers ?? []);
  const [editors, setEditors] = useState(initial?.editors ?? []);
  return (
    <form
      className="settings-frame is-item"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(name.trim(), icon.trim() || (isTab ? "Layers" : "Folder"), {
          restricted,
          viewers,
          editors,
          ...(isTab ? { hideLabel } : {}),
        });
      }}
    >
      <div className="settings-body">
        <div className="settings-head">
          <div className="settings-head-copy">
            <h3 className="dialog-title">{initial ? (isTab ? t("aria.editSpace") : t("aria.editCategory")) : (isTab ? t("space.create") : t("category.create"))}</h3>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onCancel}
            aria-label={t("actions.close")}
            title={t("actions.close")}
          >
            <X className="size-4" />
          </Button>
        </div>
        <EdgeFade className="settings-pane">
          <div className="settings-stack">
            <div className="settings-card">
              <p className="settings-kicker">{t("item.general")}</p>
              <div className="id-head">
                <div className="id-col">
                  <Label>{t("item.icon")}</Label>
                  <IconPicker
                    value={icon}
                    onChange={setIcon}
                    {...picker}
                    pictosOnly={!picker.navRichIcons}
                    header
                  />
                </div>
                <div className="id-col">
                  <div className="id-field">
                    <Label>{t("item.name")}</Label>
                    <Input
                      className={FIELD_SM}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>
              {isTab ? (
                <div className="settings-toggles">
                  <p className="settings-kicker">{t("item.display")}</p>
                  <label>
                    <input
                      type="checkbox"
                      checked={hideLabel}
                      onChange={(e) => setHideLabel(e.target.checked)}
                    />
                    {t("space.hideLabel")}
                  </label>
                  <p className="settings-hint">{t("space.hideLabelHint")}</p>
                </div>
              ) : null}
            </div>
            {canAcl ? (
              <AclFields
                restricted={restricted}
                setRestricted={setRestricted}
                viewers={viewers}
                setViewers={setViewers}
                editors={editors}
                setEditors={setEditors}
                people={people}
                seeHint={isTab ? t("space.seeHint") : t("category.seeHint")}
                editHint={isTab ? t("space.editHint") : t("category.editHint")}
              />
            ) : null}
          </div>
        </EdgeFade>
        <FormActions busy={busy} hideCancel onCancel={onCancel} />
      </div>
    </form>
  );
}
function FavsForm({
  hideLabel: initialHide,
  busy,
  onCancel,
  onSave,
}: {
  hideLabel: boolean;
  busy: boolean;
  onCancel: () => void;
  onSave: (hideLabel: boolean) => void;
}) {
  const [hideLabel, setHideLabel] = useState(Boolean(initialHide));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(hideLabel);
      }}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <h3 className="dialog-title">{t("nav.favorites")}</h3>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onCancel}
          aria-label={t("actions.close")}
            title={t("actions.close")}
        >
          <X className="size-4" />
        </Button>
      </div>
      <div className="settings-toggles">
        <label>
          <input
            type="checkbox"
            checked={hideLabel}
            onChange={(e) => setHideLabel(e.target.checked)}
          />
          {t("space.hideLabel")}
        </label>
      </div>
      <FormActions busy={busy} hideCancel onCancel={onCancel} />
    </form>
  );
}
function itemKind(kind: string | undefined) {
  const k = kind === "note" || kind === "embed" ? kind : "app";
  return {
    option: t(`item.${k}.option`),
    create: t(`item.${k}.create`),
    edit: t(`item.${k}.edit`),
    remove: t(`item.${k}.remove`),
    urlLabel: t(`item.${k}.urlLabel`),
  };
}
function ExtraLinksField({
  links,
  setLinks,
  linkMenu,
  setLinkMenu,
}: {
  links: { key: string; title: string; url: string; openIn: "_blank" | "_self" }[];
  setLinks: React.Dispatch<React.SetStateAction<{ key: string; title: string; url: string; openIn: "_blank" | "_self" }[]>>;
  linkMenu?: boolean;
  setLinkMenu?: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ key: string; pointerId: number } | null>(null);
  const didDrag = useRef(false);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(() => {
    const first = links[0];
    return first && !first.url ? first.key : null;
  });
  const INPUT_SM = FIELD_SM;
  function patch(key: string, next: Partial<{ title: string; url: string; openIn: "_blank" | "_self" }>) {
    setLinks((cur) => cur.map((r) => (r.key === key ? { ...r, ...next } : r)));
  }
  function endDrag(el: HTMLElement | null, pointerId?: number) {
    dragRef.current = null;
    setDragKey(null);
    try {
      if (pointerId != null) el?.releasePointerCapture(pointerId);
    } catch {
      // ignore
    }
  }
  function onGripDown(e: ReactPointerEvent<HTMLElement>, key: string) {
    if (links.length < 2 || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      key,
      pointerId: e.pointerId,
    };
    didDrag.current = false;
    setDragKey(key);
  }
  function onGripMove(e: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const root = listRef.current;
    if (!root) return;
    const others = [...root.querySelectorAll<HTMLElement>("[data-row-id]")].filter((row) => {
      const id = row.getAttribute("data-row-id");
      return id && id !== drag.key;
    });
    let to = others.length;
    for (let i = 0; i < others.length; i++) {
      const box = others[i].getBoundingClientRect();
      if (e.clientY < box.top + box.height / 2) {
        to = i;
        break;
      }
    }
    setLinks((cur) => {
      const from = cur.findIndex((r) => r.key === drag.key);
      if (from < 0 || from === to) return cur;
      didDrag.current = true;
      const rest = cur.filter((r) => r.key !== drag.key);
      rest.splice(to, 0, cur[from]);
      return rest;
    });
  }
  function onGripUp(e: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    endDrag(e.currentTarget, e.pointerId);
  }
  function toggle(id: string) {
    if (didDrag.current) {
      didDrag.current = false;
      return;
    }
    setOpenId((cur) => (cur === id ? null : id));
  }
  function addLink() {
    if (links.length >= 4) return;
    const key = crypto.randomUUID();
    setLinks((cur) => [
      ...cur,
      {
        key,
        title: "",
        url: "",
        openIn: "_blank",
      },
    ]);
    setOpenId(key);
  }
  return (
    <div className="am-work">
      {links.length ? (
        <div ref={listRef} className="am-providers" role="list">
          {links.map((row) => (
            <ExpandRow
              key={row.key}
              id={row.key}
              className="is-provider is-link"
              expanded={openId === row.key}
              dragging={dragKey === row.key}
              grip
              onToggle={() => toggle(row.key)}
              onGripDown={(e) => onGripDown(e, row.key)}
              onGripMove={onGripMove}
              onGripUp={onGripUp}
              cells={[
                <span key="n" className="am-row-title">
                  {row.title.trim() || t("item.name")}
                  {row.url.trim() ? <span className="am-row-sub">{row.url.trim()}</span> : null}
                </span>,
              ]}
            >
              <div className="settings-stack">
                <Field label={t("item.name")}>
                  <Input
                    className={INPUT_SM}
                    value={row.title}
                    onChange={(e) => patch(row.key, { title: e.target.value })}
                    maxLength={40}
                    placeholder={t("item.name")}
                  />
                </Field>
                <Field label={t("item.url")}>
                  <Input
                    className={INPUT_SM}
                    value={row.url}
                    onChange={(e) => patch(row.key, { url: e.target.value })}
                    placeholder="https://"
                  />
                </Field>
                <div className="settings-toggles">
                  <label>
                    <input
                      type="checkbox"
                      checked={row.openIn === "_self"}
                      onChange={(e) => patch(row.key, { openIn: e.target.checked ? "_self" : "_blank" })}
                    />
                    {t("item.sameWindow")}
                  </label>
                  <p className="settings-hint">{t("item.sameWindowHint")}</p>
                </div>
                <div className="am-actions">
                  <button
                    type="button"
                    className="am-text-btn is-danger"
                    onClick={() => {
                      setLinks((cur) => cur.filter((r) => r.key !== row.key));
                      if (openId === row.key) setOpenId(null);
                    }}
                  >
                    {t("item.removeLink")}
                  </button>
                </div>
              </div>
            </ExpandRow>
          ))}
        </div>
      ) : null}
      {links.length < 5 ? (
        <button type="button" className="am-create shrink-0" onClick={addLink}>
          <Plus className="size-3.5" /> {t("actions.addLink")}
        </button>
      ) : null}
      {linkMenu !== undefined && setLinkMenu ? (
        <div className="settings-toggles mt-3">
          <label className={links.length > 1 ? "" : "is-disabled"}>
            <input
              type="checkbox"
              checked={Boolean(linkMenu) && links.length > 1}
              disabled={links.length < 2}
              onChange={(e) => setLinkMenu?.(e.target.checked)}
            />
            {t("item.linkMenu")}
          </label>
          <p className="settings-hint">{t("item.linkMenuHint")}</p>
        </div>
      ) : null}
    </div>
  );
}
function SizePreview({ colSpan, rowSpan }: { colSpan: number; rowSpan: number }) {
  const cols = Math.min(3, Math.max(1, Number(colSpan) || 1));
  const rows = Math.min(3, Math.max(1, Number(rowSpan) || 1));
  const slots = [];
  for (let r = 1; r <= 3; r++)
    for (let c = 1; c <= 3; c++)
      slots.push({
        r,
        c,
      });
  return (
    <div className="size-preview-wrap">
      {" "}
      <div className="size-preview" aria-hidden>
        {slots.map((s) => (
          <div
            key={`${s.r}-${s.c}`}
            className="size-preview-slot"
            style={{
              gridColumn: s.c,
              gridRow: s.r,
            }}
          />
        ))}{" "}
        <div
          className="size-preview-card"
          style={{
            gridColumn: `1 / span ${cols}`,
            gridRow: `1 / span ${rows}`,
          }}
        />
      </div>
    </div>
  );
}
function CardForm({
  categories,
  categoryId,
  catalog,
  initial,
  busy,
  picker,
  probes,
  knownTags,
  tagColors,
  onCancel,
  onSave,
}: {
  categories: PortalCategory[];
  categoryId: string;
  catalog: CatalogTab[];
  initial?: PortalApp | null;
  busy: boolean;
  picker: {
    token: string;
    library: CustomIcon[];
    online: boolean;
    navRichIcons: boolean;
    onLibrary: (icons: CustomIcon[]) => void;
  };
  probes?: boolean;
  knownTags?: { name: string; count: number }[];
  tagColors?: Record<string, string>;
  onCancel: () => void;
  onSave: (payload: CardFormPayload) => void;
}) {
  const [kind, setKind] = useState(initial?.kind ?? "app");
  const [catId, setCatId] = useState(initial?.categoryId ?? categoryId);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [icon, setIcon] = useState(initial?.icon ?? "Link");
  const [tags, setTags] = useState(initial?.tags ?? []);
  const [tagDraft, setTagDraft] = useState("");
  const [tagHi, setTagHi] = useState(0);
  const [draftColors, setDraftColors] = useState({});
  const [colSpan, setColSpan] = useState<1 | 2 | 3>(initial?.colSpan ?? 1);
  const [rowSpan, setRowSpan] = useState<1 | 2 | 3>(initial?.rowSpan ?? 1);
  const [check, setCheck] = useState<CheckMode>(initial?.check ?? "off");
  const [checkHost, setCheckHost] = useState(initial?.checkHost ?? "");
  const [links, setLinks] = useState<{ key: string; title: string; url: string; openIn: "_blank" | "_self" }[]>(() => {
    const rows = (Array.isArray(initial?.links) ? initial.links : [])
      .map((r) => ({
        key: crypto.randomUUID(),
        title: String(r.title || ""),
        url: String(r.url || ""),
        openIn: (r.openIn === "_self" ? "_self" : "_blank") as "_blank" | "_self",
      }))
      .slice(0, 5);
    const kind0 = initial?.kind || "app";
    const legacy = safeAppHref(initial?.url);
    if (kind0 === "app" && legacy && rows[0]?.url !== legacy)
      rows.unshift({ key: crypto.randomUUID(), title: "", url: legacy, openIn: "_blank" });
    if (!rows.length && kind0 === "app") {
      const key = crypto.randomUUID();
      rows.push({ key, title: "", url: "", openIn: "_blank" });
    }
    return rows;
  });
  const [linkMenu, setLinkMenu] = useState(Boolean(initial?.linkMenu));
  const [embedBorder, setEmbedBorder] = useState(Boolean(initial?.embedBorder));
  const [embedBg, setEmbedBg] = useState<string>(initial?.embedBg || "");
  const [probeBusy, setProbeBusy] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const catOptions = useMemo(() => categories, [categories]);
  const tagMatches = useMemo(() => {
    const s = fold(tagDraft.trim());
    if (!s) return [];
    return (knownTags ?? [])
      .filter(
        (t) =>
          fold(t.name).includes(s) &&
          !tags.some((x) => x.toLowerCase() === t.name.toLowerCase()),
      )
      .slice(0, 8);
  }, [tagDraft, knownTags, tags]);
  function addTag(raw: string) {
    const t = raw.trim().slice(0, 32);
    if (!t) return;
    setTags((cur) => {
      if (cur.length >= 3) return cur;
      if (cur.some((x) => x.toLowerCase() === t.toLowerCase())) return cur;
      setDraftColors((colors) => {
        const merged = {
          ...tagColors,
          ...colors,
        };
        if (lookupTagColor(t, merged)) return colors;
        if ((knownTags ?? []).some((k) => k.name.toLowerCase() === t.toLowerCase())) return colors;
        const used = new Set(Object.values(merged).map((h) => String(h).toLowerCase()));
        return {
          ...colors,
          [t]: randomTagHex(used),
        };
      });
      return [...cur, t];
    });
    setTagDraft("");
  }
  function removeTag(name: string) {
    setTags((cur) => cur.filter((x) => x.toLowerCase() !== name.toLowerCase()));
  }
  function resetFieldsForKind(next: ItemKind) {
    setKind(next);
    setTitle("");
    setDescription("");
    setUrl("");
    setTags([]);
    setTagDraft("");
    setDraftColors({});
    setLinks(next === "app" ? [{ key: crypto.randomUUID(), title: "", url: "", openIn: "_blank" }] : []);
    setLinkMenu(false);
    setEmbedBorder(false);
    setEmbedBg("");
    setCheck("off");
    setCheckHost("");
    setColSpan(1);
    setRowSpan(1);
    setIcon(next === "note" ? "FileText" : next === "embed" ? "AppWindow" : "Link");
  }
  async function changeKind(next: ItemKind) {
    if (next === kind) return;
    const hasContent = Boolean(
      title.trim() ||
      description.trim() ||
      url.trim() ||
      tags.length ||
      links.some((r) => r.title.trim() || r.url.trim()) ||
      check !== "off" ||
      colSpan !== 1 ||
      rowSpan !== 1,
    );
    if (
      hasContent &&
      !(await askConfirm({
        title: t("item.type"),
        body: t("confirm.changeKind"),
        okLabel: t("actions.continue"),
        danger: false,
      }))
    )
      return;
    if (next === "embed" && kind === "app") setUrl(links[0]?.url?.trim() || "");
    if (next === "app" && kind === "embed" && safeAppHref(url))
      setLinks([{ key: crypto.randomUUID(), title: "", url: safeAppHref(url) || "", openIn: "_blank" }]);
    resetFieldsForKind(next);
  }
  const kindMeta = itemKind(kind);
  const heading = initial ? kindMeta.edit : kindMeta.create;
  const kindSelect = (
    <select
      className="kind-select"
      value={kind}
      aria-label={t("item.type")}
      onChange={(e) => void changeKind(e.target.value as ItemKind)}
    >
      <option value="app">{itemKind("app").option}</option>
      <option value="note">{itemKind("note").option}</option>
      <option value="embed">{itemKind("embed").option}</option>
    </select>
  );
  const mainLink = kind === "app" ? links[0]?.url || "" : url;
  const canSave =
    kind === "app"
      ? Boolean(title.trim() && safeAppHref(mainLink))
      : kind === "note"
        ? Boolean(description.trim())
        : Boolean(safeAppHref(mainLink));
  const urlDupes = useMemo(
    () => (kind === "note" ? [] : findUrlDuplicates(catalog, mainLink, initial?.id)),
    [catalog, mainLink, kind, initial?.id],
  );
  const urlDupHint = urlDupes.length ? (
    <p className="settings-hint is-warn">
      {urlDupes.length === 1
        ? t("item.urlExists", {
            title: urlDupes[0].title,
            tab: urlDupes[0].tab,
          })
        : t("item.urlExistsN", {
            n: urlDupes.length,
            list: urlDupes
              .slice(0, 3)
              .map((d) => d.title)
              .join(", "),
          })}
    </p>
  ) : null;
  return (
    <form
      className="settings-frame is-item"
      onSubmit={(e) => {
        e.preventDefault();
        if (kind === "app" && !title.trim()) {
          toast.error(t("errors.nameRequired"));
          return;
        }
        if (kind === "app" && !safeAppHref(links[0]?.url || "")) {
          toast.error(t("errors.urlRequired"));
          return;
        }
        if (kind === "note" && !description.trim()) {
          toast.error(t("errors.contentRequired"));
          return;
        }
        if (kind === "embed" && !safeAppHref(url)) {
          toast.error(t("errors.embedUrlRequired"));
          return;
        }
        onSave({
          categoryId: catId,
          kind,
          title: title.trim(),
          description: kind === "embed" ? "" : description.trim(),
          url: url.trim(),
          icon:
            icon.trim() || (kind === "note" ? "FileText" : kind === "embed" ? "AppWindow" : "Link"),
          tags: kind === "app" ? tags.slice(0, 3) : [],
          colSpan,
          rowSpan,
          check: kind === "app" ? check : "off",
          checkHost: kind === "app" && check === "icmp" ? checkHost.trim() : "",
          links:
            kind === "app"
              ? links
                  .filter((r) => safeAppHref(r.url))
                  .slice(0, 5)
                  .map((r) => ({
                    title: r.title.trim().slice(0, 40),
                    url: safeAppHref(r.url) || r.url.trim().slice(0, 2e3),
                    openIn: r.openIn,
                  }))
              : [],
          linkMenu: kind === "app" ? linkMenu && links.length > 1 : undefined,
          embedBorder: kind === "embed" ? embedBorder : undefined,
          embedBg: kind === "embed" ? embedBg : undefined,
          tagColors: kind === "app" ? draftColors : undefined,
        });
      }}
    >
      <div className="settings-body">
        <div className="settings-head">
          <div className="settings-head-copy">
            <h3 className="dialog-title">{heading}</h3>
          </div>
          <div className="settings-head-actions">
            {kindSelect}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onCancel}
              aria-label={t("actions.close")}
              title={t("actions.close")}
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
        <EdgeFade className="settings-pane">
          <div className="settings-stack">
            <div className="settings-card">
              <p className="settings-kicker">{t("item.general")}</p>
              {kind === "app" ? (
                <div className="id-head">
                  <div className="id-col">
                    <Label>{t("item.icon")}</Label>
                    <IconPicker
                      value={icon}
                      onChange={setIcon}
                      siteUrl={links[0]?.url || ""}
                      {...picker}
                      header
                    />
                  </div>
                  <div className="id-col">
                    <div className="id-field">
                      <Label>{t("item.name")}</Label>
                      <Input
                        className={FIELD_SM}
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder={t("item.placeholderName")}
                        required
                      />
                    </div>
                    <div className="id-field">
                      <Label>{t("item.category")}</Label>
                      <Select
                        className={FIELD_SM}
                        value={catId}
                        onChange={(e) => setCatId(e.target.value)}
                      >
                        {catOptions.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>
                </div>
              ) : (
                <Field label={t("item.titleOptional")}>
                  <Input
                    className={FIELD_SM}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={t("item.placeholderTitle")}
                  />
                </Field>
              )}
              {kind === "app" ? (
                <Field label={t("item.description")}>
                  <Textarea
                    className="min-h-14 rounded-md bg-transparent"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={t("item.descriptionPlaceholder")}
                  />
                </Field>
              ) : null}
            </div>
            {kind === "note" || kind === "embed" ? (
              <div className="settings-card">
                <p className="settings-kicker">
                  {kind === "note"
                    ? t("item.content")
                    : kindMeta.urlLabel}
                </p>
              {kind === "note" ? (
                <Field>
                  <NoteEditor value={description} onChange={setDescription} />
                </Field>
              ) : kind === "embed" ? (
                <>
                  <Field>
                    <Input
                      className={FIELD_SM}
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://"
                      required
                    />
                    {urlDupHint}
                  </Field>
                  <div className="settings-toggles">
                    <label>
                      <input
                        type="checkbox"
                        checked={embedBorder}
                        onChange={(e) => setEmbedBorder(e.target.checked)}
                      />
                      {t("item.embedBorder")}
                    </label>
                    <p className="settings-hint">{t("item.embedBorderHint")}</p>
                  </div>
                </>
              ) : null}
            </div>
            ) : null}
            {kind === "app" ? (
              <div className="settings-card">
                <p className="settings-kicker">{t("item.link")}</p>
                <ExtraLinksField
                  links={links}
                  setLinks={setLinks}
                  linkMenu={linkMenu}
                  setLinkMenu={setLinkMenu}
                />
              </div>
            ) : null}
            {kind === "app" ? (
              <div className="settings-card">
                <p className="settings-kicker">{t("item.tags")}</p>
                <Field>
                  <div className="relative flex min-h-9 items-center gap-1 rounded-md border border-border bg-transparent px-3">
                    {tags.map((tag) => {
                      const paint = tagPaint(tag, {
                        ...tagColors,
                        ...draftColors,
                      });
                      return (
                        <button
                          key={tag}
                          type="button"
                          data-tone={paint.tone}
                          style={paint.style}
                          className="tag-chip shrink-0"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            removeTag(tag);
                          }}
                        >
                          {tag}
                          <X className="ml-0.5 size-2.5" />
                        </button>
                      );
                    })}
                    <input
                      ref={tagInputRef}
                      className="min-w-[4rem] flex-1 bg-transparent text-sm outline-none placeholder:text-subtle"
                      value={tagDraft}
                      placeholder={tags.length >= 3 ? t("item.maxTags") : t("item.addTag")}
                      disabled={tags.length >= 3}
                      onChange={(e) => {
                        setTagDraft(e.target.value);
                        setTagHi(0);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowDown" && tagMatches.length) {
                          e.preventDefault();
                          setTagHi((i) => (i + 1) % tagMatches.length);
                          return;
                        }
                        if (e.key === "ArrowUp" && tagMatches.length) {
                          e.preventDefault();
                          setTagHi((i) => (i - 1 + tagMatches.length) % tagMatches.length);
                          return;
                        }
                        if (e.key === "Enter" && tagMatches.length) {
                          e.preventDefault();
                          const m = tagMatches[tagHi % tagMatches.length];
                          addTag(m.name);
                          setTagHi(0);
                          return;
                        }
                        if (e.key === "Escape") {
                          e.preventDefault();
                          setTagDraft("");
                          setTagHi(0);
                          return;
                        }
                        if (e.key === "Backspace" && !tagDraft && tags.length) {
                          setTagHi(0);
                        }
                        if (e.key === "Enter" || e.key === ",") {
                          e.preventDefault();
                          addTag(tagDraft.replace(/,/g, ""));
                        }
                      }}
                      onBlur={() => addTag(tagDraft)}
                    />
                    {tagMatches.length > 0 ? createPortal(
                      <div
                        className="search-suggest"
                        role="listbox"
                        style={{
                          position: "fixed",
                          left: tagInputRef.current?.getBoundingClientRect().left ?? 0,
                          top: (tagInputRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
                          width: tagInputRef.current?.getBoundingClientRect().width ?? 200,
                          zIndex: 9999,
                        }}
                      >
                        {tagMatches.map((t, i) => {
                          const paint = tagPaint(t.name, tagColors);
                          const hi = tagMatches.length ? tagHi % tagMatches.length : 0;
                          return (
                            <button
                              key={t.name}
                              type="button"
                              role="option"
                              aria-selected={i === hi}
                              className={i === hi ? "is-hi" : ""}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                addTag(t.name);
                                setTagDraft("");
                                setTagHi(0);
                              }}
                            >
                              <span data-tone={paint.tone} style={paint.style} className="tag-chip">
                                {t.name}
                              </span>
                              <span className="text-xs text-muted">{t.count}</span>
                            </button>
                          );
                        })}
                      </div>,
                      document.body,
                    ) : null}
                  </div>
                  <p className="theme-css-meta">{`${tags.length}/3`}</p>
                </Field>
              </div>
            ) : null}
            {kind !== "app" ? (
              <div className="settings-card">
                <p className="settings-kicker">{t("item.size")}</p>
                <div className="flex items-start gap-4">
                  <div className="flex min-w-0 flex-col gap-1" style={{ flex: "0 0 33%" }}>
                    <Label>{t("item.preview")}</Label>
                    <SizePreview colSpan={colSpan} rowSpan={rowSpan} />
                    <p className="settings-hint text-center tabular-nums">{colSpan} × {rowSpan}</p>
                  </div>
                  <div className="flex min-w-0 flex-col gap-3" style={{ flex: "0 0 66%" }}>
                    <div className="id-field">
                      <Label>{t("item.width")}</Label>
                      <Select
                        className={FIELD_SM}
                        value={colSpan}
                        onChange={(e) => setColSpan(Number(e.target.value) as 1 | 2 | 3)}
                      >
                        <option value={1}>{t("item.col1")}</option>
                        <option value={2}>{t("item.col2")}</option>
                        <option value={3}>{t("item.colFull")}</option>
                      </Select>
                    </div>
                    <div className="id-field">
                      <Label>{t("item.height")}</Label>
                      <Select
                        className={FIELD_SM}
                        value={rowSpan}
                        onChange={(e) => setRowSpan(Number(e.target.value) as 1 | 2 | 3)}
                      >
                        <option value={1}>{t("item.row1")}</option>
                        <option value={2}>{t("item.row2")}</option>
                        <option value={3}>{t("item.row3")}</option>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
            {kind === "embed" ? (
              <div className="settings-card">
                <p className="settings-kicker">{t("item.link")}</p>
                <Field label={kindMeta.urlLabel}>
                  <Input
                    className={FIELD_SM}
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://"
                    required
                  />
                  {urlDupHint}
                </Field>
              </div>
            ) : null}
            {kind !== "note" ? (
              <div className="settings-card">
                <p className="settings-kicker">{t("probe.control")}</p>
              {probes === false ? (
                <p className="settings-hint">{t("item.probeDisabled")}</p>
              ) : null}
              <Field>
                <Select
                  className={FIELD_SM}
                  value={check}
                  disabled={probes === false}
                  onChange={(e) => setCheck(e.target.value as CheckMode)}
                >
                  <option value="off">{t("item.probeNone")}</option>
                  <option value="http">{t("item.probeHttp")}</option>
                  <option value="icmp">{t("item.probeIcmp")}</option>
                </Select>
                {check !== "off" && probes !== false ? (
                  <button
                    type="button"
                    className="settings-link self-start"
                    disabled={probeBusy || !picker.token}
                    onClick={async () => {
                      setProbeBusy(true);
                      try {
                        const row = await probePreview({
                          data: {
                            token: picker.token,
                            mode: check === "icmp" ? "icmp" : "http",
                            url: url.trim(),
                            host: checkHost.trim(),
                          },
                        });
                        if (!row) throw new Error("errors.noReply");
                        if (row.ok) toast.success(td(row.detail));
                        else toast.error(td(row.detail));
                      } catch (err) {
                        if (sessionGone(err)) return;
                        toast.error(te(err));
                      } finally {
                        setProbeBusy(false);
                      }
                    }}
                  >
                    {probeBusy ? t("probe.testing") : t("probe.testNow")}
                  </button>
                ) : null}
              </Field>
              {check === "icmp" && probes !== false ? (
                <Field label={t("probe.icmpHost")}>
                  <Input
                    className={FIELD_SM}
                    value={checkHost}
                    onChange={(e) => setCheckHost(e.target.value)}
                    placeholder="10.12.4.20 or host.example"
                    required
                  />
                </Field>
              ) : null}
            </div>
            ) : null}
          </div>
        </EdgeFade>
        <FormActions busy={busy} disabled={!canSave} hideCancel onCancel={onCancel} />
      </div>
    </form>
  );
}
function TagColorPick({
  hex,
  name,
  disabled,
  onChange,
}: {
  hex: string;
  name: string;
  disabled?: boolean;
  onChange: (hex: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({
    top: 0,
    left: 0,
  });
  const current = remapTagHex(hex);
  const ink = tagInk(current);
  function place() {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = 196;
    const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
    const top = r.bottom + 6 + 168 > window.innerHeight ? r.top - 174 : r.bottom + 6;
    setPos({
      top,
      left,
    });
  }
  useEffect(() => {
    if (!open) return;
    place();
    const onDoc = (e: PointerEvent) => {
      if (
        btnRef.current?.contains(e.target as Node) ||
        panelRef.current?.contains(e.target as Node)
      )
        return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <>
      {" "}
      <button
        type="button"
        ref={btnRef}
        className="tag-color-btn"
        disabled={disabled}
        style={
          {
            ["--tag-bg"]: current,
            ["--tag-fg"]: ink,
          } as CSSProperties
        }
        title={t("tags.colorOf", {
          name,
        })}
        aria-label={t("tags.colorOf", {
          name,
        })}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
      />
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panelRef}
              className="tag-palette"
              role="listbox"
              aria-label={t("tags.palette")}
              style={{
                top: pos.top,
                left: pos.left,
              }}
            >
              {TAG_PALETTE.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  role="option"
                  className={`tag-palette-dot${swatch === current ? " is-on" : ""}`}
                  style={
                    {
                      ["--tag-bg"]: swatch,
                      ["--tag-fg"]: tagInk(swatch),
                    } as CSSProperties
                  }
                  aria-selected={swatch === current}
                  aria-label={t("tags.pickColor")}
                  title={swatch}
                  onClick={() => {
                    onChange(swatch);
                    setOpen(false);
                  }}
                />
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
function TagManager({
  tags,
  colors,
  busy,
  settings,
  pruneOrphanTags,
  tagsAlpha,
  onSave,
  onApply,
}: {
  tags: { name: string; count: number }[];
  colors: Record<string, string>;
  busy: boolean;
  embedded?: boolean;
  settings: PortalSettings;
  pruneOrphanTags: boolean;
  tagsAlpha: boolean;
  onCancel: () => void;
  onSave: (payload: SettingsPayload) => void;
  onApply: (payload: TagsPayload) => void;
}) {
  const [prune, setPrune] = useState(Boolean(pruneOrphanTags));
  const [alpha, setAlpha] = useState(tagsAlpha !== false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [createDraft, setCreateDraft] = useState("");
  const col = useColSort();
  const sortedTags = col.apply(tags, (row, key) => {
    if (key === "name") return row.name || "";
    if (key === "count") return row.count || 0;
    return "";
  });
  const [localColors, setLocalColors] = useState(colors ?? {});
  useEffect(() => {
    setPrune(Boolean(pruneOrphanTags));
  }, [pruneOrphanTags]);
  useEffect(() => {
    setAlpha(tagsAlpha !== false);
  }, [tagsAlpha]);
  useEffect(() => {
    setLocalColors(colors ?? {});
  }, [colors]);
  function createTag() {
    const name = createDraft.trim().slice(0, 32);
    if (!name || busy) return;
    if (tags.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      toast.error(t("tags.exists"));
      return;
    }
    if (tags.length >= 80) {
      toast.error(t("tags.tooMany"));
      return;
    }
    setCreateDraft("");
    onApply({
      create: [name],
    });
  }
  function renameTag(from: string, to: string) {
    const next = String(to || "")
      .trim()
      .slice(0, 32);
    if (!next || next === from || busy) return;
    onApply({
      rename: [
        {
          from,
          to: next,
        },
      ],
    });
  }
  async function removeTag(name: string) {
    if (
      !(await askConfirm({
        title: t("actions.delete"),
        body: t("confirm.deleteTag", { name }),
      }))
    )
      return;
    onApply({
      remove: [name],
    });
  }
  function changeColor(name: string, hex: string) {
    const next = remapTagHex((expandHex(hex) ?? String(hex || "")).toLowerCase());
    if (!/^#[0-9a-f]{6}$/.test(next)) return;
    setLocalColors((cur) => ({
      ...cur,
      [name]: next,
    }));
    onApply({
      colors: {
        [name]: next,
      },
    });
  }
  return (
    <form
      id="settings-form"
      className="settings-stack"
      onSubmit={(e) => {
        e.preventDefault();
        onSave?.({
          ...settingsBase(settings || {}),
          pruneOrphanTags: prune,
          tagsAlpha: alpha,
        });
        toast.success(t("toast.saved"));
      }}
    >
      <div className="settings-card">
        <p className="settings-kicker">{t("tags.memory")}</p>
        <div className="settings-toggles">
          <label>
            <input type="checkbox" checked={prune} onChange={(e) => setPrune(e.target.checked)} />
            {t("tags.prune")}
          </label>
          <p className="settings-hint">{t("tags.pruneHint")}</p>
          <label>
            <input type="checkbox" checked={alpha} onChange={(e) => setAlpha(e.target.checked)} />
            {t("tags.alpha")}
          </label>
          <p className="settings-hint">{t("tags.alphaHint")}</p>
        </div>
      </div>
      <div className="settings-card tag-list-card">
        <p className="settings-kicker">
          {tags.length ? tp("tags.count", tags.length) : t("item.tags")}
        </p>
        <Input
          className={FIELD_SM}
          value={createDraft}
          placeholder={t("tags.newPlaceholder")}
          maxLength={32}
          disabled={busy || tags.length >= 80}
          onChange={(e) => setCreateDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              createTag();
            }
          }}
        />
        {tags.length === 0 ? (
          <p className="settings-hint">{t("tags.empty")}</p>
        ) : (
          <div className="am-work">
            <div className="am-list-head is-tags">
              <div className="am-row-cells">
                <SortLabel id="name" sort={col.sort} onToggle={col.toggle}>
                  {t("item.name")}
                </SortLabel>
                <SortLabel id="count" sort={col.sort} onToggle={col.toggle} className="am-row-end">
                  {t("tags.countCol")}
                </SortLabel>
                <span className="am-row-action" />
              </div>
            </div>
            <EdgeFade className="am-list-wrap">
              <div className="am-list is-tags" role="list">
                {sortedTags.map((row) => {
                  const draft = drafts[row.name] ?? row.name;
                  const hex = lookupTagColor(row.name, localColors) ?? defaultTagHex(row.name);
                  return (
                    <div key={row.name} className="am-row is-static" role="listitem">
                      <div className="am-row-head">
                        <div className="am-row-cells">
                          <span className="am-row-title tag-name-cell">
                            <TagColorPick
                              hex={hex}
                              name={row.name}
                              disabled={busy}
                              onChange={(next) => changeColor(row.name, next)}
                            />
                            <input
                              className="tag-item-name h-7 w-full min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 text-[0.8125rem] font-medium outline-none hover:border-border hover:bg-elevated focus:border-border focus:bg-elevated"
                              value={draft}
                              aria-label={t("tags.nameOf", {
                                name: row.name,
                              })}
                              onChange={(e) =>
                                setDrafts((d) => ({
                                  ...d,
                                  [row.name]: e.target.value,
                                }))
                              }
                              onBlur={() => renameTag(row.name, draft)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  e.currentTarget.blur();
                                }
                              }}
                            />
                          </span>
                          <span className="am-row-end">{row.count}</span>
                          <span className="am-row-action">
                            <button
                              type="button"
                              className="card-tool is-danger"
                              disabled={busy}
                              aria-label={t("tags.deleteAria", {
                                name: row.name,
                              })}
                              title={t("tags.deleteAria", {
                                name: row.name,
                              })}
                              onClick={() => removeTag(row.name)}
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                 })}
               </div>
             </EdgeFade>
           </div>
         )}
       </div>
     </form>
   );
 }
function FormActions({
  busy,
  onCancel,
  label = t("actions.save"),
  form,
  disabled,
  hideCancel,
}: {
  busy: boolean;
  onCancel?: () => void;
  label?: string;
  form?: string;
  disabled?: boolean;
  hideCancel?: boolean;
}) {
  return (
    <div className={`settings-actions${hideCancel ? " is-save-only" : ""}`}>
      {hideCancel ? null : (
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t("actions.cancel")}
        </Button>
      )}
      <Button
        type="submit"
        form={form}
        size={hideCancel ? "sm" : "default"}
        disabled={busy || disabled}
      >
        {label}
      </Button>
    </div>
  );
}
