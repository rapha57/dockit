import { t, formatWhen } from "./i18n";

export const HISTORY_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_HISTORY = 400;

export type SpaceSnapshot = {
	id: string;
	name: string;
	icon: string;
	sortOrder: number;
	restricted: boolean;
	viewers: string[];
	editors: string[];
	hideLabel: boolean;
};

export function snapshotSpace(space: any): SpaceSnapshot {
	return {
		id: String(space.id || ""),
		name: String(space.name || "Space").slice(0, 40),
		icon: String(space.icon || "Layers"),
		sortOrder: Number(space.sortOrder) || 1,
		restricted: Boolean(space.restricted),
		viewers: Array.isArray(space.viewers) ? [...space.viewers] : [],
		editors: Array.isArray(space.editors) ? [...space.editors] : [],
		hideLabel: Boolean(space.hideLabel)
	};
}

export type CategorySnapshot = {
	id: string;
	name: string;
	icon: string;
	sortOrder: number;
	restricted: boolean;
	viewers: string[];
	editors: string[];
};

export function snapshotCat(cat: any): CategorySnapshot {
	return {
		id: String(cat.id || ""),
		name: String(cat.name || "Category").slice(0, 60),
		icon: String(cat.icon || "AppWindow"),
		sortOrder: Number(cat.sortOrder) || 1,
		restricted: Boolean(cat.restricted),
		viewers: Array.isArray(cat.viewers) ? [...cat.viewers] : [],
		editors: Array.isArray(cat.editors) ? [...cat.editors] : []
	};
}

export type CardLink = { title: string; url: string };
export type CardSnapshot = {
	id: string;
	categoryId: string;
	kind: "app" | "note" | "embed";
	title: string;
	description: string;
	url: string;
	icon: string;
	openIn: "_self" | "_blank";
	tags: string[];
	colSpan: 1 | 2 | 3;
	rowSpan: 1 | 2 | 3;
	sortOrder: number;
	check: "http" | "icmp" | "off";
	checkHost: string;
	clicks: number;
	links: CardLink[];
};

export function snapshotCard(app: any): CardSnapshot {
	return {
		id: String(app.id || ""),
		categoryId: String(app.categoryId || ""),
		kind: app.kind === "note" || app.kind === "embed" ? app.kind : "app",
		title: String(app.title || "").slice(0, 80),
		description: String(app.description || "").slice(0, 8e3),
		url: String(app.url || "").slice(0, 2e3),
		icon: String(app.icon || "Link"),
		openIn: app.openIn === "_self" ? "_self" : "_blank",
		tags: Array.isArray(app.tags) ? app.tags.map((v: unknown) => String(v).slice(0, 32)).slice(0, 3) : [],
		colSpan: app.colSpan === 2 || app.colSpan === 3 ? app.colSpan : 1,
		rowSpan: app.rowSpan === 2 || app.rowSpan === 3 ? app.rowSpan : 1,
		sortOrder: Number(app.sortOrder) || 1,
		check: app.check === "http" || app.check === "icmp" ? app.check : "off",
		checkHost: String(app.checkHost || "").slice(0, 253),
		clicks: Math.max(0, Math.floor(Number(app.clicks) || 0)),
		links: Array.isArray(app.links)
			? app.links.slice(0, 4).map((l: any) => ({
					title: String(l?.title || "").slice(0, 40),
					url: String(l?.url || "").slice(0, 2e3)
				}))
			: []
	};
}

function snapshotFromDisk(raw: any): any {
	if (!raw || typeof raw !== "object") return null;
	return { ...raw };
}

export function snapshotToDisk(snap: any): any {
	if (!snap || typeof snap !== "object") return snap;
	return { ...snap };
}

export type HistoryRestored = { space: boolean; categories: string[]; cards: string[] };
export type HistoryEvent = {
	id: string;
	at: number;
	actor: string;
	type: string;
	label: string;
	purged: boolean;
	restored: HistoryRestored;
	snapshot: any;
};

