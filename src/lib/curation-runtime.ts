/**
 * Curation — technical state of card-link checks.
 *
 * portal.json stays the single source of truth for cards/links.
 * curation.json only stores the outcome of the last check per card link.
 */

import { dirname } from "node:path";
import { clientIp } from "./security-runtime";

export type CurationStatus = "valid" | "redirect" | "error" | "timeout" | "unknown";

export type CurationCheck = {
	status: CurationStatus;
	httpStatus?: number;
	checkedAt: number;
	responseTimeMs: number | null;
	url: string;
	finalUrl?: string;
	detail?: string;
};

export type CurationStore = {
	version: 1;
	updatedAt: number;
	checks: Record<string, Record<string, CurationCheck>>;
};

export const CURATION_MAX_CARDS = 4000;

const STATUSES: CurationStatus[] = ["valid", "redirect", "error", "timeout", "unknown"];

function asCheck(raw: unknown): CurationCheck | null {
	if (!raw || typeof raw !== "object") return null;
	const row = raw as Record<string, unknown>;
	const status = STATUSES.includes(row.status as CurationStatus) ? (row.status as CurationStatus) : "unknown";
	const url = String(row.url || "").slice(0, 2000);
	if (!url) return null;
	const httpStatus = Number(row.httpStatus);
	const out: CurationCheck = {
		status,
		checkedAt: Number(row.checkedAt) || 0,
		responseTimeMs: Number.isFinite(Number(row.responseTimeMs)) ? Math.max(0, Math.round(Number(row.responseTimeMs))) : null,
		url
	};
	if (Number.isInteger(httpStatus) && httpStatus > 0 && httpStatus < 1000) out.httpStatus = httpStatus;
	const finalUrl = String(row.finalUrl || "").slice(0, 2000);
	if (finalUrl) out.finalUrl = finalUrl;
	const detail = String(row.detail || "").slice(0, 120);
	if (detail) out.detail = detail;
	return out;
}

export function asCurationStore(raw: unknown): CurationStore {
	const out: CurationStore = { version: 1, updatedAt: 0, checks: {} };
	if (!raw || typeof raw !== "object") return out;
	const row = raw as Record<string, unknown>;
	out.updatedAt = Number(row.updatedAt) || 0;
	if (row.checks && typeof row.checks === "object") {
		const source = row.checks as Record<string, unknown>;
		for (const cardId of Object.keys(source).slice(0, CURATION_MAX_CARDS)) {
			const links = source[cardId];
			if (!links || typeof links !== "object") continue;
			const card: Record<string, CurationCheck> = {};
			for (const key of Object.keys(links as Record<string, unknown>).slice(0, 8)) {
				const check = asCheck((links as Record<string, unknown>)[key]);
				if (check) card[key.slice(0, 8)] = check;
			}
			if (Object.keys(card).length) out.checks[cardId.slice(0, 80)] = card;
		}
	}
	return out;
}

export function pruneCurationChecks(store: CurationStore, knownCardIds: Set<string>): boolean {
	let changed = false;
	for (const cardId of Object.keys(store.checks)) {
		if (!knownCardIds.has(cardId)) {
			delete store.checks[cardId];
			changed = true;
		}
	}
	return changed;
}

export function curationPath(join: (dir: string, ...parts: string[]) => string): string {
	const custom = process.env.PORTAL_DATA_FILE?.trim();
	if (custom) return join(dirname(custom), "curation.json");
	return join(process.cwd(), "data", "curation.json");
}

export async function readCurationStore(): Promise<CurationStore> {
	const { readFile } = await import("node:fs/promises");
	const { join } = await import("node:path");
	try {
		const text = await readFile(curationPath(join), "utf8");
		return asCurationStore(JSON.parse(text));
	} catch {
		return asCurationStore(null);
	}
}

export async function writeCurationStore(store: CurationStore): Promise<void> {
	const { mkdir, rename, writeFile, unlink } = await import("node:fs/promises");
	const { dirname: dirn, join } = await import("node:path");
	const path = curationPath(join);
	await mkdir(dirn(path), { recursive: true });
	const tmp = `${path}.${process.pid}.${crypto.randomUUID()}.tmp`;
	try {
		await writeFile(tmp, `${JSON.stringify(store, null, 2)}\n`, "utf8");
		await rename(tmp, path);
	} catch (err) {
		await unlink(tmp).catch(() => void 0);
		throw err;
	}
}

const scanHits = new Map<string, { n: number; from: number }>();
const SCAN_MAX = 120;
const SCAN_WINDOW_MS = 60_000;

export function curationScanAllowed(request: unknown): boolean {
	const ip = clientIp(request as { headers?: { get?: (k: string) => string | null } | Record<string, string> });
	const ts = Date.now();
	const row = scanHits.get(ip) || { n: 0, from: ts };
	if (ts - row.from > SCAN_WINDOW_MS) {
		row.n = 0;
		row.from = ts;
	}
	row.n += 1;
	scanHits.set(ip, row);
	return row.n <= SCAN_MAX;
}
