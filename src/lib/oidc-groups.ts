/** Max length accepted for a stored group filter. */
export const GROUP_FILTER_MAX = 400;

/**
 * Split a stored filter into patterns.
 *
 * Comma-separated, not whitespace-separated: directory group names routinely
 * contain spaces ("Domain Admins"), so splitting on whitespace would make them
 * impossible to express.
 */
export function parseGroupFilter(raw?: string | null): string[] {
	return String(raw || "")
		.split(",")
		.map((p) => p.trim())
		.filter(Boolean);
}

function toRegExp(pattern: string) {
	const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, "[\\s\\S]*");
	return new RegExp(`^${escaped}$`, "i");
}

/**
 * Does this claim value match any pattern? `*` is the only wildcard.
 *
 * Matching is case-insensitive: the filter is admin-typed and IdPs are
 * inconsistent about casing. The group is still stored under the name the IdP
 * sent, so the externalId keeps the provider's own spelling.
 */
export function matchesGroupFilter(name: string, patterns: string[]) {
	return patterns.some((p) => toRegExp(p).test(name));
}

/**
 * Narrow a claim's group names to those the admin wants mirrored.
 *
 * An empty filter keeps everything, which is the behaviour every install had
 * before the filter existed.
 */
export function filterGroupNames(names: string[], raw?: string | null): string[] {
	const patterns = parseGroupFilter(raw);
	if (!patterns.length) return names;
	return names.filter((name) => matchesGroupFilter(name, patterns));
}
