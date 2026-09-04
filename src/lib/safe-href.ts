/** http(s) only — no javascript:, data:, file:, credentials. */
export function safeAppHref(raw: string | undefined | null): string {
	const href = String(raw ?? "").trim();
	if (!href || href.length > 2000) return "";
	const lower = href.toLowerCase();
	if (
		lower.startsWith("javascript:") ||
		lower.startsWith("data:") ||
		lower.startsWith("vbscript:") ||
		lower.startsWith("file:") ||
		lower.startsWith("about:")
	) {
		return "";
	}
	try {
		const u = new URL(href.includes("://") ? href : `https://${href}`);
		if (u.protocol !== "http:" && u.protocol !== "https:") return "";
		if (u.username || u.password) return "";
		return href.includes("://") ? href : u.href;
	} catch {
		return "";
	}
}
