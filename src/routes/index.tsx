// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  AppWindow,
  BadgeInfo,
  BarChart3,
  Baseline,
  Bug,
  Bold,
  Check,
  Copy,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  CircleUser,
  Cloud,
  Code,
  Download,
  ExternalLink,
  FileCode,
  FileText,
  Folder,
  Globe,
  GripVertical,
  Italic,
  KeyRound,
  Layers,
  LayoutGrid,
  Link,
  History,
  Lock,
  LogIn,
  LogOut,
  Menu,
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
  Type,
  Undo2,
  Upload,
  Users,
  X,
  ScrollText,
  Server,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AccessUsers, AccessGroups, AccessRoles, MovePickDialog, MoveSectionDialog } from "@/components/access";
import {
  PortalIcon,
  DockitMark,
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
  deleteApp,
  deleteCategory,
  deleteTab,
  deleteUser,
  deleteGroup,
  duplicateTab,
  exportAudit,
  exportPortal,
  getPortal,
  grabSiteFavicon,
  importPortal,
  listUsers,
  manageTags,
  rememberTab,
  moveApp,
  moveCategory,
  previewMoveCategory,
  reorderApps,
  reorderCategories,
  reorderTabs,
  recordClick,
  resetClicks,
  resetPortal,
  saveCustomIcon,
  saveUser,
  saveGroup,
  saveRole,
  deleteRole,
  startOidc,
  unlockEdit,
  updateOidcSettings,
  updateLdapSettings,
  updateLoginOrder,
  updateApp,
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
import { probePreview, probeTargets } from "@/lib/probe";
import { checkLatestRelease } from "@/lib/release";
import { safeAppHref } from "@/lib/safe-href";
import { findUrlDuplicates } from "@/lib/dup-url";
import { collectInventory, inventoryCsv, inventoryPdf } from "@/lib/inventory";
import { CSS_MAX, sanitizeThemeCss } from "@/lib/theme-css";
import { DEFAULT_UI_PREFS, clearUiPrefs, readUiPrefs, writeUiPrefs } from "@/lib/ui-prefs";
import { PASSWORD_MIN } from "@/lib/security";
import { t, te, tp, td, setLocale, asLocale, localeTag, setDateFormat, asDateFormat, formatWhen } from "@/lib/i18n";
import { TAG_PALETTE, defaultTagHex, randomTagHex, remapTagHex, tagInk, tagTone } from "@/lib/tag-colors";

export const Route = createFileRoute("/")({
  loader: async () => {
    const data = await getPortal({ data: {} });
    setLocale(data.settings?.locale);
    setDateFormat(data.settings?.dateFormat);
    return data;
  },
  component: Home,
});

var TOKEN_KEY = "portal-edit-token";
var SESSION_KEY = "portal-session";
var PORTAL_VERSION = "2026.09.04.1";
var EDIT_MODE_KEY = "portal-edit-mode";
var OIDC_NEXT_KEY = "portal-oidc-next";
function versionParts(raw) {
	return String(raw || "").replace(/^v/i, "").split(".").map((n) => Number(n) || 0);
}
function isNewerVersion(latest, current) {
	const a = versionParts(latest);
	const b = versionParts(current);
	const n = Math.max(a.length, b.length);
	for (let i = 0; i < n; i++) {
		if ((a[i] || 0) > (b[i] || 0)) return true;
		if ((a[i] || 0) < (b[i] || 0)) return false;
	}
	return false;
}
var editArmed = false;
function lockSelection(e) {
	e?.preventDefault();
	try {
		window.getSelection()?.removeAllRanges();
	} catch {}
}
function setDragUi(on) {
	if (typeof document === "undefined") return;
	document.documentElement.classList.toggle("is-dragging", on);
	if (on) lockSelection();
}
function nudgeScroll(clientX, clientY, tabRow) {
	const edge = 64;
	const speed = 28;
	const h = window.innerHeight;
	let y = clientY;
	if (arguments.length === 1) {
		y = clientX;
		clientX = window.innerWidth / 2;
	}
	if (y < edge) window.scrollBy(0, -Math.ceil((1 - y / edge) * speed));
	else if (y > h - edge) window.scrollBy(0, Math.ceil((1 - (h - y) / edge) * speed));
	if (!tabRow || typeof clientX !== "number") return;
	const r = tabRow.getBoundingClientRect();
	const te = 44;
	if (y < r.top - 16 || y > r.bottom + 16) return;
	if (clientX < r.left + te) tabRow.scrollLeft -= Math.ceil((1 - Math.max(0, clientX - r.left) / te) * speed);
	else if (clientX > r.right - te) tabRow.scrollLeft += Math.ceil((1 - Math.max(0, r.right - clientX) / te) * speed);
}
function swallowGhostClick() {
	const block = (ev) => {
		if (ev.target?.closest("header")) return;
		ev.preventDefault();
		ev.stopPropagation();
		window.removeEventListener("click", block, true);
	};
	window.addEventListener("click", block, true);
	window.setTimeout(() => window.removeEventListener("click", block, true), 180);
}
function reindexApps(apps, categoryId) {
	return apps.map((a, i) => ({
		...a,
		categoryId,
		sortOrder: i + 1
	}));
}
function placeCarriedApp(categories, app, destCatId, insertAt) {
	if (!app || !destCatId) return null;
	const stripped = categories.map((c) => ({
		...c,
		apps: c.apps.filter((a) => a.id !== app.id)
	}));
	if (!stripped.some((c) => c.id === destCatId)) return null;
	return stripped.map((c) => {
		if (c.id !== destCatId) return c;
		const apps = [...c.apps];
		const idx = Math.max(0, Math.min(insertAt, apps.length));
		apps.splice(idx, 0, {
			...app,
			categoryId: c.id
		});
		return {
			...c,
			apps: reindexApps(apps, c.id)
		};
	});
}
function placeApp(categories, appId, destCatId, insertAt) {
	let moved;
	const stripped = categories.map((c) => {
		const hit = c.apps.find((a) => a.id === appId);
		if (!hit) return c;
		moved = hit;
		return {
			...c,
			apps: c.apps.filter((a) => a.id !== appId)
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
			categoryId: c.id
		});
		return {
			...c,
			apps: reindexApps(apps, c.id)
		};
	});
}
function placeCategory(categories, catId, insertAt) {
	const from = categories.findIndex((c) => c.id === catId);
	if (from < 0) return null;
	const next = categories.filter((c) => c.id !== catId);
	const idx = Math.max(0, Math.min(insertAt, next.length));
	next.splice(idx, 0, categories[from]);
	return next.map((c, i) => ({
		...c,
		sortOrder: i + 1
	}));
}
function placeTabs(tabs, tabId, insertAt) {
	const from = tabs.findIndex((t) => t.id === tabId);
	if (from < 0) return null;
	const next = tabs.filter((t) => t.id !== tabId);
	const idx = Math.max(0, Math.min(insertAt, next.length));
	next.splice(idx, 0, tabs[from]);
	return next.map((t, i) => ({
		...t,
		sortOrder: i + 1
	}));
}
function hoverInsertAt(ids, dragId, anchorId, after) {
	const rest = ids.filter((id) => id !== dragId);
	const ai = rest.indexOf(anchorId);
	return (ai < 0 ? rest.length : ai) + (after ? 1 : 0);
}
function pointerAfter(e, el) {
	const r = el.getBoundingClientRect();
	if (r.height > r.width * 1.1) return e.clientY > r.top + r.height * .35;
	return e.clientX - r.left + (e.clientY - r.top) > (r.width + r.height) / 2;
}
function itemSpanClass(app) {
	return `${app.colSpan === 3 ? "item-span-3" : app.colSpan === 2 ? "item-span-2" : ""} ${app.rowSpan === 3 ? "item-h-3" : app.rowSpan === 2 ? "item-h-2" : "item-h-1"}`.trim();
}
function allowsFavorite(app, settings) {
	const kind = app.kind || "app";
	if (kind === "note") return Boolean(settings?.favNotes);
	if (kind === "embed") return Boolean(settings?.favEmbeds);
	return true;
}
function itemMatches(app, needle, tags, downSet) {
	if (downSet && !downSet.has(app.id)) return false;
	let extra = needle;
	const fromHash = [];
	if (extra.startsWith("#")) {
		const hashed = extra.slice(1).split(",").map((x) => x.trim()).filter(Boolean);
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
	return `${app.title} ${app.description} ${app.url} ${app.tags.join(" ")} ${app.kind}`.toLowerCase().includes(extra);
}
function fold(s) {
	return String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function copyLabel(raw, fallback) {
	const text = String(raw || "").trim();
	const fb = fallback || t("copy.fallback");
	const base = (text || fb).replace(/\s*\((copie|copy)\)\s*$/i, "");
	return `${base} (${t("copy.suffix")})`.slice(0, 80);
}
function typingTarget(el) {
	if (!el || !(el instanceof Element)) return false;
	const tag = el.tagName;
	if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
	if (el.isContentEditable) return true;
	return Boolean(el.closest("input, textarea, select, [contenteditable='true']"));
}
function collectTags(catalog, tagColors) {
	const map = /* @__PURE__ */ new Map();
	for (const tab of catalog ?? []) for (const cat of tab.categories) for (const app of cat.apps) {
		if ((app.kind || "app") !== "app") continue;
		for (const tag of app.tags) {
			const key = tag.toLowerCase();
			const cur = map.get(key);
			if (cur) cur.count += 1;
			else map.set(key, {
				name: tag,
				count: 1
			});
		}
	}
	for (const name of Object.keys(tagColors ?? {})) {
		const key = name.toLowerCase();
		if (!map.has(key)) map.set(key, {
			name,
			count: 0
		});
	}
	return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, localeTag()));
}
function lookupTagColor(name, colors) {
	if (!colors) return void 0;
	if (colors[name]) return remapTagHex(colors[name]);
	const key = name.toLowerCase();
	for (const [k, v] of Object.entries(colors)) if (k.toLowerCase() === key) return remapTagHex(v);
}
function tagPaint(name, colors) {
	const hex = lookupTagColor(name, colors) || defaultTagHex(name);
	return {
		tone: tagTone(name),
		style: {
			["--tag-bg"]: hex,
			["--tag-fg"]: tagInk(hex)
		}
	};
}
var ITEM_GRID = "item-grid";
function fmtCount(n) {
	return Math.max(0, Math.floor(Number(n) || 0)).toLocaleString(localeTag());
}
function StatsBar({ stats, infoBar, downCount, downOn, probeBlink, onDown, onStats }) {
	const span = Number(stats?.spanDays) || 0;
	const metrics = infoBar ? [
		{
			key: "today",
			label: t("info.day"),
			value: stats.today,
			hint: t("info.today")
		},
		span >= 1 ? {
			key: "week",
			label: t("info.week"),
			value: stats.week,
			hint: t("info.last7")
		} : null,
		span >= 7 ? {
			key: "month",
			label: t("info.month"),
			value: stats.month,
			hint: t("info.last30")
		} : null,
		span >= 30 ? {
			key: "year",
			label: t("info.year"),
			value: stats.year,
			hint: t("info.last12")
		} : null
	].filter(Boolean) : [];
	if (!metrics.length && downCount === 0 && !onStats) return null;
	return /* @__PURE__ */ jsx("div", {
		className: "info-bar",
		role: "status",
		"aria-label": t("aria.information"),
		children: /* @__PURE__ */ jsxs("div", {
			className: "info-bar-inner",
			children: [metrics.length || onStats ? /* @__PURE__ */ jsxs("div", {
				className: "info-metrics",
				tabIndex: 0,
				children: [
					/* @__PURE__ */ jsx(MousePointerClick, {
						className: "info-click-ico",
						"aria-hidden": true
					}),
					/* @__PURE__ */ jsxs("span", {
						className: "info-tip",
						role: "tooltip",
						children: [t("stats.clicksTip"), /* @__PURE__ */ jsx(Smile, {
							className: "info-tip-smile",
							"aria-hidden": true
						})]
					}),
					metrics.map((m, i) => /* @__PURE__ */ jsxs("span", {
						className: "info-metric",
						title: m.hint,
						children: [
							i > 0 ? /* @__PURE__ */ jsx("span", {
								className: "info-dot",
								"aria-hidden": true
							}) : null,
							/* @__PURE__ */ jsx("b", { children: fmtCount(m.value) }),
							/* @__PURE__ */ jsx("span", { children: m.label }),
							m.key === "year" && onStats ? /* @__PURE__ */ jsx("button", {
								type: "button",
								className: "info-stats-btn",
								"aria-label": t("stats.title"),
								title: t("stats.topApps"),
								onClick: (e) => {
									e.stopPropagation();
									onStats();
								},
								children: /* @__PURE__ */ jsx(BarChart3, { className: "size-3" })
							}) : null
						]
					}, m.key)),
					onStats && !metrics.some((m) => m.key === "year") ? /* @__PURE__ */ jsx("button", {
						type: "button",
						className: "info-stats-btn",
						"aria-label": t("stats.title"),
						title: t("stats.topApps"),
						onClick: onStats,
						children: /* @__PURE__ */ jsx(BarChart3, { className: "size-3" })
					}) : null
				]
			}) : /* @__PURE__ */ jsx("span", {}), downCount > 0 ? /* @__PURE__ */ jsxs("button", {
				type: "button",
				className: `info-bar-warn ${downOn ? "is-on" : ""} ${probeBlink ? "is-blink" : ""}`,
				onClick: onDown,
				"aria-pressed": downOn,
				title: downOn ? t("stats.showAll") : t("stats.showDown"),
				children: [
					/* @__PURE__ */ jsx(AlertTriangle, { className: "size-3" }),
					downCount,
					downCount > 1 ? " sondes HS" : " sonde HS"
				]
			}) : null]
		})
	});
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
async function pinSessCookie(token) {
	if (!token || typeof fetch === "undefined") return;
	const res = await fetch("/__dockit/session", {
		method: "POST",
		headers: {
			"content-type": "application/json"
		},
		credentials: "include",
		body: JSON.stringify({
			token
		})
	});
	if (!res.ok) throw new Error("errors.sessionCookieDenied");
}
async function clearSessCookie() {
	if (typeof fetch === "undefined") return;
	try {
		await fetch("/__dockit/session", {
			method: "DELETE",
			credentials: "include"
		});
	} catch {}
}
function writeSessionInfo(session) {
	try {
		if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
		else sessionStorage.removeItem(SESSION_KEY);
	} catch {}
}
function writeEditMode(on) {
	editArmed = on;
	try {
		if (on) sessionStorage.setItem(EDIT_MODE_KEY, "1");
		else sessionStorage.removeItem(EDIT_MODE_KEY);
	} catch {}
}
function sessionGone(err) {
	const msg = err instanceof Error ? err.message : String(err || "");
	if (msg !== "errors.sessionExpired" && !/session expir/i.test(msg)) return false;
	try {
		window.dispatchEvent(new Event("portal-session-gone"));
	} catch {}
	return true;
}
var inputClass = "field-input h-11 w-full rounded-lg border border-border bg-elevated/80 px-3 text-sm text-fg outline-none placeholder:text-subtle";
function prettyLogin(name) {
	const s = String(name || "").trim();
	if (!s) return "";
	const lower = s.toLocaleLowerCase(localeTag());
	return lower.charAt(0).toLocaleUpperCase(localeTag()) + lower.slice(1);
}
function accountStatusLabel(loggedIn, role) {
	if (!loggedIn) return t("account.guest");
	if (role === "editeur") return t("account.editor");
	if (role === "lecteur") return t("account.viewer");
	if (role === "admin" || role === "owner") return t("account.admin");
	return t("account.member") || prettyLogin(role);
}
function AccountMenu({ loggedIn, editMode, canEdit, canOpenSettings, canManageUsers, canHistory, role, openFavs, onLogin, onEdit, onSettings, onHistory, onUsers, onOpenFavs, onResetLocal, onLogout }) {
	const [open, setOpen] = useState(false);
	const ref = useRef(null);
	useEffect(() => {
		if (!open) return;
		const onDoc = (e) => {
			if (!ref.current?.contains(e.target)) setOpen(false);
		};
		document.addEventListener("pointerdown", onDoc);
		return () => document.removeEventListener("pointerdown", onDoc);
	}, [open]);
	const showEdit = loggedIn && canEdit && !editMode;
	const showSettings = loggedIn && canOpenSettings;
	const showHistory = loggedIn && canHistory;
	const showUsers = loggedIn && canManageUsers;
	const status = accountStatusLabel(loggedIn, role);
	const localPrefs = /* @__PURE__ */ jsxs(Fragment, {
		children: [
			/* @__PURE__ */ jsx("div", { className: "menu-sep" }),
			/* @__PURE__ */ jsx("p", { className: "menu-kicker", children: t("account.browser") }),
			/* @__PURE__ */ jsxs("label", {
				className: "account-check is-local",
				children: [/* @__PURE__ */ jsx("input", {
					type: "checkbox",
					checked: Boolean(openFavs),
					onChange: (e) => onOpenFavs(e.target.checked)
				}), t("account.openFavs")]
			}),
			/* @__PURE__ */ jsxs("button", {
				type: "button",
				role: "menuitem",
				className: "is-local is-danger",
				onClick: () => {
					setOpen(false);
					if (!window.confirm(t("account.resetPrefsConfirm"))) return;
					onResetLocal();
				},
				children: [/* @__PURE__ */ jsx(RotateCcw, { className: "size-4 shrink-0" }), t("account.resetPrefs")]
			})
		]
	});
	return /* @__PURE__ */ jsxs("div", {
		className: "account-menu",
		ref,
		children: [/* @__PURE__ */ jsx(Button, {
			variant: "ghost",
			size: "icon-sm",
			"aria-label": t("aria.account"),
			"aria-haspopup": "menu",
			"aria-expanded": open,
			onClick: () => setOpen((v) => !v),
			children: /* @__PURE__ */ jsx(CircleUser, {
				className: `account-ico size-4${loggedIn ? " is-on" : ""}`
			})
		}), open ? /* @__PURE__ */ jsxs("div", {
			className: "account-panel",
			role: "menu",
			children: [
				/* @__PURE__ */ jsx("p", { className: "menu-kicker", children: status }),
				!loggedIn ? /* @__PURE__ */ jsxs("button", {
					type: "button",
					role: "menuitem",
					onClick: () => {
						setOpen(false);
						onLogin();
					},
					children: [/* @__PURE__ */ jsx(LogIn, { className: "size-4 shrink-0" }), t("account.login")]
				}) : null,
				showEdit ? /* @__PURE__ */ jsxs("button", {
					type: "button",
					role: "menuitem",
					onClick: () => {
						setOpen(false);
						onEdit();
					},
					children: [/* @__PURE__ */ jsx(Pencil, { className: "size-4 shrink-0" }), t("account.edit")]
				}) : null,
				showSettings ? /* @__PURE__ */ jsxs("button", {
					type: "button",
					role: "menuitem",
					onClick: () => {
						setOpen(false);
						onSettings();
					},
					children: [/* @__PURE__ */ jsx(Settings, { className: "size-4 shrink-0" }), t("settings.title")]
				}) : null,
				showHistory ? /* @__PURE__ */ jsxs("button", {
					type: "button",
					role: "menuitem",
					onClick: () => {
						setOpen(false);
						onHistory();
					},
					children: [/* @__PURE__ */ jsx(History, { className: "size-4 shrink-0" }), t("history.title")]
				}) : null,
				showUsers ? /* @__PURE__ */ jsxs("button", {
					type: "button",
					role: "menuitem",
					onClick: () => {
						setOpen(false);
						onUsers();
					},
					children: [/* @__PURE__ */ jsx(Users, { className: "size-4 shrink-0" }), t("access.title")]
				}) : null,
				loggedIn && (showEdit || showSettings || showHistory || showUsers) ? /* @__PURE__ */ jsx("div", { className: "menu-sep" }) : null,
				loggedIn ? /* @__PURE__ */ jsxs("button", {
					type: "button",
					role: "menuitem",
					onClick: () => {
						setOpen(false);
						onLogout();
					},
					children: [/* @__PURE__ */ jsx(LogOut, { className: "size-4 shrink-0" }), t("account.logout")]
				}) : null,
				localPrefs
			]
		}) : null]
	});
}
function Home() {
	const initial = Route.useLoaderData();
	const [data, setData] = useState(initial);
	setLocale(data.settings?.locale);
	setDateFormat(data.settings?.dateFormat);
	const [editMode, setEditMode] = useState(false);
	const [token, setToken] = useState("");
	const [session, setSession] = useState(null);
	const [hideDevBanner, setHideDevBanner] = useState(false);
	const [hideNoPassBanner, setHideNoPassBanner] = useState(false);
	const [modal, setModal] = useState({ kind: "none" });
	const adminTabRef = useRef("general");
	const [busy, setBusy] = useState(false);
	const [query, setQuery] = useState("");
	const [tagFilter, setTagFilter] = useState([]);
	const [tagHi, setTagHi] = useState(0);
	const [downFilter, setDownFilter] = useState(false);
	const [clickStats, setClickStats] = useState(initial.clickStats || {
		all: 0,
		today: 0,
		week: 0,
		month: 0,
		year: 0,
		spanDays: 0
	});
	const [ui, setUi] = useState(DEFAULT_UI_PREFS);
	const [page, setPage] = useState("tab");
	const [health, setHealth] = useState({});
	const healthBusy = useRef(false);
	const [drag, setDrag] = useState(null);
	const [over, setOver] = useState(null);
	const dragRef = useRef(drag);
	const overRef = useRef(over);
	const didDragRef = useRef(false);
	const dataRef = useRef(data);
	const searchRef = useRef(null);
	const modalRef = useRef(modal);
	const editModeRef = useRef(editMode);
	const sessionRef = useRef(session);
	const queryRef = useRef(query);
	const pageRef = useRef(page);
	const tokenRef = useRef(token);
	const hotkeysRef = useRef({
		requestEdit: () => {},
		openNewCard: () => {},
		focusSearch: () => {}
	});
	const tabListRef = useRef(null);
	const tabInsertRef = useRef(0);
	const activeTabRef = useRef(data.activeTabId);
	const dragOriginRef = useRef(null);
	const ghostRef = useRef(null);
	const markerRef = useRef(null);
	const carryRef = useRef(null);
	const tabHoverRef = useRef(null);
	const dragPtrRef = useRef({
		x: 0,
		y: 0
	});
	const dragScrollRafRef = useRef(0);
	const ghostOff = useRef({
		x: 0,
		y: 0
	});
	const unbindDragRef = useRef(null);
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
		stopDragScroll();
	}
	function canEditTabId(tabId) {
		const sess = sessionRef.current;
		if (!sess) return false;
		if (sess.role === "admin") return true;
		return sess.tabPerms?.[tabId] === "edit";
	}
	function hitTabCarry(clientX, clientY) {
		const stack = document.elementsFromPoint(clientX, clientY);
		for (const node of stack) {
			if (!(node instanceof HTMLElement)) continue;
			if (node === ghostRef.current) continue;
			const el = node.closest("[data-tab-id]");
			const tabId = el?.dataset?.tabId;
			if (!tabId) continue;
			if (!canEditTabId(tabId)) return {
				tabId,
				blocked: true
			};
			return {
				tabId,
				blocked: false
			};
		}
		return null;
	}
	function overForCarry(tabId) {
		const cur = dataRef.current;
		const cats = (cur.catalog ?? []).find((t) => t.id === tabId)?.categories || (tabId === cur.activeTabId ? cur.categories : []);
		const cat = cats[0];
		const appId = carryRef.current?.app?.id;
		if (!cat) return {
			kind: "tab-carry",
			tabId
		};
		return {
			kind: "app",
			catId: cat.id,
			insertAt: cat.apps.filter((a) => a.id !== appId).length
		};
	}
	function killGhost() {
		ghostRef.current?.remove();
		ghostRef.current = null;
		markerRef.current?.remove();
		markerRef.current = null;
	}
	function spawnGhost(from, e, rect) {
		ghostRef.current?.remove();
		const r = rect || from.getBoundingClientRect();
		const node = from.cloneNode(true);
		node.removeAttribute("data-app-id");
		node.removeAttribute("data-cat-id");
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
			y: e.clientY - r.top
		};
	}
	function moveGhost(x, y) {
		const node = ghostRef.current;
		if (!node) return;
		node.style.left = `${x - ghostOff.current.x}px`;
		node.style.top = `${y - ghostOff.current.y}px`;
	}
	function finishAppDrag(ev) {
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
	function bindTabDrag(tabId) {
		unbindDrag();
		const move = (ev) => {
			if (dragRef.current?.kind !== "tab" || dragRef.current.id !== tabId) return;
			const o = dragOriginRef.current;
			if ((o ? Math.hypot(ev.clientX - o.x, ev.clientY - o.y) : 0) > 10 && !didDragRef.current) {
				didDragRef.current = true;
				setDragUi(true);
			}
			if (!didDragRef.current) return;
			const insertAt = tabInsertAt(ev.clientX, tabId);
			tabInsertRef.current = insertAt;
			setOver((cur) => cur?.kind === "tab" && cur.insertAt === insertAt ? cur : {
				kind: "tab",
				insertAt
			});
		};
		const up = () => {
			unbindDrag();
			endTabPointer(tabId, didDragRef.current);
		};
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up, { once: true });
		window.addEventListener("pointercancel", up, { once: true });
		unbindDragRef.current = () => {
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
			window.removeEventListener("pointercancel", up);
		};
	}
	function openMoveCat(category, fromTabId, destTabId) {
		setBusy(true);
		previewMoveCategory({
			data: {
				token: tokenRef.current,
				categoryId: category.id,
				destTabId
			}
		}).then((impact) => setModal({
			kind: "move-cat",
			impact
		})).catch((err) => {
			if (!sessionGone(err)) toast.error(te(err));
		}).finally(() => setBusy(false));
	}
	function bindCatDrag(catId, origin) {
		unbindDrag();
		const ghostRect = origin.getBoundingClientRect();
		const ghostNode = origin.cloneNode(true);
		const move = (ev) => {
			if (dragRef.current?.kind !== "cat" || dragRef.current.id !== catId) return;
			dragPtrRef.current = {
				x: ev.clientX,
				y: ev.clientY
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
			if (tabHit && tabHit.tabId !== dataRef.current.activeTabId) {
				setOver({
					kind: "tab-carry",
					tabId: tabHit.tabId,
					blocked: tabHit.blocked
				});
				return;
			}
			const insertAt = hitCatInsert(ev.clientY, catId);
			setOver((cur) => cur?.kind === "cat" && cur.insertAt === insertAt ? cur : {
				kind: "cat",
				insertAt
			});
		};
		const up = (ev) => {
			unbindDrag();
			killGhost();
			if (!didDragRef.current) {
				setDrag(null);
				setOver(null);
				setDragUi(false);
				return;
			}
			swallowGhostClick();
			const tabHit = hitTabCarry(ev.clientX, ev.clientY);
			if (tabHit?.blocked) {
				setDrag(null);
				setOver(null);
				setDragUi(false);
				toast.error(t("toast.noEditTab"));
				return;
			}
			if (tabHit && tabHit.tabId !== dataRef.current.activeTabId) {
				const cat = dataRef.current.categories.find((c) => c.id === catId);
				setDrag(null);
				setOver(null);
				setDragUi(false);
				if (cat) openMoveCat(cat, dataRef.current.activeTabId, tabHit.tabId);
				return;
			}
			commitDrag();
		};
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up, { once: true });
		window.addEventListener("pointercancel", up, { once: true });
		unbindDragRef.current = () => {
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
			window.removeEventListener("pointercancel", up);
		};
	}
	function bindAppDrag(appId, origin) {
		unbindDrag();
		const move = (ev) => {
			if (dragRef.current?.kind !== "app" || dragRef.current.id !== appId) return;
			dragPtrRef.current = {
				x: ev.clientX,
				y: ev.clientY
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
			if (tabHit && !tabHit.blocked) {
				setOver({
					kind: "tab-carry",
					tabId: tabHit.tabId
				});
				if (tabHit.tabId !== dataRef.current.activeTabId) {
					const hover = tabHoverRef.current;
					if (!hover || hover.tabId !== tabHit.tabId) tabHoverRef.current = {
						tabId: tabHit.tabId,
						at: Date.now()
					};
					else if (Date.now() - hover.at > 320) {
						const dest = (dataRef.current.catalog ?? []).find((t) => t.id === tabHit.tabId);
						if (!dest?.categories?.length) {
							toast.error(t("toast.needCategory"));
							tabHoverRef.current = {
								tabId: tabHit.tabId,
								at: Number.POSITIVE_INFINITY
							};
							return;
						}
						goTab(tabHit.tabId);
						setOver(overForCarry(tabHit.tabId));
						tabHoverRef.current = {
							tabId: tabHit.tabId,
							at: Number.POSITIVE_INFINITY
						};
					}
				}
				return;
			}
			tabHoverRef.current = null;
			const hit = hitAppInsert(ev.clientX, ev.clientY, appId);
			if (!hit) return;
			const cur = overRef.current;
			if (cur?.kind === "app" && cur.catId === hit.catId && cur.insertAt === hit.insertAt) return;
			setOver(hit);
		};
		const up = (ev) => finishAppDrag(ev);
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up, { once: true });
		window.addEventListener("pointercancel", up, { once: true });
		unbindDragRef.current = () => {
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
			window.removeEventListener("pointercancel", up);
		};
	}
	useEffect(() => {
		const t = readToken();
		setToken(t);
		const saved = readSessionInfo();
		if (saved) setSession(saved);
		getPortal({ data: t ? { token: t } : {} }).then((next) => {
			setData(next);
			if (next.session) {
				setSession(next.session);
				writeSessionInfo(next.session);
				try {
					const jump = sessionStorage.getItem(OIDC_NEXT_KEY);
					if (jump) {
						sessionStorage.removeItem(OIDC_NEXT_KEY);
						if (jump === "admin") setModal({
							kind: "admin",
							tab: next.session.canManageSettings ? "general" : next.session.canManageUsers ? "users" : "about"
						});
						else if (jump === "history" && next.session.canEdit) setModal({
							kind: "history",
							tab: "recovery"
						});
						else if (jump === "edit" && next.session.canEdit) setEditMode(true);
					}
				} catch {}
			} else {
				setToken("");
				setSession(null);
				writeSessionInfo(null);
				exitEdit();
				try {
					sessionStorage.removeItem(TOKEN_KEY);
				} catch {}
			}
		}).catch(() => void 0);
		try {
			if (t && (editArmed || sessionStorage.getItem(EDIT_MODE_KEY) === "1")) setEditMode(true);
		} catch {}
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
		};
		const onKey = (e) => {
			if (e.key === "Escape" && (dragRef.current || document.documentElement.classList.contains("is-dragging"))) forceIdle();
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
		const block = (e) => {
			if (dragRef.current) e.preventDefault();
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
	function requestLogin() {
		if (sessionRef.current || tokenRef.current || readToken()) return;
		setModal({
			kind: "lock",
			next: "session"
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
			next: "edit"
		});
	}
	function stayEditing() {
		if (editArmed) setEditMode(true);
	}
	function requestAdmin(tab) {
		adminTabRef.current = tab;
		const sess = sessionRef.current;
		if (sess) {
			const next = sess.canManageSettings ? tab : "about";
			setModal({
				kind: "admin",
				tab: next
			});
			return;
		}
		setModal({
			kind: "lock",
			next: "admin"
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
			tab: sess.canRestore ? "recovery" : "audit"
		});
	}
	function requestUsers() {
		const sess = sessionRef.current || readSessionInfo();
		if (!sess?.canManageUsers) {
			setModal({ kind: "lock", next: "users" });
			return;
		}
		setModal({ kind: "users" });
	}
	function clearAuth() {
		void clearSessCookie();
		try {
			sessionStorage.removeItem(TOKEN_KEY);
		} catch {}
		writeSessionInfo(null);
		setToken("");
		setSession(null);
		exitEdit();
		setModal({ kind: "none" });
		setBusy(false);
	}
	function logoutEdit() {
		clearAuth();
		toast.success(t("toast.loggedOut"));
		getPortal({ data: {} }).then(setData).catch(() => void 0);
	}
	function expireSession() {
		if (!readToken() && !readSessionInfo()) return;
		clearAuth();
		toast.error(t("toast.sessionExpired"));
		getPortal({ data: {} }).then(setData).catch(() => void 0);
	}
	useEffect(() => {
		const onGone = () => expireSession();
		window.addEventListener("portal-session-gone", onGone);
		return () => window.removeEventListener("portal-session-gone", onGone);
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
			getPortal({ data: { token } }).then((next) => {
				if (!readToken() && !readSessionInfo()) return;
				if (!next.session) expireSession();
				else {
					setSession(next.session);
					writeSessionInfo(next.session);
				}
			}).catch((err) => {
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
	}, [token, session?.exp]);
	async function apply(fn, opts) {
		setBusy(true);
		try {
			const next = await Promise.race([fn(), new Promise((_, reject) => {
				window.setTimeout(() => reject(/* @__PURE__ */ new Error("errors.timeout")), 12e3);
			})]);
			setData(next);
			if (next.session) {
				setSession(next.session);
				writeSessionInfo(next.session);
			}
			if (opts?.close !== false) setModal({ kind: "none" });
		} catch (err) {
			if (sessionGone(err)) return;
			toast.error(te(err));
		} finally {
			setBusy(false);
		}
	}
	useEffect(() => {
		const onKey = (e) => {
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
	function focusSearch(extra) {
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
				} catch {}
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
			categoryId: cat.id
		});
	}
	hotkeysRef.current = {
		requestEdit,
		openNewCard,
		focusSearch
	};
	function duplicateApp(app, categoryId) {
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
					openIn: app.openIn || "_blank",
					tags: app.tags || [],
					colSpan: app.colSpan === 2 || app.colSpan === 3 ? app.colSpan : 1,
					rowSpan: app.rowSpan === 2 || app.rowSpan === 3 ? app.rowSpan : 1,
					check: app.check || "off",
					checkHost: app.checkHost || "",
					links: app.links || []
				}
			});
			toast.success(t("toast.cardDuplicated"));
			return next;
		});
	}
	function duplicateSpace(tab) {
		apply(async () => {
			const next = await duplicateTab({
				data: {
					token,
					id: tab.id
				}
			});
			toast.success(t("toast.spaceDuplicated"));
			return next;
		});
	}
	function bumpClick(app) {
		if ((app.kind || "app") !== "app") return;
		setData((cur) => {
			const bump = (item) => item.id === app.id ? {
				...item,
				clicks: (item.clicks || 0) + 1
			} : item;
			return {
				...cur,
				categories: cur.categories.map((c) => ({
					...c,
					apps: c.apps.map(bump)
				})),
				catalog: (cur.catalog ?? []).map((t) => ({
					...t,
					categories: t.categories.map((c) => ({
						...c,
						apps: c.apps.map(bump)
					}))
				}))
			};
		});
		setClickStats((cur) => ({
			all: (cur.all || 0) + 1,
			today: (cur.today || 0) + 1,
			week: (cur.week || 0) + 1,
			month: (cur.month || 0) + 1,
			year: (cur.year || 0) + 1,
			spanDays: cur.spanDays || 0
		}));
		recordClick({ data: { id: app.id } }).then((row) => {
			if (row?.clickStats) setClickStats(row.clickStats);
		}).catch(() => void 0);
	}
	async function recheckApp(app) {
		if (!app.check || app.check === "off") return;
		try {
			const row = (await probeTargets({ data: { token: token || undefined, ids: [app.id] } }))[0];
			if (row) setHealth((cur) => ({
				...cur,
				[row.id]: row
			}));
		} catch (err) {
			toast.error(te(err));
		}
	}
	async function switchTab(tabId) {
		if (tabId === dataRef.current.activeTabId) return;
		const current = dataRef.current;
		const entry = (current.catalog ?? []).find((t) => t.id === tabId);
		activeTabRef.current = tabId;
		if (entry) {
			setData({
				...current,
				activeTabId: tabId,
				categories: entry.categories
			});
			rememberTab({ data: { tabId } }).catch(() => void 0);
			return;
		}
		try {
			const next = await getPortal({ data: {
				tabId,
				token: token || void 0
			} });
			if (activeTabRef.current === tabId) setData(next);
		} catch (err) {
			if (sessionGone(err)) return;
			toast.error(te(err));
		}
	}
	function goTab(tabId) {
		setPage("tab");
		if (tabId !== dataRef.current.activeTabId) switchTab(tabId);
	}
	function tabHasCards(tabId) {
		const row = (data.catalog ?? []).find((t) => t.id === tabId);
		const cats = row?.categories || (tabId === data.activeTabId ? data.categories : []);
		return (cats || []).some((c) => (c.apps || []).length);
	}
	function toggleFav(id) {
		setUi((cur) => {
			const favIds = cur.favIds.includes(id) ? cur.favIds.filter((x) => x !== id) : [...cur.favIds, id].slice(0, 80);
			return writeUiPrefs({
				...cur,
				favIds
			});
		});
	}
	function setOpenFavs(openFavs) {
		setUi((cur) => writeUiPrefs({
			...cur,
			openFavs
		}));
	}
	function toggleCollapsed(id) {
		setUi((cur) => {
			const collapsedCats = (cur.collapsedCats ?? []).includes(id) ? cur.collapsedCats.filter((x) => x !== id) : [...cur.collapsedCats ?? [], id].slice(0, 80);
			return writeUiPrefs({
				...cur,
				collapsedCats
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
		} catch {}
		toast.success(t("toast.prefsReset"));
	}
	const collapsedSet = useMemo(() => new Set(ui.collapsedCats ?? []), [ui.collapsedCats]);
	const searching = query.trim().length > 0 || tagFilter.length > 0 || downFilter;
	const onFavs = page === "favs" && !searching;
	const canEditActive = session?.role === "admin" || session?.tabPerms?.[data.activeTabId] === "edit";
	const canEditTab = (tabId) => session?.role === "admin" || session?.tabPerms?.[tabId] === "edit";
	const canReorderTabs = Boolean(editMode && !searching && (session?.role === "admin" || session?.canCreateTabs));
	const canDrag = editMode && !searching && page !== "favs" && canEditActive;
	function toggleTag(name) {
		setTagFilter((cur) => {
			const key = name.toLowerCase();
			if (cur.some((t) => t.toLowerCase() === key)) return cur.filter((t) => t.toLowerCase() !== key);
			if (cur.length >= 3) {
				toast.error(t("toast.maxTags"));
				return cur;
			}
			return [...cur, name];
		});
	}
	function applyTagFromSearch(name) {
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
		if (data.settings.healthChecks === false) return [];
		const ids = [];
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
		return (data.catalog ?? []).map((tab) => {
			const tabHit = Boolean(s) && tab.name.toLowerCase().includes(s);
			const categories = tab.categories.map((c) => {
				const catHit = tabHit || Boolean(s) && c.name.toLowerCase().includes(s);
				return {
					...c,
					apps: catHit && tags.length === 0 && !downSet ? c.apps : c.apps.filter((a) => itemMatches(a, s, tags, downSet))
				};
			}).filter((c) => c.apps.length > 0);
			return {
				...tab,
				categories
			};
		}).filter((t) => t.categories.length > 0);
	}, [
		data.catalog,
		query,
		tagFilter,
		downFilter,
		downIds
	]);
	const allTags = useMemo(() => collectTags(data.catalog, data.settings.tagColors), [data.catalog, data.settings.tagColors]);
	const tagMatches = useMemo(() => {
		const s = fold(query.trim());
		if (!s) return [];
		return allTags.filter((t) => fold(t.name).includes(s) && !tagFilter.some((x) => x.toLowerCase() === t.name.toLowerCase())).slice(0, 8);
	}, [
		query,
		allTags,
		tagFilter
	]);
	const favSet = useMemo(() => new Set(ui.favIds), [ui.favIds]);
	const favGroups = useMemo(() => {
		const order = new Map(ui.favIds.map((id, i) => [id, i]));
		const groups = [];
		for (const tab of data.catalog ?? []) for (const cat of tab.categories) {
			const apps = cat.apps.filter((a) => favSet.has(a.id) && allowsFavorite(a, data.settings)).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
			if (apps.length) groups.push({
				tab,
				cat,
				apps
			});
		}
		return groups;
	}, [
		data.catalog,
		favSet,
		ui.favIds
	]);
	const favCount = favGroups.reduce((n, g) => n + g.apps.length, 0);
	const probeList = useMemo(() => {
		if (data.settings.healthChecks === false) return [];
		const out = [];
		for (const tab of data.catalog ?? []) for (const cat of tab.categories) for (const app of cat.apps) {
			if ((app.kind || "app") !== "app" || app.check === "off" || !app.check) continue;
			if (app.check === "http") out.push({
				id: app.id,
				mode: "http",
				url: app.url
			});
			else if (app.check === "icmp") out.push({
				id: app.id,
				mode: "icmp",
				host: app.checkHost
			});
		}
		return out;
	}, [data.catalog, data.settings.healthChecks]);
	const probeKey = probeList.map((t) => `${t.id}:${t.mode}:${t.url ?? ""}:${t.host ?? ""}`).join("|");
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
						const rows = await probeTargets({ data: { token: token || undefined, ids: chunk.map((t) => t.id) } });
						if (cancelled) return;
						setHealth((cur) => {
							const next = { ...cur };
							for (const row of rows) next[row.id] = row;
							return next;
						});
					} catch {}
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
		if (typeof requestIdleCallback === "function") idleId = requestIdleCallback(kick, { timeout: 800 });
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
	}, [probeKey, token]);
	const filtered = useMemo(() => {
		if (searching) return searchHits.flatMap((t) => t.categories);
		return data.categories;
	}, [
		searching,
		searchHits,
		data.categories
	]);
	const carryDestTabId = drag?.kind === "app"
		? over?.kind === "tab-carry"
			? over.tabId
			: carryRef.current && carryRef.current.fromTabId !== data.activeTabId
				? data.activeTabId
				: null
		: null;
	const displayTabs = useMemo(() => {
		let tabs = data.tabs;
		if (canReorderTabs && drag && over && drag.kind === "tab" && over.kind === "tab") tabs = placeTabs(data.tabs, drag.id, over.insertAt) ?? data.tabs;
		if (editMode || searching) return tabs;
		return tabs.filter((t) => tabHasCards(t.id));
	}, [
		data.tabs,
		data.catalog,
		data.categories,
		data.activeTabId,
		canReorderTabs,
		drag,
		over,
		editMode,
		searching
	]);
	useEffect(() => {
		if (editMode || searching || page !== "tab") return;
		if (tabHasCards(data.activeTabId)) return;
		const next = (data.tabs || []).find((t) => t.id !== data.activeTabId && tabHasCards(t.id));
		if (next) goTab(next.id);
		else setPage("favs");
	}, [editMode, searching, page, data.activeTabId, data.catalog, data.tabs]);
	const displayCategories = useMemo(() => {
		const base = filtered;
		if (!canDrag || !drag || !over) return base;
		if (drag.kind === "cat" && over.kind === "cat") return placeCategory(base, drag.id, over.insertAt) ?? base;
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
	}, [
		filtered,
		canDrag,
		drag,
		over
	]);
	function sameLayout(a, b) {
		return JSON.stringify(a.map((c) => ({
			id: c.id,
			apps: c.apps.map((x) => x.id)
		}))) === JSON.stringify(b.map((c) => ({
			id: c.id,
			apps: c.apps.map((x) => x.id)
		})));
	}
	function persistMove(app, fromTabId, destTabId, nextCats) {
		const current = dataRef.current;
		const snapshot = {
			categories: current.categories,
			catalog: current.catalog,
			activeTabId: current.activeTabId
		};
		const dest = nextCats.find((c) => c.apps.some((a) => a.id === app.id));
		const placed = dest?.apps.find((a) => a.id === app.id);
		if (!dest || !placed) return;
		const catalog = (current.catalog ?? []).map((t) => {
			if (t.id === fromTabId) return {
				...t,
				categories: t.categories.map((c) => ({
					...c,
					apps: c.apps.filter((a) => a.id !== app.id)
				}))
			};
			if (t.id === destTabId) return {
				...t,
				categories: nextCats
			};
			return t;
		});
		setData({
			...current,
			categories: nextCats,
			catalog,
			activeTabId: destTabId
		});
		moveApp({
			data: {
				token: tokenRef.current,
				id: app.id,
				destTabId,
				destCategoryId: dest.id,
				sortOrder: placed.sortOrder || 1
			}
		}).then((next) => {
			setData(next);
			stayEditing();
		}).catch((err) => {
			toast.error(te(err));
			setData({
				...current,
				...snapshot
			});
			stayEditing();
		});
	}
	function persistTabs(nextTabs) {
		const current = dataRef.current;
		if (nextTabs.map((t) => t.id).join() === current.tabs.map((t) => t.id).join()) return;
		const snapshot = current.tabs;
		setData({
			...current,
			tabs: nextTabs
		});
		reorderTabs({ data: {
			token,
			tabId: current.activeTabId,
			order: nextTabs.map((t) => t.id)
		} }).then((next) => {
			const latest = dataRef.current;
			setData({
				...next,
				activeTabId: latest.activeTabId,
				categories: next.activeTabId === latest.activeTabId ? next.categories : latest.categories
			});
			stayEditing();
		}).catch((err) => {
			if (sessionGone(err)) return;
			toast.error(te(err));
			setData({
				...current,
				tabs: snapshot
			});
			stayEditing();
		});
	}
	function persistLayout(nextCats) {
		const current = dataRef.current;
		if (sameLayout(current.categories, nextCats)) return;
		const snapshot = current.categories;
		setData({
			...current,
			categories: nextCats
		});
		const placements = nextCats.flatMap((c) => c.apps.map((a, i) => ({
			id: a.id,
			categoryId: c.id,
			sortOrder: i + 1
		})));
		const catChanged = nextCats.map((c) => c.id).join() !== current.categories.map((c) => c.id).join();
		const tabId = activeTabRef.current || current.activeTabId;
		(catChanged ? reorderCategories({ data: {
			token,
			tabId,
			order: nextCats.map((c) => c.id)
		} }).then(() => reorderApps({ data: {
			token,
			tabId,
			placements
		} })) : reorderApps({ data: {
			token,
			tabId,
			placements
		} })).then((next) => {
			const latest = dataRef.current;
			if (next.activeTabId !== latest.activeTabId && next.activeTabId !== current.activeTabId) {
				stayEditing();
				return;
			}
			setData(next);
			stayEditing();
		}).catch((err) => {
			toast.error(te(err));
			setData({
				...current,
				categories: snapshot
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
			if (carry && carry.fromTabId !== destTabId) {
				const nextCats = placeCarriedApp(current.categories, carry.app, o.catId, o.insertAt);
				if (nextCats) persistMove(carry.app, carry.fromTabId, destTabId, nextCats);
				clearCarry();
				return;
			}
			const next = placeApp(current.categories, d.id, o.catId, o.insertAt) || carry && placeCarriedApp(current.categories, carry.app, o.catId, o.insertAt);
			clearCarry();
			if (next) persistLayout(next);
			return;
		}
		if (d.kind === "cat" && o.kind === "cat") {
			const next = placeCategory(current.categories, d.id, o.insertAt);
			if (next) persistLayout(next);
		}
	}
	function tabInsertAt(clientX, dragId) {
		const root = tabListRef.current;
		const ids = dataRef.current.tabs.map((t) => t.id).filter((id) => id !== dragId);
		if (!root) return ids.length;
		const nodes = [...root.querySelectorAll("[data-tab-id]")];
		for (const el of nodes) {
			const id = el.dataset.tabId;
			if (!id || id === dragId) continue;
			const r = el.getBoundingClientRect();
			if (clientX < r.left + r.width / 2) {
				const at = ids.indexOf(id);
				return at < 0 ? ids.length : at;
			}
		}
		return ids.length;
	}
	function endTabPointer(tabId, moved) {
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
	function hitAppInsert(clientX, clientY, dragId) {
		const stack = document.elementsFromPoint(clientX, clientY);
		let card;
		let section;
		let overSelf = false;
		for (const node of stack) {
			if (!(node instanceof HTMLElement)) continue;
			if (node === ghostRef.current || node === markerRef.current) continue;
			const c = node.closest("[data-app-id]");
			if (c?.dataset.appId === dragId) overSelf = true;
			else if (c?.dataset.appId && !card) card = c;
			const s = node.closest("[data-cat-id]");
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
		if (destId && destId !== dragId) {
			const after = pointerAfter({
				clientX,
				clientY
			}, card);
			return {
				kind: "app",
				catId,
				insertAt: hoverInsertAt(cat.apps.map((a) => a.id), dragId, destId, after)
			};
		}
		return {
			kind: "app",
			catId,
			insertAt: cat.apps.filter((a) => a.id !== dragId).length
		};
	}
	function hitCatInsert(clientY, dragId) {
		const others = [...document.querySelectorAll("[data-cat-id]")].filter((el) => el.dataset.catId && el.dataset.catId !== dragId);
		for (let i = 0; i < others.length; i++) {
			const r = (others[i].querySelector("[data-cat-handle]") ?? others[i].querySelector("h2") ?? others[i]).getBoundingClientRect();
			if (clientY < r.top + r.height / 2) return i;
		}
		return others.length;
	}
	const picker = {
		token,
		library: data.customIcons ?? [],
		online: Boolean(data.settings.onlineIcons),
		navRichIcons: Boolean(data.settings.navRichIcons),
		onLibrary: (customIcons) => setData({
			...data,
			customIcons
		})
	};
	useEffect(() => {
		const loc = asLocale(data.settings?.locale);
		setLocale(loc);
		setDateFormat(data.settings?.dateFormat);
		document.documentElement.lang = loc;
		const name = String(data.settings.documentTitle || "").trim() || "Dockit";
		document.title = name;
		const raw = String(data.settings.favicon || "").trim() || "/favicon.svg";
		const href = raw.startsWith("data:") ? raw : `${raw}${raw.includes("?") ? "&" : "?"}v=${PORTAL_VERSION}`;
		document.querySelectorAll("link[rel='icon'], link[rel='shortcut icon']").forEach((el) => el.remove());
		const link = document.createElement("link");
		link.rel = "icon";
		link.href = href;
		if (raw.startsWith("data:image/svg") || raw.includes(".svg")) link.type = "image/svg+xml";
		else if (raw.startsWith("data:image/png") || raw.includes(".png")) link.type = "image/png";
		else if (raw.startsWith("data:image/webp")) link.type = "image/webp";
		else if (raw.startsWith("data:image/jpeg")) link.type = "image/jpeg";
		else if (raw.includes("image/x-icon") || raw.includes(".ico")) link.type = "image/x-icon";
		document.head.appendChild(link);
	}, [
		data.settings.documentTitle,
		data.settings.favicon,
		data.settings.locale,
		data.settings.dateFormat
	]);
	return /* @__PURE__ */ jsxs("div", {
		className: "min-h-dvh",
		children: [
			" ",
			/* @__PURE__ */ jsx(ThemeCss, {
				light: data.settings.cssLight || "",
				dark: data.settings.cssDark || ""
			}),
			" ",
			data.runtime?.isDev && !hideDevBanner ? /* @__PURE__ */ jsxs("div", {
				className: "security-banner is-dev",
				role: "status",
				children: [
					/* @__PURE__ */ jsx(Bug, { className: "size-3.5 shrink-0" }),
					t("banner.dev"),
					/* @__PURE__ */ jsx("button", {
						type: "button",
						className: "banner-close",
						"aria-label": t("actions.close"),
						onClick: () => setHideDevBanner(true),
						children: /* @__PURE__ */ jsx(X, { strokeWidth: 2.75 })
					})
				]
			}) : null,
			session?.mustChangePassword ? /* @__PURE__ */ jsxs("div", {
				className: "security-banner",
				role: "status",
				children: [
					/* @__PURE__ */ jsx(AlertTriangle, { className: "size-3.5 shrink-0" }),
					t("banner.weakPassword")
				]
			}) : null,
			data.runtime?.isDev && data.settings.devAdminNoPassword && !hideNoPassBanner ? /* @__PURE__ */ jsxs("div", {
				className: "security-banner",
				role: "status",
				children: [
					/* @__PURE__ */ jsx(AlertTriangle, { className: "size-3.5 shrink-0" }),
					t("banner.noPassword"),
					/* @__PURE__ */ jsx("button", {
						type: "button",
						className: "banner-close",
						"aria-label": t("actions.close"),
						onClick: () => setHideNoPassBanner(true),
						children: /* @__PURE__ */ jsx(X, { strokeWidth: 2.75 })
					})
				]
			}) : null,
			/* @__PURE__ */ jsxs("header", {
				className: "sticky top-0 z-20 border-b border-border bg-header",
				children: [
					" ",
					/* @__PURE__ */ jsxs("div", {
						className: "mx-auto flex min-w-0 max-w-6xl items-center gap-2 px-4 py-3 sm:gap-3 sm:px-6",
						children: [
							" ",
							/* @__PURE__ */ jsxs("div", {
								className: "flex min-w-0 items-center gap-3",
								children: [
									" ",
									/* @__PURE__ */ jsx("div", {
										className: "flex size-10 shrink-0 items-center justify-center",
										children: data.settings.logo ? /* @__PURE__ */ jsx("img", {
											src: data.settings.logo,
											alt: "",
											className: "size-10 object-contain"
										}) : /* @__PURE__ */ jsx(DockitMark, { className: "dockit-mark size-9" })
									}),
									" ",
									/* @__PURE__ */ jsxs("div", {
										className: "hidden min-w-0 sm:block sm:max-w-72",
										children: [
											" ",
											/* @__PURE__ */ jsx("h1", {
												className: "truncate text-base font-semibold tracking-tight",
												children: data.settings.title
											}),
											" ",
											/* @__PURE__ */ jsx("p", {
												className: "hidden truncate text-xs text-muted sm:block",
												children: data.settings.subtitle || "Pin your URLs"
											})
										]
									})
								]
							}),
							" ",
							/* @__PURE__ */ jsxs("div", {
								className: "search-box relative flex min-h-10 min-w-0 flex-1 items-center rounded-lg border border-border bg-surface pl-9",
								children: [
									/* @__PURE__ */ jsx(Search, { className: "pointer-events-none absolute left-3 size-4 text-muted" }),
									/* @__PURE__ */ jsx("input", {
										ref: searchRef,
										className: "h-10 min-w-[6rem] flex-1 bg-transparent text-sm outline-none placeholder:text-subtle",
										value: query,
										onChange: (e) => {
											setQuery(e.target.value);
											setTagHi(0);
										},
										onKeyDown: (e) => {
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
											if (e.key === "Backspace" && !query && tagFilter.length) setTagFilter((cur) => cur.slice(0, -1));
										},
										placeholder: tagFilter.length ? t("nav.addTagOrName") : t("nav.search"),
										title: t("nav.searchTitle"),
										type: "search",
										autoComplete: "off",
										role: "combobox",
										"aria-autocomplete": "list",
										"aria-expanded": tagMatches.length > 0
									}),
									tagFilter.length || downFilter ? /* @__PURE__ */ jsxs("div", {
										className: "search-tags",
										children: [downFilter ? /* @__PURE__ */ jsxs("button", {
											type: "button",
											className: "tag-chip is-on stats-hs-chip",
											title: t("info.removeHs"),
											onClick: () => setDownFilter(false),
											children: [t("info.hs"), /* @__PURE__ */ jsx(X, { className: "ml-0.5 size-2.5" })]
										}) : null, tagFilter.map((name) => {
											const paint = tagPaint(name, data.settings.tagColors);
											return /* @__PURE__ */ jsxs("button", {
												type: "button",
												"data-tone": paint.tone,
												style: paint.style,
												className: "tag-chip is-on",
												title: `Retirer ${name}`,
												onClick: () => toggleTag(name),
												children: [name, /* @__PURE__ */ jsx(X, { className: "ml-0.5 size-2.5" })]
											}, name);
										})]
									}) : null,
									tagMatches.length > 0 ? /* @__PURE__ */ jsx("div", {
										className: "search-suggest",
										role: "listbox",
										children: tagMatches.map((t, i) => {
											const paint = tagPaint(t.name, data.settings.tagColors);
											const hi = tagMatches.length ? tagHi % tagMatches.length : 0;
											return /* @__PURE__ */ jsxs("button", {
												type: "button",
												role: "option",
												"aria-selected": i === hi,
												className: i === hi ? "is-hi" : "",
												onMouseDown: (e) => {
													e.preventDefault();
													applyTagFromSearch(t.name);
												},
												children: [/* @__PURE__ */ jsx("span", {
													"data-tone": paint.tone,
													style: paint.style,
													className: "tag-chip",
													children: t.name
												}), /* @__PURE__ */ jsx("span", {
													className: "text-xs text-muted",
													children: t.count
												})]
											}, t.name);
										})
									}) : null
								]
							}),
							/* @__PURE__ */ jsxs("div", {
								className: "flex shrink-0 items-center gap-0.5",
								children: [
									" ",
									/* @__PURE__ */ jsx(ThemeToggle, {}),
									/* @__PURE__ */ jsx(AccountMenu, {
										loggedIn: Boolean(token || session),
										editMode,
										canEdit: Boolean(session?.canEdit),
										canOpenSettings: Boolean(session?.canManageSettings),
										role: session?.role || "",
										openFavs: ui.openFavs,
										onLogin: () => requestLogin(),
										onEdit: () => requestEdit(),
										onSettings: () => requestAdmin("general"),
										canManageUsers: Boolean(session?.canManageUsers),
										canHistory: Boolean(session?.canAudit || session?.canRestore),
										onHistory: () => requestHistory(),
										onUsers: () => requestUsers(),
										onOpenFavs: setOpenFavs,
										onResetLocal: resetLocalPrefs,
										onLogout: logoutEdit
									}),
									editMode ? /* @__PURE__ */ jsxs(Button, {
										variant: "default",
										size: "sm",
										onClick: () => requestEdit(),
										children: [/* @__PURE__ */ jsx(Check, { className: "size-4" }), /* @__PURE__ */ jsx("span", {
											className: "hidden sm:inline",
											children: t("nav.done")
										})]
									}) : null
								]
							})
						]
					}),
					displayTabs.length > 0 && /* @__PURE__ */ jsxs("div", {
						ref: tabListRef,
						className: "tab-row",
						children: [
							" ",
							/* @__PURE__ */ jsxs("button", {
								type: "button",
								onClick: () => {
									if (didDragRef.current) {
										didDragRef.current = false;
										return;
									}
									setPage("favs");
								},
								className: `tab-item ${onFavs ? "is-on" : ""} ${data.settings.favsHideLabel ? "is-icon" : ""}`,
								"aria-pressed": onFavs,
								"aria-label": t("nav.favorites"),
								title: t("nav.favorites"),
								children: [
									/* @__PURE__ */ jsx(Star, {
										className: "tab-ico",
										fill: onFavs || favCount > 0 ? "currentColor" : "none"
									}),
									data.settings.favsHideLabel ? null : /* @__PURE__ */ jsx("span", { children: t("nav.favorites") }),
									favCount > 0 ? /* @__PURE__ */ jsx("span", {
										className: "count-chip",
										"data-tone": tagTone(t("nav.favorites")),
										children: favCount
									}) : null,
									editMode && onFavs && session?.canEdit ? /* @__PURE__ */ jsx("span", {
										className: "ml-0.5 flex gap-0.5",
										"data-tab-action": "",
										onClick: (e) => e.stopPropagation(),
										onPointerDown: (e) => e.stopPropagation(),
										children: /* @__PURE__ */ jsx("span", {
											role: "button",
											className: "card-tool",
											"aria-label": t("aria.editSpace"),
											onClick: () => setModal({ kind: "favs" }),
											children: /* @__PURE__ */ jsx(Pencil, { className: "size-3" })
										})
									}) : null
								]
							}),
							displayTabs.map((tab, tabIndex) => /* @__PURE__ */ jsxs("button", {
								type: "button",
								"data-tab-id": tab.id,
								onClick: () => {
									if (didDragRef.current) {
										didDragRef.current = false;
										return;
									}
									goTab(tab.id);
								},
								onPointerDown: (e) => {
									if (!canReorderTabs) return;
									if (e.target.closest("[data-tab-action]")) return;
									lockSelection(e);
									didDragRef.current = false;
									dragOriginRef.current = {
										x: e.clientX,
										y: e.clientY
									};
									writeEditMode(true);
									setDrag({
										kind: "tab",
										id: tab.id
									});
									tabInsertRef.current = tabIndex;
									setOver({
										kind: "tab",
										insertAt: tabIndex
									});
									bindTabDrag(tab.id);
								},
								className: `tab-item ${canReorderTabs ? "cursor-grab touch-none active:cursor-grabbing" : ""} ${drag?.kind === "tab" && drag.id === tab.id ? "is-src" : ""} ${carryDestTabId === tab.id ? "is-drop" : ""} ${tab.id === data.activeTabId && page !== "favs" ? "is-on" : searching && searchHits.some((h) => h.id === tab.id) ? "text-fg" : searching ? "text-subtle" : ""} ${tab.hideLabel ? "is-icon" : ""}`,
								title: tab.name,
								"aria-label": tab.name,
								children: [
									canReorderTabs ? /* @__PURE__ */ jsx(GripVertical, {
										className: "tab-ico text-subtle",
										"aria-hidden": true
									}) : null,
									/* @__PURE__ */ jsx(PortalIcon, {
										name: tab.icon,
										className: "tab-ico"
									}),
									tab.hideLabel ? null : tab.name,
									tab.restricted ? /* @__PURE__ */ jsx(Lock, {
										className: "tab-ico text-muted",
										"aria-label": t("aria.restrictedTab")
									}) : null,
									editMode && tab.id === data.activeTabId && (session?.role === "admin" || session?.tabPerms?.[tab.id] === "edit") && /* @__PURE__ */ jsxs("span", {
										className: "ml-1 flex gap-0.5",
										"data-tab-action": "",
										onClick: (e) => e.stopPropagation(),
										onPointerDown: (e) => e.stopPropagation(),
										children: [
											" ",
											(session?.role === "admin" || session?.canCreateTabs) ? /* @__PURE__ */ jsxs("span", {
												role: "button",
												className: "card-tool",
												"aria-label": t("aria.duplicateSpace"),
												title: t("aria.duplicateSpace"),
												onClick: () => duplicateSpace(tab),
												children: [" ", /* @__PURE__ */ jsx(Copy, { className: "size-3" })]
											}) : null,
											/* @__PURE__ */ jsxs("span", {
												role: "button",
												className: "card-tool",
												"aria-label": t("aria.editSpace"),
												onClick: () => setModal({
													kind: "tab",
													tab
												}),
												children: [" ", /* @__PURE__ */ jsx(Pencil, { className: "size-3" })]
											}),
											data.tabs.length > 1 && /* @__PURE__ */ jsxs("span", {
												role: "button",
												className: "card-tool is-danger",
												"aria-label": t("aria.deleteSpace"),
												onClick: () => setModal({
													kind: "confirm-tab",
													tab
												}),
												children: [" ", /* @__PURE__ */ jsx(Trash2, { className: "size-3" })]
											})
										]
									})
								]
							}, tab.id)),
							editMode && (session?.role === "admin" || session?.canCreateTabs) && /* @__PURE__ */ jsxs("button", {
								type: "button",
								onClick: () => setModal({ kind: "tab" }),
								className: "flex h-10 shrink-0 items-center gap-1 border-b-2 border-transparent px-3 text-sm text-muted hover:text-fg",
								children: [
									" ",
									/* @__PURE__ */ jsx(Plus, { className: "size-4" }),
									t("nav.space")
								]
							})
						]
					})
				]
			}),
			" ",
			/* @__PURE__ */ jsx("main", {
				className: `mx-auto max-w-6xl px-4 py-10 sm:px-6 ${data.settings.infoBar !== false ? "pb-16" : ""}`,
				children: onFavs ? /* @__PURE__ */ jsx("div", { children: favGroups.length === 0 ? /* @__PURE__ */ jsxs("div", {
					className: "empty-page",
					children: [
						/* @__PURE__ */ jsx("div", {
							className: "empty-page-mark",
							children: /* @__PURE__ */ jsx(Star, { className: "size-7" })
						}),
						/* @__PURE__ */ jsx("p", { children: t("empty.favs") })
					]
				}) : /* @__PURE__ */ jsx("div", {
					className: "space-y-12",
					children: favGroups.map((group) => /* @__PURE__ */ jsxs("section", {
						className: "cat-section",
						children: [/* @__PURE__ */ jsx("div", {
							className: "cat-head",
							children: /* @__PURE__ */ jsxs("div", {
								className: "cat-head-main",
								children: [
									/* @__PURE__ */ jsxs("button", {
										type: "button",
										onClick: () => goTab(group.tab.id),
										className: "flex min-w-0 items-center gap-3 text-muted hover:text-fg",
										children: [/* @__PURE__ */ jsx("span", {
											className: "portal-mark flex size-9 items-center justify-center rounded-lg text-fg",
											children: /* @__PURE__ */ jsx(PortalIcon, {
												name: group.tab.icon,
												className: "size-4"
											})
										}), /* @__PURE__ */ jsx("span", {
											className: "truncate text-xl font-semibold tracking-tight",
											children: group.tab.name
										})]
									}),
									/* @__PURE__ */ jsx("span", {
										className: "text-subtle",
										children: "/"
									}),
									/* @__PURE__ */ jsx("span", {
										className: "portal-mark flex size-9 items-center justify-center rounded-lg text-fg",
										children: /* @__PURE__ */ jsx(PortalIcon, {
											name: group.cat.icon,
											className: "size-4"
										})
									}),
									/* @__PURE__ */ jsx("h2", {
										className: "truncate text-xl font-semibold tracking-tight",
										children: group.cat.name
									}),
									data.settings.catCounts ? /* @__PURE__ */ jsx("span", {
										className: "count-chip",
										"data-tone": tagTone(group.cat.name),
										children: group.apps.length
									}) : null
								]
							})
						}), /* @__PURE__ */ jsx("div", {
							className: ITEM_GRID,
							children: group.apps.map((app) => /* @__PURE__ */ jsx(AppCard, {
								app,
								editMode: false,
								className: itemSpanClass(app),
								onTag: toggleTag,
								activeTags: tagFilter,
								tagColors: data.settings.tagColors,
								health: data.settings.healthChecks ? health[app.id] : void 0,
								healthPending: data.settings.healthChecks && app.check !== "off" && !health[app.id],
								showHealth: data.settings.healthChecks,
								showClicks: data.settings.usageStats,
								favorite: favSet.has(app.id),
								onFavorite: allowsFavorite(app, data.settings) ? () => toggleFav(app.id) : void 0,
								onRecheck: () => void recheckApp(app),
								onOpen: () => bumpClick(app),
								dimMenu: Boolean(data.settings.annexFade),
								onEdit: () => void 0,
								onDelete: () => void 0
							}, app.id))
						})]
					}, `${group.tab.id}:${group.cat.id}`))
				}) }) : (searching ? filtered.length === 0 : editMode ? filtered.length === 0 : !displayCategories.some((c) => c.apps.length)) ? searching ? /* @__PURE__ */ jsxs("p", {
					className: "py-16 text-center text-sm text-muted",
					children: [
						t("empty.noResults"),
						query.trim() ? t("empty.forQuery", { q: query.trim() }) : "",
						tagFilter.length ? t(tagFilter.length > 1 ? "empty.withTags" : "empty.withTag", { tags: tagFilter.join(" + ") }) : "",
						downFilter ? t("empty.amongDown") : ""
					]
				}) : editMode ? /* @__PURE__ */ jsx(EmptyState, {
					editMode: canEditActive,
					onAdd: canEditActive ? () => setModal({ kind: "category" }) : void 0
				}) : null : searching ? /* @__PURE__ */ jsxs("div", {
					className: "space-y-14",
					children: [
						" ",
						/* @__PURE__ */ jsxs("p", {
							className: "text-sm text-muted",
							children: [
								tp("empty.hits", searchHits.reduce((n, tab) => n + tab.categories.reduce((m, c) => m + c.apps.length, 0), 0)),
								" ",
								tp("empty.inSpaces", searchHits.length)
							]
						}),
						searchHits.map((tab) => /* @__PURE__ */ jsxs("div", {
							className: "space-y-10",
							children: [
								" ",
								/* @__PURE__ */ jsxs("button", {
									type: "button",
									onClick: () => goTab(tab.id),
									className: "flex items-center gap-2 text-sm font-medium text-muted hover:text-fg",
									children: [
										" ",
										/* @__PURE__ */ jsx(PortalIcon, {
											name: tab.icon,
											className: "size-4"
										}),
										tab.name,
										" ",
										/* @__PURE__ */ jsx("span", {
											className: "count-chip",
											"data-tone": tagTone(tab.name),
											children: tab.categories.reduce((n, c) => n + c.apps.length, 0)
										})
									]
								}),
								tab.categories.map((cat) => /* @__PURE__ */ jsxs("section", {
									className: "cat-section",
									children: [/* @__PURE__ */ jsxs("div", {
										className: "cat-head",
										children: [/* @__PURE__ */ jsxs("div", {
											className: "cat-head-main",
											children: [
												/* @__PURE__ */ jsx("span", {
													className: "portal-mark flex size-9 items-center justify-center rounded-lg text-fg",
													children: /* @__PURE__ */ jsx(PortalIcon, {
														name: cat.icon,
														className: "size-4"
													})
												}),
												/* @__PURE__ */ jsx("h2", {
													className: "truncate text-xl font-semibold tracking-tight",
													children: cat.name
												}),
												data.settings.catCounts ? /* @__PURE__ */ jsx("span", {
													className: "count-chip",
													"data-tone": tagTone(cat.name),
													children: cat.apps.length
												}) : null
											]
										}), editMode && canEditTab(tab.id) ? /* @__PURE__ */ jsxs("div", {
											className: "flex items-center gap-1",
											children: [
												/* @__PURE__ */ jsxs("button", {
													type: "button",
													className: "card-tool",
													"aria-label": t("aria.editCategory"),
													onClick: () => setModal({
														kind: "category",
														category: cat
													}),
													children: [" ", /* @__PURE__ */ jsx(Pencil, { className: "size-3.5" })]
												}),
												/* @__PURE__ */ jsxs("button", {
													type: "button",
													className: "card-tool",
													"aria-label": t("access.moveSection"),
													onClick: () => setModal({
														kind: "move-pick",
														category: cat,
														fromTabId: tab.id
													}),
													children: [" ", /* @__PURE__ */ jsx(ArrowRightLeft, { className: "size-3.5" })]
												}),
												/* @__PURE__ */ jsxs("button", {
													type: "button",
													className: "card-tool",
													"aria-label": t("aria.addBlock"),
													onClick: () => setModal({
														kind: "app",
														categoryId: cat.id
													}),
													children: [" ", /* @__PURE__ */ jsx(Plus, { className: "size-3.5" })]
												}),
												/* @__PURE__ */ jsxs("button", {
													type: "button",
													className: "card-tool is-danger",
													"aria-label": t("aria.deleteCategory"),
													onClick: () => setModal({
														kind: "confirm-cat",
														category: cat
													}),
													children: [" ", /* @__PURE__ */ jsx(Trash2, { className: "size-3.5" })]
												})
											]
										}) : null]
									}), /* @__PURE__ */ jsx("div", {
										className: ITEM_GRID,
										children: cat.apps.map((app) => /* @__PURE__ */ jsx(AppCard, {
											app,
											editMode: editMode && canEditTab(tab.id),
											className: itemSpanClass(app),
											onTag: toggleTag,
											activeTags: tagFilter,
											tagColors: data.settings.tagColors,
											health: data.settings.healthChecks ? health[app.id] : void 0,
											healthPending: data.settings.healthChecks && app.check !== "off" && !health[app.id],
											showHealth: data.settings.healthChecks,
											showClicks: data.settings.usageStats,
											favorite: favSet.has(app.id),
											onFavorite: editMode ? void 0 : allowsFavorite(app, data.settings) ? () => toggleFav(app.id) : void 0,
											onRecheck: () => void recheckApp(app),
											onOpen: () => bumpClick(app),
											dimMenu: Boolean(data.settings.annexFade),
											onEdit: () => setModal({
												kind: "app",
												categoryId: cat.id,
												app
											}),
											onDuplicate: () => duplicateApp(app, cat.id),
											onDelete: () => setModal({
												kind: "confirm-app",
												app
											})
										}, app.id))
									})]
								}, cat.id))
							]
						}, tab.id))
					]
				}) : /* @__PURE__ */ jsxs("div", {
					className: drag?.kind === "cat" ? "space-y-3" : "space-y-12",
					children: [displayCategories.map((cat, catIndex) => {
						if (!editMode && cat.apps.length === 0) return null;
						if (drag?.kind === "cat" && drag.id === cat.id) return /* @__PURE__ */ jsx("div", {
							"data-cat-id": cat.id,
							className: "drop-slot drop-slot-cat",
							children: /* @__PURE__ */ jsx("span", {
								className: "drop-slot-label",
								children: t("nav.dropHere")
							})
						}, cat.id);
						const collapsed = !searching && collapsedSet.has(cat.id);
						return /* @__PURE__ */ jsxs("section", {
							"data-cat-id": cat.id,
							className: `cat-section${drag?.kind === "app" && over?.kind === "app" && over.catId === cat.id ? " is-drop" : ""}`,
							children: [/* @__PURE__ */ jsxs("div", {
								className: `cat-head ${collapsed ? "is-collapsed" : ""}`,
								children: [/* @__PURE__ */ jsxs("div", {
									"data-cat-handle": "",
									className: `cat-head-main select-none ${canDrag ? "cursor-grab touch-none active:cursor-grabbing" : "cursor-pointer"}`,
									onClick: () => {
										if (canDrag || didDragRef.current) return;
										toggleCollapsed(cat.id);
									},
									onPointerDown: (e) => {
										if (!canDrag) return;
										lockSelection(e);
										didDragRef.current = false;
										dragOriginRef.current = {
											x: e.clientX,
											y: e.clientY
										};
										writeEditMode(true);
										bindCatDrag(cat.id, e.currentTarget.closest(".cat-head") || e.currentTarget.closest("[data-cat-id]") || e.currentTarget);
										setDrag({
											kind: "cat",
											id: cat.id
										});
										setOver({
											kind: "cat",
											insertAt: catIndex
										});
									},
									children: [
										canDrag ? /* @__PURE__ */ jsx(GripVertical, {
											className: "size-4 shrink-0 text-subtle",
											"aria-hidden": true
										}) : null,
										" ",
										/* @__PURE__ */ jsxs("span", {
											className: "portal-mark flex size-9 items-center justify-center rounded-lg text-fg",
											children: [" ", /* @__PURE__ */ jsx(PortalIcon, {
												name: cat.icon,
												className: "size-4"
											})]
										}),
										" ",
										/* @__PURE__ */ jsx("h2", {
											className: "truncate text-xl font-semibold tracking-tight",
											children: cat.name
										}),
										" ",
										data.settings.catCounts ? /* @__PURE__ */ jsx("span", {
											className: "count-chip",
											"data-tone": tagTone(cat.name),
											children: cat.apps.length
										}) : null
									]
								}), /* @__PURE__ */ jsxs("div", {
									className: "flex items-center gap-1",
									children: [/* @__PURE__ */ jsx(Button, {
										type: "button",
										variant: "ghost",
										size: "icon-sm",
										"aria-label": collapsed ? t("cat.expand") : t("cat.collapse"),
										"aria-expanded": !collapsed,
										onClick: (e) => {
											e.preventDefault();
											e.stopPropagation();
											toggleCollapsed(cat.id);
										},
										onPointerDown: (e) => e.stopPropagation(),
										children: /* @__PURE__ */ jsx(ChevronDown, { className: `size-4 text-muted transition-transform ${collapsed ? "-rotate-90" : ""}` })
									}), editMode && canEditActive && /* @__PURE__ */ jsxs(Fragment, { children: [
										/* @__PURE__ */ jsxs("button", {
											type: "button",
											className: "card-tool",
											"aria-label": t("aria.editCategory"),
											onClick: () => setModal({
												kind: "category",
												category: cat
											}),
											children: [" ", /* @__PURE__ */ jsx(Pencil, { className: "size-3.5" })]
										}),
										" ",
										/* @__PURE__ */ jsxs("button", {
											type: "button",
											className: "card-tool",
											"aria-label": t("access.moveSection"),
											onClick: () => setModal({
												kind: "move-pick",
												category: cat,
												fromTabId: data.activeTabId
											}),
											children: [" ", /* @__PURE__ */ jsx(ArrowRightLeft, { className: "size-3.5" })]
										}),
										" ",
										/* @__PURE__ */ jsxs("button", {
											type: "button",
											className: "card-tool",
											"aria-label": t("aria.addBlock"),
											onClick: () => setModal({
												kind: "app",
												categoryId: cat.id
											}),
											children: [" ", /* @__PURE__ */ jsx(Plus, { className: "size-3.5" })]
										}),
										" ",
										/* @__PURE__ */ jsxs("button", {
											type: "button",
											className: "card-tool is-danger",
											"aria-label": t("aria.deleteCategory"),
											onClick: () => setModal({
												kind: "confirm-cat",
												category: cat
											}),
											children: [" ", /* @__PURE__ */ jsx(Trash2, { className: "size-3.5" })]
										})
									] })]
								})]
							}), collapsed || drag?.kind === "cat" ? null : cat.apps.length === 0 ? /* @__PURE__ */ jsxs("p", {
								className: "empty-well flex items-center justify-center gap-1 px-4 py-8 text-center text-sm text-muted",
								children: canDrag ? [
									t("empty.noCardsDrop"),
									" ",
									/* @__PURE__ */ jsx(Plus, { className: "size-3.5" })
								] : t("empty.noCardsAdd")
							}) : /* @__PURE__ */ jsx("div", {
								"data-app-grid": "",
								className: ITEM_GRID,
								children: cat.apps.map((app) => /* @__PURE__ */ jsx(AppCard, {
									app,
									editMode: editMode && canEditActive,
									canDrag,
									dragging: drag?.kind === "app" && drag.id === app.id,
									className: itemSpanClass(app),
									onTag: toggleTag,
									activeTags: tagFilter,
									tagColors: data.settings.tagColors,
									health: data.settings.healthChecks ? health[app.id] : void 0,
									healthPending: data.settings.healthChecks && app.check !== "off" && !health[app.id],
									showHealth: data.settings.healthChecks,
									showClicks: data.settings.usageStats,
									favorite: favSet.has(app.id),
									onFavorite: editMode ? void 0 : allowsFavorite(app, data.settings) ? () => toggleFav(app.id) : void 0,
									onRecheck: () => void recheckApp(app),
									onOpen: () => bumpClick(app),
									dimMenu: Boolean(data.settings.annexFade),
									onPointerDown: (e) => {
										if (!canDrag) return;
										if (e.target.closest("button")) return;
										lockSelection(e);
										didDragRef.current = false;
										dragOriginRef.current = {
											x: e.clientX,
											y: e.clientY
										};
										writeEditMode(true);
										carryRef.current = {
											app: {
												...app
											},
											fromTabId: dataRef.current.activeTabId
										};
										setDrag({
											kind: "app",
											id: app.id
										});
										const from = dataRef.current.categories.find((c) => c.apps.some((a) => a.id === app.id));
										setOver({
											kind: "app",
											catId: from?.id ?? cat.id,
											insertAt: from?.apps.findIndex((a) => a.id === app.id) ?? 0
										});
										bindAppDrag(app.id, e.currentTarget);
									},
									onEdit: () => setModal({
										kind: "app",
										categoryId: cat.id,
										app
									}),
									onDuplicate: () => duplicateApp(app, cat.id),
									onDelete: () => setModal({
										kind: "confirm-app",
										app
									})
								}, app.id))
							})]
						}, cat.id);
					}), editMode && canEditActive && !searching ? /* @__PURE__ */ jsx(EmptyState, {
						editMode: true,
						compact: true,
						onAdd: () => setModal({ kind: "category" })
					}) : null]
				})
			}),
			/* @__PURE__ */ jsx(StatsBar, {
				stats: clickStats,
				infoBar: data.settings.infoBar !== false,
				downCount: data.settings.infoBar !== false && data.settings.healthChecks !== false ? downIds.length : 0,
				downOn: downFilter,
				probeBlink: Boolean(data.settings.probeBlink),
				onDown: () => setDownFilter((v) => !v),
				onStats: data.settings.infoBar !== false && data.settings.infoStats !== false ? () => setModal({ kind: "stats" }) : null
			}),
			modal.kind !== "none" && /* @__PURE__ */ jsxs(ModalShell, {
				wide: modal.kind === "admin" || modal.kind === "stats" || modal.kind === "app" || modal.kind === "history" || modal.kind === "users" || modal.kind === "tab" || modal.kind === "category",
				onClose: () => {
					setBusy(false);
					setModal({ kind: "none" });
				},
				children: [
					modal.kind === "lock" && /* @__PURE__ */ jsx(LockForm, {
						busy,
						oidcEnabled: Boolean(data.settings.oidcEnabled),
						oidcLabel: data.settings.oidcLabel || "SSO",
						ldapEnabled: Boolean(data.settings.ldapEnabled),
						ldapDomain: data.settings.ldapDomain || "",
						loginOrder: data.settings.loginOrder,
						noPassword: Boolean(data.runtime?.isDev && data.settings.devAdminNoPassword),
						onCancel: () => setModal({ kind: "none" }),
						onOidc: async () => {
							setBusy(true);
							try {
								try {
									sessionStorage.setItem(OIDC_NEXT_KEY, modal.next || "session");
								} catch {}
								const res = await startOidc({ data: {} });
								if (!res?.url) throw new Error("errors.oidcFail");
								window.location.assign(res.url);
							} catch (err) {
								toast.error(te(err));
								setBusy(false);
							}
						},
						onUnlock: async (username, password, domain) => {
							setBusy(true);
							try {
								const res = await Promise.race([unlockEdit({ data: {
									username,
									password,
									domain: domain === "ad" ? "ad" : "local"
								} }), new Promise((_, reject) => {
									window.setTimeout(() => reject(/* @__PURE__ */ new Error("errors.timeout")), 12e3);
								})]);
								if (res.sessionHttpOnly) {
									await pinSessCookie(res.token);
									try {
										sessionStorage.removeItem(TOKEN_KEY);
									} catch {}
								} else {
									try {
										sessionStorage.setItem(TOKEN_KEY, res.token);
									} catch {}
								}
								setToken(res.token);
								setSession(res.session);
								writeSessionInfo(res.session);
								const next = await getPortal({ data: {
									token: res.token,
									tabId: data.activeTabId
								} });
								setData(next);
								if (modal.next === "admin") setModal({
									kind: "admin",
									tab: res.session?.canManageSettings ? adminTabRef.current : "about"
								});
								else if (modal.next === "history") setModal({
									kind: "history",
									tab: "recovery"
								});
								else if (modal.next === "users" && res.session?.canManageUsers) setModal({
									kind: "users"
								});
								else if (modal.next === "edit" && res.session?.canEdit) {
									enterEdit();
									setModal({ kind: "none" });
								} else setModal({ kind: "none" });
							} catch (err) {
								toast.error(te(err));
							} finally {
								setBusy(false);
							}
						}
					}),
					modal.kind === "stats" && /* @__PURE__ */ jsx(StatsPanel, {
						catalog: data.catalog,
						onClose: () => setModal({ kind: "none" })
					}),
					modal.kind === "users" && /* @__PURE__ */ jsx(AccessFrame, {
						token,
						session,
						tabs: data.tabs,
						settings: data.settings,
						busy,
						onClose: () => setModal({ kind: "none" }),
						onSaveOidc: (payload) => apply(async () => {
							const next = await updateOidcSettings({ data: {
								token,
								tabId: data.activeTabId,
								...payload
							} });
							toast.success(t("toast.saved"));
							return next;
						}, { close: false }),
						onSaveLdap: (payload) => apply(async () => {
							const next = await updateLdapSettings({ data: {
								token,
								tabId: data.activeTabId,
								...payload
							} });
							toast.success(t("toast.saved"));
							return next;
						}, { close: false }),
						onSaveLoginOrder: (loginOrder) => apply(async () => {
							const next = await updateLoginOrder({ data: {
								token,
								tabId: data.activeTabId,
								loginOrder
							} });
							return next;
						}, { close: false })
					}),
					modal.kind === "history" && /* @__PURE__ */ jsx(HistoryPanel, {
						key: modal.tab || "recovery",
						token,
						tab: modal.tab || "recovery",
						onClose: () => setModal({ kind: "none" }),
						onRestored: (next) => {
							setData(next);
							if (next.session) {
								setSession(next.session);
								writeSessionInfo(next.session);
							}
						}
					}),
					modal.kind === "admin" && /* @__PURE__ */ jsx(AdminPanel, {
						tab: modal.tab,
						settings: data.settings,
						runtime: data.runtime,
						catalog: data.catalog,
						tags: allTags,
						tabs: data.tabs,
						directory: data.directory || [],
						token,
						session,
						busy,
						onTab: (tab) => setModal({
							kind: "admin",
							tab
						}),
						onCancel: () => setModal({ kind: "none" }),
						onSaveSettings: (payload, opts) => apply(() => updateSettings({ data: {
							token,
							tabId: data.activeTabId,
							...payload
						} }), opts),
						onResetClicks: async () => {
							setBusy(true);
							try {
								const next = await resetClicks({ data: {
									token,
									tabId: data.activeTabId
								} });
								setData(next);
								if (next.clickStats) setClickStats(next.clickStats);
								else setClickStats({
									all: 0,
									today: 0,
									week: 0,
									month: 0,
									year: 0,
									spanDays: 0
								});
								toast.success(t("toast.clicksReset"));
							} catch (err) {
								if (sessionGone(err)) return;
								toast.error(te(err));
							} finally {
								setBusy(false);
							}
						},
						onApplyTags: async (payload) => {
							const colorOnly = Boolean(payload.colors) && !payload.rename && !payload.remove && !payload.create;
							if (!colorOnly) setBusy(true);
							try {
								const next = await manageTags({ data: {
									token,
									tabId: data.activeTabId,
									...payload
								} });
								setData(next);
								if (!colorOnly) toast.success(t("toast.tagsUpdated"));
							} catch (err) {
								if (sessionGone(err)) return;
								toast.error(te(err));
							} finally {
								if (!colorOnly) setBusy(false);
							}
						},
						onSaveTheme: (payload) => apply(async () => {
							const next = await updateThemeCss({ data: {
								token,
								tabId: data.activeTabId,
								...payload
							} });
							toast.success(t("toast.themesSaved"));
							return next;
						}, { close: false }),
						onResetPortal: () => apply(async () => {
							const next = await resetPortal({ data: { token } });
							if (next.clickStats) setClickStats(next.clickStats);
							toast.success(t("toast.portalReset"));
							return next;
						}),
						onImportPortal: (payload) => apply(async () => {
							const next = await importPortal({ data: {
								token,
								payload
							} });
							if (next.clickStats) setClickStats(next.clickStats);
							toast.success(t("toast.imported"));
							return next;
						})
					}),
					modal.kind === "tab" && /* @__PURE__ */ jsx(TabForm, {
						initial: modal.tab,
						busy,
						picker,
						canAcl: session?.role === "admin",
						onCancel: () => setModal({ kind: "none" }),
						onSave: (name, icon, access) => apply(() => modal.tab ? updateTab({ data: {
							token,
							id: modal.tab.id,
							name,
							icon,
							...access
						} }) : createTab({ data: {
							token,
							name,
							icon,
							...access
						} })),
						people: data.directory || []
					}),
					modal.kind === "favs" && /* @__PURE__ */ jsx(FavsForm, {
						hideLabel: Boolean(data.settings.favsHideLabel),
						busy,
						onCancel: () => setModal({ kind: "none" }),
						onSave: (hideLabel) => apply(() => updateFavsOptions({ data: {
							token,
							hideLabel,
							tabId: data.activeTabId
						} }))
					}),
					modal.kind === "category" && /* @__PURE__ */ jsx(CategoryForm, {
						initial: modal.category,
						busy,
						picker,
						canAcl: session?.role === "admin",
						people: data.directory || [],
						onCancel: () => setModal({ kind: "none" }),
						onSave: (name, icon, access) => apply(() => modal.category ? updateCategory({ data: {
							token,
							id: modal.category.id,
							name,
							icon,
							...access
						} }) : createCategory({ data: {
							token,
							tabId: data.activeTabId,
							name,
							icon,
							...access
						} }))
					}),
					modal.kind === "app" && /* @__PURE__ */ jsx(AppForm, {
						categories: data.categories,
						categoryId: modal.categoryId,
						catalog: data.catalog,
						initial: modal.app,
						busy,
						picker,
						probes: data.settings.healthChecks !== false,
						knownTags: allTags.map((t) => t.name),
						tagColors: data.settings.tagColors,
						onCancel: () => setModal({ kind: "none" }),
						onSave: (payload) => apply(() => modal.app ? updateApp({ data: {
							token,
							id: modal.app.id,
							...payload
						} }) : createApp({ data: {
							token,
							...payload
						} }))
					}),
					modal.kind === "move-pick" && /* @__PURE__ */ jsx(MovePickDialog, {
						category: modal.category,
						tabs: data.tabs,
						fromTabId: modal.fromTabId,
						busy,
						onCancel: () => setModal({ kind: "none" }),
						onContinue: (destTabId) => openMoveCat(modal.category, modal.fromTabId, destTabId)
					}),
					modal.kind === "move-cat" && /* @__PURE__ */ jsx(MoveSectionDialog, {
						impact: modal.impact,
						busy,
						onCancel: () => setModal({ kind: "none" }),
						onConfirm: () => apply(() => moveCategory({
							data: {
								token,
								categoryId: modal.impact.categoryId,
								destTabId: modal.impact.toId
							}
						}))
					}),
					modal.kind === "confirm-cat" && /* @__PURE__ */ jsx(ConfirmBox, {
						title: t("confirm.deleteCategory"),
						body: t("confirm.deleteCategoryBody", { name: modal.category.name }),
						busy,
						onCancel: () => setModal({ kind: "none" }),
						onConfirm: () => apply(() => deleteCategory({ data: {
							token,
							id: modal.category.id
						} }))
					}),
					modal.kind === "confirm-app" && /* @__PURE__ */ jsx(ConfirmBox, {
						title: itemKind(modal.app.kind).remove,
						body: t("item.removedBody", { name: String(modal.app.title || "").trim() || itemKind(modal.app.kind).option }),
						busy,
						onCancel: () => setModal({ kind: "none" }),
						onConfirm: () => apply(() => deleteApp({ data: {
							token,
							id: modal.app.id
						} }))
					}),
					modal.kind === "confirm-tab" && /* @__PURE__ */ jsx(ConfirmBox, {
						title: t("confirm.deleteSpace"),
						body: t("confirm.deleteSpaceBody", { name: modal.tab.name }),
						busy,
						onCancel: () => setModal({ kind: "none" }),
						onConfirm: () => apply(() => deleteTab({ data: {
							token,
							id: modal.tab.id
						} }))
					})
				]
			})
		]
	});
}
function StatusMark({ result, pending, onRecheck }) {
	const state = pending && !result ? "wait" : result ? result.ok ? "up" : "down" : "wait";
	const label = pending && !result ? t("probe.checking") : result ? `${result.ok ? t("probe.up") : t("probe.down")} · ${td(result.detail)}${result.ms != null ? ` · ${result.ms} ms` : ""}` : t("probe.pending");
	return /* @__PURE__ */ jsx("button", {
		type: "button",
		className: `status-mark is-${state}`,
		title: label,
		"aria-label": label,
		onClick: (e) => {
			e.preventDefault();
			e.stopPropagation();
			onRecheck();
		},
		onPointerDown: (e) => e.stopPropagation()
	});
}
function FavStar({ on, onToggle }) {
	return /* @__PURE__ */ jsxs("button", {
		type: "button",
		className: `fav-star ${on ? "is-on" : ""}`,
		"aria-label": on ? t("fav.remove") : t("fav.add"),
		"aria-pressed": on,
		onClick: (e) => {
			e.preventDefault();
			e.stopPropagation();
			onToggle();
		},
		onPointerDown: (e) => e.stopPropagation(),
		children: [" ", /* @__PURE__ */ jsx(Star, {
			className: "size-3.5",
			fill: on ? "currentColor" : "none"
		})]
	});
}
function AppCard({ app, editMode, canDrag, dragging, className, activeTags, tagColors, health, healthPending, showHealth, showClicks, favorite, onFavorite, onTag, onRecheck, onOpen, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onEdit, onDuplicate, onDelete, dimMenu }) {
	const extra = (app.kind || "app") === "app" ? app.links ?? [] : [];
	const [menu, setMenu] = useState(null);
	const menuRef = useRef(null);
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
		const onKey = (e) => {
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
	if (dragging) return /* @__PURE__ */ jsxs("div", {
		"data-app-id": app.id,
		"data-app-card": "",
		className: `drop-slot ${className ?? ""}`,
		children: [" ", /* @__PURE__ */ jsx("span", {
			className: "drop-slot-label",
			children: t("nav.dropHere")
		})]
	});
	const kind = app.kind || "app";
	const untitled = !String(app.title || "").trim();
	const headless = (kind === "note" || kind === "embed") && untitled;
	const tagRow = kind === "app" ? /* @__PURE__ */ jsxs("div", {
		className: "card-tags",
		children: [(app.tags ?? []).map((tag) => {
			const on = (activeTags ?? []).some((t) => t.toLowerCase() === tag.toLowerCase());
			const paint = tagPaint(tag, tagColors);
			return /* @__PURE__ */ jsxs("button", {
				type: "button",
				"data-tone": paint.tone,
				style: paint.style,
				className: `tag-chip ${on ? "is-on" : ""}`,
				title: on ? `Retirer le filtre ${tag}` : `Ajouter le filtre ${tag}`,
				"aria-pressed": on,
				onClick: (e) => {
					e.preventDefault();
					e.stopPropagation();
					onTag?.(tag);
				},
				onPointerDown: (e) => e.stopPropagation(),
				children: [tag, on ? /* @__PURE__ */ jsx(X, { className: "ml-0.5 size-2.5" }) : null]
			}, tag);
		}), showClicks ? /* @__PURE__ */ jsxs("span", {
			className: "card-clicks",
			title: `${app.clicks || 0} ouverture${(app.clicks || 0) > 1 ? "s" : ""} depuis l’ajout`,
			children: [
				" ",
				/* @__PURE__ */ jsx(MousePointerClick, {
					className: "size-3",
					"aria-hidden": true
				}),
				app.clicks || 0
			]
		}) : null]
	}) : null;
	const star = onFavorite ? /* @__PURE__ */ jsx(FavStar, {
		on: Boolean(favorite),
		onToggle: onFavorite
	}) : null;
	const healthDot = showHealth && app.check && app.check !== "off" ? /* @__PURE__ */ jsx(StatusMark, {
		result: health,
		pending: Boolean(healthPending),
		onRecheck: () => onRecheck?.()
	}) : null;
	const annexHint = extra.length > 1 ? t("annex.hint_other") : t("annex.hint");
	const annexBtn = extra.length ? /* @__PURE__ */ jsx("button", {
		type: "button",
		className: `card-tool${menu ? " is-open" : ""}`,
		"aria-label": extra.length > 1 ? t("annex.others") : t("annex.other"),
		"aria-expanded": Boolean(menu),
		"aria-haspopup": "menu",
		title: annexHint,
		onClick: (e) => {
			e.preventDefault();
			e.stopPropagation();
			const r = e.currentTarget.getBoundingClientRect();
			setMenu({
				x: r.left,
				y: r.bottom + 4
			});
		},
		onPointerDown: (e) => e.stopPropagation(),
		children: /* @__PURE__ */ jsx(Menu, { className: "size-3.5" })
	}) : null;
	const corner = star || healthDot || editMode || annexBtn ? /* @__PURE__ */ jsxs("div", {
		className: "card-corner",
		children: [
			healthDot,
			annexBtn,
			star,
			editMode ? /* @__PURE__ */ jsxs(Fragment, { children: [/* @__PURE__ */ jsx("button", {
				type: "button",
				className: "card-tool",
				"aria-label": t("actions.duplicate"),
				title: t("actions.duplicate"),
				onClick: (e) => {
					e.preventDefault();
					e.stopPropagation();
					onDuplicate?.();
				},
				onPointerDown: (e) => e.stopPropagation(),
				children: /* @__PURE__ */ jsx(Copy, { className: "size-3.5" })
			}), /* @__PURE__ */ jsx("button", {
				type: "button",
				className: "card-tool",
				"aria-label": "Modifier",
				onClick: (e) => {
					e.preventDefault();
					e.stopPropagation();
					onEdit();
				},
				onPointerDown: (e) => e.stopPropagation(),
				children: /* @__PURE__ */ jsx(Pencil, { className: "size-3.5" })
			}), /* @__PURE__ */ jsx("button", {
				type: "button",
				className: "card-tool is-danger",
				"aria-label": t("actions.delete"),
				onClick: (e) => {
					e.preventDefault();
					e.stopPropagation();
					onDelete();
				},
				onPointerDown: (e) => e.stopPropagation(),
				children: /* @__PURE__ */ jsx(Trash2, { className: "size-3.5" })
			})] }) : null
		]
	}) : null;
	const grip = canDrag ? /* @__PURE__ */ jsx(GripVertical, {
		className: "card-grip",
		"aria-hidden": true
	}) : null;
	const appMark = /* @__PURE__ */ jsx("span", {
		className: "portal-mark flex size-11 shrink-0 items-center justify-center rounded-lg p-1.5 text-fg",
		children: /* @__PURE__ */ jsx(PortalIcon, {
			name: app.icon,
			className: "size-7"
		})
	});
	const appCopy = /* @__PURE__ */ jsxs("div", {
		className: "min-w-0 flex-1 pt-0.5",
		children: [/* @__PURE__ */ jsx("h3", {
			className: "truncate font-medium tracking-tight",
			children: app.title
		}), /* @__PURE__ */ jsx("p", {
			className: "mt-0.5 line-clamp-1 text-sm leading-snug text-muted",
			children: app.description
		})]
	});
	let inner;
	if (kind === "note") inner = /* @__PURE__ */ jsxs("div", {
		className: "flex h-full items-start gap-3",
		children: [grip, /* @__PURE__ */ jsxs("div", {
			className: "flex h-full min-h-0 flex-1 flex-col",
			children: [
				String(app.title || "").trim() ? /* @__PURE__ */ jsxs("div", {
					className: "note-title mb-2 flex items-center gap-2 text-muted",
					children: [/* @__PURE__ */ jsx(FileText, { className: "size-4" }), /* @__PURE__ */ jsx("h3", {
						className: "truncate font-medium tracking-tight text-fg",
						children: app.title
					})]
				}) : null,
				/* @__PURE__ */ jsx(NoteBody, { source: app.description }),
				tagRow
			]
		})]
	});
	else if (kind === "embed") inner = /* @__PURE__ */ jsxs("div", {
		className: "flex h-full min-h-0 flex-col",
		children: [
			untitled ? null : /* @__PURE__ */ jsxs("div", {
				className: "mb-3 flex items-center gap-2",
				children: [
					grip,
					/* @__PURE__ */ jsx(AppWindow, { className: "size-4 text-muted" }),
					/* @__PURE__ */ jsx("h3", {
						className: "min-w-0 flex-1 truncate font-medium tracking-tight",
						children: app.title
					})
				]
			}),
			safeAppHref(app.url) ? /* @__PURE__ */ jsx("iframe", {
				title: app.title || t("item.embed.option"),
				src: safeAppHref(app.url),
				className: "min-h-0 w-full flex-1 rounded-lg border border-border bg-elevated",
				sandbox: "allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox",
				referrerPolicy: "no-referrer"
			}) : /* @__PURE__ */ jsx("p", {
				className: "text-sm text-muted",
				children: t("empty.noLinks")
			}),
			tagRow
		]
	});
	else inner = /* @__PURE__ */ jsxs("div", {
		className: "flex h-full min-h-0 flex-col",
		children: [/* @__PURE__ */ jsxs("div", {
			className: "card-main",
			children: [appMark, appCopy]
		}), tagRow]
	});
	const shell = `portal-card group relative flex h-full min-h-0 flex-col rounded-xl bg-surface p-4 ${className ?? ""} ${canDrag ? "cursor-grab touch-none select-none active:cursor-grabbing" : ""} ${corner ? "has-corner" : ""} ${headless ? "is-headless" : ""} ${menu ? "is-ctx-open" : ""}`;
	const onCtx = extra.length ? (e) => {
		e.preventDefault();
		e.stopPropagation();
		setMenu({
			x: e.clientX,
			y: e.clientY
		});
	} : void 0;
	const entries = extra;
	const linkMenu = menu && extra.length && typeof document !== "undefined" ? createPortal(/* @__PURE__ */ jsxs(Fragment, {
		children: [
			/* @__PURE__ */ jsx("div", {
				className: `card-ctx-back${dimMenu ? " is-dim" : ""}`,
				onPointerDown: (e) => {
					e.preventDefault();
					setMenu(null);
				}
			}),
			/* @__PURE__ */ jsxs("div", {
				ref: menuRef,
				className: "card-ctx",
				style: {
					left: menu.x,
					top: menu.y
				},
				role: "menu",
				onPointerDown: (e) => e.stopPropagation(),
				onContextMenu: (e) => e.preventDefault(),
				children: [
					/* @__PURE__ */ jsx("p", {
						className: "menu-title",
						children: extra.length > 1 ? t("annex.others") : t("annex.other")
					}),
					/* @__PURE__ */ jsx("div", { className: "menu-sep" }),
					entries.filter((row) => safeAppHref(row.url)).map((row) => /* @__PURE__ */ jsxs("a", {
						href: safeAppHref(row.url),
						target: app.openIn === "_self" ? "_self" : "_blank",
						rel: app.openIn === "_self" ? void 0 : "noopener noreferrer",
						role: "menuitem",
						title: row.url,
						onClick: () => {
							setMenu(null);
							onOpen?.();
						},
						children: [
							/* @__PURE__ */ jsx(Link, {
								className: "size-4 shrink-0",
								"aria-hidden": true
							}),
							/* @__PURE__ */ jsx("span", {
								className: "min-w-0 truncate",
								children: row.title
							})
						]
					}, `${row.title}:${row.url}`))
				]
			})
		]
	}), document.body) : null;
	const href = safeAppHref(app.url);
	if (kind === "app" && !editMode) return /* @__PURE__ */ jsxs("div", {
		"data-app-id": app.id,
		className: shell,
		onContextMenu: onCtx,
		children: [
			href ? /* @__PURE__ */ jsx("a", {
				href,
				target: app.openIn === "_self" ? "_self" : "_blank",
				rel: app.openIn === "_self" ? void 0 : "noopener noreferrer",
				className: "card-hit",
				"aria-label": app.title,
				onClick: () => onOpen?.(),
				onAuxClick: (e) => {
					if (e.button === 1) onOpen?.();
				}
			}) : null,
			/* @__PURE__ */ jsxs("div", {
				className: "card-main",
				children: [appMark, appCopy]
			}),
			corner,
			tagRow,
			linkMenu
		]
	});
	return /* @__PURE__ */ jsxs("div", {
		"data-app-id": app.id,
		"data-app-card": "",
		onPointerDown,
		onPointerMove,
		onPointerUp,
		onPointerCancel,
		onContextMenu: onCtx,
		className: shell,
		children: [
			kind === "app" || kind === "embed" && untitled ? grip : null,
			corner,
			inner,
			linkMenu
		]
	});
}
function EmptyState({ editMode, onAdd, compact }) {
	return /* @__PURE__ */ jsxs("div", {
		className: `empty-page${compact ? " is-compact" : ""}`,
		children: [
			/* @__PURE__ */ jsx("div", {
				className: "empty-page-mark",
				children: /* @__PURE__ */ jsx(Layers, { className: "size-7" })
			}),
			/* @__PURE__ */ jsx("p", {
				children: compact || editMode ? t("empty.categoryLead") : t("empty.noApps")
			}),
			editMode && onAdd ? /* @__PURE__ */ jsxs(Button, {
				className: "empty-page-action",
				onClick: onAdd,
				children: [
					/* @__PURE__ */ jsx(Plus, { className: "size-4" }),
					t("empty.addCategory")
				]
			}) : null
		]
	});
}
function ModalShell({ children, onClose, wide }) {
	const dialogRef = useRef(null);
	useEffect(() => {
		const html = document.documentElement;
		const body = document.body;
		const scrollY = window.scrollY;
		const prev = {
			htmlOverflow: html.style.overflow,
			bodyOverflow: body.style.overflow,
			bodyPosition: body.style.position,
			bodyTop: body.style.top,
			bodyLeft: body.style.left,
			bodyRight: body.style.right,
			bodyWidth: body.style.width,
			bodyPad: body.style.paddingRight
		};
		const sb = window.innerWidth - html.clientWidth;
		html.classList.add("modal-open");
		html.style.overflow = "hidden";
		body.style.overflow = "hidden";
		body.style.position = "fixed";
		body.style.top = `-${scrollY}px`;
		body.style.left = "0";
		body.style.right = "0";
		body.style.width = "100%";
		if (sb > 0) body.style.paddingRight = `${sb}px`;
		const canScroll = (el) => {
			const oy = getComputedStyle(el).overflowY;
			return (oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 1;
		};
		const insideScrollable = (target, deltaY) => {
			let n = target instanceof Element ? target : null;
			while (n && n !== document.body && n !== document.documentElement) {
				if (canScroll(n)) {
					const top = n.scrollTop;
					const max = n.scrollHeight - n.clientHeight;
					if (deltaY < 0 && top > 0 || deltaY > 0 && top < max) return true;
					if (deltaY === 0) return true;
				}
				n = n.parentElement;
			}
			return false;
		};
		const onWheel = (e) => {
			if (!insideScrollable(e.target, e.deltaY)) e.preventDefault();
		};
		const onTouchMove = (e) => {
			if (!insideScrollable(e.target, 0)) e.preventDefault();
		};
		window.addEventListener("wheel", onWheel, { passive: false });
		window.addEventListener("touchmove", onTouchMove, { passive: false });
		const onKey = (e) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => {
			window.removeEventListener("wheel", onWheel);
			window.removeEventListener("touchmove", onTouchMove);
			window.removeEventListener("keydown", onKey);
			html.classList.remove("modal-open");
			html.style.overflow = prev.htmlOverflow;
			body.style.overflow = prev.bodyOverflow;
			body.style.position = prev.bodyPosition;
			body.style.top = prev.bodyTop;
			body.style.left = prev.bodyLeft;
			body.style.right = prev.bodyRight;
			body.style.width = prev.bodyWidth;
			body.style.paddingRight = prev.bodyPad;
			window.scrollTo(0, scrollY);
		};
	}, []);
	return /* @__PURE__ */ jsxs("div", {
		className: "fixed inset-0 z-40 flex items-end justify-center overflow-hidden bg-bg/75 p-0 backdrop-blur-sm sm:items-center sm:p-4",
		onClick: onClose,
		onWheel: (e) => {
			if (e.target === e.currentTarget) e.preventDefault();
		},
		role: "presentation",
		children: [" ", /* @__PURE__ */ jsx("div", {
			ref: dialogRef,
			className: `w-full overflow-hidden bg-surface shadow-card-hover ${wide ? "max-h-[92dvh] rounded-t-xl sm:max-h-none sm:rounded-xl sm:w-auto" : "max-h-[90dvh] max-w-lg overflow-y-auto overscroll-contain rounded-t-xl p-6 sm:rounded-xl"}`,
			onClick: (e) => e.stopPropagation(),
			role: "dialog",
			"aria-modal": "true",
			children
		})]
	});
}
function Field({ label, children }) {
	return /* @__PURE__ */ jsxs("div", {
		className: "settings-field",
		children: [
			/* @__PURE__ */ jsx("span", { children: label }),
			children
		]
	});
}
function BrandPick({ label, hint, resetLabel, accept, src, variant, onFile, onReset, children }) {
	return /* @__PURE__ */ jsxs("div", {
		className: "brand-slot",
		children: [
			/* @__PURE__ */ jsx("span", { children: label }),
			/* @__PURE__ */ jsxs("label", {
				className: `brand-preview${variant === "tab" ? " is-tab" : ""}`,
				title: `Importer ${label.toLowerCase()}`,
				children: [
					children,
					/* @__PURE__ */ jsx(Upload, {
						className: "brand-preview-action size-3.5",
						"aria-hidden": true
					}),
					/* @__PURE__ */ jsx("input", {
						type: "file",
						accept,
						className: "hidden",
						"aria-label": `Importer ${label.toLowerCase()}`,
						onChange: async (e) => {
							const file = e.target.files?.[0];
							e.target.value = "";
							if (!file) return;
							try {
								await onFile(file);
							} catch (err) {
								toast.error(te(err));
							}
						}
					})
				]
			}),
			src ? /* @__PURE__ */ jsx("button", {
				type: "button",
				className: "settings-link",
				onClick: onReset,
				children: resetLabel
			}) : /* @__PURE__ */ jsx("p", {
				className: "settings-hint",
				children: hint
			})
		]
	});
}
function settingsSections() {
	return [
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
		["about", BadgeInfo],
		["reset", RotateCcw]
	].map(([id, icon]) => ({
		id,
		icon,
		label: t(`sections.${id}.label`),
		lead: t(`sections.${id}.lead`)
	}));
}
function collectTopApps(catalog, limit = 10) {
	const rows = [];
	for (const tab of catalog ?? []) for (const cat of tab.categories) for (const app of cat.apps) {
		if ((app.kind || "app") !== "app") continue;
		rows.push({
			id: app.id,
			title: app.title,
			icon: app.icon,
			tab: tab.name,
			clicks: app.clicks || 0
		});
	}
	return rows.sort((a, b) => b.clicks - a.clicks || a.title.localeCompare(b.title, localeTag())).slice(0, limit);
}
function formatHistoryWhen(at) {
	return formatWhen(at);
}
function historyScopeLabel(scope, kind) {
	if (scope === "tab" || kind === "tab") return t("nav.space");
	if (scope === "category" || kind === "category") return t("item.category");
	if (kind === "note") return t("history.scopeNote");
	if (kind === "embed") return t("history.scopeEmbed");
	return t("history.scopeCard");
}
function historyCountLabel(n) {
	if (!n) return "";
	return tp("history.cardCount", n);
}
function historyRowIcon(row) {
	if (row?.icon) return row.icon;
	if (row?.scope === "tab") return "Layers";
	if (row?.scope === "category") return "AppWindow";
	if (row?.kind === "note") return "FileText";
	if (row?.kind === "embed") return "AppWindow";
	return "Link";
}
function HistoryPanel({ token, tab, onClose, onRestored }) {
	const [pane, setPane] = useState(tab === "audit" ? "audit" : "recovery");
	const [audit, setAudit] = useState([]);
	const [trash, setTrash] = useState([]);
	const [canPurge, setCanPurge] = useState(false);
	const [canAudit, setCanAudit] = useState(true);
	const [canRestore, setCanRestore] = useState(true);
	const [busy, setBusy] = useState(false);
	const [ready, setReady] = useState(false);
	const [filter, setFilter] = useState("all");
	async function reload() {
		const res = await listHistory({ data: { token } });
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
	}, [token]);
	const shown = filter === "all" ? trash : trash.filter((row) => row.scope === filter);
	async function restore(row) {
		if (busy) return;
		setBusy(true);
		try {
			const next = await restoreHistory({
				data: {
					token,
					id: row.id,
					scope: row.scope,
					targetId: row.targetId
				}
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
			const res = await exportAudit({ data: { token } });
			const blob = new Blob([auditCsv(res.rows || [])], { type: "text/csv;charset=utf-8" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `audit-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.csv`;
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
		if (!window.confirm(t("confirm.emptyTrash"))) return;
		setBusy(true);
		try {
			const res = await purgeTrash({ data: { token } });
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
	const current = pane === "audit"
		? { label: t("history.audit"), lead: t("history.auditLead") }
		: { label: t("history.recovery"), lead: t("history.recoveryLead") };
	return /* @__PURE__ */ jsxs("div", {
		className: "settings-frame",
		children: [
			/* @__PURE__ */ jsxs("nav", {
				className: "settings-nav",
				"aria-label": t("history.sectionsAria"),
				children: [
					/* @__PURE__ */ jsx("p", {
						className: "menu-title",
						children: t("history.title")
					}),
					canRestore ? /* @__PURE__ */ jsxs("button", {
						type: "button",
						className: `settings-nav-item ${pane === "recovery" ? "is-on" : ""}`,
						onClick: () => setPane("recovery"),
						children: [
							/* @__PURE__ */ jsx(Undo2, { className: "size-4 shrink-0" }),
							t("history.recovery")
						]
					}) : null,
					canAudit ? /* @__PURE__ */ jsxs("button", {
						type: "button",
						className: `settings-nav-item ${pane === "audit" ? "is-on" : ""}`,
						onClick: () => setPane("audit"),
						children: [
							/* @__PURE__ */ jsx(ScrollText, { className: "size-4 shrink-0" }),
							t("history.audit")
						]
					}) : null
				]
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "settings-body",
				children: [
					/* @__PURE__ */ jsxs("div", {
						className: "settings-head",
						children: [
							/* @__PURE__ */ jsxs("div", {
								className: "settings-head-copy",
								children: [
									/* @__PURE__ */ jsx("h3", {
										className: "dialog-title",
										children: current.label
									}),
									/* @__PURE__ */ jsx("p", {
										className: "settings-lead",
										children: current.lead
									})
								]
							}),
							/* @__PURE__ */ jsxs("div", {
								className: "settings-head-actions",
								children: [
									pane === "recovery" && canPurge ? /* @__PURE__ */ jsxs(Button, {
										type: "button",
										size: "sm",
										variant: "secondary",
										className: "h-9",
										disabled: busy || trash.length === 0,
										onClick: () => void purge(),
										children: [/* @__PURE__ */ jsx(Trash2, { className: "size-4" }), t("actions.emptyTrash")]
									}) : null,
									pane === "audit" ? /* @__PURE__ */ jsxs(Button, {
										type: "button",
										size: "sm",
										variant: "secondary",
										className: "h-9",
										disabled: busy || !ready,
										onClick: () => void downloadAudit(),
										children: [/* @__PURE__ */ jsx(Download, { className: "size-4" }), t("actions.exportCsv")]
									}) : null,
									/* @__PURE__ */ jsx(Button, {
										type: "button",
										variant: "ghost",
										size: "icon-sm",
										onClick: onClose,
										"aria-label": t("actions.close"),
										children: /* @__PURE__ */ jsx(X, { className: "size-4" })
									})
								]
							})
						]
					}),
					/* @__PURE__ */ jsx("div", {
						className: "settings-pane",
						children: pane === "recovery" ? /* @__PURE__ */ jsxs(Fragment, {
							children: [
								/* @__PURE__ */ jsx("div", {
									className: "history-toolbar",
									children: /* @__PURE__ */ jsxs("div", {
										className: "history-filters",
										children: [
											["all", t("history.all"), LayoutGrid],
											["card", t("history.cards"), AppWindow],
											["category", t("history.categories"), Folder],
											["tab", t("history.spaces"), Layers]
										].map(([id, label, Icon]) => /* @__PURE__ */ jsxs("button", {
											type: "button",
											className: filter === id ? "is-on" : "",
											onClick: () => setFilter(id),
											children: [/* @__PURE__ */ jsx(Icon, { className: "size-3.5" }), label]
										}, id))
									})
								}),
								!ready ? /* @__PURE__ */ jsx("p", {
									className: "history-empty",
									children: t("history.loading")
								}) : shown.length === 0 ? /* @__PURE__ */ jsx("p", {
									className: "history-empty",
									children: t("history.nothing")
								}) : /* @__PURE__ */ jsx("ul", {
									className: "history-list",
									children: shown.map((row) => /* @__PURE__ */ jsxs("li", {
										className: "history-row",
										children: [
											/* @__PURE__ */ jsx("span", {
												className: "history-row-ico",
												"aria-hidden": true,
												children: /* @__PURE__ */ jsx(PortalIcon, {
													name: historyRowIcon(row),
													className: "size-4"
												})
											}),
											/* @__PURE__ */ jsxs("div", {
												className: "history-row-main",
												children: [
													/* @__PURE__ */ jsxs("p", {
														className: "history-title",
														children: [
															row.label,
															" ",
															/* @__PURE__ */ jsx("span", {
																className: "history-scope",
																children: historyScopeLabel(row.scope, row.kind)
															})
														]
													}),
													/* @__PURE__ */ jsx("p", {
														className: "history-meta",
														children: [row.path, historyCountLabel(row.count), formatHistoryWhen(row.at), row.actor].filter(Boolean).join(" · ")
													})
												]
											}),
											/* @__PURE__ */ jsxs(Button, {
												type: "button",
												size: "sm",
												variant: "secondary",
												className: "h-9 shrink-0",
												disabled: busy,
												onClick: () => void restore(row),
												children: [/* @__PURE__ */ jsx(Undo2, { className: "size-4" }), t("actions.restore")]
											})
										]
									}, `${row.id}:${row.scope}:${row.targetId}`))
								})
							]
						}) : !ready ? /* @__PURE__ */ jsx("p", {
							className: "history-empty",
							children: t("history.loading")
						}) : audit.length === 0 ? /* @__PURE__ */ jsx("p", {
							className: "history-empty",
							children: t("history.noAudit")
						}) : /* @__PURE__ */ jsx("ul", {
							className: "history-list",
							children: audit.map((row) => /* @__PURE__ */ jsxs("li", {
								className: "history-row",
								children: [
									/* @__PURE__ */ jsxs("div", {
										className: "history-row-main",
										children: [
											/* @__PURE__ */ jsx("p", {
												className: "history-title",
												children: t(`audit.${row.type}`)
											}),
											/* @__PURE__ */ jsx("p", {
												className: "history-meta",
												children: [row.label, row.path, formatHistoryWhen(row.at), row.actor].filter(Boolean).join(" · ")
											})
										]
									})
								]
							}, row.id))
						})
					})
				]
			})
		]
	});
}
function StatsPanel({ catalog, onClose }) {
	const top = useMemo(() => collectTopApps(catalog, 10).filter((r) => r.clicks > 0), [catalog]);
	const max = Math.max(1, ...top.map((r) => r.clicks));
	const total = top.reduce((sum, row) => sum + row.clicks, 0);
	return /* @__PURE__ */ jsxs("div", {
		className: "stats-panel",
		children: [
			" ",
			/* @__PURE__ */ jsxs("div", {
				className: "mb-5 flex items-start justify-between gap-3",
				children: [
					" ",
					/* @__PURE__ */ jsxs("div", { children: [
						" ",
						/* @__PURE__ */ jsx("h3", {
							className: "dialog-title",
							children: t("stats.title")
						}),
						" ",
						/* @__PURE__ */ jsx("p", {
							className: "mt-1 text-sm text-muted",
							children: t("stats.lead")
						})
					] }),
					" ",
					/* @__PURE__ */ jsxs(Button, {
						type: "button",
						variant: "ghost",
						size: "icon-sm",
						onClick: onClose,
						"aria-label": t("actions.close"),
						children: [" ", /* @__PURE__ */ jsx(X, { className: "size-4" })]
					})
				]
			}),
			top.length === 0 ? /* @__PURE__ */ jsx("p", {
				className: "py-12 text-center text-sm text-muted",
				children: t("empty.noClicks")
			}) : /* @__PURE__ */ jsx("ol", {
				className: "stats-list",
				children: top.map((row, index) => /* @__PURE__ */ jsxs("li", {
					className: "stats-row",
					children: [
						" ",
						/* @__PURE__ */ jsx("span", {
							className: "stats-rank",
							children: index + 1
						}),
						" ",
						/* @__PURE__ */ jsxs("span", {
							className: "portal-mark flex size-8 items-center justify-center rounded-md",
							children: [" ", /* @__PURE__ */ jsx(PortalIcon, {
								name: row.icon,
								className: "size-4"
							})]
						}),
						" ",
						/* @__PURE__ */ jsxs("div", {
							className: "min-w-0",
							children: [
								" ",
								/* @__PURE__ */ jsx("p", {
									className: "truncate text-sm font-medium",
									children: row.title
								}),
								" ",
								/* @__PURE__ */ jsx("p", {
									className: "truncate text-xs text-muted",
									children: row.tab
								}),
								" ",
								/* @__PURE__ */ jsxs("div", {
									className: "stats-meter mt-1.5",
									children: [" ", /* @__PURE__ */ jsx("span", { style: { width: `${Math.max(6, row.clicks / max * 100)}%` } })]
								})
							]
						}),
						" ",
						/* @__PURE__ */ jsx("span", {
							className: "stats-count",
							children: row.clicks
						})
					]
				}, row.id))
			}),
			" ",
			/* @__PURE__ */ jsxs("p", {
				className: "mt-5 text-xs text-subtle",
				children: [
					tp("info.total", total)
				]
			})
		]
	});
}
function AdminPanel({ tab, settings, runtime, catalog, tags, tabs, directory, token, session, busy, onTab, onCancel, onSaveSettings, onResetClicks, onApplyTags, onSaveTheme, onResetPortal, onImportPortal }) {
	const sections = settingsSections().filter((s) => {
		if (s.id === "about") return true;
		if (s.id === "reset") return session?.role === "admin";
		return session?.canManageSettings;
	});
	const current = sections.find((s) => s.id === tab) ?? sections[0];
	return /* @__PURE__ */ jsxs("div", {
		className: "settings-frame",
		children: [
			" ",
			/* @__PURE__ */ jsxs("nav", {
				className: "settings-nav",
				"aria-label": t("settings.sectionsAria"),
				children: [
					" ",
					/* @__PURE__ */ jsx("p", {
						className: "menu-title",
						children: t("settings.title")
					}),
					sections.map((s) => /* @__PURE__ */ jsxs("button", {
						type: "button",
						className: `settings-nav-item ${tab === s.id ? "is-on" : ""}`,
						onClick: () => onTab(s.id),
						children: [
							" ",
							/* @__PURE__ */ jsx(s.icon, { className: "size-4 shrink-0" }),
							s.label
						]
					}, s.id))
				]
			}),
			" ",
			/* @__PURE__ */ jsxs("div", {
				className: "settings-body",
				children: [
					" ",
					/* @__PURE__ */ jsxs("div", {
						className: "settings-head",
						children: [
							/* @__PURE__ */ jsxs("div", {
								className: "settings-head-copy",
								children: [
									/* @__PURE__ */ jsx("h3", {
										className: "dialog-title",
										children: current?.label || t("settings.title")
									}),
									current?.lead ? /* @__PURE__ */ jsx("p", {
										className: "settings-lead",
										children: current.lead
									}) : null
								]
							}),
							" ",
							/* @__PURE__ */ jsxs(Button, {
								type: "button",
								variant: "ghost",
								size: "icon-sm",
								onClick: onCancel,
								children: [" ", /* @__PURE__ */ jsx(X, { className: "size-4" })]
							})
						]
					}),
					tab === "general" ? /* @__PURE__ */ jsxs("div", {
						className: "settings-pane",
						children: [" ", /* @__PURE__ */ jsx(SettingsForm, {
							initial: settings,
							busy,
							embedded: true,
							onCancel,
							onSave: (payload) => onSaveSettings(payload)
						})]
					}) : tab === "locales" ? /* @__PURE__ */ jsx("div", {
						className: "settings-pane",
						children: /* @__PURE__ */ jsx(LocalesForm, {
							initial: settings,
							onSave: (payload) => onSaveSettings(payload)
						})
					}) : tab === "presentation" ? /* @__PURE__ */ jsx("div", {
						className: "settings-pane",
						children: /* @__PURE__ */ jsx(PresentationForm, {
							initial: settings,
							onSave: (payload) => onSaveSettings(payload)
						})
					}) : tab === "reachability" ? /* @__PURE__ */ jsx("div", {
						className: "settings-pane",
						children: /* @__PURE__ */ jsx(ReachabilityForm, {
							initial: settings,
							onSave: (payload) => onSaveSettings(payload)
						})
					}) : tab === "security" ? /* @__PURE__ */ jsx("div", {
						className: "settings-pane",
						children: /* @__PURE__ */ jsx(SecurityForm, {
							initial: settings,
							isDev: Boolean(runtime?.isDev),
							onSave: (payload) => onSaveSettings(payload)
						})
					}) : tab === "debug" ? /* @__PURE__ */ jsx("div", {
						className: "settings-pane",
						children: /* @__PURE__ */ jsx(DebugPanel, {
							settings,
							runtime,
							session
						})
					}) : tab === "info" ? /* @__PURE__ */ jsx("div", {
						className: "settings-pane",
						children: /* @__PURE__ */ jsx(InfoBarForm, {
							initial: settings,
							busy,
							onSave: (payload) => onSaveSettings(payload),
							onResetClicks
						})
					}) : tab === "themes" ? /* @__PURE__ */ jsxs("div", {
						className: "settings-pane",
						children: [" ", /* @__PURE__ */ jsx(ThemeForm, {
							initial: settings,
							busy,
							onCancel,
							onSave: onSaveTheme
						})]
					}) : tab === "backup" ? /* @__PURE__ */ jsx("div", {
						className: "settings-pane",
						children: /* @__PURE__ */ jsx(BackupForm, {
							token,
							busy,
							catalog,
							title: settings.title,
							onImport: onImportPortal
						})
					}) : tab === "reset" && session?.role === "admin" ? /* @__PURE__ */ jsx("div", {
						className: "settings-pane",
						children: /* @__PURE__ */ jsx(ResetForm, {
							busy,
							onReset: onResetPortal
						})
					}) : tab === "about" || !session?.canManageSettings ? /* @__PURE__ */ jsx("div", {
						className: "settings-pane",
						children: /* @__PURE__ */ jsx(AboutForm, {})
					}) : /* @__PURE__ */ jsx("div", {
						className: "settings-pane is-fill",
						children: /* @__PURE__ */ jsx(TagManager, {
							tags,
							colors: settings.tagColors,
							busy,
							embedded: true,
							settings,
							pruneOrphanTags: Boolean(settings.pruneOrphanTags),
							onCancel,
							onSave: (payload) => onSaveSettings(payload, { close: false }),
							onApply: onApplyTags
						})
					}),
					tab === "general" || tab === "locales" || tab === "presentation" || tab === "reachability" || tab === "security" || tab === "info" || tab === "themes" ? /* @__PURE__ */ jsx(FormActions, {
						busy,
						onCancel,
						form: "settings-form"
					}) : null
				]
			})
		]
	});
}
function AboutForm() {
	const [release, setRelease] = useState(null);
	useEffect(() => {
		let live = true;
		checkLatestRelease({ data: {} }).then((row) => {
			if (!live) return;
			const latest = String(row?.latest || "").trim();
			if (!latest) {
				setRelease({ kind: "none" });
				return;
			}
			setRelease(isNewerVersion(latest, PORTAL_VERSION) ? {
				kind: "update",
				latest,
				url: String(row?.url || "")
			} : { kind: "ok" });
		}).catch(() => {
			if (live) setRelease({ kind: "none" });
		});
		return () => {
			live = false;
		};
	}, []);
	return /* @__PURE__ */ jsxs("div", {
		className: "settings-stack",
		children: [
			/* @__PURE__ */ jsxs("dl", {
				className: "about-dl",
				children: [
					/* @__PURE__ */ jsx("dt", { children: t("about.created") }),
					/* @__PURE__ */ jsx("dd", { children: t("about.createdOn") }),
					/* @__PURE__ */ jsx("dt", { children: t("about.build") }),
					/* @__PURE__ */ jsxs("dd", {
						className: "about-build",
						children: [
							PORTAL_VERSION,
							release?.kind === "ok" ? /* @__PURE__ */ jsx("span", {
								className: "about-build-badge",
								children: t("about.upToDate")
							}) : release?.kind === "update" ? /* @__PURE__ */ jsx("a", {
								className: "about-build-badge is-update",
								href: release.url,
								target: "_blank",
								rel: "noopener noreferrer",
								title: t("about.openVersion", { v: release.latest }),
								children: t("about.update", { v: release.latest })
							}) : release?.kind === "offline" ? /* @__PURE__ */ jsx("span", {
								className: "about-build-badge is-offline",
								children: t("about.offline")
							}) : null
						]
					})
				]
			}),
			/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("p", {
				className: "settings-kicker",
				children: t("about.tech")
			}), /* @__PURE__ */ jsxs("div", {
				className: "about-tech",
				children: [
					/* @__PURE__ */ jsx("span", { children: "React 19" }),
					/* @__PURE__ */ jsx("span", { children: "TanStack Start" }),
					/* @__PURE__ */ jsx("span", { children: "Vite" }),
					/* @__PURE__ */ jsx("span", { children: "Tailwind CSS" }),
					/* @__PURE__ */ jsx("span", { children: "Nitro" }),
					/* @__PURE__ */ jsx("span", { children: "Zod" }),
					/* @__PURE__ */ jsx("span", { children: "Lucide" })
				]
			})] })
		]
	});
}
function OidcForm({ initial, onSave, busy }) {
	const [oidcEnabled, setOidcEnabled] = useState(Boolean(initial.oidcEnabled));
	const [oidcIssuer, setOidcIssuer] = useState(initial.oidcIssuer || "");
	const [oidcClientId, setOidcClientId] = useState(initial.oidcClientId || "");
	const [oidcClientSecret, setOidcClientSecret] = useState("");
	const [oidcLabel, setOidcLabel] = useState(initial.oidcLabel || "SSO");
	const [oidcAutoCreate, setOidcAutoCreate] = useState(Boolean(initial.oidcAutoCreate));
	const redirectUri = typeof window !== "undefined" ? `${window.location.origin}/oidc/callback` : "/oidc/callback";
	return /* @__PURE__ */ jsxs("form", {
		id: "oidc-form",
		className: "settings-stack",
		onSubmit: (e) => {
			e.preventDefault();
			onSave({
				oidcEnabled,
				oidcIssuer: oidcIssuer.trim(),
				oidcClientId: oidcClientId.trim(),
				oidcClientSecret,
				oidcLabel: oidcLabel.trim() || "SSO",
				oidcAutoCreate
			});
		},
		children: [
			/* @__PURE__ */ jsxs("div", {
				className: "settings-toggles",
				children: [/* @__PURE__ */ jsxs("label", {
					children: [/* @__PURE__ */ jsx("input", {
						type: "checkbox",
						checked: oidcEnabled,
						onChange: (e) => setOidcEnabled(e.target.checked)
					}), t("oidc.enable")]
				})]
			}),
			/* @__PURE__ */ jsxs(Field, {
				label: t("oidc.issuer"),
				children: [
					/* @__PURE__ */ jsx("input", {
						className: inputClass,
						value: oidcIssuer,
						onChange: (e) => setOidcIssuer(e.target.value),
						placeholder: "https://keycloak.exemple/realms/dockit",
						required: oidcEnabled
					}),
					/* @__PURE__ */ jsx("p", {
						className: "settings-hint",
						children: t("oidc.issuerHint")
					})
				]
			}),
			/* @__PURE__ */ jsxs(Field, {
				label: t("oidc.clientId"),
				children: [/* @__PURE__ */ jsx("input", {
					className: inputClass,
					value: oidcClientId,
					onChange: (e) => setOidcClientId(e.target.value),
					required: oidcEnabled
				})]
			}),
			/* @__PURE__ */ jsxs(Field, {
				label: t("oidc.clientSecret"),
				children: [
					/* @__PURE__ */ jsx("input", {
						className: inputClass,
						type: "password",
						value: oidcClientSecret,
						onChange: (e) => setOidcClientSecret(e.target.value),
						placeholder: initial.oidcHasSecret ? t("oidc.secretUnchanged") : t("oidc.secretOptional")
					}),
					/* @__PURE__ */ jsx("p", {
						className: "settings-hint",
						children: t("oidc.secretHint")
					})
				]
			}),
			/* @__PURE__ */ jsxs(Field, {
				label: t("oidc.buttonLabel"),
				children: [/* @__PURE__ */ jsx("input", {
					className: inputClass,
					value: oidcLabel,
					onChange: (e) => setOidcLabel(e.target.value),
					placeholder: "SSO"
				})]
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "settings-toggles",
				children: [/* @__PURE__ */ jsxs("label", {
					children: [/* @__PURE__ */ jsx("input", {
						type: "checkbox",
						checked: oidcAutoCreate,
						onChange: (e) => setOidcAutoCreate(e.target.checked)
					}), t("oidc.autoCreate")]
				})]
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "settings-note",
				children: [
					/* @__PURE__ */ jsx("p", {
						children: t("oidc.redirect")
					}),
					/* @__PURE__ */ jsx("p", {
						className: "settings-hint",
						children: redirectUri
					})
				]
			}),
			/* @__PURE__ */ jsx(Button, {
				type: "submit",
				size: "sm",
				disabled: busy,
				children: t("actions.save")
			})
		]
	});
}
function LdapForm({ initial, onSave, busy }) {
	const [ldapEnabled, setLdapEnabled] = useState(Boolean(initial.ldapEnabled));
	const [ldapHost, setLdapHost] = useState(initial.ldapHost || "");
	const [ldapTls, setLdapTls] = useState(initial.ldapTls !== false);
	const [ldapPort, setLdapPort] = useState(Number(initial.ldapPort) || (initial.ldapTls === false ? 389 : 636));
	const [ldapTlsVerify, setLdapTlsVerify] = useState(initial.ldapTlsVerify !== false);
	const [ldapBindDn, setLdapBindDn] = useState(initial.ldapBindDn || "");
	const [ldapBindPassword, setLdapBindPassword] = useState("");
	const [ldapBaseDn, setLdapBaseDn] = useState(initial.ldapBaseDn || "");
	const [ldapUserFilter, setLdapUserFilter] = useState(initial.ldapUserFilter || "");
	const [ldapDomain, setLdapDomain] = useState(initial.ldapDomain || "");
	const [ldapAutoCreate, setLdapAutoCreate] = useState(Boolean(initial.ldapAutoCreate));
	return /* @__PURE__ */ jsxs("form", {
		className: "settings-stack",
		onSubmit: (e) => {
			e.preventDefault();
			onSave({
				ldapEnabled,
				ldapHost: ldapHost.trim(),
				ldapPort: Number(ldapPort) || (ldapTls ? 636 : 389),
				ldapTls,
				ldapTlsVerify,
				ldapBindDn: ldapBindDn.trim(),
				ldapBindPassword,
				ldapBaseDn: ldapBaseDn.trim(),
				ldapUserFilter: ldapUserFilter.trim(),
				ldapDomain: ldapDomain.trim(),
				ldapAutoCreate
			});
		},
		children: [
			/* @__PURE__ */ jsxs("div", {
				className: "settings-toggles",
				children: [/* @__PURE__ */ jsxs("label", {
					children: [/* @__PURE__ */ jsx("input", {
						type: "checkbox",
						checked: ldapEnabled,
						onChange: (e) => setLdapEnabled(e.target.checked)
					}), t("ldap.enable")]
				})]
			}),
			/* @__PURE__ */ jsxs(Field, {
				label: t("ldap.domain"),
				children: [
					/* @__PURE__ */ jsx("input", {
						className: inputClass,
						value: ldapDomain,
						onChange: (e) => setLdapDomain(e.target.value),
						placeholder: "CORP",
						required: ldapEnabled
					}),
					/* @__PURE__ */ jsx("p", {
						className: "settings-hint",
						children: t("ldap.domainHint")
					})
				]
			}),
			/* @__PURE__ */ jsxs(Field, {
				label: t("ldap.host"),
				children: [
					/* @__PURE__ */ jsx("input", {
						className: inputClass,
						value: ldapHost,
						onChange: (e) => setLdapHost(e.target.value),
						placeholder: "dc.example.local",
						required: ldapEnabled
					}),
					/* @__PURE__ */ jsx("p", {
						className: "settings-hint",
						children: t("ldap.hostHint")
					})
				]
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "settings-toggles",
				children: [
					/* @__PURE__ */ jsxs("label", {
						children: [/* @__PURE__ */ jsx("input", {
							type: "checkbox",
							checked: ldapTls,
							onChange: (e) => {
								const on = e.target.checked;
								setLdapTls(on);
								if (ldapPort === 389 || ldapPort === 636) setLdapPort(on ? 636 : 389);
							}
						}), t("ldap.tls")]
					}),
					ldapTls ? /* @__PURE__ */ jsxs("label", {
						children: [/* @__PURE__ */ jsx("input", {
							type: "checkbox",
							checked: ldapTlsVerify,
							onChange: (e) => setLdapTlsVerify(e.target.checked)
						}), t("ldap.tlsVerify")]
					}) : null
				]
			}),
			/* @__PURE__ */ jsxs(Field, {
				label: t("ldap.port"),
				children: [/* @__PURE__ */ jsx("input", {
					className: inputClass,
					type: "number",
					min: 1,
					max: 65535,
					value: ldapPort,
					onChange: (e) => setLdapPort(Number(e.target.value) || 0)
				})]
			}),
			/* @__PURE__ */ jsxs(Field, {
				label: t("ldap.bindDn"),
				children: [
					/* @__PURE__ */ jsx("input", {
						className: inputClass,
						value: ldapBindDn,
						onChange: (e) => setLdapBindDn(e.target.value),
						placeholder: "CN=dockit,OU=Services,DC=example,DC=local"
					}),
					/* @__PURE__ */ jsx("p", {
						className: "settings-hint",
						children: t("ldap.bindHint")
					})
				]
			}),
			/* @__PURE__ */ jsxs(Field, {
				label: t("ldap.bindPassword"),
				children: [/* @__PURE__ */ jsx("input", {
					className: inputClass,
					type: "password",
					value: ldapBindPassword,
					onChange: (e) => setLdapBindPassword(e.target.value),
					placeholder: initial.ldapHasBindPassword ? t("oidc.secretUnchanged") : t("oidc.secretOptional")
				})]
			}),
			/* @__PURE__ */ jsxs(Field, {
				label: t("ldap.baseDn"),
				children: [/* @__PURE__ */ jsx("input", {
					className: inputClass,
					value: ldapBaseDn,
					onChange: (e) => setLdapBaseDn(e.target.value),
					placeholder: "DC=example,DC=local",
					required: ldapEnabled && Boolean(ldapBindDn.trim())
				})]
			}),
			/* @__PURE__ */ jsxs(Field, {
				label: t("ldap.filter"),
				children: [
					/* @__PURE__ */ jsx("input", {
						className: inputClass,
						value: ldapUserFilter,
						onChange: (e) => setLdapUserFilter(e.target.value),
						placeholder: "(&(objectClass=user)(sAMAccountName={username}))"
					}),
					/* @__PURE__ */ jsx("p", {
						className: "settings-hint",
						children: t("ldap.filterHint")
					})
				]
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "settings-toggles",
				children: [/* @__PURE__ */ jsxs("label", {
					children: [/* @__PURE__ */ jsx("input", {
						type: "checkbox",
						checked: ldapAutoCreate,
						onChange: (e) => setLdapAutoCreate(e.target.checked)
					}), t("ldap.autoCreate")]
				})]
			}),
			/* @__PURE__ */ jsx(Button, {
				type: "submit",
				size: "sm",
				disabled: busy,
				children: t("actions.save")
			})
		]
	});
}
function ResetForm({ busy, onReset }) {
	return /* @__PURE__ */ jsx("div", {
		className: "settings-stack",
		children: /* @__PURE__ */ jsxs("div", {
			className: "settings-note",
			children: [
				/* @__PURE__ */ jsx("p", {
					children: t("settings.resetBody")
				}),
				/* @__PURE__ */ jsx(Button, {
					type: "button",
					variant: "danger",
					size: "sm",
					className: "settings-note-action h-9",
					disabled: busy || !onReset,
					onClick: () => {
						if (!onReset) return;
						if (!window.confirm(t("settings.resetConfirm"))) return;
						onReset();
					},
					children: t("settings.resetAction")
				})
			]
		})
	});
}
function settingsBase(initial) {
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
		probeBlink: Boolean(initial.probeBlink),
		annexFade: Boolean(initial.annexFade),
		catCounts: Boolean(initial.catCounts),
		pruneOrphanTags: Boolean(initial.pruneOrphanTags),
		infoStats: initial.infoStats !== false,
		probeTlsVerify: Boolean(initial.probeTlsVerify),
		probeAuthOnly: Boolean(initial.probeAuthOnly),
		sessionHttpOnly: Boolean(initial.sessionHttpOnly),
		devAdminNoPassword: Boolean(initial.devAdminNoPassword),
		documentTitle: initial.documentTitle || "Dockit",
		favicon: initial.favicon || ""
	};
}
function SettingsForm({ initial, busy, embedded, onCancel, onSave }) {
	const [title, setTitle] = useState(initial.title);
	const [subtitle, setSubtitle] = useState(initial.subtitle);
	const [logo, setLogo] = useState(initial.logo || "");
	const [documentTitle, setDocumentTitle] = useState(initial.documentTitle || "Dockit");
	const [favicon, setFavicon] = useState(initial.favicon || "");
	async function applyLogo(next) {
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
	return /* @__PURE__ */ jsxs("form", {
		id: "settings-form",
		className: "settings-stack",
		onSubmit: (e) => {
			e.preventDefault();
			onSave({
				...settingsBase(initial),
				title: title.trim() || "Dockit",
				subtitle: subtitle.trim(),
				logo,
				documentTitle: documentTitle.trim() || "Dockit",
				favicon
			});
		},
		children: [
			!embedded && /* @__PURE__ */ jsxs("div", {
				className: "mb-4 flex items-center justify-between",
				children: [
					" ",
					/* @__PURE__ */ jsx("h3", {
						className: "dialog-title",
						children: t("settings.portalParams")
					}),
					" ",
					/* @__PURE__ */ jsxs(Button, {
						type: "button",
						variant: "ghost",
						size: "icon-sm",
						onClick: onCancel,
						children: [" ", /* @__PURE__ */ jsx(X, { className: "size-4" })]
					})
				]
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "settings-card",
				children: [
					/* @__PURE__ */ jsx("p", { className: "settings-kicker", children: t("settings.brand") }),
					/* @__PURE__ */ jsxs("div", {
						className: "brand-row",
						children: [
							/* @__PURE__ */ jsx(BrandPick, {
								label: t("settings.logo"),
								hint: t("settings.logoHint"),
								resetLabel: t("settings.resetLogo"),
								accept: "image/png,image/svg+xml,image/webp,image/jpeg",
								src: logo,
								onFile: async (file) => {
									await applyLogo(await fileToDataUrl(file));
								},
								onReset: () => void applyLogo(""),
								children: logo ? /* @__PURE__ */ jsx("img", {
									src: logo,
									alt: "",
									className: "brand-preview-img"
								}) : /* @__PURE__ */ jsx(DockitMark, { className: "dockit-mark brand-mark" })
							}),
							/* @__PURE__ */ jsx(BrandPick, {
								label: t("settings.favicon"),
								hint: t("settings.faviconHint"),
								resetLabel: t("settings.resetFavicon"),
								accept: "image/png,image/svg+xml,image/webp,image/jpeg,image/x-icon,image/vnd.microsoft.icon,.ico",
								src: favicon,
								variant: "tab",
								onFile: async (file) => {
									setFavicon(await toFaviconDataUrl(await fileToDataUrl(file)));
								},
								onReset: () => setFavicon(""),
								children: [
									favicon ? /* @__PURE__ */ jsx("img", {
										key: "ico",
										src: favicon,
										alt: "",
										className: "brand-tab-ico"
									}) : logo ? /* @__PURE__ */ jsx("img", {
										key: "ico",
										src: logo,
										alt: "",
										className: "brand-tab-ico"
									}) : /* @__PURE__ */ jsx(DockitMark, {
										key: "ico",
										className: "dockit-mark brand-tab-ico"
									}),
									/* @__PURE__ */ jsx("span", {
										key: "title",
										className: "brand-tab-title",
										children: documentTitle.trim() || "Dockit"
									})
								]
							})
						]
					}),
					/* @__PURE__ */ jsx("p", {
						className: "settings-hint",
						children: t("settings.brandClick")
					})
				]
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "settings-card",
				children: [
					/* @__PURE__ */ jsx("p", { className: "settings-kicker", children: t("settings.texts") }),
					/* @__PURE__ */ jsxs("div", {
						className: "field-row",
						children: [
							/* @__PURE__ */ jsxs(Field, {
								label: t("settings.portalName"),
								children: [/* @__PURE__ */ jsx("input", {
									className: inputClass,
									value: title,
									onChange: (e) => setTitle(e.target.value),
									required: true
								})]
							}),
							/* @__PURE__ */ jsxs(Field, {
								label: t("settings.subtitle"),
								children: [/* @__PURE__ */ jsx("input", {
									className: inputClass,
									value: subtitle,
									onChange: (e) => setSubtitle(e.target.value)
								})]
							})
						]
					}),
					/* @__PURE__ */ jsx(Field, {
						label: t("settings.documentTitle"),
						children: /* @__PURE__ */ jsx("input", {
							className: inputClass,
							value: documentTitle,
							onChange: (e) => setDocumentTitle(e.target.value),
							placeholder: "Dockit"
						})
					})
				]
			})
		]
	});
}
function LocalesForm({ initial, onSave }) {
	const [locale, setLocaleDraft] = useState(asLocale(initial.locale));
	const [dateFormat, setDateDraft] = useState(asDateFormat(initial.dateFormat));
	return /* @__PURE__ */ jsxs("form", {
		id: "settings-form",
		className: "settings-stack",
		onSubmit: (e) => {
			e.preventDefault();
			onSave({
				...settingsBase(initial),
				locale: asLocale(locale),
				dateFormat: asDateFormat(dateFormat)
			});
		},
		children: [
			/* @__PURE__ */ jsxs("div", {
				className: "settings-card",
				children: [
					/* @__PURE__ */ jsx("p", { className: "settings-kicker", children: t("lang.label") }),
					/* @__PURE__ */ jsxs(Field, {
						label: t("lang.label"),
						children: [
							/* @__PURE__ */ jsxs("select", {
								className: inputClass,
								value: locale,
								onChange: (e) => setLocaleDraft(asLocale(e.target.value)),
								children: [
									/* @__PURE__ */ jsx("option", { value: "en", children: t("lang.en") }),
									/* @__PURE__ */ jsx("option", { value: "fr", children: t("lang.fr") })
								]
							}),
							/* @__PURE__ */ jsx("p", { className: "settings-hint", children: t("lang.hint") })
						]
					}),
					/* @__PURE__ */ jsxs(Field, {
						label: t("lang.dateFormat"),
						children: [
							/* @__PURE__ */ jsxs("select", {
								className: inputClass,
								value: dateFormat,
								onChange: (e) => setDateDraft(asDateFormat(e.target.value)),
								children: [
									/* @__PURE__ */ jsx("option", { value: "ymd", children: t("lang.dateYmd") }),
									/* @__PURE__ */ jsx("option", { value: "dmy", children: t("lang.dateDmy") }),
									/* @__PURE__ */ jsx("option", { value: "mdy", children: t("lang.dateMdy") }),
									/* @__PURE__ */ jsx("option", { value: "iso", children: t("lang.dateIso") })
								]
							}),
							/* @__PURE__ */ jsx("p", { className: "settings-hint", children: t("lang.dateHint") })
						]
					})
				]
			})
		]
	});
}
function BackupForm({ token, busy, catalog, title, onImport }) {
	const [pending, setPending] = useState(false);
	const working = busy || pending;
	async function doExport() {
		setPending(true);
		try {
			const payload = await exportPortal({ data: { token } });
			const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `dockit-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json`;
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
	async function doImport(file) {
		if (!file) return;
		if (file.size > 5e6) {
			toast.error(t("backup.fileTooBig"));
			return;
		}
		if (!window.confirm(t("confirm.importPortal"))) return;
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
		const blob = new Blob([inventoryCsv(rows)], { type: "text/csv;charset=utf-8" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `inventaire-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.csv`;
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
		toast.success(t("backup.csvDownloaded"));
	}
	function downloadPdf() {
		try {
			const blob = new Blob([inventoryPdf(inventoryRows(), title || "Dockit")], { type: "application/pdf" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `inventaire-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.pdf`;
			document.body.appendChild(a);
			a.click();
			a.remove();
			URL.revokeObjectURL(url);
			toast.success(t("backup.pdfDownloaded"));
		} catch (err) {
			toast.error(te(err));
		}
	}
	return /* @__PURE__ */ jsxs("div", {
		className: "settings-stack",
		children: [
			/* @__PURE__ */ jsxs("div", {
				className: "settings-card",
				children: [
					/* @__PURE__ */ jsx("p", { className: "settings-kicker", children: t("backup.portal") }),
					/* @__PURE__ */ jsx("p", {
						className: "settings-hint",
						children: t("backup.importHint")
					}),
					/* @__PURE__ */ jsxs("div", {
						className: "settings-actions is-start",
						children: [/* @__PURE__ */ jsxs(Button, {
							type: "button",
							variant: "secondary",
							disabled: working,
							onClick: () => void doExport(),
							children: [/* @__PURE__ */ jsx(Download, { className: "size-4" }), t("actions.exportJson")]
						}), /* @__PURE__ */ jsxs("label", {
							className: `settings-file ${working ? "is-disabled" : ""}`,
							children: [
								/* @__PURE__ */ jsx(Upload, { className: "size-4" }),
								t("actions.importJson"),
								/* @__PURE__ */ jsx("input", {
									type: "file",
									accept: "application/json,.json",
									className: "hidden",
									disabled: working,
									onChange: (e) => {
										const file = e.target.files?.[0];
										e.target.value = "";
										doImport(file);
									}
								})
							]
						})]
					})
				]
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "settings-card",
				children: [
					/* @__PURE__ */ jsx("p", { className: "settings-kicker", children: t("backup.inventory") }),
					/* @__PURE__ */ jsx("p", {
						className: "settings-hint",
						children: t("backup.inventoryHint")
					}),
					/* @__PURE__ */ jsxs("div", {
						className: "settings-actions is-start",
						children: [
							/* @__PURE__ */ jsxs(Button, {
								type: "button",
								variant: "secondary",
								disabled: working,
								onClick: downloadCsv,
								children: [/* @__PURE__ */ jsx(Download, { className: "size-4" }), t("actions.exportCsv")]
							}),
							/* @__PURE__ */ jsxs(Button, {
								type: "button",
								variant: "secondary",
								disabled: working,
								onClick: downloadPdf,
								children: [/* @__PURE__ */ jsx(FileText, { className: "size-4" }), t("actions.exportPdf")]
							})
						]
					})
				]
			})
		]
	});
}
function PresentationForm({ initial, onSave }) {
	const [usageStats, setUsageStats] = useState(initial.usageStats !== false);
	const [favNotes, setFavNotes] = useState(Boolean(initial.favNotes));
	const [favEmbeds, setFavEmbeds] = useState(Boolean(initial.favEmbeds));
	const [onlineIcons, setOnlineIcons] = useState(Boolean(initial.onlineIcons));
	const [navRichIcons, setNavRichIcons] = useState(Boolean(initial.navRichIcons));
	const [annexFade, setAnnexFade] = useState(Boolean(initial.annexFade));
	const [catCounts, setCatCounts] = useState(Boolean(initial.catCounts));
	const [infoBar, setInfoBar] = useState(initial.infoBar !== false);
	return /* @__PURE__ */ jsxs("form", {
		id: "settings-form",
		className: "settings-stack",
		onSubmit: (e) => {
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
				infoBar
			});
		},
		children: [
			/* @__PURE__ */ jsxs("div", {
				className: "settings-card",
				children: [
					/* @__PURE__ */ jsx("p", { className: "settings-kicker", children: t("history.cards") }),
					/* @__PURE__ */ jsxs("div", {
						className: "settings-toggles",
						children: [
							/* @__PURE__ */ jsxs("label", { children: [/* @__PURE__ */ jsx("input", {
								type: "checkbox",
								checked: usageStats,
								onChange: (e) => setUsageStats(e.target.checked)
							}), t("pres.clickCount")] }),
							/* @__PURE__ */ jsxs("label", { children: [/* @__PURE__ */ jsx("input", {
								type: "checkbox",
								checked: catCounts,
								onChange: (e) => setCatCounts(e.target.checked)
							}), t("pres.catCounts")] }),
							/* @__PURE__ */ jsxs("label", { children: [/* @__PURE__ */ jsx("input", {
								type: "checkbox",
								checked: favEmbeds,
								onChange: (e) => setFavEmbeds(e.target.checked)
							}), t("pres.favEmbeds")] }),
							/* @__PURE__ */ jsxs("label", { children: [/* @__PURE__ */ jsx("input", {
								type: "checkbox",
								checked: favNotes,
								onChange: (e) => setFavNotes(e.target.checked)
							}), t("pres.favNotes")] })
						]
					})
				]
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "settings-card",
				children: [
					/* @__PURE__ */ jsx("p", { className: "settings-kicker", children: t("pres.icons") }),
					/* @__PURE__ */ jsxs("div", {
						className: "settings-toggles",
						children: [
							/* @__PURE__ */ jsxs("label", { children: [/* @__PURE__ */ jsx("input", {
								type: "checkbox",
								checked: onlineIcons,
								onChange: (e) => setOnlineIcons(e.target.checked)
							}), t("pres.onlineIcons")] }),
							/* @__PURE__ */ jsxs("label", { children: [/* @__PURE__ */ jsx("input", {
								type: "checkbox",
								checked: navRichIcons,
								onChange: (e) => setNavRichIcons(e.target.checked)
							}), t("pres.navRichIcons")] })
						]
					}),
					/* @__PURE__ */ jsx("p", {
						className: "settings-hint",
						children: t("pres.onlineIconsHint")
					}),
					/* @__PURE__ */ jsx("p", {
						className: "settings-hint",
						children: t("pres.navRichIconsHint")
					})
				]
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "settings-card",
				children: [
					/* @__PURE__ */ jsx("p", { className: "settings-kicker", children: t("pres.menus") }),
					/* @__PURE__ */ jsxs("div", {
						className: "settings-toggles",
						children: [
							/* @__PURE__ */ jsxs("label", { children: [/* @__PURE__ */ jsx("input", {
								type: "checkbox",
								checked: annexFade,
								onChange: (e) => setAnnexFade(e.target.checked)
							}), t("pres.annexFade")] })
						]
					})
				]
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "settings-card",
				children: [
					/* @__PURE__ */ jsx("p", { className: "settings-kicker", children: t("pres.infoBar") }),
					/* @__PURE__ */ jsxs("div", {
						className: "settings-toggles",
						children: [
							/* @__PURE__ */ jsxs("label", { children: [/* @__PURE__ */ jsx("input", {
								type: "checkbox",
								checked: infoBar,
								onChange: (e) => setInfoBar(e.target.checked)
							}), t("pres.showInfoBar")] })
						]
					})
				]
			})
		]
	});
}
function ReachabilityForm({ initial, onSave }) {
	const [healthChecks, setHealthChecks] = useState(initial.healthChecks !== false);
	const [probeBlink, setProbeBlink] = useState(Boolean(initial.probeBlink));
	const infoBar = initial.infoBar !== false;
	return /* @__PURE__ */ jsxs("form", {
		id: "settings-form",
		className: "settings-stack",
		onSubmit: (e) => {
			e.preventDefault();
			onSave({
				...settingsBase(initial),
				healthChecks,
				probeBlink
			});
		},
		children: [
			/* @__PURE__ */ jsxs("div", {
				className: "settings-card",
				children: [
					/* @__PURE__ */ jsx("p", { className: "settings-kicker", children: t("reach.probes") }),
					/* @__PURE__ */ jsxs("div", {
						className: "settings-toggles",
						children: [
							/* @__PURE__ */ jsxs("label", { children: [/* @__PURE__ */ jsx("input", {
								type: "checkbox",
								checked: healthChecks,
								onChange: (e) => setHealthChecks(e.target.checked)
							}), t("reach.httpIcmp")] }),
							/* @__PURE__ */ jsxs("label", {
								className: infoBar && healthChecks ? "" : "is-disabled",
								children: [/* @__PURE__ */ jsx("input", {
									type: "checkbox",
									checked: probeBlink,
									disabled: !infoBar || !healthChecks,
									onChange: (e) => setProbeBlink(e.target.checked)
								}), t("reach.blink")]
							})
						]
					}),
					!infoBar ? /* @__PURE__ */ jsx("p", {
						className: "settings-hint",
						children: t("reach.infoHidden")
					}) : /* @__PURE__ */ jsx("p", {
						className: "settings-hint",
						children: t("reach.perCard")
					})
				]
			})
		]
	});
}
function SecurityForm({ initial, isDev, onSave }) {
	const [probeTlsVerify, setProbeTlsVerify] = useState(Boolean(initial.probeTlsVerify));
	const [probeAuthOnly, setProbeAuthOnly] = useState(Boolean(initial.probeAuthOnly));
	const [sessionHttpOnly, setSessionHttpOnly] = useState(Boolean(initial.sessionHttpOnly));
	const [devAdminNoPassword, setDevAdminNoPassword] = useState(Boolean(initial.devAdminNoPassword));
	return /* @__PURE__ */ jsxs("form", {
		id: "settings-form",
		className: "settings-stack",
		onSubmit: (e) => {
			e.preventDefault();
			onSave({
				...settingsBase(initial),
				probeTlsVerify,
				probeAuthOnly,
				sessionHttpOnly,
				devAdminNoPassword: isDev && devAdminNoPassword
			});
		},
		children: [
			/* @__PURE__ */ jsxs("div", {
				className: "settings-card",
				children: [
					/* @__PURE__ */ jsx("p", { className: "settings-kicker", children: t("reach.probes") }),
					/* @__PURE__ */ jsxs("div", {
						className: "settings-toggles",
						children: [
							/* @__PURE__ */ jsxs("label", { children: [/* @__PURE__ */ jsx("input", {
								type: "checkbox",
								checked: probeTlsVerify,
								onChange: (e) => setProbeTlsVerify(e.target.checked)
							}), t("sec.tls")] }),
							/* @__PURE__ */ jsxs("label", { children: [/* @__PURE__ */ jsx("input", {
								type: "checkbox",
								checked: probeAuthOnly,
								onChange: (e) => setProbeAuthOnly(e.target.checked)
							}), t("sec.authOnly")] })
						]
					}),
					/* @__PURE__ */ jsx("p", {
						className: "settings-hint",
						children: t("sec.tlsHint")
					})
				]
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "settings-card",
				children: [
					/* @__PURE__ */ jsx("p", { className: "settings-kicker", children: t("sec.session") }),
					/* @__PURE__ */ jsxs("div", {
						className: "settings-toggles",
						children: [
							/* @__PURE__ */ jsxs("label", { children: [/* @__PURE__ */ jsx("input", {
								type: "checkbox",
								checked: sessionHttpOnly,
								onChange: (e) => setSessionHttpOnly(e.target.checked)
							}), t("sec.httpOnly")] })
						]
					}),
					/* @__PURE__ */ jsx("p", {
						className: "settings-hint",
						children: t("sec.httpOnlyHint")
					})
				]
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "settings-card",
				children: [
					/* @__PURE__ */ jsx("p", { className: "settings-kicker", children: t("sec.dev") }),
					/* @__PURE__ */ jsxs("div", {
						className: "settings-toggles",
						children: [
							/* @__PURE__ */ jsxs("label", {
								className: isDev ? "" : "is-disabled",
								children: [/* @__PURE__ */ jsx("input", {
									type: "checkbox",
									checked: isDev && devAdminNoPassword,
									disabled: !isDev,
									onChange: (e) => setDevAdminNoPassword(e.target.checked)
								}), t("sec.noPassword")] })
						]
					}),
					/* @__PURE__ */ jsx("p", {
						className: "settings-hint",
						children: isDev ? t("sec.noPasswordHintDev") : t("sec.noPasswordHintProd")
					})
				]
			})
		]
	});
}
function DebugPanel({ settings, runtime, session }) {
	const s = settings || {};
	const r = runtime || {};
	const rows = [
		r.isDev ? {
			level: "warn",
			title: t("debug.devTitle"),
			detail: t("debug.devDetail")
		} : {
			level: "ok",
			title: t("debug.prodTitle"),
			detail: t("debug.prodDetail")
		},
		session?.mustChangePassword ? {
			level: "error",
			title: t("debug.weakTitle"),
			detail: t("debug.weakDetail")
		} : null,
		r.isDev && s.devAdminNoPassword ? {
			level: "error",
			title: t("debug.noPwTitle"),
			detail: t("debug.noPwDetail")
		} : null,
		s.oidcEnabled && !r.publicOrigin ? {
			level: "warn",
			title: t("debug.oidcOriginTitle"),
			detail: t("debug.oidcOriginDetail")
		} : null,
		s.oidcEnabled && !r.trustProxy ? {
			level: "warn",
			title: t("debug.proxyTitle"),
			detail: t("debug.proxyDetail")
		} : null,
		s.oidcAutoCreate ? {
			level: "warn",
			title: t("debug.autoCreateTitle"),
			detail: t("debug.autoCreateDetail")
		} : null,
		s.ldapEnabled && s.ldapTls === false ? {
			level: "warn",
			title: t("debug.ldapTlsTitle"),
			detail: t("debug.ldapTlsDetail")
		} : null,
		s.ldapAutoCreate ? {
			level: "warn",
			title: t("debug.ldapAutoTitle"),
			detail: t("debug.ldapAutoDetail")
		} : null,
		!s.sessionHttpOnly ? {
			level: "info",
			title: t("debug.tokenTitle"),
			detail: t("debug.tokenDetail")
		} : {
			level: "ok",
			title: t("debug.cookieTitle"),
			detail: t("debug.cookieDetail")
		},
		s.healthChecks !== false && !s.probeTlsVerify ? {
			level: "info",
			title: t("debug.tlsTitle"),
			detail: t("debug.tlsDetail")
		} : null,
		s.healthChecks !== false && !s.probeAuthOnly ? {
			level: "info",
			title: t("debug.publicTitle"),
			detail: t("debug.publicDetail")
		} : null
	].filter(Boolean);
	return /* @__PURE__ */ jsxs("div", {
		className: "settings-stack",
		children: [
			/* @__PURE__ */ jsx("p", {
				className: "settings-hint",
				children: t("debug.intro")
			}),
			rows.map((row) => /* @__PURE__ */ jsxs("div", {
				className: `debug-row is-${row.level}`,
				children: [
					/* @__PURE__ */ jsx("span", {
						className: "debug-level",
						children: row.level === "error" ? t("debug.critical") : row.level === "warn" ? t("debug.warn") : row.level === "ok" ? t("debug.ok") : t("debug.info")
					}),
					/* @__PURE__ */ jsxs("div", {
						children: [
							/* @__PURE__ */ jsx("p", {
								className: "debug-title",
								children: row.title
							}),
							/* @__PURE__ */ jsx("p", {
								className: "settings-hint",
								children: row.detail
							})
						]
					})
				]
			}, row.title))
		]
	});
}
function InfoBarForm({ initial, busy, onSave, onResetClicks }) {
	const [infoStats, setInfoStats] = useState(initial.infoStats !== false);
	const infoBar = initial.infoBar !== false;
	return /* @__PURE__ */ jsxs("form", {
		id: "settings-form",
		className: "settings-stack",
		onSubmit: (e) => {
			e.preventDefault();
			onSave({
				...settingsBase(initial),
				infoStats
			});
		},
		children: [
			/* @__PURE__ */ jsxs("div", {
				className: "settings-card",
				children: [
					/* @__PURE__ */ jsx("p", { className: "settings-kicker", children: t("stats.title") }),
					/* @__PURE__ */ jsxs("div", {
						className: "settings-toggles",
						children: [
							/* @__PURE__ */ jsxs("label", {
								className: infoBar ? "" : "is-disabled",
								children: [/* @__PURE__ */ jsx("input", {
									type: "checkbox",
									checked: infoStats,
									disabled: !infoBar,
									onChange: (e) => setInfoStats(e.target.checked)
								}), t("info.statsIcon")]
							})
						]
					}),
					/* @__PURE__ */ jsx("p", {
						className: "settings-hint",
						children: infoBar ? t("info.statsHint") : t("info.statsHintHidden")
					}),
					/* @__PURE__ */ jsx("hr", { className: "settings-card-sep" }),
					/* @__PURE__ */ jsx("p", {
						className: "settings-hint",
						children: t("info.resetHint")
					}),
					/* @__PURE__ */ jsx(Button, {
						type: "button",
						size: "sm",
						variant: "secondary",
						className: "settings-note-action h-9",
						disabled: busy || !onResetClicks,
						onClick: () => {
							if (!onResetClicks) return;
							if (!window.confirm(t("info.resetConfirm"))) return;
							onResetClicks();
						},
						children: t("info.resetAction")
					})
				]
			})
		]
	});
}
var THEME_COLOR_FIELDS = [
	{ id: "bg", cssVar: "--color-bg" },
	{ id: "surface", cssVar: "--color-surface" },
	{ id: "header", cssVar: "--color-header" }
];
var LIGHT_COLORS = {
	bg: "#fcfcfd",
	surface: "#ffffff",
	header: "#fcfcfc"
};
var DARK_COLORS = {
	bg: "#2d333b",
	surface: "#373e47",
	header: "#373e47"
};
var MANAGED_BLOCK_RE = /html\.(?:light|dark)\s*\{\s*(?:--color-(?:bg|surface|header)\s*:\s*#[0-9a-fA-F]{3,8}\s*;\s*)+\}/g;
function expandHex(raw) {
	const s = raw.trim();
	if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
	if (/^#[0-9a-fA-F]{3}$/.test(s)) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase();
	return null;
}
function hexLuma(raw) {
	const hex = expandHex(String(raw || ""));
	if (!hex) return 1;
	const r = parseInt(hex.slice(1, 3), 16) / 255;
	const g = parseInt(hex.slice(3, 5), 16) / 255;
	const b = parseInt(hex.slice(5, 7), 16) / 255;
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function parseThemeCss(css, fallback) {
	const colors = { ...fallback };
	for (const field of THEME_COLOR_FIELDS) {
		const re = new RegExp(`${field.cssVar.replace(/-/g, "\\-")}\\s*:\\s*(#[0-9a-fA-F]{3,8})`, "g");
		let match;
		let last = null;
		while (match = re.exec(css)) last = match[1];
		const hex = last ? expandHex(last) : null;
		if (hex) colors[field.id] = hex;
	}
	return {
		colors,
		extra: css.replace(MANAGED_BLOCK_RE, "").trim()
	};
}
function composeThemeCss(mode, colors, extra) {
	const block = `html.${mode} {\n  --color-bg: ${colors.bg};\n  --color-surface: ${colors.surface};\n  --color-header: ${colors.header};\n}`;
	const rest = extra.trim();
	return rest ? `${rest}\n${block}\n` : `${block}\n`;
}
function ThemeColorField({ label, value, onChange }) {
	return /* @__PURE__ */ jsxs("label", {
		className: "theme-chip",
		children: [
			/* @__PURE__ */ jsx("span", { children: label }),
			/* @__PURE__ */ jsxs("span", {
				className: `theme-hex${hexLuma(value) < 0.55 ? " is-dark" : ""}`,
				style: { background: value },
				children: [
					/* @__PURE__ */ jsx("input", {
						type: "color",
						value,
						"aria-label": `${label} (hex ${value})`,
						title: value,
						onChange: (e) => onChange(e.target.value.toLowerCase())
					}),
					/* @__PURE__ */ jsx("span", {
						className: "theme-hex-code",
						children: value
					})
				]
			})
		]
	});
}
function ThemeForm({ initial, busy, onCancel, onSave }) {
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
	const defaults = pane === "light" ? LIGHT_COLORS : DARK_COLORS;
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
			const css = theme === "dark" ? composeThemeCss("dark", darkColors, darkExtra) : composeThemeCss("light", lightColors, lightExtra);
			el.textContent = sanitizeThemeCss(css);
		});
		return () => cancelAnimationFrame(frame);
	}, [
		theme,
		lightColors,
		darkColors,
		lightExtra,
		darkExtra
	]);
	return /* @__PURE__ */ jsxs("form", {
		id: "settings-form",
		className: "settings-stack",
		onSubmit: (e) => {
			e.preventDefault();
			onSave({
				cssLight: composeThemeCss("light", lightColors, lightExtra),
				cssDark: composeThemeCss("dark", darkColors, darkExtra)
			});
		},
		children: [
			/* @__PURE__ */ jsxs("div", {
				className: "settings-card",
				children: [
					/* @__PURE__ */ jsx("p", { className: "settings-kicker", children: t("theme.colors") }),
					/* @__PURE__ */ jsxs("div", {
						className: "theme-switch",
						children: [
							/* @__PURE__ */ jsx("button", {
								type: "button",
								className: pane === "light" ? "is-on" : "",
								onClick: () => {
									setPane("light");
									apply("light");
								},
								children: t("theme.light")
							}),
							/* @__PURE__ */ jsx("button", {
								type: "button",
								className: pane === "dark" ? "is-on" : "",
								onClick: () => {
									setPane("dark");
									apply("dark");
								},
								children: t("theme.dark")
							})
						]
					}),
					/* @__PURE__ */ jsx("div", {
						className: "theme-palette",
						children: THEME_COLOR_FIELDS.map((field) => /* @__PURE__ */ jsx(ThemeColorField, {
							label: t(`theme.${field.id}`),
							value: colors[field.id],
							onChange: (next) => setColors((prev) => ({
								...prev,
								[field.id]: next
							}))
						}, field.id))
					})
				]
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "settings-card",
				children: [
					/* @__PURE__ */ jsx("p", { className: "settings-kicker", children: t("theme.css") }),
					/* @__PURE__ */ jsx("textarea", {
						className: "field-input theme-extra-css w-full resize-y rounded-lg border border-border bg-elevated/80 p-2.5 font-mono text-xs leading-relaxed text-fg outline-none placeholder:text-subtle",
						value: extra,
						spellCheck: false,
						maxLength: CSS_MAX,
						placeholder: t("theme.cssHint"),
						onChange: (e) => setExtra(e.target.value)
					}),
					/* @__PURE__ */ jsxs("div", {
						className: "theme-css-meta",
						children: [
							/* @__PURE__ */ jsxs("span", {
								className: "text-xs tabular-nums text-subtle",
								children: [extra.length.toLocaleString(localeTag()), " / ", CSS_MAX.toLocaleString(localeTag())]
							}),
							/* @__PURE__ */ jsx("button", {
								type: "button",
								className: "settings-link",
								onClick: () => {
									setColors(defaults);
									setExtra("");
								},
								children: t("theme.reset")
							})
						]
					})
				]
			})
		]
	});
}
function LockForm({ busy, oidcEnabled, oidcLabel, ldapEnabled, ldapDomain, loginOrder, noPassword, onCancel, onUnlock, onOidc }) {
	const [username, setUsername] = useState(noPassword ? "admin" : "");
	const [password, setPassword] = useState("");
	const showDomain = Boolean(ldapEnabled) && Boolean(ldapDomain);
	const domainOptions = [];
	for (const id of Array.isArray(loginOrder) && loginOrder.length ? loginOrder : ["local", "ad"]) {
		if (id === "local") domainOptions.push({
			value: "local",
			label: t("lock.local")
		});
		else if (id === "ad" && showDomain) domainOptions.push({
			value: "ad",
			label: ldapDomain
		});
	}
	if (!domainOptions.some((o) => o.value === "local")) domainOptions.unshift({
		value: "local",
		label: t("lock.local")
	});
	const [domain, setDomain] = useState(domainOptions[0]?.value || "local");
	return /* @__PURE__ */ jsxs("form", {
		className: "settings-stack",
		onSubmit: (e) => {
			e.preventDefault();
			onUnlock(username.trim() || "admin", password, showDomain ? domain : "local");
		},
		children: [
			/* @__PURE__ */ jsxs("div", {
				className: "mb-4 flex items-center justify-between",
				children: [/* @__PURE__ */ jsx("h3", {
					className: "dialog-title",
					children: t("account.login")
				}), /* @__PURE__ */ jsx(Button, {
					type: "button",
					variant: "ghost",
					size: "icon-sm",
					onClick: onCancel,
					children: /* @__PURE__ */ jsx(X, { className: "size-4" })
				})]
			}),
			/* @__PURE__ */ jsxs("label", {
				className: "settings-field",
				children: [/* @__PURE__ */ jsx("span", {
					className: "mb-1.5 block text-sm font-medium text-muted",
					children: t("lock.username")
				}), /* @__PURE__ */ jsx("input", {
					className: inputClass,
					value: username,
					onChange: (e) => setUsername(e.target.value),
					autoComplete: "username",
					autoFocus: true,
					required: true
				})]
			}),
			/* @__PURE__ */ jsxs("label", {
				className: "settings-field",
				children: [/* @__PURE__ */ jsx("span", {
					className: "mb-1.5 block text-sm font-medium text-muted",
					children: t("lock.password")
				}), /* @__PURE__ */ jsx("input", {
					type: "password",
					className: inputClass,
					value: password,
					onChange: (e) => setPassword(e.target.value),
					autoComplete: "current-password",
					required: !noPassword
				})]
			}),
			showDomain ? /* @__PURE__ */ jsxs("label", {
				className: "settings-field",
				children: [
					/* @__PURE__ */ jsx("span", {
						className: "mb-1.5 block text-sm font-medium text-muted",
						children: t("lock.domain")
					}),
					/* @__PURE__ */ jsxs("select", {
						className: inputClass,
						value: domain,
						onChange: (e) => setDomain(e.target.value),
						children: domainOptions.map((opt) => /* @__PURE__ */ jsx("option", {
							value: opt.value,
							children: opt.label
						}, opt.value))
					})
				]
			}) : null,
			oidcEnabled ? /* @__PURE__ */ jsxs(Fragment, {
				children: [
					/* @__PURE__ */ jsx("p", {
						className: "settings-hint",
						children: t("lock.or")
					}),
					/* @__PURE__ */ jsx(Button, {
						type: "button",
						variant: "secondary",
						disabled: busy,
						onClick: () => void onOidc?.(),
						children: oidcLabel || "SSO"
					})
				]
			}) : null,
			/* @__PURE__ */ jsxs("div", {
				className: noPassword ? "settings-actions lock-actions" : "settings-actions",
				children: [
					noPassword ? /* @__PURE__ */ jsx(Button, {
						type: "button",
						variant: "debug",
						disabled: busy,
						onClick: () => onUnlock("admin", "", "local"),
						children: t("lock.enterAdmin")
					}) : null,
					/* @__PURE__ */ jsxs("div", {
						className: "lock-actions-main",
						children: [
							/* @__PURE__ */ jsx(Button, {
								type: "button",
								variant: "secondary",
								onClick: onCancel,
								children: t("actions.cancel")
							}),
							/* @__PURE__ */ jsx(Button, {
								type: "submit",
								disabled: busy,
								children: t("account.login")
							})
						]
					})
				]
			})
		]
	});
}
function roleLabel(role) {
	if (role === "admin") return t("users.admin");
	if (role === "editeur") return t("access.roleEditeur");
	return t("access.roleLecteur");
}
function accessSummary(user, tabs) {
	const list = tabs || [];
	if (user.role === "editeur") {
		const names = list.filter((t) => (user.editTabIds || []).includes(t.id)).map((t) => t.name);
		if (!names.length) return t("users.noSpaces");
		return names.join(", ");
	}
	const locked = list.filter((t) => t.restricted && (user.viewTabIds || []).includes(t.id)).map((t) => t.name);
	if (!locked.length) return t("users.publicSpaces");
	return t("users.publicPlus", { list: locked.join(", ") });
}
function catSummary(user, tabs) {
	const ids = new Set(user.viewCatIds || []);
	const names = [];
	for (const tab of tabs || []) for (const cat of tab.categories || []) {
		if (ids.has(cat.id)) names.push(cat.name);
	}
	return names.length ? names.join(", ") : "—";
}
function emptyUserDraft(role) {
	return {
		kind: "user",
		id: "",
		username: "",
		password: "",
		role: role || "editeur",
		viewTabIds: [],
		editTabIds: [],
		viewCatIds: [],
		groupIds: [],
		canCreateTabs: false
	};
}
function emptyGroupDraft() {
	return {
		kind: "group",
		id: "",
		name: "",
		role: "lecteur",
		members: [],
		viewTabIds: [],
		editTabIds: [],
		viewCatIds: [],
		canCreateTabs: false
	};
}
function AccessFrame({ token, session, tabs, settings, busy, onClose, onSaveOidc, onSaveLdap, onSaveLoginOrder }) {
	const [section, setSection] = useState("users");
	const canAccess = Boolean(session?.canManageUsers || session?.canManageGroups || session?.canManageRoles || session?.role === "admin");
	const canSettings = Boolean(session?.canManageSettings || session?.role === "admin");
	const pane = canAccess || canSettings ? section : "users";
	const current = pane === "ldap"
		? { label: t("access.ldap"), lead: t("access.ldapLead") }
		: pane === "oidc"
			? { label: t("access.oidc"), lead: t("access.oidcLead") }
			: pane === "entra"
				? { label: t("access.entra"), lead: t("access.entraLead") }
				: pane === "auth"
					? { label: t("access.auth"), lead: t("access.authLead") }
					: pane === "groups"
						? { label: t("access.groups"), lead: t("access.groupsLead") }
						: pane === "roles"
							? { label: t("access.roles"), lead: t("access.rolesLead") }
							: { label: t("access.users"), lead: t("access.usersLead") };
	const accessPane = pane === "users" || pane === "groups" || pane === "roles";
	return /* @__PURE__ */ jsxs("div", {
		className: `settings-frame is-wide${accessPane ? " is-access" : ""}`,
		children: [
			/* @__PURE__ */ jsxs("nav", {
				className: "settings-nav",
				"aria-label": t("access.sectionsAria"),
				children: [
					/* @__PURE__ */ jsx("p", { className: "menu-title", children: t("access.title") }),
					/* @__PURE__ */ jsxs("button", {
						type: "button",
						className: `settings-nav-item ${pane === "users" ? "is-on" : ""}`,
						onClick: () => setSection("users"),
						children: [
							/* @__PURE__ */ jsx(Users, { className: "size-4 shrink-0" }),
							t("access.users")
						]
					}),
					canAccess ? /* @__PURE__ */ jsxs("button", {
						type: "button",
						className: `settings-nav-item ${pane === "groups" ? "is-on" : ""}`,
						onClick: () => setSection("groups"),
						children: [
							/* @__PURE__ */ jsx(Folder, { className: "size-4 shrink-0" }),
							t("access.groups")
						]
					}) : null,
					canAccess ? /* @__PURE__ */ jsxs("button", {
						type: "button",
						className: `settings-nav-item ${pane === "roles" ? "is-on" : ""}`,
						onClick: () => setSection("roles"),
						children: [
							/* @__PURE__ */ jsx(Shield, { className: "size-4 shrink-0" }),
							t("access.roles")
						]
					}) : null,
					canSettings ? /* @__PURE__ */ jsxs(Fragment, {
						children: [
							/* @__PURE__ */ jsxs("button", {
								type: "button",
								className: `settings-nav-item ${pane === "auth" ? "is-on" : ""}`,
								onClick: () => setSection("auth"),
								children: [
									/* @__PURE__ */ jsx(LogIn, { className: "size-4 shrink-0" }),
									t("access.auth")
								]
							}),
							/* @__PURE__ */ jsxs("button", {
								type: "button",
								className: `settings-nav-item is-sub ${pane === "ldap" ? "is-on" : ""}`,
								onClick: () => setSection("ldap"),
								children: [
									/* @__PURE__ */ jsx(Server, { className: "size-4 shrink-0" }),
									t("access.ldap")
								]
							}),
							/* @__PURE__ */ jsxs("button", {
								type: "button",
								className: `settings-nav-item is-sub ${pane === "oidc" ? "is-on" : ""}`,
								onClick: () => setSection("oidc"),
								children: [
									/* @__PURE__ */ jsx(KeyRound, { className: "size-4 shrink-0" }),
									t("access.oidc")
								]
							}),
							/* @__PURE__ */ jsxs("button", {
								type: "button",
								className: `settings-nav-item is-sub ${pane === "entra" ? "is-on" : ""}`,
								onClick: () => setSection("entra"),
								children: [
									/* @__PURE__ */ jsx(Cloud, { className: "size-4 shrink-0" }),
									t("access.entra")
								]
							})
						]
					}) : null
				]
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "settings-body",
				children: [
					/* @__PURE__ */ jsxs("div", {
						className: "settings-head",
						children: [
							/* @__PURE__ */ jsxs("div", {
								className: "settings-head-copy",
								children: [
									/* @__PURE__ */ jsx("h3", { className: "dialog-title", children: current.label }),
									/* @__PURE__ */ jsx("p", { className: "settings-lead", children: current.lead })
								]
							}),
							/* @__PURE__ */ jsx(Button, {
								type: "button",
								variant: "ghost",
								size: "icon-sm",
								onClick: onClose,
								"aria-label": t("actions.close"),
								children: /* @__PURE__ */ jsx(X, { className: "size-4" })
							})
						]
					}),
					/* @__PURE__ */ jsx("div", {
						className: `settings-pane${accessPane ? " is-access" : ""}`,
						children: pane === "auth" ? /* @__PURE__ */ jsx(LoginOrderPanel, {
							settings,
							busy,
							onSave: onSaveLoginOrder
						}) : pane === "ldap" ? /* @__PURE__ */ jsx(LdapForm, {
							initial: settings,
							busy,
							onSave: onSaveLdap
						}) : pane === "oidc" ? /* @__PURE__ */ jsx(OidcForm, {
							initial: settings,
							busy,
							onSave: onSaveOidc
						}) : pane === "entra" ? /* @__PURE__ */ jsxs("div", {
							className: "settings-card",
							children: [
								/* @__PURE__ */ jsx("p", { className: "settings-hint", children: t("access.entraSoon") })
							]
						}) : pane === "roles" ? /* @__PURE__ */ jsx(AccessRoles, {
							token,
							actor: session,
							tabs
						}) : pane === "groups" ? /* @__PURE__ */ jsx(AccessGroups, {
							token,
							actor: session,
							tabs
						}) : /* @__PURE__ */ jsx(AccessUsers, {
							token,
							actor: session,
							tabs
						})
					})
				]
			})
		]
	});
}
function LoginOrderPanel({ settings, busy, onSave }) {
	const listRef = useRef(null);
	const dragRef = useRef(null);
	const orderRef = useRef(["local", "ad"]);
	const [dragKey, setDragKey] = useState(null);
	const [order, setOrder] = useState(() => Array.isArray(settings.loginOrder) && settings.loginOrder.length ? settings.loginOrder : ["local", "ad"]);
	orderRef.current = order;
	const ldapLabel = String(settings.ldapDomain || "").trim() || t("access.ldap");
	const ldapOn = Boolean(settings.ldapEnabled);
	const rows = order.map((id) => ({
		key: id,
		id,
		label: id === "ad" ? ldapLabel : t("lock.local"),
		off: id === "ad" && !ldapOn
	}));
	function endDrag(el, pointerId) {
		dragRef.current = null;
		setDragKey(null);
		try {
			el?.releasePointerCapture(pointerId);
		} catch {}
	}
	function onGripDown(e, key) {
		if (rows.length < 2 || e.button !== 0) return;
		e.preventDefault();
		e.stopPropagation();
		e.currentTarget.setPointerCapture(e.pointerId);
		dragRef.current = {
			key,
			pointerId: e.pointerId
		};
		setDragKey(key);
	}
	function onGripMove(e) {
		const drag = dragRef.current;
		if (!drag || drag.pointerId !== e.pointerId) return;
		const root = listRef.current;
		if (!root) return;
		const others = [...root.querySelectorAll("[data-link-key]")].filter((row) => row.getAttribute("data-link-key") !== drag.key);
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
			const rest = cur.filter((id) => id !== drag.key);
			rest.splice(to, 0, cur[from]);
			orderRef.current = rest;
			return rest;
		});
	}
	function onGripUp(e) {
		const drag = dragRef.current;
		if (!drag || drag.pointerId !== e.pointerId) return;
		endDrag(e.currentTarget, e.pointerId);
		onSave?.(orderRef.current);
	}
	return /* @__PURE__ */ jsxs("div", {
		className: "settings-stack",
		children: [
			/* @__PURE__ */ jsx("p", {
				className: "settings-kicker",
				children: t("access.loginList")
			}),
			/* @__PURE__ */ jsx("div", {
				ref: listRef,
				className: `extra-links${dragKey ? " is-sorting" : ""}`,
				children: rows.map((row, i) => /* @__PURE__ */ jsxs("div", {
					className: `extra-link login-order-row${dragKey === row.key ? " is-dragging" : ""}${row.off ? " is-off" : ""}`,
					"data-link-key": row.key,
					children: [
						rows.length > 1 ? /* @__PURE__ */ jsx("button", {
							type: "button",
							className: "extra-link-grip",
							"aria-label": t("item.dragReorder"),
							disabled: busy,
							onPointerDown: (e) => onGripDown(e, row.key),
							onPointerMove: onGripMove,
							onPointerUp: onGripUp,
							onPointerCancel: onGripUp,
							children: /* @__PURE__ */ jsx(GripVertical, { className: "size-4" })
						}) : null,
						/* @__PURE__ */ jsx("span", {
							className: "login-order-name",
							children: row.label
						}),
						i === 0 ? /* @__PURE__ */ jsx("span", {
							className: "user-role",
							children: t("access.loginDefault")
						}) : row.off ? /* @__PURE__ */ jsx("span", {
							className: "user-role",
							children: t("access.loginOff")
						}) : null
					]
				}, row.key))
			})
		]
	});
}
function IconPicker({ value, onChange, token, library, onLibrary, online, siteUrl, pictosOnly }) {
	const [open, setOpen] = useState(false);
	const [q, setQ] = useState("");
	const [remote, setRemote] = useState([]);
	const [busyIcon, setBusyIcon] = useState(false);
	const query = q.trim().toLowerCase();
	const products = query ? PRODUCT_ICONS.filter((p) => p.label.toLowerCase().includes(query) || p.slug.includes(query)) : PRODUCT_ICONS;
	useEffect(() => {
		if (!open || pictosOnly || !online || query.length < 2) {
			if (!open || pictosOnly || query.length < 2) setRemote([]);
			return;
		}
		const ctrl = new AbortController();
		const t = setTimeout(() => {
			fetch(`https://api.iconify.design/search?query=${encodeURIComponent(query)}&limit=48`, { signal: ctrl.signal }).then((r) => r.json()).then((json) => {
				const ids = (json.icons ?? []).slice(0, 48);
				setRemote(ids.map((id) => ({
					id,
					src: iconifySrc(id)
				})).filter((x) => x.src));
			}).catch(() => {});
		}, 250);
		return () => {
			clearTimeout(t);
			ctrl.abort();
		};
	}, [query, online, open, pictosOnly]);
	useEffect(() => {
		if (!open) return;
		const onKey = (e) => {
			if (e.key !== "Escape") return;
			e.preventDefault();
			e.stopImmediatePropagation();
			setOpen(false);
		};
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	}, [open]);
	function choose(next) {
		onChange(next);
		setOpen(false);
	}
	async function pickRemote(src) {
		setBusyIcon(true);
		try {
			choose(await urlToDataUrl(src));
		} catch (err) {
			toast.error(te(err));
		} finally {
			setBusyIcon(false);
		}
	}
	async function importFile(file) {
		if (!file) return;
		setBusyIcon(true);
		try {
			const dataUrl = await fileToDataUrl(file);
			const name = file.name.replace(/\.[^.]+$/, "").slice(0, 80) || "icone";
			if (token) onLibrary(await saveCustomIcon({ data: {
				token,
				name,
				dataUrl
			} }));
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
		if (current && current !== "Link" && current !== "AppWindow" && !window.confirm(t("icons.replaceConfirm"))) return;
		setBusyIcon(true);
		try {
			const row = await grabSiteFavicon({ data: { token, url: href } });
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
	const panel = open && typeof document !== "undefined" ? createPortal(/* @__PURE__ */ jsx("div", {
		className: "fixed inset-0 z-50 flex items-end justify-center bg-bg/75 p-0 backdrop-blur-sm sm:items-center sm:p-4",
		onClick: () => setOpen(false),
		role: "presentation",
		children: /* @__PURE__ */ jsxs("div", {
			className: "flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-xl bg-surface shadow-card-hover sm:rounded-xl",
			onClick: (e) => e.stopPropagation(),
			onWheel: (e) => e.stopPropagation(),
			onTouchMove: (e) => e.stopPropagation(),
			role: "dialog",
			"aria-modal": "true",
			"aria-label": t("icons.choose"),
			children: [
				/* @__PURE__ */ jsxs("div", {
					className: "icon-pick-head",
					children: [
						/* @__PURE__ */ jsx("h3", {
							className: "dialog-title",
							children: t("item.icon")
						}),
						/* @__PURE__ */ jsx(Button, {
							type: "button",
							variant: "ghost",
							size: "icon-sm",
							onClick: () => setOpen(false),
							children: /* @__PURE__ */ jsx(X, { className: "size-4" })
						})
					]
				}),
				/* @__PURE__ */ jsxs("div", {
					className: "icon-pick-body",
					children: [
						/* @__PURE__ */ jsxs("div", {
							className: "icon-pick-current",
							children: [
								/* @__PURE__ */ jsx("span", {
									className: "flex size-11 items-center justify-center rounded-lg bg-elevated text-primary",
									children: /* @__PURE__ */ jsx(PortalIcon, {
										name: value,
										className: "size-6"
									})
								}),
								/* @__PURE__ */ jsx("p", {
									className: "min-w-0 flex-1 truncate text-sm text-muted",
									children: value.startsWith("data:") ? t("icons.importedLocal") : value || t("icons.none")
								})
							]
						}),
						!pictosOnly ? /* @__PURE__ */ jsxs("div", {
							className: "icon-pick-actions",
							children: [
								siteUrl != null ? /* @__PURE__ */ jsxs(Fragment, {
									children: [
										/* @__PURE__ */ jsxs(Button, {
											type: "button",
											variant: "secondary",
											className: "w-full",
											disabled: busyIcon || !token,
											onClick: () => void grabFavicon(),
											children: [
												/* @__PURE__ */ jsx(Globe, { className: "size-4" }),
												busyIcon ? t("icons.fetching") : t("icons.siteFavicon")
											]
										}),
										/* @__PURE__ */ jsx("p", {
											className: "icon-pick-kicker",
											children: t("icons.faviconHint")
										})
									]
								}) : null,
								/* @__PURE__ */ jsxs("label", {
									className: "inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-elevated px-3 text-sm",
									children: [
										/* @__PURE__ */ jsx(Upload, { className: "size-4" }),
										t("icons.importPng"),
										/* @__PURE__ */ jsx("input", {
											type: "file",
											accept: "image/png,image/svg+xml,image/webp,image/jpeg,image/gif,image/x-icon,.png,.svg,.webp,.jpg,.jpeg,.ico",
											className: "hidden",
											disabled: busyIcon,
											onChange: (e) => {
												const file = e.target.files?.[0];
												e.target.value = "";
												importFile(file);
											}
										})
									]
								})
							]
						}) : null,
						/* @__PURE__ */ jsxs("div", {
							className: "icon-pick-section",
							children: [
								/* @__PURE__ */ jsx("input", {
									className: inputClass,
									value: q,
									onChange: (e) => setQ(e.target.value),
									placeholder: pictosOnly || !online ? t("icons.filterLib") : t("icons.filterOnline")
								}),
								!pictosOnly && !online ? /* @__PURE__ */ jsx("p", {
									className: "icon-pick-kicker",
									children: t("icons.offlineHint")
								}) : null
							]
						}),
						!pictosOnly && library.length > 0 ? /* @__PURE__ */ jsxs("div", {
							className: "icon-pick-section",
							children: [
								/* @__PURE__ */ jsx("p", {
									className: "icon-pick-kicker",
									children: t("icons.imported")
								}),
								/* @__PURE__ */ jsx("div", {
									className: "grid max-h-28 grid-cols-7 gap-1 overflow-y-auto sm:grid-cols-8",
									children: library.map((p) => /* @__PURE__ */ jsxs("button", {
										type: "button",
										title: p.name,
										onClick: () => choose(p.dataUrl),
										className: `flex size-10 items-center justify-center rounded-md border ${value === p.dataUrl ? "border-primary bg-elevated" : "border-transparent hover:bg-elevated"}`,
										children: [/* @__PURE__ */ jsx("img", {
											src: p.dataUrl,
											alt: "",
											className: "size-5 object-contain"
										})]
									}, p.id))
								})
							]
						}) : null,
						!pictosOnly && remote.length > 0 ? /* @__PURE__ */ jsxs("div", {
							className: "icon-pick-section",
							children: [
								/* @__PURE__ */ jsx("p", {
									className: "icon-pick-kicker",
									children: t("icons.onlineClick")
								}),
								/* @__PURE__ */ jsx("div", {
									className: "grid max-h-36 grid-cols-7 gap-1 overflow-y-auto sm:grid-cols-8",
									children: remote.map((p) => /* @__PURE__ */ jsxs("button", {
										type: "button",
										title: t("icons.copiedLocal", { id: p.id }),
										onClick: () => void pickRemote(p.src),
										className: "flex size-10 items-center justify-center rounded-md border border-transparent hover:bg-elevated",
										children: [/* @__PURE__ */ jsx("img", {
											src: p.src,
											alt: "",
											className: "size-5 object-contain",
											loading: "lazy",
											referrerPolicy: "no-referrer"
										})]
									}, p.id))
								})
							]
						}) : null,
						!pictosOnly ? /* @__PURE__ */ jsxs("div", {
							className: "icon-pick-section",
							children: [
								/* @__PURE__ */ jsx("p", {
									className: "icon-pick-kicker",
									children: t("icons.product")
								}),
								/* @__PURE__ */ jsx("div", {
									className: "grid max-h-48 grid-cols-7 gap-1 overflow-y-auto sm:grid-cols-8",
									children: products.map((p) => /* @__PURE__ */ jsxs("button", {
										type: "button",
										title: p.label,
										onClick: () => choose(p.slug),
										className: `flex size-10 items-center justify-center rounded-md border ${value === p.slug ? "border-primary bg-elevated" : "border-transparent hover:bg-elevated"}`,
										children: [/* @__PURE__ */ jsx("img", {
											src: p.src,
											alt: "",
											className: "size-5 object-contain",
											loading: "lazy"
										})]
									}, p.slug))
								})
							]
						}) : null,
						/* @__PURE__ */ jsxs("div", {
							className: "icon-pick-section",
							children: [
								/* @__PURE__ */ jsx("p", {
									className: "icon-pick-kicker",
									children: t("icons.symbols")
								}),
								/* @__PURE__ */ jsx("div", {
									className: "grid grid-cols-7 gap-1 sm:grid-cols-8",
									children: (query ? ICON_OPTIONS.filter((opt) => t(`iconLabel.${opt.name}`).toLowerCase().includes(query) || opt.label.toLowerCase().includes(query) || opt.name.toLowerCase().includes(query)) : ICON_OPTIONS).map((opt) => /* @__PURE__ */ jsxs("button", {
										type: "button",
										title: t(`iconLabel.${opt.name}`),
										onClick: () => choose(opt.name),
										className: `flex size-10 items-center justify-center rounded-md border ${value === opt.name ? "border-primary bg-elevated text-primary" : "border-transparent text-muted hover:bg-elevated hover:text-fg"}`,
										children: [/* @__PURE__ */ jsx(opt.Icon, { className: "size-4" })]
									}, opt.name))
								})
							]
						})
					]
				})
			]
		})
	}), document.body) : null;
	return /* @__PURE__ */ jsxs(Fragment, {
		children: [
			/* @__PURE__ */ jsx("button", {
				type: "button",
				className: "brand-preview icon-trigger",
				title: t("icons.choose"),
				"aria-label": t("icons.choose"),
				onClick: () => setOpen(true),
				children: /* @__PURE__ */ jsx(PortalIcon, {
					name: value,
					className: "size-6"
				})
			}),
			panel
		]
	});
}
function AclFields({ restricted, setRestricted, seeHint }) {
	return /* @__PURE__ */ jsxs("div", {
		className: "settings-card",
		children: [
			/* @__PURE__ */ jsx("p", { className: "settings-kicker", children: t("space.visibility") }),
			/* @__PURE__ */ jsx("p", { className: "settings-hint", children: seeHint }),
			/* @__PURE__ */ jsxs("label", {
				className: "mb-2 flex h-10 items-center gap-2 text-sm",
				children: [/* @__PURE__ */ jsx("input", {
					type: "checkbox",
					checked: restricted,
					onChange: (e) => setRestricted(e.target.checked)
				}), t("space.restrict")]
			}),
			restricted ? /* @__PURE__ */ jsx("p", {
				className: "text-xs text-muted",
				children: t("access.restrictedHint")
			}) : null
		]
	});
}
function TabForm({ initial, busy, picker, people, canAcl, onCancel, onSave }) {
	const [name, setName] = useState(initial?.name ?? "");
	const [icon, setIcon] = useState(initial?.icon ?? "Layers");
	const [restricted, setRestricted] = useState(Boolean(initial?.restricted));
	const [hideLabel, setHideLabel] = useState(Boolean(initial?.hideLabel));
	const [viewers, setViewers] = useState(initial?.viewers ?? []);
	const [editors, setEditors] = useState(initial?.editors ?? []);
	const [pane, setPane] = useState("general");
	const sections = [
		{ id: "general", label: t("item.general"), icon: Settings2, lead: t("space.generalLead") },
		...(canAcl ? [{ id: "permissions", label: t("item.permissions"), icon: Shield, lead: t("space.permLead") }] : [])
	];
	const current = sections.find((s) => s.id === pane) ?? sections[0];
	return /* @__PURE__ */ jsxs("form", {
		className: "settings-frame",
		onSubmit: (e) => {
			e.preventDefault();
			onSave(name.trim(), icon.trim() || "Layers", {
				restricted,
				viewers,
				editors,
				hideLabel
			});
		},
		children: [
			/* @__PURE__ */ jsxs("nav", {
				className: "settings-nav",
				"aria-label": "Sections",
				children: [
					/* @__PURE__ */ jsx("p", { className: "menu-title", children: initial ? t("aria.editSpace") : t("space.create") }),
					sections.map((s) => /* @__PURE__ */ jsxs("button", {
						type: "button",
						className: `settings-nav-item ${pane === s.id ? "is-on" : ""}`,
						onClick: () => setPane(s.id),
						children: [/* @__PURE__ */ jsx(s.icon, { className: "size-4 shrink-0" }), s.label]
					}, s.id))
				]
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "settings-body",
				children: [
					/* @__PURE__ */ jsxs("div", {
						className: "settings-head",
						children: [
							/* @__PURE__ */ jsxs("div", {
								className: "settings-head-copy",
								children: [
									/* @__PURE__ */ jsx("h3", { className: "dialog-title", children: current.label }),
									/* @__PURE__ */ jsx("p", { className: "settings-lead", children: current.lead })
								]
							}),
							/* @__PURE__ */ jsx(Button, {
								type: "button",
								variant: "ghost",
								size: "icon-sm",
								onClick: onCancel,
								"aria-label": t("actions.close"),
								children: /* @__PURE__ */ jsx(X, { className: "size-4" })
							})
						]
					}),
					/* @__PURE__ */ jsx("div", {
						className: "settings-pane",
						children: pane === "permissions" && canAcl ? /* @__PURE__ */ jsx("div", {
							className: "settings-stack",
							children: /* @__PURE__ */ jsx(AclFields, {
								restricted,
								setRestricted,
								viewers,
								setViewers,
								editors,
								setEditors,
								people,
								seeHint: t("space.seeHint"),
								editHint: t("space.editHint")
							})
						}) : /* @__PURE__ */ jsxs("div", {
							className: "settings-stack",
							children: [
								/* @__PURE__ */ jsx(Field, {
									label: t("item.name"),
									children: /* @__PURE__ */ jsx("input", {
										className: inputClass,
										value: name,
										onChange: (e) => setName(e.target.value),
										required: true
									})
								}),
								/* @__PURE__ */ jsx(Field, {
									label: t("item.icon"),
									children: /* @__PURE__ */ jsx(IconPicker, {
										value: icon,
										onChange: setIcon,
										...picker,
										pictosOnly: !picker.navRichIcons
									})
								}),
								/* @__PURE__ */ jsxs("div", {
									className: "settings-toggles",
									children: [/* @__PURE__ */ jsxs("label", {
										children: [/* @__PURE__ */ jsx("input", {
											type: "checkbox",
											checked: hideLabel,
											onChange: (e) => setHideLabel(e.target.checked)
										}), t("space.hideLabel")]
									})]
								})
							]
						})
					}),
					/* @__PURE__ */ jsx(FormActions, { busy, onCancel })
				]
			})
		]
	});
}
function FavsForm({ hideLabel: initialHide, busy, onCancel, onSave }) {
	const [hideLabel, setHideLabel] = useState(Boolean(initialHide));
	return /* @__PURE__ */ jsxs("form", {
		onSubmit: (e) => {
			e.preventDefault();
			onSave(hideLabel);
		},
		children: [
			/* @__PURE__ */ jsxs("div", {
				className: "mb-4 flex items-center justify-between",
				children: [/* @__PURE__ */ jsx("h3", {
					className: "dialog-title",
					children: t("aria.editSpace")
				}), /* @__PURE__ */ jsx(Button, {
					type: "button",
					variant: "ghost",
					size: "icon-sm",
					onClick: onCancel,
					children: /* @__PURE__ */ jsx(X, { className: "size-4" })
				})]
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "settings-toggles",
				children: [/* @__PURE__ */ jsxs("label", { children: [/* @__PURE__ */ jsx("input", {
					type: "checkbox",
					checked: hideLabel,
					onChange: (e) => setHideLabel(e.target.checked)
				}), t("space.hideLabel")] })]
			}),
			/* @__PURE__ */ jsx(FormActions, {
				busy,
				onCancel
			})
		]
	});
}
function CategoryForm({ initial, busy, picker, people, canAcl, onCancel, onSave }) {
	const [name, setName] = useState(initial?.name ?? "");
	const [icon, setIcon] = useState(initial?.icon ?? "Folder");
	const [restricted, setRestricted] = useState(Boolean(initial?.restricted));
	const [viewers, setViewers] = useState(initial?.viewers ?? []);
	const [editors, setEditors] = useState(initial?.editors ?? []);
	const [pane, setPane] = useState("general");
	const sections = [
		{ id: "general", label: t("item.general"), icon: Settings2, lead: t("category.generalLead") },
		...(canAcl ? [{ id: "permissions", label: t("item.permissions"), icon: Shield, lead: t("category.permLead") }] : [])
	];
	const current = sections.find((s) => s.id === pane) ?? sections[0];
	return /* @__PURE__ */ jsxs("form", {
		className: "settings-frame",
		onSubmit: (e) => {
			e.preventDefault();
			onSave(name.trim(), icon.trim() || "Folder", {
				restricted,
				viewers,
				editors
			});
		},
		children: [
			/* @__PURE__ */ jsxs("nav", {
				className: "settings-nav",
				"aria-label": "Sections",
				children: [
					/* @__PURE__ */ jsx("p", { className: "menu-title", children: initial ? t("aria.editCategory") : t("category.create") }),
					sections.map((s) => /* @__PURE__ */ jsxs("button", {
						type: "button",
						className: `settings-nav-item ${pane === s.id ? "is-on" : ""}`,
						onClick: () => setPane(s.id),
						children: [/* @__PURE__ */ jsx(s.icon, { className: "size-4 shrink-0" }), s.label]
					}, s.id))
				]
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "settings-body",
				children: [
					/* @__PURE__ */ jsxs("div", {
						className: "settings-head",
						children: [
							/* @__PURE__ */ jsxs("div", {
								className: "settings-head-copy",
								children: [
									/* @__PURE__ */ jsx("h3", { className: "dialog-title", children: current.label }),
									/* @__PURE__ */ jsx("p", { className: "settings-lead", children: current.lead })
								]
							}),
							/* @__PURE__ */ jsx(Button, {
								type: "button",
								variant: "ghost",
								size: "icon-sm",
								onClick: onCancel,
								"aria-label": t("actions.close"),
								children: /* @__PURE__ */ jsx(X, { className: "size-4" })
							})
						]
					}),
					/* @__PURE__ */ jsx("div", {
						className: "settings-pane",
						children: pane === "permissions" && canAcl ? /* @__PURE__ */ jsx("div", {
							className: "settings-stack",
							children: /* @__PURE__ */ jsx(AclFields, {
								restricted,
								setRestricted,
								viewers,
								setViewers,
								editors,
								setEditors,
								people,
								seeHint: t("category.seeHint"),
								editHint: t("category.editHint")
							})
						}) : /* @__PURE__ */ jsxs("div", {
							className: "settings-stack",
							children: [
								/* @__PURE__ */ jsx(Field, {
									label: t("item.name"),
									children: /* @__PURE__ */ jsx("input", {
										className: inputClass,
										value: name,
										onChange: (e) => setName(e.target.value),
										required: true
									})
								}),
								/* @__PURE__ */ jsx(Field, {
									label: t("item.icon"),
									children: /* @__PURE__ */ jsx(IconPicker, {
										value: icon,
										onChange: setIcon,
										...picker,
										pictosOnly: !picker.navRichIcons
									})
								})
							]
						})
					}),
					/* @__PURE__ */ jsx(FormActions, { busy, onCancel })
				]
			})
		]
	});
}
function itemKind(kind) {
	const k = kind === "note" || kind === "embed" ? kind : "app";
	return {
		option: t(`item.${k}.option`),
		create: t(`item.${k}.create`),
		edit: t(`item.${k}.edit`),
		remove: t(`item.${k}.remove`),
		urlLabel: t(`item.${k}.urlLabel`)
	};
}
function ExtraLinksField({ links, setLinks }) {
	const listRef = useRef(null);
	const dragRef = useRef(null);
	const [dragKey, setDragKey] = useState(null);
	function endDrag(el, pointerId) {
		dragRef.current = null;
		setDragKey(null);
		try {
			el?.releasePointerCapture(pointerId);
		} catch {}
	}
	function onGripDown(e, key) {
		if (links.length < 2 || e.button !== 0) return;
		e.preventDefault();
		e.stopPropagation();
		e.currentTarget.setPointerCapture(e.pointerId);
		dragRef.current = {
			key,
			pointerId: e.pointerId
		};
		setDragKey(key);
	}
	function onGripMove(e) {
		const drag = dragRef.current;
		if (!drag || drag.pointerId !== e.pointerId) return;
		const root = listRef.current;
		if (!root) return;
		const others = [...root.querySelectorAll("[data-link-key]")].filter((row) => row.getAttribute("data-link-key") !== drag.key);
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
			const rest = cur.filter((r) => r.key !== drag.key);
			rest.splice(to, 0, cur[from]);
			return rest;
		});
	}
	function onGripUp(e) {
		const drag = dragRef.current;
		if (!drag || drag.pointerId !== e.pointerId) return;
		endDrag(e.currentTarget, e.pointerId);
	}
	return /* @__PURE__ */ jsxs(Field, {
		label: t("item.extraLinks"),
		children: [
			/* @__PURE__ */ jsx("p", {
				className: "settings-hint",
				children: t("item.extraLinksHint")
			}),
			/* @__PURE__ */ jsx("div", {
				ref: listRef,
				className: `extra-links${dragKey ? " is-sorting" : ""}`,
				children: links.map((row) => /* @__PURE__ */ jsxs("div", {
					className: `extra-link${dragKey === row.key ? " is-dragging" : ""}`,
					"data-link-key": row.key,
					children: [
						links.length > 1 ? /* @__PURE__ */ jsx("button", {
							type: "button",
							className: "extra-link-grip",
							"aria-label": t("item.dragReorder"),
							onPointerDown: (e) => onGripDown(e, row.key),
							onPointerMove: onGripMove,
							onPointerUp: onGripUp,
							onPointerCancel: onGripUp,
							children: /* @__PURE__ */ jsx(GripVertical, { className: "size-4" })
						}) : null,
						/* @__PURE__ */ jsx("div", {
							className: "w-28 shrink-0",
							children: /* @__PURE__ */ jsx("input", {
								className: inputClass,
								value: row.title,
								placeholder: t("item.name"),
								onChange: (e) => setLinks((cur) => cur.map((r) => r.key === row.key ? {
									...r,
									title: e.target.value
								} : r)),
								maxLength: 40
							})
						}),
						/* @__PURE__ */ jsx("div", {
							className: "min-w-0 flex-1",
							children: /* @__PURE__ */ jsx("input", {
								className: inputClass,
								value: row.url,
								placeholder: "https://vcenter:5480",
								onChange: (e) => setLinks((cur) => cur.map((r) => r.key === row.key ? {
									...r,
									url: e.target.value
								} : r))
							})
						}),
						/* @__PURE__ */ jsx(Button, {
							type: "button",
							variant: "ghost",
							size: "icon-sm",
							"aria-label": t("item.removeLink"),
							onClick: () => setLinks((cur) => cur.filter((r) => r.key !== row.key)),
							children: /* @__PURE__ */ jsx(X, { className: "size-4" })
						})
					]
				}, row.key))
			}),
			links.length < 4 ? /* @__PURE__ */ jsxs(Button, {
				type: "button",
				variant: "secondary",
				size: "sm",
				className: "self-start",
				onClick: () => setLinks((cur) => [...cur, {
					key: crypto.randomUUID(),
					title: "",
					url: ""
				}]),
				children: [/* @__PURE__ */ jsx(Plus, { className: "size-3.5" }), t("actions.addLink")]
			}) : null
		]
	});
}
function SizePreview({ colSpan, rowSpan }) {
	const cols = Math.min(3, Math.max(1, Number(colSpan) || 1));
	const rows = Math.min(3, Math.max(1, Number(rowSpan) || 1));
	const slots = [];
	for (let r = 1; r <= 3; r++) for (let c = 1; c <= 3; c++) slots.push({
		r,
		c
	});
	return /* @__PURE__ */ jsxs("div", {
		className: "size-preview-wrap",
		children: [
			/* @__PURE__ */ jsxs("div", {
				className: "size-preview",
				"aria-hidden": true,
				children: [
					slots.map((s) => /* @__PURE__ */ jsx("div", {
						className: "size-preview-slot",
						style: {
							gridColumn: s.c,
							gridRow: s.r
						}
					}, `${s.r}-${s.c}`)),
					/* @__PURE__ */ jsx("div", {
						className: "size-preview-card",
						style: {
							gridColumn: `1 / span ${cols}`,
							gridRow: `1 / span ${rows}`
						}
					})
				]
			}),
			/* @__PURE__ */ jsx("p", {
				className: "settings-hint",
				children: t("item.sizePreview")
			})
		]
	});
}
function AppForm({ categories, categoryId, catalog, initial, busy, picker, probes, knownTags, tagColors, onCancel, onSave }) {
	const [kind, setKind] = useState(initial?.kind ?? "app");
	const [catId, setCatId] = useState(initial?.categoryId ?? categoryId);
	const [title, setTitle] = useState(initial?.title ?? "");
	const [description, setDescription] = useState(initial?.description ?? "");
	const [url, setUrl] = useState(initial?.url ?? "");
	const [icon, setIcon] = useState(initial?.icon ?? "Link");
	const [openIn, setOpenIn] = useState(initial?.openIn ?? "_blank");
	const [tags, setTags] = useState(initial?.tags ?? []);
	const [tagDraft, setTagDraft] = useState("");
	const [draftColors, setDraftColors] = useState({});
	const [colSpan, setColSpan] = useState(initial?.colSpan ?? 1);
	const [rowSpan, setRowSpan] = useState(initial?.rowSpan ?? 1);
	const [check, setCheck] = useState(initial?.check ?? "off");
	const [checkHost, setCheckHost] = useState(initial?.checkHost ?? "");
	const [links, setLinks] = useState(() => (Array.isArray(initial?.links) ? initial.links : []).map((r) => ({
		key: crypto.randomUUID(),
		title: String(r.title || ""),
		url: String(r.url || "")
	})).slice(0, 4));
	const [probeBusy, setProbeBusy] = useState(false);
	const [pane, setPane] = useState("general");
	const catOptions = useMemo(() => categories, [categories]);
	const paneSafe = pane === "lien" && kind !== "app" || pane === "tags" ? "general" : pane === "design" ? "taille" : pane;
	function addTag(raw) {
		const t = raw.trim().slice(0, 32);
		if (!t) return;
		setTags((cur) => {
			if (cur.length >= 3) return cur;
			if (cur.some((x) => x.toLowerCase() === t.toLowerCase())) return cur;
			setDraftColors((colors) => {
				const merged = {
					...tagColors,
					...colors
				};
				if (lookupTagColor(t, merged)) return colors;
				if (knownTags.some((k) => k.toLowerCase() === t.toLowerCase())) return colors;
				const used = new Set(Object.values(merged).map((h) => String(h).toLowerCase()));
				return {
					...colors,
					[t]: randomTagHex(used)
				};
			});
			return [...cur, t];
		});
		setTagDraft("");
	}
	function removeTag(name) {
		setTags((cur) => cur.filter((x) => x.toLowerCase() !== name.toLowerCase()));
	}
	function resetFieldsForKind(next) {
		setKind(next);
		setTitle("");
		setDescription("");
		setUrl("");
		setTags([]);
		setTagDraft("");
		setDraftColors({});
		setLinks([]);
		setOpenIn("_blank");
		setCheck("off");
		setCheckHost("");
		setColSpan(1);
		setRowSpan(1);
		setPane("general");
		setIcon(next === "note" ? "FileText" : next === "embed" ? "AppWindow" : "Link");
	}
	function changeKind(next) {
		if (next === kind) return;
		const hasContent = Boolean(title.trim() || description.trim() || url.trim() || tags.length || links.some((r) => r.title.trim() || r.url.trim()) || check !== "off" || colSpan !== 1 || rowSpan !== 1);
		if (hasContent && !window.confirm(t("confirm.changeKind"))) return;
		resetFieldsForKind(next);
	}
	const kindMeta = itemKind(kind);
	const heading = initial ? kindMeta.edit : kindMeta.create;
	const sections = [
		{
			id: "general",
			label: t("item.general"),
			icon: Settings2,
			lead: kind === "note" ? t("item.generalLeadNote") : kind === "embed" ? t("item.generalLeadEmbed") : t("item.generalLeadApp")
		},
		...(kind === "app" ? [{
			id: "lien",
			label: t("item.link"),
			icon: ExternalLink,
			lead: t("item.linkLead")
		}] : []),
		{
			id: "taille",
			label: t("item.size"),
			icon: LayoutGrid,
			lead: t("item.sizeLead")
		}
	];
	const current = sections.find((s) => s.id === paneSafe) ?? sections[0];
	const kindSelect = /* @__PURE__ */ jsxs("select", {
		className: "kind-select",
		value: kind,
		"aria-label": t("item.type"),
		onChange: (e) => changeKind(e.target.value),
		children: [
			/* @__PURE__ */ jsx("option", {
				value: "app",
				children: itemKind("app").option
			}),
			/* @__PURE__ */ jsx("option", {
				value: "note",
				children: itemKind("note").option
			}),
			/* @__PURE__ */ jsx("option", {
				value: "embed",
				children: itemKind("embed").option
			})
		]
	});
	const canSave = kind === "app"
		? Boolean(title.trim() && safeAppHref(url))
		: kind === "note"
			? Boolean(description.trim())
			: Boolean(safeAppHref(url));
	const urlDupes = useMemo(() => kind === "note" ? [] : findUrlDuplicates(catalog, url, initial?.id), [catalog, url, kind, initial?.id]);
	const urlDupHint = urlDupes.length ? /* @__PURE__ */ jsx("p", {
		className: "settings-hint is-warn",
		children: urlDupes.length === 1 ? t("item.urlExists", { title: urlDupes[0].title, tab: urlDupes[0].tab }) : t("item.urlExistsN", { n: urlDupes.length, list: urlDupes.slice(0, 3).map((d) => d.title).join(", ") })
	}) : null;
	return /* @__PURE__ */ jsxs("form", {
		className: "settings-frame",
		onSubmit: (e) => {
			e.preventDefault();
			if (kind === "app" && !title.trim()) {
				toast.error(t("errors.nameRequired"));
				setPane("general");
				return;
			}
			if (kind === "app" && !safeAppHref(url)) {
				toast.error(t("errors.urlRequired"));
				setPane("lien");
				return;
			}
			if (kind === "note" && !description.trim()) {
				toast.error(t("errors.contentRequired"));
				setPane("general");
				return;
			}
			if (kind === "embed" && !safeAppHref(url)) {
				toast.error(t("errors.embedUrlRequired"));
				setPane("general");
				return;
			}
			onSave({
				categoryId: catId,
				kind,
				title: title.trim(),
				description: kind === "embed" ? "" : description.trim(),
				url: url.trim(),
				icon: icon.trim() || (kind === "note" ? "FileText" : kind === "embed" ? "AppWindow" : "Link"),
				openIn,
				tags: kind === "app" ? tags.slice(0, 3) : [],
				colSpan,
				rowSpan,
				check: kind === "app" ? check : "off",
				checkHost: kind === "app" && check === "icmp" ? checkHost.trim() : "",
				links: kind === "app" ? links.filter((r) => r.title.trim() && r.url.trim()).slice(0, 4).map((r) => ({
					title: r.title.trim().slice(0, 40),
					url: r.url.trim().slice(0, 2e3)
				})) : [],
				tagColors: kind === "app" ? draftColors : undefined
			});
		},
		children: [
			/* @__PURE__ */ jsxs("nav", {
				className: "settings-nav",
				"aria-label": "Sections",
				children: [
					/* @__PURE__ */ jsx("p", {
						className: "menu-title",
						children: heading
					}),
					sections.map((s) => /* @__PURE__ */ jsxs("button", {
						type: "button",
						className: `settings-nav-item ${paneSafe === s.id ? "is-on" : ""}`,
						onClick: () => setPane(s.id),
						children: [
							/* @__PURE__ */ jsx(s.icon, { className: "size-4 shrink-0" }),
							s.label
						]
					}, s.id))
				]
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "settings-body",
				children: [
					/* @__PURE__ */ jsxs("div", {
						className: "settings-head",
						children: [
							/* @__PURE__ */ jsxs("div", {
								className: "settings-head-copy",
								children: [
									/* @__PURE__ */ jsx("h3", {
										className: "dialog-title",
										children: current.label
									}),
									current.lead ? /* @__PURE__ */ jsx("p", {
										className: "settings-lead",
										children: current.lead
									}) : null
								]
							}),
							/* @__PURE__ */ jsxs("div", {
								className: "settings-head-actions",
								children: [
									kindSelect,
									/* @__PURE__ */ jsx(Button, {
										type: "button",
										variant: "ghost",
										size: "icon-sm",
										onClick: onCancel,
										children: /* @__PURE__ */ jsx(X, { className: "size-4" })
									})
								]
							})
						]
					}),
					/* @__PURE__ */ jsxs("div", {
						className: "settings-pane",
						children: [
							/* @__PURE__ */ jsxs("div", {
								className: paneSafe === "general" ? "settings-stack app-form" : "hidden",
								children: [
			/* @__PURE__ */ jsxs(Field, {
				label: kind === "app" ? t("item.name") : t("item.titleOptional"),
				children: [" ", /* @__PURE__ */ jsx("input", {
					className: inputClass,
					value: title,
					onChange: (e) => setTitle(e.target.value),
					placeholder: kind === "app" ? t("item.placeholderName") : t("item.placeholderTitle"),
					required: kind === "app"
				})]
			}),
			kind === "app" ? /* @__PURE__ */ jsxs("div", {
				className: "icon-kind-row",
				children: [
					/* @__PURE__ */ jsxs(Field, {
						label: t("item.icon"),
						children: [/* @__PURE__ */ jsx(IconPicker, {
							value: icon,
							onChange: setIcon,
							siteUrl: url,
							...picker
						})]
					}),
					/* @__PURE__ */ jsxs(Field, {
						label: t("item.category"),
						children: [/* @__PURE__ */ jsx("select", {
							className: inputClass,
							value: catId,
							onChange: (e) => setCatId(e.target.value),
							children: catOptions.map((c) => /* @__PURE__ */ jsx("option", {
								value: c.id,
								children: c.name
							}, c.id))
						})]
					})
				]
			}) : null,
			kind === "note" ? /* @__PURE__ */ jsx(Field, {
				label: t("item.content"),
				children: /* @__PURE__ */ jsx(NoteEditor, {
					value: description,
					onChange: setDescription
				})
			}) : kind === "embed" ? /* @__PURE__ */ jsxs(Field, {
				label: kindMeta.urlLabel,
				children: [
					" ",
					/* @__PURE__ */ jsx("input", {
						className: inputClass,
						value: url,
						onChange: (e) => setUrl(e.target.value),
						placeholder: "https://",
						required: true
					}),
					urlDupHint
				]
			}) : /* @__PURE__ */ jsx(Field, {
				label: t("item.description"),
				children: /* @__PURE__ */ jsx("textarea", {
					className: `${inputClass} min-h-11 resize-y py-2`,
					value: description,
					onChange: (e) => setDescription(e.target.value)
				})
			}),
			kind !== "app" ? /* @__PURE__ */ jsxs(Field, {
				label: t("item.category"),
				children: [/* @__PURE__ */ jsx("select", {
					className: inputClass,
					value: catId,
					onChange: (e) => setCatId(e.target.value),
					children: catOptions.map((c) => /* @__PURE__ */ jsx("option", {
						value: c.id,
						children: c.name
					}, c.id))
				})]
			}) : null,
			kind === "app" ? /* @__PURE__ */ jsxs(Field, {
				label: t("item.tags"),
				children: [
					tags.length > 0 ? /* @__PURE__ */ jsx("div", {
						className: "flex flex-wrap gap-1",
						children: tags.map((tag) => {
							const paint = tagPaint(tag, {
								...tagColors,
								...draftColors
							});
							return /* @__PURE__ */ jsxs("button", {
								type: "button",
								"data-tone": paint.tone,
								style: paint.style,
								className: "tag-chip",
								onMouseDown: (e) => e.preventDefault(),
								onClick: (e) => {
									e.preventDefault();
									e.stopPropagation();
									removeTag(tag);
								},
								children: [
									tag,
									" ",
									/* @__PURE__ */ jsx(X, { className: "ml-0.5 size-2.5" })
								]
							}, tag);
						})
					}) : null,
					/* @__PURE__ */ jsx("input", {
						className: inputClass,
						value: tagDraft,
						placeholder: tags.length >= 3 ? t("item.maxTags") : t("item.addTag"),
						disabled: tags.length >= 3,
						onChange: (e) => setTagDraft(e.target.value),
						onKeyDown: (e) => {
							if (e.key === "Enter" || e.key === ",") {
								e.preventDefault();
								addTag(tagDraft.replace(/,/g, ""));
							}
						},
						onBlur: () => addTag(tagDraft),
						list: "portal-tag-suggest"
					}),
					/* @__PURE__ */ jsx("p", {
						className: "settings-hint",
						children: `${tags.length}/3`
					}),
					/* @__PURE__ */ jsx("datalist", {
						id: "portal-tag-suggest",
						children: knownTags.map((t) => /* @__PURE__ */ jsx("option", { value: t }, t))
					})
				]
			}) : null
								]
							}), /* @__PURE__ */ jsxs("div", {
								className: paneSafe === "taille" ? "settings-stack app-form" : "hidden",
								children: [
			/* @__PURE__ */ jsxs("div", {
				className: "grid grid-cols-2 gap-3",
				children: [
					" ",
					/* @__PURE__ */ jsxs(Field, {
						label: t("item.width"),
						children: [" ", /* @__PURE__ */ jsxs("select", {
							className: inputClass,
							value: colSpan,
							onChange: (e) => setColSpan(Number(e.target.value)),
							children: [
								" ",
								/* @__PURE__ */ jsx("option", {
									value: 1,
									children: t("item.col1")
								}),
								" ",
								/* @__PURE__ */ jsx("option", {
									value: 2,
									children: t("item.col2")
								}),
								" ",
								/* @__PURE__ */ jsx("option", {
									value: 3,
									children: t("item.colFull")
								})
							]
						})]
					}),
					" ",
					/* @__PURE__ */ jsxs(Field, {
						label: t("item.height"),
						children: [" ", /* @__PURE__ */ jsxs("select", {
							className: inputClass,
							value: rowSpan,
							onChange: (e) => setRowSpan(Number(e.target.value)),
							children: [
								" ",
								/* @__PURE__ */ jsx("option", {
									value: 1,
									children: t("item.row1")
								}),
								" ",
								/* @__PURE__ */ jsx("option", {
									value: 2,
									children: t("item.row2")
								}),
								" ",
								/* @__PURE__ */ jsx("option", {
									value: 3,
									children: t("item.row3")
								})
							]
						})]
					})
				]
			}),
			/* @__PURE__ */ jsx(SizePreview, {
				colSpan,
				rowSpan
			})
								]
							}), /* @__PURE__ */ jsxs("div", {
								className: paneSafe === "lien" ? "settings-stack app-form" : "hidden",
								children: [
			/* @__PURE__ */ jsxs(Field, {
				label: kindMeta.urlLabel,
				children: [
					" ",
					/* @__PURE__ */ jsx("input", {
						className: inputClass,
						value: url,
						onChange: (e) => setUrl(e.target.value),
						placeholder: "https://",
						required: kind === "app"
					}),
					urlDupHint
				]
			}),
			/* @__PURE__ */ jsxs(Field, {
				label: t("item.openLink"),
				children: [" ", /* @__PURE__ */ jsxs("select", {
					className: inputClass,
					value: openIn,
					onChange: (e) => setOpenIn(e.target.value),
					children: [
						" ",
						/* @__PURE__ */ jsx("option", {
							value: "_blank",
							children: t("item.newTab")
						}),
						" ",
						/* @__PURE__ */ jsx("option", {
							value: "_self",
							children: t("item.sameWindow")
						})
					]
				})]
			}),
			/* @__PURE__ */ jsx(ExtraLinksField, {
				links,
				setLinks
			}),
			probes === false ? /* @__PURE__ */ jsx("div", {
				className: "settings-note",
				children: /* @__PURE__ */ jsx("p", {
					children: t("item.probeDisabled")
				})
			}) : /* @__PURE__ */ jsxs(Fragment, {
				children: [
			/* @__PURE__ */ jsxs(Field, {
				label: t("probe.control"),
				children: [
					/* @__PURE__ */ jsxs("select", {
					className: inputClass,
					value: check,
					onChange: (e) => setCheck(e.target.value),
					children: [
						" ",
						/* @__PURE__ */ jsx("option", {
							value: "off",
							children: t("item.probeNone")
						}),
						" ",
						/* @__PURE__ */ jsx("option", {
							value: "http",
							children: t("item.probeHttp")
						}),
						" ",
						/* @__PURE__ */ jsx("option", {
							value: "icmp",
							children: t("item.probeIcmp")
						})
					]
				}),
					check !== "off" ? /* @__PURE__ */ jsx("button", {
						type: "button",
						className: "settings-link self-start",
						disabled: probeBusy || !picker.token,
						onClick: async () => {
							setProbeBusy(true);
							try {
								const row = await probePreview({ data: {
									token: picker.token,
									mode: check === "icmp" ? "icmp" : "http",
									url: url.trim(),
									host: checkHost.trim()
								} });
								if (!row) throw new Error("errors.noReply");
								if (row.ok) toast.success(td(row.detail));
								else toast.error(td(row.detail));
							} catch (err) {
								if (sessionGone(err)) return;
								toast.error(te(err));
							} finally {
								setProbeBusy(false);
							}
						},
						children: probeBusy ? t("probe.testing") : t("probe.testNow")
					}) : null
				]
			}),
			check === "icmp" && /* @__PURE__ */ jsxs(Field, {
				label: t("probe.icmpHost"),
				children: [" ", /* @__PURE__ */ jsx("input", {
					className: inputClass,
					value: checkHost,
					onChange: (e) => setCheckHost(e.target.value),
					placeholder: "10.12.4.20 or vcenter.intra",
					required: true
				})]
			})
				]
			})
								]
							})
						]
					}),
					/* @__PURE__ */ jsx(FormActions, {
						busy,
						disabled: !canSave,
						onCancel
					})
				]
			})
		]
	});
}
function TagColorPick({ hex, name, disabled, onChange }) {
	const [open, setOpen] = useState(false);
	const btnRef = useRef(null);
	const panelRef = useRef(null);
	const [pos, setPos] = useState({ top: 0, left: 0 });
	const current = remapTagHex(hex);
	const ink = tagInk(current);
	function place() {
		const r = btnRef.current?.getBoundingClientRect();
		if (!r) return;
		const width = 196;
		const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
		const top = r.bottom + 6 + 168 > window.innerHeight ? r.top - 174 : r.bottom + 6;
		setPos({ top, left });
	}
	useEffect(() => {
		if (!open) return;
		place();
		const onDoc = (e) => {
			if (btnRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return;
			setOpen(false);
		};
		const onKey = (e) => {
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
	return /* @__PURE__ */ jsxs(Fragment, {
		children: [
			/* @__PURE__ */ jsx("button", {
				type: "button",
				ref: btnRef,
				className: "tag-color-btn",
				disabled,
				style: {
					["--tag-bg"]: current,
					["--tag-fg"]: ink
				},
				title: t("tags.colorOf", { name }),
				"aria-label": t("tags.colorOf", { name }),
				"aria-expanded": open,
				"aria-haspopup": "listbox",
				onClick: () => {
					if (disabled) return;
					setOpen((v) => !v);
				}
			}),
			open && typeof document !== "undefined" ? createPortal(/* @__PURE__ */ jsx("div", {
				ref: panelRef,
				className: "tag-palette",
				role: "listbox",
				"aria-label": t("tags.palette"),
				style: {
					top: pos.top,
					left: pos.left
				},
				children: TAG_PALETTE.map((swatch) => /* @__PURE__ */ jsx("button", {
					type: "button",
					role: "option",
					className: `tag-palette-dot${swatch === current ? " is-on" : ""}`,
					style: {
						["--tag-bg"]: swatch,
						["--tag-fg"]: tagInk(swatch)
					},
					"aria-selected": swatch === current,
					"aria-label": t("tags.pickColor"),
					title: swatch,
					onClick: () => {
						onChange(swatch);
						setOpen(false);
					}
				}, swatch))
			}), document.body) : null
		]
	});
}
function TagManager({ tags, colors, busy, embedded, settings, pruneOrphanTags, onCancel, onSave, onApply }) {
	const [pane, setPane] = useState("main");
	const [prune, setPrune] = useState(Boolean(pruneOrphanTags));
	const [drafts, setDrafts] = useState({});
	const [createDraft, setCreateDraft] = useState("");
	const [localColors, setLocalColors] = useState(colors ?? {});
	useEffect(() => {
		setPrune(Boolean(pruneOrphanTags));
	}, [pruneOrphanTags]);
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
		onApply({ create: [name] });
	}
	function renameTag(from, to) {
		const next = String(to || "").trim().slice(0, 32);
		if (!next || next === from || busy) return;
		onApply({ rename: [{ from, to: next }] });
	}
	function removeTag(name) {
		if (!window.confirm(t("confirm.deleteTag", { name }))) return;
		onApply({ remove: [name] });
	}
	function changeColor(name, hex) {
		const next = remapTagHex((expandHex(hex) ?? String(hex || "")).toLowerCase());
		if (!/^#[0-9a-f]{6}$/.test(next)) return;
		setLocalColors((cur) => ({
			...cur,
			[name]: next
		}));
		onApply({ colors: { [name]: next } });
	}
	if (pane === "list") {
	return /* @__PURE__ */ jsxs("div", {
		className: embedded ? "tag-manager" : "settings-stack",
		children: [
			/* @__PURE__ */ jsxs("button", {
				type: "button",
				className: "settings-link settings-back",
				onClick: () => setPane("main"),
				children: [/* @__PURE__ */ jsx(ChevronLeft, { className: "size-3.5" }), t("tags.back")]
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "flex items-center justify-between gap-2",
				children: [
					/* @__PURE__ */ jsx("p", {
						className: "settings-kicker",
						children: tags.length ? tp("tags.count", tags.length) : t("item.tags")
					})
				]
			}),
			/* @__PURE__ */ jsx("input", {
				className: inputClass,
				value: createDraft,
				placeholder: t("tags.newPlaceholder"),
				maxLength: 32,
				disabled: busy || tags.length >= 80,
				onChange: (e) => setCreateDraft(e.target.value),
				onKeyDown: (e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						createTag();
					}
				}
			}),
			tags.length === 0 ? /* @__PURE__ */ jsx("p", {
				className: "settings-hint",
				children: t("tags.empty")
			}) : /* @__PURE__ */ jsx("ul", {
				className: "settings-list tag-manager-list",
				children: tags.map((row) => {
					const draft = drafts[row.name] ?? row.name;
					const hex = lookupTagColor(row.name, localColors) ?? defaultTagHex(row.name);
					return /* @__PURE__ */ jsxs("li", {
						className: "settings-list-item tag-item",
						children: [
							/* @__PURE__ */ jsx(TagColorPick, {
								hex,
								name: row.name,
								disabled: busy,
								onChange: (next) => changeColor(row.name, next)
							}),
							/* @__PURE__ */ jsx("input", {
								className: "tag-item-name",
								value: draft,
								"aria-label": t("tags.nameOf", { name: row.name }),
								onChange: (e) => setDrafts((d) => ({
									...d,
									[row.name]: e.target.value
								})),
								onBlur: () => renameTag(row.name, draft),
								onKeyDown: (e) => {
									if (e.key === "Enter") {
										e.preventDefault();
										e.currentTarget.blur();
									}
								}
							}),
							/* @__PURE__ */ jsx("span", {
								className: "tag-row-count",
								children: row.count
							}),
							/* @__PURE__ */ jsx(Button, {
								type: "button",
								variant: "ghost",
								size: "icon-sm",
								className: "card-tool is-danger",
								disabled: busy,
								"aria-label": t("tags.deleteAria", { name: row.name }),
								onClick: () => removeTag(row.name),
								children: /* @__PURE__ */ jsx(Trash2, { className: "size-4" })
							})
						]
					}, row.name);
				})
			})
		]
	});
	}
	return /* @__PURE__ */ jsxs("form", {
		className: embedded ? "tag-manager" : "settings-stack",
		onSubmit: (e) => {
			e.preventDefault();
			onSave?.({
				...settingsBase(settings || {}),
				pruneOrphanTags: prune
			});
			toast.success(t("toast.saved"));
		},
		children: [
			/* @__PURE__ */ jsxs("div", {
				className: "settings-card",
				children: [
					/* @__PURE__ */ jsx("p", { className: "settings-kicker", children: t("tags.memory") }),
					/* @__PURE__ */ jsxs("div", {
						className: "settings-toggles",
						children: [
							/* @__PURE__ */ jsxs("label", {
								children: [
									/* @__PURE__ */ jsx("input", {
										type: "checkbox",
										checked: prune,
										onChange: (e) => setPrune(e.target.checked)
									}),
									t("tags.prune")
								]
							})
						]
					}),
					/* @__PURE__ */ jsx("p", {
						className: "settings-hint",
						children: t("tags.pruneHint")
					})
				]
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "settings-card",
				children: [
					/* @__PURE__ */ jsx("p", { className: "settings-kicker", children: t("item.tags") }),
					/* @__PURE__ */ jsx("p", {
						className: "settings-hint",
						children: tags.length ? tp("tags.count", tags.length) : t("tags.none")
					}),
					/* @__PURE__ */ jsxs(Button, {
						type: "button",
						variant: "secondary",
						className: "h-9 self-start",
						onClick: () => setPane("list"),
						children: [/* @__PURE__ */ jsx(Tags, { className: "size-3.5" }), t("tags.manage")]
					})
				]
			}),
			/* @__PURE__ */ jsx(FormActions, {
				busy,
				onCancel,
				label: t("actions.save")
			})
		]
	});
}
function ConfirmBox({ title, body, busy, onCancel, onConfirm }) {
	return /* @__PURE__ */ jsxs("div", { children: [
		" ",
		/* @__PURE__ */ jsx("h3", {
			className: "dialog-title",
			children: title
		}),
		" ",
		/* @__PURE__ */ jsx("p", {
			className: "mt-2 text-sm text-muted",
			children: body
		}),
		" ",
		/* @__PURE__ */ jsxs("div", {
			className: "mt-5 flex justify-end gap-2",
			children: [
				" ",
				/* @__PURE__ */ jsx(Button, {
					type: "button",
					variant: "secondary",
					onClick: onCancel,
					disabled: busy,
					children: t("actions.cancel")
				}),
				" ",
				/* @__PURE__ */ jsx(Button, {
					type: "button",
					variant: "danger",
					onClick: onConfirm,
					disabled: busy,
					children: t("actions.delete")
				})
			]
		})
	] });
}
function FormActions({ busy, onCancel, label = t("actions.save"), form, disabled }) {
	return /* @__PURE__ */ jsxs("div", {
		className: "settings-actions",
		children: [
			/* @__PURE__ */ jsx(Button, {
				type: "button",
				variant: "secondary",
				onClick: onCancel,
				children: t("actions.cancel")
			}),
			/* @__PURE__ */ jsx(Button, {
				type: "submit",
				form,
				disabled: busy || disabled,
				children: label
			})
		]
	});
}
