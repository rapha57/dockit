import { describe, expect, it } from "vitest";
import {
	asDirectories,
	asDirectory,
	asLoginOrder,
	bindIdentity,
	directoryReady,
	ldapLoginName,
	pickDirectory,
	rdnValue,
	syncLegacyLdap,
	adGroupKey,
	normDn,
} from "@/lib/ldap-runtime";

describe("ldap directory parse", () => {
	it("reads a directory row and legacy settings", () => {
		const d = asDirectory({
			id: "corp",
			enabled: true,
			host: "dc.example.com",
			port: 636,
			tls: true,
			bindDn: "cn=bind,dc=example,dc=com",
			bindPassword: "secret",
			baseDn: "dc=example,dc=com",
			domain: "example.com",
			autoCreate: true,
		});
		expect(d).not.toBeNull();
		expect(d!.id).toBe("corp");
		expect(d!.host).toBe("dc.example.com");
		expect(d!.port).toBe(636);
		expect(directoryReady(d)).toBe(true);
		const dirs = asDirectories({ ldapDirectories: [d] });
		expect(dirs).toHaveLength(1);
		expect(syncLegacyLdap(dirs).ldapHost).toBe("dc.example.com");
		expect(syncLegacyLdap(dirs).ldapDomain).toBe("example.com");
	});

	it("lifts a single legacy ldapHost block", () => {
		const dirs = asDirectories({
			ldapEnabled: true,
			ldapHost: "ad.internal",
			ldapDomain: "internal",
			ldapTls: false,
			ldapPort: 389,
		});
		expect(dirs).toHaveLength(1);
		expect(dirs[0].id).toBe("ad");
		expect(dirs[0].host).toBe("ad.internal");
		expect(dirs[0].tls).toBe(false);
		expect(dirs[0].port).toBe(389);
	});

	it("rejects junk instead of inventing a directory", () => {
		expect(asDirectory(null)).toBeNull();
		expect(asDirectory("ldap")).toBeNull();
		expect(asDirectories({})).toEqual([]);
		expect(directoryReady(asDirectory({ id: "x", host: "dc.example.com" }))).toBe(false);
	});
});

describe("ldap bind identity", () => {
	it("uses UPN when the domain has a dot", () => {
		expect(bindIdentity({ domain: "example.com" }, "alice")).toBe("alice@example.com");
	});

	it("uses NetBIOS\\sam when the domain has no dot", () => {
		expect(bindIdentity({ domain: "CORP" }, "alice")).toBe("CORP\\alice");
	});

	it("falls back to the sam account", () => {
		expect(bindIdentity({ domain: "" }, "alice")).toBe("alice");
	});
});

describe("ldap login name and groups", () => {
	it("strips DOMAIN\\ and user@realm", () => {
		expect(ldapLoginName("CORP\\Alice")).toBe("alice");
		expect(ldapLoginName("Alice@example.com")).toBe("alice");
		expect(ldapLoginName(" alice ")).toBe("alice");
	});

	it("keeps local first in login order", () => {
		const dirs = asDirectories({
			ldapDirectories: [{ id: "corp", enabled: true, host: "dc.example.com", domain: "example.com" }],
		});
		expect(asLoginOrder(["corp"], dirs)).toEqual(["local", "corp"]);
		expect(asLoginOrder(undefined, dirs)[0]).toBe("local");
		expect(pickDirectory({ ldapDirectories: dirs }, "corp")?.id).toBe("corp");
	});

	it("normalizes group DNs for mapping keys", () => {
		expect(normDn("CN=Admins, OU=Groups, DC=example, DC=com")).toBe("cn=admins,ou=groups,dc=example,dc=com");
		expect(rdnValue("CN=Admins,OU=Groups,DC=example,DC=com")).toBe("Admins");
		expect(adGroupKey("corp", "CN=Admins,OU=Groups,DC=example,DC=com")).toBe(
			"corp:cn=admins,ou=groups,dc=example,dc=com",
		);
	});
});
