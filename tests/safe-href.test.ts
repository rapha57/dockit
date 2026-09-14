import { describe, expect, it } from "vitest";
import { hasLinkScheme, safeAppHref, safeEmbedHref } from "@/lib/safe-href";

describe("hasLinkScheme", () => {
	it("requires scheme://host", () => {
		expect(hasLinkScheme("https://grafana.example")).toBe(true);
		expect(hasLinkScheme("http://x")).toBe(true);
		expect(hasLinkScheme("grafana.example")).toBe(false);
		expect(hasLinkScheme("https://")).toBe(false);
		expect(hasLinkScheme("://host")).toBe(false);
	});
});

describe("safeAppHref", () => {
	it("keeps http(s) URLs that already have a scheme", () => {
		expect(safeAppHref("https://grafana.example")).toBe("https://grafana.example");
		expect(safeAppHref("http://localhost:3000")).toBe("http://localhost:3000");
	});

	it("keeps ssh, ftp and other schemes", () => {
		expect(safeAppHref("ssh://git@host")).toBe("ssh://git@host");
		expect(safeAppHref("ftp://files.example/pub")).toBe("ftp://files.example/pub");
		expect(safeAppHref("sftp://backup.example")).toBe("sftp://backup.example");
	});

	it("does not invent https:// for a bare host", () => {
		expect(safeAppHref("grafana.example")).toBe("");
		expect(safeAppHref("grafana.example/path")).toBe("");
	});

	it("rejects javascript and credentialed http URLs", () => {
		expect(safeAppHref("javascript:alert(1)")).toBe("");
		expect(safeAppHref("https://user:pass@host")).toBe("");
	});
});

describe("safeEmbedHref", () => {
	it("allows http(s) only for iframes", () => {
		expect(safeEmbedHref("https://grafana.example")).toBe("https://grafana.example");
		expect(safeEmbedHref("ssh://git@host")).toBe("");
		expect(safeEmbedHref("ftp://files.example")).toBe("");
	});
});
