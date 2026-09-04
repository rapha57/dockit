export const CSS_MAX = 24e3;

/** Strip dangerous CSS before injecting user theme into the document. */
export function sanitizeThemeCss(raw: string): string {
	return String(raw ?? "")
		.slice(0, CSS_MAX)
		.replace(/<\/style/gi, "")
		.replace(/<script/gi, "")
		.replace(/@import\b/gi, "/* @import */")
		.replace(/url\s*\(/gi, "/* url( */")
		.replace(/expression\s*\(/gi, "/* expression( */")
		.replace(/javascript\s*:/gi, "")
		.replace(/-moz-binding/gi, "")
		.replace(/behavior\s*:/gi, "/* behavior: */");
}
