import { describe, expect, it } from "vitest";
import { buildAuthorizeUrl } from "@/lib/oidc-runtime";
import { DEFAULT_OIDC_SCOPE, normalizeScope } from "@/lib/oidc-scope";
import { fromDisk } from "@/lib/portal";

const disc = {
	issuer: "https://id.example",
	authorization_endpoint: "https://id.example/authorize",
	token_endpoint: "https://id.example/token",
	userinfo_endpoint: "https://id.example/userinfo",
	jwks_uri: "https://id.example/jwks"
};

const base = {
	clientId: "dockit",
	redirectUri: "https://portal.example/oidc/callback",
	state: "state-1",
	nonce: "nonce-1",
	challenge: "challenge-1"
};

function scopeOf(url: string) {
	return new URL(url).searchParams.get("scope");
}

describe("buildAuthorizeUrl scope", () => {
	it("requests the configured scope so the groups claim is returned", () => {
		const url = buildAuthorizeUrl(disc, { ...base, scope: "openid profile email groups" });
		expect(scopeOf(url)).toBe("openid profile email groups");
	});

	it("falls back to the default when no scope is configured", () => {
		expect(scopeOf(buildAuthorizeUrl(disc, base))).toBe(DEFAULT_OIDC_SCOPE);
		expect(scopeOf(buildAuthorizeUrl(disc, { ...base, scope: "" }))).toBe(DEFAULT_OIDC_SCOPE);
		expect(scopeOf(buildAuthorizeUrl(disc, { ...base, scope: "   " }))).toBe(DEFAULT_OIDC_SCOPE);
	});

	it("keeps the rest of the authorize request untouched", () => {
		const params = new URL(buildAuthorizeUrl(disc, { ...base, scope: "openid groups" })).searchParams;
		expect(params.get("response_type")).toBe("code");
		expect(params.get("client_id")).toBe("dockit");
		expect(params.get("redirect_uri")).toBe(base.redirectUri);
		expect(params.get("code_challenge_method")).toBe("S256");
	});
});

describe("normalizeScope", () => {
	it("forces openid in, so a hand-edited field cannot break the flow", () => {
		expect(normalizeScope("groups")).toBe("openid groups");
		expect(normalizeScope("profile email groups")).toBe("openid profile email groups");
	});

	it("collapses whitespace and duplicates", () => {
		expect(normalizeScope("  openid   profile  openid  ")).toBe("openid profile");
	});

	it("treats scope tokens as case-sensitive per RFC 6749", () => {
		expect(normalizeScope("Groups groups")).toBe("openid Groups groups");
	});
});

describe("stored settings", () => {
	it("defaults an existing portal.json with no oidcScope to the default scope", () => {
		const doc = fromDisk({
			settings: { title: "Dockit", locale: "en", oidcEnabled: true, oidcIssuer: "https://id.example", oidcClientId: "dockit" },
			spaces: [{ id: "s1", name: "Home", categories: [] }],
			users: []
		});
		expect(doc).not.toBeNull();
		expect(doc!.settings.oidcScope).toBe(DEFAULT_OIDC_SCOPE);
	});

	it("keeps a configured groups scope through a disk round-trip", () => {
		const doc = fromDisk({
			settings: { title: "Dockit", locale: "en", oidcScope: "openid profile email groups" },
			spaces: [{ id: "s1", name: "Home", categories: [] }],
			users: []
		});
		expect(doc!.settings.oidcScope).toBe("openid profile email groups");
	});
});
