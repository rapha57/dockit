export const SPACE_XFER_KIND = "space";
export const SPACE_XFER_VERSION = 1;

export type SpaceXferIcon = { id?: string; name?: string; dataUrl?: string };
export type SpaceXfer = {
	version: number;
	kind: typeof SPACE_XFER_KIND;
	exportedAt?: string;
	space: Record<string, unknown>;
	customIcons: SpaceXferIcon[];
};

export function parseSpaceXfer(raw: unknown): SpaceXfer | null {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
	const o = raw as Record<string, unknown>;
	if (o.kind !== SPACE_XFER_KIND) return null;
	if (o.settings && (Array.isArray(o.spaces) || Array.isArray(o.tabs))) return null;
	if (Array.isArray(o.tabs) || Array.isArray(o.apps)) return null;
	if (!o.space || typeof o.space !== "object" || Array.isArray(o.space)) return null;
	const space = o.space as Record<string, unknown>;
	const name = String(space.name || "").trim();
	if (!name) return null;
	return {
		version: SPACE_XFER_VERSION,
		kind: SPACE_XFER_KIND,
		exportedAt: typeof o.exportedAt === "string" ? o.exportedAt : undefined,
		space,
		customIcons: Array.isArray(o.customIcons) ? (o.customIcons as SpaceXferIcon[]) : []
	};
}

export function collectIconValues(space: Record<string, unknown> | null | undefined): string[] {
	const out: string[] = [];
	if (!space) return out;
	if (space.icon) out.push(String(space.icon));
	for (const cat of Array.isArray(space.categories) ? space.categories : []) {
		if (!cat || typeof cat !== "object") continue;
		if (cat.icon) out.push(String(cat.icon));
		for (const card of Array.isArray(cat.cards) ? cat.cards : []) {
			if (card?.icon) out.push(String(card.icon));
		}
	}
	return out;
}
