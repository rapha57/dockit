import type { PortalCard, PortalCategory } from "@/lib/portal";

export function reindexCards(cards: PortalCard[], categoryId: string) {
	return cards.map((a, i) => ({
		...a,
		categoryId,
		sortOrder: i + 1,
	}));
}

export function placeCarriedCard(
	categories: PortalCategory[],
	card: PortalCard | null | undefined,
	destCatId: string | null | undefined,
	insertAt: number,
) {
	if (!card || !destCatId) return null;
	const stripped = categories.map((c) => ({
		...c,
		cards: c.cards.filter((a) => a.id !== card.id),
	}));
	if (!stripped.some((c) => c.id === destCatId)) return null;
	return stripped.map((c) => {
		if (c.id !== destCatId) return c;
		const cards = [...c.cards];
		const idx = Math.max(0, Math.min(insertAt, cards.length));
		cards.splice(idx, 0, {
			...card,
			categoryId: c.id,
		});
		return {
			...c,
			cards: reindexCards(cards, c.id),
		};
	});
}

export function placeCard(
	categories: PortalCategory[],
	cardId: string,
	destCatId: string | null | undefined,
	insertAt: number,
) {
	let moved: PortalCard | undefined;
	const stripped = categories.map((c) => {
		const hit = c.cards.find((a) => a.id === cardId);
		if (!hit) return c;
		moved = hit;
		return {
			...c,
			cards: c.cards.filter((a) => a.id !== cardId),
		};
	});
	if (!moved) return null;
	const card = moved;
	return stripped.map((c) => {
		if (c.id !== destCatId) return c;
		const cards = [...c.cards];
		const idx = Math.max(0, Math.min(insertAt, cards.length));
		cards.splice(idx, 0, {
			...card,
			categoryId: c.id,
		});
		return {
			...c,
			cards: reindexCards(cards, c.id),
		};
	});
}

export function placeCategory(categories: PortalCategory[], catId: string, insertAt: number) {
	const from = categories.findIndex((c) => c.id === catId);
	if (from < 0) return null;
	const next = categories.filter((c) => c.id !== catId);
	const idx = Math.max(0, Math.min(insertAt, next.length));
	next.splice(idx, 0, categories[from]);
	return next.map((c, i) => ({
		...c,
		sortOrder: i + 1,
	}));
}

export function placeCarriedCategory(
	categories: PortalCategory[],
	cat: PortalCategory | null | undefined,
	insertAt: number,
) {
	if (!cat) return null;
	const stripped = categories.filter((c) => c.id !== cat.id);
	const idx = Math.max(0, Math.min(insertAt, stripped.length));
	const next = [...stripped];
	next.splice(idx, 0, cat);
	return next.map((c, i) => ({
		...c,
		sortOrder: i + 1,
	}));
}

export function placeSpaces<T extends { id: string; sortOrder: number }>(
	spaces: T[],
	spaceId: string,
	insertAt: number,
) {
	const from = spaces.findIndex((t) => t.id === spaceId);
	if (from < 0) return null;
	const next = spaces.filter((t) => t.id !== spaceId);
	const idx = Math.max(0, Math.min(insertAt, next.length));
	next.splice(idx, 0, spaces[from]);
	return next.map((t, i) => ({
		...t,
		sortOrder: i + 1,
	}));
}
