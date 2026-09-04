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
let timeFormat = "24h";
let timeZone = "";

export const DATE_FORMATS = ["ymd", "yyyy", "dmy", "mdy", "iso"];
export const TIME_FORMATS = ["24h", "12h"];

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

export function applyDisplayPrefs(settings) {
	setLocale(settings?.locale);
	setDateFormat(settings?.dateFormat);
	setTimeFormat(settings?.timeFormat);
	setTimeZone(settings?.timezone);
}

export function withLocale(localeOrSettings, fn) {
	const prev = {
		locale: current,
		dateFormat,
		timeFormat,
		timeZone
	};
	if (localeOrSettings && typeof localeOrSettings === "object") applyDisplayPrefs(localeOrSettings);
	else setLocale(localeOrSettings);
	try {
		return fn();
	} finally {
		current = prev.locale;
		dateFormat = prev.dateFormat;
		timeFormat = prev.timeFormat;
		timeZone = prev.timeZone;
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

export function asTimeFormat(raw) {
	return raw === "12h" ? "12h" : "24h";
}

export function setTimeFormat(fmt) {
	timeFormat = asTimeFormat(fmt);
	return timeFormat;
}

export function asTimeZone(raw) {
	const id = String(raw || "").trim();
	if (!id) return "";
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: id }).format(new Date());
		return id;
	} catch {
		return "";
	}
}

export function setTimeZone(id) {
	timeZone = asTimeZone(id);
	return timeZone;
}

function zoneOffset(id, at) {
	try {
		const parts = new Intl.DateTimeFormat("en-US", {
			timeZone: id || undefined,
			timeZoneName: "shortOffset"
		}).formatToParts(at);
		return parts.find((p) => p.type === "timeZoneName")?.value || "";
	} catch {
		return "";
	}
}

export function listTimeZones(at = new Date()) {
	let names = [];
	try {
		names = Intl.supportedValuesOf("timeZone");
	} catch {
		names = [];
	}
	if (!names.includes("UTC")) names = ["UTC", ...names];
	const groups = new Map();
	for (const id of names) {
		const slash = id.indexOf("/");
		const region = slash === -1 ? "Other" : id.slice(0, slash);
		const city = (slash === -1 ? id : id.slice(slash + 1)).replace(/_/g, " ");
		const offset = zoneOffset(id, at);
		const row = {
			id,
			city,
			offset,
			label: offset ? `${city} · ${offset}` : city
		};
		const list = groups.get(region);
		if (list) list.push(row);
		else groups.set(region, [row]);
	}
	return [...groups.entries()]
		.sort((a, b) => a[0].localeCompare(b[0]))
		.map(([region, zones]) => ({
			region,
			zones: zones.sort((a, b) => a.city.localeCompare(b.city) || a.id.localeCompare(b.id))
		}));
}

function part(parts, type) {
	return parts.find((p) => p.type === type)?.value || "";
}

export function formatWhen(at, withSeconds = false, prefs) {
	const d = at instanceof Date ? at : new Date(at);
	if (Number.isNaN(d.getTime())) return "";
	const fmt = prefs?.dateFormat != null ? asDateFormat(prefs.dateFormat) : dateFormat;
	const clock = prefs?.timeFormat != null ? asTimeFormat(prefs.timeFormat) : timeFormat;
	const tz = prefs && "timezone" in prefs ? asTimeZone(prefs.timezone) : timeZone;
	const hour12 = clock === "12h";
	let parts;
	try {
		parts = new Intl.DateTimeFormat("en-US", {
			timeZone: tz || undefined,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: withSeconds ? "2-digit" : undefined,
			hour12
		}).formatToParts(d);
	} catch {
		parts = new Intl.DateTimeFormat("en-US", {
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: withSeconds ? "2-digit" : undefined,
			hour12
		}).formatToParts(d);
	}
	const yyyy = part(parts, "year");
	const yy = yyyy.slice(-2);
	const m = part(parts, "month");
	const day = part(parts, "day");
	const date = fmt === "dmy"
		? `${day}/${m}/${yyyy}`
		: fmt === "mdy"
			? `${m}/${day}/${yyyy}`
			: fmt === "iso"
				? `${yyyy}-${m}-${day}`
				: fmt === "yyyy"
					? `${yyyy}/${m}/${day}`
					: `${yy}/${m}/${day}`;
	const min = part(parts, "minute");
	const sec = part(parts, "second");
	if (hour12) {
		const n = Number(part(parts, "hour")) || 12;
		const h = String(n);
		const ap = (part(parts, "dayPeriod") || "AM").replace(/\./g, "").replace(/\s/g, "").toUpperCase();
		const time = withSeconds ? `${h}:${min}:${sec} ${ap}` : `${h}:${min} ${ap}`;
		return `${date} ${time}`;
	}
	const h = part(parts, "hour").padStart(2, "0");
	const time = withSeconds ? `${h}:${min}:${sec}` : `${h}:${min}`;
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
