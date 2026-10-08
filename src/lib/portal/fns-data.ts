import { ASSET_PREFIX, ASSET_URL, MAX_CUSTOM_ICONS, isAssetRef, toClientAsset } from "../assets-url";
import { SPACE_XFER_KIND, SPACE_XFER_VERSION, collectIconValues, parseSpaceXfer } from "../space-xfer";
import { asHistory, pruneHistory, appendHistory, snapshotSpace, publicAudit } from "../history";
import { asGrants, can, isOwnerUser, mergeGrant, type User } from "../acl";
import { attachDocRev } from "../doc-rev";
import { createServerFn } from "@tanstack/react-start";
import { curationJobRunning, curationJobSnapshot, curationJobStop, curationScanAllowed, pruneCurationChecks, readCurationStore, startCurationJob, writeCurationStore, type CurationCheck, type CurationJobTarget } from "../curation-runtime";
import { newId } from "../id";
import { safeAppHref, safeEmbedHref } from "../safe-href";
import { z } from "zod";
import { parseNetscapeBookmarks } from "../bookmarks-html";
import { CustomIcon, Doc, DocSpace, HydratedUser, ItemKind, PortalCard, asCheck, asCheckHost, asStore, cardOf, cardUrl, catCanSee, emit, ensureRoles, ensureUsers, historyVisible, mutate, normalizeItem, readDoc, readDocUnlocked, requireAdmin, requireCreateSpace, requireEdit, requireUser, spaceCanSee, toDisk, tok, unwrapBackup, tokenField, tt, withLock, writeDocUnlocked } from "./core";

