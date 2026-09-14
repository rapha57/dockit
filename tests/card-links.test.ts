import { describe, expect, it } from "vitest";
import {
	canClearUrl,
	hasSiblingUrlDupes,
	clampHubInsert,
	hubTurnsOffOnDelete,
	isPrimaryRow,
	linkRowRules,
	menuKicker,
	nextInheritedTitle,
	shouldInheritFirstTitle,
	siblingUrlDupes,
} from "@/lib/card-links";

describe("card links · normal (hub off)", () => {
	const rules = linkRowRules(false, 3);

	it("locks the primary: no grip, no delete, no move", () => {
		expect(rules.lockFirst).toBe(true);
		expect(rules.canGrip(0)).toBe(false);
		expect(rules.canDelete(0)).toBe(false);
		expect(rules.canMoveFrom(0)).toBe(false);
		expect(clampHubInsert(0, rules.lockFirst)).toBe(1);
	});

	it("lets extra links move and be removed", () => {
		expect(rules.canGrip(1)).toBe(true);
		expect(rules.canGrip(2)).toBe(true);
		expect(rules.canDelete(1)).toBe(true);
		expect(rules.canDelete(2)).toBe(true);
		expect(rules.canMoveFrom(1)).toBe(true);
	});

	it("separates the primary from extras in the context menu", () => {
		expect(rules.menuSepAfterPrimary).toBe(true);
		expect(rules.annexIcon).toBe(true);
		expect(rules.hubOn).toBe(false);
		expect(menuKicker(3)).toBe("many");
	});

	it("cannot drop an extra before the primary", () => {
		expect(clampHubInsert(0, true)).toBe(1);
		expect(clampHubInsert(2, true)).toBe(2);
	});
});

describe("card links · hub on", () => {
	const rules = linkRowRules(true, 3);

	it("treats every link the same: grip, delete, move", () => {
		expect(rules.lockFirst).toBe(false);
		expect(rules.canGrip(0)).toBe(true);
		expect(rules.canGrip(1)).toBe(true);
		expect(rules.canDelete(0)).toBe(true);
		expect(rules.canDelete(1)).toBe(true);
		expect(rules.canMoveFrom(0)).toBe(true);
		expect(clampHubInsert(0, rules.lockFirst)).toBe(0);
	});

	it("has no primary separator and keeps the hub icon", () => {
		expect(rules.menuSepAfterPrimary).toBe(false);
		expect(rules.annexIcon).toBe(true);
		expect(rules.hubOn).toBe(true);
		expect(menuKicker(3)).toBe("many");
	});

	it("turns hub off when only one link remains", () => {
		const one = linkRowRules(true, 1);
		expect(one.hubOn).toBe(false);
		expect(one.canGrip(0)).toBe(false);
		expect(one.canDelete(0)).toBe(false);
		expect(one.annexIcon).toBe(false);
		expect(menuKicker(1)).toBe("one");
	});
});

describe("card links · inherit primary name", () => {
	it("copies the card name while the first title is empty or still matching", () => {
		expect(shouldInheritFirstTitle("", "Grafana")).toBe(true);
		expect(shouldInheritFirstTitle("Grafana", "Grafana")).toBe(true);
		expect(shouldInheritFirstTitle("Docs", "Grafana")).toBe(false);
		expect(nextInheritedTitle("", "Grafana", true)).toBe("Grafana");
		expect(nextInheritedTitle("Docs", "Grafana", false)).toBe("Docs");
	});
});

describe("card links · primary URL and hub last link", () => {
	it("marks index 0 as primary only when hub is off", () => {
		expect(isPrimaryRow(false, 0)).toBe(true);
		expect(isPrimaryRow(false, 1)).toBe(false);
		expect(isPrimaryRow(true, 0)).toBe(false);
	});

	it("forbids clearing the primary URL once it has a value, hub off", () => {
		expect(canClearUrl(false, 0, "https://grafana.example")).toBe(false);
		expect(canClearUrl(false, 0, "")).toBe(true);
		expect(canClearUrl(false, 1, "https://grafana.example")).toBe(true);
		expect(canClearUrl(true, 0, "https://grafana.example")).toBe(true);
	});

	it("turns hub off when the second-to-last link is removed", () => {
		expect(hubTurnsOffOnDelete(true, 2)).toBe(true);
		expect(hubTurnsOffOnDelete(true, 3)).toBe(false);
		expect(hubTurnsOffOnDelete(false, 2)).toBe(false);
	});

	it("flags duplicate URLs on the same card", () => {
		const links = [
			{ key: "a", url: "https://grafana.example/" },
			{ key: "b", url: "https://docs.example" },
			{ key: "c", url: "https://grafana.example" },
		];
		expect(siblingUrlDupes(links, "a", "https://grafana.example")).toEqual(["c"]);
		expect(siblingUrlDupes(links, "b", "https://docs.example")).toEqual([]);
		expect(hasSiblingUrlDupes(links)).toBe(true);
		expect(hasSiblingUrlDupes(links.slice(0, 2))).toBe(false);
	});
});
