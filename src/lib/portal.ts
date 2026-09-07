import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomBytes, scryptSync } from "node:crypto";
import { safeAppHref } from "./safe-href";
import { MAX_CUSTOM_ICONS, toClientAsset } from "./assets-url";
import { CSS_MAX, sanitizeThemeCss } from "./theme-css";
import { isWeakPassword, passwordPolicyError, PASSWORD_MAX } from "./security";
import { assertProductionSecrets, clientIp, isDevRuntime, trustProxy } from "./security-runtime";
import { parseSessCookie } from "./session-cookie";
import {
	asHistory,
	pruneHistory,
	appendHistory,
	snapshotTab,
	snapshotCat,
	snapshotApp,
	snapshotToDisk,
	publicAudit,
	publicTrash,
	emptyTrash
} from "./history";
import { t, withLocale, asTimeFormat, asTimeZone, DATE_FORMATS, NUMBER_FORMATS } from "./i18n";
import { adGroupKey, asDirectories, asLoginOrder, directoryReady, pickDirectory, syncLegacyLdap } from "./ldap-runtime";
import { defaultTagHex, remapTagHex } from "./tag-colors";
import {
	absorbResourceAcl,
	asGrants,
	can,
	categoryMoveImpact,
	defaultRoles,
	grantsFromLegacyRole,
	groupsOf,
	isOwnerUser,
	isSystemRole,
	mergeGrant,
	moveCategoryInDoc,
	roleIdsOf,
	roleSummary,
	setRoleHolders,
	stripRole,
	type AclDoc,
	type GrantInput,
	type Group,
	type Role,
	type Tab,
	type User
} from "./acl";
import type { HistoryEvent } from "./history";
import type { Directory } from "./ldap-runtime";

function tt(doc: Doc | null | undefined, key: string, vars?: Record<string, unknown>) {
	return withLocale(doc?.settings?.locale, () => t(key, vars));
}

export type UserRole = "admin" | "editeur" | "lecteur";
export type TabPerm = "view" | "edit";

export type PortalUser = {
  id: string;
  username: string;
  passHash: string;
  role: UserRole;
  canCreateTabs?: boolean;
};

export type SessionInfo = {
  username?: string;
  role?: string;
  roleId?: string;
  roleIds: string[];
  canEdit: boolean;
  canManageUsers: boolean;
  canManageGroups: boolean;
  canManageRoles: boolean;
  canManageSettings: boolean;
  canCreateTabs: boolean;
  canAudit: boolean;
  canRestore: boolean;
  canPurge: boolean;
  tabPerms: Record<string, TabPerm>;
  exp?: number;
  mustChangePassword?: boolean;
};

export type DirectoryUser = {
  id: string;
  username: string;
  role: UserRole;
};

export type ItemKind = "app" | "note" | "embed";
export type CheckMode = "off" | "http" | "icmp";

export type PortalApp = {
  id: string;
  categoryId: string;
  kind: ItemKind;
  title: string;
  description: string;
  url: string;
  icon: string;
  openIn: "_blank" | "_self";
  tags: string[];
  colSpan: 1 | 2 | 3;
  rowSpan: 1 | 2 | 3;
  sortOrder: number;
  check: CheckMode;
  checkHost: string;
  clicks: number;
  links: { title: string; url: string }[];
};

export type PortalCategory = {
  id: string;
  name: string;
  icon: string;
  sortOrder: number;
  restricted: boolean;
  viewers: string[];
  editors: string[];
  apps: PortalApp[];
};

export type PortalTab = {
  id: string;
  name: string;
  icon: string;
  sortOrder: number;
  restricted: boolean;
  viewers: string[];
  editors: string[];
  hideLabel: boolean;
};

export type PortalSettings = {
  title: string;
  subtitle: string;
  logo: string;
  healthChecks: boolean;
  usageStats: boolean;
  infoBar: boolean;
  tagColors: Record<string, string>;
  cssLight: string;
  cssDark: string;
  documentTitle: string;
  locale: "en" | "fr";
  dateFormat: "ymd" | "yyyy" | "dmy" | "mdy" | "iso";
  timeFormat: "24h" | "12h";
  numberFormat?: import("./i18n").NumberFormat;
  timezone: string;
  favicon: string;
  favsHideLabel: boolean;
  favNotes: boolean;
  favEmbeds: boolean;
  onlineIcons: boolean;
  navRichIcons: boolean;
  probeBlink: boolean;
  annexFade: boolean;
  catCounts: boolean;
  pruneOrphanTags: boolean;
  tagsAlpha: boolean;
  cardResize: boolean;
  cardContextMenu: boolean;
  cardDragCollapse: boolean;
  infoStats: boolean;
  infoGeek: boolean;
  probeTlsVerify: boolean;
  probeAuthOnly: boolean;
  sessionHttpOnly: boolean;
  devAdminNoPassword: boolean;
  oidcEnabled: boolean;
  oidcIssuer: string;
  oidcClientId: string;
  oidcClientSecret: string;
  oidcLabel: string;
  oidcAutoCreate: boolean;
  ldapEnabled: boolean;
  ldapHost: string;
  ldapPort: number;
  ldapTls: boolean;
  ldapTlsVerify: boolean;
  ldapBindDn: string;
  ldapBindPassword: string;
  ldapBaseDn: string;
  ldapUserFilter: string;
  ldapDomain: string;
  ldapAutoCreate: boolean;
  ldapDirectories: Directory[];
  loginOrder: string[];
};

export type CustomIcon = {
  id: string;
  name: string;
  dataUrl: string;
};

export type ClickStats = {
  all: number;
  today: number;
  week: number;
  month: number;
  year: number;
  spanDays: number;
  fullCatalog?: boolean;
};

type DocTab = PortalTab & { name: string; icon: string; categories: PortalCategory[] };
type StoredUser = User & { passHash?: string };
export type Doc = Omit<AclDoc, "tabs" | "users" | "groups" | "roles" | "history"> & {
  settings: PortalSettings;
  customIcons: CustomIcon[];
  lastTabId?: string;
  clickDays: Record<string, number>;
  users: StoredUser[];
  groups: Group[];
  roles: Role[];
  history: HistoryEvent[];
  tabs: DocTab[];
};

