import { createFileRoute } from "@tanstack/react-router";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Bug,
  Check,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";

import { askConfirm } from "@/components/confirm-dialog";
import { AccountMenu } from "@/components/account-menu";
import { CatalogView, type CategoryHandlers } from "@/components/portal-catalog";
import { PortalOverlays, type PortalModal } from "@/components/portal-overlays";
import { SpaceStrip, pickVisibleSpaceIds, type SpaceStripHandlers } from "@/components/space-strip";
import { StatsBar } from "@/components/stats";
import { itemKind } from "@/lib/item-kind";
import { placeCard, placeCarriedCard, placeCarriedCategory, placeCategory, placeSpaces } from "@/lib/layout-place";
import {
  allowsFavorite,
  catIsFolded,
  editArmed,
  itemMatches,
  lockSelection,
  writeEditMode,
} from "@/lib/portal-dnd";
import { usePortalDrag } from "@/lib/use-portal-drag";
import { collectTags, fold, tagPaint } from "@/lib/tag-ui";
import { cardResizeEdge, finePointer } from "@/lib/card-resize";
import { sessionGone } from "@/lib/session-gone";
import { PORTAL_VERSION } from "@/lib/portal-version";
import type { MenuSpace, PortalData } from "@/lib/portal-ui";
import { DockitMark } from "@/lib/icons";
import { ThemeCss, ThemeToggle } from "@/components/theme";
import {
  createCard,
  createCategory,
  duplicateSpace,
  getPortal,
  rememberSpace,
  proxyLogin,
  recordClick,
  arrangeCategory,
  cardsAlphaDir,
} from "@/lib/portal";
import { probeTargets } from "@/lib/probe";
import type { ProbeResult } from "@/lib/probe";
import { DEFAULT_UI_PREFS, clearUiPrefs, readUiPrefs, writeUiPrefs } from "@/lib/ui-prefs";
import { t, te, asLocale, applyDisplayPrefs, modKeyLabel } from "@/lib/i18n";
import type {
  ClickStats,
  CustomIcon,
  PortalCard,
  PortalCategory,
  SessionInfo,
} from "@/lib/portal";

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
function sessionCanEditSpace(session: SessionInfo | null | undefined, spaceId: string | undefined): boolean {
  if (!session || !spaceId) return false;
  if (session.isOwner) return true;
  return session.spacePerms?.[spaceId] === "edit";
}
function sessionCanMoveSpace(session: SessionInfo | null | undefined, spaceId: string | undefined): boolean {
  if (!session || !spaceId) return false;
  if (session.isOwner) return true;
  return Boolean(session.spaceMoves?.[spaceId]);
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
  return Boolean(session.isOwner || session.canCreateSpaces);
}

