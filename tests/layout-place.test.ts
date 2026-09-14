import { describe, expect, it } from "vitest";
import { placeCard, placeCategory, placeSpaces } from "@/lib/layout-place";
import type { PortalCard, PortalCategory } from "@/lib/portal";

function card(id: string, categoryId: string, sortOrder: number): PortalCard {
	return {
		id,
		categoryId,
		kind: "app",
		title: id,
		description: "",
		icon: "Link",
		openIn: "_blank",
		tags: [],
		colSpan: 1,
		rowSpan: 1,
		sortOrder,
		check: "off",
		checkHost: "",
		clicks: 0,
		links: [],
	};
}

function cat(id: string, sortOrder: number, cards: PortalCard[]): PortalCategory {
	return {
		id,
		name: id,
		icon: "AppWindow",
		sortOrder,
		restricted: false,
		viewers: [],
		editors: [],
		cards,
	};
}

describe("placeSpaces", () => {
	it("moves a space and reindexes sortOrder", () => {
		const next = placeSpaces(
			[
				{ id: "a", sortOrder: 1 },
				{ id: "b", sortOrder: 2 },
				{ id: "c", sortOrder: 3 },
			],
			"c",
			0,
		);
		expect(next?.map((s) => s.id)).toEqual(["c", "a", "b"]);
		expect(next?.map((s) => s.sortOrder)).toEqual([1, 2, 3]);
	});
});

describe("placeCategory", () => {
	it("reorders categories in place", () => {
		const next = placeCategory(
			[cat("c1", 1, []), cat("c2", 2, []), cat("c3", 3, [])],
			"c1",
			2,
		);
		expect(next?.map((c) => c.id)).toEqual(["c2", "c3", "c1"]);
	});
});

describe("placeCard", () => {
	it("moves a card across categories and reindexes", () => {
		const a = card("a", "c1", 1);
		const b = card("b", "c1", 2);
		const c = card("c", "c2", 1);
		const next = placeCard([cat("c1", 1, [a, b]), cat("c2", 2, [c])], "a", "c2", 0);
		expect(next).not.toBeNull();
		expect(next![0].cards.map((x) => x.id)).toEqual(["b"]);
		expect(next![1].cards.map((x) => x.id)).toEqual(["a", "c"]);
		expect(next![1].cards[0].categoryId).toBe("c2");
		expect(next![1].cards.map((x) => x.sortOrder)).toEqual([1, 2]);
	});
});