export function asHistory(raw: unknown): HistoryEvent[] {
	if (!Array.isArray(raw)) return [];
	const out: HistoryEvent[] = [];
	for (const row of raw as any[]) {
		if (!row || typeof row !== "object") continue;
		const type = String(row.type || "").slice(0, 40);
		if (!type) continue;
		const restored = row.restored && typeof row.restored === "object" ? row.restored : {};
		out.push({
			id: String(row.id || crypto.randomUUID()),
			at: Number(row.at) || Date.now(),
			actor: String(row.actor || "").slice(0, 40),
			type,
			label: String(row.label || "").slice(0, 120),
			purged: Boolean(row.purged),
			restored: {
				space: Boolean(restored.space),
				categories: Array.isArray(restored.categories) ? restored.categories.map(String).slice(0, 80) : [],
				cards: Array.isArray(restored.cards) ? restored.cards.map(String).slice(0, 400) : []
			},
			snapshot: snapshotFromDisk(row.snapshot)
		});
		if (out.length >= MAX_HISTORY) break;
	}
	return out;
}

export function pruneHistory(doc: { history?: HistoryEvent[] }) {
	const cutoff = Date.now() - HISTORY_MS;
	let rows = (Array.isArray(doc.history) ? doc.history : []).filter((ev) => Number(ev?.at) >= cutoff);
	if (rows.length > MAX_HISTORY) {
		const deletes: HistoryEvent[] = [];
		const rest: HistoryEvent[] = [];
		for (const ev of rows) {
			if (String(ev.type || "").endsWith(".delete") && !ev.purged && ev.snapshot) deletes.push(ev);
			else rest.push(ev);
		}
		if (deletes.length >= MAX_HISTORY) rows = deletes.slice(-MAX_HISTORY);
		else rows = [...deletes, ...rest.slice(-(MAX_HISTORY - deletes.length))].sort((a, b) => a.at - b.at);
	}
	doc.history = rows;
}

export function appendHistory(
	doc: { history?: HistoryEvent[] },
	user: { username?: string } | null | undefined,
	payload: { type?: string; label?: string; snapshot?: unknown },
) {
	if (!Array.isArray(doc.history)) doc.history = [];
	pruneHistory(doc);
	doc.history.push({
		id: crypto.randomUUID(),
		at: Date.now(),
		actor: String(user?.username || "").slice(0, 40),
		type: String(payload.type || "").slice(0, 40),
		label: String(payload.label || "").slice(0, 120),
		purged: false,
		restored: { space: false, categories: [], cards: [] },
		snapshot: payload.snapshot || null
	});
	if (doc.history.length > MAX_HISTORY) doc.history = doc.history.slice(-MAX_HISTORY);
}

export function eventPath(ev: HistoryEvent | null | undefined): string {
	const snap = ev?.snapshot || {};
	const spaceName = snap.space?.name || "";
	const cat = snap.category?.name || "";
	if (spaceName && cat) return `${spaceName} / ${cat}`;
	return spaceName || cat || "";
}

export type AuditRow = { id: string; at: number; actor: string; type: string; label: string; path: string };

export function publicAudit(history: HistoryEvent[] | null | undefined, limit = 200): AuditRow[] {
	const rows = (history || []).slice().reverse().map((ev) => ({
		id: ev.id,
		at: ev.at,
		actor: ev.actor,
		type: ev.type,
		label: ev.label,
		path: eventPath(ev)
	}));
	if (!limit || limit < 0) return rows;
	return rows.slice(0, limit);
}

