import { safeAppHref } from "./safe-href";

export function canonicalAppUrl(raw: string | undefined | null): string {
	const href = safeAppHref(raw);
	if (!href) return "";
	try {
		const u = new URL(href);
		u.hash = "";
		u.username = "";
		u.password = "";
		if (u.pathname.length > 1 && u.pathname.endsWith("/")) u.pathname = u.pathname.slice(0, -1);
		return u.href.toLowerCase();
	} catch {
		return href.toLowerCase();
	}
}

type DupApp = { id?: string; kind?: string; url?: string; title?: string };
type DupCategory = { name?: string; apps?: DupApp[] };
type DupTab = { name?: string; categories?: DupCategory[] };
type DupHit = { id?: string; title: string; tab?: string; category?: string };

export function findUrlDuplicates(
	catalog: DupTab[] | null | undefined,
	url: string | undefined | null,
	exceptId?: string | null,
): DupHit[] {
	const key = canonicalAppUrl(url);
	if (!key) return [];
	const hits: DupHit[] = [];
	for (const tab of catalog ?? []) {
		for (const cat of tab.categories ?? []) {
			for (const app of cat.apps ?? []) {
				if (exceptId && app.id === exceptId) continue;
				if ((app.kind || "app") === "note") continue;
				if (canonicalAppUrl(app.url) !== key) continue;
				hits.push({
					id: app.id,
					title: String(app.title || "").trim() || "Sans titre",
					tab: tab.name,
					category: cat.name
				});
			}
		}
	}
	return hits;
}
