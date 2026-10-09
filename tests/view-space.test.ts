import { describe, expect, it } from "vitest";
import { fromDisk } from "@/lib/portal";
import { view } from "@/lib/portal/view";

function space(id: string, name: string, sortOrder: number) {
	return {
		id,
		name,
		sortOrder,
		restricted: false,
		categories: [
			{
				id: `${id}-c`,
				name: "Apps",
				sortOrder: 1,
				cards: [{ id: `${id}-app`, title: name, kind: "app" as const, sortOrder: 1 }],
			},
		],
	};
}

describe("view default space", () => {
	it("opens the first space, not lastSpaceId", () => {
		const doc = fromDisk({
			settings: { title: "Dockit", locale: "en", requireLogin: false },
			lastSpaceId: "lab",
			spaces: [space("infra", "Infra", 2), space("apps", "Apps", 3), space("lab", "Lab", 4)],
		});
		expect(doc).not.toBeNull();
		const portal = view(doc!, undefined, null);
		expect(portal.activeSpaceId).toBe("infra");
		expect(view(doc!, "lab", null).activeSpaceId).toBe("lab");
		expect(view(doc!, "gone", null).activeSpaceId).toBe("infra");
	});
});
