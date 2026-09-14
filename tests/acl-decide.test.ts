import { describe, expect, it } from "vitest";
import { asGrants, can, categoryMoveImpact, decide, defaultRoles, type AclDoc, type User } from "@/lib/acl";

function doc(partial: Partial<AclDoc> = {}): AclDoc {
	return {
		roles: defaultRoles(),
		users: [],
		groups: [],
		spaces: [
			{
				id: "s-public",
				name: "Home",
				restricted: false,
				categories: [
					{
						id: "c1",
						name: "Apps",
						restricted: false,
						cards: [{ id: "card-1", title: "Grafana", kind: "app" }],
					},
				],
			},
			{
				id: "s-locked",
				name: "Secrets",
				restricted: true,
				categories: [
					{
						id: "c2",
						name: "Vault",
						restricted: false,
						cards: [{ id: "card-2", title: "Vault", kind: "app" }],
					},
				],
			},
		],
		...partial,
	};
}

const viewer: User = { id: "u1", username: "ada", roleIds: ["lecteur"], grants: [] };
const editor: User = { id: "u2", username: "ed", roleIds: ["editeur"], grants: [] };
const owner: User = { id: "admin", username: "admin", roleIds: ["owner"], grants: [] };

describe("decide", () => {
	it("lets anyone view an unrestricted space", () => {
		expect(can(viewer, "view", { res: "space", id: "s-public" }, doc())).toBe(true);
		expect(can(null, "view", { res: "space", id: "s-public" }, doc())).toBe(true);
	});

	it("hides a restricted space from a viewer", () => {
		expect(can(viewer, "view", { res: "space", id: "s-locked" }, doc())).toBe(false);
	});

	it("lets an editor edit a public space but not move-implies-edit", () => {
		expect(can(editor, "edit", { res: "space", id: "s-public" }, doc())).toBe(true);
		expect(can(editor, "move", { res: "space", id: "s-public" }, doc())).toBe(true);
		expect(can(viewer, "edit", { res: "space", id: "s-public" }, doc())).toBe(false);
		expect(can(viewer, "move", { res: "space", id: "s-public" }, doc())).toBe(false);
	});

	it("lets the owner through regardless of restriction", () => {
		expect(can(owner, "edit", { res: "space", id: "s-locked" }, doc())).toBe(true);
		expect(decide(owner, "delete", { res: "space", id: "s-locked" }, doc()).winner?.kind).toBe("system");
	});

	it("migrates a stored grant res=tab to space", () => {
		const grants = asGrants([{ res: "tab", id: "s-locked", allow: ["view", "open"] }]);
		expect(grants[0]?.res).toBe("space");
		const user: User = { id: "u3", roleIds: ["lecteur"], grants };
		expect(can(user, "view", { res: "space", id: "s-locked" }, doc())).toBe(true);
	});
});

describe("categoryMoveImpact", () => {
	it("does not rewrite live sortOrder", () => {
		const live = doc();
		live.spaces![0].categories = [
			{ id: "c1", name: "A", sortOrder: 1, cards: [] },
			{ id: "c-move", name: "B", sortOrder: 2, cards: [] },
		];
		live.spaces![1].categories = [{ id: "c2", name: "Vault", sortOrder: 1, cards: [] }];
		const beforeIds = live.spaces![0].categories!.map((c) => c.id);
		const beforeOrder = live.spaces![0].categories!.map((c) => c.sortOrder);
		const impact = categoryMoveImpact(live, "c-move", "s-locked");
		expect(impact).not.toBeNull();
		expect(live.spaces![0].categories!.map((c) => c.id)).toEqual(beforeIds);
		expect(live.spaces![0].categories!.map((c) => c.sortOrder)).toEqual(beforeOrder);
	});
});
