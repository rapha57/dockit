import { describe, expect, it } from "vitest";
import {
	allLinkIds,
	bookmarkTree,
	bookmarksHtml,
	checkState,
	escapeHtml,
	hasBookmarkLinks,
	toggleIds,
} from "@/lib/bookmarks-html";

const catalog = [
	{
		id: "infra",
		name: "Infra",
		categories: [
			{
				id: "mon",
				name: "Monitoring",
				cards: [
					{
						id: "graf",
						kind: "app",
						title: "Grafana",
						links: [
							{ title: "", url: "https://grafana.example" },
							{ title: "Explore", url: "https://grafana.example/explore" },
						],
					},
					{
						id: "note",
						kind: "note",
						title: "Runbook",
						url: "https://notes.example/runbook",
					},
					{
						id: "embed",
						kind: "embed",
						title: "Status",
						url: "https://status.example",
					},
					{
						id: "empty",
						kind: "embed",
						title: "Blank",
						url: "",
					},
				],
			},
			{
				id: "net",
				name: "Network",
				cards: [
					{
						id: "unifi",
						kind: "app",
						title: "UniFi",
						url: "https://unifi.example",
					},
				],
			},
		],
	},
	{
		id: "lab",
		name: "Lab & <test>",
		categories: [
			{
				id: "sandbox",
				name: "Sandbox",
				cards: [],
			},
		],
	},
];

describe("bookmarkTree", () => {
	it("keeps app links and embeds with a URL, skips notes and empty embeds", () => {
		const tree = bookmarkTree(catalog);
		expect(tree).toHaveLength(1);
		expect(tree[0].name).toBe("Infra");
		expect(tree[0].categories.map((c) => c.id)).toEqual(["mon", "net"]);
		const mon = tree[0].categories[0];
		expect(mon.cards.map((c) => c.id)).toEqual(["graf", "embed"]);
		expect(mon.cards[0].links).toEqual([
			{ id: "graf\thttps://grafana.example", title: "Grafana", url: "https://grafana.example" },
			{ id: "graf\thttps://grafana.example/explore", title: "Explore", url: "https://grafana.example/explore" },
		]);
		expect(mon.cards[1].links).toEqual([
			{ id: "embed\thttps://status.example", title: "Status", url: "https://status.example" },
		]);
		expect(hasBookmarkLinks(catalog)).toBe(true);
		expect(hasBookmarkLinks([])).toBe(false);
	});

	it("drops javascript and credentialed URLs", () => {
		const tree = bookmarkTree([
			{
				id: "s",
				name: "S",
				categories: [
					{
						id: "c",
						name: "C",
						cards: [
							{ id: "bad", kind: "app", title: "X", url: "javascript:alert(1)" },
							{
								id: "ok",
								kind: "app",
								title: "Y",
								url: "https://ok.example",
							},
							{
								id: "auth",
								kind: "app",
								title: "Z",
								url: "https://user:pass@evil.example",
							},
						],
					},
				],
			},
		]);
		expect(tree[0].categories[0].cards.map((c) => c.id)).toEqual(["ok"]);
	});
});

describe("selection", () => {
	it("toggles a parent between all and none, and reports mixed", () => {
		const tree = bookmarkTree(catalog);
		const ids = allLinkIds(tree);
		expect(ids).toEqual([
			"graf\thttps://grafana.example",
			"graf\thttps://grafana.example/explore",
			"embed\thttps://status.example",
			"unifi\thttps://unifi.example",
		]);
		let selected = new Set(ids);
		expect(checkState(ids, selected)).toBe("on");
		selected = toggleIds(selected, ["graf\thttps://grafana.example"]);
		expect(checkState(ids, selected)).toBe("mixed");
		selected = toggleIds(selected, ids);
		expect(checkState(ids, selected)).toBe("on");
		selected = toggleIds(selected, ids);
		expect(checkState(ids, selected)).toBe("off");
		expect(selected.size).toBe(0);
	});
});

describe("bookmarksHtml", () => {
	it("writes a Netscape file with nested folders and escaped names", () => {
		const tree = bookmarkTree([
			{
				id: "infra",
				name: "Infra & Co",
				categories: [
					{
						id: "mon",
						name: "Monitoring",
						cards: [
							{
								id: "graf",
								kind: "app",
								title: 'Grafana "prod"',
								links: [{ title: "", url: "https://grafana.example/?a=1&b=2" }],
							},
						],
					},
				],
			},
		]);
		const html = bookmarksHtml(tree, new Set(allLinkIds(tree)), "Dockit");
		expect(html.startsWith("<!DOCTYPE NETSCAPE-Bookmark-file-1>")).toBe(true);
		expect(html).toContain("<H1>Bookmarks</H1>");
		expect(html).toContain("<DT><H3>Dockit</H3>");
		expect(html).toContain("<DT><H3>Infra &amp; Co</H3>");
		expect(html).toContain('<DT><A HREF="https://grafana.example/?a=1&amp;b=2">Grafana &quot;prod&quot;</A>');
		expect(html).not.toContain("javascript:");
	});

	it("omits unchecked cards and empty folders", () => {
		const tree = bookmarkTree(catalog);
		const html = bookmarksHtml(tree, new Set(["unifi\thttps://unifi.example"]), "Dockit");
		expect(html).toContain("UniFi");
		expect(html).toContain("Network");
		expect(html).not.toContain("Grafana");
		expect(html).not.toContain("Monitoring");
		expect(html).not.toContain("Status");
	});
});

describe("escapeHtml", () => {
	it("escapes markup", () => {
		expect(escapeHtml(`a&b<"c">`)).toBe("a&amp;b&lt;&quot;c&quot;&gt;");
	});
});
