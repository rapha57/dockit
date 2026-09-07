const HOST_RE = /^[A-Za-z0-9._:\]-]+$/;
const MAX_BYTES = 220_000;
const TIMEOUT_MS = 4000;

function hostOf(url: string): string {
	const u = new URL(url);
	const host = u.hostname.replace(/^\[/, "").replace(/\]$/, "");
	if (!host || host.length > 253 || !HOST_RE.test(host)) {
		throw new Error("errors.invalidHost");
	}
	if (host === "localhost" || /\.(local|lan|internal|home)$/i.test(host)) {
		throw new Error("errors.noLocalFavicon");
	}
	return host;
}

function providerUrls(host: string): string[] {
	return [
		`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`,
		`https://icons.duckduckgo.com/ip3/${encodeURIComponent(host)}.ico`,
	];
}

function assertProvider(src: string) {
	const u = new URL(src);
	const google = u.hostname === "www.google.com" && u.pathname === "/s2/favicons";
	const ddg = u.hostname === "icons.duckduckgo.com" && u.pathname.startsWith("/ip3/");
	if (u.protocol !== "https:" || (!google && !ddg)) {
		throw new Error("errors.forbiddenSource");
	}
}

function mimeOf(bytes: Buffer, src: string): string {
	if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
	if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
	if (bytes[0] === 0x47 && bytes[1] === 0x49) return "image/gif";
	if (bytes[0] === 0x52 && bytes[1] === 0x49) return "image/webp";
	if (src.includes(".ico") || (bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x01)) {
		return "image/x-icon";
	}
	return "image/png";
}

async function fetchBytes(src: string): Promise<Buffer> {
	assertProvider(src);
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
	try {
		const res = await fetch(src, {
			signal: ctrl.signal,
			redirect: "follow",
			headers: { Accept: "image/*,*/*;q=0.8" },
		});
		if (!res.ok) throw new Error("errors.noFavicon");
		const buf = Buffer.from(await res.arrayBuffer());
		if (!buf.length) throw new Error("errors.noFavicon");
		if (buf.length > MAX_BYTES) throw new Error("errors.iconTooHeavy");
		return buf;
	} finally {
		clearTimeout(timer);
	}
}

export async function fetchSiteFavicon(url: string): Promise<{ dataUrl: string }> {
	const host = hostOf(url);
	let last = "errors.noFavicon";
	for (const src of providerUrls(host)) {
		try {
			const bytes = await fetchBytes(src);
			const mime = mimeOf(bytes, src);
			return { dataUrl: `data:${mime};base64,${bytes.toString("base64")}` };
		} catch (err) {
			last = err instanceof Error ? err.message : last;
		}
	}
	throw new Error(last);
}
