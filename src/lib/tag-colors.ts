export const TAG_PASTELS = [
	{ bg: "#c5dfda", fg: "#1f4f49" },
	{ bg: "#d4d0ea", fg: "#3c3870" },
	{ bg: "#ead9bc", fg: "#6d4e1c" },
	{ bg: "#e8cdd4", fg: "#6f3545" },
	{ bg: "#c8dcea", fg: "#2a5570" },
	{ bg: "#d4e0bc", fg: "#3f5220" },
	{ bg: "#ddd0e6", fg: "#533a68" },
	{ bg: "#e8d0c4", fg: "#6e4330" },
	{ bg: "#c4e4d4", fg: "#2a5c46" },
	{ bg: "#ccd4e8", fg: "#354370" },
	{ bg: "#e6dcba", fg: "#625318" },
	{ bg: "#d0d6de", fg: "#3a4450" },
	{ bg: "#e6ccc8", fg: "#6e3c38" },
	{ bg: "#c4dce2", fg: "#285058" },
	{ bg: "#e0d4bc", fg: "#5c4c2c" },
	{ bg: "#e0cce0", fg: "#5c3a5c" }
];

export const TAG_TONE_HEX = TAG_PASTELS.slice(0, 8).map((p) => p.bg);
export const TAG_PALETTE = TAG_PASTELS.map((p) => p.bg);

const LEGACY_TAG_HEX: Record<string, string> = {
	"#0f766e": "#c5dfda",
	"#3730a3": "#d4d0ea",
	"#b45309": "#ead9bc",
	"#9f1239": "#e8cdd4",
	"#0369a1": "#c8dcea",
	"#3f6212": "#d4e0bc",
	"#6b21a8": "#ddd0e6",
	"#9a3412": "#e8d0c4",
	"#2dd4bf": "#c5dfda",
	"#a5b4fc": "#d4d0ea",
	"#fbbf24": "#ead9bc",
	"#fb7185": "#e8cdd4",
	"#38bdf8": "#c8dcea",
	"#a3e635": "#d4e0bc",
	"#d8b4fe": "#ddd0e6",
	"#fb923c": "#e8d0c4"
};

const INK = Object.fromEntries(TAG_PASTELS.map((p) => [p.bg, p.fg]));

export function remapTagHex(hex: string) {
	const h = String(hex || "").trim().toLowerCase();
	if (!/^#[0-9a-f]{6}$/.test(h)) return h;
	return LEGACY_TAG_HEX[h] || h;
}

function rgb(hex: string) {
	const n = hex.replace("#", "");
	return [
		Number.parseInt(n.slice(0, 2), 16),
		Number.parseInt(n.slice(2, 4), 16),
		Number.parseInt(n.slice(4, 6), 16)
	];
}

function toHex(r: number, g: number, b: number) {
	return `#${[r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("")}`;
}

export function tagInk(hex: string) {
	const h = remapTagHex(hex);
	if (INK[h]) return INK[h];
	const [r, g, b] = rgb(h);
	if (![r, g, b].every((x) => Number.isFinite(x))) return "#1f4f49";
	const luma = (r * 299 + g * 587 + b * 114) / 1000;
	if (luma <= 150) return "#f8fafc";
	return toHex(r * 0.36, g * 0.36, b * 0.36);
}

export function tagTone(name: string) {
	let h = 2166136261;
	const s = String(name || "").trim().toLowerCase();
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return (h >>> 0) % 8;
}

export function defaultTagHex(name: string) {
	return TAG_TONE_HEX[tagTone(name)] ?? TAG_TONE_HEX[0];
}

export function randomTagHex(used: Set<string>) {
	const pool = TAG_PALETTE.filter((h) => !used.has(h.toLowerCase()));
	const src = pool.length ? pool : TAG_PALETTE;
	return src[Math.floor(Math.random() * src.length)];
}
