import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomBytes, scryptSync } from "node:crypto";
import { safeAppHref, safeEmbedHref } from "./safe-href";
import { ASSET_PREFIX, ASSET_URL, MAX_CUSTOM_ICONS, isAssetRef, toClientAsset } from "./assets-url";
import { SPACE_XFER_KIND, SPACE_XFER_VERSION, collectIconValues, parseSpaceXfer } from "./space-xfer";
import { CSS_MAX, sanitizeThemeCss } from "./theme-css";
import { isWeakPassword, passwordPolicyError, PASSWORD_MAX } from "./security";
import { assertProductionSecrets, clientIp, isDevRuntime, trustProxy } from "./security-runtime";
import { parseSessCookie } from "./session-cookie";
import {
	asHistory,
	pruneHistory,
	appendHistory,
	snapshotSpace,
	snapshotCat,
	snapshotCard,
	snapshotToDisk,
	publicAudit,
	publicTrash,
	emptyTrash
} from "./history";
import { t, withLocale, asNumberFormat, asTimeFormat, asTimeZone, DATE_FORMATS, NUMBER_FORMATS } from "./i18n";
import {
	curationJobRunning,
	curationJobSnapshot,
	curationJobStop,
	curationScanAllowed,
	pruneCurationChecks,
	readCurationStore,
	startCurationJob,
	writeCurationStore,
	type CurationCheck,
	type CurationJobTarget
} from "./curation-runtime";
export type { CurationCheck } from "./curation-runtime";
export type { CurationJobView } from "./curation-runtime";
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
	type Space,
	type User
} from "./acl";
import type { HistoryEvent } from "./history";
import type { Directory } from "./ldap-runtime";

