import { describe, expect, it } from "vitest";
import { itemMatches, searchJumps, type SearchJump } from "@/lib/portal-dnd";
import type { PortalCard } from "@/lib/portal";

function card(partial: Partial<PortalCard> & { id: string; title: string }): PortalCard {
	return {
		categoryId: "c",
		kind: "app",
		description: "",
		icon: "Link",
		openIn: "_blank",
		tags: [],
		colSpan: 1,
		rowSpan: 1,
		sortOrder: 1,
		check: "off",
		checkHost: "",
		clicks: 0,
		links: [],
		...partial,
	};
}

describe("itemMatches", () => {
	it("matches extra link titles and urls", () => {
		const app = card({
			id: "graf",
			title: "Grafana",
			links: [
				{ title: "", url: "https://grafana.example" },
				{ title: "Explore", url: "https://grafana.example/explore" },
			],
		});
		expect(itemMatches(app, "explore", [], null)).toBe(true);
		expect(itemMatches(app, "grafana.example/explore", [], null)).toBe(true);
		expect(itemMatches(app, "prometheus", [], null)).toBe(false);
	});
});

describe("searchJumps", () => {
	it("flattens hits into space / category / card rows", () => {
		const jumps: SearchJump[] = searchJumps(
			[
				{
					id: "infra",
					name: "Infra",
					categories: [
						{
							name: "Monitoring",
							cards: [
								card({
									id: "graf",
									title: "Grafana",
									links: [{ title: "", url: "https://grafana.example" }],
								}),
							],
						},
					],
				},
			],
			8,
		);
		expect(jumps).toEqual([
			{
				spaceId: "infra",
				spaceName: "Infra",
				catName: "Monitoring",
				cardId: "graf",
				title: "Grafana",
				url: "https://grafana.example",
				path: "Infra / Monitoring",
			},
		]);
	});
});
