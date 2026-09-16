import { afterEach, describe, expect, it, vi } from "vitest";
import { newId } from "@/lib/id";

const UUID_V4 =
	/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("newId", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("returns a UUID v4", () => {
		expect(newId()).toMatch(UUID_V4);
	});

	it("does not collide in a small batch", () => {
		const ids = new Set(Array.from({ length: 200 }, () => newId()));
		expect(ids.size).toBe(200);
	});

	it("works when crypto.randomUUID is missing", () => {
		vi.stubGlobal("crypto", {
			getRandomValues(buf: Uint8Array) {
				for (let i = 0; i < buf.length; i++) buf[i] = i;
				return buf;
			},
		});
		expect(newId()).toMatch(UUID_V4);
	});

	it("falls back when getRandomValues throws", () => {
		vi.stubGlobal("crypto", {
			getRandomValues() {
				throw new Error("insecure");
			},
		});
		expect(newId()).toMatch(UUID_V4);
	});

	it("falls back when crypto is missing", () => {
		vi.stubGlobal("crypto", undefined);
		expect(newId()).toMatch(UUID_V4);
	});
});
