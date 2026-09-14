import { describe, expect, it } from "vitest";
import { authExternalId, findUserForAuth, fromDisk } from "@/lib/portal";

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

describe("authExternalId", () => {
	it("builds a stable source-scoped key", () => {
		expect(authExternalId("ad", "dir1", "alice")).toBe("ad:dir1:alice");
		expect(authExternalId("proxy", "bob")).toBe("proxy:bob");
	});
});
