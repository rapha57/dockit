import { t } from "./i18n";
import { safeAppHref } from "./safe-href";

type SourceLink = { title?: string; url?: string };
type SourceCard = {
	id?: string;
	kind?: string;
	title?: string;
	url?: string;
	links?: SourceLink[];
};
type SourceCategory = { id?: string; name?: string; cards?: SourceCard[] };
type SourceSpace = { id?: string; name?: string; categories?: SourceCategory[] };

export type BookmarkLink = { id: string; title: string; url: string };
export type BookmarkCard = { id: string; title: string; links: BookmarkLink[] };
export type BookmarkCategory = { id: string; name: string; cards: BookmarkCard[] };
export type BookmarkSpace = { id: string; name: string; categories: BookmarkCategory[] };

export type CheckState = "on" | "off" | "mixed";

function untitled(): string {
	return t("empty.untitled");
}

function labelOf(value: unknown, fallback: string): string {
	const name = String(value ?? "").trim();
	return name || fallback;
}

function hostTitle(url: string, fallback: string): string {
	try {
		const host = new URL(url).hostname;
		if (host) return host;
	} catch {
		// ignore
	}
	return fallback;
}

function cardLinks(card: SourceCard): BookmarkLink[] {
	const kind = card.kind === "note" || card.kind === "embed" ? card.kind : "app";
	const cardTitle = labelOf(card.title, untitled());
	const out: BookmarkLink[] = [];
	const seen = new Set<string>();
	const cardId = String(card.id ?? "").trim();
	const add = (title: string, raw: unknown) => {
		const url = safeAppHref(String(raw ?? ""));
		if (!url || seen.has(url)) return;
		seen.add(url);
		out.push({ id: `${cardId}\t${url}`, title: labelOf(title, cardTitle), url });
	};
	if (kind === "note") return out;
	if (kind === "embed") {
		add(cardTitle, card.url);
		return out;
	}
	const rows = card.links?.length ? card.links : card.url ? [{ title: "", url: card.url }] : [];
	rows.forEach((row, i) => {
		const named = String(row.title ?? "").trim();
		const href = safeAppHref(String(row.url ?? ""));
		if (!href) return;
		if (named) {
			add(named, href);
			return;
		}
		if (i === 0) add(cardTitle, href);
		else add(hostTitle(href, `${cardTitle} (${i + 1})`), href);
	});
	return out;
}

export function bookmarkTree(catalog: SourceSpace[] | null | undefined): BookmarkSpace[] {
	const spaces: BookmarkSpace[] = [];
	(catalog ?? []).forEach((space, si) => {
		const categories: BookmarkCategory[] = [];
		(space.categories ?? []).forEach((cat, ci) => {
			const cards: BookmarkCard[] = [];
			(cat.cards ?? []).forEach((card) => {
				const id = String(card.id ?? "").trim();
				if (!id) return;
				const links = cardLinks(card);
				if (!links.length) return;
				cards.push({
					id,
					title: labelOf(card.title, untitled()),
					links,
				});
			});
			if (!cards.length) return;
			categories.push({
				id: String(cat.id ?? "").trim() || `cat-${si}-${ci}`,
				name: labelOf(cat.name, untitled()),
				cards,
			});
		});
		if (!categories.length) return;
		spaces.push({
			id: String(space.id ?? "").trim() || `space-${si}`,
			name: labelOf(space.name, untitled()),
			categories,
		});
	});
	return spaces;
}

export function hasBookmarkLinks(catalog: SourceSpace[] | null | undefined): boolean {
	return bookmarkTree(catalog).length > 0;
}

export function allLinkIds(tree: BookmarkSpace[]): string[] {
	const ids: string[] = [];
	for (const space of tree) ids.push(...linkIdsOf(space));
	return ids;
}

export function linkIdsOf(node: BookmarkSpace | BookmarkCategory | BookmarkCard): string[] {
	if ("categories" in node) {
		const ids: string[] = [];
		for (const cat of node.categories) ids.push(...linkIdsOf(cat));
		return ids;
	}
	if ("cards" in node) {
		const ids: string[] = [];
		for (const card of node.cards) ids.push(...linkIdsOf(card));
		return ids;
	}
	return node.links.map((link) => link.id);
}

export function checkState(ids: readonly string[], selected: ReadonlySet<string>): CheckState {
	if (!ids.length) return "off";
	let n = 0;
	for (const id of ids) if (selected.has(id)) n++;
	if (n === 0) return "off";
	if (n === ids.length) return "on";
	return "mixed";
}

