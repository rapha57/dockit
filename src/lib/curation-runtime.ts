/**
 * Curation — technical state of card-link checks.
 *
 * portal.json stays the single source of truth for cards/links.
 * curation.json only stores the outcome of the last check per card link.
 */

import { dirname } from "node:path";
import { newId } from "./id";
import { t, withLocale } from "./i18n";
import { clientIp, isDevRuntime } from "./security-runtime";

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

export function curationCheckOf(url: string, trace: import("./probe-runtime").HttpTrace): CurationCheck {
	const check: CurationCheck = { status: "error", checkedAt: Date.now(), responseTimeMs: trace.ms, url };
	if (trace.redirects.length) {
		check.status = "redirect";
		check.httpStatus = trace.redirects[0].status;
		check.finalUrl = trace.finalUrl;
		return check;
	}
	if (trace.status >= 200 && trace.status < 300) {
		check.status = "valid";
		check.httpStatus = trace.status;
		return check;
	}
	if (trace.status >= 300 && trace.status < 400) {
		check.status = "redirect";
		check.httpStatus = trace.status;
		check.finalUrl = trace.finalUrl;
		return check;
	}
	if (trace.detail === "probe.timeout") {
		check.status = "timeout";
		return check;
	}
	check.detail = trace.detail;
	return check;
}

export type CurationJobTarget = {
	cardId: string;
	key: string;
	url: string;
	label: string;
	title: string;
	mode?: "http" | "icmp";
	host?: string;
};

export function curationCheckFromIcmp(host: string, result: { ok: boolean; ms: number | null; detail: string }): CurationCheck {
	const detail = String(result.detail || "");
	const timeout = /timeout/i.test(detail);
	return {
		status: result.ok ? "valid" : timeout ? "timeout" : "error",
		checkedAt: Date.now(),
		responseTimeMs: result.ms == null ? null : Math.max(0, Math.round(result.ms)),
		url: host,
		detail: detail.slice(0, 120)
	};
}

export type CurationJobView = {
	running: boolean;
	done: number;
	total: number;
	current: string;
	counts: { valid: number; redirect: number; error: number; timeout: number };
	log: string[];
	startedAt: number;
	finishedAt: number;
};

type CurationJobState = CurationJobView & { run: number };

const JOB_LOG_MAX = 200;
const JOB_MAX_MS = 600_000;
const JOB_BATCH = 4;

let curationJob: CurationJobState | null = null;
let curationJobRun = 0;

function jobWhere(target: CurationJobTarget): string {
	return target.label ? `${target.title} — ${target.label}` : target.title;
}

function jobLine(target: CurationJobTarget, check: CurationCheck, locale: unknown): string {
	return withLocale(locale, () => {
		const where = jobWhere(target);
		if (check.status === "valid") {
			if (target.mode === "icmp") return `✓ ICMP · ${check.responseTimeMs ?? 0} ms · ${where}`;
			return `✓ ${check.httpStatus || 200} · ${check.responseTimeMs ?? 0} ms · ${where}`;
		}
		if (check.status === "redirect") {
			let to = check.finalUrl || "";
			try {
				const from = new URL(check.url);
				const next = new URL(to);
				to = next.host === from.host ? `${next.pathname}${next.search}` : to;
			} catch {
				// keep full URL
			}
			return `↗ ${check.httpStatus || ""} → ${to} · ${where}`.replace("↗  →", "↗ →");
		}
		if (check.status === "timeout") {
			return `✕ ${t("curation.statusTimeout")} · ${where}`;
		}
		return `✕ ${check.httpStatus || t("curation.statusError")} · ${where}`;
	});
}

export function curationJobRunning(): boolean {
	return Boolean(curationJob?.running);
}

export function curationJobStop(): boolean {
	const job = curationJob;
	if (!job || !job.running) return false;
	curationJobRun += 1;
	job.running = false;
	job.current = "";
	job.finishedAt = Date.now();
	return true;
}

