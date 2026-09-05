export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 120;

const WEAK_EXACT = new Set([
	"admin",
	"change-moi",
	"changeme",
	"password",
	"dockit",
	"secret",
]);

export function isWeakPassword(raw: string): boolean {
	const p = String(raw ?? "");
	if (p.length < PASSWORD_MIN) return true;
	return WEAK_EXACT.has(p.toLowerCase());
}

export function passwordPolicyError(raw: string): string {
	const p = String(raw ?? "");
	if (!p) return "errors.passwordRequired";
	if (p.length < PASSWORD_MIN) return `errors.passwordShort|${PASSWORD_MIN}`;
	if (p.length > PASSWORD_MAX) return "errors.passwordWeak";
	if (isWeakPassword(p)) return "errors.passwordWeak";
	return "";
}

export type PasswordStrength = "short" | "weak" | "fair" | "good" | "strong";

export function passwordMeter(raw: string): {
	remaining: number;
	left: number;
	strength: PasswordStrength;
	ok: boolean;
} {
	const p = String(raw ?? "");
	const remaining = Math.max(0, PASSWORD_MIN - p.length);
	const left = Math.max(0, PASSWORD_MAX - p.length);
	if (p.length < PASSWORD_MIN) return { remaining, left, strength: "short", ok: false };
	if (WEAK_EXACT.has(p.toLowerCase())) return { remaining: 0, left, strength: "weak", ok: false };
	const kinds = [/[a-z]/.test(p), /[A-Z]/.test(p), /\d/.test(p), /[^A-Za-z0-9]/.test(p)].filter(Boolean).length;
	if (p.length >= 16 && kinds >= 3) return { remaining: 0, left, strength: "strong", ok: true };
	if (kinds >= 3) return { remaining: 0, left, strength: "good", ok: true };
	return { remaining: 0, left, strength: "fair", ok: true };
}
