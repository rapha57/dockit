import { describe, expect, it } from "vitest";
import { fromDisk } from "@/lib/portal";
import { hydrateUser } from "@/lib/portal/model";
import { view } from "@/lib/portal/view";

describe("view as another user", () => {
	it("filters catalog to what the target can see", () => {
		const doc = fromDisk({
			settings: { title: "Dockit", locale: "en", requireLogin: false },
			spaces: [
				{
					id: "public",
					name: "Public",
					sortOrder: 1,
					restricted: false,
					categories: [
						{
							id: "c1",
							name: "Apps",
							sortOrder: 1,
							cards: [{ id: "grafana", title: "Grafana", kind: "app", sortOrder: 1 }],
						},
					],
				},
				{
					id: "ops",
					name: "Ops",
					sortOrder: 2,
					restricted: true,
					categories: [
						{
							id: "c2",
							name: "Hidden",
							sortOrder: 1,
							cards: [{ id: "secret", title: "Secret", kind: "app", sortOrder: 1 }],
						},
					],
				},
			],
			users: [
				{ id: "admin", username: "admin", roleIds: ["owner"] },
				{
					id: "alice",
					username: "alice",
					roleIds: ["lecteur"],
					grants: [{ res: "space", id: "ops", allow: ["view", "open"] }],
				},
			],
			roles: [
				{ id: "owner", name: "Owner", system: true, grants: [] },
				{ id: "lecteur", name: "Viewer", system: true, grants: [{ res: "portal", allow: ["view"] }] },
			],
		});
		expect(doc).not.toBeNull();
		const alice = hydrateUser(doc!.users.find((u) => u.id === "alice")!, doc!);
		const portal = view(doc!, undefined, alice!);
		expect(portal.spaces.map((s) => s.id)).toEqual(["public", "ops"]);
		expect(portal.catalog.map((s) => s.id)).toEqual(["public", "ops"]);
		const guest = view(doc!, undefined, null);
		expect(guest.spaces.map((s) => s.id)).toEqual(["public"]);
		expect(guest.catalog.some((s) => s.id === "ops")).toBe(false);
	});
});
