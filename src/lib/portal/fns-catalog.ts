import { MAX_CUSTOM_ICONS, toClientAsset } from "../assets-url";
import { appendHistory, snapshotSpace, snapshotCat, snapshotCard } from "../history";
import { asGrants, can, categoryMoveImpact, isOwnerUser, mergeGrant, moveCategoryInDoc } from "../acl";
import { attachDocRev } from "../doc-rev";
import { createServerFn } from "@tanstack/react-start";
import { defaultTagHex, remapTagHex } from "../tag-colors";
import { newId } from "../id";
import { safeAppHref, safeEmbedHref } from "../safe-href";

import { z } from "zod";
import { asTagColors, assignTagColors, canSetNodeAcl, eachItem, cardOf, categoryOf, emit, mutate, normalizeCatAccess, normalizeItem, pruneUnusedTags, readDocUnlocked, requireAdmin, requireCreateSpace, requireEdit, requireUser, sortCardsAlpha, spaceOfCategory, tok, tokenField, tt, withLock } from "./core";

export const createSpace = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
	token: tokenField,
	name: z.string().min(1).max(40),
	icon: z.string().min(1).max(4e5),
	restricted: z.boolean().optional(),
	viewers: z.array(z.string()).optional(),
	editors: z.array(z.string()).optional(),
	hideLabel: z.boolean().optional()
})).handler(async ({ data, request }: any) => mutate(data, request, (doc) => {
	const user = requireCreateSpace(doc, tok(data, request));
	const id = newId();
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
export const duplicateSpace = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
	token: tokenField,
	id: z.string().min(1)
})).handler(async ({ data, request }: any) => mutate(data, request, (doc) => {
	const user = requireCreateSpace(doc, tok(data, request));
	const src = doc.spaces.find((t) => t.id === data.id);
	if (!src) throw new Error("errors.spaceNotFound");
	requireEdit(doc, tok(data, request), src.id);
	const spaceId = newId();
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
			const catId = newId();
			return {
				id: catId,
				name: c.name,
				icon: c.icon || "AppWindow",
				sortOrder: Number(c.sortOrder ?? ci + 1),
				...normalizeCatAccess(c),
				cards: (c.cards || []).map((a, ai) => normalizeItem({
					...a,
					id: newId(),
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
export const updateSpace = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
	token: tokenField,
	id: z.string().min(1),
	name: z.string().min(1).max(40),
	icon: z.string().min(1).max(4e5),
	restricted: z.boolean().optional(),
	viewers: z.array(z.string()).optional(),
	editors: z.array(z.string()).optional(),
	hideLabel: z.boolean().optional()
})).handler(async ({ data, request }: any) => mutate(data, request, (doc) => {
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
export const updateFavsOptions = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
	token: tokenField,
	hideLabel: z.boolean(),
	spaceId: z.string().optional()
})).handler(async ({ data, request }: any) => mutate(data, request, (doc) => {
	const user = requireEdit(doc, tok(data, request));
	doc.settings.favsHideLabel = data.hideLabel;
	return emit(doc, user, data.spaceId);
}));
export const deleteSpace = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
	token: tokenField,
	id: z.string().min(1)
})).handler(async ({ data, request }: any) => mutate(data, request, (doc) => {
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
export const createCategory = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
	token: tokenField,
	spaceId: z.string().min(1),
	name: z.string().min(1).max(60),
	icon: z.string().min(1).max(4e5),
	restricted: z.boolean().optional(),
	viewers: z.array(z.string()).optional(),
	editors: z.array(z.string()).optional()
})).handler(async ({ data, request }: any) => mutate(data, request, (doc) => {
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
		id: newId(),
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
export const updateCategory = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
	token: tokenField,
	id: z.string().min(1),
	name: z.string().min(1).max(60),
	icon: z.string().min(1).max(4e5),
	restricted: z.boolean().optional(),
	viewers: z.array(z.string()).optional(),
	editors: z.array(z.string()).optional()
})).handler(async ({ data, request }: any) => mutate(data, request, (doc) => {
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
export const deleteCategory = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
	token: tokenField,
	id: z.string().min(1)
})).handler(async ({ data, request }: any) => mutate(data, request, (doc) => {
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
export const createCard = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
	token: tokenField,
	...itemPayload
})).handler(async ({ data, request }: any) => mutate(data, request, (doc) => {
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
export const updateCard = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
	token: tokenField,
	id: z.string().min(1),
	...itemPayload
})).handler(async ({ data, request }: any) => mutate(data, request, (doc) => {
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
export const deleteCard = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
	token: tokenField,
	id: z.string().min(1)
})).handler(async ({ data, request }: any) => mutate(data, request, (doc) => {
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
export const reorderCards = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
	token: tokenField,
	spaceId: z.string().min(1),
	placements: z.array(z.object({
		id: z.string().min(1),
		categoryId: z.string().min(1),
		sortOrder: z.number().int().min(0).max(9999)
	})).min(1).max(400)
})).handler(async ({ data, request }: any) => mutate(data, request, (doc) => {
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
export const arrangeCategory = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
	token: tokenField,
	categoryId: z.string().min(1),
	sort: z.enum(["alpha", "za"]).optional(),
	resetSpans: z.boolean().optional()
})).handler(async ({ data, request }: any) => mutate(data, request, (doc) => {
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
export const moveCard = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
	token: tokenField,
	id: z.string().min(1),
	destSpaceId: z.string().min(1),
	destCategoryId: z.string().min(1),
	sortOrder: z.number().int().min(0).max(9999)
})).handler(async ({ data, request }: any) => mutate(data, request, (doc) => {
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
export const reorderCategories = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
	token: tokenField,
	spaceId: z.string().min(1),
	order: z.array(z.string().min(1)).min(1).max(80)
})).handler(async ({ data, request }: any) => mutate(data, request, (doc) => {
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
export const previewMoveCategory = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
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
export const moveCategory = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
	token: tokenField,
	categoryId: z.string().min(1),
	destSpaceId: z.string().min(1),
	insertAt: z.number().int().min(0).max(80).optional()
})).handler(async ({ data, request }: any) => mutate(data, request, (doc) => {
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
export const reorderSpaces = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
	token: tokenField,
	spaceId: z.string().optional(),
	order: z.array(z.string().min(1)).min(1).max(40)
})).handler(async ({ data, request }: any) => mutate(data, request, (doc) => {
	const user = requireCreateSpace(doc, tok(data, request));
	data.order.forEach((id: string, i: number) => {
		const space = doc.spaces.find((t) => t.id === id);
		if (space) space.sortOrder = i + 1;
	});
	doc.spaces.sort((a, b) => a.sortOrder - b.sortOrder);
	return emit(doc, user, data.spaceId);
}));
function tagColorFromName(name: unknown) {
	return defaultTagHex(String(name));
}
export const manageTags = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
	token: tokenField,
	spaceId: z.string().optional(),
	create: z.array(z.string().min(1).max(32)).max(40).optional(),
	rename: z.array(z.object({
		from: z.string().min(1).max(32),
		to: z.string().max(32)
	})).max(80).optional(),
	remove: z.array(z.string().min(1).max(32)).max(80).optional(),
	colors: z.record(z.string().min(1).max(32), z.string().max(7)).optional()
})).handler(async ({ data, request }: any) => mutate(data, request, (doc) => {
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
export const saveCustomIcon = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
	token: tokenField,
	name: z.string().min(1).max(80),
	dataUrl: z.string().min(20).max(4e5).regex(/^data:image\//)
})).handler(async ({ data, request }: any) => mutate(data, request, (doc) => {
	requireEdit(doc, tok(data, request));
	if ((doc.customIcons || []).length >= MAX_CUSTOM_ICONS) throw new Error("errors.tooManyIcons");
	doc.customIcons.push({
		id: newId(),
		name: data.name,
		dataUrl: data.dataUrl
	});
	return (doc.customIcons || []).map((ic) => ({
		...ic,
		dataUrl: toClientAsset(ic.dataUrl)
	}));
}));
