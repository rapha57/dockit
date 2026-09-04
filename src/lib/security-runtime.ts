import { isWeakPassword } from "./security";

export function isDevRuntime(): boolean {
	return process.env.NODE_ENV !== "production";
}

export function trustProxy(): boolean {
	const v = String(process.env.PORTAL_TRUST_PROXY || "").trim().toLowerCase();
	return v === "1" || v === "true" || v === "yes";
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
