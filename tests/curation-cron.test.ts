import { describe, expect, it } from "vitest";
import { cronMatches, cronMinuteKey, cronScheduleSpec, cronSpecOk, parseCronSchedule } from "@/lib/curation-cron";

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

describe("cronSpecOk", () => {
	it("allows empty and a valid five-field spec", () => {
		expect(cronSpecOk("")).toBe(true);
		expect(cronSpecOk("0 3 * * *")).toBe(true);
		expect(cronSpecOk("hourly")).toBe(false);
		expect(cronSpecOk("99 3 * * *")).toBe(false);
	});
});

describe("cronMinuteKey", () => {
	it("is stable within a minute", () => {
		const a = new Date(2026, 9, 8, 3, 0, 1);
		const b = new Date(2026, 9, 8, 3, 0, 59);
		expect(cronMinuteKey(a)).toBe(cronMinuteKey(b));
	});
});

describe("parseCronSchedule", () => {
	it("maps empty, hourly, daily and weekly specs", () => {
		expect(parseCronSchedule("")).toEqual({ kind: "off" });
		expect(parseCronSchedule("0 * * * *")).toEqual({ kind: "hourly" });
		expect(parseCronSchedule("0 3 * * *")).toEqual({ kind: "daily", hour: 3 });
		expect(parseCronSchedule("0 6 * * 1")).toEqual({ kind: "weekly", hour: 6, dow: 1 });
	});

	it("keeps unsupported specs as custom", () => {
		expect(parseCronSchedule("15 3 * * *")).toEqual({ kind: "custom", spec: "15 3 * * *" });
		expect(parseCronSchedule("0 3 1 * *")).toEqual({ kind: "custom", spec: "0 3 1 * *" });
	});

	it("round-trips the selectable kinds", () => {
		expect(cronScheduleSpec({ kind: "off" })).toBe("");
		expect(cronScheduleSpec({ kind: "hourly" })).toBe("0 * * * *");
		expect(cronScheduleSpec({ kind: "daily", hour: 3 })).toBe("0 3 * * *");
		expect(cronScheduleSpec({ kind: "weekly", hour: 6, dow: 1 })).toBe("0 6 * * 1");
		expect(cronScheduleSpec({ kind: "custom", spec: "15 3 * * *" })).toBe("15 3 * * *");
	});

	it("maps midnight and Sunday", () => {
		expect(parseCronSchedule("0 0 * * *")).toEqual({ kind: "daily", hour: 0 });
		expect(parseCronSchedule("0 0 * * 0")).toEqual({ kind: "weekly", hour: 0, dow: 0 });
	});
});
