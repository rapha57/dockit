export const PORTAL_VERSION = "2026.09.18.6";

function versionParts(raw: unknown) {
  return String(raw || "")
    .replace(/^v/i, "")
    .split(".")
    .map((n) => Number(n) || 0);
}

export function isNewerVersion(latest: unknown, current: unknown) {
  const a = versionParts(latest);
  const b = versionParts(current);
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if ((a[i] || 0) > (b[i] || 0)) return true;
    if ((a[i] || 0) < (b[i] || 0)) return false;
  }
  return false;
}
