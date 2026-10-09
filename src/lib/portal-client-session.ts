import { t } from "@/lib/i18n";
import { startOidc } from "@/lib/portal";
import type { SessionInfo } from "@/lib/portal/types";

export const TOKEN_KEY = "portal-edit-token";
export const SESSION_KEY = "portal-session";
export const EDIT_MODE_KEY = "portal-edit-mode";
export const OIDC_AUTO_KEY = "oidc-auto";
export const OIDC_AUTO_MS = 30_000;
export const OIDC_NEXT_KEY = "portal-oidc-next";

export function copyLabel(raw: unknown, fallback?: string) {
  const text = String(raw || "").trim();
  const fb = fallback || t("copy.fallback");
  const base = (text || fb).replace(/\s*\((copie|copy)\)\s*$/i, "");
  return `${base} (${t("copy.suffix")})`.slice(0, 80);
}

export function typingTarget(el: EventTarget | null) {
  if (!el || !(el instanceof Element)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return Boolean(el.closest("input, textarea, select, [contenteditable='true']"));
}

export function readToken() {
  if (typeof window === "undefined") return "";
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function oidcAutoFresh() {
  if (typeof window === "undefined") return false;
  try {
    const last = Number(sessionStorage.getItem(OIDC_AUTO_KEY) || 0);
    return Date.now() - last < OIDC_AUTO_MS;
  } catch {
    return false;
  }
}

export function markOidcAuto() {
  try {
    sessionStorage.setItem(OIDC_AUTO_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

export function canKickOidc(settings: { oidcEnabled?: boolean; oidcAutoRedirect?: boolean }) {
  return Boolean(settings.oidcEnabled && settings.oidcAutoRedirect) && !oidcAutoFresh();
}

export async function kickOidcRedirect(next: string) {
  markOidcAuto();
  try {
    sessionStorage.setItem(OIDC_NEXT_KEY, next);
  } catch {
    // ignore
  }
  const res = await startOidc({
    data: {},
  });
  if (!res?.url) throw new Error("errors.oidcFail");
  window.location.assign(res.url);
}

export function readSessionInfo(): SessionInfo | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function pinSessCookie(token: string | null | undefined) {
  if (!token || typeof fetch === "undefined") return;
  const res = await fetch("/__dockit/session", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({
      token,
    }),
  });
  if (!res.ok) throw new Error("errors.sessionCookieDenied");
}

export async function applySessionToken(token: string, httpOnly: boolean) {
  if (httpOnly) {
    await pinSessCookie(token);
    try {
      sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      // ignore
    }
  } else {
    try {
      sessionStorage.setItem(TOKEN_KEY, token);
    } catch {
      // ignore
    }
  }
}

export async function clearSessCookie() {
  if (typeof fetch === "undefined") return;
  try {
    await fetch("/__dockit/session", {
      method: "DELETE",
      credentials: "include",
    });
  } catch {
    // ignore
  }
}

export function writeSessionInfo(session: SessionInfo | null | undefined) {
  try {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

export function sessionCanEditSpace(
  session: SessionInfo | null | undefined,
  spaceId: string | undefined,
): boolean {
  if (!session || !spaceId) return false;
  if (session.isOwner) return true;
  return session.spacePerms?.[spaceId] === "edit";
}

export function sessionCanMoveSpace(
  session: SessionInfo | null | undefined,
  spaceId: string | undefined,
): boolean {
  if (!session || !spaceId) return false;
  if (session.isOwner) return true;
  return Boolean(session.spaceMoves?.[spaceId]);
}

export function sessionCanArrange(session: SessionInfo | null | undefined): boolean {
  if (!session) return false;
  return Boolean(session.isOwner || session.canEdit || session.canMove);
}

export function sessionCanManageAcl(session: SessionInfo | null | undefined): boolean {
  if (!session) return false;
  return Boolean(session.isOwner || session.canManageUsers || session.canManageRoles);
}

export function sessionCanCreateSpaces(session: SessionInfo | null | undefined): boolean {
  if (!session) return false;
  return Boolean(session.isOwner || session.canCreateSpaces);
}
