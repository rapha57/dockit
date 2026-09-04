export const SESS_COOKIE = "portal_sess";
export const SESS_MAX_AGE = 43200;

export function parseSessCookie(header: string | null | undefined): string {
	if (!header) return "";
	for (const part of String(header).split(";")) {
		const i = part.indexOf("=");
		if (i < 0) continue;
		if (part.slice(0, i).trim() !== SESS_COOKIE) continue;
		try {
			return decodeURIComponent(part.slice(i + 1).trim());
		} catch {
			return "";
		}
	}
	return "";
}

export function sessCookieHeader(token: string, secure: boolean): string {
	const parts = [
		`${SESS_COOKIE}=${encodeURIComponent(token)}`,
		"Path=/",
		"HttpOnly",
		"SameSite=Lax",
		`Max-Age=${SESS_MAX_AGE}`,
	];
	if (secure) parts.push("Secure");
	return parts.join("; ");
}

export function clearSessCookieHeader(): string {
	return `${SESS_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
