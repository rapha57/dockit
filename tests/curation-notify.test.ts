import { afterEach, describe, expect, it, vi } from "vitest";
import {
	asCurationStore,
	notifyCurationDown,
	notifyText,
	webhookUrlOk,
} from "@/lib/curation-runtime";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("webhookUrlOk", () => {
	it("allows http(s) and rejects metadata", () => {
		expect(webhookUrlOk("https://hooks.slack.com/services/T/B/xxx")).toBe(true);
		expect(webhookUrlOk("http://n8n.internal/webhook/dockit")).toBe(true);
		expect(webhookUrlOk("")).toBe(false);
		expect(webhookUrlOk("javascript:alert(1)")).toBe(false);
		expect(webhookUrlOk("https://169.254.169.254/latest")).toBe(false);
		expect(webhookUrlOk("http://metadata.google.internal/")).toBe(false);
	});
});

describe("notifyText", () => {
	it("is a one-line Slack-readable summary", () => {
		expect(notifyText("curation.test", [])).toBe("Dockit webhook test.");
		expect(
			notifyText("curation.down", [{ title: "GitLab", url: "https://gitlab.example/", status: "error", cardId: "c1" }]),
		).toBe("Dockit: GitLab (error) — https://gitlab.example/");
		expect(
			notifyText("curation.down", [
				{ title: "GitLab", url: "https://gitlab.example/", status: "error", cardId: "c1" },
				{ title: "Jira", url: "https://jira.example/", status: "timeout", cardId: "c2" },
			]),
		).toMatch(/^Dockit: 2 unreachable links/);
	});
});

describe("notifyCurationDown", () => {
	it("POSTs text plus structured fields", async () => {
		const fetchMock = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>(
			async () => new Response("ok", { status: 200 }),
		);
		vi.stubGlobal("fetch", fetchMock);
		const items = [{ title: "GitLab", url: "https://gitlab.example/", status: "error", cardId: "c1" }];
		const result = await notifyCurationDown("https://hooks.example/dockit", items);
		expect(result.ok).toBe(true);
		expect(result.status).toBe(200);
		expect(result.host).toBe("hooks.example");
		expect(fetchMock).toHaveBeenCalledOnce();
		const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body || "{}"));
		expect(body.text).toBe("Dockit: GitLab (error) — https://gitlab.example/");
		expect(body.source).toBe("dockit");
		expect(body.event).toBe("curation.down");
		expect(body.items).toEqual(items);
	});

	it("skips the POST when nothing is down", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const result = await notifyCurationDown("https://hooks.example/dockit", []);
		expect(result.ok).toBe(true);
		expect(result.detail).toBe("skip");
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("records HTTP failure", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("nope", { status: 500 })),
		);
		const result = await notifyCurationDown("https://hooks.example/dockit", [], "curation.test");
		expect(result.ok).toBe(false);
		expect(result.status).toBe(500);
		expect(result.detail).toBe("HTTP 500");
		expect(result.event).toBe("curation.test");
	});
});

describe("asCurationStore notify", () => {
	it("round-trips last delivery", () => {
		const store = asCurationStore({
			version: 1,
			updatedAt: 1,
			checks: {},
			notify: { at: 9, ok: true, event: "curation.test", status: 200, host: "hooks.example" },
		});
		expect(store.notify).toEqual({
			at: 9,
			ok: true,
			event: "curation.test",
			status: 200,
			host: "hooks.example",
		});
	});
});