function csvCell(value: unknown): string {
	return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function auditCsv(rows: AuditRow[] | null | undefined): string {
	const header = [
		t("audit.csvDate"),
		t("audit.csvAction"),
		t("audit.csvItem"),
		t("audit.csvPlace"),
		t("audit.csvAccount")
	];
	const lines = [header.map(csvCell).join(";")];
	for (const r of rows || []) {
		const when = formatWhen(r.at, true);
		lines.push([
			when,
			t(`audit.${r.type}`),
			r.label,
			r.path,
			r.actor
		].map(csvCell).join(";"));
	}
	return `\uFEFF${lines.join("\r\n")}`;
}

function isRestored(ev: HistoryEvent, scope: "space" | "category" | "card", id: string): boolean {
	const r = ev.restored || { space: false, categories: [], cards: [] };
	if (scope === "space") return Boolean(r.space);
	if (scope === "category") return (r.categories || []).includes(id);
	return (r.cards || []).includes(id);
}

export type TrashRow = {
	id: string;
	scope: "card" | "category" | "space";
	targetId: string;
	at: number;
	actor: string;
	label: string;
	kind?: string;
	icon?: string;
	path: string;
	count?: number;
};

export function publicTrash(history: HistoryEvent[] | null | undefined): TrashRow[] {
	const out: TrashRow[] = [];
	for (const ev of history || []) {
		if (ev.purged || !ev.snapshot) continue;
		if (!String(ev.type || "").endsWith(".delete")) continue;
		const snap = ev.snapshot;
		const cardSnap = snap.card;
		const spaceSnap = snap.space;
		const catCards = snap.cards || [];
		if (ev.type === "card.delete" && cardSnap && !isRestored(ev, "card", cardSnap.id)) {
			out.push({
				id: ev.id,
				scope: "card",
				targetId: cardSnap.id,
				at: ev.at,
				actor: ev.actor,
				label: cardSnap.title || t("empty.untitled"),
				kind: cardSnap.kind || "app",
				icon: cardSnap.icon,
				path: eventPath(ev)
			});
		}
		if (ev.type === "category.delete" && snap.category && !isRestored(ev, "category", snap.category.id)) {
			out.push({
				id: ev.id,
				scope: "category",
				targetId: snap.category.id,
				at: ev.at,
				actor: ev.actor,
				label: snap.category.name,
				kind: "category",
				icon: snap.category.icon,
				path: spaceSnap?.name || "",
				count: Array.isArray(catCards) ? catCards.length : 0
			});
			for (const app of catCards) {
				if (isRestored(ev, "card", app.id)) continue;
				out.push({
					id: ev.id,
					scope: "card",
					targetId: app.id,
					at: ev.at,
					actor: ev.actor,
					label: app.title || t("empty.untitled"),
					kind: app.kind || "app",
					icon: app.icon,
					path: [spaceSnap?.name, snap.category?.name].filter(Boolean).join(" / ")
				});
			}
		}
		if (ev.type === "space.delete" && spaceSnap && !isRestored(ev, "space", spaceSnap.id)) {
			out.push({
				id: ev.id,
				scope: "space",
				targetId: spaceSnap.id,
				at: ev.at,
				actor: ev.actor,
				label: spaceSnap.name,
				kind: "space",
				icon: spaceSnap.icon,
				path: "",
				count: (snap.categories || []).reduce((n: number, c: any) => n + (c.cards?.length || 0), 0)
			});
			for (const cat of snap.categories || []) {
				const cards = cat.cards || [];
				if (!isRestored(ev, "category", cat.id)) {
					out.push({
						id: ev.id,
						scope: "category",
						targetId: cat.id,
						at: ev.at,
						actor: ev.actor,
						label: cat.name,
						kind: "category",
						icon: cat.icon,
						path: spaceSnap?.name || "",
						count: Array.isArray(cards) ? cards.length : 0
					});
				}
				for (const app of cards) {
					if (isRestored(ev, "card", app.id)) continue;
					out.push({
						id: ev.id,
						scope: "card",
						targetId: app.id,
						at: ev.at,
						actor: ev.actor,
						label: app.title || t("empty.untitled"),
						kind: app.kind || "app",
						icon: app.icon,
						path: [spaceSnap?.name, cat.name].filter(Boolean).join(" / ")
					});
				}
			}
		}
	}
	return out.sort((a, b) => b.at - a.at);
}

export function emptyTrash(doc: { history?: HistoryEvent[] }) {
	if (!Array.isArray(doc.history)) return;
	for (const ev of doc.history) {
		if (!String(ev.type || "").endsWith(".delete")) continue;
		ev.purged = true;
		ev.snapshot = null;
	}
}
