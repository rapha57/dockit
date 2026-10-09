const CERT_BLOCK = /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g;
const PRIVATE = /BEGIN (?:(?:RSA|EC|DSA|OPENSSH) )?PRIVATE KEY|BEGIN ENCRYPTED PRIVATE KEY/;

let extra = "";

export function parseCaPem(raw: unknown): string {
	const text = String(raw ?? "");
	if (!text.trim()) return "";
	if (PRIVATE.test(text)) throw new Error("errors.caPrivateKey");
	const blocks = text.match(CERT_BLOCK);
	if (!blocks?.length) throw new Error("errors.caInvalid");
	return blocks.join("\n");
}

export function setExtraCaPem(raw: unknown) {
	try {
		extra = parseCaPem(raw);
	} catch {
		extra = "";
	}
}

export function extraCaPem(): string {
	return extra;
}
