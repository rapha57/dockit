import { canonicalAppUrl } from "./dup-url";

export function clampHubInsert(to: number, lockFirst: boolean): number {
	if (!lockFirst) return to;
	return Math.max(1, to);
}

export function linkRowRules(hub: boolean, count: number) {
	const lockFirst = !hub && count > 1;
	return {
		lockFirst,
		canGrip(index: number) {
			if (count < 2) return false;
			if (lockFirst && index === 0) return false;
			return true;
		},
		canDelete(index: number) {
			if (count < 2) return false;
			if (lockFirst && index === 0) return false;
			return true;
		},
		canMoveFrom(index: number) {
			if (count < 2) return false;
			if (lockFirst && index === 0) return false;
			return true;
		},
		menuSepAfterPrimary: lockFirst,
		annexIcon: count > 1,
		hubOn: Boolean(hub) && count > 1,
	};
}

export function menuKicker(count: number): "one" | "many" {
	return count === 1 ? "one" : "many";
}

export function nextInheritedTitle(firstTitle: string, cardTitle: string, inherit: boolean): string {
	if (!inherit) return firstTitle;
	return String(cardTitle || "").trim();
}

export function shouldInheritFirstTitle(firstTitle: string, cardTitle: string): boolean {
	const title = String(firstTitle || "").trim();
	const name = String(cardTitle || "").trim();
	return !title || title === name;
}

export function isPrimaryRow(hub: boolean, index: number): boolean {
	return !hub && index === 0;
}

export function canClearUrl(hub: boolean, index: number, currentUrl: string): boolean {
	if (hub || index !== 0) return true;
	return !String(currentUrl || "").trim();
}

export function hubTurnsOffOnDelete(hub: boolean, count: number): boolean {
	return Boolean(hub) && count === 2;
}

export function siblingUrlDupes(links: { key: string; url?: string }[], exceptKey: string, url?: string | null): string[] {
	const key = canonicalAppUrl(url);
	if (!key) return [];
	return links.filter((row) => row.key !== exceptKey && canonicalAppUrl(row.url) === key).map((row) => row.key);
}

export function hasSiblingUrlDupes(links: { key: string; url?: string }[]): boolean {
	return links.some((row) => siblingUrlDupes(links, row.key, row.url).length > 0);
}
