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

export function clientIp(request: { headers?: { get?: (k: string) => string | null } | Record<string, string> } | undefined): string {
	if (!trustProxy()) return "local";
	try {
		const headers = request?.headers;
		const xf =
			typeof headers?.get === "function"
				? headers.get("x-forwarded-for")
				: (headers as Record<string, string> | undefined)?.["x-forwarded-for"];
		if (xf) {
			const ip = String(xf).split(",")[0].trim();
			if (ip) return ip;
		}
	} catch {
		/* ignore */
	}
	return "local";
}