const SESSION_MS = 432e5;
type SessionRow = { userId: string; exp: number };
const sessions = /* @__PURE__ */ new Map<string, SessionRow>();
type OidcPendingRow = { redirectUri: string; verifier: string; nonce: string; exp: number };
const oidcPending = /* @__PURE__ */ new Map<string, OidcPendingRow>();
const OIDC_PENDING_MS = 5 * 60 * 1000;
function envUser() {
	return (process.env.PORTAL_EDIT_USER || "admin").trim().toLowerCase() || "admin";
}
function envPassword() {
	return (process.env.PORTAL_EDIT_PASSWORD || "admin").trim() || "admin";
}
function hashPasswordSync(password: string) {
	const salt = randomBytes(16).toString("hex");
	return `${salt}:${scryptSync(password, salt, 32).toString("hex")}`;
}
async function hashPassword(password: string) {
	const { randomBytes: bytes, scrypt } = await import("node:crypto");
	const { promisify } = await import("node:util");
	const salt = bytes(16).toString("hex");
	const buf = (await promisify(scrypt)(password, salt, 32)) as Buffer;
	return `${salt}:${Buffer.from(buf).toString("hex")}`;
}
async function verifyPassword(password: string, stored: string | undefined) {
	const [salt, hash] = String(stored || "").split(":");
	if (!salt || !hash) return false;
	const { scrypt, timingSafeEqual: same } = await import("node:crypto");
	const { promisify } = await import("node:util");
	const next = Buffer.from((await promisify(scrypt)(password, salt, 32)) as Buffer);
	const prev = Buffer.from(hash, "hex");
	if (next.length !== prev.length) return false;
	return same(next, prev);
}
type LoginFailRow = { n: number; until: number };
const loginFails = /* @__PURE__ */ new Map<string, LoginFailRow>();
const LOGIN_MAX = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
function clientKey(username: unknown, request: any) {
	return `${clientIp(request)}:${String(username || "").toLowerCase()}`;
}
function requireStrongPassword(raw: string) {
	const err = passwordPolicyError(raw);
	if (err) throw new Error(err);
}
let defaultAdminCache = {
	hash: "",
	value: false
};
async function isDefaultAdminPassword(doc: Doc) {
	const admin = ensureUsers(doc).find((u) => u.role === "admin");
	if (!admin?.passHash) return true;
	if (defaultAdminCache.hash === admin.passHash) return defaultAdminCache.value;
	const env = envPassword();
	const value = await verifyPassword("admin", admin.passHash) || isWeakPassword(env) && await verifyPassword(env, admin.passHash);
	defaultAdminCache = {
		hash: admin.passHash,
		value: Boolean(value)
	};
	return defaultAdminCache.value;
}
async function sessionFor(user: StoredUser, doc: Doc) {
	const u = hydrateUser(user, doc);
	const info = sessionInfo(u as StoredUser, doc);
	if (user.id === "admin") info.mustChangePassword = await isDefaultAdminPassword(doc);
	return info;
}
function loginBlocked(key: string) {
	const row = loginFails.get(key);
	if (!row) return false;
	if (Date.now() > row.until) {
		loginFails.delete(key);
		return false;
	}
	return row.n >= LOGIN_MAX;
}
function loginFail(key: string) {
	const now = Date.now();
	const row = loginFails.get(key) || {
		n: 0,
		until: now + LOGIN_WINDOW_MS
	};
	row.n += 1;
	row.until = now + LOGIN_WINDOW_MS;
	loginFails.set(key, row);
}
function loginOk(key: string) {
	loginFails.delete(key);
}
function issueToken(userId: string) {
	const token = randomBytes(24).toString("hex");
	sessions.set(token, {
		userId,
		exp: Date.now() + SESSION_MS
	});
	return token;
}
const tokenField = z.string().min(1);
function tok(data: any, request: any) {
	return parseSessCookie(typeof request?.headers?.get === "function" ? request.headers.get("cookie") : "") || String(data?.token || "");
}
export function sessionAlive(token: string | null | undefined) {
	if (!token) return false;
	const row = sessions.get(token);
	return Boolean(row && row.exp >= Date.now());
}
function asKind(v: unknown): ItemKind {
	return v === "note" || v === "embed" ? v : "app";
}
function asCheck(v: unknown): CheckMode {
	return v === "http" || v === "icmp" ? v : "off";
}
function asCheckHost(v: unknown) {
	return String(v ?? "").trim().slice(0, 253);
}
function asSpan(v: unknown): 1 | 2 | 3 {
	const n = Number(v);
	return n === 2 || n === 3 ? n : 1;
}
function cardSortKey(app: any) {
	const title = String(app?.title || "").trim();
	if (title) return title;
	if (asKind(app?.kind) === "note") return String(app?.description || "").replace(/\s+/g, " ").trim().slice(0, 80);
	return "";
}
export function sortAppsAlpha(apps: PortalApp[] | null | undefined, locale: unknown, dir: unknown) {
	const tag = locale === "fr" ? "fr" : "en";
	const signed = dir === "za" ? -1 : 1;
	return [...(apps || [])].sort((a, b) => {
		const ka = cardSortKey(a);
		const kb = cardSortKey(b);
		if (!ka && kb) return 1;
		if (ka && !kb) return -1;
		return signed * ka.localeCompare(kb, tag, {
			sensitivity: "base",
			numeric: true
		});
	});
}
export function appsAlphaDir(apps: PortalApp[] | null | undefined, locale: unknown) {
	if (!apps || apps.length < 2) return null;
	const ids = apps.map((a) => a.id).join("\n");
	if (sortAppsAlpha(apps, locale, "az").map((a) => a.id).join("\n") === ids) return "az";
	if (sortAppsAlpha(apps, locale, "za").map((a) => a.id).join("\n") === ids) return "za";
	return null;
}
function asTags(v: unknown): string[] {
	if (!Array.isArray(v)) return [];
	const out: string[] = [];
	const seen = /* @__PURE__ */ new Set<string>();
	for (const raw of v) {
		const tag = String(raw ?? "").trim().slice(0, 32);
		if (!tag) continue;
		const key = tag.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(tag);
		if (out.length >= 3) break;
	}
	return out;
}
function asExtraLinks(raw: unknown): { title: string; url: string }[] {
	if (!Array.isArray(raw)) return [];
	const out: { title: string; url: string }[] = [];
	const seen = /* @__PURE__ */ new Set<string>();
	for (const row of raw) {
		const title = String((row as any)?.title ?? "").trim().slice(0, 40);
		const url = safeAppHref((row as any)?.url);
		if (!title || !url) continue;
		const key = url.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push({
			title,
			url
		});
		if (out.length >= 4) break;
	}
	return out;
}
function normalizeItem(a: any, categoryId: string, sortOrder: number): PortalApp {
	const kind = asKind(a.kind);
	return {
		id: a.id || crypto.randomUUID(),
		categoryId,
		kind,
		title: String(a.title || (kind === "note" || kind === "embed" ? "" : "Untitled")).slice(0, 80),
		description: String(a.description || "").slice(0, 8e3),
		url: kind === "note" ? String(a.url || "").slice(0, 2e3) : (safeAppHref(a.url) || (String(a.url || "").trim().toLowerCase().startsWith("http") ? String(a.url).trim().slice(0, 2e3) : "")),
		icon: String(a.icon || (kind === "note" ? "FileText" : kind === "embed" ? "AppWindow" : "Link")),
		openIn: a.openIn === "_self" ? "_self" : "_blank",
		tags: kind === "app" ? asTags(a.tags) : [],
		colSpan: asSpan(a.colSpan),
		rowSpan: asSpan(a.rowSpan),
		sortOrder,
		check: kind === "app" ? asCheck(a.check) : "off",
		checkHost: kind === "app" && asCheck(a.check) === "icmp" ? asCheckHost(a.checkHost) : "",
		clicks: Math.max(0, Math.floor(Number(a.clicks) || 0)),
		links: kind === "app" ? asExtraLinks(a.links) : []
	};
}
function defaultSettings(): PortalSettings {
	return {
		title: "Dockit",
		subtitle: "Pin your URLs",
		logo: "",
		healthChecks: true,
		usageStats: true,
		infoBar: true,
		tagColors: {},
		cssLight: "",
		cssDark: "",
		documentTitle: "Dockit",
		favicon: "",
		favsHideLabel: false,
		favNotes: false,
		favEmbeds: false,
		onlineIcons: false,
		navRichIcons: false,
		probeBlink: false,
		annexFade: false,
		catCounts: false,
		pruneOrphanTags: false,
		tagsAlpha: true,
		cardResize: true,
		cardContextMenu: true,
		cardDragCollapse: true,
		infoStats: true,
		infoGeek: true,
		probeTlsVerify: false,
		probeAuthOnly: false,
		sessionHttpOnly: false,
		devAdminNoPassword: false,
		oidcEnabled: false,
		oidcIssuer: "",
		oidcClientId: "",
		oidcClientSecret: "",
		oidcLabel: "SSO",
		oidcAutoCreate: false,
		ldapEnabled: false,
		ldapHost: "",
		ldapPort: 636,
		ldapTls: true,
		ldapTlsVerify: true,
		ldapBindDn: "",
		ldapBindPassword: "",
		ldapBaseDn: "",
		ldapUserFilter: "",
		ldapDomain: "",
		ldapAutoCreate: false,
		ldapDirectories: [],
		loginOrder: ["local"],
		locale: "en",
		dateFormat: "ymd",
		timeFormat: "24h",
		timezone: ""
	};
}
function blankTabs(): { lastTabId: string; tabs: DocTab[] } {
	const tabId = crypto.randomUUID();
	const catId = crypto.randomUUID();
	return {
		lastTabId: tabId,
		tabs: [{
			id: tabId,
			name: "Home",
			icon: "Layers",
			sortOrder: 1,
			restricted: false,
			viewers: [],
			editors: [],
			hideLabel: false,
			categories: [{
				id: catId,
				name: "Applications",
				icon: "AppWindow",
				sortOrder: 1,
				restricted: false,
				viewers: [],
				editors: [],
				apps: []
			}]
		}]
	};
}
function defaultStore(): Doc {
	const blank = blankTabs();
	return {
		settings: defaultSettings(),
		customIcons: [],
		lastTabId: blank.lastTabId,
		clickDays: {},
		users: [],
		groups: [],
		roles: defaultRoles(),
		history: [],
		tabs: blank.tabs
	};
}
function assignTagColors(doc: Doc, tags: unknown, extras: unknown) {
	const colors = { ...asTagColors(doc.settings.tagColors) };
	const extra = extras && typeof extras === "object" && !Array.isArray(extras) ? (extras as Record<string, unknown>) : {};
	for (const raw of Array.isArray(tags) ? tags : []) {
		const tag = String(raw || "").trim().slice(0, 32);
		if (!tag) continue;
		if (Object.keys(colors).some((k) => k.toLowerCase() === tag.toLowerCase())) continue;
		const hit = Object.entries(extra).find(([k, v]) => k.toLowerCase() === tag.toLowerCase() && /^#[0-9a-f]{6}$/i.test(String(v)));
		if (!hit) continue;
		colors[tag] = String(hit[1]).toLowerCase();
	}
	doc.settings.tagColors = colors;
}
function pruneUnusedTags(doc: Doc) {
	if (!doc.settings.pruneOrphanTags) return;
	const used = new Set<string>();
	eachItem(doc, (app) => {
		if ((app.kind || "app") !== "app") return;
		for (const tag of app.tags || []) used.add(String(tag).toLowerCase());
	});
	const colors = { ...asTagColors(doc.settings.tagColors) };
	for (const name of Object.keys(colors)) {
		if (!used.has(name.toLowerCase())) delete colors[name];
	}
	doc.settings.tagColors = colors;
}
function asTagColors(raw: unknown): Record<string, string> {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
	const out: Record<string, string> = {};
	for (const [key, value] of Object.entries(raw)) {
		const name = String(key || "").trim().slice(0, 32);
		const hex = remapTagHex(String(value || "").trim().toLowerCase());
		if (!name || !/^#[0-9a-f]{6}$/.test(hex)) continue;
		out[name] = hex;
		if (Object.keys(out).length >= 80) break;
	}
	return out;
}
function asClickDays(raw: unknown): Record<string, number> {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
	const out: Record<string, number> = {};
	for (const [key, value] of Object.entries(raw)) {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
		const n = Math.max(0, Math.floor(Number(value) || 0));
		if (!n) continue;
		out[key] = n;
		if (Object.keys(out).length >= 800) break;
	}
	return out;
}
function asUsers(raw: unknown): StoredUser[] {
	if (!Array.isArray(raw)) return [];
	return raw.map((u: any) => {
		const row = u;
		const id = String(row.id || crypto.randomUUID());
		let roleIds = roleIdsOf(row).map((r) => String(r).slice(0, 80));
		if (id === "admin") roleIds = ["owner"];
		else {
			roleIds = roleIds.filter((r) => r !== "owner");
			if (!roleIds.length) roleIds = ["lecteur"];
		}
		return {
			id,
			username: String(row.username || "").trim().toLowerCase().slice(0, 40),
			passHash: String(row.passHash || ""),
			role: roleIds[0],
			roleIds,
			groupIds: asIdList(row.groupIds),
			grants: asGrants(row.grants),
			disabled: id === "admin" ? false : Boolean(row.disabled),
			source: row.source === "ad" || row.source === "oidc" ? row.source : "local"
		};
	}).filter((u) => u.username);
}
function asIdList(raw: unknown): string[] {
	if (!Array.isArray(raw)) return [];
	const out: string[] = [];
	const seen = /* @__PURE__ */ new Set<string>();
	for (const value of raw) {
		const id = String(value || "").trim();
		if (!id || seen.has(id)) continue;
		seen.add(id);
		out.push(id);
	}
	return out;
}
const GROUP_CAP = 160;
function asGroups(raw: unknown): Group[] {
	if (!Array.isArray(raw)) return [];
	return raw.slice(0, GROUP_CAP).map((g: any) => {
		const source = g?.source === "ad" ? "ad" : "local";
		let roleIds = roleIdsOf(g).map((r) => String(r).slice(0, 80)).filter((r) => r !== "owner");
		if (!roleIds.length && source !== "ad") roleIds = ["lecteur"];
		return {
			id: String(g?.id || crypto.randomUUID()),
			name: String(g?.name || "").trim().slice(0, 60),
			members: asIdList(g?.members),
			role: roleIds[0] || "",
			roleIds,
			grants: asGrants(g?.grants),
			source,
			externalId: String(g?.externalId || "").slice(0, 400)
		};
	}).filter((g) => g.name);
}
function ensureGroups(doc: Doc) {
	if (!Array.isArray(doc.groups)) doc.groups = [];
	doc.groups = asGroups(doc.groups);
	return doc.groups;
}
function asRoles(raw: unknown): Role[] {
	if (!Array.isArray(raw)) return [];
	return raw.slice(0, 40).map((r: any) => {
		const id = String(r?.id || crypto.randomUUID()).slice(0, 80);
		const system = isSystemRole(id);
		let grants: GrantInput[] = grantsFromLegacyRole(r);
		if (id === "owner") grants = [{ res: "portal", id: "*", allow: ["*"] }];
		return {
			id,
			name: String(r?.name || id).trim().slice(0, 40) || id,
			description: String(r?.description || "").trim().slice(0, 200),
			system,
			grants
		};
	}).filter((r) => r.name);
}
function ensureRoles(doc: Doc) {
	const byId = new Map<string, Role>();
	for (const r of asRoles(doc.roles)) byId.set(r.id, r);
	for (const s of defaultRoles()) {
		const cur = byId.get(s.id);
		if (!cur) byId.set(s.id, { ...s });
		else {
			cur.system = true;
			cur.name = s.name;
			cur.description = s.description;
			cur.grants = structuredClone(s.grants);
		}
	}
	doc.roles = [...byId.values()].slice(0, 40);
	absorbResourceAcl(doc);
	return doc.roles;
}
function normalizeTabAccess(tab: any) {
	const editors = asIdList(tab.editors);
	const viewers = asIdList(tab.viewers);
	for (const id of editors) if (!viewers.includes(id)) viewers.push(id);
	return {
		restricted: Boolean(tab.restricted),
		viewers,
		editors,
		hideLabel: Boolean(tab.hideLabel)
	};
}
function normalizeCatAccess(cat: any) {
	const editors = asIdList(cat.editors);
	const viewers = asIdList(cat.viewers);
	for (const id of editors) if (!viewers.includes(id)) viewers.push(id);
	return {
		restricted: Boolean(cat.restricted),
		viewers,
		editors
	};
}
function tabCanSee(tab: Tab | DocTab | null | undefined, user: User | null | undefined, doc: AclDoc) {
	if (!tab) return false;
	return can(user, "view", { res: "tab", id: tab.id }, doc);
}
function tabCanEdit(tab: Tab | DocTab | null | undefined, user: User | null | undefined, doc: AclDoc) {
	if (!tab || !user) return false;
	return can(user, "edit", { res: "tab", id: tab.id }, doc);
}
function catCanSee(cat: PortalCategory | null | undefined, user: User | null | undefined, doc: AclDoc) {
	if (!cat) return false;
	return can(user, "view", { res: "cat", id: cat.id }, doc);
}
type HydratedUser = StoredUser & {
	roleId?: string;
	roleIds: string[];
	canCreateTabs: boolean;
	canAudit: boolean;
	canRestore: boolean;
	canPurge: boolean;
	canManageSettings: boolean;
	canManageUsers: boolean;
	canManageGroups: boolean;
	canManageRoles: boolean;
	groupIds: string[];
	_ids: string[];
	_canEdit: boolean;
};
function hydrateUser(user: StoredUser | null | undefined, doc: Doc): HydratedUser | null | undefined {
	if (!user) return user;
	if ((user as HydratedUser)._ids) return user as HydratedUser;
	ensureRoles(doc);
	ensureGroups(doc);
	const groups = groupsOf(user, doc);
	const ids = [user.id, ...groups.map((g) => g.id)];
	const owner = isOwnerUser(user);
	const portal = { res: "portal" as const };
	const canCreateTabs = owner || can(user, "spaces.create", portal, doc);
	const canAudit = owner || can(user, "audit", portal, doc);
	const canRestore = owner || can(user, "restore", portal, doc);
	const canPurge = owner || can(user, "purge", portal, doc);
	const canManageSettings = owner || can(user, "settings", portal, doc);
	const canManageUsers = owner || can(user, "users.manage", portal, doc);
	const canManageGroups = owner || can(user, "groups.manage", portal, doc);
	const canManageRoles = owner || can(user, "roles.manage", portal, doc);
	const anyEdit = owner || canCreateTabs || (doc.tabs || []).some((t) => can(user, "edit", { res: "tab", id: t.id }, doc));
	const roleIds = roleIdsOf(user);
	return {
		...user,
		role: owner ? "admin" : roleIds[0] || "lecteur",
		roleId: roleIds[0] || user.role,
		roleIds,
		canCreateTabs,
		canAudit,
		canRestore,
		canPurge,
		canManageSettings,
		canManageUsers,
		canManageGroups,
		canManageRoles,
		groupIds: groups.map((g) => g.id),
		_ids: ids,
		_canEdit: anyEdit
	};
}
function historyVisible(doc: Doc, user: HydratedUser | null | undefined, ev: HistoryEvent) {
	if (!user) return false;
	if (user.role === "admin" || user.canAudit) return true;
	if (!user.canRestore) return false;
	const type = String(ev?.type || "");
	if (type === "login") return ev.actor === user.username;
	if (/^(user|group|role|settings|theme|oidc|ldap|auth|portal)\./.test(type)) return false;
	const tabMeta = ev?.snapshot?.tab;
	if (!tabMeta) return false;
	const live = doc.tabs.find((t) => t.id === tabMeta.id);
	return tabCanEdit(live || tabMeta, user, doc);
}
function ensureUsers(doc: Doc) {
	if (!Array.isArray(doc.users)) doc.users = [];
	let admin = doc.users.find((u) => u.id === "admin");
	if (!admin) {
		admin = {
			id: "admin",
			username: envUser(),
			passHash: hashPasswordSync(envPassword()),
			role: "owner",
			roleIds: ["owner"]
		};
		doc.users.unshift(admin);
	}
	admin.role = "owner";
	admin.roleIds = ["owner"];
	admin.disabled = false;
	if (!admin.passHash) admin.passHash = hashPasswordSync(envPassword());
	return doc.users;
}
function tabAccess(tab: DocTab, user: User | null | undefined, doc: AclDoc): TabPerm | null {
	if (!tabCanSee(tab, user, doc)) return null;
	if (tabCanEdit(tab, user, doc)) return "edit";
	return "view";
}
function readSession(token: string) {
	const row = sessions.get(token);
	if (!row || row.exp < Date.now()) {
		if (row) sessions.delete(token);
		throw new Error("errors.sessionExpired");
	}
	return row;
}
function requireUser(doc: Doc, token: string): HydratedUser {
	ensureUsers(doc);
	ensureGroups(doc);
	ensureRoles(doc);
	const sess = readSession(token);
	const user = doc.users.find((u) => u.id === sess.userId);
	if (!user) throw new Error("errors.userNotFound");
	if (user.disabled) throw new Error("errors.disabled");
	return hydrateUser(user, doc)!;
}
function requireEdit(doc: Doc, token: string, tabId?: string): HydratedUser {
	const user = requireUser(doc, token);
	if (isOwnerUser(user)) return user;
	if (tabId) {
		const tab = doc.tabs.find((t) => t.id === tabId);
		if (!tab || !tabCanEdit(tab, user, doc)) throw new Error("errors.noEditTab");
		return user;
	}
	if (user.canCreateTabs || user._canEdit || doc.tabs.some((t) => tabCanEdit(t, user, doc))) return user;
	throw new Error("errors.readonly");
}
function requireAdmin(doc: Doc, token: string): HydratedUser {
	const user = requireUser(doc, token);
	if (!isOwnerUser(user) && !user.canManageSettings) throw new Error("errors.adminOnly");
	return user;
}
function requireAccountManager(doc: Doc, token: string): HydratedUser {
	const user = requireUser(doc, token);
	if (!isOwnerUser(user) && !user.canManageUsers && !user.canManageGroups && !user.canManageRoles) throw new Error("errors.insufficient");
	return user;
}
function requireCreateTab(doc: Doc, token: string): HydratedUser {
	const user = requireUser(doc, token);
	if (isOwnerUser(user) || user.canCreateTabs) return user;
	throw new Error("errors.noManageSpaces");
}
function publicUser(u: StoredUser, doc: AclDoc) {
	const roleIds = roleIdsOf(u);
	return {
		kind: "user" as const,
		id: u.id,
		username: u.username,
		name: u.username,
		role: roleIds[0] || u.role,
		roleIds,
		grants: asGrants(u.grants),
		disabled: Boolean(u.disabled),
		source: u.source === "ad" || u.source === "oidc" ? u.source : "local",
		groupIds: asIdList(u.groupIds)
	};
}
function publicGroup(g: Group, doc: AclDoc) {
	const roleIds = roleIdsOf(g);
	return {
		kind: "group" as const,
		id: g.id,
		name: g.name,
		role: roleIds[0] || g.role || "lecteur",
		roleIds,
		grants: asGrants(g.grants),
		source: g.source === "ad" ? "ad" : "local",
		externalId: String(g.externalId || ""),
		members: asIdList(g.members)
	};
}
function latestSessionExp(userId: string) {
	let exp = 0;
	for (const row of sessions.values()) {
		if (row.userId === userId && row.exp > exp) exp = row.exp;
	}
	return exp || undefined;
}
function sessionInfo(user: StoredUser, doc: Doc): SessionInfo {
	const u = hydrateUser(user, doc)!;
	const tabPerms: Record<string, TabPerm> = {};
	for (const tab of doc.tabs) {
		const perm = tabAccess(tab, u, doc);
		if (perm) tabPerms[tab.id] = perm;
	}
	const owner = isOwnerUser(u);
	return {
		username: u.username,
		role: owner ? "admin" : u.role,
		roleId: u.roleId || (u.roleIds && u.roleIds[0]) || user.role,
		roleIds: u.roleIds || roleIdsOf(user),
		canEdit: Boolean(owner || u._canEdit),
		canManageUsers: Boolean(u.canManageUsers || owner),
		canManageGroups: Boolean(u.canManageGroups || owner),
		canManageRoles: Boolean(u.canManageRoles || owner),
		canManageSettings: Boolean(u.canManageSettings || owner),
		canCreateTabs: Boolean(u.canCreateTabs || owner),
		canAudit: Boolean(u.canAudit || owner),
		canRestore: Boolean(u.canRestore || owner),
		canPurge: Boolean(u.canPurge || owner),
		tabPerms,
		exp: latestSessionExp(u.id)
	};
}
function directoryOf(doc: Doc) {
	return ensureUsers(doc).filter((u) => u.id !== "admin").map((u) => ({
		id: u.id,
		username: u.username,
		role: roleIdsOf(u)[0] || u.role
	}));
}
function syncGroupMembers(doc: Doc, groupId: string, memberIds: unknown) {
	ensureGroups(doc);
	const g = doc.groups.find((row) => row.id === groupId);
	if (!g) return;
	const next = asIdList(memberIds).filter((id) => doc.users.some((u) => u.id === id && u.id !== "admin"));
	g.members = next;
	for (const u of doc.users) {
		u.groupIds = asIdList(u.groupIds);
		const has = next.includes(u.id);
		if (has && !u.groupIds.includes(groupId)) u.groupIds.push(groupId);
		if (!has) u.groupIds = u.groupIds.filter((id) => id !== groupId);
	}
}
function upsertAdGroups(doc: Doc, _dir: unknown, listed: { key?: string; name?: string; dn?: string; id?: string }[] | null | undefined) {
	ensureGroups(doc);
	for (const row of listed || []) {
		if (!row?.key || !row?.name) continue;
		const existing = doc.groups.find((g) => g.source === "ad" && g.externalId === row.key);
		if (existing) {
			existing.name = String(row.name).trim().slice(0, 60) || existing.name;
			continue;
		}
		if (doc.groups.length >= GROUP_CAP) break;
		doc.groups.push({
			id: crypto.randomUUID(),
			name: String(row.name).trim().slice(0, 60),
			members: [],
			role: "",
			roleIds: [],
			grants: [],
			source: "ad",
			externalId: String(row.key).slice(0, 400)
		});
	}
}
function applyAdMembership(doc: Doc, user: StoredUser | null | undefined, dirId: string, memberOf: string[] | null) {
	if (!user || user.id === "admin" || memberOf == null) return;
	ensureGroups(doc);
	const prefix = `${dirId}:`;
	const keys = new Set((Array.isArray(memberOf) ? memberOf : []).map((dn) => adGroupKey(dirId, dn)));
	for (const g of doc.groups) {
		if (g.source !== "ad" || !String(g.externalId || "").startsWith(prefix)) continue;
		const members = asIdList(g.members).filter((id) => id !== user.id);
		if (keys.has(g.externalId)) members.push(user.id);
		g.members = members;
	}
	user.groupIds = doc.groups.filter((g) => asIdList(g.members).includes(user.id)).map((g) => g.id);
}
function syncUserGroups(doc: Doc, userId: string, groupIds: unknown) {
	ensureGroups(doc);
	const user = doc.users.find((u) => u.id === userId);
	if (!user || user.role === "admin") return;
	const next = asIdList(groupIds).filter((id) => doc.groups.some((g) => g.id === id));
	user.groupIds = next;
	for (const g of doc.groups) {
		g.members = asIdList(g.members);
		const has = next.includes(g.id);
		if (has && !g.members.includes(userId)) g.members.push(userId);
		if (!has) g.members = g.members.filter((id) => id !== userId);
	}
}
function publicRole(r: Role, doc: Doc) {
	ensureUsers(doc);
	ensureGroups(doc);
	const counts = roleSummary(r, doc);
	return {
		id: r.id,
		name: r.name,
		description: r.description || "",
		system: Boolean(r.system),
		grants: asGrants(r.grants),
		userCount: counts.userCount,
		groupCount: counts.groupCount,
		grantCount: counts.grantCount
	};
}
function directoryPayload(doc: Doc, actor: User) {
	ensureUsers(doc);
	ensureGroups(doc);
	ensureRoles(doc);
	const ownerActor = isOwnerUser(actor);
	return {
		users: doc.users.filter((u) => ownerActor ? true : u.id === actor.id || u.id !== "admin").map((u) => publicUser(u, doc)),
		groups: doc.groups.map((g) => publicGroup(g, doc)),
		roles: doc.roles.map((r) => publicRole(r, doc)),
		tabs: manageTabs(doc),
		directory: directoryOf(doc)
	};
}
function stripUserAccess(doc: Doc, userId: string) {
	for (const tab of doc.tabs) {
		tab.editors = (tab.editors || []).filter((id) => id !== userId);
		tab.viewers = (tab.viewers || []).filter((id) => id !== userId);
		for (const cat of tab.categories || []) {
			cat.editors = (cat.editors || []).filter((id) => id !== userId);
			cat.viewers = (cat.viewers || []).filter((id) => id !== userId);
		}
	}
}
async function emit(doc: Doc, user: StoredUser | HydratedUser | null | undefined, tabId?: string) {
	const out = view(doc, tabId, user as HydratedUser | null);
	if (out.session && user?.id === "admin") out.session.mustChangePassword = await isDefaultAdminPassword(doc);
	return out;
}
function dayKey(d = /* @__PURE__ */ new Date(), tz?: unknown) {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: asTimeZone(tz) || "UTC",
		year: "numeric",
		month: "2-digit",
		day: "2-digit"
	}).format(d);
}
function seesFullCatalog(doc: Doc, user: User | null | undefined) {
	if (user && isOwnerUser(user)) return true;
	for (const tab of doc.tabs || []) {
		if (!can(user, "view", { res: "tab", id: tab.id }, doc)) return false;
		for (const cat of tab.categories || []) {
			if (!can(user, "view", { res: "cat", id: cat.id }, doc)) return false;
			for (const app of cat.apps || []) {
				if (!can(user, "view", { res: "card", id: app.id }, doc)) return false;
			}
		}
	}
	return true;
}
function clickStatsFor(doc: Doc, user: User | null | undefined): ClickStats {
	const stats = computeClickStats(doc);
	if (seesFullCatalog(doc, user)) return { ...stats, fullCatalog: true };
	return {
		all: 0,
		today: 0,
		week: 0,
		month: 0,
		year: 0,
		spanDays: 0,
		fullCatalog: false
	};
}
function computeClickStats(doc: Doc) {
	let all = 0;
	for (const tab of doc.tabs) for (const cat of tab.categories) for (const app of cat.apps) if (app.kind === "app") all += app.clicks || 0;
	const days = doc.clickDays ?? {};
	const now = Date.now();
	const tz = doc.settings?.timezone;
	const today = dayKey(new Date(now), tz);
	const weekFrom = dayKey(/* @__PURE__ */ new Date(now - 5184e5), tz);
	const monthFrom = dayKey(/* @__PURE__ */ new Date(now - 25056e5), tz);
	const yearFrom = dayKey(/* @__PURE__ */ new Date(now - 314496e5), tz);
	let todayN = 0;
	let week = 0;
	let month = 0;
	let year = 0;
	for (const [key, raw] of Object.entries(days)) {
		if (key > today) continue;
		const n = raw || 0;
		if (key === today) todayN += n;
		if (key >= weekFrom) week += n;
		if (key >= monthFrom) month += n;
		if (key >= yearFrom) year += n;
	}
	const oldest = Object.keys(days).filter((k) => k <= today && (days[k] || 0) > 0).sort()[0];
	const spanDays = oldest ? Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${oldest}T00:00:00Z`)) / 864e5)) : 0;
	return {
		all,
		today: todayN,
		week,
		month,
		year,
		spanDays
	};
}
function bumpClickDay(doc: Doc) {
	const key = dayKey(new Date(), doc.settings?.timezone);
	const days = { ...doc.clickDays ?? {} };
	days[key] = (days[key] || 0) + 1;
	const cutoff = dayKey(/* @__PURE__ */ new Date(Date.now() - 3456e7), doc.settings?.timezone);
	for (const k of Object.keys(days)) if (k < cutoff) delete days[k];
	doc.clickDays = days;
}
function dataPath(join: (dir: string, ...parts: string[]) => string) {
	const custom = process.env.PORTAL_DATA_FILE?.trim();
	if (custom) return custom;
	return join(process.cwd(), "data", "portal.json");
}
function asStore(raw: any): Doc | null {
	if (!raw || typeof raw !== "object") return null;
	const doc = raw;
	const tabs = Array.isArray(doc.spaces) ? doc.spaces : doc.tabs;
	if (!doc.settings || !Array.isArray(tabs)) return null;
	return {
		settings: {
			title: String(doc.settings.title || "Dockit"),
			subtitle: String(doc.settings.subtitle || ""),
			logo: typeof doc.settings.logo === "string" ? doc.settings.logo : "",
			healthChecks: doc.settings.healthChecks !== false,
			usageStats: doc.settings.usageStats !== false,
			infoBar: doc.settings.infoBar !== false,
			tagColors: asTagColors(doc.settings.tagColors),
			cssLight: sanitizeThemeCss(typeof doc.settings.cssLight === "string" ? doc.settings.cssLight : ""),
			cssDark: sanitizeThemeCss(typeof doc.settings.cssDark === "string" ? doc.settings.cssDark : ""),
			documentTitle: String(doc.settings.documentTitle || "Dockit").slice(0, 60),
			favicon: typeof doc.settings.favicon === "string" ? doc.settings.favicon.slice(0, 4e5) : "",
			favsHideLabel: Boolean(doc.settings.favsHideLabel),
			favNotes: Boolean(doc.settings.favNotes),
			favEmbeds: Boolean(doc.settings.favEmbeds),
			onlineIcons: Boolean(doc.settings.onlineIcons),
			navRichIcons: Boolean(doc.settings.navRichIcons),
			probeBlink: Boolean(doc.settings.probeBlink),
			annexFade: Boolean(doc.settings.annexFade),
			catCounts: Boolean(doc.settings.catCounts),
			pruneOrphanTags: Boolean(doc.settings.pruneOrphanTags),
			tagsAlpha: doc.settings.tagsAlpha !== false,
			cardResize: doc.settings.cardResize !== false,
			cardContextMenu: doc.settings.cardContextMenu !== false,
			cardDragCollapse: doc.settings.cardDragCollapse !== false,
			infoStats: doc.settings.infoStats !== false,
			infoGeek: doc.settings.infoGeek !== false,
			probeTlsVerify: Boolean(doc.settings.probeTlsVerify),
			probeAuthOnly: Boolean(doc.settings.probeAuthOnly),
			sessionHttpOnly: Boolean(doc.settings.sessionHttpOnly),
			devAdminNoPassword: Boolean(doc.settings.devAdminNoPassword),
			oidcEnabled: Boolean(doc.settings.oidcEnabled),
			oidcIssuer: String(doc.settings.oidcIssuer || "").trim().slice(0, 300),
			oidcClientId: String(doc.settings.oidcClientId || "").trim().slice(0, 120),
			oidcClientSecret: String(doc.settings.oidcClientSecret || "").slice(0, 200),
			oidcLabel: String(doc.settings.oidcLabel || "SSO").trim().slice(0, 40) || "SSO",
			oidcAutoCreate: Boolean(doc.settings.oidcAutoCreate),
			...syncLegacyLdap(asDirectories(doc.settings)),
			ldapDirectories: asDirectories(doc.settings),
			loginOrder: asLoginOrder(doc.settings.loginOrder, asDirectories(doc.settings)),
			locale: doc.settings.locale === "fr" ? "fr" : "en",
			dateFormat: DATE_FORMATS.includes(doc.settings.dateFormat) ? doc.settings.dateFormat : "ymd",
			timeFormat: asTimeFormat(doc.settings.timeFormat),
			timezone: asTimeZone(doc.settings.timezone)
		},
		customIcons: (Array.isArray(doc.customIcons) ? doc.customIcons : []).slice(0, MAX_CUSTOM_ICONS),
		lastTabId: typeof doc.lastSpaceId === "string" ? doc.lastSpaceId : typeof doc.lastTabId === "string" ? doc.lastTabId : void 0,
		clickDays: asClickDays(doc.clickDays),
		users: asUsers(doc.users),
		groups: asGroups(doc.groups),
		roles: asRoles(doc.roles),
		history: asHistory(doc.history),
		tabs: tabs.map((t: any, i: number) => ({
			id: t.id || crypto.randomUUID(),
			name: t.name,
			icon: t.icon || "Layers",
			sortOrder: Number(t.sortOrder ?? i + 1),
			...normalizeTabAccess(t),
			categories: (t.categories ?? []).map((c: any, j: number) => ({
				...c,
				sortOrder: Number(c.sortOrder ?? j + 1),
				...normalizeCatAccess(c),
				apps: (c.cards ?? c.apps ?? []).map((a: any, k: number) => normalizeItem(a, c.id, Number(a.sortOrder ?? k + 1)))
			}))
		}))
	};
}
function historyToDisk(row: any): any {
	if (!row || typeof row !== "object") return row;
	const restored = row.restored && typeof row.restored === "object" ? row.restored : {};
	return {
		...row,
		restored: {
			space: Boolean(restored.tab || restored.space),
			categories: Array.isArray(restored.categories) ? restored.categories : [],
			cards: Array.isArray(restored.cards) ? restored.cards : Array.isArray(restored.apps) ? restored.apps : []
		},
		snapshot: snapshotToDisk(row.snapshot)
	};
}
function toDisk(doc: Doc) {
	const { tabs, lastTabId, history, ...rest } = doc;
	return {
		...rest,
		lastSpaceId: lastTabId,
		spaces: (tabs || []).map((t) => ({
			...t,
			categories: (t.categories || []).map((c) => {
				const { apps, ...cat } = c;
				return {
					...cat,
					cards: apps || []
				};
			})
		})),
		history: (history || []).map(historyToDisk)
	};
}
let liveDoc: Doc | null = null;
let clickFlushTimer: ReturnType<typeof setTimeout> | null = null;
const CLICK_FLUSH_MS = 4000;
async function persistDocMedia(doc: Doc) {
	const { persistMediaValue } = await import("./assets");
	doc.settings.logo = await persistMediaValue("logo", doc.settings.logo);
	doc.settings.favicon = await persistMediaValue("favicon", doc.settings.favicon);
	const icons = Array.isArray(doc.customIcons) ? doc.customIcons : [];
	const next: CustomIcon[] = [];
	for (const ic of icons.slice(0, MAX_CUSTOM_ICONS)) {
		const id = String(ic.id || crypto.randomUUID());
		next.push({
			id,
			name: String(ic.name || "").slice(0, 80),
			dataUrl: await persistMediaValue(`icon-${id}`, ic.dataUrl)
		});
	}
	doc.customIcons = next;
}
async function readDocUnlocked(): Promise<Doc> {
	assertProductionSecrets();
	if (liveDoc) return liveDoc;
	const { readFile } = await import("node:fs/promises");
	const { join } = await import("node:path");
	const path = dataPath(join);
	try {
		const text = await readFile(path, "utf8");
		const parsed = asStore(JSON.parse(text));
		if (parsed && parsed.tabs.length > 0) {
			ensureRoles(parsed);
			ensureGroups(parsed);
			liveDoc = parsed;
			return parsed;
		}
	} catch {
		// ignore
	}
	const seeded = defaultStore();
	await writeDocUnlocked(seeded);
	return seeded;
}
async function persistDoc(doc: Doc) {
	await persistDocMedia(doc);
	liveDoc = doc;
	const { mkdir, rename, writeFile, unlink } = await import("node:fs/promises");
	const { dirname: dirn, join } = await import("node:path");
	const path = dataPath(join);
	await mkdir(dirn(path), { recursive: true });
	const tmp = `${path}.${process.pid}.${crypto.randomUUID()}.tmp`;
	try {
		await writeFile(tmp, `${JSON.stringify(toDisk(doc), null, 2)}\n`, "utf8");
		await rename(tmp, path);
	} catch (err) {
		await unlink(tmp).catch(() => void 0);
		throw err;
	}
}
async function writeDocUnlocked(doc: Doc) {
	if (clickFlushTimer) {
		clearTimeout(clickFlushTimer);
		clickFlushTimer = null;
	}
	await persistDoc(doc);
}
function scheduleClickFlush() {
	if (clickFlushTimer) return;
	clickFlushTimer = setTimeout(() => {
		clickFlushTimer = null;
		withLock(async () => {
			if (liveDoc) await persistDoc(liveDoc);
		});
	}, CLICK_FLUSH_MS);
}
let ioChain = Promise.resolve();
function withLock<T>(fn: () => T | Promise<T>): Promise<T> {
	const run = ioChain.then(fn, fn);
	ioChain = run.then(() => void 0, () => void 0);
	return run;
}
async function readDoc() {
	return withLock(readDocUnlocked);
}
function mutate<T>(fn: (doc: Doc) => T | Promise<T>): Promise<T> {
	return withLock(async () => {
		const doc = await readDocUnlocked();
		const result = await fn(doc);
		await writeDocUnlocked(doc);
		return result;
	});
}
async function loadPortal(tabId: string | undefined, token: string | null | undefined) {
	const doc = await readDoc();
	ensureUsers(doc);
	let user: HydratedUser | null = null;
	if (token) try {
		user = requireUser(doc, token);
	} catch {
		user = null;
	}
	const out = view(doc, tabId, user);
	if (out.session && user?.id === "admin") out.session.mustChangePassword = await isDefaultAdminPassword(doc);
	return out;
}
function publicTabs(doc: Doc, user: HydratedUser | null) {
	return [...doc.tabs].sort((a, b) => a.sortOrder - b.sortOrder).filter((t) => tabCanSee(t, user, doc)).map((t) => ({
		id: t.id,
		name: t.name,
		icon: t.icon,
		sortOrder: t.sortOrder,
		restricted: Boolean(t.restricted),
		viewers: [],
		editors: [],
		hideLabel: Boolean(t.hideLabel)
	}));
}
function manageTabs(doc: Doc) {
	return [...doc.tabs].sort((a, b) => a.sortOrder - b.sortOrder).map((t) => ({
		id: t.id,
		name: t.name,
		icon: t.icon,
		categories: (t.categories || []).map((c) => ({
			id: c.id,
			name: c.name,
			restricted: Boolean(c.restricted),
			apps: (c.apps || []).map((a) => ({
				id: a.id,
				title: a.title || "",
				kind: a.kind || "app"
			}))
		})),
		sortOrder: t.sortOrder,
		restricted: Boolean(t.restricted),
		hideLabel: Boolean(t.hideLabel)
	}));
}
function clientSettings(doc: Doc, user: HydratedUser | null | undefined) {
	const s = doc.settings;
	const dirs = asDirectories(s);
	const realms = dirs.filter(directoryReady).map((d) => ({ id: d.id, label: d.domain }));
	const out: any = {
		...s,
		logo: toClientAsset(s.logo),
		favicon: toClientAsset(s.favicon),
		oidcEnabled: Boolean(s.oidcEnabled) && Boolean(s.oidcIssuer) && Boolean(s.oidcClientId),
		oidcLabel: String(s.oidcLabel || "SSO").slice(0, 40) || "SSO",
		oidcHasSecret: Boolean(s.oidcClientSecret),
		ldapEnabled: realms.length > 0,
		ldapDomain: realms[0]?.label || "",
		ldapHasBindPassword: dirs.some((d) => Boolean(d.bindPassword)),
		ldapDirectories: dirs.map((d) => {
			const row: any = { ...d, hasBindPassword: Boolean(d.bindPassword) };
			delete row.bindPassword;
			return row;
		}),
		ldapRealms: realms,
		loginOrder: asLoginOrder(s.loginOrder, dirs),
		devAdminNoPassword: isDevRuntime() && Boolean(s.devAdminNoPassword)
	};
	delete out.oidcClientSecret;
	delete out.ldapBindPassword;
	if (!isOwnerUser(user) && !user?.canManageSettings) {
		delete out.oidcIssuer;
		delete out.oidcClientId;
		delete out.oidcAutoCreate;
		delete out.oidcHasSecret;
		delete out.ldapHost;
		delete out.ldapPort;
		delete out.ldapTls;
		delete out.ldapTlsVerify;
		delete out.ldapBindDn;
		delete out.ldapBaseDn;
		delete out.ldapUserFilter;
		delete out.ldapAutoCreate;
		delete out.ldapHasBindPassword;
		delete out.ldapDirectories;
	} else {
		out.oidcIssuer = String(s.oidcIssuer || "");
		out.oidcClientId = String(s.oidcClientId || "");
		out.oidcAutoCreate = Boolean(s.oidcAutoCreate);
		out.ldapHost = String(s.ldapHost || "");
		out.ldapPort = Number(s.ldapPort) || (s.ldapTls === false ? 389 : 636);
		out.ldapTls = s.ldapTls !== false;
		out.ldapTlsVerify = s.ldapTlsVerify !== false;
		out.ldapBindDn = String(s.ldapBindDn || "");
		out.ldapBaseDn = String(s.ldapBaseDn || "");
		out.ldapUserFilter = String(s.ldapUserFilter || "");
		out.ldapAutoCreate = Boolean(s.ldapAutoCreate);
		out.ldapDirectories = dirs.map((d) => {
			const row: any = { ...d, hasBindPassword: Boolean(d.bindPassword) };
			delete row.bindPassword;
			return row;
		});
	}
	return out;
}
function view(doc: Doc, tabId: string | undefined, user: HydratedUser | null) {
	ensureUsers(doc);
	const session = user ? sessionInfo(user, doc) : null;
	const tabs = publicTabs(doc, user);
	const activeTabId = tabId && tabs.some((t) => t.id === tabId) && tabId || doc.lastTabId && tabs.some((t) => t.id === doc.lastTabId) && doc.lastTabId || tabs[0]?.id || "";
	if (activeTabId && user?.role === "admin") doc.lastTabId = activeTabId;
	const stored = doc.tabs.find((t) => t.id === activeTabId);
	const sortCats = (cats: PortalCategory[]) => [...cats].filter((c) => catCanSee(c, user, doc)).sort((a, b) => a.sortOrder - b.sortOrder).map((c) => ({
		...c,
		apps: [...c.apps].filter((a) => can(user, "view", { res: "card", id: a.id }, doc)).sort((a, b) => a.sortOrder - b.sortOrder)
	}));
	const stripAcl = (cats: PortalCategory[]) => sortCats(cats).map((c) => ({ ...c, viewers: [], editors: [] }));
	const visibleIds = new Set(tabs.map((t) => t.id));
	const catalog = [...doc.tabs].sort((a, b) => a.sortOrder - b.sortOrder).filter((t) => visibleIds.has(t.id)).map((t) => ({
		id: t.id,
		name: t.name,
		icon: t.icon,
		sortOrder: t.sortOrder,
		restricted: Boolean(t.restricted),
		viewers: [],
		editors: [],
		hideLabel: Boolean(t.hideLabel),
		categories: stripAcl(t.categories ?? [])
	}));
	return {
		settings: clientSettings(doc, user),
		customIcons: (doc.customIcons || []).map((ic) => ({
			...ic,
			dataUrl: toClientAsset(ic.dataUrl)
		})),
		tabs,
		activeTabId,
		categories: sortCats(stored?.categories ?? []),
		catalog,
		clickStats: clickStatsFor(doc, user),
		session,
		directory: session?.canManageUsers ? directoryOf(doc) : [],
		runtime: {
			isDev: isDevRuntime(),
			publicOrigin: String(process.env.PORTAL_PUBLIC_ORIGIN || "").trim(),
			trustProxy: trustProxy()
		}
	};
}
function tabOfCategory(doc: Doc, categoryId: string): DocTab {
	const tab = doc.tabs.find((t) => t.categories!.some((c) => c.id === categoryId));
	if (!tab) throw new Error("errors.categoryNotFound");
	return tab;
}
function categoryOf(doc: Doc, categoryId: string): { tab: DocTab; cat: PortalCategory } {
	for (const tab of doc.tabs) {
		const cat = tab.categories!.find((c) => c.id === categoryId);
		if (cat) return {
			tab,
			cat
		};
	}
	throw new Error("errors.categoryNotFound");
}
function appOf(doc: Doc, appId: string): { tab: DocTab; cat: PortalCategory; app: PortalApp } {
	for (const tab of doc.tabs) for (const cat of tab.categories!) {
		const app = cat.apps.find((a) => a.id === appId);
		if (app) return {
			tab,
			cat,
			app
		};
	}
	throw new Error("errors.appNotFound");
}
function liveAppId(doc: Doc, id: string) {
	for (const tab of doc.tabs) for (const cat of tab.categories!) if (cat.apps.some((a) => a.id === id)) return true;
	return false;
}
type MetaShape = { id?: string; name?: string; icon?: string; restricted?: boolean; viewers?: string[]; editors?: string[]; hideLabel?: boolean; sortOrder?: number; apps?: any[]; cards?: any[]; categories?: any[]; [key: string]: any };
function ensureRestoredTab(doc: Doc, meta: MetaShape | null | undefined): DocTab {
	if (!meta) throw new Error("errors.historySpaceMissing");
	const byId = doc.tabs.find((t) => t.id === meta.id);
	if (byId) return byId;
	const byName = doc.tabs.find((t) => t.name.toLowerCase() === String(meta.name || "").toLowerCase());
	if (byName) return byName;
	const tab: DocTab = {
		id: meta.id && !doc.tabs.some((t) => t.id === meta.id) ? meta.id : crypto.randomUUID(),
		name: meta.name || "Space",
		icon: meta.icon || "Layers",
		sortOrder: Math.max(0, ...doc.tabs.map((t) => t.sortOrder)) + 1,
		restricted: Boolean(meta.restricted),
		viewers: Array.isArray(meta.viewers) ? [...meta.viewers] : [],
		editors: Array.isArray(meta.editors) ? [...meta.editors] : [],
		hideLabel: Boolean(meta.hideLabel),
		categories: []
	};
	doc.tabs.push(tab);
	return tab;
}
function ensureRestoredCat(tab: DocTab, meta: MetaShape | null | undefined): PortalCategory {
	if (!meta) throw new Error("errors.historyCategoryMissing");
	const cats = tab.categories ?? (tab.categories = []);
	const byId = cats.find((c) => c.id === meta.id);
	if (byId) return byId;
	const byName = cats.find((c) => c.name.toLowerCase() === String(meta.name || "").toLowerCase());
	if (byName) return byName;
	const cat: PortalCategory = {
		id: meta.id && !cats.some((c) => c.id === meta.id) ? meta.id : crypto.randomUUID(),
		name: meta.name || "Category",
		icon: meta.icon || "AppWindow",
		sortOrder: Math.max(0, ...cats.map((c) => c.sortOrder)) + 1,
		...normalizeCatAccess(meta),
		apps: []
	};
	cats.push(cat);
	return cat;
}
function putRestoredApp(doc: Doc, tabMeta: MetaShape | null | undefined, catMeta: MetaShape | null | undefined, app: any) {
	const tab = ensureRestoredTab(doc, tabMeta);
	const cat = ensureRestoredCat(tab, catMeta);
	const id = app.id && !liveAppId(doc, app.id) ? app.id : crypto.randomUUID();
	const sortOrder = Math.max(0, ...cat.apps.map((a) => a.sortOrder)) + 1;
	cat.apps.push(normalizeItem({
		...app,
		id
	}, cat.id, sortOrder));
	return {
		tab,
		cat,
		id
	};
}
function markRestored(ev: HistoryEvent, scope: "tab" | "category" | "card", id?: string) {
	if (!ev.restored) ev.restored = {
		tab: false,
		categories: [],
		apps: []
	};
	if (scope === "tab") ev.restored.tab = true;
	else if (scope === "category") {
		if (!ev.restored.categories.includes(id || "")) ev.restored.categories.push(id || "");
	} else if (!ev.restored.apps.includes(id || "")) ev.restored.apps.push(id || "");
}
function snapshotAppFromEvent(ev: HistoryEvent, targetId: string): { app: any; category: any; tab: any } | null {
	const snap = ev.snapshot || {};
	if ((snap.app || snap.card) && (snap.app || snap.card).id === targetId) return {
		app: snap.app || snap.card,
		category: snap.category,
		tab: snap.tab || snap.space
	};
	for (const app of snap.apps || snap.cards || []) if (app.id === targetId) return {
		app,
		category: snap.category,
		tab: snap.tab || snap.space
	};
	for (const cat of snap.categories || []) for (const app of cat.apps || cat.cards || []) if (app.id === targetId) return {
		app,
		category: snapshotCat(cat),
		tab: snap.tab
	};
	return null;
}
function restoreHistoryItem(doc: Doc, user: HydratedUser, eventId: string, scope: "tab" | "category" | "card", targetId: string) {
	const ev = (doc.history || []).find((row) => row.id === eventId);
	if (!ev || ev.purged || !ev.snapshot) throw new Error("errors.trashMissing");
	const snap = ev.snapshot;
	if (scope === "card") {
		const found = snapshotAppFromEvent(ev, targetId);
		if (!found) throw new Error("errors.historyCardMissing");
		putRestoredApp(doc, found.tab, found.category, found.app);
		markRestored(ev, "card", targetId);
		appendHistory(doc, user, {
			type: "card.restore",
			label: found.app.title || tt(doc, "empty.untitled"),
			snapshot: {
				tab: found.tab,
				category: found.category
			}
		});
		return found.tab.id;
	}
	if (scope === "category") {
		let catMeta = snap.category && snap.category.id === targetId ? snap.category : null;
		let apps = snap.apps || snap.cards || [];
		const tabMeta = snap.tab || snap.space;
		if (!catMeta) {
			const cat = (snap.categories || []).find((c: any) => c.id === targetId);
			if (!cat) throw new Error("errors.historyCategoryMissing");
			catMeta = snapshotCat(cat);
			apps = cat.apps || cat.cards || [];
		}
		const tab = ensureRestoredTab(doc, tabMeta);
		const cat = ensureRestoredCat(tab, catMeta);
		for (const app of apps) {
			if (liveAppId(doc, app.id)) continue;
			putRestoredApp(doc, snapshotTab(tab), snapshotCat(cat), app);
			markRestored(ev, "card", app.id);
		}
		markRestored(ev, "category", targetId);
		appendHistory(doc, user, {
			type: "category.restore",
			label: catMeta.name,
			snapshot: { tab: snapshotTab(tab), category: catMeta }
		});
		return tab.id;
	}
	if (scope === "tab") {
		if (!snap.tab && !snap.space) throw new Error("errors.historySpaceMissing");
		const tab = ensureRestoredTab(doc, snap.tab || snap.space);
		for (const cat of snap.categories || []) {
			const created = ensureRestoredCat(tab, snapshotCat(cat));
			for (const app of cat.apps || cat.cards || []) {
				if (liveAppId(doc, app.id)) continue;
				putRestoredApp(doc, snapshotTab(tab), snapshotCat(created), app);
				markRestored(ev, "card", app.id);
			}
			markRestored(ev, "category", cat.id);
		}
		markRestored(ev, "tab", snap.tab.id);
		appendHistory(doc, user, {
			type: "tab.restore",
			label: snap.tab.name,
			snapshot: { tab: snapshotTab(tab) }
		});
		return tab.id;
	}
	throw new Error("errors.restoreFail");
}
export const getPortal = createServerFn({ method: "GET" }).validator(z.object({
	tabId: z.string().optional(),
	token: z.string().optional()
})).handler(async ({ data, request }: any) => loadPortal(data.tabId, tok(data, request)));
export const listHistory = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField
})).handler(async ({ data, request }: any) => withLock(async () => {
	const doc = await readDocUnlocked();
	const user = requireUser(doc, tok(data, request));
	if (!user.canAudit && !user.canRestore && user.role !== "admin") throw new Error("errors.insufficient");
	const before = (doc.history || []).length;
	pruneHistory(doc);
	if ((doc.history || []).length !== before) await writeDocUnlocked(doc);
	const visible = (doc.history || []).filter((ev) => historyVisible(doc, user, ev));
	return withLocale(doc.settings, () => ({
		audit: user.canAudit || user.role === "admin" ? publicAudit(visible) : [],
		trash: user.canRestore || user.role === "admin" ? publicTrash(visible) : [],
		canEmpty: Boolean(user.canPurge || user.role === "admin"),
		canAudit: Boolean(user.canAudit || user.role === "admin"),
		canRestore: Boolean(user.canRestore || user.role === "admin")
	}));
}));
export const restoreHistory = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	id: z.string().min(1),
	scope: z.enum(["card", "category", "tab"]),
	targetId: z.string().min(1)
})).handler(async ({ data, request }: any) => mutate((doc) => {
	const user = requireUser(doc, tok(data, request));
	if (!user.canRestore && user.role !== "admin") throw new Error("errors.insufficient");
	const ev = (doc.history || []).find((row) => row.id === data.id);
	if (!ev || !historyVisible(doc, user, ev)) throw new Error("errors.trashMissing");
	const tabId = restoreHistoryItem(doc, user, data.id, data.scope, data.targetId);
	pruneUnusedTags(doc);
	return emit(doc, user, tabId);
}));
export const purgeTrash = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField
})).handler(async ({ data, request }: any) => mutate(async (doc) => {
	const user = requireUser(doc, tok(data, request));
	if (!user.canPurge && user.role !== "admin") throw new Error("errors.insufficient");
	emptyTrash(doc);
	const portal = await emit(doc, user);
	return withLocale(doc.settings, () => ({
		portal,
		audit: publicAudit(doc.history),
		trash: publicTrash(doc.history),
		canEmpty: true
	}));
}));
export const rememberTab = createServerFn({ method: "POST" }).validator(z.object({
	tabId: z.string().min(1),
	token: z.string().optional()
})).handler(async ({ data, request }: any) => withLock(async () => {
	const doc = await readDocUnlocked();
	if (doc.lastTabId === data.tabId) return;
	const tab = doc.tabs.find((t) => t.id === data.tabId);
	if (!tab) return;
	let user = null;
	const token = tok(data, request);
	if (token) try {
		user = requireUser(doc, token);
	} catch {
		return;
	}
	if (!user || user.role !== "admin" || !tabCanSee(tab, user, doc)) return;
	doc.lastTabId = data.tabId;
	await writeDocUnlocked(doc);
}));
export const recordClick = createServerFn({ method: "POST" }).validator(z.object({
	id: z.string().min(1),
	token: z.string().optional()
})).handler(async ({ data, request }: any) => withLock(async () => {
	const doc = await readDocUnlocked();
	let user = null;
	const token = tok(data, request);
	if (token) try {
		user = requireUser(doc, token);
	} catch {
		user = null;
	}
	const found = appOf(doc, data.id);
	if (!tabCanSee(found.tab, user, doc) || !can(user, "view", { res: "card", id: found.app.id }, doc)) return {
		id: data.id,
		clicks: found.app.clicks || 0
	};
	if (found.app.kind !== "app") return {
		id: data.id,
		clicks: found.app.clicks || 0
	};
	found.app.clicks = Math.max(0, found.app.clicks || 0) + 1;
	bumpClickDay(doc);
	liveDoc = doc;
	scheduleClickFlush();
	return {
		id: data.id,
		clicks: found.app.clicks,
		clickStats: clickStatsFor(doc, user)
	};
}));
export const resetClicks = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	tabId: z.string().optional()
})).handler(async ({ data, request }: any) => mutate((doc) => {
	const user = requireAdmin(doc, tok(data, request));
	for (const tab of doc.tabs) for (const cat of tab.categories) for (const app of cat.apps) if (app.kind === "app") app.clicks = 0;
	doc.clickDays = {};
	return emit(doc, user, data.tabId);
}));
export const resetPortal = createServerFn({ method: "POST" }).validator(z.object({ token: tokenField })).handler(async ({ data, request }: any) => mutate(async (doc) => {
	requireAdmin(doc, tok(data, request));
	const fresh = blankTabs();
	doc.settings = defaultSettings();
	doc.customIcons = [];
	doc.clickDays = {};
	doc.lastTabId = fresh.lastTabId;
	doc.tabs = fresh.tabs;
	if (process.env.NODE_ENV === "production") requireStrongPassword(envPassword());
	doc.users = [{
		id: "admin",
		username: envUser(),
		passHash: await hashPassword(envPassword()),
		role: "admin"
	}];
	for (const [tok, row] of sessions) if (row.userId !== "admin") sessions.delete(tok);
	doc.history = [];
	const admin = doc.users[0]!;
	appendHistory(doc, admin, {
		type: "portal.reset",
		label: tt(doc, "audit.item.reset")
	});
	return emit(doc, admin);
}));
export const updateSettings = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	title: z.string().min(1).max(60),
	subtitle: z.string().max(120),
	logo: z.string().max(4e5),
	healthChecks: z.boolean(),
	usageStats: z.boolean(),
	infoBar: z.boolean().optional(),
	documentTitle: z.string().max(60).optional(),
	favicon: z.string().max(4e5).optional(),
	favWidgets: z.boolean().optional(),
	favNotes: z.boolean().optional(),
	favEmbeds: z.boolean().optional(),
	onlineIcons: z.boolean().optional(),
	navRichIcons: z.boolean().optional(),
	probeBlink: z.boolean().optional(),
	annexFade: z.boolean().optional(),
	catCounts: z.boolean().optional(),
	pruneOrphanTags: z.boolean().optional(),
	tagsAlpha: z.boolean().optional(),
	cardResize: z.boolean().optional(),
	cardContextMenu: z.boolean().optional(),
	cardDragCollapse: z.boolean().optional(),
	infoStats: z.boolean().optional(),
	infoGeek: z.boolean().optional(),
	probeTlsVerify: z.boolean().optional(),
	probeAuthOnly: z.boolean().optional(),
	sessionHttpOnly: z.boolean().optional(),
	devAdminNoPassword: z.boolean().optional(),
	locale: z.enum(["en", "fr"]).optional(),
	dateFormat: z.enum(["ymd", "yyyy", "dmy", "mdy", "iso"]).optional(),
	timeFormat: z.enum(["24h", "12h"]).optional(),
	timezone: z.string().max(80).optional(),
	numberFormat: z.enum(["auto", "space-comma", "comma-dot", "dot-comma", "apostrophe-comma"]).optional(),
	tabId: z.string().optional()
})).handler(async ({ data, request }: any) => mutate((doc) => {
	const user = requireAdmin(doc, tok(data, request));
	doc.settings = {
		...doc.settings,
		title: data.title,
		subtitle: data.subtitle,
		logo: data.logo,
		healthChecks: data.healthChecks,
		usageStats: data.usageStats,
		infoBar: data.infoBar ?? doc.settings.infoBar !== false,
		documentTitle: String((data.documentTitle ?? doc.settings.documentTitle) || "Dockit").slice(0, 60),
		favicon: typeof data.favicon === "string" ? data.favicon.slice(0, 4e5) : doc.settings.favicon,
		favNotes: typeof data.favNotes === "boolean" ? data.favNotes : typeof data.favWidgets === "boolean" ? data.favWidgets : Boolean(doc.settings.favNotes),
		favEmbeds: typeof data.favEmbeds === "boolean" ? data.favEmbeds : typeof data.favWidgets === "boolean" ? data.favWidgets : Boolean(doc.settings.favEmbeds),
		onlineIcons: typeof data.onlineIcons === "boolean" ? data.onlineIcons : Boolean(doc.settings.onlineIcons),
		navRichIcons: typeof data.navRichIcons === "boolean" ? data.navRichIcons : Boolean(doc.settings.navRichIcons),
		probeBlink: typeof data.probeBlink === "boolean" ? data.probeBlink : Boolean(doc.settings.probeBlink),
		annexFade: typeof data.annexFade === "boolean" ? data.annexFade : Boolean(doc.settings.annexFade),
		catCounts: typeof data.catCounts === "boolean" ? data.catCounts : Boolean(doc.settings.catCounts),
		pruneOrphanTags: typeof data.pruneOrphanTags === "boolean" ? data.pruneOrphanTags : Boolean(doc.settings.pruneOrphanTags),
		tagsAlpha: typeof data.tagsAlpha === "boolean" ? data.tagsAlpha : doc.settings.tagsAlpha !== false,
		cardResize: typeof data.cardResize === "boolean" ? data.cardResize : doc.settings.cardResize !== false,
		cardContextMenu: typeof data.cardContextMenu === "boolean" ? data.cardContextMenu : doc.settings.cardContextMenu !== false,
		cardDragCollapse: typeof data.cardDragCollapse === "boolean" ? data.cardDragCollapse : doc.settings.cardDragCollapse !== false,
		infoStats: typeof data.infoStats === "boolean" ? data.infoStats : doc.settings.infoStats !== false,
		infoGeek: typeof data.infoGeek === "boolean" ? data.infoGeek : doc.settings.infoGeek !== false,
		probeTlsVerify: typeof data.probeTlsVerify === "boolean" ? data.probeTlsVerify : Boolean(doc.settings.probeTlsVerify),
		probeAuthOnly: typeof data.probeAuthOnly === "boolean" ? data.probeAuthOnly : Boolean(doc.settings.probeAuthOnly),
		sessionHttpOnly: typeof data.sessionHttpOnly === "boolean" ? data.sessionHttpOnly : Boolean(doc.settings.sessionHttpOnly),
		devAdminNoPassword: typeof data.devAdminNoPassword === "boolean" ? data.devAdminNoPassword : Boolean(doc.settings.devAdminNoPassword),
		dateFormat: DATE_FORMATS.includes(data.dateFormat) ? data.dateFormat : DATE_FORMATS.includes(doc.settings.dateFormat) ? doc.settings.dateFormat : "ymd",
		timeFormat: data.timeFormat === "12h" || data.timeFormat === "24h" ? data.timeFormat : asTimeFormat(doc.settings.timeFormat),
		timezone: typeof data.timezone === "string" ? asTimeZone(data.timezone) : asTimeZone(doc.settings.timezone),
		locale: data.locale === "fr" || data.locale === "en" ? data.locale : doc.settings.locale === "fr" ? "fr" : "en",
		numberFormat: NUMBER_FORMATS.includes(data.numberFormat) ? data.numberFormat : NUMBER_FORMATS.includes(doc.settings.numberFormat as import("./i18n").NumberFormat) ? doc.settings.numberFormat : "auto"
	};
	pruneUnusedTags(doc);
	appendHistory(doc, user, {
		type: "settings.update",
		label: tt(doc, "audit.item.settings")
	});
	return emit(doc, user, data.tabId);
}));
export const updateThemeCss = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	cssLight: z.string().max(CSS_MAX),
	cssDark: z.string().max(CSS_MAX),
	tabId: z.string().optional()
})).handler(async ({ data, request }: any) => mutate((doc) => {
	const user = requireAdmin(doc, tok(data, request));
	doc.settings = {
		...doc.settings,
		cssLight: sanitizeThemeCss(data.cssLight),
		cssDark: sanitizeThemeCss(data.cssDark)
	};
	appendHistory(doc, user, {
		type: "theme.update",
		label: tt(doc, "audit.item.themes")
	});
	return emit(doc, user, data.tabId);
}));
export const unlockEdit = createServerFn({ method: "POST" }).validator(z.object({
	username: z.string().max(80).optional().default(""),
	password: z.string().max(PASSWORD_MAX).optional().default(""),
	domain: z.string().min(1).max(80).optional()
})).handler(async (ctx) => {
	const data = ctx.data;
	const { ldapAuthenticate, ldapLoginName } = await import("./ldap-runtime");
	const noPass = isDevRuntime() && Boolean((await readDoc()).settings.devAdminNoPassword);
	let username = ldapLoginName(data.username);
	let domain = String(data.domain || "local");
	if (noPass && (!username || username === "admin")) {
		username = username || "admin";
		domain = "local";
	}
	if (!username) throw new Error("errors.badLogin");
	const key = clientKey(`${domain}:${username}`, (ctx as any).request);
	if (loginBlocked(key)) throw new Error("errors.badLogin");
	if (domain !== "local") {
		const snap = await readDoc();
		const dir = pickDirectory(snap.settings, domain);
		if (!dir || !directoryReady(dir)) throw new Error("errors.ldapOff");
		let auth: any;
		try {
			auth = await ldapAuthenticate(dir, username, data.password || "");
		} catch (err) {
			loginFail(key);
			throw err instanceof Error ? err : new Error("errors.ldapFail");
		}
		return mutate(async (doc) => {
			ensureUsers(doc);
			ensureGroups(doc);
			let user = doc.users.find((u) => u.username === username);
			if (!user) {
				if (!dir.autoCreate) {
					loginFail(key);
					throw new Error("errors.ldapUnknownUser");
				}
				user = {
					id: crypto.randomUUID(),
					username,
					passHash: await hashPassword(randomBytes(24).toString("hex")),
					role: "lecteur",
					roleIds: ["lecteur"],
					grants: [],
					source: "ad"
				};
				doc.users.push(user);
				appendHistory(doc, user, {
					type: "user.create",
					label: user.username
				});
			}
			if (user.disabled) {
				loginFail(key);
				throw new Error("errors.disabled");
			}
			applyAdMembership(doc, user, dir.id, auth?.memberOf);
			loginOk(key);
			appendHistory(doc, user, {
				type: "login",
				label: user.username
			});
			return {
				token: issueToken(user.id),
				session: await sessionFor(user, doc),
				sessionHttpOnly: Boolean(doc.settings.sessionHttpOnly)
			};
		});
	}
	return mutate(async (doc) => {
		ensureUsers(doc);
		const owner = doc.users.find((u) => isOwnerUser(u));
		const asOwner = noPass && (!data.username?.trim() || username === "admin" || username === owner?.username);
		const user = asOwner ? owner : doc.users.find((u) => u.username === username);
		const skipPass = noPass && isOwnerUser(user);
		if (!user || !skipPass && !await verifyPassword(data.password || "", user.passHash)) {
			loginFail(key);
			throw new Error("errors.badLogin");
		}
		if (user.disabled) {
			loginFail(key);
			throw new Error("errors.disabled");
		}
		loginOk(key);
		appendHistory(doc, user, {
			type: "login",
			label: user.username
		});
		return {
			token: issueToken(user.id),
			session: await sessionFor(user, doc),
			sessionHttpOnly: Boolean(doc.settings.sessionHttpOnly)
		};
	});
});
function pruneOidcPending() {
	const now = Date.now();
	for (const [key, row] of oidcPending) if (!row || row.exp < now) oidcPending.delete(key);
	if (oidcPending.size > 200) {
		const extra = oidcPending.size - 200;
		let n = 0;
		for (const key of oidcPending.keys()) {
			oidcPending.delete(key);
			n += 1;
			if (n >= extra) break;
		}
	}
}
export const updateOidcSettings = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	oidcEnabled: z.boolean(),
	oidcIssuer: z.string().max(300),
	oidcClientId: z.string().max(120),
	oidcClientSecret: z.string().max(200).optional(),
	oidcLabel: z.string().max(40).optional(),
	oidcAutoCreate: z.boolean().optional(),
	tabId: z.string().optional()
})).handler(async ({ data, request }: any) => mutate(async (doc) => {
	const user = requireAdmin(doc, tok(data, request));
	const issuer = data.oidcIssuer.trim();
	const clientId = data.oidcClientId.trim();
	if (data.oidcEnabled) {
		const { normalizeIssuer } = await import("./oidc-runtime");
		normalizeIssuer(issuer);
		if (!clientId) throw new Error("errors.oidcClientId");
	}
	let secret = doc.settings.oidcClientSecret || "";
	if (typeof data.oidcClientSecret === "string" && data.oidcClientSecret && data.oidcClientSecret !== "********") {
		secret = data.oidcClientSecret.slice(0, 200);
	}
	doc.settings = {
		...doc.settings,
		oidcEnabled: Boolean(data.oidcEnabled),
		oidcIssuer: issuer.slice(0, 300),
		oidcClientId: clientId.slice(0, 120),
		oidcClientSecret: secret,
		oidcLabel: String(data.oidcLabel || "SSO").trim().slice(0, 40) || "SSO",
		oidcAutoCreate: Boolean(data.oidcAutoCreate)
	};
	appendHistory(doc, user, {
		type: "oidc.update",
		label: "OIDC"
	});
	return emit(doc, user, data.tabId);
}));
export const updateLdapSettings = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	ldapDirectories: z.array(z.object({
		id: z.string().min(1).max(80),
		enabled: z.boolean(),
		host: z.string().max(253),
		port: z.number().int().min(1).max(65535).optional(),
		tls: z.boolean().optional(),
		tlsVerify: z.boolean().optional(),
		bindDn: z.string().max(300).optional(),
		bindPassword: z.string().max(200).optional(),
		baseDn: z.string().max(300).optional(),
		userFilter: z.string().max(300).optional(),
		domain: z.string().max(60).optional(),
		autoCreate: z.boolean().optional()
	})).max(8),
	tabId: z.string().optional()
})).handler(async ({ data, request }: any) => mutate(async (doc) => {
	const user = requireAdmin(doc, tok(data, request));
	const prev = asDirectories(doc.settings);
	const prevById = new Map(prev.map((d) => [d.id, d]));
	const dirs = [];
	const seen = new Set();
	for (const row of data.ldapDirectories) {
		if (seen.has(row.id)) continue;
		seen.add(row.id);
		const host = String(row.host || "").trim();
		const domain = String(row.domain || "").trim();
		const bindDn = String(row.bindDn || "").trim();
		const baseDn = String(row.baseDn || "").trim();
		if (row.enabled) {
			if (!host) throw new Error("errors.ldapHost");
			if (/[\s/:]/.test(host)) throw new Error("errors.ldapHost");
			if (!domain) throw new Error("errors.ldapDomain");
			if (bindDn && !baseDn) throw new Error("errors.ldapBaseDn");
		}
		const old = prevById.get(row.id);
		let bindPassword = old?.bindPassword || "";
		if (typeof row.bindPassword === "string" && row.bindPassword && row.bindPassword !== "********") {
			bindPassword = row.bindPassword.slice(0, 200);
		}
		const tls = row.tls !== false;
		dirs.push({
			id: row.id,
			enabled: Boolean(row.enabled),
			host: host.slice(0, 253),
			port: row.port || (tls ? 636 : 389),
			tls,
			tlsVerify: row.tlsVerify !== false,
			bindDn: bindDn.slice(0, 300),
			bindPassword,
			baseDn: baseDn.slice(0, 300),
			userFilter: String(row.userFilter || "").trim().slice(0, 300),
			domain: domain.slice(0, 60),
			autoCreate: Boolean(row.autoCreate)
		});
	}
	doc.settings = {
		...doc.settings,
		...syncLegacyLdap(dirs),
		ldapDirectories: dirs,
		loginOrder: asLoginOrder(doc.settings.loginOrder, dirs)
	};
	appendHistory(doc, user, {
		type: "ldap.update",
		label: "AD"
	});
	return emit(doc, user, data.tabId);
}));
export const searchLdapGroups = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	directoryId: z.string().min(1).max(80),
	query: z.string().max(80)
})).handler(async ({ data, request }: any) => {
	const doc = await readDoc();
	const actor = requireAccountManager(doc, tok(data, request));
	if (!isOwnerUser(actor) && !actor.canManageGroups) throw new Error("errors.insufficient");
	const dir = asDirectories(doc.settings).find((d) => d.id === data.directoryId);
	if (!dir || !directoryReady(dir)) throw new Error("errors.ldapOff");
	if (!String(dir.bindDn || "").trim() || !String(dir.baseDn || "").trim()) throw new Error("errors.ldapBaseDn");
	const { ldapSearchGroups } = await import("./ldap-runtime");
	const groups = await ldapSearchGroups(dir, data.query);
	return { groups };
});
export const linkLdapGroups = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	directoryId: z.string().min(1).max(80),
	groups: z.array(z.object({
		dn: z.string().min(1).max(400),
		name: z.string().min(1).max(60)
	})).min(1).max(20)
})).handler(async ({ data, request }: any) => mutate((doc) => {
	const actor = requireAccountManager(doc, tok(data, request));
	if (!isOwnerUser(actor) && !actor.canManageGroups) throw new Error("errors.insufficient");
	const dir = asDirectories(doc.settings).find((d) => d.id === data.directoryId);
	if (!dir || !directoryReady(dir)) throw new Error("errors.ldapOff");
	const listed = data.groups.map((g: any) => ({
		dn: g.dn,
		name: g.name,
		key: adGroupKey(dir.id, g.dn)
	}));
	upsertAdGroups(doc, dir, listed);
	appendHistory(doc, actor, {
		type: "group.create",
		label: listed.map((g: any) => g.name).join(", ")
	});
	return directoryPayload(doc, actor);
}));
export const updateLoginOrder = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	loginOrder: z.array(z.string().min(1).max(80)).min(1).max(16),
	tabId: z.string().optional()
})).handler(async ({ data, request }: any) => mutate((doc) => {
	const user = requireAdmin(doc, tok(data, request));
	doc.settings = {
		...doc.settings,
		loginOrder: asLoginOrder(data.loginOrder, asDirectories(doc.settings))
	};
	appendHistory(doc, user, {
		type: "auth.update",
		label: tt(doc, "audit.item.auth")
	});
	return emit(doc, user, data.tabId);
}));
export const startOidc = createServerFn({ method: "POST" }).validator(z.object({})).handler(async (ctx) => {
	const doc = await readDoc();
	const s = doc.settings;
	if (!s.oidcEnabled || !s.oidcIssuer || !s.oidcClientId) throw new Error("errors.oidcOff");
	const key = clientKey("oidc", (ctx as any).request);
	if (loginBlocked(key)) throw new Error("errors.tooManyTries");
	const { discoverOidc, buildAuthorizeUrl, randomUrlToken, s256, publicOrigin } = await import("./oidc-runtime");
	const origin = publicOrigin((ctx as any).request);
	if (!origin) throw new Error("errors.unknownOrigin");
	const redirectUri = `${origin}/oidc/callback`;
	const disc = await discoverOidc(s.oidcIssuer);
	pruneOidcPending();
	const state = randomUrlToken(24);
	const nonce = randomUrlToken(24);
	const verifier = randomUrlToken(32);
	oidcPending.set(state, {
		verifier,
		nonce,
		exp: Date.now() + OIDC_PENDING_MS,
		redirectUri
	});
	return {
		url: buildAuthorizeUrl(disc, {
			clientId: s.oidcClientId,
			redirectUri,
			state,
			nonce,
			challenge: s256(verifier)
		})
	};
});
export const finishOidc = createServerFn({ method: "POST" }).validator(z.object({
	code: z.string().min(1).max(4000),
	state: z.string().min(1).max(200)
})).handler(async (ctx) => {
	const pending = oidcPending.get(ctx.data.state);
	oidcPending.delete(ctx.data.state);
	if (!pending || pending.exp < Date.now()) throw new Error("errors.oidcExpired");
	const key = clientKey("oidc", (ctx as any).request);
	if (loginBlocked(key)) throw new Error("errors.tooManyTries");
	return mutate(async (doc) => {
		const s = doc.settings;
		if (!s.oidcEnabled || !s.oidcIssuer || !s.oidcClientId) throw new Error("errors.oidcOff");
		const { discoverOidc, exchangeCode, fetchUserInfo, usernameFromClaims, verifyIdToken } = await import("./oidc-runtime");
		try {
			const disc = await discoverOidc(s.oidcIssuer);
			const tokens = await exchangeCode(disc, {
				clientId: s.oidcClientId,
				clientSecret: s.oidcClientSecret || "",
				code: ctx.data.code,
				redirectUri: pending.redirectUri,
				verifier: pending.verifier
			});
			await verifyIdToken(disc, tokens.idToken, {
				clientId: s.oidcClientId,
				nonce: pending.nonce
			});
			const info = await fetchUserInfo(disc, tokens.accessToken);
			const username = usernameFromClaims(info);
			ensureUsers(doc);
			let user = doc.users.find((u) => u.username === username);
			if (!user) {
				if (!s.oidcAutoCreate) throw new Error("errors.oidcUnknownUser");
				user = {
					id: crypto.randomUUID(),
					username,
					passHash: await hashPassword(randomBytes(24).toString("hex")),
					role: "lecteur",
					roleIds: ["lecteur"],
					grants: [],
					source: "oidc"
				};
				doc.users.push(user);
				appendHistory(doc, user, {
					type: "user.create",
					label: user.username
				});
			}
			if (user.disabled) {
				loginFail(key);
				throw new Error("errors.disabled");
			}
			loginOk(key);
			appendHistory(doc, user, {
				type: "login",
				label: user.username
			});
			return {
				token: issueToken(user.id),
				session: await sessionFor(user, doc),
				sessionHttpOnly: Boolean(doc.settings.sessionHttpOnly)
			};
		} catch (err) {
			loginFail(key);
			throw err instanceof Error ? err : new Error("errors.oidcFail");
		}
	});
});
const grantField = z.object({
	res: z.enum(["portal", "tab", "cat", "card"]),
	id: z.string().min(1).max(80),
	allow: z.array(z.string()).optional(),
	deny: z.array(z.string()).optional(),
	scope: z.enum(["public"]).optional()
});
function cleanRoleIds(doc: Doc, ids: unknown, { allowOwner = false, allowEmpty = false } = {}) {
	const allowed = new Set((doc.roles || []).map((r) => r.id));
	const out: string[] = [];
	for (const id of asIdList(ids)) {
		if (!allowed.has(id)) continue;
		if (id === "owner" && !allowOwner) continue;
		if (!out.includes(id)) out.push(id);
	}
	if (out.length) return out;
	return allowEmpty ? [] : ["lecteur"];
}
export const listUsers = createServerFn({ method: "POST" }).validator(z.object({ token: tokenField })).handler(async ({ data, request }: any) => withLock(async () => {
	const doc = await readDocUnlocked();
	const actor = requireAccountManager(doc, tok(data, request));
	return directoryPayload(doc, actor);
}));
export const saveUser = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	id: z.string().optional(),
	username: z.string().min(1).max(40),
	password: z.string().max(PASSWORD_MAX).optional(),
	role: z.string().min(1).max(80).optional(),
	roleIds: z.array(z.string()).optional(),
	grants: z.array(grantField).optional(),
	disabled: z.boolean().optional(),
	groupIds: z.array(z.string()).optional()
})).handler(async ({ data, request }: any) => mutate(async (doc) => {
	const actor = requireAccountManager(doc, tok(data, request));
	if (!isOwnerUser(actor) && !actor.canManageUsers) throw new Error("errors.insufficient");
	ensureRoles(doc);
	const username = data.username.trim().toLowerCase();
	if (data.id === "admin" || isOwnerUser({ id: data.id, roleIds: data.roleIds })) {
		if (!isOwnerUser(actor)) throw new Error("errors.adminOnly");
		const admin = ensureUsers(doc).find((u) => u.id === "admin");
		if (!admin) throw new Error("errors.adminNotFound");
		if (data.password) {
			requireStrongPassword(data.password);
			admin.passHash = await hashPassword(data.password);
			appendHistory(doc, actor, {
				type: "user.update",
				label: admin.username
			});
		}
		return directoryPayload(doc, actor);
	}
	const existing = data.id ? doc.users.find((u) => u.id === data.id) : void 0;
	if (existing && isOwnerUser(existing)) throw new Error("errors.adminPasswordOnly");
	const roleIds = cleanRoleIds(doc, data.roleIds?.length ? data.roleIds : data.role ? [data.role] : existing ? roleIdsOf(existing) : ["lecteur"]);
	let target = existing;
	if (existing) {
		existing.username = username;
		existing.roleIds = roleIds;
		existing.role = roleIds[0];
		if (data.grants) existing.grants = asGrants(data.grants);
		if (data.disabled !== undefined) existing.disabled = Boolean(data.disabled);
		if (data.password) {
			requireStrongPassword(data.password);
			existing.passHash = await hashPassword(data.password);
		}
	} else {
		requireStrongPassword(data.password || "");
		if (doc.users.some((u) => u.username === username)) throw new Error("errors.usernameTaken");
		target = {
			id: crypto.randomUUID(),
			username,
			passHash: await hashPassword(data.password),
			role: roleIds[0],
			roleIds,
			grants: asGrants(data.grants),
			disabled: Boolean(data.disabled),
			groupIds: []
		};
		doc.users.push(target);
	}
	if (data.groupIds) syncUserGroups(doc, target!.id, data.groupIds);
	appendHistory(doc, actor, {
		type: existing ? "user.update" : "user.create",
		label: username
	});
	return directoryPayload(doc, actor);
}));
export const deleteUser = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	id: z.string().min(1)
})).handler(async ({ data, request }: any) => mutate((doc) => {
	const actor = requireAccountManager(doc, tok(data, request));
	const target = doc.users.find((u) => u.id === data.id);
	if (!target) throw new Error("errors.userNotFound");
	if (target.role === "admin" || target.id === "admin") throw new Error("errors.cannotDeleteAdmin");
	if (actor.role !== "admin" && target.role === "admin") throw new Error("errors.insufficient");
	stripUserAccess(doc, target.id);
	syncUserGroups(doc, target.id, []);
	doc.users = doc.users.filter((u) => u.id !== data.id);
	appendHistory(doc, actor, {
		type: "user.delete",
		label: target.username
	});
	return directoryPayload(doc, actor);
}));
export const saveGroup = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	id: z.string().optional(),
	name: z.string().min(1).max(60),
	role: z.string().min(1).max(80).optional(),
	roleIds: z.array(z.string()).optional(),
	members: z.array(z.string()).optional(),
	grants: z.array(grantField).optional()
})).handler(async ({ data, request }: any) => mutate((doc) => {
	const actor = requireAccountManager(doc, tok(data, request));
	if (!isOwnerUser(actor) && !actor.canManageGroups) throw new Error("errors.insufficient");
	ensureGroups(doc);
	ensureRoles(doc);
	let target = data.id ? doc.groups.find((g) => g.id === data.id) : void 0;
	if (data.id && !target) throw new Error("errors.userNotFound");
	const roleIds = cleanRoleIds(doc, data.roleIds?.length ? data.roleIds : data.role ? [data.role] : target?.source === "ad" ? [] : ["lecteur"], { allowEmpty: target?.source === "ad" });
	const name = data.name.trim().slice(0, 60);
	if (!name) throw new Error("errors.nameRequired");
	if (target?.source === "ad") {
		target.roleIds = roleIds;
		target.role = roleIds[0] || "";
		if (data.grants) target.grants = asGrants(data.grants);
	} else if (target) {
		if (doc.groups.some((g) => g.id !== target!.id && (g.name || "").toLowerCase() === name.toLowerCase())) throw new Error("errors.usernameTaken");
		target.name = name;
		target.roleIds = roleIds;
		target.role = roleIds[0];
		if (data.grants) target.grants = asGrants(data.grants);
	} else {
		if (doc.groups.some((g) => (g.name || "").toLowerCase() === name.toLowerCase())) throw new Error("errors.usernameTaken");
		target = {
			id: crypto.randomUUID(),
			name,
			members: [],
			role: roleIds[0],
			roleIds,
			grants: asGrants(data.grants),
			source: "local",
			externalId: ""
		};
		doc.groups.push(target);
	}
	if (target.source !== "ad") syncGroupMembers(doc, target.id, data.members ?? target.members);
	appendHistory(doc, actor, {
		type: data.id ? "group.update" : "group.create",
		label: target.name
	});
	return directoryPayload(doc, actor);
}));
export const deleteGroup = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	id: z.string().min(1)
})).handler(async ({ data, request }: any) => mutate((doc) => {
	const actor = requireAccountManager(doc, tok(data, request));
	ensureGroups(doc);
	const target = doc.groups.find((g) => g.id === data.id);
	if (!target) throw new Error("errors.userNotFound");
	syncGroupMembers(doc, target.id, []);
	stripUserAccess(doc, target.id);
	doc.groups = doc.groups.filter((g) => g.id !== data.id);
	appendHistory(doc, actor, {
		type: "group.delete",
		label: target.name
	});
	return directoryPayload(doc, actor);
}));
export const saveRole = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	id: z.string().optional(),
	name: z.string().min(1).max(40),
	description: z.string().max(200).optional(),
	grants: z.array(grantField).optional(),
	userIds: z.array(z.string()).optional(),
	groupIds: z.array(z.string()).optional()
})).handler(async ({ data, request }: any) => mutate((doc) => {
	const actor = requireAccountManager(doc, tok(data, request));
	if (!isOwnerUser(actor) && !actor.canManageRoles) throw new Error("errors.insufficient");
	ensureRoles(doc);
	const name = data.name.trim().slice(0, 40);
	if (!name) throw new Error("errors.nameRequired");
	let target = data.id ? doc.roles.find((r) => r.id === data.id) : void 0;
	if (data.id && !target) throw new Error("errors.userNotFound");
	if (target && (target.system || isSystemRole(target.id))) {
		if (target.id === "owner") return directoryPayload(doc, actor);
		if (data.userIds || data.groupIds) setRoleHolders(doc, target.id, data.userIds || [], data.groupIds || []);
		appendHistory(doc, actor, {
			type: "role.update",
			label: target.name
		});
		return directoryPayload(doc, actor);
	}
	const description = String(data.description || "").trim().slice(0, 200);
	const grants = asGrants(data.grants);
	if (target) {
		if (doc.roles.some((r) => r.id !== target!.id && (r.name || "").toLowerCase() === name.toLowerCase())) throw new Error("errors.usernameTaken");
		target.name = name;
		target.description = description;
		target.grants = grants;
	} else {
		if (doc.roles.length >= 40) throw new Error("errors.tooManyIcons");
		if (doc.roles.some((r) => (r.name || "").toLowerCase() === name.toLowerCase())) throw new Error("errors.usernameTaken");
		target = {
			id: crypto.randomUUID(),
			name,
			description,
			system: false,
			grants
		};
		doc.roles.push(target);
	}
	if (target.id !== "owner" && (data.userIds || data.groupIds)) setRoleHolders(doc, target.id, data.userIds || [], data.groupIds || []);
	appendHistory(doc, actor, {
		type: data.id ? "role.update" : "role.create",
		label: target.name
	});
	return directoryPayload(doc, actor);
}));
export const deleteRole = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	id: z.string().min(1)
})).handler(async ({ data, request }: any) => mutate((doc) => {
	const actor = requireAccountManager(doc, tok(data, request));
	if (!isOwnerUser(actor) && !actor.canManageRoles) throw new Error("errors.insufficient");
	ensureRoles(doc);
	const target = doc.roles.find((r) => r.id === data.id);
	if (!target) throw new Error("errors.userNotFound");
	if (target.system || isSystemRole(target.id)) throw new Error("errors.insufficient");
	stripRole(doc, target.id);
	doc.roles = doc.roles.filter((r) => r.id !== data.id);
	appendHistory(doc, actor, {
		type: "role.delete",
		label: target.name
	});
	return directoryPayload(doc, actor);
}));
export const createTab = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	name: z.string().min(1).max(40),
	icon: z.string().min(1).max(4e5),
	restricted: z.boolean().optional(),
	viewers: z.array(z.string()).optional(),
	editors: z.array(z.string()).optional(),
	hideLabel: z.boolean().optional()
})).handler(async ({ data, request }: any) => mutate((doc) => {
	const user = requireCreateTab(doc, tok(data, request));
	const id = crypto.randomUUID();
	const next = Math.max(0, ...doc.tabs.map((t) => t.sortOrder)) + 1;
	doc.tabs.push({
		id,
		name: data.name,
		icon: data.icon,
		sortOrder: next,
		restricted: Boolean(data.restricted),
		viewers: [],
		editors: [],
		hideLabel: Boolean(data.hideLabel),
		categories: []
	});
	if (!isOwnerUser(user)) {
		const live = doc.users.find((u) => u.id === user.id);
		if (live) live.grants = mergeGrant(asGrants(live.grants), { res: "tab", id, allow: ["view", "open", "edit", "create", "delete", "move"] });
	}
	appendHistory(doc, user, {
		type: "tab.create",
		label: data.name,
		snapshot: { tab: snapshotTab(doc.tabs[doc.tabs.length - 1]) }
	});
	return emit(doc, user, id);
}));
export const duplicateTab = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	id: z.string().min(1)
})).handler(async ({ data, request }: any) => mutate((doc) => {
	const user = requireCreateTab(doc, tok(data, request));
	const src = doc.tabs.find((t) => t.id === data.id);
	if (!src) throw new Error("errors.spaceNotFound");
	requireEdit(doc, tok(data, request), src.id);
	const tabId = crypto.randomUUID();
	const suffix = tt(doc, "copy.suffix");
	const base = String(src.name || "").trim().replace(/\s*\((copie|copy)\)\s*$/i, "") || tt(doc, "nav.space");
	const ordered = [...doc.tabs].sort((a, b) => a.sortOrder - b.sortOrder);
	const srcIndex = ordered.findIndex((t) => t.id === src.id);
	doc.tabs.push({
		id: tabId,
		name: `${base} (${suffix})`.slice(0, 40),
		icon: src.icon || "Layers",
		sortOrder: 0,
		restricted: Boolean(src.restricted),
		viewers: [...(src.viewers || [])],
		editors: [...(src.editors || [])],
		hideLabel: Boolean(src.hideLabel),
		categories: (src.categories || []).map((c, ci) => {
			const catId = crypto.randomUUID();
			return {
				id: catId,
				name: c.name,
				icon: c.icon || "AppWindow",
				sortOrder: Number(c.sortOrder ?? ci + 1),
				...normalizeCatAccess(c),
				apps: (c.apps || []).map((a, ai) => normalizeItem({
					...a,
					id: crypto.randomUUID(),
					clicks: 0
				}, catId, ai + 1))
			};
		})
	});
	const ids = ordered.map((t) => t.id);
	ids.splice(srcIndex < 0 ? ids.length : srcIndex + 1, 0, tabId);
	ids.forEach((id, i) => {
		const tab = doc.tabs.find((t) => t.id === id);
		if (tab) tab.sortOrder = i + 1;
	});
	appendHistory(doc, user, {
		type: "tab.duplicate",
		label: `${base} (${suffix})`.slice(0, 40),
		snapshot: { tab: snapshotTab(doc.tabs.find((t) => t.id === tabId)) }
	});
	return emit(doc, user, tabId);
}));
export const updateTab = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	id: z.string().min(1),
	name: z.string().min(1).max(40),
	icon: z.string().min(1).max(4e5),
	restricted: z.boolean().optional(),
	viewers: z.array(z.string()).optional(),
	editors: z.array(z.string()).optional(),
	hideLabel: z.boolean().optional()
})).handler(async ({ data, request }: any) => mutate((doc) => {
	const user = requireEdit(doc, tok(data, request), data.id);
	const tab = doc.tabs.find((t) => t.id === data.id);
	if (!tab) throw new Error("errors.portalNotFound");
	tab.name = data.name;
	tab.icon = data.icon;
	if (typeof data.hideLabel === "boolean") tab.hideLabel = data.hideLabel;
	if (user.role === "admin") {
		if (typeof data.restricted === "boolean") tab.restricted = data.restricted;
		if (data.viewers) tab.viewers = asIdList(data.viewers);
		if (data.editors) tab.editors = asIdList(data.editors);
		for (const id of tab.editors) if (!tab.viewers.includes(id)) tab.viewers.push(id);
	}
	appendHistory(doc, user, {
		type: "tab.update",
		label: tab.name,
		snapshot: { tab: snapshotTab(tab) }
	});
	return emit(doc, user, data.id);
}));
export const updateFavsOptions = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	hideLabel: z.boolean(),
	tabId: z.string().optional()
})).handler(async ({ data, request }: any) => mutate((doc) => {
	const user = requireEdit(doc, tok(data, request));
	doc.settings.favsHideLabel = data.hideLabel;
	return emit(doc, user, data.tabId);
}));
export const deleteTab = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	id: z.string().min(1)
})).handler(async ({ data, request }: any) => mutate((doc) => {
	const user = requireEdit(doc, tok(data, request), data.id);
	if (doc.tabs.length <= 1) throw new Error("errors.lastSpace");
	const tab = doc.tabs.find((t) => t.id === data.id);
	if (tab) appendHistory(doc, user, {
		type: "tab.delete",
		label: tab.name,
		snapshot: {
			tab: snapshotTab(tab),
			categories: (tab.categories || []).map((c) => ({
				...snapshotCat(c),
				apps: (c.apps || []).map(snapshotApp)
			}))
		}
	});
	doc.tabs = doc.tabs.filter((t) => t.id !== data.id);
	pruneUnusedTags(doc);
	return emit(doc, user);
}));
export const createCategory = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	tabId: z.string().min(1),
	name: z.string().min(1).max(60),
	icon: z.string().min(1).max(4e5),
	restricted: z.boolean().optional(),
	viewers: z.array(z.string()).optional(),
	editors: z.array(z.string()).optional()
})).handler(async ({ data, request }: any) => mutate((doc) => {
	const user = requireEdit(doc, tok(data, request), data.tabId);
	const tab = doc.tabs.find((t) => t.id === data.tabId);
	if (!tab) throw new Error("errors.portalNotFound");
	const next = Math.max(0, ...tab.categories.map((c) => c.sortOrder)) + 1;
	const access = user.role === "admin" ? normalizeCatAccess({
		restricted: data.restricted,
		viewers: data.viewers,
		editors: data.editors
	}) : {
		restricted: false,
		viewers: [],
		editors: []
	};
	tab.categories.push({
		id: crypto.randomUUID(),
		name: data.name,
		icon: data.icon,
		sortOrder: next,
		...access,
		apps: []
	});
	appendHistory(doc, user, {
		type: "category.create",
		label: data.name,
		snapshot: {
			tab: snapshotTab(tab),
			category: snapshotCat(tab.categories[tab.categories.length - 1])
		}
	});
	return emit(doc, user, data.tabId);
}));
export const updateCategory = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	id: z.string().min(1),
	name: z.string().min(1).max(60),
	icon: z.string().min(1).max(4e5),
	restricted: z.boolean().optional(),
	viewers: z.array(z.string()).optional(),
	editors: z.array(z.string()).optional()
})).handler(async ({ data, request }: any) => mutate((doc) => {
	const user = requireEdit(doc, tok(data, request));
	const { tab, cat } = categoryOf(doc, data.id);
	requireEdit(doc, tok(data, request), tab.id);
	cat.name = data.name;
	cat.icon = data.icon;
	if (user.role === "admin" && typeof data.restricted === "boolean") Object.assign(cat, normalizeCatAccess({
		restricted: data.restricted,
		viewers: data.viewers,
		editors: data.editors
	}));
	appendHistory(doc, user, {
		type: "category.update",
		label: cat.name,
		snapshot: {
			tab: snapshotTab(tab),
			category: snapshotCat(cat)
		}
	});
	return emit(doc, user, tab.id);
}));
export const deleteCategory = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	id: z.string().min(1)
})).handler(async ({ data, request }: any) => mutate((doc) => {
	const user = requireEdit(doc, tok(data, request));
	const tab = tabOfCategory(doc, data.id);
	requireEdit(doc, tok(data, request), tab.id);
	const cat = tab.categories.find((c) => c.id === data.id);
	if (cat) appendHistory(doc, user, {
		type: "category.delete",
		label: cat.name,
		snapshot: {
			tab: snapshotTab(tab),
			category: snapshotCat(cat),
			apps: (cat.apps || []).map(snapshotApp)
		}
	});
	tab.categories = tab.categories.filter((c) => c.id !== data.id);
	pruneUnusedTags(doc);
	return emit(doc, user, tab.id);
}));
const itemPayload = {
	categoryId: z.string().min(1),
	kind: z.enum([
		"app",
		"note",
		"embed"
	]).default("app"),
	title: z.string().max(80).default(""),
	description: z.string().max(8e3),
	url: z.string().max(2e3),
	icon: z.string().min(1).max(4e5),
	openIn: z.enum(["_blank", "_self"]),
	tags: z.array(z.string().min(1).max(32)).max(3).default([]),
	colSpan: z.union([
		z.literal(1),
		z.literal(2),
		z.literal(3)
	]).default(1),
	rowSpan: z.union([
		z.literal(1),
		z.literal(2),
		z.literal(3)
	]).default(1),
	check: z.enum([
		"off",
		"http",
		"icmp"
	]).default("off"),
	checkHost: z.string().max(253).default(""),
	links: z.array(z.object({
		title: z.string().min(1).max(40),
		url: z.string().min(1).max(2e3)
	})).max(4).optional().default([]),
	tagColors: z.record(z.string().min(1).max(32), z.string().max(7)).optional()
};
function requireUrl(kind: unknown, url: string) {
	if (kind === "note") return;
	if (!safeAppHref(url)) throw new Error(kind === "embed" ? "errors.embedUrlRequired" : "errors.urlRequired");
}
function requireTitle(kind: unknown, title: string) {
	if (kind === "note" || kind === "embed") return;
	if (!title.trim()) throw new Error("errors.nameRequired");
}
function requireBody(kind: unknown, description: unknown) {
	if (kind !== "note") return;
	if (!String(description || "").trim()) throw new Error("errors.contentRequired");
}
export const createApp = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	...itemPayload
})).handler(async ({ data, request }: any) => mutate((doc) => {
	const user = requireEdit(doc, tok(data, request));
	requireUrl(data.kind, data.url);
	requireTitle(data.kind, data.title);
	requireBody(data.kind, data.description);
	const { tab, cat } = categoryOf(doc, data.categoryId);
	requireEdit(doc, tok(data, request), tab.id);
	const next = Math.max(0, ...cat.apps.map((a) => a.sortOrder)) + 1;
	cat.apps.push(normalizeItem({
		kind: data.kind,
		title: data.title,
		description: data.description,
		url: data.url,
		icon: data.icon,
		openIn: data.openIn,
		tags: data.tags,
		colSpan: data.colSpan,
		rowSpan: data.rowSpan,
		check: data.check,
		checkHost: data.checkHost,
		links: data.links
	}, cat.id, next));
	assignTagColors(doc, data.tags, data.tagColors);
	const created = cat.apps[cat.apps.length - 1];
	appendHistory(doc, user, {
		type: "card.create",
		label: created.title || tt(doc, "empty.untitled"),
		snapshot: {
			tab: snapshotTab(tab),
			category: snapshotCat(cat),
			app: snapshotApp(created)
		}
	});
	return emit(doc, user, tab.id);
}));
export const updateApp = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	id: z.string().min(1),
	...itemPayload
})).handler(async ({ data, request }: any) => mutate((doc) => {
	const user = requireEdit(doc, tok(data, request));
	requireUrl(data.kind, data.url);
	requireTitle(data.kind, data.title);
	requireBody(data.kind, data.description);
	const found = appOf(doc, data.id);
	const dest = categoryOf(doc, data.categoryId);
	requireEdit(doc, tok(data, request), found.tab.id);
	requireEdit(doc, tok(data, request), dest.tab.id);
	if (found.cat.id !== dest.cat.id) {
		found.cat.apps = found.cat.apps.filter((a) => a.id !== data.id);
		dest.cat.apps.push(found.app);
	}
	const next = normalizeItem({
		...found.app,
		kind: data.kind,
		title: data.title,
		description: data.description,
		url: data.url,
		icon: data.icon,
		openIn: data.openIn,
		tags: data.tags,
		colSpan: data.colSpan,
		rowSpan: data.rowSpan,
		check: data.check,
		checkHost: data.checkHost,
		clicks: found.app.clicks,
		links: data.links
	}, dest.cat.id, found.app.sortOrder);
	Object.assign(found.app, next);
	found.app.id = data.id;
	found.app.categoryId = dest.cat.id;
	assignTagColors(doc, data.tags, data.tagColors);
	pruneUnusedTags(doc);
	appendHistory(doc, user, {
		type: "card.update",
		label: found.app.title || tt(doc, "empty.untitled"),
		snapshot: {
			tab: snapshotTab(dest.tab),
			category: snapshotCat(dest.cat),
			app: snapshotApp(found.app)
		}
	});
	return emit(doc, user, dest.tab.id);
}));
export const deleteApp = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	id: z.string().min(1)
})).handler(async ({ data, request }: any) => mutate((doc) => {
	const user = requireEdit(doc, tok(data, request));
	const { tab, cat, app } = appOf(doc, data.id);
	requireEdit(doc, tok(data, request), tab.id);
	appendHistory(doc, user, {
		type: "card.delete",
		label: app.title || tt(doc, "empty.untitled"),
		snapshot: {
			tab: snapshotTab(tab),
			category: snapshotCat(cat),
			app: snapshotApp(app)
		}
	});
	cat.apps = cat.apps.filter((a) => a.id !== data.id);
	pruneUnusedTags(doc);
	return emit(doc, user, tab.id);
}));
export const reorderApps = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	tabId: z.string().min(1),
	placements: z.array(z.object({
		id: z.string().min(1),
		categoryId: z.string().min(1),
		sortOrder: z.number().int().min(0).max(9999)
	})).min(1).max(400)
})).handler(async ({ data, request }: any) => mutate((doc) => {
	const user = requireEdit(doc, tok(data, request), data.tabId);
	const tab = doc.tabs.find((t) => t.id === data.tabId);
	if (!tab) throw new Error("errors.portalNotFound");
	const allowed = new Set(tab.categories.map((c) => c.id));
	const bag = /* @__PURE__ */ new Map();
	for (const cat of tab.categories) {
		for (const app of cat.apps) bag.set(app.id, app);
		cat.apps = [];
	}
	for (const p of data.placements) {
		if (!allowed.has(p.categoryId)) throw new Error("errors.badCategory");
		const app = bag.get(p.id);
		if (!app) continue;
		app.categoryId = p.categoryId;
		app.sortOrder = p.sortOrder;
		tab.categories.find((c) => c.id === p.categoryId)?.apps.push(app);
		bag.delete(p.id);
	}
	for (const leftover of bag.values()) tab.categories.find((c) => c.id === leftover.categoryId)?.apps.push(leftover);
	return emit(doc, user, data.tabId);
}));
export const arrangeCategory = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	categoryId: z.string().min(1),
	sort: z.enum(["alpha", "za"]).optional(),
	resetSpans: z.boolean().optional()
})).handler(async ({ data, request }: any) => mutate((doc) => {
	const { tab, cat } = categoryOf(doc, data.categoryId);
	const user = requireEdit(doc, tok(data, request), tab.id);
	let changed = false;
	if (data.sort === "alpha" || data.sort === "za") {
		const next = sortAppsAlpha(cat.apps, doc.settings.locale, data.sort === "za" ? "za" : "az");
		const same = next.length === cat.apps.length && next.every((a, i) => a.id === cat.apps[i]?.id);
		cat.apps = next;
		cat.apps.forEach((a, i) => {
			a.sortOrder = i + 1;
		});
		if (!same) changed = true;
	}
	if (data.resetSpans) {
		for (const app of cat.apps) {
			if (app.colSpan !== 1 || app.rowSpan !== 1) {
				app.colSpan = 1;
				app.rowSpan = 1;
				changed = true;
			}
		}
	}
	if (changed) appendHistory(doc, user, {
		type: data.sort === "alpha" ? "category.sort" : "category.resetLayout",
		label: cat.name,
		snapshot: {
			tab: snapshotTab(tab),
			category: snapshotCat(cat)
		}
	});
	return emit(doc, user, tab.id);
}));
export const moveApp = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	id: z.string().min(1),
	destTabId: z.string().min(1),
	destCategoryId: z.string().min(1),
	sortOrder: z.number().int().min(0).max(9999)
})).handler(async ({ data, request }: any) => mutate((doc) => {
	const user = requireUser(doc, tok(data, request));
	const found = appOf(doc, data.id);
	if (!isOwnerUser(user) && !can(user, "move", { res: "card", id: found.app.id }, doc)) throw new Error("errors.noMove");
	if (!isOwnerUser(user) && !can(user, "move", { res: "cat", id: data.destCategoryId }, doc) && !can(user, "edit", { res: "tab", id: data.destTabId }, doc)) throw new Error("errors.noMove");
	requireEdit(doc, tok(data, request), data.destTabId);
	const dest = categoryOf(doc, data.destCategoryId);
	if (dest.tab.id !== data.destTabId) throw new Error("errors.categoryNotFound");
	found.cat.apps = found.cat.apps.filter((a) => a.id !== data.id);
	dest.cat.apps = dest.cat.apps.filter((a) => a.id !== data.id);
	const at = Math.max(0, Math.min(Math.max(0, data.sortOrder - 1), dest.cat.apps.length));
	dest.cat.apps.splice(at, 0, found.app);
	found.cat.apps.forEach((a, i) => {
		a.sortOrder = i + 1;
	});
	dest.cat.apps.forEach((a, i) => {
		a.sortOrder = i + 1;
		a.categoryId = dest.cat.id;
	});
	pruneUnusedTags(doc);
	appendHistory(doc, user, {
		type: "card.update",
		label: found.app.title || tt(doc, "empty.untitled"),
		snapshot: {
			tab: snapshotTab(dest.tab),
			category: snapshotCat(dest.cat),
			app: snapshotApp(found.app)
		}
	});
	return emit(doc, user, dest.tab.id);
}));
export const reorderCategories = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	tabId: z.string().min(1),
	order: z.array(z.string().min(1)).min(1).max(80)
})).handler(async ({ data, request }: any) => mutate((doc) => {
	const user = requireEdit(doc, tok(data, request), data.tabId);
	const tab = doc.tabs.find((t) => t.id === data.tabId);
	if (!tab) throw new Error("errors.portalNotFound");
	data.order.forEach((id: string, i: number) => {
		const cat = tab.categories.find((c) => c.id === id);
		if (cat) cat.sortOrder = i + 1;
	});
	tab.categories.sort((a, b) => a.sortOrder - b.sortOrder);
	return emit(doc, user, data.tabId);
}));
export const previewMoveCategory = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	categoryId: z.string().min(1),
	destTabId: z.string().min(1)
})).handler(async ({ data, request }: any) => withLock(async () => {
	const doc = await readDocUnlocked();
	const user = requireUser(doc, tok(data, request));
	if (!isOwnerUser(user) && !can(user, "move", { res: "cat", id: data.categoryId }, doc)) throw new Error("errors.noMove");
	const impact = categoryMoveImpact(doc, data.categoryId, data.destTabId);
	if (!impact) throw new Error("errors.categoryNotFound");
	return impact;
}));
export const moveCategory = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	categoryId: z.string().min(1),
	destTabId: z.string().min(1),
	insertAt: z.number().int().min(0).max(80).optional()
})).handler(async ({ data, request }: any) => mutate((doc) => {
	const user = requireUser(doc, tok(data, request));
	if (!isOwnerUser(user) && !can(user, "move", { res: "cat", id: data.categoryId }, doc)) throw new Error("errors.noMove");
	if (!isOwnerUser(user) && !can(user, "move", { res: "tab", id: data.destTabId }, doc) && !can(user, "edit", { res: "tab", id: data.destTabId }, doc)) throw new Error("errors.noMove");
	const moved = moveCategoryInDoc(doc, data.categoryId, data.destTabId, data.insertAt);
	if (!moved) throw new Error("errors.categoryNotFound");
	appendHistory(doc, user, {
		type: "category.update",
		label: moved.cat.name,
		snapshot: {
			tab: snapshotTab(moved.dest),
			category: snapshotCat(moved.cat)
		}
	});
	return emit(doc, user, moved.dest.id);
}));
export const reorderTabs = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	tabId: z.string().optional(),
	order: z.array(z.string().min(1)).min(1).max(40)
})).handler(async ({ data, request }: any) => mutate((doc) => {
	const user = requireCreateTab(doc, tok(data, request));
	data.order.forEach((id: string, i: number) => {
		const tab = doc.tabs.find((t) => t.id === id);
		if (tab) tab.sortOrder = i + 1;
	});
	doc.tabs.sort((a, b) => a.sortOrder - b.sortOrder);
	return emit(doc, user, data.tabId);
}));
function eachItem(doc: Doc, fn: (app: PortalApp) => void) {
	for (const tab of doc.tabs) for (const cat of tab.categories) for (const app of cat.apps) fn(app);
}
function tagColorFromName(name: unknown) {
	return defaultTagHex(String(name));
}
export const manageTags = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	tabId: z.string().optional(),
	create: z.array(z.string().min(1).max(32)).max(40).optional(),
	rename: z.array(z.object({
		from: z.string().min(1).max(32),
		to: z.string().max(32)
	})).max(80).optional(),
	remove: z.array(z.string().min(1).max(32)).max(80).optional(),
	colors: z.record(z.string().min(1).max(32), z.string().max(7)).optional()
})).handler(async ({ data, request }: any) => mutate((doc) => {
	const user = requireAdmin(doc, tok(data, request));
	const removeKeys = new Set((data.remove ?? []).map((t: string) => t.trim().toLowerCase()).filter(Boolean));
	const renameMap = /* @__PURE__ */ new Map();
	for (const r of (data.rename ?? []) as { from: string; to: string }[]) {
		const from = r.from.trim().toLowerCase();
		const to = r.to.trim().slice(0, 32);
		if (!from) continue;
		renameMap.set(from, to);
	}
	eachItem(doc, (app) => {
		const next: string[] = [];
		const seen = /* @__PURE__ */ new Set();
		for (const tag of app.tags) {
			const key = tag.toLowerCase();
			if (removeKeys.has(key)) continue;
			const renamed = renameMap.has(key) ? renameMap.get(key) : tag;
			if (!renamed) continue;
			const nk = renamed.toLowerCase();
			if (seen.has(nk)) continue;
			seen.add(nk);
			next.push(renamed);
		}
		app.tags = next;
	});
	const colors = { ...asTagColors(doc.settings.tagColors) };
	if (data.colors) for (const [name, value] of Object.entries(data.colors)) {
		const tag = name.trim().slice(0, 32);
		const hex = remapTagHex(String(value || "").trim().toLowerCase());
		if (!tag || !/^#[0-9a-f]{6}$/.test(hex)) continue;
		const existing = Object.keys(colors).find((k) => k.toLowerCase() === tag.toLowerCase());
		if (existing) delete colors[existing];
		colors[tag] = hex;
	}
	for (const [from, to] of renameMap) {
		const hit = Object.keys(colors).find((k) => k.toLowerCase() === from);
		if (!hit) continue;
		const hex = colors[hit];
		delete colors[hit];
		if (to) colors[to] = hex;
	}
	for (const key of removeKeys) for (const name of Object.keys(colors)) if (name.toLowerCase() === key) delete colors[name];
	for (const raw of data.create ?? []) {
		const tag = String(raw || "").trim().slice(0, 32);
		if (!tag) continue;
		if (Object.keys(colors).some((k) => k.toLowerCase() === tag.toLowerCase())) continue;
		if (Object.keys(colors).length >= 80) break;
		colors[tag] = tagColorFromName(tag);
	}
	doc.settings.tagColors = colors;
	return emit(doc, user, data.tabId);
}));
export const saveCustomIcon = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	name: z.string().min(1).max(80),
	dataUrl: z.string().min(20).max(4e5).regex(/^data:image\//)
})).handler(async ({ data, request }: any) => mutate((doc) => {
	requireEdit(doc, tok(data, request));
	if ((doc.customIcons || []).length >= MAX_CUSTOM_ICONS) throw new Error("errors.tooManyIcons");
	doc.customIcons.push({
		id: crypto.randomUUID(),
		name: data.name,
		dataUrl: data.dataUrl
	});
	return (doc.customIcons || []).map((ic) => ({
		...ic,
		dataUrl: toClientAsset(ic.dataUrl)
	}));
}));

function unwrapBackup(raw: any) {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
	if (raw.settings && (Array.isArray(raw.spaces) || Array.isArray(raw.tabs))) return raw;
	if (raw.backup && typeof raw.backup === "object") return raw.backup;
	return raw;
}
export const exportPortal = createServerFn({ method: "POST" }).validator(z.object({ token: tokenField })).handler(async ({ data, request }: any) => withLock(async () => {
	const { assetToDataUrl } = await import("./assets");
	const doc = await readDocUnlocked();
	requireAdmin(doc, tok(data, request));
	const customIcons = [];
	for (const ic of doc.customIcons || []) customIcons.push({
		...ic,
		dataUrl: await assetToDataUrl(ic.dataUrl)
	});
	return {
		version: 1,
		exportedAt: new Date().toISOString(),
		...toDisk({
			...doc,
			settings: {
				...doc.settings,
				logo: await assetToDataUrl(doc.settings.logo),
				favicon: await assetToDataUrl(doc.settings.favicon)
			},
			customIcons
		})
	};
}));
export const exportAudit = createServerFn({ method: "POST" }).validator(z.object({ token: tokenField })).handler(async ({ data, request }: any) => withLock(async () => {
	const doc = await readDocUnlocked();
	const user = requireUser(doc, tok(data, request));
	if (!user.canAudit && user.role !== "admin") throw new Error("errors.insufficient");
	const before = (doc.history || []).length;
	pruneHistory(doc);
	if ((doc.history || []).length !== before) await writeDocUnlocked(doc);
	const visible = (doc.history || []).filter((ev) => historyVisible(doc, user, ev));
	return {
		exportedAt: new Date().toISOString(),
		rows: publicAudit(visible, 0)
	};
}));
export const importPortal = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	payload: z.unknown()
})).handler(async ({ data, request }: any) => mutate((doc) => {
	const actor = requireAdmin(doc, tok(data, request));
	const parsed = asStore(unwrapBackup(data.payload));
	if (!parsed || !parsed.tabs.length) throw new Error("errors.badBackup");
	doc.settings = parsed.settings;
	doc.customIcons = parsed.customIcons;
	doc.lastTabId = parsed.lastTabId;
	doc.clickDays = parsed.clickDays;
	doc.users = parsed.users;
	doc.groups = parsed.groups || [];
	doc.roles = parsed.roles || [];
	doc.tabs = parsed.tabs;
	ensureRoles(doc);
	ensureUsers(doc);
	const nextUser = doc.users.find((u) => u.id === actor.id) || doc.users.find((u) => u.role === "admin") || actor;
	doc.history = asHistory(parsed.history);
	appendHistory(doc, nextUser, {
		type: "portal.import",
		label: tt(doc, "audit.item.import")
	});
	return emit(doc, nextUser);
}));
async function resolveProbeByIds(token: string, ids: string[]) {
	const doc = await readDoc();
	let user = null;
	if (token) try {
		user = requireUser(doc, token);
	} catch {
		user = null;
	}
	const out = [];
	const seen = /* @__PURE__ */ new Set();
	for (const raw of ids) {
		const id = String(raw || "");
		if (!id || seen.has(id) || out.length >= 8) continue;
		seen.add(id);
		let found;
		try {
			found = appOf(doc, id);
		} catch {
			continue;
		}
		if (!tabCanSee(found.tab, user, doc)) continue;
		const app = found.app;
		if (app.kind !== "app" || app.check === "off") continue;
		if (app.check === "http") {
			const url = safeAppHref(app.url);
			if (url) out.push({
				id: app.id,
				mode: "http",
				url
			});
		} else if (app.check === "icmp" && app.checkHost) out.push({
			id: app.id,
			mode: "icmp",
			host: app.checkHost
		});
	}
	return out;
}
async function requireEditorSession(token: string) {
	const doc = await readDoc();
	const user = requireUser(doc, token);
	if (!user._canEdit && !isOwnerUser(user)) throw new Error("errors.insufficient");
	return user;
}

export const probeTargets = createServerFn({ method: "POST" }).validator(z.object({
	token: z.string().optional(),
	ids: z.array(z.string().min(1).max(80)).min(1).max(8)
})).handler(async (ctx) => {
	const { probeAllowed, probeOne } = await import("./probe-runtime");
	if (!probeAllowed((ctx as any).request)) return [];
	const doc = await readDoc();
	const token = tok(ctx.data, (ctx as any).request);
	if (doc.settings.probeAuthOnly) {
		try {
			requireUser(doc, token);
		} catch {
			return [];
		}
	}
	const targets = await resolveProbeByIds(token, ctx.data.ids);
	return Promise.all(targets.map((target) => probeOne(target as import("./probe-runtime").ProbeTarget, Boolean(doc.settings.probeTlsVerify))));
});

export const probePreview = createServerFn({ method: "POST" }).validator(z.object({
	token: z.string().min(1),
	mode: z.enum(["http", "icmp"]),
	url: z.string().max(2000).optional(),
	host: z.string().max(253).optional()
})).handler(async (ctx) => {
	const { probeAllowed, probeIcmp, probeHttp } = await import("./probe-runtime");
	await requireEditorSession(tok(ctx.data, (ctx as any).request));
	if (!probeAllowed((ctx as any).request)) throw new Error("errors.tooManyProbes");
	const doc = await readDoc();
	const tlsVerify = Boolean(doc.settings.probeTlsVerify);
	if (ctx.data.mode === "icmp") return probeIcmp("preview", ctx.data.host || "");
	const url = safeAppHref(ctx.data.url);
	if (!url) throw new Error("errors.httpRequired");
	return probeHttp("preview", url, tlsVerify);
});

export const grabSiteFavicon = createServerFn({ method: "POST" }).validator(z.object({
	token: z.string().min(1),
	url: z.string().max(2000)
})).handler(async (ctx) => {
	await requireEditorSession(tok(ctx.data, (ctx as any).request));
	const href = safeAppHref(ctx.data.url);
	if (!href) throw new Error("errors.httpRequired");
	const { fetchSiteFavicon } = await import("./favicon-runtime");
	return fetchSiteFavicon(href);
});
