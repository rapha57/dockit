import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { outboundFetch } from "./outbound-proxy";

const REPO = "rapha57/dockit";
const API = `https://api.github.com/repos/${REPO}`;
const TTL_MS = 15 * 60 * 1000;
const TIMEOUT_MS = 4000;

type ReleaseInfo = {
	latest: string;
	url: string;
};

let cache: { at: number; value: ReleaseInfo } | null = null;

function cleanTag(raw: unknown): string {
	return String(raw || "").trim().replace(/^v/i, "");
}

async function githubJson(path: string, signal: AbortSignal): Promise<unknown> {
	try {
		const res = await outboundFetch(`${API}${path}`, {
			headers: {
				Accept: "application/vnd.github+json",
				"User-Agent": "Dockit",
				"X-GitHub-Api-Version": "2022-11-28"
			},
			signal
		});
		if (!res.ok) return null;
		return await res.json();
	} catch {
		return null;
	}
}

async function fetchLatest(signal: AbortSignal): Promise<ReleaseInfo> {
	const release = await githubJson("/releases/latest", signal);
	if (release && typeof release === "object") {
		const row = release as { tag_name?: string; html_url?: string };
		const latest = cleanTag(row.tag_name);
		if (latest) {
			return {
				latest,
				url: String(row.html_url || `https://github.com/${REPO}/releases`)
			};
		}
	}
	const tags = await githubJson("/tags?per_page=1", signal);
	if (Array.isArray(tags) && tags[0] && typeof tags[0] === "object") {
		const row = tags[0] as { name?: string };
		const latest = cleanTag(row.name);
		if (latest) {
			return {
				latest,
				url: `https://github.com/${REPO}/releases/tag/${encodeURIComponent(latest)}`
			};
		}
	}
	return { latest: "", url: "" };
}

export const checkLatestRelease = createServerFn({ method: "GET" }).validator(z.object({})).handler(async () => {
	const now = Date.now();
	if (cache && now - cache.at < TTL_MS) return cache.value;
	const ac = new AbortController();
	const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
	try {
		const value = await fetchLatest(ac.signal);
		if (value.latest) cache = { at: now, value };
		return value;
	} catch {
		return { latest: "", url: "" };
	} finally {
		clearTimeout(timer);
	}
});
