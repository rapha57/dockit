import { describe, expect, it } from "vitest";
import { isBlockedProbeHost } from "@/lib/probe-runtime";

describe("isBlockedProbeHost", () => {
	it("blocks cloud metadata and link-local", () => {
		expect(isBlockedProbeHost("metadata.google.internal")).toBe(true);
		expect(isBlockedProbeHost("169.254.169.254")).toBe(true);
		expect(isBlockedProbeHost("hooks.example", "169.254.12.1")).toBe(true);
		expect(isBlockedProbeHost("hooks.example", "fe80::1")).toBe(true);
		expect(isBlockedProbeHost("hooks.example", "93.184.216.34")).toBe(false);
		expect(isBlockedProbeHost("n8n.internal", "10.0.0.8")).toBe(false);
	});
});
