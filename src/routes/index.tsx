import { createFileRoute } from "@tanstack/react-router";
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowDownAZ,
  ArrowUpZA,
  ArrowRightLeft,
  Bug,
  Check,
  Copy,
  ChevronDown,
  GripVertical,
  LayoutGrid,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog, askConfirm } from "@/components/confirm-dialog";
import { ModalShell } from "@/components/modal-shell";
import { AccountMenu } from "@/components/account-menu";
import { AppCard } from "@/components/app-card";
import { HistoryPanel } from "@/components/history-panel";
import { CurationPanel } from "@/components/curation-panel";
import { LegendPanel, StatsBar, StatsPanel } from "@/components/stats";
import { AdminPanel } from "@/components/settings-panel";
import { LockForm } from "@/components/auth-panel";
import { AccessFrame } from "@/components/access-frame";
import { ItemForm, CardForm, FavsForm } from "@/components/editors";
import { itemKind } from "@/lib/item-kind";
import { collectTags, fold, tagPaint } from "@/lib/tag-ui";
import {
  applyLiveBox,
  cardResizeEdge,
  finePointer,
  gridColCount,
  itemColWidths,
  itemTrackHeights,
  liveResizeBox,
  nearestSpan,
  resizeCursor,
  setResizeUi,
  spanSize,
} from "@/lib/card-resize";
import { sessionGone } from "@/lib/session-gone";
import { PORTAL_VERSION } from "@/lib/portal-version";
import type { MenuTab, PortalData } from "@/lib/portal-ui";
import { MovePickDialog, MoveSectionDialog } from "@/components/access";
import { PortalIcon, DockitMark } from "@/lib/icons";
import { ThemeCss, ThemeToggle } from "@/components/theme";
import {
  createApp,
  createCategory,
  createTab,
  deleteApp,
  deleteCategory,
  deleteTab,
  duplicateTab,
  getPortal,
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
  resetProbes,
  resetPortal,
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
} from "@/lib/portal";
import { probeTargets } from "@/lib/probe";
import type { ProbeResult } from "@/lib/probe";
import { DEFAULT_UI_PREFS, clearUiPrefs, readUiPrefs, writeUiPrefs } from "@/lib/ui-prefs";
import { t, te, tp, asLocale, applyDisplayPrefs } from "@/lib/i18n";
import { tagTone } from "@/lib/tag-colors";
import type {
  ClickStats,
  CustomIcon,
  PortalApp,
  PortalCategory,
  PortalSettings,
  SessionInfo,
} from "@/lib/portal";
import type { Category, CategoryMoveImpact } from "@/lib/acl";

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
const TOKEN_KEY = "portal-edit-token";
const SESSION_KEY = "portal-session";
const EDIT_MODE_KEY = "portal-edit-mode";
const OIDC_NEXT_KEY = "portal-oidc-next";
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
const ITEM_GRID = "item-grid";
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
function sessionCanEditTab(session: SessionInfo | null | undefined, tabId: string | undefined): boolean {
  if (!session || !tabId) return false;
  if (session.isOwner) return true;
  return session.tabPerms?.[tabId] === "edit";
}
function sessionCanMoveTab(session: SessionInfo | null | undefined, tabId: string | undefined): boolean {
  if (!session || !tabId) return false;
  if (session.isOwner) return true;
  return Boolean(session.tabMoves?.[tabId]);
}
function sessionCanArrange(session: SessionInfo | null | undefined): boolean {
  if (!session) return false;
  return Boolean(session.isOwner || session.canEdit || session.canMove);
}
function sessionCanManageAcl(session: SessionInfo | null | undefined): boolean {
  if (!session) return false;
  return Boolean(session.isOwner || session.canManageUsers || session.canManageRoles);
}
function sessionCanCreateSpaces(session: SessionInfo | null | undefined): boolean {
  if (!session) return false;
  return Boolean(session.isOwner || session.canCreateTabs);
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
    return sessionCanEditTab(sessionRef.current, tabId);
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
    if (sess && !sessionCanArrange(sess)) {
      toast.error(t("toast.readonly"));
      return;
    }
    if (sessionCanArrange(sess) || tokenRef.current || readToken()) {
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
    if (!sessionCanEditTab(sess, cur.activeTabId)) {
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
  const canEditActive = sessionCanEditTab(session, data.activeTabId);
  const canEditTab = (tabId: string) => sessionCanEditTab(session, tabId);
  const canMoveActive = sessionCanMoveTab(session, data.activeTabId);
  const canReorderTabs = Boolean(
    editMode && !searching && (sessionCanCreateSpaces(session) || session?.canMove),
  );
  const canDrag = editMode && !searching && page !== "favs" && canMoveActive;
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
      if (!filterTags.some((row) => row.name.toLowerCase() === key)) return cur;
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
  const filterTags = useMemo(() => {
    const downSet = downFilter ? new Set(downIds) : null;
    return collectTags(data.catalog, null, data.settings.tagsAlpha !== false, (app) =>
      itemMatches(app, "", tagFilter, downSet),
    );
  }, [data.catalog, data.settings.tagsAlpha, tagFilter, downFilter, downIds]);
  const tagMatches = useMemo(() => {
    const s = fold(query.trim());
    if (!s) return [];
    return filterTags
      .filter(
        (t) =>
          fold(t.name).includes(s) &&
          !tagFilter.some((x) => x.toLowerCase() === t.name.toLowerCase()),
      )
      .slice(0, 8);
  }, [query, filterTags, tagFilter]);
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
                {data.settings.subtitle || t("settings.defaultTagline")}
              </p>
            </div>
          </div>{" "}
          <div className="search-box relative flex min-h-10 min-w-0 flex-1 items-center gap-1 rounded-lg border border-border bg-surface pl-9">
            {" "}
            <Search className="pointer-events-none absolute left-3 size-4 text-muted" />
            {(tagFilter.length || downFilter) ? (
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
          <div className="flex shrink-0 items-center gap-1.5">
            {" "}
            <ThemeToggle />
            <AccountMenu
              loggedIn={Boolean(token || session)}
              editMode={editMode}
              canEdit={Boolean(session?.canEdit || session?.canMove)}
              canOpenSettings={Boolean(session?.canManageSettings)}
              role={session?.role || ""}
              username={session?.username || ""}
              isOwner={session?.isOwner}
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
                  canEditTab(tab.id) && (
                    <span
                      className="ml-1 flex items-center gap-[0.35rem]"
                      data-tab-action=""
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      {" "}
                      {sessionCanCreateSpaces(session) ? (
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
            {editMode && sessionCanCreateSpaces(session) && (
              <button
                type="button"
                data-tab-slot="plus"
                className="card-tool self-center"
                aria-label={t("actions.addSpace")}
                title={t("actions.addSpace")}
                onClick={() =>
                  setModal({
                    kind: "tab",
                  })
                }
              >
                <Plus className="size-3.5" />
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
                          ctxHideUrl={Boolean(data.settings.ctxHideUrl)}
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
                          ctxHideUrl={Boolean(data.settings.ctxHideUrl)}
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
                        size="icon"
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
                          ctxHideUrl={Boolean(data.settings.ctxHideUrl)}
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
        onDown={() => setDownFilter((v) => !v)}
        onStats={
          data.settings.infoBar !== false && data.settings.infoStats !== false
            ? () =>
                setModal({
                  kind: "stats",
                })
            : void 0
        }
        onLegend={
          data.settings.infoBar !== false && data.settings.infoLegend
            ? () =>
                setModal({
                  kind: "legend",
                })
            : void 0
        }
      />
      {modal.kind !== "none" && (
        <ModalShell
          wide={
            modal.kind === "admin" ||
            modal.kind === "stats" ||
            modal.kind === "legend" ||
            modal.kind === "app" ||
            modal.kind === "history" ||
            modal.kind === "curation" ||
            modal.kind === "users" ||
            modal.kind === "tab" ||
            modal.kind === "category"
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
              oidcLabel={data.settings.oidcLabel || t("oidc.defaultLabel")}
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
                  else if (modal.next === "edit" && sessionCanArrange(res.session)) {
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
          {modal.kind === "legend" && (
            <LegendPanel
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
              onResetProbes={async () => {
                setBusy(true);
                try {
                  const next = await resetProbes({
                    data: {
                      token,
                      tabId: data.activeTabId,
                    },
                  });
                  setData(next);
                  toast.success(t("toast.probeReset"));
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
              canAcl={sessionCanManageAcl(session)}
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
              canAcl={sessionCanManageAcl(session)}
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
