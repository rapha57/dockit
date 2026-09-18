/** Scope requested when the admin has not configured one. */
export const DEFAULT_OIDC_SCOPE = "openid profile email";

/** Max length accepted for a stored scope string. */
export const OIDC_SCOPE_MAX = 200;

/**
 * Normalize a space-delimited OIDC scope string.
 *
 * Empty input falls back to {@link DEFAULT_OIDC_SCOPE}. Duplicates are dropped and
 * `openid` is forced in, because a scope without it is not an OIDC request at all —
 * the field is free-text, so an admin appending `groups` can easily drop it.
 * Scope tokens are case-sensitive (RFC 6749 §3.3), so comparison is exact.
 */
export function normalizeScope(raw?: string | null) {
	const parts = String(raw || "")
		.trim()
		.split(/\s+/)
		.filter(Boolean);
	if (!parts.length) return DEFAULT_OIDC_SCOPE;
	const out = [...new Set(parts)];
	if (!out.includes("openid")) out.unshift("openid");
	return out.join(" ").slice(0, OIDC_SCOPE_MAX);
}
