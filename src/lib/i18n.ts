import fr from "../locales/fr.json";
import en from "../locales/en.json";

export const LOCALES = ["en", "fr"] as const;
export type Locale = (typeof LOCALES)[number];

const catalogs = {
	en: flatten(en),
	fr: flatten(fr)
};

let current: Locale = "en";
let dateFormat = "ymd";

export const DATE_FORMATS = ["ymd", "dmy", "mdy", "iso"];

function flatten(obj, prefix = "") {
	const out = {};
	if (!obj || typeof obj !== "object") return out;
	for (const [k, v] of Object.entries(obj)) {
		const key = prefix ? `${prefix}.${k}` : k;
		if (v && typeof v === "object" && !Array.isArray(v)) Object.assign(out, flatten(v, key));
		else out[key] = String(v ?? "");
	}
	return out;
}

export function asLocale(raw) {
	return raw === "fr" ? "fr" : "en";
}

export function getLocale() {
	return current;
}

export function setLocale(locale) {
	current = asLocale(locale);
	return current;
}

export function withLocale(locale, fn) {
	const prev = current;
	setLocale(locale);
	try {
		return fn();
	} finally {
		current = prev;
	}
}

export function localeTag() {
	return current === "fr" ? "fr-FR" : "en-US";
}

export function asDateFormat(raw) {
	return DATE_FORMATS.includes(raw) ? raw : "ymd";
}

export function setDateFormat(fmt) {
	dateFormat = asDateFormat(fmt);
	return dateFormat;
}

export function formatWhen(at, withSeconds = false) {
	const d = at instanceof Date ? at : new Date(at);
	if (Number.isNaN(d.getTime())) return "";
	const yyyy = d.getFullYear();
	const yy = String(yyyy).slice(-2);
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	const date = dateFormat === "dmy"
		? `${day}/${m}/${yyyy}`
		: dateFormat === "mdy"
			? `${m}/${day}/${yyyy}`
			: dateFormat === "iso"
				? `${yyyy}-${m}-${day}`
				: `${yy}/${m}/${day}`;
	const h = String(d.getHours()).padStart(2, "0");
	const min = String(d.getMinutes()).padStart(2, "0");
	const time = withSeconds ? `${h}:${min}:${String(d.getSeconds()).padStart(2, "0")}` : `${h}:${min}`;
	return `${date} ${time}`;
}

export function t(key, vars) {
	const table = catalogs[current] || catalogs.en;
	let s = table[key] ?? catalogs.en[key] ?? catalogs.fr[key] ?? key;
	if (vars && typeof vars === "object") {
		for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v ?? ""));
	}
	return s;
}

function hasKey(key) {
	return Boolean(catalogs.en[key] || catalogs.fr[key] || catalogs[current]?.[key]);
}

export function te(err) {
	const msg = err instanceof Error ? err.message : String(err || "");
	if (!msg) return t("errors.generic");
	return td(msg);
}

export function td(detail) {
	const msg = String(detail || "");
	if (!msg) return t("errors.generic");
	const pipe = msg.indexOf("|");
	if (pipe > 0) {
		const key = msg.slice(0, pipe);
		const arg = msg.slice(pipe + 1);
		if (hasKey(key)) return t(key, { host: arg, n: arg });
	}
	if (hasKey(msg)) return t(msg);
	return msg;
}

export function tp(key, n, vars) {
	const k = Number(n) === 1 ? key : `${key}_other`;
	return t(k, { n, ...vars });
}
