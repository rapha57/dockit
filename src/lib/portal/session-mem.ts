export type SessionRow = { userId: string; exp: number };

export const SESSION_MAP_KEY = "__dockitSessions";

type SessionGlobal = typeof globalThis & { [SESSION_MAP_KEY]?: Map<string, SessionRow> };

// Nitro routes and the TanStack server bundle each evaluate this module.
// A module-level Map is a different object in each bundle, so a token issued
// at login is invisible to POST /__dockit/session (same process, shared global).
export function sessionMap(): Map<string, SessionRow> {
	const g = globalThis as SessionGlobal;
	return (g[SESSION_MAP_KEY] ??= new Map());
}

export function sessionAlive(token: string | null | undefined): boolean {
	if (!token) return false;
	const row = sessionMap().get(token);
	return Boolean(row && row.exp >= Date.now());
}

const TOKEN_RE = /^[a-f0-9]{48}$/i;

export function acceptSessionToken(token: unknown): string {
	const value = String(token ?? "");
	if (!TOKEN_RE.test(value) || !sessionAlive(value)) return "";
	return value;
}
