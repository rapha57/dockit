import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
	ASSET_PREFIX,
	ASSET_URL,
	MAX_ASSET_BYTES,
} from "./assets-url";

export {
	ASSET_PREFIX,
	ASSET_URL,
	MAX_ASSET_BYTES,
	MAX_CUSTOM_ICONS,
	isAssetRef,
	toClientAsset,
} from "./assets-url";

const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

const MIME_EXT: Record<string, string> = {
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/jpg": "jpg",
	"image/webp": "webp",
	"image/gif": "gif",
	"image/svg+xml": "svg",
	"image/x-icon": "ico",
	"image/vnd.microsoft.icon": "ico",
};

const EXT_MIME: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	webp: "image/webp",
	gif: "image/gif",
	svg: "image/svg+xml",
	ico: "image/x-icon",
};

function dataFilePath() {
	const custom = process.env.PORTAL_DATA_FILE?.trim();
	if (custom) return custom;
	return join(process.cwd(), "data", "portal.json");
}

export function assetsDir() {
	return join(dirname(dataFilePath()), "assets");
}

export function safeAssetName(raw: string): string | null {
	const name = String(raw ?? "").split("/").pop()?.split("\\").pop() ?? "";
	if (!NAME_RE.test(name) || name.length > 80) return null;
	return name;
}

function parseDataUrl(raw: string): { mime: string; bytes: Buffer } | null {
	const m = String(raw).match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i);
	if (!m) return null;
	const mime = m[1].toLowerCase();
	if (!MIME_EXT[mime]) return null;
	try {
		const bytes = Buffer.from(m[2].replace(/\s/g, ""), "base64");
		if (!bytes.length || bytes.length > MAX_ASSET_BYTES) return null;
		return { mime, bytes };
	} catch {
		return null;
	}
}

export async function persistMediaValue(stem: string, value: string): Promise<string> {
	const raw = String(value ?? "");
	if (!raw) return "";
	if (raw.startsWith(ASSET_PREFIX)) {
		const name = safeAssetName(raw.slice(ASSET_PREFIX.length));
		return name ? ASSET_PREFIX + name : "";
	}
	if (raw.startsWith(ASSET_URL)) {
		const name = safeAssetName(raw.slice(ASSET_URL.length));
		return name ? ASSET_PREFIX + name : "";
	}
	if (!raw.startsWith("data:image/")) return raw;
	const parsed = parseDataUrl(raw);
	if (!parsed) return "";
	const ext = MIME_EXT[parsed.mime];
	const base = stem.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 60) || "file";
	const name = `${base}.${ext}`;
	const dir = assetsDir();
	await mkdir(dir, { recursive: true });
	await writeFile(join(dir, name), parsed.bytes);
	return ASSET_PREFIX + name;
}

export async function readAssetFile(name: string): Promise<{ mime: string; bytes: Buffer } | null> {
	const safe = safeAssetName(name);
	if (!safe) return null;
	const ext = safe.split(".").pop()?.toLowerCase() ?? "";
	const mime = EXT_MIME[ext];
	if (!mime) return null;
	try {
		const bytes = await readFile(join(assetsDir(), safe));
		if (!bytes.length) return null;
		return { mime, bytes };
	} catch {
		return null;
	}
}

export async function assetToDataUrl(ref: string): Promise<string> {
	const raw = String(ref ?? "");
	if (!raw.startsWith(ASSET_PREFIX)) return raw;
	const file = await readAssetFile(raw.slice(ASSET_PREFIX.length));
	if (!file) return "";
	return `data:${file.mime};base64,${file.bytes.toString("base64")}`;
}
