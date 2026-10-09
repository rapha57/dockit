import { readFile } from "node:fs/promises";
import { join } from "node:path";

export function portalDataFile(): string {
  const custom = process.env.PORTAL_DATA_FILE?.trim();
  if (custom) return custom;
  return join(process.cwd(), "data", "portal.json");
}

function isEnoent(err: unknown): boolean {
  return Boolean(
    err && typeof err === "object" && "code" in err && (err as { code: unknown }).code === "ENOENT",
  );
}

export async function healthPayload(): Promise<{ ok: true } | { ok: false }> {
  try {
    const text = await readFile(portalDataFile(), "utf8");
    JSON.parse(text);
    return { ok: true };
  } catch (err) {
    if (isEnoent(err)) return { ok: true };
    return { ok: false };
  }
}
