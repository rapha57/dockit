export const ASSET_PREFIX = "asset:";
export const ASSET_URL = "/__dockit/asset/";
export const MAX_CUSTOM_ICONS = 48;
export const MAX_ASSET_BYTES = 4e5;

export function toClientAsset(ref: string): string {
	const value = String(ref ?? "");
	if (!value) return "";
	if (value.startsWith(ASSET_PREFIX)) return ASSET_URL + value.slice(ASSET_PREFIX.length);
	return value;
}

export function isAssetRef(ref: string): boolean {
	return String(ref ?? "").startsWith(ASSET_PREFIX);
}
