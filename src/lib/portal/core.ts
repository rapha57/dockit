import { asDocRev, assertWritableRev, bumpDocRev, takeExpectedRev } from "../doc-rev";
import { z } from "zod";
import { randomBytes, scryptSync } from "node:crypto";
import { newId } from "../id";
import { safeAppHref, safeEmbedHref } from "../safe-href";
import { MAX_CUSTOM_ICONS, toClientAsset } from "../assets-url";

import { sanitizeThemeCss } from "../theme-css";
import { isWeakPassword, passwordPolicyError } from "../security";
import { DEFAULT_OIDC_SCOPE, normalizeScope } from "../oidc-scope";
import { filterGroupNames, GROUP_FILTER_MAX } from "../oidc-groups";
import { cleanProxyHost, cleanProxyPort, setOutboundProxy } from "../outbound-proxy";
import { assertProductionSecrets, clientIp, envLdapBindPassword, envOidcClientSecret, isDevRuntime, trustProxy } from "../security-runtime";
import { parseSessCookie } from "../session-cookie";
import { asHistory, appendHistory, snapshotSpace, snapshotCat, snapshotToDisk } from "../history";
import { t, withLocale, asNumberFormat, asTimeFormat, asTimeZone, DATE_FORMATS } from "../i18n";

export type { CurationCheck } from "../curation-runtime";
export type { CurationJobView } from "../curation-runtime";
import { asDirectories, asLoginOrder, directoryReady, rdnValue, syncLegacyLdap } from "../ldap-runtime";
import { remapTagHex } from "../tag-colors";
import { absorbResourceAcl, asGrants, can, defaultRoles, grantsFromLegacyRole, groupsOf, isOwnerUser, isSystemRole, roleIdsOf, roleSummary, type AclDoc, type GrantInput, type Group, type Role, type Space, type User } from "../acl";
import type { HistoryEvent } from "../history";
import type { Directory } from "../ldap-runtime";

export function tt(doc: Doc | null | undefined, key: string, vars?: Record<string, unknown>) {
	return withLocale(doc?.settings?.locale, () => t(key, vars));
}

export type UserRole = "owner" | "admin" | "editeur" | "lecteur";
export type SpacePerm = "view" | "edit";

export type PortalUser = {
  id: string;
  username: string;
  passHash: string;
  role: UserRole;
  canCreateSpaces?: boolean;
};

