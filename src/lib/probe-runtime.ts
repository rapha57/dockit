import { execFile } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import { lookup } from "node:dns/promises";
import { clientIp } from "./security-runtime";

export type ProbeMode = "http" | "icmp";

export type ProbeTarget = {
  id: string;
  mode: ProbeMode;
  url?: string;
  host?: string;
};

export type ProbeResult = {
  id: string;
  ok: boolean;
  mode: ProbeMode;
  ms: number | null;
  detail: string;
  at: number;
};

const TIMEOUT_MS = 4000;
const HOST_RE = /^[A-Za-z0-9._:\]-]+$/;
const MAX_REDIRECTS = 3;
const PROBE_MAX = 24;
const PROBE_WINDOW_MS = 60_000;

const probeHits = new Map<string, { n: number; from: number }>();

function now() {
  return Date.now();
}

function describeNetError(err: unknown): string {
  if (!err) return "probe.unreachable";
  const e = err as { code?: string | number; message?: string; hostname?: string };
  const code = String(e.code ?? "");
  const msg = String(e.message ?? "");
  const host =
    String(e.hostname ?? "").trim() ||
    (msg.match(/ENOTFOUND\s+(\S+)/i)?.[1] ?? "");

  if (code === "ENOTFOUND" || code === "EAI_NONAME" || /ENOTFOUND/i.test(msg)) {
    return host ? `probe.hostNotFound|${host}` : "probe.hostUnknown";
  }
  if (code === "EAI_AGAIN") return "probe.dnsTemp";
  if (code === "ECONNREFUSED") return host ? `probe.refusedHost|${host}` : "probe.refused";
  if (code === "ECONNRESET") return "probe.reset";
  if (code === "ECONNABORTED") return "probe.aborted";
  if (code === "ETIMEDOUT" || code === "ESOCKETTIMEDOUT" || msg === "probe.timeout" || msg === "délai dépassé") {
    return "probe.timeout";
  }
  if (code === "EHOSTUNREACH") return "probe.hostUnreachable";
  if (code === "ENETUNREACH") return "probe.netUnreachable";
  if (code === "EPIPE") return "probe.closed";
  if (code === "ERR_TLS_CERT_ALTNAME_INVALID") return "probe.tlsName";
  if (code === "CERT_HAS_EXPIRED") return "probe.tlsExpired";
  if (code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE") return "probe.tlsUnverified";
  if (msg && !/getaddrinfo|syscall|ECONN|ENOTFOUND|EAI_/i.test(msg)) return msg;
  return "probe.unreachable";
}

function sanitizeHost(raw: string): string {
  const host = String(raw ?? "").trim();
  if (!host || host.length > 253 || !HOST_RE.test(host)) {
    throw new Error("errors.icmpHost");
  }
  return host.replace(/^\[/, "").replace(/\]$/, "");
}

function httpUrl(raw: string): URL {
  const text = String(raw ?? "").trim();
  const parsed = new URL(text);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("errors.httpRequired");
  }
  if (parsed.username || parsed.password) {
    throw new Error("errors.invalidUrl");
  }
  return parsed;
}

function isBlockedProbeHost(host: string, ip = ""): boolean {
  const h = host.replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
  const addr = ip.replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
  if (h === "metadata.google.internal" || h.endsWith(".metadata.google.internal")) return true;
  if (h === "169.254.169.254" || h === "169.254.170.2") return true;
  if (addr === "169.254.169.254" || addr === "169.254.170.2") return true;
  if (addr.startsWith("169.254.")) return true;
  if (addr === "fd00:ec2::254" || addr.startsWith("fe80:")) return true;
  return false;
}

async function assertProbeTarget(hostname: string): Promise<string> {
  const host = hostname.replace(/^\[/, "").replace(/\]$/, "");
  const looked = await lookup(host, { all: false });
  const ip = looked.address;
  if (isBlockedProbeHost(host, ip)) throw new Error("errors.probeForbidden");
  return ip;
}

function requestOnce(
  url: URL,
  method: "HEAD" | "GET",
  tlsVerify = false,
): Promise<{ status: number; location?: string }> {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method,
        timeout: TIMEOUT_MS,
        rejectUnauthorized: Boolean(tlsVerify),
        headers: {
          Accept: "*/*",
          "User-Agent": "Dockit-HealthCheck/1.0",
        },
      },
      (res) => {
        res.resume();
        resolve({
          status: res.statusCode ?? 0,
          location: typeof res.headers.location === "string" ? res.headers.location : undefined,
        });
      },
    );
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("probe.timeout"));
    });
    req.on("error", reject);
    req.end();
  });
}

export type HttpTraceHop = { status: number; location: string };

export type HttpTrace = {
	status: number;
	finalUrl: string;
	redirects: HttpTraceHop[];
	detail: string;
};

/**
 * Curation-only HTTP trace: same request engine as probeHttp (timeouts,
 * SSRF guards, redirect cap), but keeps the redirect chain instead of
 * swallowing it. Reachability behavior is untouched.
 */
