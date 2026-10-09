import { CSS_MAX, sanitizeThemeCss } from "../theme-css";
import { GROUP_FILTER_MAX } from "../oidc-groups";
import { normalizeScope, OIDC_SCOPE_MAX } from "../oidc-scope";
import { PASSWORD_MAX } from "../security";
import { adGroupKey, asDirectories, asLoginOrder, directoryReady, pickDirectory, syncLegacyLdap } from "../ldap-runtime";
import { pruneHistory, appendHistory, publicAudit, publicTrash, emptyTrash } from "../history";
import { attachDocRev } from "../doc-rev";
import { can, defaultRoles, isOwnerUser } from "../acl";
import { cleanProxyHost, cleanProxyPort, setOutboundProxy } from "../outbound-proxy";
import { parseCaPem } from "../tls-ca";
import { createServerFn } from "@tanstack/react-start";
import { envLdapBindPassword, envOidcClientSecret, isDevRuntime, trustProxy } from "../security-runtime";
import { newId } from "../id";
import { randomBytes } from "node:crypto";
import { withLocale, asTimeFormat, asTimeZone, DATE_FORMATS, NUMBER_FORMATS } from "../i18n";
import { z } from "zod";
import { Doc, OIDC_PENDING_MS, applyAdMembership, applyOidcGroups, asCheck, asIdList, authExternalId, blankSpaces, bumpClickDay, cardOf, clickStatsFor, clientKey, defaultSettings, directoryPayload, emit, ensureGroups, ensureUsers, envPassword, envUser, findUserForAuth, hashPassword, historyVisible, inLinkedAdGroups, inLinkedOidcGroups, issueToken, loadPortal, loginBlocked, loginFail, loginOk, mutate, oidcPending, pruneUnusedTags, readDoc, readDocUnlocked, requireAccountManager, requireAdmin, requireStrongPassword, requireUser, setLiveDoc, restoreHistoryItem, scheduleClickFlush, sessionFor, sessions, spaceCanSee, tok, tokenField, tt, upsertAdGroups, verifyPassword, withLock, writeDocUnlocked } from "./core";