export function toggleIds(selected: ReadonlySet<string>, ids: readonly string[]): Set<string> {
	const next = new Set(selected);
	const allOn = ids.length > 0 && ids.every((id) => next.has(id));
	if (allOn) for (const id of ids) next.delete(id);
	else for (const id of ids) next.add(id);
	return next;
}

export function escapeHtml(value: unknown): string {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function selectedTree(tree: BookmarkSpace[], selected: ReadonlySet<string>): BookmarkSpace[] {
	const spaces: BookmarkSpace[] = [];
	for (const space of tree) {
		const categories: BookmarkCategory[] = [];
		for (const cat of space.categories) {
			const cards: BookmarkCard[] = [];
			for (const card of cat.cards) {
				const links = card.links.filter((link) => selected.has(link.id));
				if (!links.length) continue;
				cards.push({ ...card, links });
			}
			if (!cards.length) continue;
			categories.push({ ...cat, cards });
		}
		if (!categories.length) continue;
		spaces.push({ ...space, categories });
	}
	return spaces;
}

function pad(depth: number): string {
	return "    ".repeat(depth);
}

function folderBlock(name: string, inner: string, depth: number): string {
	const i = pad(depth);
	return `${i}<DT><H3>${escapeHtml(name)}</H3>\n${i}<DL><p>\n${inner}${i}</DL><p>\n`;
}

function linkLine(link: BookmarkLink, depth: number): string {
	return `${pad(depth)}<DT><A HREF="${escapeHtml(link.url)}">${escapeHtml(link.title)}</A>\n`;
}

function decodeEntities(value: string): string {
	return value
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&amp;/g, "&")
		.replace(/<\/?[^>]+>/g, "")
		.trim();
}

export type ParsedBookmarkCard = { title: string; url: string };
export type ParsedBookmarkCategory = { name: string; cards: ParsedBookmarkCard[] };
export type ParsedBookmarkSpace = { spaceName: string; categories: ParsedBookmarkCategory[] };

export function parseNetscapeBookmarks(html: string): ParsedBookmarkSpace | null {
	const raw = String(html || "");
	if (!/NETSCAPE-Bookmark-file-1|<DT>\s*<A\s/i.test(raw)) return null;
	const h1 = raw.match(/<H1[^>]*>([\s\S]*?)<\/H1>/i);
	const spaceName = decodeEntities(h1?.[1] || "") || "Bookmarks";
	const categories: ParsedBookmarkCategory[] = [];
	let current: ParsedBookmarkCategory | null = null;
	const token = /<DT>\s*(?:<H3[^>]*>([\s\S]*?)<\/H3>|<A\s+[^>]*HREF\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/A>)/gi;
	let m: RegExpExecArray | null;
	while ((m = token.exec(raw))) {
		if (m[1] != null) {
			const name = decodeEntities(m[1]);
			if (!name) continue;
			current = { name, cards: [] };
			categories.push(current);
			continue;
		}
		const url = safeAppHref(decodeEntities(m[2] || ""));
		if (!url) continue;
		if (!current) {
			current = { name: spaceName, cards: [] };
			categories.push(current);
		}
		current.cards.push({
			title: decodeEntities(m[3] || "") || url,
			url,
		});
	}
	const kept = categories.filter((cat) => cat.cards.length);
	if (!kept.length) return null;
	return { spaceName, categories: kept };
}

export function bookmarksHtml(
	tree: BookmarkSpace[],
	selected: ReadonlySet<string>,
	rootTitle?: string,
): string {
	const picked = selectedTree(tree, selected);
	let inner = "";
	for (const space of picked) {
		let cats = "";
		for (const cat of space.categories) {
			let cards = "";
			for (const card of cat.cards) {
				for (const link of card.links) cards += linkLine(link, 4);
			}
			cats += folderBlock(cat.name, cards, 3);
		}
		inner += folderBlock(space.name, cats, 2);
	}
	const root = labelOf(rootTitle, "Dockit");
	const body = folderBlock(root, inner, 1);
	return [
		"<!DOCTYPE NETSCAPE-Bookmark-file-1>",
		"<!-- This is an automatically generated file. -->",
		'<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
		"<TITLE>Bookmarks</TITLE>",
		"<H1>Bookmarks</H1>",
		"<DL><p>",
		body.trimEnd(),
		"</DL><p>",
		"",
	].join("\n");
}
