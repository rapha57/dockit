import { describe, expect, it } from "vitest";
import { authExternalId, findUserForAuth, fromDisk, inLinkedAdGroups, inLinkedOidcGroups } from "@/lib/portal";

const settings = { title: "Dockit", locale: "en" as const };

describe("findUserForAuth", () => {
	it("does not merge local and directory accounts that share a username", () => {
		const doc = fromDisk({
			settings,
			spaces: [{ id: "s1", name: "Home", categories: [] }],
			users: [
				{ id: "local-alice", username: "alice", source: "local", roleIds: ["editeur"] },
				{
					id: "ad-alice",
					username: "alice",
					source: "ad",
					externalId: "ad:dir1:alice",
					roleIds: ["lecteur"],
				},
			],
		});
		expect(doc).not.toBeNull();
		const local = findUserForAuth(doc!.users, "alice", "local");
		const ad = findUserForAuth(doc!.users, "alice", "ad", "ad:dir1:alice");
		expect(local?.id).toBe("local-alice");
		expect(ad?.id).toBe("ad-alice");
		expect(findUserForAuth(doc!.users, "alice", "oidc")).toBeUndefined();
	});

	it("prefers externalId when present", () => {
		const users = [
			{ id: "a", username: "old", source: "oidc" as const, externalId: "oidc:iss:alice" },
			{ id: "b", username: "alice", source: "oidc" as const, externalId: "oidc:iss:other" },
		];
		expect(findUserForAuth(users, "alice", "oidc", "oidc:iss:alice")?.id).toBe("a");
	});
});

describe("inLinkedAdGroups", () => {
	it("matches a pre-linked directory group by CN even if the DN OU differs", () => {
		const doc = fromDisk({
			settings,
			spaces: [{ id: "s1", name: "Home", categories: [] }],
			users: [],
			groups: [
				{
					id: "g1",
					name: "admins",
					source: "ad",
					externalId: "dir1:CN=admins,OU=groups,DC=example,DC=com",
					members: [],
					roleIds: ["admin"],
				},
			],
		});
		expect(
			inLinkedAdGroups(doc!, "dir1", ["CN=admins,OU=users,DC=example,DC=com"]),
		).toBe(true);
		expect(inLinkedAdGroups(doc!, "dir1", ["CN=devs,OU=groups,DC=example,DC=com"])).toBe(false);
		expect(inLinkedAdGroups(doc!, "other", ["CN=admins,OU=groups,DC=example,DC=com"])).toBe(false);
	});
});

describe("inLinkedOidcGroups", () => {
	it("matches an already stored OIDC group, not a new claim", () => {
		const doc = fromDisk({
			settings,
			spaces: [{ id: "s1", name: "Home", categories: [] }],
			users: [],
			groups: [
				{
					id: "g1",
					name: "ops",
					source: "oidc",
					externalId: "oidc:https://id.example:ops",
					members: [],
					roleIds: ["admin"],
				},
			],
		});
		expect(inLinkedOidcGroups(doc!, "https://id.example", ["ops"])).toBe(true);
		expect(inLinkedOidcGroups(doc!, "https://id.example", ["random"])).toBe(false);
	});
});

describe("authExternalId", () => {
	it("builds a stable source-scoped key", () => {
		expect(authExternalId("ad", "dir1", "alice")).toBe("ad:dir1:alice");
		expect(authExternalId("proxy", "bob")).toBe("proxy:bob");
	});
});