export const getPortal = createServerFn({ method: "GET" }).validator(z.object({
	spaceId: z.string().optional(),
	token: z.string().optional()
})).handler(async ({ data, request }: any) => loadPortal(data.spaceId, tok(data, request)));
export const listHistory = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
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
export const restoreHistory = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
	token: tokenField,
	id: z.string().min(1),
	scope: z.enum(["card", "category", "space"]),
	targetId: z.string().min(1)
})).handler(async ({ data, request }: any) => mutate(data, request, (doc) => {
	const user = requireUser(doc, tok(data, request));
	if (!user.canRestore) throw new Error("errors.insufficient");
	const ev = (doc.history || []).find((row) => row.id === data.id);
	if (!ev || !historyVisible(doc, user, ev)) throw new Error("errors.trashMissing");
	const spaceId = restoreHistoryItem(doc, user, data.id, data.scope, data.targetId);
	pruneUnusedTags(doc);
	return emit(doc, user, spaceId);
}));
export const purgeTrash = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
	token: tokenField
})).handler(async ({ data, request }: any) => mutate(data, request, async (doc) => {
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
export const rememberSpace = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
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
export const recordClick = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
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
	setLiveDoc(doc);
	scheduleClickFlush();
	return {
		id: data.id,
		clicks: found.app.clicks,
		clickStats: clickStatsFor(doc, user)
	};
}));
export const resetClicks = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
	token: tokenField,
	spaceId: z.string().optional()
})).handler(async ({ data, request }: any) => mutate(data, request, (doc) => {
	const user = requireAdmin(doc, tok(data, request));
	for (const space of doc.spaces) for (const cat of space.categories) for (const app of cat.cards) if (app.kind === "app") app.clicks = 0;
	doc.clickDays = {};
	return emit(doc, user, data.spaceId);
}));
export const resetProbes = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
	token: tokenField,
	spaceId: z.string().optional()
})).handler(async ({ data, request }: any) => mutate(data, request, (doc) => {
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
export const resetPortal = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({ token: tokenField })).handler(async ({ data, request }: any) => mutate(data, request, async (doc) => {
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
export const updateSettings = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
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
	headerGlass: z.boolean().optional(),
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
	probeCaPem: z.string().max(2e4).optional(),
	probeAuthOnly: z.boolean().optional(),
	requireLogin: z.boolean().optional(),
	sessionHttpOnly: z.boolean().optional(),
	devAdminNoPassword: z.boolean().optional(),
	proxyAuthEnabled: z.boolean().optional(),
	proxyAuthHeader: z.string().max(64).optional(),
	outboundProxyEnabled: z.boolean().optional(),
	outboundProxyHost: z.string().max(253).optional(),
	outboundProxyPort: z.number().int().min(1).max(65535).optional(),
	outboundProxyUsername: z.string().max(120).optional(),
	outboundProxyPassword: z.string().max(200).optional(),
	locale: z.enum(["en", "fr"]).optional(),
	dateFormat: z.enum(["ymd", "yyyy", "dmy", "mdy", "iso"]).optional(),
	timeFormat: z.enum(["24h", "12h"]).optional(),
	timezone: z.string().max(80).optional(),
	numberFormat: z.enum(["auto", "space-comma", "comma-dot", "dot-comma", "apostrophe-comma"]).optional(),
	spaceId: z.string().optional()
})).handler(async ({ data, request }: any) => mutate(data, request, (doc) => {
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
		headerGlass: typeof data.headerGlass === "boolean" ? data.headerGlass : doc.settings.headerGlass !== false,
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
		probeCaPem: typeof data.probeCaPem === "string" ? parseCaPem(data.probeCaPem) : String(doc.settings.probeCaPem || ""),
		probeAuthOnly: typeof data.probeAuthOnly === "boolean" ? data.probeAuthOnly : Boolean(doc.settings.probeAuthOnly),
		requireLogin: typeof data.requireLogin === "boolean" ? data.requireLogin : Boolean(doc.settings.requireLogin),
		sessionHttpOnly: typeof data.sessionHttpOnly === "boolean" ? data.sessionHttpOnly : Boolean(doc.settings.sessionHttpOnly),
		devAdminNoPassword: typeof data.devAdminNoPassword === "boolean" ? data.devAdminNoPassword : Boolean(doc.settings.devAdminNoPassword),
		proxyAuthEnabled: typeof data.proxyAuthEnabled === "boolean" ? data.proxyAuthEnabled : Boolean(doc.settings.proxyAuthEnabled),
		proxyAuthHeader: /^[A-Za-z0-9-]+$/.test(String(data.proxyAuthHeader || "").trim())
			? String(data.proxyAuthHeader).trim()
			: doc.settings.proxyAuthHeader || "X-Remote-User",
		outboundProxyEnabled: typeof data.outboundProxyEnabled === "boolean" ? data.outboundProxyEnabled : Boolean(doc.settings.outboundProxyEnabled),
		outboundProxyHost: typeof data.outboundProxyHost === "string" ? cleanProxyHost(data.outboundProxyHost) : cleanProxyHost(doc.settings.outboundProxyHost),
		outboundProxyPort: typeof data.outboundProxyPort === "number" ? cleanProxyPort(data.outboundProxyPort) : cleanProxyPort(doc.settings.outboundProxyPort),
		outboundProxyUsername: typeof data.outboundProxyUsername === "string" ? data.outboundProxyUsername.trim().slice(0, 120) : String(doc.settings.outboundProxyUsername || ""),
		outboundProxyPassword: (() => {
			const next = typeof data.outboundProxyPassword === "string" ? data.outboundProxyPassword : "";
			if (!next || next === "********") return String(doc.settings.outboundProxyPassword || "");
			return next.slice(0, 200);
		})(),
		dateFormat: DATE_FORMATS.includes(data.dateFormat) ? data.dateFormat : DATE_FORMATS.includes(doc.settings.dateFormat) ? doc.settings.dateFormat : "ymd",
		timeFormat: data.timeFormat === "12h" || data.timeFormat === "24h" ? data.timeFormat : asTimeFormat(doc.settings.timeFormat),
		timezone: typeof data.timezone === "string" ? asTimeZone(data.timezone) : asTimeZone(doc.settings.timezone),
		locale: data.locale === "fr" || data.locale === "en" ? data.locale : doc.settings.locale === "fr" ? "fr" : "en",
		numberFormat: NUMBER_FORMATS.includes(data.numberFormat) ? data.numberFormat : NUMBER_FORMATS.includes(doc.settings.numberFormat as import("../i18n").NumberFormat) ? doc.settings.numberFormat : "auto"
	};
	setOutboundProxy({
		enabled: Boolean(doc.settings.outboundProxyEnabled),
		host: doc.settings.outboundProxyHost,
		port: doc.settings.outboundProxyPort,
		username: doc.settings.outboundProxyUsername,
		password: doc.settings.outboundProxyPassword,
	});
	pruneUnusedTags(doc);
	appendHistory(doc, user, {
		type: "settings.update",
		label: tt(doc, "audit.item.settings")
	});
	return emit(doc, user, data.spaceId);
}));
export const updateThemeCss = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
	token: tokenField,
	cssLight: z.string().max(CSS_MAX),
	cssDark: z.string().max(CSS_MAX),
	spaceId: z.string().optional()
})).handler(async ({ data, request }: any) => mutate(data, request, (doc) => {
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
export const unlockEdit = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
	username: z.string().max(80).optional().default(""),
	password: z.string().max(PASSWORD_MAX).optional().default(""),
	domain: z.string().min(1).max(80).optional()
})).handler(async (ctx) => {
	const data = ctx.data;
	const { ldapAuthenticate, ldapLoginName } = await import("../ldap-runtime");
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
		return mutate(data, (ctx as any).request, async (doc) => {
			ensureUsers(doc);
			ensureGroups(doc);
			const extId = authExternalId("ad", dir.id, username);
			let user = findUserForAuth(doc.users, username, "ad", extId);
			if (!user) {
				const mapped = inLinkedAdGroups(doc, dir.id, auth?.memberOf);
				if (!dir.autoCreate && !mapped) {
					loginFail(key);
					throw new Error("errors.ldapUnknownUser");
				}
				user = {
					id: newId(),
					username,
					passHash: await hashPassword(randomBytes(24).toString("hex")),
					role: mapped ? "" : "lecteur",
					roleIds: mapped ? [] : ["lecteur"],
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
	return mutate(data, (ctx as any).request, async (doc) => {
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
export const updateOidcSettings = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
	token: tokenField,
	oidcEnabled: z.boolean(),
	oidcIssuer: z.string().max(300),
	oidcClientId: z.string().max(120),
	oidcClientSecret: z.string().max(200).optional(),
	oidcScope: z.string().max(OIDC_SCOPE_MAX).optional(),
	oidcGroupFilter: z.string().max(GROUP_FILTER_MAX).optional(),
	oidcLabel: z.string().max(40).optional(),
	oidcAutoCreate: z.boolean().optional(),
	oidcAutoRedirect: z.boolean().optional(),
	spaceId: z.string().optional()
})).handler(async ({ data, request }: any) => mutate(data, request, async (doc) => {
	const user = requireAdmin(doc, tok(data, request));
	const issuer = data.oidcIssuer.trim();
	const clientId = data.oidcClientId.trim();
	if (data.oidcEnabled) {
		const { normalizeIssuer } = await import("../oidc-runtime");
		normalizeIssuer(issuer);
		if (!clientId) throw new Error("errors.oidcClientId");
	}
	const fromEnv = envOidcClientSecret();
	let secret = fromEnv || doc.settings.oidcClientSecret || "";
	if (!fromEnv && typeof data.oidcClientSecret === "string" && data.oidcClientSecret && data.oidcClientSecret !== "********") {
		secret = data.oidcClientSecret.slice(0, 200);
	}
	doc.settings = {
		...doc.settings,
		oidcEnabled: Boolean(data.oidcEnabled),
		oidcIssuer: issuer.slice(0, 300),
		oidcClientId: clientId.slice(0, 120),
		oidcClientSecret: fromEnv ? "" : secret,
		oidcScope: normalizeScope(typeof data.oidcScope === "string" ? data.oidcScope : doc.settings.oidcScope),
		oidcGroupFilter: String(typeof data.oidcGroupFilter === "string" ? data.oidcGroupFilter : doc.settings.oidcGroupFilter || "").trim().slice(0, GROUP_FILTER_MAX),
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
export const updateLdapSettings = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
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
})).handler(async ({ data, request }: any) => mutate(data, request, async (doc) => {
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
		const bindFromEnv = envLdapBindPassword(row.id);
		let bindPassword = bindFromEnv ? "" : old?.bindPassword || "";
		if (!bindFromEnv && typeof row.bindPassword === "string" && row.bindPassword && row.bindPassword !== "********") {
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
export const searchLdapGroups = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
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
	const { ldapSearchGroups } = await import("../ldap-runtime");
	const groups = await ldapSearchGroups(dir, data.query);
	return { groups };
});
function applyAdGroupMirror(doc: Doc, pairs: { groupId: string; uids: string[] }[]) {
	ensureGroups(doc);
	for (const { groupId, uids } of pairs) {
		const g = doc.groups.find((row) => row.id === groupId);
		if (!g || g.source !== "ad") continue;
		const wanted = new Set(uids);
		g.members = doc.users
			.filter((u) => u.id !== "admin" && u.source === "ad" && wanted.has(String(u.username || "").toLowerCase()))
			.map((u) => u.id);
		const ids = new Set(g.members);
		for (const u of doc.users) {
			u.groupIds = asIdList(u.groupIds);
			if (ids.has(u.id)) {
				if (!u.groupIds.includes(g.id)) u.groupIds.push(g.id);
			} else {
				u.groupIds = u.groupIds.filter((id) => id !== g.id);
			}
		}
	}
}
export const linkLdapGroups = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
	token: tokenField,
	directoryId: z.string().min(1).max(80),
	groups: z.array(z.object({
		dn: z.string().min(1).max(400),
		name: z.string().min(1).max(60)
	})).min(1).max(20)
})).handler(async ({ data, request }: any) => {
	const snap = await readDoc();
	const pre = requireAccountManager(snap, tok(data, request));
	if (!isOwnerUser(pre) && !pre.canManageGroups) throw new Error("errors.insufficient");
	const dir = asDirectories(snap.settings).find((d) => d.id === data.directoryId);
	if (!dir || !directoryReady(dir)) throw new Error("errors.ldapOff");
	const listed = data.groups.map((g: any) => ({
		dn: g.dn,
		name: g.name,
		key: adGroupKey(dir.id, g.dn)
	}));
	const { ldapGroupMembers } = await import("../ldap-runtime");
	const membersByName = new Map<string, string[]>();
	for (const row of listed) {
		try {
			membersByName.set(row.name, (await ldapGroupMembers(dir, row.name)).map((u) => u.toLowerCase()));
		} catch {
			// annuaire injoignable : le miroir se remplira à la connexion
		}
	}
	return mutate(data, request, (doc) => {
		const actor = requireAccountManager(doc, tok(data, request));
		if (!isOwnerUser(actor) && !actor.canManageGroups) throw new Error("errors.insufficient");
		upsertAdGroups(doc, dir, listed);
		const pairs = listed
			.map((row: any) => ({
				groupId: doc.groups.find((g) => g.source === "ad" && g.externalId === row.key)?.id || "",
				uids: membersByName.get(row.name) || [],
			}))
			.filter((p: any) => p.groupId);
		applyAdGroupMirror(doc, pairs);
		appendHistory(doc, actor, {
			type: "group.create",
			label: listed.map((g: any) => g.name).join(", ")
		});
		return directoryPayload(doc, actor);
	});
});
export const syncLdapGroup = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
	token: tokenField,
	groupId: z.string().min(1)
})).handler(async ({ data, request }: any) => {
	const snap = await readDoc();
	const pre = requireAccountManager(snap, tok(data, request));
	if (!isOwnerUser(pre) && !pre.canManageGroups) throw new Error("errors.insufficient");
	const target = snap.groups.find((g) => g.id === data.groupId);
	if (!target || target.source !== "ad") throw new Error("errors.userNotFound");
	const dirId = String(target.externalId || "").split(":")[0] || "";
	const dir = asDirectories(snap.settings).find((d) => d.id === dirId);
	if (!dir || !directoryReady(dir)) throw new Error("errors.ldapOff");
	const { ldapGroupMembers } = await import("../ldap-runtime");
	let uids: string[] = [];
	try {
		uids = (await ldapGroupMembers(dir, target.name)).map((u) => u.toLowerCase());
	} catch {
		throw new Error("errors.ldapUnreachable");
	}
	return mutate(data, request, (doc) => {
		const actor = requireAccountManager(doc, tok(data, request));
		if (!isOwnerUser(actor) && !actor.canManageGroups) throw new Error("errors.insufficient");
		applyAdGroupMirror(doc, [{ groupId: target.id, uids }]);
		appendHistory(doc, actor, {
			type: "group.update",
			label: target.name
		});
		return directoryPayload(doc, actor);
	});
});
export const updateLoginOrder = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
	token: tokenField,
	loginOrder: z.array(z.string().min(1).max(80)).min(1).max(16),
	spaceId: z.string().optional()
})).handler(async ({ data, request }: any) => mutate(data, request, (doc) => {
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
export const startOidc = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({})).handler(async (ctx) => {
	const doc = await readDoc();
	const s = doc.settings;
	if (!s.oidcEnabled || !s.oidcIssuer || !s.oidcClientId) throw new Error("errors.oidcOff");
	const key = clientKey("oidc", (ctx as any).request);
	if (loginBlocked(key)) throw new Error("errors.tooManyTries");
	const { discoverOidc, buildAuthorizeUrl, randomUrlToken, s256, publicOrigin } = await import("../oidc-runtime");
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
			challenge: s256(verifier),
			scope: s.oidcScope
		})
	};
});
export const finishOidc = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
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
	const { discoverOidc, exchangeCode, fetchUserInfo, usernameFromClaims, verifyIdToken } = await import("../oidc-runtime");
	let username: string;
	let groups: string[] = [];
	let issuer: string;
	try {
		const disc = await discoverOidc(s.oidcIssuer);
		const tokens = await exchangeCode(disc, {
			clientId: s.oidcClientId,
			clientSecret: envOidcClientSecret() || s.oidcClientSecret || "",
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
	return mutate(ctx.data, (ctx as any).request, async (doc) => {
		const live = doc.settings;
		if (!live.oidcEnabled || !live.oidcIssuer || !live.oidcClientId) throw new Error("errors.oidcOff");
		ensureUsers(doc);
		const extId = authExternalId("oidc", issuer, username);
		let user = findUserForAuth(doc.users, username, "oidc", extId);
		if (!user) {
			const mapped = inLinkedOidcGroups(doc, issuer, groups);
			if (!live.oidcAutoCreate && !mapped) {
				loginFail(key);
				throw new Error("errors.oidcUnknownUser");
			}
			user = {
				id: newId(),
				username,
				passHash: await hashPassword(randomBytes(24).toString("hex")),
				role: mapped && !live.oidcAutoCreate ? "" : "lecteur",
				roleIds: mapped && !live.oidcAutoCreate ? [] : ["lecteur"],
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
export const proxyLogin = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({})).handler(async (ctx) => {
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
	const { ldapUserGroups } = await import("../ldap-runtime");
	for (const dir of dirs) {
		try {
			memberOf = await ldapUserGroups(dir, username);
			directoryId = dir.id;
			break;
		} catch {
			// try next directory
		}
	}
	return mutate(ctx.data, (ctx as any).request, async (doc) => {
		ensureUsers(doc);
		const extId = authExternalId("proxy", username);
		let user = findUserForAuth(doc.users, username, "proxy", extId);
		if (!user) {
			const dir = directoryId ? asDirectories(doc.settings).find((d) => d.id === directoryId) : null;
			const mapped = directoryId ? inLinkedAdGroups(doc, directoryId, memberOf) : false;
			const allowCreate = Boolean(dir?.autoCreate || doc.settings.ldapAutoCreate);
			if (!allowCreate && !mapped) {
				loginFail(key);
				throw new Error("errors.proxyUnknownUser");
			}
			user = {
				id: newId(),
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
