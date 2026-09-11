export function sessionGone(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err || "");
  if (msg !== "errors.sessionExpired" && !/session expir/i.test(msg)) return false;
  try {
    window.dispatchEvent(new Event("portal-session-gone"));
  } catch {
    // ignore
  }
  return true;
}
