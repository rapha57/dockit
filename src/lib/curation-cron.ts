const BOUNDS: [number, number][] = [
	[0, 59],
	[0, 23],
	[1, 31],
	[1, 12],
	[0, 6],
];

/** Empty is off. Otherwise five fields: min hour dom mon dow (`*` or one integer). */
export function cronSpecOk(spec: string): boolean {
	const s = String(spec || "").trim();
	if (!s) return true;
	const parts = s.split(/\s+/);
	if (parts.length !== 5) return false;
	return parts.every((raw, i) => fieldOk(raw, BOUNDS[i][0], BOUNDS[i][1]));
}

function fieldOk(raw: string, min: number, max: number): boolean {
	if (raw === "*") return true;
	if (!/^\d+$/.test(raw)) return false;
	const n = Number(raw);
	return n >= min && n <= max;
}

/** Five-field cron: min hour dom mon dow. Only `*` or a single integer. */
export function cronMatches(spec: string, at: Date): boolean {
	const parts = String(spec || "")
		.trim()
		.split(/\s+/);
	if (parts.length !== 5) return false;
	const values = [at.getMinutes(), at.getHours(), at.getDate(), at.getMonth() + 1, at.getDay()];
	return parts.every((raw, i) => matchField(raw, values[i], BOUNDS[i][0], BOUNDS[i][1]));
}

function matchField(raw: string, value: number, min: number, max: number): boolean {
	if (raw === "*") return true;
	if (!/^\d+$/.test(raw)) return false;
	const n = Number(raw);
	if (n < min || n > max) return false;
	return n === value;
}

export function cronMinuteKey(at: Date): string {
	return `${at.getFullYear()}-${at.getMonth() + 1}-${at.getDate()} ${at.getHours()}:${at.getMinutes()}`;
}

export type CronSchedule =
	| { kind: "off" }
	| { kind: "hourly" }
	| { kind: "daily"; hour: number }
	| { kind: "weekly"; hour: number; dow: number }
	| { kind: "custom"; spec: string };

export function parseCronSchedule(spec: string): CronSchedule {
	const s = String(spec || "").trim();
	if (!s) return { kind: "off" };
	const parts = s.split(/\s+/);
	if (parts.length !== 5) return { kind: "custom", spec: s };
	const [min, hour, dom, mon, dow] = parts;
	if (min !== "0" || dom !== "*" || mon !== "*") return { kind: "custom", spec: s };
	if (hour === "*" && dow === "*") return { kind: "hourly" };
	if (!/^\d+$/.test(hour)) return { kind: "custom", spec: s };
	const h = Number(hour);
	if (h > 23) return { kind: "custom", spec: s };
	if (dow === "*") return { kind: "daily", hour: h };
	if (!/^\d+$/.test(dow)) return { kind: "custom", spec: s };
	const d = Number(dow);
	if (d > 6) return { kind: "custom", spec: s };
	return { kind: "weekly", hour: h, dow: d };
}

export function cronScheduleSpec(schedule: CronSchedule): string {
	if (schedule.kind === "off") return "";
	if (schedule.kind === "hourly") return "0 * * * *";
	if (schedule.kind === "daily") return `0 ${schedule.hour} * * *`;
	if (schedule.kind === "weekly") return `0 ${schedule.hour} * * ${schedule.dow}`;
	return schedule.spec;
}
