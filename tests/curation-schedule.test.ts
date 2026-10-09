import { describe, expect, it } from "vitest";
import { scheduleTick } from "@/lib/curation-schedule";

describe("scheduleTick", () => {
	it("fires once per matching minute", () => {
		const at = new Date(2026, 9, 9, 3, 0, 12);
		const first = scheduleTick("0 3 * * *", at, "");
		expect(first.fire).toBe(true);
		expect(first.minute).toBe("2026-10-9 3:0");
		const again = scheduleTick("0 3 * * *", at, first.minute);
		expect(again.fire).toBe(false);
		expect(scheduleTick("", at, "").fire).toBe(false);
		expect(scheduleTick("0 4 * * *", at, "").fire).toBe(false);
	});
});
