import { t, formatWhen } from "./i18n";

export const HISTORY_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_HISTORY = 400;

export function snapshotTab(tab) {
	return {
		id: String(tab.id || ""),
		name: String(tab.name || "Space").slice(0, 40),
		icon: String(tab.icon || "Layers"),
		sortOrder: Number(tab.sortOrder) || 1,
		restricted: Boolean(tab.restricted),
		viewers: Array.isArray(tab.viewers) ? [...tab.viewers] : [],
		editors: Array.isArray(tab.editors) ? [...tab.editors] : [],
		hideLabel: Boolean(tab.hideLabel)
	};
}

export function snapshotCat(cat) {
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

export function snapshotApp(app) {
	return {
		id: String(app.id || ""),
		categoryId: String(app.categoryId || ""),
		kind: app.kind === "note" || app.kind === "embed" ? app.kind : "app",
		title: String(app.title || "").slice(0, 80),
		description: String(app.description || "").slice(0, 8e3),
		url: String(app.url || "").slice(0, 2e3),
		icon: String(app.icon || "Link"),
		openIn: app.openIn === "_self" ? "_self" : "_blank",
		tags: Array.isArray(app.tags) ? app.tags.map((t) => String(t).slice(0, 32)).slice(0, 3) : [],
		colSpan: app.colSpan === 2 || app.colSpan === 3 ? app.colSpan : 1,
		rowSpan: app.rowSpan === 2 || app.rowSpan === 3 ? app.rowSpan : 1,
		sortOrder: Number(app.sortOrder) || 1,
		check: app.check === "http" || app.check === "icmp" ? app.check : "off",
		checkHost: String(app.checkHost || "").slice(0, 253),
		clicks: Math.max(0, Math.floor(Number(app.clicks) || 0)),
		links: Array.isArray(app.links)
			? app.links.slice(0, 4).map((l) => ({
					title: String(l?.title || "").slice(0, 40),
					url: String(l?.url || "").slice(0, 2e3)
				}))
			: []
	};
}

export function asHistory(raw) {
	if (!Array.isArray(raw)) return [];
	const out = [];
	for (const row of raw) {
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
				tab: Boolean(restored.tab),
				categories: Array.isArray(restored.categories) ? restored.categories.map(String).slice(0, 80) : [],
				apps: Array.isArray(restored.apps) ? restored.apps.map(String).slice(0, 400) : []
			},
			snapshot: row.snapshot && typeof row.snapshot === "object" ? row.snapshot : null
		});
		if (out.length >= MAX_HISTORY) break;
	}
	return out;
}

export function pruneHistory(doc) {
	const cutoff = Date.now() - HISTORY_MS;
	let rows = (Array.isArray(doc.history) ? doc.history : []).filter((ev) => Number(ev?.at) >= cutoff);
	if (rows.length > MAX_HISTORY) {
		const deletes = [];
		const rest = [];
		for (const ev of rows) {
			if (String(ev.type || "").endsWith(".delete") && !ev.purged && ev.snapshot) deletes.push(ev);
			else rest.push(ev);
		}
		if (deletes.length >= MAX_HISTORY) rows = deletes.slice(-MAX_HISTORY);
		else rows = [...deletes, ...rest.slice(-(MAX_HISTORY - deletes.length))].sort((a, b) => a.at - b.at);
	}
	doc.history = rows;
}

export function appendHistory(doc, user, payload) {
	if (!Array.isArray(doc.history)) doc.history = [];
	pruneHistory(doc);
	doc.history.push({
		id: crypto.randomUUID(),
		at: Date.now(),
		actor: String(user?.username || "").slice(0, 40),
		type: String(payload.type || "").slice(0, 40),
		label: String(payload.label || "").slice(0, 120),
		purged: false,
		restored: { tab: false, categories: [], apps: [] },
		snapshot: payload.snapshot || null
	});
	if (doc.history.length > MAX_HISTORY) doc.history = doc.history.slice(-MAX_HISTORY);
}

export function eventPath(ev) {
	const snap = ev?.snapshot || {};
	const tab = snap.tab?.name || "";
	const cat = snap.category?.name || "";
	if (tab && cat) return `${tab} / ${cat}`;
	return tab || cat || "";
}

export function publicAudit(history, limit = 200) {
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

function csvCell(value) {
	return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function auditCsv(rows) {
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

function isRestored(ev, scope, id) {
	const r = ev.restored || { tab: false, categories: [], apps: [] };
	if (scope === "tab") return Boolean(r.tab);
	if (scope === "category") return (r.categories || []).includes(id);
	return (r.apps || []).includes(id);
}

export function publicTrash(history) {
	const out = [];
	for (const ev of history || []) {
		if (ev.purged || !ev.snapshot) continue;
		if (!String(ev.type || "").endsWith(".delete")) continue;
		const snap = ev.snapshot;
		if (ev.type === "card.delete" && snap.app && !isRestored(ev, "card", snap.app.id)) {
			out.push({
				id: ev.id,
				scope: "card",
				targetId: snap.app.id,
				at: ev.at,
				actor: ev.actor,
				label: snap.app.title || t("empty.untitled"),
				kind: snap.app.kind || "app",
				icon: snap.app.icon,
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
				path: snap.tab?.name || "",
				count: Array.isArray(snap.apps) ? snap.apps.length : 0
			});
			for (const app of snap.apps || []) {
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
					path: [snap.tab?.name, snap.category?.name].filter(Boolean).join(" / ")
				});
			}
		}
		if (ev.type === "tab.delete" && snap.tab && !isRestored(ev, "tab", snap.tab.id)) {
			out.push({
				id: ev.id,
				scope: "tab",
				targetId: snap.tab.id,
				at: ev.at,
				actor: ev.actor,
				label: snap.tab.name,
				kind: "tab",
				icon: snap.tab.icon,
				path: "",
				count: (snap.categories || []).reduce((n, c) => n + (c.apps?.length || 0), 0)
			});
			for (const cat of snap.categories || []) {
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
						path: snap.tab?.name || "",
						count: Array.isArray(cat.apps) ? cat.apps.length : 0
					});
				}
				for (const app of cat.apps || []) {
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
						path: [snap.tab?.name, cat.name].filter(Boolean).join(" / ")
					});
				}
			}
		}
	}
	return out.sort((a, b) => b.at - a.at);
}

export function emptyTrash(doc) {
	if (!Array.isArray(doc.history)) return;
	for (const ev of doc.history) {
		if (!String(ev.type || "").endsWith(".delete")) continue;
		ev.purged = true;
		ev.snapshot = null;
	}
}