function tt(doc: Doc | null | undefined, key: string, vars?: Record<string, unknown>) {
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
  cardIconBg: boolean;
  cardContextMenu: boolean;
  cardDragCollapse: boolean;
  ctxHideUrl: boolean;
  infoStats: boolean;
  infoLegend: boolean;
  probeTlsVerify: boolean;
  probeAuthOnly: boolean;
  sessionHttpOnly: boolean;
  devAdminNoPassword: boolean;
  proxyAuthEnabled: boolean;
  proxyAuthHeader: string;
  oidcEnabled: boolean;
  oidcIssuer: string;
  oidcClientId: string;
  oidcClientSecret: string;
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
  ldapHasBindPassword?: boolean;
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
type StoredUser = User & { passHash?: string };
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
function normalizeItem(a: any, categoryId: string, sortOrder: number): PortalCard {
	const kind = asKind(a.kind);
	let linksFull: { title: string; url: string; openIn?: "_blank" | "_self" }[] = [];
	if (kind === "app") {
		const extras = asExtraLinks(a.links);
		const main = safeAppHref(a.url);
		if (main && extras[0]?.url !== main) extras.unshift({ title: "", url: main });
		linksFull = extras.slice(0, 20);
	}
	return {
		id: a.id || crypto.randomUUID(),
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
		cardIconBg: true,
		cardContextMenu: true,
		cardDragCollapse: true,
		ctxHideUrl: false,
		infoStats: true,
		infoLegend: true,
		probeTlsVerify: false,
		probeAuthOnly: false,
		sessionHttpOnly: false,
		devAdminNoPassword: false,
		proxyAuthEnabled: false,
		proxyAuthHeader: "X-Remote-User",
		oidcEnabled: false,
		oidcIssuer: "",
		oidcClientId: "",
		oidcClientSecret: "",
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
function blankSpaces(locale?: unknown): { lastSpaceId: string; spaces: DocSpace[] } {
	const spaceId = crypto.randomUUID();
	const catId = crypto.randomUUID();
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
		spaces: blank.spaces
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
		const source = g?.source === "ad" || g?.source === "oidc" ? g.source : "local";
		let roleIds = roleIdsOf(g).map((r) => String(r).slice(0, 80)).filter((r) => r !== "owner");
		if (!roleIds.length && source === "local") roleIds = ["lecteur"];
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
function spaceCanSee(space: Space | DocSpace | null | undefined, user: User | null | undefined, doc: AclDoc) {
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
function catCanSee(cat: PortalCategory | null | undefined, user: User | null | undefined, doc: AclDoc) {
	if (!cat) return false;
	return can(user, "view", { res: "cat", id: cat.id }, doc);
}
type HydratedUser = StoredUser & {
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
	const roleIds = roleIdsOf(user);
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
function canSetNodeAcl(user: HydratedUser | null | undefined): boolean {
	if (!user) return false;
	return isOwnerUser(user) || Boolean(user.canManageUsers || user.canManageRoles);
}
function historyVisible(doc: Doc, user: HydratedUser | null | undefined, ev: HistoryEvent) {
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
function requireEdit(doc: Doc, token: string, spaceId?: string): HydratedUser {
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
function requireCreateSpace(doc: Doc, token: string): HydratedUser {
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
function upsertOidcGroups(doc: Doc, issuer: string, names: string[]) {
	ensureGroups(doc);
	for (const name of names) {
		const key = `oidc:${issuer.slice(0, 60)}:${name.slice(0, 200)}`;
		const existing = doc.groups.find((g) => g.source === "oidc" && g.externalId === key);
		if (existing) continue;
		if (doc.groups.length >= GROUP_CAP) break;
		doc.groups.push({
			id: crypto.randomUUID(),
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
function applyOidcGroups(doc: Doc, user: StoredUser | null | undefined, issuer: string, names: string[]) {
	if (!user || user.id === "admin") return;
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
function syncUserGroups(doc: Doc, userId: string, groupIds: unknown) {
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
function directoryPayload(doc: Doc, actor: User) {
	ensureUsers(doc);
	ensureGroups(doc);
	ensureRoles(doc);
	const ownerActor = isOwnerUser(actor);
	return {
		users: doc.users.filter((u) => ownerActor ? true : u.id === actor.id || u.id !== "admin").map((u) => publicUser(u, doc)),
		groups: doc.groups.map((g) => publicGroup(g, doc)),
		roles: doc.roles.map((r) => publicRole(r, doc)),
		spaces: manageSpaces(doc),
		directory: directoryOf(doc)
	};
}
function stripUserAccess(doc: Doc, userId: string) {
	for (const space of doc.spaces) {
		space.editors = (space.editors || []).filter((id) => id !== userId);
		space.viewers = (space.viewers || []).filter((id) => id !== userId);
		for (const cat of space.categories || []) {
			cat.editors = (cat.editors || []).filter((id) => id !== userId);
			cat.viewers = (cat.viewers || []).filter((id) => id !== userId);
		}
	}
}
async function emit(doc: Doc, user: StoredUser | HydratedUser | null | undefined, spaceId?: string) {
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
function asStore(raw: any): Doc | null {
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
			probeAuthOnly: Boolean(doc.settings.probeAuthOnly),
			sessionHttpOnly: Boolean(doc.settings.sessionHttpOnly),
			devAdminNoPassword: Boolean(doc.settings.devAdminNoPassword),
			oidcEnabled: Boolean(doc.settings.oidcEnabled),
			oidcIssuer: String(doc.settings.oidcIssuer || "").trim().slice(0, 300),
			oidcClientId: String(doc.settings.oidcClientId || "").trim().slice(0, 120),
			oidcClientSecret: String(doc.settings.oidcClientSecret || "").slice(0, 200),
			oidcLabel: String(doc.settings.oidcLabel || "SSO").trim().slice(0, 40) || "SSO",
			oidcAutoCreate: Boolean(doc.settings.oidcAutoCreate),
			oidcAutoRedirect: Boolean(doc.settings.oidcAutoRedirect),
			proxyAuthEnabled: Boolean(doc.settings.proxyAuthEnabled),
			proxyAuthHeader: /^[A-Za-z0-9-]+$/.test(String(doc.settings.proxyAuthHeader || "").trim())
				? String(doc.settings.proxyAuthHeader).trim()
				: "X-Remote-User",
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
		spaces: spaces.map((t: any, i: number) => ({
			id: t.id || crypto.randomUUID(),
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
export function toDisk(doc: Doc) {
	const { spaces, lastSpaceId, history, ...rest } = doc;
	return {
		...rest,
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
		const parsed = parseStoreText(text);
		ensureRoles(parsed);
		ensureGroups(parsed);
		liveDoc = parsed;
		return parsed;
	} catch (err) {
		if (!isMissingStoreFile(err)) throw err;
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
async function loadPortal(spaceId: string | undefined, token: string | null | undefined) {
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
		proxyAuthEnabled: Boolean(s.proxyAuthEnabled),
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
		delete out.oidcAutoRedirect;
		delete out.proxyAuthHeader;
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
function view(doc: Doc, spaceId: string | undefined, user: HydratedUser | null) {
	const session = user ? sessionInfo(user, doc) : null;
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
		}
	};
}
function spaceOfCategory(doc: Doc, categoryId: string): DocSpace {
	const space = doc.spaces.find((t) => t.categories!.some((c) => c.id === categoryId));
	if (!space) throw new Error("errors.categoryNotFound");
	return space;
}
function categoryOf(doc: Doc, categoryId: string): { space: DocSpace; cat: PortalCategory } {
	for (const space of doc.spaces) {
		const cat = space.categories!.find((c) => c.id === categoryId);
		if (cat) return {
			space,
			cat
		};
	}
	throw new Error("errors.categoryNotFound");
}
function cardOf(doc: Doc, appId: string): { space: DocSpace; cat: PortalCategory; app: PortalCard } {
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
		id: meta.id && !doc.spaces.some((t) => t.id === meta.id) ? meta.id : crypto.randomUUID(),
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
		id: meta.id && !cats.some((c) => c.id === meta.id) ? meta.id : crypto.randomUUID(),
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
	const id = app.id && !liveCardId(doc, app.id) ? app.id : crypto.randomUUID();
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
function restoreHistoryItem(doc: Doc, user: HydratedUser, eventId: string, scope: "space" | "category" | "card", targetId: string) {
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
export const getPortal = createServerFn({ method: "GET" }).validator(z.object({
	spaceId: z.string().optional(),
	token: z.string().optional()
})).handler(async ({ data, request }: any) => loadPortal(data.spaceId, tok(data, request)));
export const listHistory = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField
})).handler(async ({ data, request }: any) => withLock(async () => {
	const doc = await readDocUnlocked();
	const user = requireUser(doc, tok(data, request));
	if (!user.canAudit && !user.canRestore) throw new Error("errors.insufficient");
	const before = (doc.history || []).length;
	pruneHistory(doc);
	if ((doc.history || []).length !== before) await writeDocUnlocked(doc);
	const visible = (doc.history || []).filter((ev) => historyVisible(doc, user, ev));
	return withLocale(doc.settings, () => ({
		audit: user.canAudit ? publicAudit(visible) : [],
		trash: user.canRestore ? publicTrash(visible) : [],
		canEmpty: Boolean(user.canPurge),
		canAudit: Boolean(user.canAudit),
		canRestore: Boolean(user.canRestore)
	}));
}));
export const restoreHistory = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	id: z.string().min(1),
	scope: z.enum(["card", "category", "space"]),
	targetId: z.string().min(1)
})).handler(async ({ data, request }: any) => mutate((doc) => {
	const user = requireUser(doc, tok(data, request));
	if (!user.canRestore) throw new Error("errors.insufficient");
	const ev = (doc.history || []).find((row) => row.id === data.id);
	if (!ev || !historyVisible(doc, user, ev)) throw new Error("errors.trashMissing");
	const spaceId = restoreHistoryItem(doc, user, data.id, data.scope, data.targetId);
	pruneUnusedTags(doc);
	return emit(doc, user, spaceId);
}));
export const purgeTrash = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField
})).handler(async ({ data, request }: any) => mutate(async (doc) => {
	const user = requireUser(doc, tok(data, request));
	if (!user.canPurge) throw new Error("errors.insufficient");
	emptyTrash(doc);
	const portal = await emit(doc, user);
	return withLocale(doc.settings, () => ({
		portal,
		audit: publicAudit(doc.history),
		trash: publicTrash(doc.history),
		canEmpty: true
	}));
}));
export const rememberSpace = createServerFn({ method: "POST" }).validator(z.object({
	spaceId: z.string().min(1),
	token: z.string().optional()
})).handler(async ({ data, request }: any) => withLock(async () => {
	const doc = await readDocUnlocked();
	if (doc.lastSpaceId === data.spaceId) return;
	const space = doc.spaces.find((t) => t.id === data.spaceId);
	if (!space) return;
	let user = null;
	const token = tok(data, request);
	if (token) try {
		user = requireUser(doc, token);
	} catch {
		return;
	}
	if (!user || !isOwnerUser(user) || !spaceCanSee(space, user, doc)) return;
	doc.lastSpaceId = data.spaceId;
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
	const found = cardOf(doc, data.id);
	if (!spaceCanSee(found.space, user, doc) || !can(user, "view", { res: "card", id: found.app.id }, doc)) return {
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
	spaceId: z.string().optional()
})).handler(async ({ data, request }: any) => mutate((doc) => {
	const user = requireAdmin(doc, tok(data, request));
	for (const space of doc.spaces) for (const cat of space.categories) for (const app of cat.cards) if (app.kind === "app") app.clicks = 0;
	doc.clickDays = {};
	return emit(doc, user, data.spaceId);
}));
export const resetProbes = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	spaceId: z.string().optional()
})).handler(async ({ data, request }: any) => mutate((doc) => {
	const user = requireAdmin(doc, tok(data, request));
	for (const space of doc.spaces)
		for (const cat of space.categories)
			for (const app of cat.cards) {
				if ((app.kind || "app") !== "app") continue;
				if (asCheck(app.check) === "off") continue;
				app.check = "off";
				app.checkHost = "";
			}
	appendHistory(doc, user, {
		type: "settings.probeOff",
		label: tt(doc, "audit.item.probeOff")
	});
	return emit(doc, user, data.spaceId);
}));
export const resetPortal = createServerFn({ method: "POST" }).validator(z.object({ token: tokenField })).handler(async ({ data, request }: any) => mutate(async (doc) => {
	requireAdmin(doc, tok(data, request));
	const fresh = blankSpaces("en");
	doc.settings = defaultSettings();
	doc.customIcons = [];
	doc.clickDays = {};
	doc.lastSpaceId = fresh.lastSpaceId;
	doc.spaces = fresh.spaces;
	doc.groups = [];
	doc.roles = defaultRoles();
	if (process.env.NODE_ENV === "production") requireStrongPassword(envPassword());
	doc.users = [{
		id: "admin",
		username: envUser(),
		passHash: await hashPassword(envPassword()),
		role: "owner",
		roleIds: ["owner"],
		groupIds: [],
		grants: [],
		disabled: false,
		source: "local",
		externalId: ""
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
	cardIconBg: z.boolean().optional(),
	cardContextMenu: z.boolean().optional(),
	cardDragCollapse: z.boolean().optional(),
	ctxHideUrl: z.boolean().optional(),
	infoStats: z.boolean().optional(),
	infoLegend: z.boolean().optional(),
	probeTlsVerify: z.boolean().optional(),
	probeAuthOnly: z.boolean().optional(),
	sessionHttpOnly: z.boolean().optional(),
	devAdminNoPassword: z.boolean().optional(),
	proxyAuthEnabled: z.boolean().optional(),
	proxyAuthHeader: z.string().max(64).optional(),
	locale: z.enum(["en", "fr"]).optional(),
	dateFormat: z.enum(["ymd", "yyyy", "dmy", "mdy", "iso"]).optional(),
	timeFormat: z.enum(["24h", "12h"]).optional(),
	timezone: z.string().max(80).optional(),
	numberFormat: z.enum(["auto", "space-comma", "comma-dot", "dot-comma", "apostrophe-comma"]).optional(),
	spaceId: z.string().optional()
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
		cardIconBg: typeof data.cardIconBg === "boolean" ? data.cardIconBg : doc.settings.cardIconBg !== false,
		cardContextMenu: typeof data.cardContextMenu === "boolean" ? data.cardContextMenu : doc.settings.cardContextMenu !== false,
		cardDragCollapse: typeof data.cardDragCollapse === "boolean" ? data.cardDragCollapse : doc.settings.cardDragCollapse !== false,
		ctxHideUrl: typeof data.ctxHideUrl === "boolean" ? data.ctxHideUrl : Boolean(doc.settings.ctxHideUrl),
		infoStats: typeof data.infoStats === "boolean" ? data.infoStats : doc.settings.infoStats !== false,
		infoLegend: typeof data.infoLegend === "boolean" ? data.infoLegend : doc.settings.infoLegend !== false,
		probeTlsVerify: typeof data.probeTlsVerify === "boolean" ? data.probeTlsVerify : Boolean(doc.settings.probeTlsVerify),
		probeAuthOnly: typeof data.probeAuthOnly === "boolean" ? data.probeAuthOnly : Boolean(doc.settings.probeAuthOnly),
		sessionHttpOnly: typeof data.sessionHttpOnly === "boolean" ? data.sessionHttpOnly : Boolean(doc.settings.sessionHttpOnly),
		devAdminNoPassword: typeof data.devAdminNoPassword === "boolean" ? data.devAdminNoPassword : Boolean(doc.settings.devAdminNoPassword),
		proxyAuthEnabled: typeof data.proxyAuthEnabled === "boolean" ? data.proxyAuthEnabled : Boolean(doc.settings.proxyAuthEnabled),
		proxyAuthHeader: /^[A-Za-z0-9-]+$/.test(String(data.proxyAuthHeader || "").trim())
			? String(data.proxyAuthHeader).trim()
			: doc.settings.proxyAuthHeader || "X-Remote-User",
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
	return emit(doc, user, data.spaceId);
}));
export const updateThemeCss = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	cssLight: z.string().max(CSS_MAX),
	cssDark: z.string().max(CSS_MAX),
	spaceId: z.string().optional()
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
	return emit(doc, user, data.spaceId);
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
			const extId = authExternalId("ad", dir.id, username);
			let user = findUserForAuth(doc.users, username, "ad", extId);
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
					source: "ad",
					externalId: extId
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
			if (!user.externalId) user.externalId = extId;
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
		const user = asOwner ? owner : findUserForAuth(doc.users, username, "local");
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
	oidcAutoRedirect: z.boolean().optional(),
	spaceId: z.string().optional()
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
		oidcAutoCreate: Boolean(data.oidcAutoCreate),
		oidcAutoRedirect: Boolean(data.oidcAutoRedirect)
	};
	appendHistory(doc, user, {
		type: "oidc.update",
		label: "OIDC"
	});
	return emit(doc, user, data.spaceId);
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
	spaceId: z.string().optional()
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
	return emit(doc, user, data.spaceId);
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
	spaceId: z.string().optional()
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
	return emit(doc, user, data.spaceId);
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
	const snap = await readDoc();
	const s = snap.settings;
	if (!s.oidcEnabled || !s.oidcIssuer || !s.oidcClientId) throw new Error("errors.oidcOff");
	const { discoverOidc, exchangeCode, fetchUserInfo, usernameFromClaims, verifyIdToken } = await import("./oidc-runtime");
	let username: string;
	let groups: string[] = [];
	let issuer: string;
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
		username = usernameFromClaims(info);
		groups = Array.isArray(info.groups) ? (info.groups as unknown[]).map((g) => String(g || "").trim()).filter(Boolean).slice(0, 100) : [];
		issuer = disc.issuer;
	} catch (err) {
		loginFail(key);
		throw err instanceof Error ? err : new Error("errors.oidcFail");
	}
	return mutate(async (doc) => {
		const live = doc.settings;
		if (!live.oidcEnabled || !live.oidcIssuer || !live.oidcClientId) throw new Error("errors.oidcOff");
		ensureUsers(doc);
		const extId = authExternalId("oidc", issuer, username);
		let user = findUserForAuth(doc.users, username, "oidc", extId);
		if (!user) {
			if (!live.oidcAutoCreate) {
				loginFail(key);
				throw new Error("errors.oidcUnknownUser");
			}
			user = {
				id: crypto.randomUUID(),
				username,
				passHash: await hashPassword(randomBytes(24).toString("hex")),
				role: "lecteur",
				roleIds: ["lecteur"],
				grants: [],
				source: "oidc",
				externalId: extId
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
		if (!user.externalId) user.externalId = extId;
		applyOidcGroups(doc, user, issuer, groups);
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
export const proxyLogin = createServerFn({ method: "POST" }).validator(z.object({})).handler(async (ctx) => {
	const doc = await readDoc();
	const s = doc.settings;
	if (!s.proxyAuthEnabled || !trustProxy()) throw new Error("errors.proxyOff");
	const headerName = s.proxyAuthHeader || "X-Remote-User";
	const headers = (ctx as any).request?.headers;
	const raw = headers && typeof headers.get === "function" ? String(headers.get(headerName) || "").trim() : "";
	const username = raw.toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 40);
	if (!username) throw new Error("errors.proxyOff");
	const key = clientKey("proxy", (ctx as any).request);
	if (loginBlocked(key)) throw new Error("errors.tooManyTries");
	const dirs = asDirectories(s).filter(directoryReady).filter((d) => String(d.bindDn || "").trim());
	let memberOf: string[] | null = null;
	let directoryId: string | null = null;
	const { ldapUserGroups } = await import("./ldap-runtime");
	for (const dir of dirs) {
		try {
			memberOf = await ldapUserGroups(dir, username);
			directoryId = dir.id;
			break;
		} catch {
			// try next directory
		}
	}
	return mutate(async (doc) => {
		ensureUsers(doc);
		const extId = authExternalId("proxy", username);
		let user = findUserForAuth(doc.users, username, "proxy", extId);
		if (!user) {
			if (!doc.settings.ldapAutoCreate) {
				loginFail(key);
				throw new Error("errors.proxyUnknownUser");
			}
			user = {
				id: crypto.randomUUID(),
				username,
				passHash: await hashPassword(randomBytes(24).toString("hex")),
				role: "lecteur",
				roleIds: ["lecteur"],
				grants: [],
				source: "proxy",
				externalId: extId
			};
			doc.users.push(user);
			appendHistory(doc, user, {
				type: "user.create",
				label: username
			});
		}
		if (user.disabled) {
			loginFail(key);
			throw new Error("errors.disabled");
		}
		if (!user.externalId) user.externalId = extId;
		if (directoryId && memberOf) applyAdMembership(doc, user, directoryId, memberOf);
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
const grantField = z.object({
	res: z.enum(["portal", "space", "cat", "card"]),
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
	if (target.id === "admin") throw new Error("errors.cannotDeleteAdmin");
	if (!isOwnerUser(actor) && (isOwnerUser(target) || roleIdsOf(target).includes("admin") || target.role === "admin")) throw new Error("errors.cannotDeleteAdmin");
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
	const roleIds = cleanRoleIds(doc, data.roleIds?.length ? data.roleIds : data.role ? [data.role] : target?.source === "ad" || target?.source === "oidc" ? [] : ["lecteur"], { allowEmpty: target?.source === "ad" || target?.source === "oidc" });
	const name = data.name.trim().slice(0, 60);
	if (!name) throw new Error("errors.nameRequired");
	if (target?.source === "ad" || target?.source === "oidc") {
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
	if (target.source !== "ad" && target.source !== "oidc") syncGroupMembers(doc, target.id, data.members ?? target.members);
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
export const createSpace = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	name: z.string().min(1).max(40),
	icon: z.string().min(1).max(4e5),
	restricted: z.boolean().optional(),
	viewers: z.array(z.string()).optional(),
	editors: z.array(z.string()).optional(),
	hideLabel: z.boolean().optional()
})).handler(async ({ data, request }: any) => mutate((doc) => {
	const user = requireCreateSpace(doc, tok(data, request));
	const id = crypto.randomUUID();
	const next = Math.max(0, ...doc.spaces.map((t) => t.sortOrder)) + 1;
	doc.spaces.push({
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
		if (live) live.grants = mergeGrant(asGrants(live.grants), { res: "space", id, allow: ["view", "open", "edit", "create", "delete", "move"] });
	}
	appendHistory(doc, user, {
		type: "space.create",
		label: data.name,
		snapshot: { space: snapshotSpace(doc.spaces[doc.spaces.length - 1]) }
	});
	return emit(doc, user, id);
}));
export const duplicateSpace = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	id: z.string().min(1)
})).handler(async ({ data, request }: any) => mutate((doc) => {
	const user = requireCreateSpace(doc, tok(data, request));
	const src = doc.spaces.find((t) => t.id === data.id);
	if (!src) throw new Error("errors.spaceNotFound");
	requireEdit(doc, tok(data, request), src.id);
	const spaceId = crypto.randomUUID();
	const suffix = tt(doc, "copy.suffix");
	const base = String(src.name || "").trim().replace(/\s*\((copie|copy)\)\s*$/i, "") || tt(doc, "nav.space");
	const ordered = [...doc.spaces].sort((a, b) => a.sortOrder - b.sortOrder);
	const srcIndex = ordered.findIndex((t) => t.id === src.id);
	doc.spaces.push({
		id: spaceId,
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
				cards: (c.cards || []).map((a, ai) => normalizeItem({
					...a,
					id: crypto.randomUUID(),
					clicks: 0
				}, catId, ai + 1))
			};
		})
	});
	const ids = ordered.map((t) => t.id);
	ids.splice(srcIndex < 0 ? ids.length : srcIndex + 1, 0, spaceId);
	ids.forEach((id, i) => {
		const space = doc.spaces.find((t) => t.id === id);
		if (space) space.sortOrder = i + 1;
	});
	appendHistory(doc, user, {
		type: "space.duplicate",
		label: `${base} (${suffix})`.slice(0, 40),
		snapshot: { space: snapshotSpace(doc.spaces.find((t) => t.id === spaceId)) }
	});
	return emit(doc, user, spaceId);
}));
export const updateSpace = createServerFn({ method: "POST" }).validator(z.object({
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
	const space = doc.spaces.find((t) => t.id === data.id);
	if (!space) throw new Error("errors.portalNotFound");
	space.name = data.name;
	space.icon = data.icon;
	if (typeof data.hideLabel === "boolean") space.hideLabel = data.hideLabel;
	if (canSetNodeAcl(user) && typeof data.restricted === "boolean") space.restricted = data.restricted;
	appendHistory(doc, user, {
		type: "space.update",
		label: space.name,
		snapshot: { space: snapshotSpace(space) }
	});
	return emit(doc, user, data.id);
}));
export const updateFavsOptions = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	hideLabel: z.boolean(),
	spaceId: z.string().optional()
})).handler(async ({ data, request }: any) => mutate((doc) => {
	const user = requireEdit(doc, tok(data, request));
	doc.settings.favsHideLabel = data.hideLabel;
	return emit(doc, user, data.spaceId);
}));
export const deleteSpace = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	id: z.string().min(1)
})).handler(async ({ data, request }: any) => mutate((doc) => {
	const user = requireEdit(doc, tok(data, request), data.id);
	if (doc.spaces.length <= 1) throw new Error("errors.lastSpace");
	const space = doc.spaces.find((t) => t.id === data.id);
	if (space) appendHistory(doc, user, {
		type: "space.delete",
		label: space.name,
		snapshot: {
			space: snapshotSpace(space),
			categories: (space.categories || []).map((c) => ({
				...snapshotCat(c),
				cards: (c.cards || []).map(snapshotCard)
			}))
		}
	});
	doc.spaces = doc.spaces.filter((t) => t.id !== data.id);
	pruneUnusedTags(doc);
	return emit(doc, user);
}));
export const createCategory = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	spaceId: z.string().min(1),
	name: z.string().min(1).max(60),
	icon: z.string().min(1).max(4e5),
	restricted: z.boolean().optional(),
	viewers: z.array(z.string()).optional(),
	editors: z.array(z.string()).optional()
})).handler(async ({ data, request }: any) => mutate((doc) => {
	const user = requireEdit(doc, tok(data, request), data.spaceId);
	const space = doc.spaces.find((t) => t.id === data.spaceId);
	if (!space) throw new Error("errors.portalNotFound");
	const next = Math.max(0, ...space.categories.map((c) => c.sortOrder)) + 1;
	const access = canSetNodeAcl(user) ? normalizeCatAccess({
		restricted: data.restricted,
		viewers: data.viewers,
		editors: data.editors
	}) : {
		restricted: false,
		viewers: [],
		editors: []
	};
	space.categories.push({
		id: crypto.randomUUID(),
		name: data.name,
		icon: data.icon,
		sortOrder: next,
		...access,
		cards: []
	});
	appendHistory(doc, user, {
		type: "category.create",
		label: data.name,
		snapshot: {
			space: snapshotSpace(space),
			category: snapshotCat(space.categories[space.categories.length - 1])
		}
	});
	return emit(doc, user, data.spaceId);
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
	const { space, cat } = categoryOf(doc, data.id);
	requireEdit(doc, tok(data, request), space.id);
	cat.name = data.name;
	cat.icon = data.icon;
	if (canSetNodeAcl(user) && typeof data.restricted === "boolean") cat.restricted = data.restricted;
	appendHistory(doc, user, {
		type: "category.update",
		label: cat.name,
		snapshot: {
			space: snapshotSpace(space),
			category: snapshotCat(cat)
		}
	});
	return emit(doc, user, space.id);
}));
export const deleteCategory = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	id: z.string().min(1)
})).handler(async ({ data, request }: any) => mutate((doc) => {
	const user = requireEdit(doc, tok(data, request));
	const space = spaceOfCategory(doc, data.id);
	requireEdit(doc, tok(data, request), space.id);
	const cat = space.categories.find((c) => c.id === data.id);
	if (cat) appendHistory(doc, user, {
		type: "category.delete",
		label: cat.name,
		snapshot: {
			space: snapshotSpace(space),
			category: snapshotCat(cat),
			cards: (cat.cards || []).map(snapshotCard)
		}
	});
	space.categories = space.categories.filter((c) => c.id !== data.id);
	pruneUnusedTags(doc);
	return emit(doc, user, space.id);
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
	url: z.string().max(2e3).optional(),
	icon: z.string().min(1).max(4e5),
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
		title: z.string().max(40),
		url: z.string().min(1).max(2e3),
		openIn: z.enum(["_blank", "_self"]).optional()
	})).max(20).optional().default([]),
	linkMenu: z.boolean().optional(),
	embedBorder: z.boolean().optional(),
	embedBg: z.string().max(7).optional(),
	tagColors: z.record(z.string().min(1).max(32), z.string().max(7)).optional()
};
function requireUrl(kind: unknown, url: string) {
	if (kind === "note") return;
	if (kind === "embed") {
		if (!safeEmbedHref(url)) throw new Error("errors.embedUrlRequired");
		return;
	}
	if (!safeAppHref(url)) throw new Error("errors.urlRequired");
}
function requireTitle(kind: unknown, title: string) {
	if (kind === "note" || kind === "embed") return;
	if (!title.trim()) throw new Error("errors.nameRequired");
}
function requireBody(kind: unknown, description: unknown) {
	if (kind !== "note") return;
	if (!String(description || "").trim()) throw new Error("errors.contentRequired");
}
export const createCard = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	...itemPayload
})).handler(async ({ data, request }: any) => mutate((doc) => {
	const user = requireEdit(doc, tok(data, request));
	requireUrl(data.kind, data.links?.[0]?.url || data.url);
	requireTitle(data.kind, data.title);
	requireBody(data.kind, data.description);
	const { space, cat } = categoryOf(doc, data.categoryId);
	requireEdit(doc, tok(data, request), space.id);
	const next = Math.max(0, ...cat.cards.map((a) => a.sortOrder)) + 1;
	cat.cards.push(normalizeItem({
		kind: data.kind,
		title: data.title,
		description: data.description,
		url: data.url,
		icon: data.icon,
		tags: data.tags,
		colSpan: data.colSpan,
		rowSpan: data.rowSpan,
		check: data.check,
		checkHost: data.checkHost,
		links: data.links,
		linkMenu: data.linkMenu,
		embedBorder: data.embedBorder,
		embedBg: data.embedBg
	}, cat.id, next));
	assignTagColors(doc, data.tags, data.tagColors);
	const created = cat.cards[cat.cards.length - 1];
	appendHistory(doc, user, {
		type: "card.create",
		label: created.title || tt(doc, "empty.untitled"),
		snapshot: {
			space: snapshotSpace(space),
			category: snapshotCat(cat),
			app: snapshotCard(created)
		}
	});
	return emit(doc, user, space.id);
}));
export const updateCard = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	id: z.string().min(1),
	...itemPayload
})).handler(async ({ data, request }: any) => mutate((doc) => {
	const user = requireEdit(doc, tok(data, request));
	requireUrl(data.kind, data.links?.[0]?.url || data.url);
	requireTitle(data.kind, data.title);
	requireBody(data.kind, data.description);
	const found = cardOf(doc, data.id);
	const dest = categoryOf(doc, data.categoryId);
	requireEdit(doc, tok(data, request), found.space.id);
	requireEdit(doc, tok(data, request), dest.space.id);
	if (found.cat.id !== dest.cat.id) {
		found.cat.cards = found.cat.cards.filter((a) => a.id !== data.id);
		dest.cat.cards.push(found.app);
	}
	const next = normalizeItem({
		...found.app,
		kind: data.kind,
		title: data.title,
		description: data.description,
		url: data.url,
		icon: data.icon,
		tags: data.tags,
		colSpan: data.colSpan,
		rowSpan: data.rowSpan,
		check: data.check,
		checkHost: data.checkHost,
		clicks: found.app.clicks,
		links: data.links,
		linkMenu: data.linkMenu,
		embedBorder: data.embedBorder,
		embedBg: data.embedBg
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
			space: snapshotSpace(dest.space),
			category: snapshotCat(dest.cat),
			app: snapshotCard(found.app)
		}
	});
	return emit(doc, user, dest.space.id);
}));
export const deleteCard = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	id: z.string().min(1)
})).handler(async ({ data, request }: any) => mutate((doc) => {
	const user = requireEdit(doc, tok(data, request));
	const { space, cat, app } = cardOf(doc, data.id);
	requireEdit(doc, tok(data, request), space.id);
	appendHistory(doc, user, {
		type: "card.delete",
		label: app.title || tt(doc, "empty.untitled"),
		snapshot: {
			space: snapshotSpace(space),
			category: snapshotCat(cat),
			app: snapshotCard(app)
		}
	});
	cat.cards = cat.cards.filter((a) => a.id !== data.id);
	pruneUnusedTags(doc);
	return emit(doc, user, space.id);
}));
export const reorderCards = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	spaceId: z.string().min(1),
	placements: z.array(z.object({
		id: z.string().min(1),
		categoryId: z.string().min(1),
		sortOrder: z.number().int().min(0).max(9999)
	})).min(1).max(400)
})).handler(async ({ data, request }: any) => mutate((doc) => {
	const user = requireEdit(doc, tok(data, request), data.spaceId);
	const space = doc.spaces.find((t) => t.id === data.spaceId);
	if (!space) throw new Error("errors.portalNotFound");
	const allowed = new Set(space.categories.map((c) => c.id));
	const bag = /* @__PURE__ */ new Map();
	for (const cat of space.categories) {
		for (const app of cat.cards) bag.set(app.id, app);
		cat.cards = [];
	}
	for (const p of data.placements) {
		if (!allowed.has(p.categoryId)) throw new Error("errors.badCategory");
		const app = bag.get(p.id);
		if (!app) continue;
		app.categoryId = p.categoryId;
		app.sortOrder = p.sortOrder;
		space.categories.find((c) => c.id === p.categoryId)?.cards.push(app);
		bag.delete(p.id);
	}
	for (const leftover of bag.values()) space.categories.find((c) => c.id === leftover.categoryId)?.cards.push(leftover);
	return emit(doc, user, data.spaceId);
}));
export const arrangeCategory = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	categoryId: z.string().min(1),
	sort: z.enum(["alpha", "za"]).optional(),
	resetSpans: z.boolean().optional()
})).handler(async ({ data, request }: any) => mutate((doc) => {
	const { space, cat } = categoryOf(doc, data.categoryId);
	const user = requireEdit(doc, tok(data, request), space.id);
	let changed = false;
	if (data.sort === "alpha" || data.sort === "za") {
		const next = sortCardsAlpha(cat.cards, doc.settings.locale, data.sort === "za" ? "za" : "az");
		const same = next.length === cat.cards.length && next.every((a, i) => a.id === cat.cards[i]?.id);
		cat.cards = next;
		cat.cards.forEach((a, i) => {
			a.sortOrder = i + 1;
		});
		if (!same) changed = true;
	}
	if (data.resetSpans) {
		for (const app of cat.cards) {
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
			space: snapshotSpace(space),
			category: snapshotCat(cat)
		}
	});
	return emit(doc, user, space.id);
}));
export const moveCard = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	id: z.string().min(1),
	destSpaceId: z.string().min(1),
	destCategoryId: z.string().min(1),
	sortOrder: z.number().int().min(0).max(9999)
})).handler(async ({ data, request }: any) => mutate((doc) => {
	const user = requireUser(doc, tok(data, request));
	const found = cardOf(doc, data.id);
	if (!isOwnerUser(user) && !can(user, "move", { res: "card", id: found.app.id }, doc)) throw new Error("errors.noMove");
	if (!isOwnerUser(user) && !can(user, "move", { res: "cat", id: data.destCategoryId }, doc) && !can(user, "edit", { res: "space", id: data.destSpaceId }, doc)) throw new Error("errors.noMove");
	requireEdit(doc, tok(data, request), data.destSpaceId);
	const dest = categoryOf(doc, data.destCategoryId);
	if (dest.space.id !== data.destSpaceId) throw new Error("errors.categoryNotFound");
	found.cat.cards = found.cat.cards.filter((a) => a.id !== data.id);
	dest.cat.cards = dest.cat.cards.filter((a) => a.id !== data.id);
	const at = Math.max(0, Math.min(Math.max(0, data.sortOrder - 1), dest.cat.cards.length));
	dest.cat.cards.splice(at, 0, found.app);
	found.cat.cards.forEach((a, i) => {
		a.sortOrder = i + 1;
	});
	dest.cat.cards.forEach((a, i) => {
		a.sortOrder = i + 1;
		a.categoryId = dest.cat.id;
	});
	pruneUnusedTags(doc);
	appendHistory(doc, user, {
		type: "card.update",
		label: found.app.title || tt(doc, "empty.untitled"),
		snapshot: {
			space: snapshotSpace(dest.space),
			category: snapshotCat(dest.cat),
			app: snapshotCard(found.app)
		}
	});
	return emit(doc, user, dest.space.id);
}));
export const reorderCategories = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	spaceId: z.string().min(1),
	order: z.array(z.string().min(1)).min(1).max(80)
})).handler(async ({ data, request }: any) => mutate((doc) => {
	const user = requireEdit(doc, tok(data, request), data.spaceId);
	const space = doc.spaces.find((t) => t.id === data.spaceId);
	if (!space) throw new Error("errors.portalNotFound");
	data.order.forEach((id: string, i: number) => {
		const cat = space.categories.find((c) => c.id === id);
		if (cat) cat.sortOrder = i + 1;
	});
	space.categories.sort((a, b) => a.sortOrder - b.sortOrder);
	return emit(doc, user, data.spaceId);
}));
export const previewMoveCategory = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	categoryId: z.string().min(1),
	destSpaceId: z.string().min(1)
})).handler(async ({ data, request }: any) => withLock(async () => {
	const doc = await readDocUnlocked();
	const user = requireUser(doc, tok(data, request));
	if (!isOwnerUser(user) && !can(user, "move", { res: "cat", id: data.categoryId }, doc)) throw new Error("errors.noMove");
	const impact = categoryMoveImpact(doc, data.categoryId, data.destSpaceId);
	if (!impact) throw new Error("errors.categoryNotFound");
	return impact;
}));
export const moveCategory = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	categoryId: z.string().min(1),
	destSpaceId: z.string().min(1),
	insertAt: z.number().int().min(0).max(80).optional()
})).handler(async ({ data, request }: any) => mutate((doc) => {
	const user = requireUser(doc, tok(data, request));
	if (!isOwnerUser(user) && !can(user, "move", { res: "cat", id: data.categoryId }, doc)) throw new Error("errors.noMove");
	if (!isOwnerUser(user) && !can(user, "move", { res: "space", id: data.destSpaceId }, doc) && !can(user, "edit", { res: "space", id: data.destSpaceId }, doc)) throw new Error("errors.noMove");
	const moved = moveCategoryInDoc(doc, data.categoryId, data.destSpaceId, data.insertAt);
	if (!moved) throw new Error("errors.categoryNotFound");
	appendHistory(doc, user, {
		type: "category.update",
		label: moved.cat.name,
		snapshot: {
			space: snapshotSpace(moved.dest),
			category: snapshotCat(moved.cat)
		}
	});
	return emit(doc, user, moved.dest.id);
}));
export const reorderSpaces = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	spaceId: z.string().optional(),
	order: z.array(z.string().min(1)).min(1).max(40)
})).handler(async ({ data, request }: any) => mutate((doc) => {
	const user = requireCreateSpace(doc, tok(data, request));
	data.order.forEach((id: string, i: number) => {
		const space = doc.spaces.find((t) => t.id === id);
		if (space) space.sortOrder = i + 1;
	});
	doc.spaces.sort((a, b) => a.sortOrder - b.sortOrder);
	return emit(doc, user, data.spaceId);
}));
function eachItem(doc: Doc, fn: (app: PortalCard) => void) {
	for (const space of doc.spaces) for (const cat of space.categories) for (const app of cat.cards) fn(app);
}
function tagColorFromName(name: unknown) {
	return defaultTagHex(String(name));
}
export const manageTags = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	spaceId: z.string().optional(),
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
	return emit(doc, user, data.spaceId);
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
	if (raw.settings && Array.isArray(raw.spaces)) return raw;
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
	if (!user.canAudit) throw new Error("errors.insufficient");
	const before = (doc.history || []).length;
	pruneHistory(doc);
	if ((doc.history || []).length !== before) await writeDocUnlocked(doc);
	const visible = (doc.history || []).filter((ev) => historyVisible(doc, user, ev));
	return {
		exportedAt: new Date().toISOString(),
		rows: publicAudit(visible, 0)
	};
}));
async function resolveExportIcon(value: string, library: CustomIcon[], assetToDataUrl: (ref: string) => Promise<string>) {
	const s = String(value || "");
	if (!s) return s;
	const hit = library.find((ic) => ic.id === s || ic.dataUrl === s || toClientAsset(ic.dataUrl) === s);
	if (hit) return assetToDataUrl(hit.dataUrl);
	if (isAssetRef(s)) return assetToDataUrl(s);
	if (s.startsWith(ASSET_URL)) return assetToDataUrl(ASSET_PREFIX + s.slice(ASSET_URL.length));
	return s;
}
function catalogOfSpace(space: DocSpace) {
	return {
		name: space.name,
		icon: space.icon || "Layers",
		hideLabel: Boolean(space.hideLabel),
		categories: (space.categories || []).map((c) => ({
			name: c.name,
			icon: c.icon || "AppWindow",
			cards: (c.cards || []).map((a) => ({
				kind: a.kind,
				title: a.title,
				description: a.description,
				url: a.url,
				icon: a.icon,
				openIn: a.openIn,
				tags: a.tags,
				colSpan: a.colSpan,
				rowSpan: a.rowSpan,
				check: a.check,
				checkHost: a.checkHost,
				links: a.links,
				linkMenu: a.linkMenu,
				embedBorder: a.embedBorder,
				embedBg: a.embedBg
			}))
		}))
	};
}
export const exportSpace = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	id: z.string().min(1)
})).handler(async ({ data, request }: any) => withLock(async () => {
	const { assetToDataUrl } = await import("./assets");
	const doc = await readDocUnlocked();
	requireEdit(doc, tok(data, request), data.id);
	const space = doc.spaces.find((row) => row.id === data.id);
	if (!space) throw new Error("errors.spaceNotFound");
	const packed = catalogOfSpace(space);
	const library = doc.customIcons || [];
	const refs = new Set(collectIconValues(packed as Record<string, unknown>));
	const customIcons = [];
	for (const ic of library) {
		if (!refs.has(ic.id) && !refs.has(ic.dataUrl) && !refs.has(toClientAsset(ic.dataUrl))) continue;
		customIcons.push({
			id: ic.id,
			name: ic.name,
			dataUrl: await assetToDataUrl(ic.dataUrl)
		});
	}
	packed.icon = await resolveExportIcon(packed.icon, library, assetToDataUrl);
	for (const cat of packed.categories) {
		cat.icon = await resolveExportIcon(cat.icon, library, assetToDataUrl);
		for (const card of cat.cards) {
			if (card.icon) card.icon = await resolveExportIcon(String(card.icon), library, assetToDataUrl);
		}
	}
	return {
		version: SPACE_XFER_VERSION,
		kind: SPACE_XFER_KIND,
		exportedAt: new Date().toISOString(),
		space: packed,
		customIcons
	};
}));
export const importSpace = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	payload: z.unknown(),
	afterId: z.string().optional()
})).handler(async ({ data, request }: any) => mutate((doc) => {
	const user = requireCreateSpace(doc, tok(data, request));
	const parsed = parseSpaceXfer(data.payload);
	if (!parsed) throw new Error("errors.badSpaceFile");
	if (!doc.customIcons) doc.customIcons = [];
	const iconMap = new Map<string, string>();
	for (const ic of parsed.customIcons) {
		const dataUrl = String(ic.dataUrl || "");
		if (!dataUrl.startsWith("data:image/")) continue;
		if (doc.customIcons.length >= MAX_CUSTOM_ICONS) break;
		const id = crypto.randomUUID();
		doc.customIcons.push({
			id,
			name: String(ic.name || "").slice(0, 80),
			dataUrl
		});
		if (ic.id) iconMap.set(String(ic.id), dataUrl);
		iconMap.set(dataUrl, dataUrl);
	}
	function mapIcon(value: unknown) {
		const s = String(value || "");
		return iconMap.get(s) || s;
	}
	const src = parsed.space;
	const spaceId = crypto.randomUUID();
	const name = String(src.name || "").trim().slice(0, 40) || tt(doc, "nav.space");
	const space: DocSpace = {
		id: spaceId,
		name,
		icon: mapIcon(src.icon) || "Layers",
		sortOrder: 0,
		restricted: false,
		viewers: [],
		editors: [],
		hideLabel: Boolean(src.hideLabel),
		categories: (Array.isArray(src.categories) ? src.categories : []).map((c: any, ci: number) => {
			const catId = crypto.randomUUID();
			return {
				id: catId,
				name: String(c?.name || "").trim().slice(0, 60) || tt(doc, "seed.category"),
				icon: mapIcon(c?.icon) || "AppWindow",
				sortOrder: ci + 1,
				restricted: false,
				viewers: [] as string[],
				editors: [] as string[],
				cards: (Array.isArray(c?.cards) ? c.cards : []).map((a: any, ai: number) => normalizeItem({
					...a,
					id: crypto.randomUUID(),
					icon: mapIcon(a?.icon) || a?.icon,
					clicks: 0
				}, catId, ai + 1))
			};
		})
	};
	if (!isOwnerUser(user)) {
		const live = doc.users.find((u) => u.id === user.id);
		if (live) live.grants = mergeGrant(asGrants(live.grants), { res: "space", id: spaceId, allow: ["view", "open", "edit", "create", "delete", "move"] });
	}
	doc.spaces.push(space);
	const ordered = [...doc.spaces].sort((a, b) => a.sortOrder - b.sortOrder);
	const ids = ordered.map((row) => row.id).filter((id) => id !== spaceId);
	const at = data.afterId ? ids.indexOf(data.afterId) : -1;
	ids.splice(at < 0 ? ids.length : at + 1, 0, spaceId);
	ids.forEach((id, i) => {
		const row = doc.spaces.find((s) => s.id === id);
		if (row) row.sortOrder = i + 1;
	});
	appendHistory(doc, user, {
		type: "space.import",
		label: name,
		snapshot: { space: snapshotSpace(space) }
	});
	return emit(doc, user, spaceId);
}));
export const importPortal = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField,
	payload: z.unknown()
})).handler(async ({ data, request }: any) => mutate((doc) => {
	const actor = requireAdmin(doc, tok(data, request));
	const parsed = asStore(unwrapBackup(data.payload));
	if (!parsed || !parsed.spaces.length) throw new Error("errors.badBackup");
	doc.settings = parsed.settings;
	doc.customIcons = parsed.customIcons;
	doc.lastSpaceId = parsed.lastSpaceId;
	doc.clickDays = parsed.clickDays;
	doc.users = parsed.users;
	doc.groups = parsed.groups || [];
	doc.roles = parsed.roles || [];
	doc.spaces = parsed.spaces;
	ensureRoles(doc);
	ensureUsers(doc);
	const nextUser = doc.users.find((u) => u.id === actor.id) || doc.users.find((u) => isOwnerUser(u)) || actor;
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
			found = cardOf(doc, id);
		} catch {
			continue;
		}
		if (!spaceCanSee(found.space, user, doc)) continue;
		const app = found.app;
		if (app.kind !== "app" || app.check === "off") continue;
		if (app.check === "http") {
			const url = safeEmbedHref(cardUrl(app));
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

export type CurationLink = { key: string; label: string; url: string };
export type CurationProbe = { mode: "http" | "icmp"; host?: string };
export type CurationItem = {
	cardId: string;
	spaceId: string;
	categoryId: string;
	title: string;
	spaceName: string;
	categoryName: string;
	icon: string;
	kind: ItemKind;
	testable: boolean;
	links: CurationLink[];
	probe?: CurationProbe;
};
export type CurationScanRef = { cardId: string; key: string; url: string };
export type CurationView = {
	items: CurationItem[];
	queue: CurationScanRef[];
	checks: Record<string, Record<string, CurationCheck>>;
	lastRunAt: number;
};

const CURATION_MAX_LINKS = 400;

function curationLinksOf(app: PortalCard): CurationLink[] {
	const links: CurationLink[] = [];
	const list = Array.isArray(app.links) ? app.links : [];
	for (let i = 0; i < list.length && links.length < 5; i++) {
		const url = safeAppHref(list[i]?.url);
		if (!url) continue;
		links.push({
			key: i === 0 ? "main" : `l${i - 1}`,
			label: String(list[i]?.title || "").slice(0, 40),
			url
		});
	}
	return links;
}

function curationItemsOf(doc: Doc, user: HydratedUser | null): CurationItem[] {
	const items: CurationItem[] = [];
	for (const space of [...doc.spaces].sort((a, b) => a.sortOrder - b.sortOrder)) {
		if (!spaceCanSee(space, user, doc)) continue;
		for (const cat of [...space.categories].sort((a, b) => a.sortOrder - b.sortOrder)) {
			if (!catCanSee(cat, user, doc)) continue;
			for (const app of cat.cards) {
				if ((app.kind || "app") === "note") continue;
				if (!can(user, "view", { res: "card", id: app.id }, doc)) continue;
				const links = curationLinksOf(app);
				const check = asCheck(app.check);
				const probe: CurationProbe | undefined =
					(app.kind || "app") === "app" && check !== "off"
						? { mode: check, host: check === "icmp" ? asCheckHost(app.checkHost) : undefined }
						: undefined;
				items.push({
					cardId: app.id,
					spaceId: space.id,
					categoryId: cat.id,
					title: app.title || tt(doc, "empty.untitled"),
					spaceName: space.name || "",
					categoryName: cat.name || "",
					icon: app.icon || "Link",
					kind: app.kind || "app",
					testable: links.length > 0 || probe?.mode === "icmp",
					links,
					probe
				});
				if (items.length >= 800) return items;
			}
		}
	}
	return items;
}

function curationQueueOf(items: CurationItem[]): CurationScanRef[] {
	const queue: CurationScanRef[] = [];
	for (const item of items) {
		for (const link of item.links) queue.push({ cardId: item.cardId, key: link.key, url: link.url });
		if (item.probe?.mode === "icmp" && item.probe.host)
			queue.push({ cardId: item.cardId, key: "icmp", url: item.probe.host });
	}
	return queue.slice(0, CURATION_MAX_LINKS);
}

function allCardIds(doc: Doc): Set<string> {
	const ids = new Set<string>();
	for (const space of doc.spaces) for (const cat of space.categories) for (const app of cat.cards) ids.add(app.id);
	return ids;
}

export const getCuration = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField
})).handler(async ({ data, request }: any) => withLock(async () => {
	const doc = await readDocUnlocked();
	const user = requireUser(doc, tok(data, request));
	if (!user.canCuration && !isOwnerUser(user)) throw new Error("errors.insufficient");
	const store = await readCurationStore();
	if (pruneCurationChecks(store, allCardIds(doc))) await writeCurationStore(store);
	const items = curationItemsOf(doc, user);
	const visible = new Set(items.map((i) => i.cardId));
	const checks: Record<string, Record<string, CurationCheck>> = {};
	for (const [cardId, links] of Object.entries(store.checks)) {
		if (visible.has(cardId)) checks[cardId] = links;
	}
	return { items, queue: curationQueueOf(items), checks, lastRunAt: store.updatedAt };
}));

