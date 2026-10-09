import { afterEach, describe, expect, it } from "vitest";
import {
	effectiveSessionHttpOnly,
	hostnameOf,
	isLocalHttp,
	isLoopbackHost,
} from "@/lib/security-runtime";

function req(url: string, headers: Record<string, string> = {}) {
	return {
		url,
		headers: {
			get(name: string) {
				return headers[name.toLowerCase()] ?? null;
			},
		},
	};
}

describe("isLoopbackHost", () => {
	it("accepts localhost variants", () => {
		expect(isLoopbackHost("localhost")).toBe(true);
		expect(isLoopbackHost("localhost:8080")).toBe(true);
		expect(isLoopbackHost("127.0.0.1")).toBe(true);
		expect(isLoopbackHost("127.0.0.1:4173")).toBe(true);
		expect(isLoopbackHost("[::1]")).toBe(true);
		expect(isLoopbackHost("[::1]:8080")).toBe(true);
		expect(isLoopbackHost("::1")).toBe(true);
	});

	it("rejects LAN and public hosts", () => {
		expect(isLoopbackHost("192.168.1.10")).toBe(false);
		expect(isLoopbackHost("dockit.example")).toBe(false);
		expect(isLoopbackHost("10.0.0.5:8080")).toBe(false);
	});
});

describe("hostnameOf", () => {
	it("strips ports and brackets", () => {
		expect(hostnameOf("127.0.0.1:8080")).toBe("127.0.0.1");
		expect(hostnameOf("[::1]:8080")).toBe("::1");
		expect(hostnameOf("localhost:3000")).toBe("localhost");
	});
});

describe("isLocalHttp / effectiveSessionHttpOnly", () => {
	afterEach(() => {
		delete process.env.PORTAL_TRUST_PROXY;
	});

	it("is local HTTP on loopback http", () => {
		expect(isLocalHttp(req("http://127.0.0.1:8080/"))).toBe(true);
		expect(isLocalHttp(req("http://localhost:8080/_serverFn"))).toBe(true);
		expect(effectiveSessionHttpOnly(req("http://127.0.0.1:8080/"), false)).toBe(false);
		expect(effectiveSessionHttpOnly(req("http://127.0.0.1:8080/"), true)).toBe(true);
	});

	it("forces HttpOnly on HTTPS and non-loopback HTTP", () => {
		expect(isLocalHttp(req("https://127.0.0.1:8080/"))).toBe(false);
		expect(isLocalHttp(req("http://192.168.1.10:8080/"))).toBe(false);
		expect(effectiveSessionHttpOnly(req("https://dockit.example/"), false)).toBe(true);
		expect(effectiveSessionHttpOnly(req("http://192.168.1.10:8080/"), false)).toBe(true);
	});

	it("fails closed without a request", () => {
		expect(isLocalHttp(null)).toBe(false);
		expect(effectiveSessionHttpOnly(undefined, false)).toBe(true);
	});

	it("trusts forwarded proto/host only with PORTAL_TRUST_PROXY", () => {
		const behind = req("http://127.0.0.1:8080/", {
			"x-forwarded-proto": "https",
			"x-forwarded-host": "dockit.example",
		});
		expect(isLocalHttp(behind)).toBe(true);
		process.env.PORTAL_TRUST_PROXY = "1";
		expect(isLocalHttp(behind)).toBe(false);
		expect(effectiveSessionHttpOnly(behind, false)).toBe(true);
	});
});
