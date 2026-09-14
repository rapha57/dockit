import { describe, expect, it } from "vitest";
import { pickVisibleSpaceIds } from "@/components/space-strip";

function widths(ids: string[], w: number) {
	return new Map(ids.map((id) => [id, w]));
}

describe("pickVisibleSpaceIds", () => {
	it("hides nothing when every space fits", () => {
		const ids = ["a", "b", "c"];
		const hid = pickVisibleSpaceIds(
			ids.map((id) => ({ id })),
			widths(ids, 80),
			"a",
			800,
			100,
			40,
			40,
			8,
		);
		expect(hid).toEqual([]);
	});

	it("keeps the active space visible and hides later ones", () => {
		const ids = ["a", "b", "c", "d", "e"];
		const hid = pickVisibleSpaceIds(
			ids.map((id) => ({ id })),
			widths(ids, 120),
			"c",
			360,
			80,
			32,
			40,
			8,
		);
		expect(hid).not.toContain("c");
		expect(hid.length).toBeGreaterThan(0);
	});

	it("returns all ids when nothing fits except fav/more/plus", () => {
		const ids = ["a", "b"];
		const hid = pickVisibleSpaceIds(
			ids.map((id) => ({ id })),
			widths(ids, 400),
			null,
			200,
			80,
			40,
			40,
			8,
		);
		expect(hid.sort()).toEqual(["a", "b"]);
	});
});
