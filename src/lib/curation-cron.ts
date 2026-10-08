/** Five-field cron: min hour dom mon dow. Only `*` or a single integer. */
export function cronMatches(spec: string, at: Date): boolean {
	const parts = String(spec || "")
		.trim()
		.split(/\s+/);
	if (parts.length !== 5) return false;
	const fields = [
		{ raw: parts[0], value: at.getMinutes(), min: 0, max: 59 },
		{ raw: parts[1], value: at.getHours(), min: 0, max: 23 },
		{ raw: parts[2], value: at.getDate(), min: 1, max: 31 },
		{ raw: parts[3], value: at.getMonth() + 1, min: 1, max: 12 },
		{ raw: parts[4], value: at.getDay(), min: 0, max: 6 },
	];
	return fields.every((field) => matchField(field.raw, field.value, field.min, field.max));
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