export const exportPortal = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({ token: tokenField })).handler(async ({ data, request }: any) => withLock(async () => {
	const { assetToDataUrl } = await import("../assets");
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
export const exportAudit = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({ token: tokenField })).handler(async ({ data, request }: any) => withLock(async () => {
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
export const exportSpace = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
	token: tokenField,
	id: z.string().min(1)
})).handler(async ({ data, request }: any) => withLock(async () => {
	const { assetToDataUrl } = await import("../assets");
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
export const importSpace = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
	token: tokenField,
	payload: z.unknown(),
	afterId: z.string().optional()
})).handler(async ({ data, request }: any) => mutate(data, request, (doc) => {
	const user = requireCreateSpace(doc, tok(data, request));
	const parsed = parseSpaceXfer(data.payload);
	if (!parsed) throw new Error("errors.badSpaceFile");
	if (!doc.customIcons) doc.customIcons = [];
	const iconMap = new Map<string, string>();
	for (const ic of parsed.customIcons) {
		const dataUrl = String(ic.dataUrl || "");
		if (!dataUrl.startsWith("data:image/")) continue;
		if (doc.customIcons.length >= MAX_CUSTOM_ICONS) break;
		const id = newId();
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
	const spaceId = newId();
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
			const catId = newId();
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
					id: newId(),
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
export const importBookmarks = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
	token: tokenField,
	html: z.string().min(20).max(2e6)
})).handler(async ({ data, request }: any) => mutate(data, request, (doc) => {
	const user = requireCreateSpace(doc, tok(data, request));
	const parsed = parseNetscapeBookmarks(data.html);
	if (!parsed) throw new Error("errors.badBackup");
	const spaceId = newId();
	const name = parsed.spaceName.slice(0, 40) || tt(doc, "nav.space");
	const space: DocSpace = {
		id: spaceId,
		name,
		icon: "Layers",
		sortOrder: 0,
		restricted: false,
		viewers: [],
		editors: [],
		hideLabel: false,
		categories: parsed.categories.map((c, ci) => {
			const catId = newId();
			return {
				id: catId,
				name: c.name.slice(0, 60) || tt(doc, "seed.category"),
				icon: "AppWindow",
				sortOrder: ci + 1,
				restricted: false,
				viewers: [] as string[],
				editors: [] as string[],
				cards: c.cards.map((card, ai) => normalizeItem({
					kind: "app",
					title: card.title,
					url: card.url,
					icon: "Link",
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
	ids.push(spaceId);
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
export const importPortal = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
	token: tokenField,
	payload: z.unknown()
})).handler(async ({ data, request }: any) => mutate(data, request, (doc) => {
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

function curationItemsOf(doc: Doc, user: HydratedUser | User | null): CurationItem[] {
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

export const getCuration = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
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

export const curationStatus = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
	token: tokenField
})).handler(async ({ data, request }: any) => {
	const doc = await readDoc();
	const user = requireUser(doc, tok(data, request));
	if (!user.canCuration && !isOwnerUser(user)) throw new Error("errors.insufficient");
	return curationJobSnapshot();
});

export const curationStop = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
	token: tokenField
})).handler(async ({ data, request }: any) => {
	const doc = await readDoc();
	const user = requireUser(doc, tok(data, request));
	if (!user.canCuration && !isOwnerUser(user)) throw new Error("errors.insufficient");
	return { stopped: curationJobStop() };
});

export async function launchCurationScan(doc: Doc, user: HydratedUser | User | null) {
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
	const webhook = String(doc.settings.curationWebhook || process.env.PORTAL_CURATION_WEBHOOK || "").trim();
	void startCurationJob({
		targets,
		tlsVerify: Boolean(doc.settings.probeTlsVerify),
		known: [...allCardIds(doc)],
		locale: doc.settings.locale,
		webhook,
	}).catch(() => void 0);
	return { started: true, total: targets.length };
}

export const curationStart = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
	token: tokenField
})).handler(async ({ data, request }: any) => withLock(async () => {
	if (!curationScanAllowed(request)) throw new Error("errors.tooManyProbes");
	const doc = await readDocUnlocked();
	const user = requireUser(doc, tok(data, request));
	if (!user.canCuration && !isOwnerUser(user)) throw new Error("errors.insufficient");
	return launchCurationScan(doc, user);
}));

export const updateCurationWebhook = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
	token: tokenField,
	url: z.string().max(2000)
})).handler(async ({ data, request }: any) => mutate(data, request, (doc) => {
	const user = requireUser(doc, tok(data, request));
	if (!user.canCuration && !isOwnerUser(user)) throw new Error("errors.insufficient");
	const raw = String(data.url || "").trim();
	if (raw && !/^https?:\/\//i.test(raw)) throw new Error("errors.httpRequired");
	doc.settings.curationWebhook = raw.slice(0, 2000);
	return emit(doc, user);
}));

export const probeTargets = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
	token: z.string().optional(),
	ids: z.array(z.string().min(1).max(80)).min(1).max(8)
})).handler(async (ctx) => {
	const { probeAllowed, probeOne } = await import("../probe-runtime");
	if (!probeAllowed((ctx as any).request)) return [];
	const doc = await readDoc();
	const token = tok(ctx.data, (ctx as any).request);
	if (doc.settings.probeAuthOnly || doc.settings.requireLogin) {
		try {
			requireUser(doc, token);
		} catch {
			return [];
		}
	}
	const targets = await resolveProbeByIds(token, ctx.data.ids);
	return Promise.all(targets.map((target) => probeOne(target as import("../probe-runtime").ProbeTarget, Boolean(doc.settings.probeTlsVerify))));
});

export const probePreview = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
	token: z.string().min(1),
	mode: z.enum(["http", "icmp"]),
	url: z.string().max(2000).optional(),
	host: z.string().max(253).optional()
})).handler(async (ctx) => {
	const { probeAllowed, probeIcmp, probeHttp } = await import("../probe-runtime");
	await requireEditorSession(tok(ctx.data, (ctx as any).request));
	if (!probeAllowed((ctx as any).request)) throw new Error("errors.tooManyProbes");
	const doc = await readDoc();
	const tlsVerify = Boolean(doc.settings.probeTlsVerify);
	if (ctx.data.mode === "icmp") return probeIcmp("preview", ctx.data.host || "");
	const url = safeEmbedHref(ctx.data.url);
	if (!url) throw new Error("errors.httpRequired");
	return probeHttp("preview", url, tlsVerify);
});

export const grabSiteFavicon = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
	token: z.string().min(1),
	url: z.string().max(2000)
})).handler(async (ctx) => {
	await requireEditorSession(tok(ctx.data, (ctx as any).request));
	const href = safeEmbedHref(ctx.data.url);
	if (!href) throw new Error("errors.httpRequired");
	const { fetchSiteFavicon } = await import("../favicon-runtime");
	return fetchSiteFavicon(href);
});
