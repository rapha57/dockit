import { afterEach, describe, expect, it } from "vitest";
import { cleanProxyHost, cleanProxyPort, proxyHref, setOutboundProxy } from "@/lib/outbound-proxy";

describe("outbound proxy", () => {
	afterEach(() => {
		setOutboundProxy(null);
		delete process.env.HTTP_PROXY;
		delete process.env.HTTPS_PROXY;
		delete process.env.PORTAL_HTTP_PROXY;
	});

	it("strips scheme and port from the host field", () => {
		expect(cleanProxyHost("http://proxy.lan:8080/path")).toBe("proxy.lan");
		expect(cleanProxyHost("proxy.example.com")).toBe("proxy.example.com");
	});

	it("clamps the port", () => {
		expect(cleanProxyPort(3128)).toBe(3128);
		expect(cleanProxyPort(0)).toBe(3128);
		expect(cleanProxyPort(70000)).toBe(3128);
	});

	it("builds an authenticated proxy URL from settings", () => {
		setOutboundProxy({
			enabled: true,
			host: "proxy.lan",
			port: 3128,
			username: "dockit",
			password: "s3cret",
		});
		expect(proxyHref()).toBe("http://dockit:s3cret@proxy.lan:3128/");
	});

	it("prefers PORTAL_HTTP_PROXY over settings", () => {
		process.env.PORTAL_HTTP_PROXY = "http://ops:pw@edge:8080";
		setOutboundProxy({
			enabled: true,
			host: "proxy.lan",
			port: 3128,
			username: "",
			password: "",
		});
		expect(proxyHref()).toBe("http://ops:pw@edge:8080");
	});

	it("stays empty when disabled and no env", () => {
		setOutboundProxy({
			enabled: false,
			host: "proxy.lan",
			port: 3128,
			username: "",
			password: "",
		});
		expect(proxyHref()).toBe("");
	});
});
