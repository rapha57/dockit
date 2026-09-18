import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * TanStack Start server fns need the Start runtime's AsyncLocalStorage context,
 * so the wrapper is stubbed down to the bare handler to exercise startOidc itself.
 */
vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => {
		const api: any = {
			validator: () => api,
			handler: (fn: any) => fn
		};
		return api;
	}
}));

const ISSUER = "https://id.example";
const DISCOVERY = {
	issuer: ISSUER,
	authorization_endpoint: `${ISSUER}/authorize`,
	token_endpoint: `${ISSUER}/token`,
	userinfo_endpoint: `${ISSUER}/userinfo`,
	jwks_uri: `${ISSUER}/jwks`
};

function seedStore(oidcScope?: string) {
	const dir = mkdtempSync(join(tmpdir(), "dockit-oidc-"));
	const file = join(dir, "portal.json");
	const settings: Record<string, unknown> = {
		title: "Dockit",
		oidcEnabled: true,
		oidcIssuer: ISSUER,
		oidcClientId: "dockit"
	};
	if (oidcScope !== undefined) settings.oidcScope = oidcScope;
	writeFileSync(file, JSON.stringify({
		settings,
		spaces: [{ id: "s1", name: "Home", categories: [] }],
		users: []
	}));
	return file;
}

const realFetch = globalThis.fetch;

beforeAll(() => {
	process.env.PORTAL_PUBLIC_ORIGIN = "https://portal.example";
	globalThis.fetch = vi.fn(async () =>
		new Response(JSON.stringify(DISCOVERY), {
			status: 200,
			headers: { "Content-Type": "application/json" }
		})
	) as unknown as typeof fetch;
});

afterAll(() => {
	globalThis.fetch = realFetch;
	delete process.env.PORTAL_PUBLIC_ORIGIN;
	delete process.env.PORTAL_DATA_FILE;
});

async function authorizeScope(oidcScope?: string) {
	process.env.PORTAL_DATA_FILE = seedStore(oidcScope);
	vi.resetModules();
	const { startOidc } = await import("@/lib/portal");
	const { url } = await (startOidc as any)({ data: {} });
	return new URL(url).searchParams.get("scope");
}

describe("startOidc", () => {
	it("requests the groups scope the admin configured", async () => {
		expect(await authorizeScope("openid profile email groups")).toBe("openid profile email groups");
	});

	it("still requests only the default scopes when none is configured", async () => {
		expect(await authorizeScope()).toBe("openid profile email");
	});

	it("keeps openid even if the admin drops it from the field", async () => {
		expect(await authorizeScope("profile groups")).toBe("openid profile groups");
	});
});
