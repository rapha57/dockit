export type OutboundProxyCfg = {
	enabled: boolean;
	host: string;
	port: number;
	username: string;
	password: string;
};

type ProxyAgentLike = { close?: () => void };
let cfg: OutboundProxyCfg | null = null;
let agent: ProxyAgentLike | null = null;
let agentKey = "";

export function cleanProxyHost(raw: unknown): string {
	let host = String(raw || "").trim();
	host = host.replace(/^https?:\/\//i, "");
	host = host.split("/")[0] || "";
	if (host.includes("]") && host.startsWith("[")) {
		const end = host.indexOf("]");
		return host.slice(0, end + 1).slice(0, 253);
	}
	host = host.split(":")[0] || "";
	return host.slice(0, 253);
}

export function cleanProxyPort(raw: unknown, fallback = 3128): number {
	const n = Number(raw);
	if (!Number.isFinite(n) || n < 1 || n > 65535) return fallback;
	return Math.floor(n);
}

function envProxyHref(): string {
	return String(process.env.PORTAL_HTTP_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || "").trim();
}

export function proxyHref(override?: OutboundProxyCfg | null): string {
	const env = envProxyHref();
	if (env) return env;
	const live = override ?? cfg;
	if (!live?.enabled) return "";
	const host = cleanProxyHost(live.host);
	if (!host) return "";
	const port = cleanProxyPort(live.port);
	const u = new URL("http://placeholder");
	u.hostname = host.replace(/^\[/, "").replace(/\]$/, "");
	u.port = String(port);
	if (live.username) u.username = live.username;
	if (live.password) u.password = live.password;
	return u.href;
}

export function setOutboundProxy(next: OutboundProxyCfg | null) {
	cfg = next;
	const key = proxyHref(next);
	if (key !== agentKey) {
		void agent?.close?.();
		agent = null;
		agentKey = key;
	}
}

export async function outboundFetch(input: string | URL, init: RequestInit = {}): Promise<Response> {
	if (typeof window !== "undefined") return fetch(input, init);
	const href = proxyHref();
	if (!href) return fetch(input, init);
	const undici = await import(/* @vite-ignore */ "undici");
	if (!agent) {
		agent = new undici.ProxyAgent(href);
		agentKey = href;
	}
	return undici.fetch(input, { ...init, dispatcher: agent } as Parameters<typeof undici.fetch>[1]) as Promise<Response>;
}
