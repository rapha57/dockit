import { describe, expect, it } from "vitest";
import { filterGroupNames, matchesGroupFilter, parseGroupFilter } from "@/lib/oidc-groups";
import { applyOidcGroups, fromDisk } from "@/lib/portal";

const ISSUER = "https://id.example";

describe("parseGroupFilter", () => {
	it("splits on commas, not whitespace, so names with spaces survive", () => {
		expect(parseGroupFilter("Domain Admins, dockit-*")).toEqual(["Domain Admins", "dockit-*"]);
	});

	it("drops blanks and stray separators", () => {
		expect(parseGroupFilter("  a , , b ,")).toEqual(["a", "b"]);
		expect(parseGroupFilter("")).toEqual([]);
		expect(parseGroupFilter(undefined)).toEqual([]);
	});
});

describe("matchesGroupFilter", () => {
	it("matches exactly when no wildcard is used", () => {
		expect(matchesGroupFilter("admins", ["admins"])).toBe(true);
		expect(matchesGroupFilter("admins-eu", ["admins"])).toBe(false);
	});

	it("treats * as the only wildcard", () => {
		expect(matchesGroupFilter("dockit-admins", ["dockit-*"])).toBe(true);
		expect(matchesGroupFilter("eu-admins", ["*-admins"])).toBe(true);
		expect(matchesGroupFilter("dockit", ["dockit-*"])).toBe(false);
	});

	it("is case-insensitive, because the filter is hand-typed", () => {
		expect(matchesGroupFilter("Domain Admins", ["domain admins"])).toBe(true);
		expect(matchesGroupFilter("DOCKIT-Ops", ["dockit-*"])).toBe(true);
	});

	it("does not let regex metacharacters in a pattern act as regex", () => {
		expect(matchesGroupFilter("axc", ["a.c"])).toBe(false);
		expect(matchesGroupFilter("a.c", ["a.c"])).toBe(true);
		expect(matchesGroupFilter("aaa", ["a+"])).toBe(false);
		expect(matchesGroupFilter("a+", ["a+"])).toBe(true);
	});
});

describe("filterGroupNames", () => {
	it("keeps everything when no filter is set, matching pre-filter behaviour", () => {
		const names = ["a", "b", "c"];
		expect(filterGroupNames(names, "")).toEqual(names);
		expect(filterGroupNames(names, undefined)).toEqual(names);
	});

	it("keeps only matching names", () => {
		expect(filterGroupNames(["dockit-ops", "hr", "dockit-admins"], "dockit-*"))
			.toEqual(["dockit-ops", "dockit-admins"]);
	});
});

function docWith(filter: string) {
	return fromDisk({
		settings: { title: "Dockit", oidcGroupFilter: filter },
		spaces: [{ id: "s1", name: "Home", categories: [] }],
		users: [{ id: "u1", username: "jurre", source: "oidc", roleIds: ["lecteur"] }],
		groups: []
	})!;
}

const CLAIM = ["dockit-admins", "hr", "finance", "dockit-ops"];

describe("applyOidcGroups", () => {
	it("only creates groups the filter allows", () => {
		const doc = docWith("dockit-*");
		applyOidcGroups(doc, doc.users[0], ISSUER, CLAIM);
		expect(doc.groups.map((g) => g.name).sort()).toEqual(["dockit-admins", "dockit-ops"]);
		expect(doc.users[0].groupIds).toHaveLength(2);
	});

	it("mirrors every claimed group when the filter is empty", () => {
		const doc = docWith("");
		applyOidcGroups(doc, doc.users[0], ISSUER, CLAIM);
		expect(doc.groups).toHaveLength(4);
	});

	it("keys groups by issuer and name so they stay namespaced", () => {
		const doc = docWith("dockit-admins");
		applyOidcGroups(doc, doc.users[0], ISSUER, CLAIM);
		expect(doc.groups[0].externalId).toBe(`oidc:${ISSUER}:dockit-admins`);
		expect(doc.groups[0].roleIds).toEqual([]);
	});

	it("drops membership when a group stops matching the filter", () => {
		const doc = docWith("dockit-*");
		applyOidcGroups(doc, doc.users[0], ISSUER, CLAIM);
		expect(doc.users[0].groupIds).toHaveLength(2);

		doc.settings.oidcGroupFilter = "dockit-ops";
		applyOidcGroups(doc, doc.users[0], ISSUER, CLAIM);

		const ops = doc.groups.find((g) => g.name === "dockit-ops")!;
		const admins = doc.groups.find((g) => g.name === "dockit-admins")!;
		expect(ops.members).toEqual(["u1"]);
		expect(admins.members).toEqual([]);
		expect(doc.users[0].groupIds).toEqual([ops.id]);
	});

	it("never group-manages the built-in admin account", () => {
		const doc = docWith("");
		doc.users.push({ id: "admin", username: "admin", roleIds: ["owner"] } as any);
		applyOidcGroups(doc, doc.users[1], ISSUER, CLAIM);
		expect(doc.groups).toHaveLength(0);
	});
});
