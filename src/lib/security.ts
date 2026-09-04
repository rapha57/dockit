export const PASSWORD_MIN = 12;

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
	if (isWeakPassword(p)) return "errors.passwordWeak";
	return "";
}