export async function probeHttpTrace(rawUrl: string, tlsVerify = false): Promise<HttpTrace> {
	try {
		let url = httpUrl(rawUrl);
		await assertProbeTarget(url.hostname);
		const redirects: HttpTraceHop[] = [];
		let method: "HEAD" | "GET" = "HEAD";
		let status = 0;
		let detail = "";
		for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
			const res = await requestOnce(url, method, tlsVerify);
			if (res.status === 405 || res.status === 501) {
				method = "GET";
				continue;
			}
			if (res.status >= 300 && res.status < 400 && res.location) {
				try {
					const next = httpUrl(new URL(res.location, url).href);
					await assertProbeTarget(next.hostname);
					redirects.push({ status: res.status, location: next.href });
					url = next;
					continue;
				} catch {
					status = res.status;
					detail = `HTTP ${res.status}`;
					return { status, finalUrl: url.href, redirects, detail };
				}
			}
			status = res.status;
			detail = status > 0 ? `HTTP ${status}` : "probe.noHttp";
			return { status, finalUrl: url.href, redirects, detail };
		}
		return { status, finalUrl: url.href, redirects, detail: detail || "probe.noHttp" };
	} catch (err) {
		return { status: 0, finalUrl: String(rawUrl || ""), redirects: [], detail: describeNetError(err) };
	}
}

export async function probeHttp(id: string, rawUrl: string, tlsVerify = false): Promise<ProbeResult> {
  const started = now();
  try {
    let url = httpUrl(rawUrl);
    await assertProbeTarget(url.hostname);
    let method: "HEAD" | "GET" = "HEAD";
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const res = await requestOnce(url, method, tlsVerify);
      if (res.status === 405 || res.status === 501) {
        method = "GET";
        continue;
      }
      if (res.status >= 300 && res.status < 400 && res.location) {
        try {
          url = httpUrl(new URL(res.location, url).href);
          await assertProbeTarget(url.hostname);
        } catch {
          break;
        }
        continue;
      }
      if (res.status >= 200 && res.status < 300) {
        return {
          id,
          ok: true,
          mode: "http",
          ms: now() - started,
          detail: `HTTP ${res.status}`,
          at: now(),
        };
      }
      if (res.status > 0) {
        return {
          id,
          ok: false,
          mode: "http",
          ms: now() - started,
          detail: `HTTP ${res.status}`,
          at: now(),
        };
      }
    }
    return {
      id,
      ok: false,
      mode: "http",
      ms: now() - started,
      detail: "probe.noHttp",
      at: now(),
    };
  } catch (err) {
    return {
      id,
      ok: false,
      mode: "http",
      ms: now() - started,
      detail: describeNetError(err),
      at: now(),
    };
  }
}

let pingBin: string | null | undefined;

async function resolvePing(): Promise<string | null> {
  if (pingBin !== undefined) return pingBin;
  for (const candidate of ["/usr/bin/ping", "/bin/ping", "/usr/sbin/ping"]) {
    try {
      await access(candidate, fsConstants.X_OK);
      pingBin = candidate;
      return candidate;
    } catch {
      /* try next */
    }
  }
  pingBin = null;
  return null;
}

function execPing(bin: string, ip: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      bin,
      ["-n", "-c", "1", "-W", "2", ip],
      { timeout: TIMEOUT_MS + 500, maxBuffer: 8_000 },
      (err, stdout, stderr) => {
        const code = err && typeof err.code === "number" ? err.code : err ? 2 : 0;
        resolve({ code, stdout: String(stdout || ""), stderr: String(stderr || "") });
      },
    );
  });
}

export async function probeIcmp(id: string, rawHost: string): Promise<ProbeResult> {
  const started = now();
  try {
    const host = sanitizeHost(rawHost);
    const ip = await assertProbeTarget(host);
    const bin = await resolvePing();
    if (!bin) {
      return {
        id,
        ok: false,
        mode: "icmp",
        ms: now() - started,
        detail: `probe.icmpUnavailable|${ip}`,
        at: now(),
      };
    }
    const result = await execPing(bin, ip);
    const rtt = result.stdout.match(/time[=<]\s*([\d.]+)\s*ms/i);
    const ms = rtt ? Math.round(Number(rtt[1])) : now() - started;
    if (result.code === 0) {
      return {
        id,
        ok: true,
        mode: "icmp",
        ms,
        detail: `ICMP ${ip} · ${ms} ms`,
        at: now(),
      };
    }
    return {
      id,
      ok: false,
      mode: "icmp",
      ms: now() - started,
      detail: `probe.icmpNoReply|${ip}`,
      at: now(),
    };
  } catch (err) {
    return {
      id,
      ok: false,
      mode: "icmp",
      ms: now() - started,
      detail: describeNetError(err),
      at: now(),
    };
  }
}

export async function probeOne(target: ProbeTarget, tlsVerify = false): Promise<ProbeResult> {
  if (target.mode === "icmp") {
    return probeIcmp(target.id, target.host || "");
  }
  return probeHttp(target.id, target.url || "", tlsVerify);
}

export function probeAllowed(request: unknown): boolean {
  const ip = clientIp(request as { headers?: { get?: (k: string) => string | null } | Record<string, string> });
  const ts = Date.now();
  const row = probeHits.get(ip) || { n: 0, from: ts };
  if (ts - row.from > PROBE_WINDOW_MS) {
    row.n = 0;
    row.from = ts;
  }
  row.n += 1;
  probeHits.set(ip, row);
  return row.n <= PROBE_MAX;
}
