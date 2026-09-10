import fr from "../locales/fr.json";
import en from "../locales/en.json";

export const LOCALES = ["en", "fr"] as const;
export type Locale = (typeof LOCALES)[number];

export type Vars = Record<string, unknown>;
type DisplayPrefs = {
	locale?: unknown;
	dateFormat?: unknown;
	timeFormat?: unknown;
	timezone?: unknown;
	numberFormat?: unknown;
};

const catalogs: Record<Locale, Record<string, string>> = {
	en: flatten(en),
	fr: flatten(fr)
};

let current: Locale = "en";
let dateFormat: DateFormat = "ymd";
let timeFormat: TimeFormat = "24h";
let timeZone = "";
let numberFormat: NumberFormat = "auto";

export const DATE_FORMATS = ["ymd", "yyyy", "dmy", "mdy", "iso"] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];
export const NUMBER_FORMATS = ["auto", "space-comma", "comma-dot", "dot-comma", "apostrophe-comma"] as const;
export type NumberFormat = (typeof NUMBER_FORMATS)[number];

function flatten(obj: unknown, prefix = ""): Record<string, string> {
	const out: Record<string, string> = {};
	if (!obj || typeof obj !== "object") return out;
	for (const [k, v] of Object.entries(obj)) {
		const key = prefix ? `${prefix}.${k}` : k;
		if (v && typeof v === "object" && !Array.isArray(v)) Object.assign(out, flatten(v, key));
		else out[key] = String(v ?? "");
	}
	return out;
}

export function asLocale(raw: unknown): Locale {
	return raw === "fr" ? "fr" : "en";
}

export function setLocale(locale: unknown): Locale {
	current = asLocale(locale);
	return current;
}

export function applyDisplayPrefs(settings: DisplayPrefs | null | undefined) {
	setLocale(settings?.locale);
	setDateFormat(settings?.dateFormat);
	setTimeFormat(settings?.timeFormat);
	setTimeZone(settings?.timezone);
	setNumberFormat(settings?.numberFormat);
}

export function withLocale<T>(localeOrSettings: unknown, fn: () => T): T {
	const prev = {
		locale: current,
		dateFormat,
		timeFormat,
		timeZone,
		numberFormat
	};
	if (localeOrSettings && typeof localeOrSettings === "object")
		applyDisplayPrefs(localeOrSettings as DisplayPrefs);
	else setLocale(localeOrSettings);
	try {
		return fn();
	} finally {
		current = prev.locale;
		dateFormat = prev.dateFormat;
		timeFormat = prev.timeFormat;
		timeZone = prev.timeZone;
		numberFormat = prev.numberFormat;
	}
}

export function localeTag() {
	return current === "fr" ? "fr-FR" : "en-US";
}

export function asDateFormat(raw: unknown): DateFormat {
	return DATE_FORMATS.includes(raw as DateFormat) ? (raw as DateFormat) : "ymd";
}

export function setDateFormat(fmt: unknown): DateFormat {
	dateFormat = asDateFormat(fmt);
	return dateFormat;
}

export type TimeFormat = "24h" | "12h";

export function asTimeFormat(raw: unknown): TimeFormat {
	return raw === "12h" ? "12h" : "24h";
}

export function setTimeFormat(fmt: unknown): TimeFormat {
	timeFormat = asTimeFormat(fmt);
	return timeFormat;
}

export function asTimeZone(raw: unknown): string {
	const id = String(raw || "").trim();
	if (!id) return "";
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: id }).format(new Date());
		return id;
	} catch {
		return "";
	}
}

export function setTimeZone(id: unknown): string {
	timeZone = asTimeZone(id);
	return timeZone;
}

export function asNumberFormat(raw: unknown): NumberFormat {
	return NUMBER_FORMATS.includes(raw as NumberFormat) ? (raw as NumberFormat) : "auto";
}

export function setNumberFormat(fmt: unknown): NumberFormat {
	numberFormat = asNumberFormat(fmt);
	return numberFormat;
}

const NUMBER_SEPS: Record<Exclude<NumberFormat, "auto">, [string, string]> = {
	"space-comma": [" ", ","],
	"comma-dot": [",", "."],
	"dot-comma": [".", ","],
	"apostrophe-comma": ["\u2019", ","]
};

export function formatNumber(n: unknown, fmt?: unknown): string {
	const useFmt = fmt != null ? asNumberFormat(fmt) : numberFormat;
	const num = Number(n) || 0;
	const seps = useFmt === "auto" ? undefined : NUMBER_SEPS[useFmt];
	if (!seps) return num.toLocaleString(localeTag());
	const raw = num.toLocaleString("en-US", { maximumFractionDigits: 2 });
	const dot = raw.lastIndexOf(".");
	const int = dot === -1 ? raw : raw.slice(0, dot);
	const frac = dot === -1 ? null : raw.slice(dot + 1);
	return frac != null ? `${int.replaceAll(",", seps[0])}${seps[1]}${frac}` : int.replaceAll(",", seps[0]);
}

function zoneOffset(id: string, at: Date): string {
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

type TimeZoneRow = { id: string; city: string; offset: string; label: string };
type TimeZoneGroup = { region: string; zones: TimeZoneRow[] };

export function listTimeZones(at = new Date()): TimeZoneGroup[] {
	let names: string[] = [];
	try {
		names = Intl.supportedValuesOf("timeZone");
	} catch {
		names = [];
	}
	if (!names.includes("UTC")) names = ["UTC", ...names];
	const groups = new Map<string, TimeZoneRow[]>();
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

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
	return parts.find((p) => p.type === type)?.value || "";
}

type WhenPrefs = { dateFormat?: unknown; timeFormat?: unknown; timezone?: unknown };

export function formatWhen(at: unknown, withSeconds = false, prefs?: WhenPrefs): string {
	const d = at instanceof Date ? at : new Date(at as string | number);
	if (Number.isNaN(d.getTime())) return "";
	const fmt = prefs?.dateFormat != null ? asDateFormat(prefs.dateFormat) : dateFormat;
	const clock = prefs?.timeFormat != null ? asTimeFormat(prefs.timeFormat) : timeFormat;
	const tz = prefs && "timezone" in prefs ? asTimeZone(prefs.timezone) : timeZone;
	const hour12 = clock === "12h";
	let parts: Intl.DateTimeFormatPart[];
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

export function t(key: string, vars?: Vars): string {
	const table = catalogs[current] || catalogs.en;
	let s = table[key] ?? catalogs.en[key] ?? catalogs.fr[key] ?? key;
	if (vars && typeof vars === "object") {
		for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v ?? ""));
	}
	return s;
}

function hasKey(key: string): boolean {
	return Boolean(catalogs.en[key] || catalogs.fr[key] || catalogs[current]?.[key]);
}

export function te(err: unknown): string {
	const msg = err instanceof Error ? err.message : String(err || "");
	if (!msg) return t("errors.generic");
	return td(msg);
}

export function td(detail: unknown): string {
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

export function tp(key: string, n: unknown, vars?: Vars): string {
	const num = Number(n);
	const one = num === 1 || (current === "fr" && num === 0);
	const k = one ? key : `${key}_other`;
	return t(k, { n, ...vars });
}
