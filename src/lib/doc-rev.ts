import { createMiddleware } from "@tanstack/react-start";

const REV_HEADER = "x-dockit-rev";

let seen = 0;

export function asDocRev(raw: unknown): number {
	const n = Number(raw);
	if (!Number.isFinite(n) || n < 0) return 0;
	return Math.floor(n);
}

export function readDocRev(): number {
	return seen;
}

export function noteDocRev(payload: unknown) {
	if (!payload || typeof payload !== "object" || !("rev" in payload)) return;
	seen = asDocRev((payload as { rev: unknown }).rev);
}

export function isConflict(err: unknown): boolean {
	const msg = err instanceof Error ? err.message : String(err || "");
	if (msg !== "errors.conflict") return false;
	try {
		window.dispatchEvent(new Event("portal-doc-conflict"));
	} catch {
		// ignore
	}
	return true;
}

export function takeExpectedRev(
	data: { token?: unknown; rev?: unknown } | null | undefined,
	request?: { headers?: { get?: (k: string) => string | null } } | null,
): number | undefined {
	if (!String(data?.token ?? "").trim()) return undefined;
	if (data && "rev" in data && data.rev != null && data.rev !== "") return asDocRev(data.rev);
	const header = typeof request?.headers?.get === "function" ? request.headers.get(REV_HEADER) : null;
	if (header && /^\d+$/.test(header)) return Number(header);
	return undefined;
}

export function assertWritableRev(doc: { rev?: number }, expected: number | undefined): boolean {
	if (expected == null) return false;
	if (asDocRev(doc.rev) !== expected) throw new Error("errors.conflict");
	return true;
}

export function bumpDocRev(doc: { rev?: number }) {
	doc.rev = asDocRev(doc.rev) + 1;
}

export const attachDocRev = createMiddleware({ type: "function" }).client(async ({ next }) => {
	return next({
		headers: { [REV_HEADER]: String(readDocRev()) },
	});
});