export const curationStatus = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField
})).handler(async ({ data, request }: any) => {
	const doc = await readDoc();
	const user = requireUser(doc, tok(data, request));
	if (!user.canCuration && !isOwnerUser(user)) throw new Error("errors.insufficient");
	return curationJobSnapshot();
});

export const curationStop = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField
})).handler(async ({ data, request }: any) => {
	const doc = await readDoc();
	const user = requireUser(doc, tok(data, request));
	if (!user.canCuration && !isOwnerUser(user)) throw new Error("errors.insufficient");
	return { stopped: curationJobStop() };
});

export const curationStart = createServerFn({ method: "POST" }).validator(z.object({
	token: tokenField
})).handler(async ({ data, request }: any) => withLock(async () => {
	if (!curationScanAllowed(request)) throw new Error("errors.tooManyProbes");
	const doc = await readDocUnlocked();
	const user = requireUser(doc, tok(data, request));
	if (!user.canCuration && !isOwnerUser(user)) throw new Error("errors.insufficient");
	if (curationJobRunning()) return { started: false, total: 0 };
	const items = curationItemsOf(doc, user);
	const byCard = new Map(items.map((item) => [item.cardId, item]));
	const targets: CurationJobTarget[] = [];
	for (const ref of curationQueueOf(items)) {
		const item = byCard.get(ref.cardId);
		if (!item) continue;
		if (ref.key === "icmp") {
			targets.push({
				cardId: ref.cardId,
				key: "icmp",
				url: ref.url,
				label: tt(doc, "curation.probeIcmp"),
				title: item.title,
				mode: "icmp",
				host: ref.url
			});
			continue;
		}
		const link = item.links.find((row) => row.key === ref.key);
		if (link) targets.push({ cardId: ref.cardId, key: ref.key, url: link.url, label: link.label, title: item.title, mode: "http" });
	}
	void startCurationJob({
		targets,
		tlsVerify: Boolean(doc.settings.probeTlsVerify),
		known: [...allCardIds(doc)],
		locale: doc.settings.locale
	}).catch(() => void 0);
	return { started: true, total: targets.length };
}));

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
	const url = safeEmbedHref(ctx.data.url);
	if (!url) throw new Error("errors.httpRequired");
	return probeHttp("preview", url, tlsVerify);
});

export const grabSiteFavicon = createServerFn({ method: "POST" }).validator(z.object({
	token: z.string().min(1),
	url: z.string().max(2000)
})).handler(async (ctx) => {
	await requireEditorSession(tok(ctx.data, (ctx as any).request));
	const href = safeEmbedHref(ctx.data.url);
	if (!href) throw new Error("errors.httpRequired");
	const { fetchSiteFavicon } = await import("./favicon-runtime");
	return fetchSiteFavicon(href);
});
