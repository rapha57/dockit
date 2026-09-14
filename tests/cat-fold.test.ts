import { describe, expect, it } from "vitest";
import { catIsFolded } from "@/lib/portal-dnd";

const collapsed = new Set(["saved"]);

describe("catIsFolded", () => {
	it("uses saved prefs when not dragging", () => {
		expect(catIsFolded("saved", { collapsed })).toBe(true);
		expect(catIsFolded("open", { collapsed })).toBe(false);
	});

	it("never folds while searching", () => {
		expect(
			catIsFolded("saved", {
				searching: true,
				dragKind: "card",
				fold: { left: true, openId: null },
				collapsed,
			}),
		).toBe(false);
	});

	it("folds every category when a card drag has left and no open id", () => {
		expect(
			catIsFolded("a", {
				dragKind: "card",
				fold: { left: true, openId: null },
				collapsed,
			}),
		).toBe(true);
	});

	it("keeps the source category open while other cats fold", () => {
		const fold = { left: true, openId: "src" };
		expect(catIsFolded("src", { dragKind: "card", fold, collapsed })).toBe(false);
		expect(catIsFolded("other", { dragKind: "card", fold, collapsed })).toBe(true);
	});

	it("folds other categories while dragging a category", () => {
		const fold = { left: true, openId: "moving" };
		expect(catIsFolded("moving", { dragKind: "cat", fold, collapsed })).toBe(false);
		expect(catIsFolded("other", { dragKind: "cat", fold, collapsed })).toBe(true);
	});

	it("ignores drag fold when the setting is off", () => {
		expect(
			catIsFolded("other", {
				dragKind: "cat",
				fold: { left: true, openId: "moving" },
				foldOn: false,
				collapsed,
			}),
		).toBe(false);
		expect(
			catIsFolded("saved", {
				dragKind: "card",
				fold: { left: true, openId: "src" },
				foldOn: false,
				collapsed,
			}),
		).toBe(true);
	});
});