function Home() {
  const initial: PortalData = Route.useLoaderData();
  const [data, setData] = useState<PortalData>(initial);
  applyDisplayPrefs(data.settings);
  const [editMode, setEditMode] = useState(false);
  const [token, setToken] = useState("");
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [hideDevBanner, setHideDevBanner] = useState(false);
  const [hideNoPassBanner, setHideNoPassBanner] = useState(false);
  const [modal, setModal] = useState<PortalModal>({
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
  const [page, setPage] = useState("space");
  const [health, setHealth] = useState<Record<string, ProbeResult>>({});
  const healthBusy = useRef(false);
  const [spaceOverflow, setSpaceOverflow] = useState<string[]>([]);
  const [moreOpen, setMoreOpen] = useState(false);
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
  const spaceListRef = useRef<HTMLDivElement>(null);
  const spaceStripRef = useRef<HTMLDivElement>(null);
  const spaceMoreRef = useRef<HTMLDivElement>(null);
  const morePanelRef = useRef<HTMLDivElement>(null);
  const spaceWidthRef = useRef(new Map<string, number>());
  const moreOpenRef = useRef(false);
  const activeSpaceRef = useRef(data.activeSpaceId);
  dataRef.current = data;
  modalRef.current = modal;
  editModeRef.current = editMode;
  sessionRef.current = session;
  queryRef.current = query;
  pageRef.current = page;
  tokenRef.current = token;
  activeSpaceRef.current = data.activeSpaceId;
  const dnd = usePortalDrag({
    dataRef,
    setData,
    tokenRef,
    sessionRef,
    spaceListRef,
    spaceMoreRef,
    morePanelRef,
    moreOpenRef,
    spaceOverflow,
    setMoreOpen,
    goSpace,
    stayEditing,
    setBusy,
    setModal,
    activeSpaceRef,
  });
  const {
    drag,
    over,
    dragFold,
    liveId,
    setDrag,
    setOver,
    spaceOverMore,
    setSpaceOverMore,
    didDragRef,
    dragOriginRef,
    carryRef,
    dragRef,
    bindSpaceDrag,
    bindCatDrag,
    bindCardDrag,
    bindAppResize,
    openMoveCat,
    spaceInsertRef,
    spaceOverMoreRef,
    carryDestSpaceId,
  } = dnd;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- boot-only session restore
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
        data: { token: res.token, spaceId: data.activeSpaceId },
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
    if (!sessionCanEditSpace(sess, cur.activeSpaceId)) {
      toast.error(t("toast.noEditSpace"));
      return;
    }
    if (!editModeRef.current) enterEdit();
    const cat = cur.categories?.[0];
    if (!cat) {
      toast.error(t("toast.needCategory"));
      return;
    }
    setModal({
      kind: "card",
      categoryId: cat.id,
    });
  }
  hotkeysRef.current = {
    requestEdit,
    openNewCard,
    focusSearch,
  };
  function duplicateApp(app: PortalCard, categoryId: string) {
    apply(async () => {
      const next = await createCard({
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
  function duplicateCategory(cat: PortalCategory, spaceId: string) {
    apply(async () => {
      const next = await createCategory({
        data: {
          token,
          spaceId,
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
    if (!cat?.cards?.length) return;
    const nextDir = cardsAlphaDir(cat.cards, data.settings.locale) === "az" ? "za" : "alpha";
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
  async function resetCategoryCards(cat: PortalCategory) {
    if (!cat?.cards?.length) return;
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
  function cloneSpace(space: MenuSpace) {
    apply(async () => {
      const next = await duplicateSpace({
        data: {
          token,
          id: space.id,
        },
      });
      toast.success(t("toast.spaceDuplicated"));
      return next;
    });
  }
  function bumpClick(app: PortalCard) {
    if ((app.kind || "app") !== "app") return;
    setData((cur) => {
      const bump = (item: PortalCard) =>
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
          cards: c.cards.map(bump),
        })),
        catalog: (cur.catalog ?? []).map((t) => ({
          ...t,
          categories: t.categories.map((c) => ({
            ...c,
            cards: c.cards.map(bump),
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
  async function recheckApp(app: PortalCard) {
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
  async function switchSpace(spaceId: string) {
    if (spaceId === dataRef.current.activeSpaceId) return;
    const current = dataRef.current;
    const entry = (current.catalog ?? []).find((t) => t.id === spaceId);
    activeSpaceRef.current = spaceId;
    if (entry) {
      setData({
        ...current,
        activeSpaceId: spaceId,
        categories: entry.categories,
      });
      rememberSpace({
        data: {
          spaceId,
          token: token || void 0,
        },
      }).catch(() => void 0);
      return;
    }
    try {
      const next = await getPortal({
        data: {
          spaceId,
          token: token || void 0,
        },
      });
      if (activeSpaceRef.current === spaceId) setData(next);
    } catch (err) {
      if (sessionGone(err)) return;
      toast.error(te(err));
    }
  }
  function goSpace(spaceId: string) {
    setPage("space");
    if (spaceId !== dataRef.current.activeSpaceId) switchSpace(spaceId);
  }
  function spaceHasCards(spaceId: string) {
    const row = (data.catalog ?? []).find((t) => t.id === spaceId);
    const cats = row?.categories || (spaceId === data.activeSpaceId ? data.categories : []);
    return (cats || []).some((c) => (c.cards || []).length);
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
    setPage("space");
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
    return catIsFolded(catId, {
      searching,
      dragKind: drag?.kind,
      fold: dragFold,
      foldOn: data.settings.cardDragCollapse !== false,
      collapsed: collapsedSet,
    });
  }
  const onFavs = page === "favs" && !searching;
  const canEditActive = sessionCanEditSpace(session, data.activeSpaceId);
  const canEditSpace = (spaceId: string) => sessionCanEditSpace(session, spaceId);
  const canMoveActive = sessionCanMoveSpace(session, data.activeSpaceId);
  const canReorderSpaces = Boolean(
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
      .map((space) => {
        const spaceHit = Boolean(s) && space.name.toLowerCase().includes(s);
        const categories = space.categories
          .map((c) => {
            const catHit = spaceHit || (Boolean(s) && c.name.toLowerCase().includes(s));
            return {
              ...c,
              cards:
                catHit && tags.length === 0 && !downSet
                  ? c.cards
                  : c.cards.filter((a) => itemMatches(a, s, tags, downSet)),
            };
          })
          .filter((c) => c.cards.length > 0);
        return {
          ...space,
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
    for (const space of data.catalog ?? [])
      for (const cat of space.categories) {
        const apps = cat.cards
          .filter((a) => favSet.has(a.id) && allowsFavorite(a, data.settings))
          .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
        if (apps.length)
          groups.push({
            space,
            cat,
            cards: apps,
          });
      }
    return groups;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- settings-only fields used; catalog/favSet/ui.favIds cover the rest
  }, [data.catalog, favSet, ui.favIds]);
  const favCount = favGroups.reduce((n, g) => n + g.cards.length, 0);
  const probeList = useMemo(() => {
    if (data.settings.healthChecks === false) return [];
    const out = [];
    for (const space of data.catalog ?? [])
      for (const cat of space.categories)
        for (const app of cat.cards) {
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
    if (searching) return searchHits.flatMap((space) => space.categories);
    return data.categories;
  }, [searching, searchHits, data.categories]);
  const displaySpaces = useMemo(() => {
    let spaces = data.spaces;
    if (
      canReorderSpaces &&
      drag &&
      over &&
      drag.kind === "space" &&
      over.kind === "space" &&
      !spaceOverMore
    )
      spaces = placeSpaces(data.spaces, drag.id, over.insertAt) ?? data.spaces;
    if (editMode || searching) return spaces;
    return spaces.filter((s) => spaceHasCards(s.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- helper reads refs; list identity deps cover the recompute
  }, [
    data.spaces,
    data.catalog,
    data.categories,
    data.activeSpaceId,
    canReorderSpaces,
    drag,
    over,
    editMode,
    searching,
    spaceOverMore,
  ]);
  const moreMenuSpaces = displaySpaces.filter(
    (space) => spaceOverflow.includes(space.id) && !(drag?.kind === "space" && drag.id === space.id),
  );
  const moreGapAt =
    drag?.kind === "space" && spaceOverMore && over?.kind === "space"
      ? data.spaces
          .map((t) => t.id)
          .filter((id) => id !== drag.id)
          .slice(0, over.insertAt)
          .filter((id) => spaceOverflow.includes(id)).length
      : -1;
  useEffect(() => {
    if (editMode || searching || page !== "space") return;
    if (spaceHasCards(data.activeSpaceId)) return;
    const next = (data.spaces || []).find((t) => t.id !== data.activeSpaceId && spaceHasCards(t.id));
    if (next) goSpace(next.id);
    else setPage("favs");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- redirect-on-empty guard; helpers read refs, run on data change only
  }, [editMode, searching, page, data.activeSpaceId, data.catalog, data.spaces]);
  moreOpenRef.current = moreOpen;
  spaceOverMoreRef.current = spaceOverMore;
  useLayoutEffect(() => {
    const row = spaceListRef.current;
    const strip = spaceStripRef.current;
    if (!row || !strip) return;
    const compute = () => {
      if (dragRef.current?.kind === "space") return;
      const gap = Number.parseFloat(getComputedStyle(strip).gap) || 0;
      const avail = strip.clientWidth;
      if (!avail) return;
      const fav = strip.querySelector<HTMLElement>("[data-space-slot=fav]");
      const favW = fav?.offsetWidth || 0;
      const plus = strip.querySelector<HTMLElement>("[data-space-slot=plus]");
      const plusW = plus?.offsetWidth || 0;
      const moreEl = strip.querySelector<HTMLElement>("[data-space-slot=more]");
      const moreW = moreEl?.offsetWidth || 0;
      for (const el of strip.querySelectorAll<HTMLElement>(".space-item[data-space-id]")) {
        if (el.classList.contains("is-overflow")) continue;
        const id = el.dataset.spaceId;
        if (id && el.offsetWidth) spaceWidthRef.current.set(id, el.offsetWidth);
      }
      const activeId = page === "favs" ? null : data.activeSpaceId;
      const hid = pickVisibleSpaceIds(
        displaySpaces,
        spaceWidthRef.current,
        activeId,
        avail,
        favW,
        plusW,
        moreW,
        gap,
      );
      setSpaceOverflow((cur) =>
        cur.length === hid.length && cur.every((id, i) => id === hid[i]) ? cur : hid,
      );
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(row);
    ro.observe(strip);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- strip measure; dragRef is a ref
  }, [displaySpaces, editMode, data.activeSpaceId, page, canReorderSpaces, searching, drag?.kind]);
  useEffect(() => {
    if (!spaceOverflow.length && moreOpen) setMoreOpen(false);
  }, [spaceOverflow, moreOpen]);
  useLayoutEffect(() => {
    if (!moreOpen) return;
    const btn = spaceMoreRef.current?.querySelector(".space-more");
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
      if (dragRef.current?.kind === "space") return;
      if (
        spaceMoreRef.current?.contains(e.target as Node) ||
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- close-on-outside; dragRef is a ref
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
    if (drag.kind === "card") {
      const carry = carryRef.current;
      const inView = base.some((c) => c.cards.some((a) => a.id === drag.id));
      if (carry && !inView) {
        const catId = over.kind === "card" && over.catId ? over.catId : base[0]?.id;
        const insertAt = over.kind === "card" ? over.insertAt : base[0]?.cards.length || 0;
        if (!catId) return base;
        return placeCarriedCard(base, carry.app, catId, insertAt) ?? base;
      }
      if (over.kind === "card") return placeCard(base, drag.id, over.catId, over.insertAt) ?? base;
    }
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- live drag preview; carryRef is a ref
  }, [filtered, canDrag, drag, over]);
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

  const catalogChrome = {
    settings: data.settings,
    probes: health,
    tagFilter,
    favSet,
  };
  const catalogHandlers: CategoryHandlers = {
    goSpace,
    toggleCollapsed,
    openCard: (cat, app) =>
      setModal(app ? { kind: "card", categoryId: cat.id, app } : { kind: "card", categoryId: cat.id }),
    moveCat: (cat, fromSpaceId) =>
      setModal({
        kind: "move-pick",
        category: cat,
        fromSpaceId,
      }),
    sortCat: sortCategoryCards,
    resetCat: (cat) => {
      void resetCategoryCards(cat);
    },
    duplicateCat: duplicateCategory,
    editCat: (cat) =>
      setModal({
        kind: "category",
        category: cat,
      }),
    deleteCat: (cat) =>
      setModal({
        kind: "confirm-cat",
        category: cat,
      }),
    duplicateCard: duplicateApp,
    deleteCard: (app) =>
      setModal({
        kind: "confirm-app",
        app,
      }),
    toggleTag,
    toggleFav,
    recheck: (app) => {
      void recheckApp(app);
    },
    openLink: bumpClick,
    didDrag: () => didDragRef.current,
    onCatPointerDown: (e, cat, catIndex) => {
      if (!canDrag) return;
      if ((e.target as HTMLElement).closest("button")) return;
      lockSelection();
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
        fromSpaceId: dataRef.current.activeSpaceId,
      };
      bindCatDrag(
        cat.id,
        e.currentTarget.closest(".cat-head") || e.currentTarget.closest("[data-cat-id]") || e.currentTarget,
      );
      setDrag({
        kind: "cat",
        id: cat.id,
      });
      setOver({
        kind: "cat",
        insertAt: catIndex,
      });
    },
    onCardPointerDown: (e, app, cat) => {
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
      lockSelection();
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
        fromSpaceId: dataRef.current.activeSpaceId,
      };
      setDrag({
        kind: "card",
        id: app.id,
      });
      const from = dataRef.current.categories.find((c) => c.cards.some((a) => a.id === app.id));
      setOver({
        kind: "card",
        catId: from?.id ?? cat.id,
        insertAt: from?.cards.findIndex((a) => a.id === app.id) ?? 0,
      });
      bindCardDrag(app.id, e.currentTarget, cat.id);
    },
  };
  const spaceStripHandlers: SpaceStripHandlers = {
    goFavs: () => setPage("favs"),
    goSpace,
    editFavs: () =>
      setModal({
        kind: "favs",
      }),
    editSpace: (space) =>
      setModal({
        kind: "space",
        space,
      }),
    duplicateSpace: cloneSpace,
    deleteSpace: (space) =>
      setModal({
        kind: "confirm-space",
        space,
      }),
    addSpace: () =>
      setModal({
        kind: "space",
      }),
    onSpacePointerDown: (e, space, spaceIndex) => {
      if (!canReorderSpaces) return;
      if ((e.target as HTMLElement).closest("[data-space-action]")) return;
      lockSelection();
      didDragRef.current = false;
      dragOriginRef.current = {
        x: e.clientX,
        y: e.clientY,
      };
      writeEditMode(true);
      setDrag({
        kind: "space",
        id: space.id,
      });
      spaceInsertRef.current = spaceIndex;
      setOver({
        kind: "space",
        insertAt: spaceIndex,
      });
      bindSpaceDrag(space.id, e.currentTarget);
    },
    onMoreSpacePointerDown: (e, space) => {
      if (!canReorderSpaces) return;
      e.stopPropagation();
      lockSelection();
      didDragRef.current = false;
      dragOriginRef.current = {
        x: e.clientX,
        y: e.clientY,
      };
      writeEditMode(true);
      spaceOverMoreRef.current = true;
      setSpaceOverMore(true);
      setDrag({
        kind: "space",
        id: space.id,
      });
      const idx = displaySpaces.findIndex((s) => s.id === space.id);
      spaceInsertRef.current = idx < 0 ? displaySpaces.length : idx;
      setOver({
        kind: "space",
        insertAt: idx < 0 ? displaySpaces.length : idx,
      });
      bindSpaceDrag(space.id, e.currentTarget);
    },
    didDrag: () => {
      if (!didDragRef.current) return false;
      didDragRef.current = false;
      return true;
    },
    toggleMore: () => setMoreOpen((v) => !v),
    closeMore: () => setMoreOpen(false),
  };

  return (
    <div className="min-h-dvh">
      <ThemeCss light={data.settings.cssLight || ""} dark={data.settings.cssDark || ""} />
      {data.runtime?.isDev && !hideDevBanner ? (
        <div className="security-banner is-dev" role="status">
          <Bug className="size-3.5 shrink-0" />
          {t("banner.dev")}
          <button
            type="button"
            className="banner-close"
            aria-label={t("actions.close")}
            title={t("actions.close")}
            onClick={() => setHideDevBanner(true)}
          >
            <X strokeWidth={2.75} />
          </button>
        </div>
      ) : null}
      {session?.mustChangePassword ? (
        <div className="security-banner" role="status">
          <AlertTriangle className="size-3.5 shrink-0" />
          {t("banner.weakPassword")}
        </div>
      ) : null}
      {data.runtime?.isDev && data.settings.devAdminNoPassword && !hideNoPassBanner ? (
        <div className="security-banner" role="status">
          <AlertTriangle className="size-3.5 shrink-0" />
          {t("banner.noPassword")}
          <button
            type="button"
            className="banner-close"
            aria-label={t("actions.close")}
            title={t("actions.close")}
            onClick={() => setHideNoPassBanner(true)}
          >
            <X strokeWidth={2.75} />
          </button>
        </div>
      ) : null}
      <header className="sticky top-0 z-20 border-b border-border bg-header">
        <div className="mx-auto flex min-w-0 max-w-6xl items-center gap-2 px-4 py-3 sm:gap-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center">
              {data.settings.logo ? (
                <img src={data.settings.logo} alt="" className="size-10 object-contain" />
              ) : (
                <DockitMark className="dockit-mark size-9" />
              )}
            </div>
            <div className="hidden min-w-0 sm:block sm:max-w-72">
              <h1 className="truncate text-base font-semibold tracking-tight">
                {data.settings.title}
              </h1>
              <p className="hidden truncate text-xs text-muted sm:block">
                {data.settings.subtitle || t("settings.defaultTagline")}
              </p>
            </div>
          </div>
          <div className="search-box relative flex min-h-10 min-w-0 flex-1 items-center gap-1 rounded-lg border border-border bg-surface pl-9">
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
              title={t("nav.searchTitle", { mod: modKeyLabel() })}
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
                      <span data-tone={paint.tone} style={paint.style} className="tag-chip">
                        {t.name}
                      </span>
                      <span className="text-xs text-muted">{t.count}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
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
                <Check className="size-4" />
                <span className="hidden sm:inline">{t("nav.done")}</span>
              </Button>
            ) : null}
          </div>
        </div>
        <SpaceStrip
          spaces={displaySpaces}
          overflowIds={spaceOverflow}
          moreMenuSpaces={moreMenuSpaces}
          moreGapAt={moreGapAt}
          moreOpen={moreOpen}
          dragSpaceId={drag?.kind === "space" ? drag.id : undefined}
          carryDestSpaceId={carryDestSpaceId}
          spaceOverMore={spaceOverMore}
          onFavs={onFavs}
          favsPage={page === "favs"}
          favCount={favCount}
          favsHideLabel={Boolean(data.settings.favsHideLabel)}
          editMode={editMode}
          canReorder={canReorderSpaces}
          canEditFavs={Boolean(session?.canEdit)}
          canEditSpace={canEditSpace}
          canCreateSpaces={sessionCanCreateSpaces(session)}
          canDeleteSpaces={data.spaces.length > 1}
          activeSpaceId={data.activeSpaceId}
          searching={searching}
          searchHitIds={searchHits.map((h) => h.id)}
          spaceListRef={spaceListRef}
          spaceStripRef={spaceStripRef}
          spaceMoreRef={spaceMoreRef}
          morePanelRef={morePanelRef}
          handlers={spaceStripHandlers}
        />
      </header>
      <main
        className={`mx-auto max-w-6xl px-4 py-10 sm:px-6 ${data.settings.infoBar !== false ? "pb-16" : ""}`}
      >
        <CatalogView
          mode={onFavs ? "favs" : searching ? "search" : "space"}
          favGroups={favGroups}
          searchHits={searchHits}
          categories={displayCategories}
          activeSpaceId={data.activeSpaceId}
          query={query}
          tagFilter={tagFilter}
          downFilter={downFilter}
          editMode={editMode}
          canEditActive={canEditActive}
          canEditSpace={canEditSpace}
          canDrag={canDrag}
          canResize={canResize}
          collapsed={isCatCollapsed}
          dragKind={drag?.kind}
          dropCatId={over?.kind === "card" ? over.catId : undefined}
          draggingCardId={drag?.kind === "card" ? (liveId ?? undefined) : undefined}
          liveCatId={drag?.kind === "cat" ? (liveId ?? undefined) : undefined}
          chrome={catalogChrome}
          handlers={catalogHandlers}
          onAddCategory={() =>
            setModal({
              kind: "category",
            })
          }
        />
      </main>
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
          data.settings.infoBar !== false && data.settings.infoLegend !== false
            ? () =>
                setModal({
                  kind: "legend",
                })
            : void 0
        }
      />
      <PortalOverlays
        modal={modal}
        setModal={setModal}
        busy={busy}
        setBusy={setBusy}
        data={data}
        setData={setData}
        token={token}
        setToken={setToken}
        session={session}
        setSession={setSession}
        picker={picker}
        allTags={allTags}
        apply={apply}
        enterEdit={enterEdit}
        openMoveCat={openMoveCat}
        clickStats={clickStats}
        setClickStats={setClickStats}
        adminTabRef={adminTabRef}
        pinSessCookie={pinSessCookie}
        writeSessionInfo={writeSessionInfo}
        tokenKey={TOKEN_KEY}
        oidcNextKey={OIDC_NEXT_KEY}
        sessionCanArrange={sessionCanArrange}
        sessionCanManageAcl={sessionCanManageAcl}
      />
    </div>
  );
}