export function curationJobSnapshot(): CurationJobView {
	const job = curationJob;
	return {
		running: Boolean(job?.running),
		done: job?.done || 0,
		total: job?.total || 0,
		current: job?.current || "",
		counts: job ? { ...job.counts } : { valid: 0, redirect: 0, error: 0, timeout: 0 },
		log: job ? job.log.slice(-JOB_LOG_MAX) : [],
		startedAt: job?.startedAt || 0,
		finishedAt: job?.finishedAt || 0
	};
}

/**
 * Runs the whole analysis inside the server process: survives panel close
 * and page refresh. Results merge into curation.json after every batch.
 */
export async function startCurationJob(opts: {
	targets: CurationJobTarget[];
	tlsVerify: boolean;
	known: string[];
	locale: unknown;
}): Promise<boolean> {
	if (curationJob?.running) return false;
	const run = ++curationJobRun;
	curationJob = {
		running: true,
		run,
		done: 0,
		total: opts.targets.length,
		current: "",
		startedAt: Date.now(),
		finishedAt: 0,
		counts: { valid: 0, redirect: 0, error: 0, timeout: 0 },
		log: []
	};
	const known = new Set(opts.known);
	const store = await readCurationStore();
	const { probeHttpTrace, probeIcmp } = await import("./probe-runtime");
	const dnsCache = new Map<string, string>();
	if (isDevRuntime()) {
		const { appendFileSync } = await import("node:fs");
		appendFileSync("/tmp/dockit-curation.log", `\n=== job ${new Date().toISOString()} · ${opts.targets.length} liens ===\n`);
	}
	for (let i = 0; i < opts.targets.length; i += JOB_BATCH) {
		if (curationJobRun !== run) break;
		if (Date.now() - curationJob.startedAt > JOB_MAX_MS) break;
		const slice = opts.targets.slice(i, i + JOB_BATCH);
		const first = slice[0];
		curationJob.current = jobWhere(first);
		if (isDevRuntime()) {
			const { appendFileSync } = await import("node:fs");
			appendFileSync("/tmp/dockit-curation.log", `batch ${i}..${i + slice.length} · ${slice.map((t) => t.url).join(" | ")}\n`);
		}
		const results = await Promise.all(
			slice.map(async (target) => {
				if (target.mode === "icmp") {
					const result = await probeIcmp(target.cardId, target.host || target.url);
					return { target, check: curationCheckFromIcmp(target.host || target.url, result) };
				}
				const trace = await probeHttpTrace(target.url, opts.tlsVerify, dnsCache);
				return { target, check: curationCheckOf(target.url, trace) };
			})
		);
		const job = curationJob;
		if (!job || job.run !== run) break;
		for (const { target, check } of results) {
			const card = store.checks[target.cardId] || (store.checks[target.cardId] = {});
			card[target.key] = check;
			if (check.status !== "unknown") job.counts[check.status] += 1;
			job.log.push(jobLine(target, check, opts.locale));
			if (isDevRuntime()) {
				const { appendFileSync } = await import("node:fs");
				appendFileSync(
					"/tmp/dockit-curation.log",
					`${check.status} · ${check.responseTimeMs ?? 0} ms · ${target.url}${check.detail ? ` · ${check.detail}` : ""}\n`,
				);
			}
		}
		if (job.log.length > JOB_LOG_MAX) job.log = job.log.slice(-JOB_LOG_MAX);
		job.done = Math.min(i + slice.length, opts.targets.length);
		job.current = "";
		store.updatedAt = Date.now();
		pruneCurationChecks(store, known);
		await writeCurationStore(store);
	}
	if (curationJobRun === run && curationJob && curationJob.run === run) {
		curationJob.running = false;
		curationJob.current = "";
		curationJob.finishedAt = Date.now();
		if (isDevRuntime()) {
			const { appendFileSync } = await import("node:fs");
			appendFileSync(
				"/tmp/dockit-curation.log",
				`fin job: done=${curationJob.done}/${curationJob.total} en ${Math.round((curationJob.finishedAt - curationJob.startedAt) / 1000)}s\n`,
			);
		}
	}
	return true;
}

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
	const tmp = `${path}.${process.pid}.${newId()}.tmp`;
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
