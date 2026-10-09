import { isWeakPassword } from "./security";

export function isDevRuntime(): boolean {
	return process.env.NODE_ENV !== "production";
}

export function trustProxy(): boolean {
	const v = String(process.env.PORTAL_TRUST_PROXY || "").trim().toLowerCase();
	return v === "1" || v === "true" || v === "yes";
}

function envTrimmed(name: string): string {
	return String(process.env[name] || "").trim().slice(0, 200);
}

export function envOidcClientSecret(): string {
	return envTrimmed("PORTAL_OIDC_CLIENT_SECRET");
}

export function envLdapBindPassword(directoryId?: string): string {
	const id = String(directoryId || "").trim();
	if (id) {
		const suffix = id.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "").toUpperCase();
		if (suffix) {
			const specific = envTrimmed(`PORTAL_LDAP_BIND_PASSWORD_${suffix}`);
			if (specific) return specific;
		}
	}
	return envTrimmed("PORTAL_LDAP_BIND_PASSWORD");
}

export function assertProductionSecrets(): void {
	if (process.env.NODE_ENV !== "production") return;
	const pass = String(process.env.PORTAL_EDIT_PASSWORD || "").trim();
	if (isWeakPassword(pass)) {
		throw new Error(
			"PORTAL_EDIT_PASSWORD required in production (12 characters min., not a default value).",
		);
	}
}

type HeaderBag = { get?: (k: string) => string | null } | Record<string, string> | undefined;

export type RequestLike = {
	url?: string;
	headers?: HeaderBag;
} | null | undefined;

function headerOf(request: RequestLike, name: string): string {
	try {
		const headers = request?.headers;
		if (!headers) return "";
		if (typeof headers.get === "function") return String(headers.get(name) || "");
		const rec = headers as Record<string, string>;
		const direct = rec[name] ?? rec[name.toLowerCase()];
		return String(direct || "");
	} catch {
		return "";
	}
}

function firstForwarded(raw: string): string {
	return raw.split(",")[0]?.trim() || "";
}

/** Host without port. `[::1]:8080` → `::1`. */
export function hostnameOf(host: string): string {
	const raw = String(host || "").trim().toLowerCase();
	if (!raw) return "";
	if (raw.startsWith("[")) {
		const end = raw.indexOf("]");
		return end > 1 ? raw.slice(1, end) : raw.replace(/^\[/, "").replace(/\]$/, "");
	}
	if (raw.includes(".") && raw.includes(":")) return raw.replace(/:\d+$/, "");
	if (/^localhost:\d+$/i.test(raw)) return "localhost";
	if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(raw)) return raw.replace(/:\d+$/, "");
	return raw;
}

export function isLoopbackHost(host: string): boolean {
	const h = hostnameOf(host).replace(/^::ffff:/, "");
	return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "0:0:0:0:0:0:0:1";
}

export function requestProtoHost(request: RequestLike): { proto: "http" | "https"; host: string } {
	let proto = "";
	let host = "";
	if (request?.url) {
		try {
			const u = new URL(request.url);
			proto = u.protocol.replace(":", "");
			host = u.host;
		} catch {
			/* ignore */
		}
	}
	if (!host) host = headerOf(request, "host");
	if (trustProxy()) {
		const xfProto = firstForwarded(headerOf(request, "x-forwarded-proto"));
		const xfHost = firstForwarded(headerOf(request, "x-forwarded-host")) || headerOf(request, "host");
		if (xfProto) proto = xfProto;
		if (xfHost) host = xfHost;
	}
	return {
		proto: proto.toLowerCase() === "https" ? "https" : "http",
		host,
	};
}

/** Loopback HTTP only. Unknown request → not local (fail closed, force HttpOnly). */
export function isLocalHttp(request: RequestLike): boolean {
	if (!request) return false;
	const { proto, host } = requestProtoHost(request);
	return proto === "http" && isLoopbackHost(host);
}

export function effectiveSessionHttpOnly(request: RequestLike, setting: boolean): boolean {
	if (!isLocalHttp(request)) return true;
	return Boolean(setting);
}

export function clientIp(request: { headers?: HeaderBag } | undefined): string {
	if (!trustProxy()) return "local";
	try {
		const xf = headerOf(request, "x-forwarded-for");
		if (xf) {
			const ip = firstForwarded(xf);
			if (ip) return ip;
		}
	} catch {
		/* ignore */
	}
	return "local";
}
