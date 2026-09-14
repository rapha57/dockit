/** Requires `scheme://…` (e.g. https://host). Does not prefix https. */
export function hasLinkScheme(raw: string | undefined | null): boolean {
	return /^[^\s/:]+:\/\/\S/.test(String(raw ?? "").trim());
}

const BLOCKED_SCHEMES = new Set(["javascript:", "data:", "vbscript:", "file:", "about:"]);

/** Any `scheme://…` except javascript/data/file. http(s) still reject embedded credentials. */
export function safeAppHref(raw: string | undefined | null): string {
	const href = String(raw ?? "").trim();
	if (!href || href.length > 2000) return "";
	if (!hasLinkScheme(href)) return "";
	try {
		const u = new URL(href);
		const proto = u.protocol.toLowerCase();
		if (BLOCKED_SCHEMES.has(proto)) return "";
		if ((proto === "http:" || proto === "https:") && (u.username || u.password)) return "";
		return href;
	} catch {
		return "";
	}
}

/** iframe / HTTP probe / favicon — http(s) only. */
export function safeEmbedHref(raw: string | undefined | null): string {
	const href = safeAppHref(raw);
	if (!href) return "";
	try {
		const proto = new URL(href).protocol.toLowerCase();
		if (proto !== "http:" && proto !== "https:") return "";
		return href;
	} catch {
		return "";
	}
}
