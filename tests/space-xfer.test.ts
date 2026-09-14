import { describe, expect, it } from "vitest";
import { parseSpaceXfer } from "@/lib/space-xfer";

describe("parseSpaceXfer", () => {
	it("accepts a space export", () => {
		const parsed = parseSpaceXfer({
			kind: "space",
			space: { name: "Ops", categories: [{ name: "Apps", cards: [] }] },
			customIcons: [],
		});
		expect(parsed).not.toBeNull();
		expect(parsed!.space.name).toBe("Ops");
	});

	it("rejects a portal backup", () => {
		expect(
			parseSpaceXfer({
				kind: "space",
				settings: { title: "Dockit" },
				spaces: [{ name: "Home" }],
				space: { name: "Home" },
			}),
		).toBeNull();
		expect(
			parseSpaceXfer({
				settings: { title: "Dockit" },
				spaces: [{ name: "Home" }],
			}),
		).toBeNull();
	});

	it("rejects a tabs / apps file", () => {
		expect(
			parseSpaceXfer({
				kind: "space",
				tabs: [{ name: "Home" }],
				space: { name: "Home" },
			}),
		).toBeNull();
		expect(parseSpaceXfer({ kind: "space", space: { name: "" } })).toBeNull();
	});
});
