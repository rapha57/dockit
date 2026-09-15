import { describe, expect, it } from "vitest";
import { fromDisk, parseStoreText, toDisk } from "@/lib/portal";

const settings = { title: "Dockit", locale: "en" as const };

describe("fromDisk / toDisk", () => {
	it("round-trips spaces / cards / lastSpaceId and never writes tabs / apps", () => {
		const raw = {
			settings,
			lastSpaceId: "s1",
			spaces: [
				{
					id: "s1",
					name: "Home",
					icon: "Layers",
					sortOrder: 1,
					categories: [
						{
							id: "c1",
							name: "Apps",
							icon: "AppWindow",
							sortOrder: 1,
							cards: [
								{
									id: "a1",
									kind: "app",
									title: "Grafana",
									url: "https://grafana.example",
									icon: "Link",
									sortOrder: 1,
								},
							],
						},
					],
				},
			],
		};
		const doc = fromDisk(raw);
		expect(doc).not.toBeNull();
		expect(doc!.spaces[0].id).toBe("s1");
		expect(doc!.spaces[0].categories[0].cards[0].id).toBe("a1");
		expect(doc!.lastSpaceId).toBe("s1");
		const out = toDisk(doc!);
		expect(out.spaces[0].id).toBe("s1");
		expect(out.spaces[0].categories[0].cards[0].id).toBe("a1");
		expect(out.lastSpaceId).toBe("s1");
		expect("tabs" in out).toBe(false);
		expect("lastTabId" in out).toBe(false);
		expect("apps" in out.spaces[0].categories[0]).toBe(false);
	});

	it("rejects a tabs / apps / lastTabId file instead of migrating it", () => {
		const raw = {
			settings,
			lastTabId: "s1",
			tabs: [
				{
					id: "s1",
					name: "Home",
					categories: [
						{
							id: "c1",
							name: "Apps",
							apps: [{ id: "a1", kind: "app", title: "Grafana", url: "https://grafana.example" }],
						},
					],
				},
			],
		};
		expect(fromDisk(raw)).toBeNull();
	});

	it("keeps an empty catalog instead of treating it as missing", () => {
		const doc = fromDisk({ settings, spaces: [] });
		expect(doc).not.toBeNull();
		expect(doc!.spaces).toEqual([]);
	});

	it("rejects unreadable JSON instead of coercing it", () => {
		expect(() => parseStoreText("{")).toThrow("errors.storeUnreadable");
		expect(() => parseStoreText("{}")).toThrow("errors.storeUnreadable");
	});

	it("absorbs leftover viewers/editors into grants once", () => {
		const doc = fromDisk({
			settings,
			spaces: [
				{
					id: "s1",
					name: "Home",
					viewers: ["u1"],
					editors: [],
					categories: [],
				},
			],
			users: [{ id: "u1", username: "bob", roleIds: ["lecteur"] }],
		});
		expect(doc).not.toBeNull();
		expect(doc!.spaces[0].viewers).toEqual([]);
		expect(doc!.spaces[0].editors).toEqual([]);
		const bob = doc!.users[0];
		expect(bob).toBeTruthy();
		expect((bob!.grants || []).some((g) => g.res === "space" && g.id === "s1" && (g.allow || []).includes("view"))).toBe(true);
	});

	it("keeps OIDC and LDAP secrets off disk when they come from the environment", () => {
		process.env.PORTAL_OIDC_CLIENT_SECRET = "env-oidc";
		process.env.PORTAL_LDAP_BIND_PASSWORD = "env-bind";
		try {
			const doc = fromDisk({
				settings: {
					...settings,
					oidcClientSecret: "json-oidc",
					ldapDirectories: [
						{
							id: "ad",
							enabled: true,
							host: "dc.example.local",
							domain: "EXAMPLE",
							bindPassword: "json-bind",
						},
					],
				},
				spaces: [],
			});
			expect(doc).not.toBeNull();
			const out = toDisk(doc!);
			expect(out.settings.oidcClientSecret).toBe("");
			expect(out.settings.ldapBindPassword).toBe("");
			expect(out.settings.ldapDirectories[0].bindPassword).toBe("");
		} finally {
			delete process.env.PORTAL_OIDC_CLIENT_SECRET;
			delete process.env.PORTAL_LDAP_BIND_PASSWORD;
		}
	});
});
