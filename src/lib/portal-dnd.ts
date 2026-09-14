import type { PortalCard, PortalSettings } from "@/lib/portal";

export type DragKind = "space" | "cat" | "card";
export type DragState = { kind: DragKind; id: string } | null;
export type OverState =
	| { kind: "space"; insertAt: number }
	| { kind: "cat"; insertAt: number }
	| { kind: "card"; catId: string; insertAt: number }
	| { kind: "space-carry"; spaceId: string }
	| null;
export type DragFoldState = { sourceId: string | undefined; left: boolean; openId: string | null } | null;

export function catIsFolded(
	catId: string,
	opts: {
		searching?: boolean;
		dragKind?: string | null;
		fold?: { left: boolean; openId: string | null } | null;
		foldOn?: boolean;
		collapsed: Iterable<string>;
	},
): boolean {
	if (opts.searching) return false;
	if (
		(opts.dragKind === "card" || opts.dragKind === "cat") &&
		opts.fold?.left &&
		opts.foldOn !== false
	) {
		if (opts.fold.openId) return catId !== opts.fold.openId;
		return true;
	}
	return new Set(opts.collapsed).has(catId);
}
export type SpaceHoverState = { spaceId: string; at: number } | null;
export type CatHoverState = { catId: string; at: number } | null;
export type MoreHoverState = { at: number } | null;
export type CarryState = { app?: PortalCard; fromSpaceId: string; cat?: import("@/lib/portal").PortalCategory | null } | null;
export type ResizeLiveState = { origin: HTMLElement; placeholder: HTMLElement | null } | null;

export const ITEM_GRID = "item-grid";

const EDIT_MODE_KEY = "portal-edit-mode";
export let editArmed = false;
export function writeEditMode(on: boolean) {
	editArmed = on;
	try {
		if (on) sessionStorage.setItem(EDIT_MODE_KEY, "1");
		else sessionStorage.removeItem(EDIT_MODE_KEY);
	} catch {
		// ignore
	}
}

export function lockSelection(e?: { preventDefault?: () => void } | null) {
	e?.preventDefault?.();
	try {
		window.getSelection()?.removeAllRanges();
	} catch {
		// ignore
	}
}

export function setDragUi(on: boolean) {
	if (typeof document === "undefined") return;
	document.documentElement.classList.toggle("is-dragging", on);
	if (on) lockSelection();
}

export function nudgeScroll(clientX: number | undefined, clientY: number | undefined, tabRow?: HTMLElement | null) {
	const edge = 64;
	const speed = 28;
	const h = window.innerHeight;
	let y = clientY;
	if (arguments.length === 1) {
		y = clientX;
		clientX = window.innerWidth / 2;
	}
	if (y === undefined) return;
	if (y < edge) window.scrollBy(0, -Math.ceil((1 - y / edge) * speed));
	else if (y > h - edge) window.scrollBy(0, Math.ceil((1 - (h - y) / edge) * speed));
	if (!tabRow || typeof clientX !== "number") return;
	const r = tabRow.getBoundingClientRect();
	const te = 44;
	if (y < r.top - 16 || y > r.bottom + 16) return;
	if (clientX < r.left + te) tabRow.scrollLeft -= Math.ceil((1 - Math.max(0, clientX - r.left) / te) * speed);
	else if (clientX > r.right - te)
		tabRow.scrollLeft += Math.ceil((1 - Math.max(0, r.right - clientX) / te) * speed);
}

export function swallowGhostClick() {
	const block = (ev: MouseEvent) => {
		if ((ev.target as HTMLElement | null)?.closest("header")) return;
		ev.preventDefault();
		ev.stopPropagation();
		window.removeEventListener("click", block, true);
	};
	window.addEventListener("click", block, true);
	window.setTimeout(() => window.removeEventListener("click", block, true), 180);
}

export function hoverInsertAt(ids: string[], dragId: string, anchorId: string | null | undefined, after: boolean) {
	const rest = ids.filter((id) => id !== dragId);
	const ai = rest.indexOf(anchorId ?? "");
	return (ai < 0 ? rest.length : ai) + (after ? 1 : 0);
}

export function pointerAfter(e: { clientX: number; clientY: number }, el: Element) {
	const r = el.getBoundingClientRect();
	if (r.height > r.width * 1.1) return e.clientY > r.top + r.height * 0.35;
	return e.clientX - r.left + (e.clientY - r.top) > (r.width + r.height) / 2;
}

export function itemSpanClass(app: { colSpan: number; rowSpan: number }) {
	return `${app.colSpan === 3 ? "item-span-3" : app.colSpan === 2 ? "item-span-2" : ""} ${app.rowSpan === 3 ? "item-h-3" : app.rowSpan === 2 ? "item-h-2" : "item-h-1"}`.trim();
}

export function allowsFavorite(app: PortalCard, settings: PortalSettings | null | undefined) {
	const kind = app.kind || "app";
	if (kind === "note") return Boolean(settings?.favNotes);
	if (kind === "embed") return Boolean(settings?.favEmbeds);
	return true;
}

export function itemMatches(app: PortalCard, needle: string, tags: string[], downSet: Set<string> | null | undefined) {
	if (downSet && !downSet.has(app.id)) return false;
	let extra = needle;
	const fromHash: string[] = [];
	if (extra.startsWith("#")) {
		const hashed = extra
			.slice(1)
			.split(",")
			.map((x) => x.trim())
			.filter(Boolean);
		fromHash.push(...hashed);
		extra = "";
	}
	const required = [...tags, ...fromHash];
	if (required.length > 0) {
		if ((app.kind || "app") !== "app") return false;
		const have = new Set((app.tags ?? []).map((x) => x.toLowerCase()));
		if (!required.every((tag) => have.has(tag.toLowerCase()))) return false;
	}
	if (!extra) return true;
	return `${app.title} ${app.description} ${app.url} ${app.tags.join(" ")} ${app.kind}`
		.toLowerCase()
		.includes(extra);
}