export type SessionInfo = {
  username?: string;
  role?: string;
  roleId?: string;
  roleIds: string[];
  isOwner: boolean;
  canEdit: boolean;
  canManageUsers: boolean;
  canManageGroups: boolean;
  canManageRoles: boolean;
  canManageSettings: boolean;
  canCreateSpaces: boolean;
  canAudit: boolean;
  canRestore: boolean;
  canCuration: boolean;
  canPurge: boolean;
  canMove: boolean;
  spacePerms: Record<string, SpacePerm>;
  spaceMoves: Record<string, boolean>;
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

export type PortalCard = {
  id: string;
  categoryId: string;
  kind: ItemKind;
  title: string;
  description: string;
  url?: string;
  icon: string;
  openIn: "_blank" | "_self";
  tags: string[];
  colSpan: 1 | 2 | 3;
  rowSpan: 1 | 2 | 3;
  sortOrder: number;
  check: CheckMode;
  checkHost: string;
  clicks: number;
  linkMenu?: boolean;
  embedBorder?: boolean;
  embedBg?: string;
  links: { title: string; url: string; openIn?: "_blank" | "_self" }[];
};

/** Main link of a card: apps read their first link, embeds their iframe src. */
export function cardUrl(app: {
  kind?: ItemKind;
  url?: string;
  links?: { url: string }[];
}): string {
  if ((app.kind || "app") === "embed") return String(app.url || "");
  return String(app.links?.[0]?.url || app.url || "");
}

export type PortalCategory = {
  id: string;
  name: string;
  icon: string;
  sortOrder: number;
  restricted: boolean;
  viewers: string[];
  editors: string[];
  cards: PortalCard[];
};

export type PortalSpace = {
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
  numberFormat?: import("../i18n").NumberFormat;
  timezone: string;
  favicon: string;
  favsHideLabel: boolean;
  favNotes: boolean;
  favEmbeds: boolean;
  onlineIcons: boolean;
  navRichIcons: boolean;
  headerGlass: boolean;
  probeBlink: boolean;
  annexFade: boolean;
  catCounts: boolean;
  pruneOrphanTags: boolean;
  tagsAlpha: boolean;
  cardResize: boolean;
  cardIconBg: boolean;
  cardContextMenu: boolean;
  cardDragCollapse: boolean;
  ctxHideUrl: boolean;
  infoStats: boolean;
  infoLegend: boolean;
  probeTlsVerify: boolean;
  curationWebhook?: string;
  probeAuthOnly: boolean;
  requireLogin: boolean;
  sessionHttpOnly: boolean;
  devAdminNoPassword: boolean;
  proxyAuthEnabled: boolean;
  proxyAuthHeader: string;
  outboundProxyEnabled: boolean;
  outboundProxyHost: string;
  outboundProxyPort: number;
  outboundProxyUsername: string;
  outboundProxyPassword: string;
  oidcEnabled: boolean;
  oidcIssuer: string;
  oidcClientId: string;
  oidcClientSecret: string;
  oidcScope: string;
  oidcGroupFilter: string;
  oidcLabel: string;
  oidcAutoCreate: boolean;
  oidcAutoRedirect: boolean;
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
  /** Present on client payloads only (see clientSettings). */
  oidcHasSecret?: boolean;
  /** Present on client payloads only (see clientSettings). */
  oidcSecretFromEnv?: boolean;
  /** Present on client payloads only (see clientSettings). */
  ldapHasBindPassword?: boolean;
  /** Present on client payloads only (see clientSettings). */
  ldapBindFromEnv?: boolean;
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

export type DocSpace = PortalSpace & { name: string; icon: string; categories: PortalCategory[] };
export type StoredUser = User & { passHash?: string };
export type Doc = Omit<AclDoc, "spaces" | "users" | "groups" | "roles" | "history"> & {
  settings: PortalSettings;
  customIcons: CustomIcon[];
  lastSpaceId?: string;
  clickDays: Record<string, number>;
  users: StoredUser[];
  groups: Group[];
  roles: Role[];
  history: HistoryEvent[];
  spaces: DocSpace[];
  rev: number;
};

const SESSION_MS = 432e5;
type SessionRow = { userId: string; exp: number };
export const sessions = /* @__PURE__ */ new Map<string, SessionRow>();
type OidcPendingRow = { redirectUri: string; verifier: string; nonce: string; exp: number };
export const oidcPending = /* @__PURE__ */ new Map<string, OidcPendingRow>();
export const OIDC_PENDING_MS = 5 * 60 * 1000;
export function envUser() {
	return (process.env.PORTAL_EDIT_USER || "admin").trim().toLowerCase() || "admin";
}
export function envPassword() {
	return (process.env.PORTAL_EDIT_PASSWORD || "admin").trim() || "admin";
}
function hashPasswordSync(password: string) {
	const salt = randomBytes(16).toString("hex");
	return `${salt}:${scryptSync(password, salt, 32).toString("hex")}`;
}
export async function hashPassword(password: string) {
	const { randomBytes: bytes, scrypt } = await import("node:crypto");
	const { promisify } = await import("node:util");
	const salt = bytes(16).toString("hex");
	const buf = (await promisify(scrypt)(password, salt, 32)) as Buffer;
	return `${salt}:${Buffer.from(buf).toString("hex")}`;
}
export async function verifyPassword(password: string, stored: string | undefined) {
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
export function clientKey(username: unknown, request: any) {
	return `${clientIp(request)}:${String(username || "").toLowerCase()}`;
}
export function requireStrongPassword(raw: string) {
	const err = passwordPolicyError(raw);
	if (err) throw new Error(err);
}
let defaultAdminCache = {
	hash: "",
	value: false
};
async function isDefaultAdminPassword(doc: Doc) {
	const admin = ensureUsers(doc).find((u) => u.id === "admin" || isOwnerUser(u));
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
export async function sessionFor(user: StoredUser, doc: Doc) {
	const u = hydrateUser(user, doc);
	const info = sessionInfo(u as StoredUser, doc);
	if (user.id === "admin") info.mustChangePassword = await isDefaultAdminPassword(doc);
	return info;
}
export function loginBlocked(key: string) {
	const row = loginFails.get(key);
	if (!row) return false;
	if (Date.now() > row.until) {
		loginFails.delete(key);
		return false;
	}
	return row.n >= LOGIN_MAX;
}
export function loginFail(key: string) {
	const now = Date.now();
	const row = loginFails.get(key) || {
		n: 0,
		until: now + LOGIN_WINDOW_MS
	};
	row.n += 1;
	row.until = now + LOGIN_WINDOW_MS;
	loginFails.set(key, row);
}
export function loginOk(key: string) {
	loginFails.delete(key);
}
export function issueToken(userId: string) {
	const token = randomBytes(24).toString("hex");
	sessions.set(token, {
		userId,
		exp: Date.now() + SESSION_MS
	});
	return token;
}
export const tokenField = z.string().min(1);
export function tok(data: any, request: any) {
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
export function asCheck(v: unknown): CheckMode {
	return v === "http" || v === "icmp" ? v : "off";
}
export function asCheckHost(v: unknown) {
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
export function sortCardsAlpha(cards: PortalCard[] | null | undefined, locale: unknown, dir: unknown) {
	const tag = locale === "fr" ? "fr" : "en";
	const signed = dir === "za" ? -1 : 1;
	return [...(cards || [])].sort((a, b) => {
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
export function cardsAlphaDir(cards: PortalCard[] | null | undefined, locale: unknown) {
	if (!cards || cards.length < 2) return null;
	const ids = cards.map((a) => a.id).join("\n");
	if (sortCardsAlpha(cards, locale, "az").map((a) => a.id).join("\n") === ids) return "az";
	if (sortCardsAlpha(cards, locale, "za").map((a) => a.id).join("\n") === ids) return "za";
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
function asEmbedBg(raw: unknown): string | undefined {
	const v = String(raw || "").trim().toLowerCase();
	if (!v) return void 0;
	if (v === "default") return "default";
	if (/^#[0-9a-f]{6}$/.test(v)) return v;
	return void 0;
}
function asExtraLinks(raw: unknown): { title: string; url: string; openIn?: "_blank" | "_self" }[] {
	if (!Array.isArray(raw)) return [];
	const out: { title: string; url: string; openIn?: "_blank" | "_self" }[] = [];
	const seen = /* @__PURE__ */ new Set<string>();
	for (const row of raw) {
		const title = String((row as any)?.title ?? "").trim().slice(0, 40);
		const url = safeAppHref((row as any)?.url);
		if (!title || !url) continue;
		const key = url.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		const openIn = (row as any)?.openIn === "_self" ? "_self" as const : undefined;
		out.push({
			title,
			url,
			...(openIn ? { openIn } : {})
		});
		if (out.length >= 20) break;
	}
	return out;
}
export function normalizeItem(a: any, categoryId: string, sortOrder: number): PortalCard {
	const kind = asKind(a.kind);
	let linksFull: { title: string; url: string; openIn?: "_blank" | "_self" }[] = [];
	if (kind === "app") {
		const extras = asExtraLinks(a.links);
		const main = safeAppHref(a.url);
		if (main && extras[0]?.url !== main) extras.unshift({ title: "", url: main });
		linksFull = extras.slice(0, 20);
	}
	return {
		id: a.id || newId(),
		categoryId,
		kind,
		title: String(a.title || (kind === "note" || kind === "embed" ? "" : "Untitled")).slice(0, 80),
		description: String(a.description || "").slice(0, 8e3),
		url: kind === "app" ? undefined : kind === "embed" ? (safeEmbedHref(a.url) || "") : (safeAppHref(a.url) || ""),
		icon: String(a.icon || (kind === "note" ? "FileText" : kind === "embed" ? "AppWindow" : "Link")),
		openIn: a.openIn === "_self" ? "_self" : "_blank",
		tags: kind === "app" ? asTags(a.tags) : [],
		colSpan: asSpan(a.colSpan),
		rowSpan: asSpan(a.rowSpan),
		sortOrder,
		check: kind === "app" ? asCheck(a.check) : "off",
		checkHost: kind === "app" && asCheck(a.check) === "icmp" ? asCheckHost(a.checkHost) : "",
		clicks: Math.max(0, Math.floor(Number(a.clicks) || 0)),
		links: kind === "app" ? linksFull : [],
		linkMenu: kind === "app" ? Boolean(a.linkMenu) : false,
		embedBorder: kind === "embed" ? Boolean(a.embedBorder) : void 0,
		embedBg: kind === "embed" ? asEmbedBg(a.embedBg) : void 0
	};
}
export function defaultSettings(): PortalSettings {
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
		headerGlass: true,
		probeBlink: false,
		annexFade: false,
		catCounts: false,
		pruneOrphanTags: false,
		tagsAlpha: true,
		cardResize: true,
		cardIconBg: true,
		cardContextMenu: true,
		cardDragCollapse: true,
		ctxHideUrl: false,
		infoStats: true,
		infoLegend: true,
		probeTlsVerify: false,
		curationWebhook: "",
		probeAuthOnly: false,
		requireLogin: false,
		sessionHttpOnly: false,
		devAdminNoPassword: false,
		proxyAuthEnabled: false,
		proxyAuthHeader: "X-Remote-User",
		outboundProxyEnabled: false,
		outboundProxyHost: "",
		outboundProxyPort: 3128,
		outboundProxyUsername: "",
		outboundProxyPassword: "",
		oidcEnabled: false,
		oidcIssuer: "",
		oidcClientId: "",
		oidcClientSecret: "",
		oidcScope: DEFAULT_OIDC_SCOPE,
		oidcGroupFilter: "",
		oidcLabel: "SSO",
		oidcAutoCreate: false,
		oidcAutoRedirect: false,
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
		timezone: "",
		numberFormat: "auto"
	};
}
export function blankSpaces(locale?: unknown): { lastSpaceId: string; spaces: DocSpace[] } {
	const spaceId = newId();
	const catId = newId();
	const name = withLocale(locale ?? "en", () => t("seed.space"));
	const category = withLocale(locale ?? "en", () => t("seed.category"));
	return {
		lastSpaceId: spaceId,
		spaces: [{
			id: spaceId,
			name,
			icon: "Layers",
			sortOrder: 1,
			restricted: false,
			viewers: [],
			editors: [],
			hideLabel: false,
			categories: [{
				id: catId,
				name: category,
				icon: "AppWindow",
				sortOrder: 1,
				restricted: false,
				viewers: [],
				editors: [],
				cards: []
			}]
		}]
	};
}
function defaultStore(): Doc {
	const blank = blankSpaces();
	return {
		settings: defaultSettings(),
		customIcons: [],
		lastSpaceId: blank.lastSpaceId,
		clickDays: {},
		users: [],
		groups: [],
		roles: defaultRoles(),
		history: [],
		spaces: blank.spaces,
		rev: 0
	};
}
export function assignTagColors(doc: Doc, tags: unknown, extras: unknown) {
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
export function eachItem(doc: Doc, fn: (app: PortalCard) => void) {
	for (const space of doc.spaces) for (const cat of space.categories) for (const app of cat.cards) fn(app);
}
export function unwrapBackup(raw: any) {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
	if (raw.settings && Array.isArray(raw.spaces)) return raw;
	if (raw.backup && typeof raw.backup === "object") return raw.backup;
	return raw;
}
export function pruneUnusedTags(doc: Doc) {
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
export function asTagColors(raw: unknown): Record<string, string> {
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
		const id = String(row.id || newId());
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
			source: asAuthSource(row.source),
			externalId: String(row.externalId || "").slice(0, 400)
		};
	}).filter((u) => u.username);
}
export type AuthSource = "local" | "ad" | "oidc" | "proxy";
function asAuthSource(raw: unknown): AuthSource {
	if (raw === "ad" || raw === "oidc" || raw === "proxy") return raw;
	return "local";
}
export function authExternalId(source: AuthSource, ...parts: string[]): string {
	return [source, ...parts.map((p) => String(p || "").trim())].filter(Boolean).join(":").slice(0, 400);
}
export function findUserForAuth<T extends { username?: string; source?: string; externalId?: string }>(
	users: T[] | null | undefined,
	username: string,
	source: AuthSource,
	externalId?: string,
): T | undefined {
	const name = String(username || "").trim().toLowerCase();
	if (!name) return undefined;
	const list = users || [];
	if (externalId) {
		const byExt = list.find((u) => asAuthSource(u.source) === source && u.externalId === externalId);
		if (byExt) return byExt;
	}
	return list.find((u) => String(u.username || "").toLowerCase() === name && asAuthSource(u.source) === source);
}
export function asIdList(raw: unknown): string[] {
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
		const source = g?.source === "ad" || g?.source === "oidc" ? g.source : "local";
		let roleIds = roleIdsOf(g).map((r) => String(r).slice(0, 80)).filter((r) => r !== "owner");
		if (!roleIds.length && source === "local") roleIds = ["lecteur"];
		return {
			id: String(g?.id || newId()),
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
export function ensureGroups(doc: Doc) {
	if (!Array.isArray(doc.groups)) doc.groups = [];
	doc.groups = asGroups(doc.groups);
	return doc.groups;
}
function asRoles(raw: unknown): Role[] {
	if (!Array.isArray(raw)) return [];
	return raw.slice(0, 40).map((r: any) => {
		const id = String(r?.id || newId()).slice(0, 80);
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
export function ensureRoles(doc: Doc) {
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
	return doc.roles;
}
function normalizeSpaceAccess(space: any) {
	const editors = asIdList(space.editors);
	const viewers = asIdList(space.viewers);
	for (const id of editors) if (!viewers.includes(id)) viewers.push(id);
	return {
		restricted: Boolean(space.restricted),
		viewers,
		editors,
		hideLabel: Boolean(space.hideLabel)
	};
}
export function normalizeCatAccess(cat: any) {
	const editors = asIdList(cat.editors);
	const viewers = asIdList(cat.viewers);
	for (const id of editors) if (!viewers.includes(id)) viewers.push(id);
	return {
		restricted: Boolean(cat.restricted),
		viewers,
		editors
	};
}
export function spaceCanSee(space: Space | DocSpace | null | undefined, user: User | null | undefined, doc: AclDoc) {
	if (!space) return false;
	return can(user, "view", { res: "space", id: space.id }, doc);
}
function spaceCanEdit(space: Space | DocSpace | null | undefined, user: User | null | undefined, doc: AclDoc) {
	if (!space || !user) return false;
	return can(user, "edit", { res: "space", id: space.id }, doc);
}
function spaceCanMove(space: Space | DocSpace | null | undefined, user: User | null | undefined, doc: AclDoc) {
	if (!space || !user) return false;
	return can(user, "move", { res: "space", id: space.id }, doc);
}
export function catCanSee(cat: PortalCategory | null | undefined, user: User | null | undefined, doc: AclDoc) {
	if (!cat) return false;
	return can(user, "view", { res: "cat", id: cat.id }, doc);
}
export type HydratedUser = StoredUser & {
	roleId?: string;
	roleIds: string[];
	canCreateSpaces: boolean;
	canAudit: boolean;
	canRestore: boolean;
	canCuration: boolean;
	canPurge: boolean;
	canManageSettings: boolean;
	canManageUsers: boolean;
	canManageGroups: boolean;
	canManageRoles: boolean;
	groupIds: string[];
	_ids: string[];
	_canEdit: boolean;
	_canMove: boolean;
};
function hydrateUser(user: StoredUser | null | undefined, doc: Doc): HydratedUser | null | undefined {
	if (!user) return user;
	if ((user as HydratedUser)._ids) return user as HydratedUser;
	const groups = groupsOf(user, doc);
	const ids = [user.id, ...groups.map((g) => g.id)];
	const owner = isOwnerUser(user);
	const portal = { res: "portal" as const };
	const canCreateSpaces = owner || can(user, "spaces.create", portal, doc);
	const canAudit = owner || can(user, "audit", portal, doc);
	const canRestore = owner || can(user, "restore", portal, doc);
	const canCuration = owner || can(user, "curation", portal, doc);
	const canPurge = owner || can(user, "purge", portal, doc);
	const canManageSettings = owner || can(user, "settings", portal, doc);
	const canManageUsers = owner || can(user, "users.manage", portal, doc);
	const canManageGroups = owner || can(user, "groups.manage", portal, doc);
	const canManageRoles = owner || can(user, "roles.manage", portal, doc);
	const anyEdit = owner || canCreateSpaces || (doc.spaces || []).some((t) => can(user, "edit", { res: "space", id: t.id }, doc));
	const anyMove = owner || (doc.spaces || []).some((t) => can(user, "move", { res: "space", id: t.id }, doc));
	// Effective roles: the account's own roles plus those inherited from groups,
	// ordered by privilege so the top entry is the highest effective role.
	const ROLE_RANK: Record<string, number> = { owner: 4, admin: 3, editeur: 2, lecteur: 0 };
	const roleIds = Array.from(new Set([...roleIdsOf(user), ...groups.flatMap((g) => roleIdsOf(g))]))
		.sort((a, b) => (ROLE_RANK[b] ?? 1) - (ROLE_RANK[a] ?? 1));
	return {
		...user,
		role: owner ? "owner" : roleIds[0] || "lecteur",
		roleId: roleIds[0] || user.role,
		roleIds,
		canCreateSpaces,
		canAudit,
		canRestore,
		canCuration,
		canPurge,
		canManageSettings,
		canManageUsers,
		canManageGroups,
		canManageRoles,
		groupIds: groups.map((g) => g.id),
		_ids: ids,
		_canEdit: anyEdit,
		_canMove: anyMove
	};
}
export function canSetNodeAcl(user: HydratedUser | null | undefined): boolean {
	if (!user) return false;
	return isOwnerUser(user) || Boolean(user.canManageUsers || user.canManageRoles);
}
export function historyVisible(doc: Doc, user: HydratedUser | null | undefined, ev: HistoryEvent) {
	if (!user) return false;
	if (isOwnerUser(user) || user.canAudit) return true;
	if (!user.canRestore) return false;
	const type = String(ev?.type || "");
	if (type === "login") return ev.actor === user.username;
	if (/^(user|group|role|settings|theme|oidc|ldap|auth|portal)\./.test(type)) return false;
	const spaceMeta = ev?.snapshot?.space;
	if (!spaceMeta) return false;
	const live = doc.spaces.find((t) => t.id === spaceMeta.id);
	return spaceCanEdit(live || spaceMeta, user, doc);
}
export function ensureUsers(doc: Doc) {
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
	// Directory accounts carry no personal role: rights come from the group
	// mapping. Strip leftover base roles from the old provisioning.
	for (const u of doc.users) {
		if (u.id !== "admin" && u.source === "ad" && ((u.roleIds || []).length || u.role)) {
			u.roleIds = [];
			u.role = "";
		}
	}
	return doc.users;
}
function spaceAccess(space: DocSpace, user: User | null | undefined, doc: AclDoc): SpacePerm | null {
	if (!spaceCanSee(space, user, doc)) return null;
	if (spaceCanEdit(space, user, doc)) return "edit";
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
export function requireUser(doc: Doc, token: string): HydratedUser {
	ensureUsers(doc);
	ensureGroups(doc);
	ensureRoles(doc);
	const sess = readSession(token);
	const user = doc.users.find((u) => u.id === sess.userId);
	if (!user) throw new Error("errors.userNotFound");
	if (user.disabled) throw new Error("errors.disabled");
	return hydrateUser(user, doc)!;
}
export function requireEdit(doc: Doc, token: string, spaceId?: string): HydratedUser {
	const user = requireUser(doc, token);
	if (isOwnerUser(user)) return user;
	if (spaceId) {
		const space = doc.spaces.find((t) => t.id === spaceId);
		if (!space || !spaceCanEdit(space, user, doc)) throw new Error("errors.noEditSpace");
		return user;
	}
	if (user.canCreateSpaces || user._canEdit || doc.spaces.some((t) => spaceCanEdit(t, user, doc))) return user;
	throw new Error("errors.readonly");
}
export function requireAdmin(doc: Doc, token: string): HydratedUser {
	const user = requireUser(doc, token);
	if (!isOwnerUser(user) && !user.canManageSettings) throw new Error("errors.adminOnly");
	return user;
}
export function requireAccountManager(doc: Doc, token: string): HydratedUser {
	const user = requireUser(doc, token);
	if (!isOwnerUser(user) && !user.canManageUsers && !user.canManageGroups && !user.canManageRoles) throw new Error("errors.insufficient");
	return user;
}
export function requireCreateSpace(doc: Doc, token: string): HydratedUser {
	const user = requireUser(doc, token);
	if (isOwnerUser(user) || user.canCreateSpaces) return user;
	throw new Error("errors.noManageSpaces");
}
function publicUser(u: StoredUser, _doc: AclDoc) {
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
		source: asAuthSource(u.source),
		externalId: String(u.externalId || ""),
		groupIds: asIdList(u.groupIds)
	};
}
function publicGroup(g: Group, _doc: AclDoc) {
	const roleIds = roleIdsOf(g);
	return {
		kind: "group" as const,
		id: g.id,
		name: g.name,
		role: roleIds[0] || g.role || "lecteur",
		roleIds,
		grants: asGrants(g.grants),
		source: g.source === "ad" || g.source === "oidc" ? g.source : "local",
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
	const spacePerms: Record<string, SpacePerm> = {};
	const spaceMoves: Record<string, boolean> = {};
	for (const space of doc.spaces) {
		const perm = spaceAccess(space, u, doc);
		if (perm) spacePerms[space.id] = perm;
		if (spaceCanSee(space, u, doc) && spaceCanMove(space, u, doc)) spaceMoves[space.id] = true;
	}
	const owner = isOwnerUser(u);
	return {
		username: u.username,
		role: owner ? "owner" : u.role,
		roleId: u.roleId || (u.roleIds && u.roleIds[0]) || user.role,
		roleIds: u.roleIds || roleIdsOf(user),
		isOwner: owner,
		canEdit: Boolean(owner || u._canEdit),
		canMove: Boolean(owner || u._canMove),
		canManageUsers: Boolean(u.canManageUsers || owner),
		canManageGroups: Boolean(u.canManageGroups || owner),
		canManageRoles: Boolean(u.canManageRoles || owner),
		canManageSettings: Boolean(u.canManageSettings || owner),
		canCreateSpaces: Boolean(u.canCreateSpaces || owner),
		canAudit: Boolean(u.canAudit || owner),
		canRestore: Boolean(u.canRestore || owner),
		canCuration: Boolean(u.canCuration || owner),
		canPurge: Boolean(u.canPurge || owner),
		spacePerms,
		spaceMoves,
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
export function syncGroupMembers(doc: Doc, groupId: string, memberIds: unknown) {
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
export function upsertAdGroups(doc: Doc, _dir: unknown, listed: { key?: string; name?: string; dn?: string; id?: string }[] | null | undefined) {
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
			id: newId(),
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
export function inLinkedAdGroups(doc: Doc, dirId: string, memberOf: string[] | null | undefined) {
	if (!memberOf?.length) return false;
	ensureGroups(doc);
	const prefix = `${dirId}:`;
	const names = new Set(memberOf.map((dn) => rdnValue(String(dn)).toLowerCase()));
	return doc.groups.some((g) => {
		if (g.source !== "ad" || !String(g.externalId || "").startsWith(prefix)) return false;
		return names.has(rdnValue(String(g.externalId).slice(prefix.length)).toLowerCase());
	});
}
export function inLinkedOidcGroups(doc: Doc, issuer: string, names: string[] | null | undefined) {
	if (!names?.length) return false;
	ensureGroups(doc);
	const keys = new Set(names.map((name) => `oidc:${issuer.slice(0, 60)}:${name.slice(0, 200)}`));
	return doc.groups.some((g) => g.source === "oidc" && g.externalId && keys.has(g.externalId));
}
export function applyAdMembership(doc: Doc, user: StoredUser | null | undefined, dirId: string, memberOf: string[] | null) {
	if (!user || user.id === "admin") return;
	// Directory accounts carry no personal role: rights come from the mapping.
	if (user.source === "ad") {
		user.roleIds = [];
		user.role = "";
	}
	if (memberOf == null) return;
	ensureGroups(doc);
	const prefix = `${dirId}:`;
	// Compare group CNs, not full DNs: some directories (Glauth) report memberOf
	// DNs that differ from the group entry DN (ou=groups vs ou=users).
	const names = new Set((Array.isArray(memberOf) ? memberOf : []).map((dn) => rdnValue(String(dn)).toLowerCase()));
	let groupIds = asIdList(user.groupIds);
	for (const g of doc.groups) {
		if (g.source !== "ad" || !String(g.externalId || "").startsWith(prefix)) continue;
		// Mapping: membership is resolved from the directory at sign-in. The stored
		// members list mirrors it for display, but rights flow through groupIds.
		const isMember = names.has(rdnValue(String(g.externalId).slice(prefix.length)).toLowerCase());
		const members = asIdList(g.members).filter((id) => id !== user.id);
		if (isMember) members.push(user.id);
		g.members = members;
		groupIds = isMember ? Array.from(new Set([...groupIds, g.id])) : groupIds.filter((id) => id !== g.id);
	}
	user.groupIds = groupIds;
}
function upsertOidcGroups(doc: Doc, issuer: string, names: string[]) {
	ensureGroups(doc);
	for (const name of names) {
		const key = `oidc:${issuer.slice(0, 60)}:${name.slice(0, 200)}`;
		const existing = doc.groups.find((g) => g.source === "oidc" && g.externalId === key);
		if (existing) continue;
		if (doc.groups.length >= GROUP_CAP) break;
		doc.groups.push({
			id: newId(),
			name: name.slice(0, 60),
			members: [],
			role: "",
			roleIds: [],
			grants: [],
			source: "oidc",
			externalId: key
		});
	}
}
export function applyOidcGroups(doc: Doc, user: StoredUser | null | undefined, issuer: string, claimed: string[]) {
	if (!user || user.id === "admin") return;
	// Filtering here covers creation and membership in one place: a group the
	// filter now excludes also drops the user on this login, rather than keeping
	// a stale membership no admin can see the source of.
	const names = filterGroupNames(claimed, doc.settings?.oidcGroupFilter);
	upsertOidcGroups(doc, issuer, names);
	ensureGroups(doc);
	const keys = new Set(names.map((name) => `oidc:${issuer.slice(0, 60)}:${name.slice(0, 200)}`));
	for (const g of doc.groups) {
		if (g.source !== "oidc" || !g.externalId) continue;
		const members = asIdList(g.members).filter((id) => id !== user.id);
		if (keys.has(g.externalId)) members.push(user.id);
		g.members = members;
	}
	user.groupIds = doc.groups.filter((g) => asIdList(g.members).includes(user.id)).map((g) => g.id);
}
export function syncUserGroups(doc: Doc, userId: string, groupIds: unknown) {
	ensureGroups(doc);
	const user = doc.users.find((u) => u.id === userId);
	if (!user || user.id === "admin" || isOwnerUser(user)) return;
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
export function directoryPayload(doc: Doc, actor: User) {
	ensureUsers(doc);
	ensureGroups(doc);
	ensureRoles(doc);
	const ownerActor = isOwnerUser(actor);
	return {
		users: doc.users.filter((u) => ownerActor ? true : u.id === actor.id || u.id !== "admin").map((u) => publicUser(u, doc)),
		groups: doc.groups.map((g) => publicGroup(g, doc)),
		roles: doc.roles.map((r) => publicRole(r, doc)),
		spaces: manageSpaces(doc),
		directory: directoryOf(doc),
		rev: asDocRev(doc.rev)
	};
}
export function stripUserAccess(doc: Doc, userId: string) {
	for (const space of doc.spaces) {
		space.editors = (space.editors || []).filter((id) => id !== userId);
		space.viewers = (space.viewers || []).filter((id) => id !== userId);
		for (const cat of space.categories || []) {
			cat.editors = (cat.editors || []).filter((id) => id !== userId);
			cat.viewers = (cat.viewers || []).filter((id) => id !== userId);
		}
	}
}
export async function emit(doc: Doc, user: StoredUser | HydratedUser | null | undefined, spaceId?: string) {
	const out = view(doc, spaceId, user as HydratedUser | null);
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
	for (const space of doc.spaces || []) {
		if (!can(user, "view", { res: "space", id: space.id }, doc)) return false;
		for (const cat of space.categories || []) {
			if (!can(user, "view", { res: "cat", id: cat.id }, doc)) return false;
			for (const app of cat.cards || []) {
				if (!can(user, "view", { res: "card", id: app.id }, doc)) return false;
			}
		}
	}
	return true;
}
export function clickStatsFor(doc: Doc, user: User | null | undefined): ClickStats {
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
	for (const space of doc.spaces) for (const cat of space.categories) for (const app of cat.cards) if (app.kind === "app") all += app.clicks || 0;
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
export function bumpClickDay(doc: Doc) {
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
export function fromDisk(raw: unknown): Doc | null {
	return asStore(raw);
}
export function parseStoreText(text: string): Doc {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		throw new Error("errors.storeUnreadable");
	}
	const parsed = asStore(raw);
	if (!parsed) throw new Error("errors.storeUnreadable");
	return parsed;
}
function isMissingStoreFile(err: unknown): boolean {
	return Boolean(err && typeof err === "object" && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT");
}
export function asStore(raw: any): Doc | null {
	if (!raw || typeof raw !== "object") return null;
	const doc = raw;
	const spaces = Array.isArray(doc.spaces) ? doc.spaces : null;
	if (!doc.settings || !spaces) return null;
	const parsed: Doc = {
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
			headerGlass: doc.settings.headerGlass !== false,
			probeBlink: Boolean(doc.settings.probeBlink),
			annexFade: Boolean(doc.settings.annexFade),
			catCounts: Boolean(doc.settings.catCounts),
			pruneOrphanTags: Boolean(doc.settings.pruneOrphanTags),
			tagsAlpha: doc.settings.tagsAlpha !== false,
			cardResize: doc.settings.cardResize !== false,
			cardIconBg: doc.settings.cardIconBg !== false,
			cardContextMenu: doc.settings.cardContextMenu !== false,
			cardDragCollapse: doc.settings.cardDragCollapse !== false,
			ctxHideUrl: Boolean(doc.settings.ctxHideUrl),
			infoStats: doc.settings.infoStats !== false,
			infoLegend: doc.settings.infoLegend !== false,
			probeTlsVerify: Boolean(doc.settings.probeTlsVerify),
			curationWebhook: String(doc.settings.curationWebhook || "").trim().slice(0, 2000),
			probeAuthOnly: Boolean(doc.settings.probeAuthOnly),
			requireLogin: Boolean(doc.settings.requireLogin),
			sessionHttpOnly: Boolean(doc.settings.sessionHttpOnly),
			devAdminNoPassword: Boolean(doc.settings.devAdminNoPassword),
			oidcEnabled: Boolean(doc.settings.oidcEnabled),
			oidcIssuer: String(doc.settings.oidcIssuer || "").trim().slice(0, 300),
			oidcClientId: String(doc.settings.oidcClientId || "").trim().slice(0, 120),
			oidcClientSecret: String(doc.settings.oidcClientSecret || "").slice(0, 200),
			oidcScope: normalizeScope(doc.settings.oidcScope),
			oidcGroupFilter: String(doc.settings.oidcGroupFilter || "").trim().slice(0, GROUP_FILTER_MAX),
			oidcLabel: String(doc.settings.oidcLabel || "SSO").trim().slice(0, 40) || "SSO",
			oidcAutoCreate: Boolean(doc.settings.oidcAutoCreate),
			oidcAutoRedirect: Boolean(doc.settings.oidcAutoRedirect),
			proxyAuthEnabled: Boolean(doc.settings.proxyAuthEnabled),
			proxyAuthHeader: /^[A-Za-z0-9-]+$/.test(String(doc.settings.proxyAuthHeader || "").trim())
				? String(doc.settings.proxyAuthHeader).trim()
				: "X-Remote-User",
			outboundProxyEnabled: Boolean(doc.settings.outboundProxyEnabled),
			outboundProxyHost: cleanProxyHost(doc.settings.outboundProxyHost),
			outboundProxyPort: cleanProxyPort(doc.settings.outboundProxyPort),
			outboundProxyUsername: String(doc.settings.outboundProxyUsername || "").trim().slice(0, 120),
			outboundProxyPassword: String(doc.settings.outboundProxyPassword || "").slice(0, 200),
			...syncLegacyLdap(asDirectories(doc.settings)),
			ldapDirectories: asDirectories(doc.settings),
			loginOrder: asLoginOrder(doc.settings.loginOrder, asDirectories(doc.settings)),
			locale: doc.settings.locale === "fr" ? "fr" : "en",
			dateFormat: DATE_FORMATS.includes(doc.settings.dateFormat) ? doc.settings.dateFormat : "ymd",
			timeFormat: asTimeFormat(doc.settings.timeFormat),
			timezone: asTimeZone(doc.settings.timezone),
			numberFormat: asNumberFormat(doc.settings.numberFormat)
		},
		customIcons: (Array.isArray(doc.customIcons) ? doc.customIcons : []).slice(0, MAX_CUSTOM_ICONS),
		lastSpaceId: typeof doc.lastSpaceId === "string" ? doc.lastSpaceId : void 0,
		clickDays: asClickDays(doc.clickDays),
		users: asUsers(doc.users),
		groups: asGroups(doc.groups),
		roles: asRoles(doc.roles),
		history: asHistory(doc.history),
		rev: asDocRev(doc.rev),
		spaces: spaces.map((t: any, i: number) => ({
			id: t.id || newId(),
			name: t.name,
			icon: t.icon || "Layers",
			sortOrder: Number(t.sortOrder ?? i + 1),
			...normalizeSpaceAccess(t),
			categories: (t.categories ?? []).map((c: any, j: number) => ({
				...c,
				sortOrder: Number(c.sortOrder ?? j + 1),
				...normalizeCatAccess(c),
				cards: (Array.isArray(c.cards) ? c.cards : []).map((a: any, k: number) => normalizeItem(a, c.id, Number(a.sortOrder ?? k + 1)))
			}))
		}))
	};
	absorbResourceAcl(parsed);
	setOutboundProxy({
		enabled: Boolean(parsed.settings.outboundProxyEnabled),
		host: parsed.settings.outboundProxyHost,
		port: parsed.settings.outboundProxyPort,
		username: parsed.settings.outboundProxyUsername,
		password: parsed.settings.outboundProxyPassword,
	});
	return parsed;
}
function historyToDisk(row: any): any {
	if (!row || typeof row !== "object") return row;
	const restored = row.restored && typeof row.restored === "object" ? row.restored : {};
	return {
		...row,
		restored: {
			space: Boolean(restored.space),
			categories: Array.isArray(restored.categories) ? restored.categories : [],
			cards: Array.isArray(restored.cards) ? restored.cards : []
		},
		snapshot: snapshotToDisk(row.snapshot)
	};
}
function persistableSettings(s: PortalSettings): PortalSettings {
	const dirs = asDirectories(s).map((d) => ({
		...d,
		bindPassword: envLdapBindPassword(d.id) ? "" : String(d.bindPassword || "")
	}));
	const legacy = syncLegacyLdap(dirs);
	return {
		...s,
		...legacy,
		oidcClientSecret: envOidcClientSecret() ? "" : String(s.oidcClientSecret || ""),
		ldapDirectories: dirs
	};
}
function applyEnvSecrets(doc: Doc) {
	const oidc = envOidcClientSecret();
	if (oidc) doc.settings.oidcClientSecret = oidc;
	const dirs = asDirectories(doc.settings);
	let touch = Boolean(oidc);
	for (const d of dirs) {
		const password = envLdapBindPassword(d.id);
		if (!password) continue;
		d.bindPassword = password;
		touch = true;
	}
	if (!touch) return;
	doc.settings.ldapDirectories = dirs;
	Object.assign(doc.settings, syncLegacyLdap(dirs));
}
export function toDisk(doc: Doc) {
	const { spaces, lastSpaceId, history, settings, ...rest } = doc;
	return {
		...rest,
		settings: persistableSettings(settings),
		lastSpaceId: lastSpaceId,
		spaces: (spaces || []).map((t) => ({
			...t,
			categories: (t.categories || []).map((c) => {
				const { cards, ...cat } = c;
				return {
					...cat,
					cards: cards || []
				};
			})
		})),
		history: (history || []).map(historyToDisk)
	};
}
let liveDoc: Doc | null = null;
export function setLiveDoc(doc: Doc | null) {
	liveDoc = doc;
}
let clickFlushTimer: ReturnType<typeof setTimeout> | null = null;
const CLICK_FLUSH_MS = 4000;
async function persistDocMedia(doc: Doc) {
	const { persistMediaValue } = await import("../assets");
	doc.settings.logo = await persistMediaValue("logo", doc.settings.logo);
	doc.settings.favicon = await persistMediaValue("favicon", doc.settings.favicon);
	const icons = Array.isArray(doc.customIcons) ? doc.customIcons : [];
	const next: CustomIcon[] = [];
	for (const ic of icons.slice(0, MAX_CUSTOM_ICONS)) {
		const id = String(ic.id || newId());
		next.push({
			id,
			name: String(ic.name || "").slice(0, 80),
			dataUrl: await persistMediaValue(`icon-${id}`, ic.dataUrl)
		});
	}
	doc.customIcons = next;
}
export async function readDocUnlocked(): Promise<Doc> {
	assertProductionSecrets();
	if (liveDoc) return liveDoc;
	const { readFile } = await import("node:fs/promises");
	const { join } = await import("node:path");
	const path = dataPath(join);
	try {
		const text = await readFile(path, "utf8");
		const parsed = parseStoreText(text);
		ensureRoles(parsed);
		ensureGroups(parsed);
		applyEnvSecrets(parsed);
		liveDoc = parsed;
		void import("../curation-schedule").then((m) => m.ensureCurationSchedule()).catch(() => void 0);
		return parsed;
	} catch (err) {
		if (!isMissingStoreFile(err)) throw err;
	}
	const seeded = defaultStore();
	await writeDocUnlocked(seeded);
	void import("../curation-schedule").then((m) => m.ensureCurationSchedule()).catch(() => void 0);
	return seeded;
}
async function persistDoc(doc: Doc) {
	await persistDocMedia(doc);
	const disk = toDisk(doc);
	applyEnvSecrets(doc);
	liveDoc = doc;
	const { mkdir, rename, writeFile, unlink } = await import("node:fs/promises");
	const { dirname: dirn, join } = await import("node:path");
	const path = dataPath(join);
	await mkdir(dirn(path), { recursive: true });
	const tmp = `${path}.${process.pid}.${newId()}.tmp`;
	try {
		await writeFile(tmp, `${JSON.stringify(disk, null, 2)}\n`, "utf8");
		await rename(tmp, path);
	} catch (err) {
		await unlink(tmp).catch(() => void 0);
		throw err;
	}
}
export async function writeDocUnlocked(doc: Doc) {
	if (clickFlushTimer) {
		clearTimeout(clickFlushTimer);
		clickFlushTimer = null;
	}
	await persistDoc(doc);
}
export function scheduleClickFlush() {
	if (clickFlushTimer) return;
	clickFlushTimer = setTimeout(() => {
		clickFlushTimer = null;
		withLock(async () => {
			if (liveDoc) await persistDoc(liveDoc);
		});
	}, CLICK_FLUSH_MS);
}
let ioChain = Promise.resolve();
export function withLock<T>(fn: () => T | Promise<T>): Promise<T> {
	const run = ioChain.then(fn, fn);
	ioChain = run.then(() => void 0, () => void 0);
	return run;
}
export async function readDoc() {
	return withLock(readDocUnlocked);
}
export function mutate<T>(
	data: unknown,
	request: { headers?: { get?: (k: string) => string | null } } | null | undefined,
	fn: (doc: Doc) => T | Promise<T>,
): Promise<T> {
	return withLock(async () => {
		const doc = await readDocUnlocked();
		const payload = data && typeof data === "object" ? (data as { token?: unknown; rev?: unknown }) : undefined;
		const bump = assertWritableRev(doc, takeExpectedRev(payload, request));
		const result = await fn(doc);
		if (bump) bumpDocRev(doc);
		await writeDocUnlocked(doc);
		return result;
	});
}
export async function loadPortal(spaceId: string | undefined, token: string | null | undefined) {
	const doc = await readDoc();
	let user: HydratedUser | null = null;
	if (token) try {
		user = requireUser(doc, token);
	} catch {
		user = null;
	}
	const out = view(doc, spaceId, user);
	if (out.session && user?.id === "admin") out.session.mustChangePassword = await isDefaultAdminPassword(doc);
	return out;
}
function publicSpaces(doc: Doc, user: HydratedUser | null) {
	return [...doc.spaces].sort((a, b) => a.sortOrder - b.sortOrder).filter((t) => spaceCanSee(t, user, doc)).map((t) => ({
		id: t.id,
		name: t.name,
		icon: t.icon,
		sortOrder: t.sortOrder,
		restricted: Boolean(t.restricted),
		viewers: [] as string[],
		editors: [] as string[],
		hideLabel: Boolean(t.hideLabel)
	}));
}
function manageSpaces(doc: Doc) {
	return [...doc.spaces].sort((a, b) => a.sortOrder - b.sortOrder).map((t) => ({
		id: t.id,
		name: t.name,
		icon: t.icon,
		categories: (t.categories || []).map((c) => ({
			id: c.id,
			name: c.name,
			restricted: Boolean(c.restricted),
			cards: (c.cards || []).map((a) => ({
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
		oidcAutoRedirect: Boolean(s.oidcAutoRedirect),
		requireLogin: Boolean(s.requireLogin),
		proxyAuthEnabled: Boolean(s.proxyAuthEnabled),
		outboundProxyEnabled: Boolean(s.outboundProxyEnabled),
		outboundProxyHost: String(s.outboundProxyHost || ""),
		outboundProxyPort: cleanProxyPort(s.outboundProxyPort),
		outboundProxyUsername: String(s.outboundProxyUsername || ""),
		outboundProxyHasPassword: Boolean(s.outboundProxyPassword),
		oidcHasSecret: Boolean(envOidcClientSecret() || s.oidcClientSecret),
		oidcSecretFromEnv: Boolean(envOidcClientSecret()),
		ldapEnabled: realms.length > 0,
		ldapDomain: realms[0]?.label || "",
		ldapHasBindPassword: dirs.some((d) => Boolean(envLdapBindPassword(d.id) || d.bindPassword)),
		ldapBindFromEnv: dirs.some((d) => Boolean(envLdapBindPassword(d.id))) || Boolean(envLdapBindPassword()),
		ldapDirectories: dirs.map((d) => {
			const fromEnv = Boolean(envLdapBindPassword(d.id));
			const row: any = { ...d, hasBindPassword: fromEnv || Boolean(d.bindPassword), bindFromEnv: fromEnv };
			delete row.bindPassword;
			return row;
		}),
		ldapRealms: realms,
		loginOrder: asLoginOrder(s.loginOrder, dirs),
		devAdminNoPassword: isDevRuntime() && Boolean(s.devAdminNoPassword),
		curationWebhook: user && (isOwnerUser(user) || user.canCuration) ? String(s.curationWebhook || "") : "",
	};
	delete out.oidcClientSecret;
	delete out.ldapBindPassword;
	delete out.outboundProxyPassword;
	if (!isOwnerUser(user) && !user?.canManageSettings) {
		delete out.oidcIssuer;
		delete out.oidcClientId;
		delete out.oidcScope;
		delete out.oidcGroupFilter;
		delete out.oidcAutoCreate;
		delete out.proxyAuthHeader;
		delete out.outboundProxyHost;
		delete out.outboundProxyPort;
		delete out.outboundProxyUsername;
		delete out.outboundProxyHasPassword;
		delete out.outboundProxyEnabled;
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
		out.oidcScope = normalizeScope(s.oidcScope);
		out.oidcGroupFilter = String(s.oidcGroupFilter || "");
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
			const fromEnv = Boolean(envLdapBindPassword(d.id));
			const row: any = { ...d, hasBindPassword: fromEnv || Boolean(d.bindPassword), bindFromEnv: fromEnv };
			delete row.bindPassword;
			return row;
		});
	}
	return out;
}
export function view(doc: Doc, spaceId: string | undefined, user: HydratedUser | null) {
	const session = user ? sessionInfo(user, doc) : null;
	if (doc.settings.requireLogin && !user) {
		return {
			settings: clientSettings(doc, user),
			customIcons: [],
			spaces: [],
			activeSpaceId: "",
			categories: [],
			catalog: [],
			clickStats: {
				all: 0,
				today: 0,
				week: 0,
				month: 0,
				year: 0,
				spanDays: 0,
				fullCatalog: true,
			},
			session: null,
			directory: [],
			runtime: {
				isDev: isDevRuntime(),
				publicOrigin: String(process.env.PORTAL_PUBLIC_ORIGIN || "").trim(),
				trustProxy: trustProxy(),
			},
			rev: asDocRev(doc.rev),
		};
	}
	const spaces = publicSpaces(doc, user);
	const activeSpaceId = spaceId && spaces.some((s) => s.id === spaceId) && spaceId || doc.lastSpaceId && spaces.some((s) => s.id === doc.lastSpaceId) && doc.lastSpaceId || spaces[0]?.id || "";
	const stored = doc.spaces.find((t) => t.id === activeSpaceId);
	const sortCats = (cats: PortalCategory[]) => [...cats].filter((c) => catCanSee(c, user, doc)).sort((a, b) => a.sortOrder - b.sortOrder).map((c) => ({
		...c,
		cards: [...c.cards].filter((a) => can(user, "view", { res: "card", id: a.id }, doc)).sort((a, b) => a.sortOrder - b.sortOrder)
	}));
	const stripAcl = (cats: PortalCategory[]) => sortCats(cats).map((c) => ({ ...c, viewers: [] as string[], editors: [] as string[] }));
	const visibleIds = new Set(spaces.map((s) => s.id));
	const catalog = [...doc.spaces].sort((a, b) => a.sortOrder - b.sortOrder).filter((t) => visibleIds.has(t.id)).map((t) => ({
		id: t.id,
		name: t.name,
		icon: t.icon,
		sortOrder: t.sortOrder,
		restricted: Boolean(t.restricted),
		viewers: [] as string[],
		editors: [] as string[],
		hideLabel: Boolean(t.hideLabel),
		categories: stripAcl(t.categories ?? [])
	}));
	return {
		settings: clientSettings(doc, user),
		customIcons: (doc.customIcons || []).map((ic) => ({
			...ic,
			dataUrl: toClientAsset(ic.dataUrl)
		})),
		spaces: spaces,
		activeSpaceId,
		categories: sortCats(stored?.categories ?? []),
		catalog,
		clickStats: clickStatsFor(doc, user),
		session,
		directory: session?.canManageUsers ? directoryOf(doc) : [],
		runtime: {
			isDev: isDevRuntime(),
			publicOrigin: String(process.env.PORTAL_PUBLIC_ORIGIN || "").trim(),
			trustProxy: trustProxy()
		},
		rev: asDocRev(doc.rev)
	};
}
export function spaceOfCategory(doc: Doc, categoryId: string): DocSpace {
	const space = doc.spaces.find((t) => t.categories!.some((c) => c.id === categoryId));
	if (!space) throw new Error("errors.categoryNotFound");
	return space;
}
export function categoryOf(doc: Doc, categoryId: string): { space: DocSpace; cat: PortalCategory } {
	for (const space of doc.spaces) {
		const cat = space.categories!.find((c) => c.id === categoryId);
		if (cat) return {
			space,
			cat
		};
	}
	throw new Error("errors.categoryNotFound");
}
export function cardOf(doc: Doc, appId: string): { space: DocSpace; cat: PortalCategory; app: PortalCard } {
	for (const space of doc.spaces) for (const cat of space.categories!) {
		const app = cat.cards.find((a) => a.id === appId);
		if (app) return {
			space,
			cat,
			app
		};
	}
	throw new Error("errors.appNotFound");
}
function liveCardId(doc: Doc, id: string) {
	for (const space of doc.spaces) for (const cat of space.categories!) if (cat.cards.some((a) => a.id === id)) return true;
	return false;
}
type MetaShape = { id?: string; name?: string; icon?: string; restricted?: boolean; viewers?: string[]; editors?: string[]; hideLabel?: boolean; sortOrder?: number; cards?: any[]; categories?: any[]; [key: string]: any };
function ensureRestoredSpace(doc: Doc, meta: MetaShape | null | undefined): DocSpace {
	if (!meta) throw new Error("errors.historySpaceMissing");
	const byId = doc.spaces.find((t) => t.id === meta.id);
	if (byId) return byId;
	const byName = doc.spaces.find((t) => t.name.toLowerCase() === String(meta.name || "").toLowerCase());
	if (byName) return byName;
	const space: DocSpace = {
		id: meta.id && !doc.spaces.some((t) => t.id === meta.id) ? meta.id : newId(),
		name: meta.name || "Space",
		icon: meta.icon || "Layers",
		sortOrder: Math.max(0, ...doc.spaces.map((t) => t.sortOrder)) + 1,
		restricted: Boolean(meta.restricted),
		viewers: Array.isArray(meta.viewers) ? [...meta.viewers] : [],
		editors: Array.isArray(meta.editors) ? [...meta.editors] : [],
		hideLabel: Boolean(meta.hideLabel),
		categories: []
	};
	doc.spaces.push(space);
	return space;
}
function ensureRestoredCat(space: DocSpace, meta: MetaShape | null | undefined): PortalCategory {
	if (!meta) throw new Error("errors.historyCategoryMissing");
	const cats = space.categories ?? (space.categories = []);
	const byId = cats.find((c) => c.id === meta.id);
	if (byId) return byId;
	const byName = cats.find((c) => c.name.toLowerCase() === String(meta.name || "").toLowerCase());
	if (byName) return byName;
	const cat: PortalCategory = {
		id: meta.id && !cats.some((c) => c.id === meta.id) ? meta.id : newId(),
		name: meta.name || "Category",
		icon: meta.icon || "AppWindow",
		sortOrder: Math.max(0, ...cats.map((c) => c.sortOrder)) + 1,
		...normalizeCatAccess(meta),
		cards: []
	};
	cats.push(cat);
	return cat;
}
function putRestoredCard(doc: Doc, spaceMeta: MetaShape | null | undefined, catMeta: MetaShape | null | undefined, app: any) {
	const space = ensureRestoredSpace(doc, spaceMeta);
	const cat = ensureRestoredCat(space, catMeta);
	const id = app.id && !liveCardId(doc, app.id) ? app.id : newId();
	const sortOrder = Math.max(0, ...cat.cards.map((a) => a.sortOrder)) + 1;
	cat.cards.push(normalizeItem({
		...app,
		id
	}, cat.id, sortOrder));
	return {
		space,
		cat,
		id
	};
}
function markRestored(ev: HistoryEvent, scope: "space" | "category" | "card", id?: string) {
	if (!ev.restored) ev.restored = {
		space: false,
		categories: [],
		cards: []
	};
	if (scope === "space") ev.restored.space = true;
	else if (scope === "category") {
		if (!ev.restored.categories.includes(id || "")) ev.restored.categories.push(id || "");
	} else if (!ev.restored.cards.includes(id || "")) ev.restored.cards.push(id || "");
}
function snapshotCardFromEvent(ev: HistoryEvent, targetId: string): { card: any; category: any; space: any } | null {
	const snap = ev.snapshot || {};
	const space = snap.space;
	if (snap.card && snap.card.id === targetId) return {
		card: snap.card,
		category: snap.category,
		space
	};
	for (const card of snap.cards || []) if (card.id === targetId) return {
		card,
		category: snap.category,
		space
	};
	for (const cat of snap.categories || []) for (const card of cat.cards || []) if (card.id === targetId) return {
		card,
		category: snapshotCat(cat),
		space
	};
	return null;
}
export function restoreHistoryItem(doc: Doc, user: HydratedUser, eventId: string, scope: "space" | "category" | "card", targetId: string) {
	const ev = (doc.history || []).find((row) => row.id === eventId);
	if (!ev || ev.purged || !ev.snapshot) throw new Error("errors.trashMissing");
	const snap = ev.snapshot;
	if (scope === "card") {
		const found = snapshotCardFromEvent(ev, targetId);
		if (!found) throw new Error("errors.historyCardMissing");
		putRestoredCard(doc, found.space, found.category, found.card);
		markRestored(ev, "card", targetId);
		appendHistory(doc, user, {
			type: "card.restore",
			label: found.card.title || tt(doc, "empty.untitled"),
			snapshot: {
				space: found.space,
				category: found.category
			}
		});
		return found.space.id;
	}
	if (scope === "category") {
		let catMeta = snap.category && snap.category.id === targetId ? snap.category : null;
		let cards = snap.cards || [];
		const spaceMeta = snap.space;
		if (!catMeta) {
			const cat = (snap.categories || []).find((c: any) => c.id === targetId);
			if (!cat) throw new Error("errors.historyCategoryMissing");
			catMeta = snapshotCat(cat);
			cards = cat.cards || [];
		}
		const space = ensureRestoredSpace(doc, spaceMeta);
		const cat = ensureRestoredCat(space, catMeta);
		for (const card of cards) {
			if (liveCardId(doc, card.id)) continue;
			putRestoredCard(doc, snapshotSpace(space), snapshotCat(cat), card);
			markRestored(ev, "card", card.id);
		}
		markRestored(ev, "category", targetId);
		appendHistory(doc, user, {
			type: "category.restore",
			label: catMeta.name,
			snapshot: { space: snapshotSpace(space), category: catMeta }
		});
		return space.id;
	}
	if (scope === "space") {
		if (!snap.space) throw new Error("errors.historySpaceMissing");
		const spaceMeta = snap.space;
		const space = ensureRestoredSpace(doc, spaceMeta);
		for (const cat of snap.categories || []) {
			const created = ensureRestoredCat(space, snapshotCat(cat));
			for (const card of cat.cards || []) {
				if (liveCardId(doc, card.id)) continue;
				putRestoredCard(doc, snapshotSpace(space), snapshotCat(created), card);
				markRestored(ev, "card", card.id);
			}
			markRestored(ev, "category", cat.id);
		}
		markRestored(ev, "space", spaceMeta.id);
		appendHistory(doc, user, {
			type: "space.restore",
			label: spaceMeta.name,
			snapshot: { space: snapshotSpace(space) }
		});
		return space.id;
	}
	throw new Error("errors.restoreFail");
}
