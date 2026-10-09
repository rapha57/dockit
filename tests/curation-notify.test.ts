import { afterEach, describe, expect, it, vi } from "vitest";
import {
	asCurationStore,
	notifyCurationDown,
	notifyText,
	webhookUrlOk,
} from "@/lib/curation-runtime";
import * as probe from "@/lib/probe-runtime";

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
	it("POSTs text plus structured fields through the DNS pin", async () => {
		const post = vi.spyOn(probe, "pinnedJsonPost").mockResolvedValue({ status: 200 });
		const items = [{ title: "GitLab", url: "https://gitlab.example/", status: "error", cardId: "c1" }];
		const result = await notifyCurationDown("https://hooks.example/dockit", items);
		expect(result.ok).toBe(true);
		expect(result.status).toBe(200);
		expect(result.host).toBe("hooks.example");
		expect(post).toHaveBeenCalledOnce();
		expect(post.mock.calls[0]?.[0]).toBe("https://hooks.example/dockit");
		const body = post.mock.calls[0]?.[1] as { text?: string; source?: string; event?: string; items?: unknown };
		expect(body.text).toBe("Dockit: GitLab (error) — https://gitlab.example/");
		expect(body.source).toBe("dockit");
		expect(body.event).toBe("curation.down");
		expect(body.items).toEqual(items);
	});

	it("skips the POST when nothing is down", async () => {
		const post = vi.spyOn(probe, "pinnedJsonPost");
		const result = await notifyCurationDown("https://hooks.example/dockit", []);
		expect(result.ok).toBe(true);
		expect(result.detail).toBe("skip");
		expect(post).not.toHaveBeenCalled();
	});

	it("records HTTP failure", async () => {
		vi.spyOn(probe, "pinnedJsonPost").mockResolvedValue({ status: 500 });
		const result = await notifyCurationDown("https://hooks.example/dockit", [], "curation.test");
		expect(result.ok).toBe(false);
		expect(result.status).toBe(500);
		expect(result.detail).toBe("HTTP 500");
		expect(result.event).toBe("curation.test");
	});

	it("records a forbidden pin as a failed delivery", async () => {
		vi.spyOn(probe, "pinnedJsonPost").mockRejectedValue(new Error("errors.probeForbidden"));
		const result = await notifyCurationDown("https://hooks.example/dockit", [], "curation.test");
		expect(result.ok).toBe(false);
		expect(result.detail).toBe("errors.probeForbidden");
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
