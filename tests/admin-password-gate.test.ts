import { describe, expect, it } from "vitest";
import { fromDisk } from "@/lib/portal";
import { adminMustChangePassword, assertReadyPassword } from "@/lib/portal/session";

describe("adminMustChangePassword", () => {
	it("is true when the admin hash is missing", () => {
		const doc = fromDisk({
			settings: { title: "Dockit", locale: "en" },
			spaces: [{ id: "s1", name: "Home", categories: [] }],
			users: [{ id: "admin", username: "admin", roleIds: ["owner"] }],
		});
		expect(doc).not.toBeNull();
		expect(adminMustChangePassword(doc!)).toBe(true);
		expect(() => assertReadyPassword(doc!, { id: "admin" })).toThrow("errors.mustChangePassword");
		expect(() => assertReadyPassword(doc!, { id: "alice" })).not.toThrow();
	});
});
