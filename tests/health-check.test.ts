import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { healthPayload } from "@/lib/health-check";

const prev = process.env.PORTAL_DATA_FILE;

afterEach(() => {
  if (prev === undefined) delete process.env.PORTAL_DATA_FILE;
  else process.env.PORTAL_DATA_FILE = prev;
});

describe("healthPayload", () => {
  it("treats a missing portal.json as live", async () => {
    process.env.PORTAL_DATA_FILE = join(
      tmpdir(),
      `dockit-health-missing-${Date.now()}`,
      "portal.json",
    );
    expect(await healthPayload()).toEqual({ ok: true });
  });

  it("is live when the file parses", async () => {
    const dir = mkdtempSync(join(tmpdir(), "dockit-health-"));
    const file = join(dir, "portal.json");
    writeFileSync(file, JSON.stringify({ settings: { title: "Dockit" }, spaces: [] }));
    process.env.PORTAL_DATA_FILE = file;
    expect(await healthPayload()).toEqual({ ok: true });
  });

  it("is down when the file is corrupt", async () => {
    const dir = mkdtempSync(join(tmpdir(), "dockit-health-"));
    const file = join(dir, "portal.json");
    writeFileSync(file, "{");
    process.env.PORTAL_DATA_FILE = file;
    expect(await healthPayload()).toEqual({ ok: false });
  });

  it("is down when the path is a directory", async () => {
    const dir = mkdtempSync(join(tmpdir(), "dockit-health-"));
    mkdirSync(join(dir, "portal.json"));
    process.env.PORTAL_DATA_FILE = join(dir, "portal.json");
    expect(await healthPayload()).toEqual({ ok: false });
  });
});
