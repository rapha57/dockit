import { describe, expect, it } from "vitest";
import {
	asDocRev,
	assertWritableRev,
	bumpDocRev,
	isConflict,
	takeExpectedRev,
} from "@/lib/doc-rev";
import { fromDisk, toDisk } from "@/lib/portal";

describe("asDocRev", () => {
	it("floors a finite number and treats junk as 0", () => {
		expect(asDocRev(3.9)).toBe(3);
		expect(asDocRev("12")).toBe(12);
		expect(asDocRev(-1)).toBe(0);
		expect(asDocRev(undefined)).toBe(0);
		expect(asDocRev("nope")).toBe(0);
	});
});

describe("takeExpectedRev", () => {
	it("ignores login payloads without a token", () => {
		expect(takeExpectedRev({ rev: 4 }, { headers: { get: () => "9" } })).toBeUndefined();
		expect(takeExpectedRev({}, { headers: { get: () => "9" } })).toBeUndefined();
	});

	it("prefers a body rev, then the request header", () => {
		const request = { headers: { get: (k: string) => (k === "x-dockit-rev" ? "7" : null) } };
		expect(takeExpectedRev({ token: "t", rev: 3 }, request)).toBe(3);
		expect(takeExpectedRev({ token: "t" }, request)).toBe(7);
	});
});

describe("assertWritableRev", () => {
	it("skips when the client sent no rev", () => {
		expect(assertWritableRev({ rev: 4 }, undefined)).toBe(false);
	});

	it("throws on mismatch and accepts a match", () => {
		expect(assertWritableRev({ rev: 4 }, 4)).toBe(true);
		expect(() => assertWritableRev({ rev: 4 }, 3)).toThrow("errors.conflict");
		expect(isConflict(new Error("errors.conflict"))).toBe(true);
	});
});

describe("bumpDocRev", () => {
	it("increments from missing as 0", () => {
		const doc: { rev?: number } = {};
		bumpDocRev(doc);
		expect(doc.rev).toBe(1);
		bumpDocRev(doc);
		expect(doc.rev).toBe(2);
	});
});

describe("store rev", () => {
	it("defaults missing rev to 0 and writes it back", () => {
		const doc = fromDisk({ settings: { title: "Dockit" }, spaces: [] });
		expect(doc).not.toBeNull();
		expect(doc!.rev).toBe(0);
		expect(toDisk(doc!).rev).toBe(0);
		const again = fromDisk({ settings: { title: "Dockit" }, spaces: [], rev: 11 });
		expect(again!.rev).toBe(11);
		expect(toDisk(again!).rev).toBe(11);
	});
});
