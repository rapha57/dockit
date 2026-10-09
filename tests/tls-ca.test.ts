import { describe, expect, it } from "vitest";
import { extraCaPem, parseCaPem, setExtraCaPem } from "@/lib/tls-ca";

const cert = `-----BEGIN CERTIFICATE-----
MIIBtjCCAVugAwIBAgIUTest
-----END CERTIFICATE-----`;

describe("parseCaPem", () => {
	it("accepts certificate blocks and rejects a private key", () => {
		expect(parseCaPem("")).toBe("");
		expect(parseCaPem(`junk\n${cert}\n`)).toContain("BEGIN CERTIFICATE");
		expect(() =>
			parseCaPem(`-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----`),
		).toThrow("errors.caPrivateKey");
		expect(() => parseCaPem("not a cert")).toThrow("errors.caInvalid");
	});

	it("keeps extra CA in memory without importing node:tls", () => {
		setExtraCaPem("");
		expect(extraCaPem()).toBe("");
		setExtraCaPem(`junk\n${cert}\n`);
		expect(extraCaPem()).toContain("BEGIN CERTIFICATE");
		setExtraCaPem("not a cert");
		expect(extraCaPem()).toBe("");
	});
});
