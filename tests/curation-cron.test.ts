import { describe, expect, it } from "vitest";
import { cronMatches, cronMinuteKey } from "@/lib/curation-cron";

describe("cronMatches", () => {
	it("matches a daily 03:00 spec", () => {
		const at = new Date(2026, 9, 8, 3, 0, 12);
		expect(cronMatches("0 3 * * *", at)).toBe(true);
		expect(cronMatches("0 4 * * *", at)).toBe(false);
		expect(cronMatches("15 3 * * *", at)).toBe(false);
	});

	it("rejects junk", () => {
		expect(cronMatches("", new Date())).toBe(false);
		expect(cronMatches("hourly", new Date())).toBe(false);
		expect(cronMatches("0 3 *", new Date())).toBe(false);
	});
});

describe("cronMinuteKey", () => {
	it("is stable within a minute", () => {
		const a = new Date(2026, 9, 8, 3, 0, 1);
		const b = new Date(2026, 9, 8, 3, 0, 59);
		expect(cronMinuteKey(a)).toBe(cronMinuteKey(b));
	});
});
