import { z } from "zod";
import { isWeakPassword, passwordPolicyError } from "../security";
import { clientIp } from "../security-runtime";
import { parseSessCookie } from "../session-cookie";
import { isOwnerUser, roleIdsOf, type AclDoc, type User } from "../acl";
import type { Doc, DocSpace, HydratedUser, SessionInfo, SpacePerm, StoredUser } from "./types";
import {
  ensureGroups,
  ensureRoles,
  hydrateUser,
  spaceCanEdit,
  spaceCanMove,
  spaceCanSee,
} from "./model";

const SESSION_MS = 432e5;
type SessionRow = { userId: string; exp: number };
export const sessions = /* @__PURE__ */ new Map<string, SessionRow>();
type OidcPendingRow = { redirectUri: string; verifier: string; nonce: string; exp: number };
export const oidcPending = /* @__PURE__ */ new Map<string, OidcPendingRow>();
export const OIDC_PENDING_MS = 5 * 60 * 1000;
export function envUser() {
  return (process.env.PORTAL_EDIT_USER || "admin").trim().toLowerCase() || "admin";
}
export function envPassword() {
  return (process.env.PORTAL_EDIT_PASSWORD || "admin").trim() || "admin";
}
function nodeCrypto() {
  const proc = globalThis.process as { getBuiltinModule?: (id: string) => unknown } | undefined;
  if (typeof proc?.getBuiltinModule === "function") {
    return proc.getBuiltinModule("crypto") as typeof import("node:crypto");
  }
  throw new Error("errors.generic");
}

function randomHex(bytes: number) {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

function hashPasswordSync(password: string) {
  const { randomBytes, scryptSync } = nodeCrypto();
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 32).toString("hex")}`;
}
export async function hashPassword(password: string) {
  const { randomBytes: bytes, scrypt } = await import("node:crypto");
  const { promisify } = await import("node:util");
  const salt = bytes(16).toString("hex");
  const buf = (await promisify(scrypt)(password, salt, 32)) as Buffer;
  return `${salt}:${Buffer.from(buf).toString("hex")}`;
}
export async function verifyPassword(password: string, stored: string | undefined) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const { scrypt, timingSafeEqual: same } = await import("node:crypto");
  const { promisify } = await import("node:util");
  const next = Buffer.from((await promisify(scrypt)(password, salt, 32)) as Buffer);
  const prev = Buffer.from(hash, "hex");
  if (next.length !== prev.length) return false;
  return same(next, prev);
}
type LoginFailRow = { n: number; until: number };
const loginFails = /* @__PURE__ */ new Map<string, LoginFailRow>();
const LOGIN_MAX = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export function clientKey(username: unknown, request: any) {
  return `${clientIp(request)}:${String(username || "").toLowerCase()}`;
}
export function requireStrongPassword(raw: string) {
  const err = passwordPolicyError(raw);
  if (err) throw new Error(err);
}
let defaultAdminCache = {
  hash: "",
  value: false,
};
export async function isDefaultAdminPassword(doc: Doc) {
  const admin = ensureUsers(doc).find((u) => u.id === "admin" || isOwnerUser(u));
  if (!admin?.passHash) return true;
  if (defaultAdminCache.hash === admin.passHash) return defaultAdminCache.value;
  const env = envPassword();
  const value =
    (await verifyPassword("admin", admin.passHash)) ||
    (isWeakPassword(env) && (await verifyPassword(env, admin.passHash)));
  defaultAdminCache = {
    hash: admin.passHash,
    value: Boolean(value),
  };
  return defaultAdminCache.value;
}
export async function sessionFor(user: StoredUser, doc: Doc) {
  const u = hydrateUser(user, doc);
  const info = sessionInfo(u as StoredUser, doc);
  if (user.id === "admin") info.mustChangePassword = await isDefaultAdminPassword(doc);
  return info;
}
export function loginBlocked(key: string) {
  const row = loginFails.get(key);
  if (!row) return false;
  if (Date.now() > row.until) {
    loginFails.delete(key);
    return false;
  }
  return row.n >= LOGIN_MAX;
}
export function loginFail(key: string) {
  const now = Date.now();
  const row = loginFails.get(key) || {
    n: 0,
    until: now + LOGIN_WINDOW_MS,
  };
  row.n += 1;
  row.until = now + LOGIN_WINDOW_MS;
  loginFails.set(key, row);
}
export function loginOk(key: string) {
  loginFails.delete(key);
}
export function issueToken(userId: string) {
  const token = randomHex(24);
  sessions.set(token, {
    userId,
    exp: Date.now() + SESSION_MS,
  });
  return token;
}
export const tokenField = z.string().min(1);
export function tok(
  data: unknown,
  request: { headers?: { get?: (k: string) => string | null } } | null | undefined,
) {
  const token =
    data && typeof data === "object" && "token" in data
      ? (data as { token?: unknown }).token
      : undefined;
  return (
    parseSessCookie(
      typeof request?.headers?.get === "function" ? request.headers.get("cookie") : "",
    ) || String(token || "")
  );
}
export function sessionAlive(token: string | null | undefined) {
  if (!token) return false;
  const row = sessions.get(token);
  return Boolean(row && row.exp >= Date.now());
}
export function ensureUsers(doc: Doc) {
  if (!Array.isArray(doc.users)) doc.users = [];
  let admin = doc.users.find((u) => u.id === "admin");
  if (!admin) {
    admin = {
      id: "admin",
      username: envUser(),
      passHash: hashPasswordSync(envPassword()),
      role: "owner",
      roleIds: ["owner"],
    };
    doc.users.unshift(admin);
  }
  admin.role = "owner";
  admin.roleIds = ["owner"];
  admin.disabled = false;
  if (!admin.passHash) admin.passHash = hashPasswordSync(envPassword());
  // Directory accounts carry no personal role: rights come from the group
  // mapping. Strip leftover base roles from the old provisioning.
  for (const u of doc.users) {
    if (u.id !== "admin" && u.source === "ad" && ((u.roleIds || []).length || u.role)) {
      u.roleIds = [];
      u.role = "";
    }
  }
  return doc.users;
}
function spaceAccess(
  space: DocSpace,
  user: User | null | undefined,
  doc: AclDoc,
): SpacePerm | null {
  if (!spaceCanSee(space, user, doc)) return null;
  if (spaceCanEdit(space, user, doc)) return "edit";
  return "view";
}
function readSession(token: string) {
  const row = sessions.get(token);
  if (!row || row.exp < Date.now()) {
    if (row) sessions.delete(token);
    throw new Error("errors.sessionExpired");
  }
  return row;
}
export function requireUser(doc: Doc, token: string): HydratedUser {
  ensureUsers(doc);
  ensureGroups(doc);
  ensureRoles(doc);
  const sess = readSession(token);
  const user = doc.users.find((u) => u.id === sess.userId);
  if (!user) throw new Error("errors.userNotFound");
  if (user.disabled) throw new Error("errors.disabled");
  return hydrateUser(user, doc)!;
}
/** Sync: cache is warmed in readDocUnlocked via isDefaultAdminPassword. */
export function adminMustChangePassword(doc: Doc): boolean {
  const admin = ensureUsers(doc).find((u) => u.id === "admin" || isOwnerUser(u));
  if (!admin?.passHash) return true;
  if (defaultAdminCache.hash === admin.passHash) return defaultAdminCache.value;
  return true;
}
export function assertReadyPassword(doc: Doc, user: { id?: string } | null | undefined) {
  if (!user || user.id !== "admin") return;
  if (adminMustChangePassword(doc)) throw new Error("errors.mustChangePassword");
}
export async function gateWeakAdmin(
  doc: Doc,
  data: unknown,
  request: { headers?: { get?: (k: string) => string | null } } | null | undefined,
) {
  const token = tok(data, request);
  if (!token) return;
  let user: HydratedUser;
  try {
    user = requireUser(doc, token);
  } catch {
    return;
  }
  assertReadyPassword(doc, user);
}
export function requireEdit(doc: Doc, token: string, spaceId?: string): HydratedUser {
  const user = requireUser(doc, token);
  assertReadyPassword(doc, user);
  if (isOwnerUser(user)) return user;
  if (spaceId) {
    const space = doc.spaces.find((t) => t.id === spaceId);
    if (!space || !spaceCanEdit(space, user, doc)) throw new Error("errors.noEditSpace");
    return user;
  }
  if (user.canCreateSpaces || user._canEdit || doc.spaces.some((t) => spaceCanEdit(t, user, doc)))
    return user;
  throw new Error("errors.readonly");
}
export function requireAdmin(doc: Doc, token: string): HydratedUser {
  const user = requireUser(doc, token);
  if (!isOwnerUser(user) && !user.canManageSettings) throw new Error("errors.adminOnly");
  assertReadyPassword(doc, user);
  return user;
}
export function requireAccountManager(
  doc: Doc,
  token: string,
  opts?: { allowWeakAdmin?: boolean },
): HydratedUser {
  const user = requireUser(doc, token);
  if (!isOwnerUser(user) && !user.canManageUsers && !user.canManageGroups && !user.canManageRoles)
    throw new Error("errors.insufficient");
  if (!opts?.allowWeakAdmin) assertReadyPassword(doc, user);
  return user;
}
export function requireCreateSpace(doc: Doc, token: string): HydratedUser {
  const user = requireUser(doc, token);
  assertReadyPassword(doc, user);
  if (isOwnerUser(user) || user.canCreateSpaces) return user;
  throw new Error("errors.noManageSpaces");
}
function latestSessionExp(userId: string) {
  let exp = 0;
  for (const row of sessions.values()) {
    if (row.userId === userId && row.exp > exp) exp = row.exp;
  }
  return exp || undefined;
}
export function sessionInfo(user: StoredUser, doc: Doc): SessionInfo {
  const u = hydrateUser(user, doc)!;
  const spacePerms: Record<string, SpacePerm> = {};
  const spaceMoves: Record<string, boolean> = {};
  for (const space of doc.spaces) {
    const perm = spaceAccess(space, u, doc);
    if (perm) spacePerms[space.id] = perm;
    if (spaceCanSee(space, u, doc) && spaceCanMove(space, u, doc)) spaceMoves[space.id] = true;
  }
  const owner = isOwnerUser(u);
  return {
    username: u.username,
    role: owner ? "owner" : u.role,
    roleId: u.roleId || (u.roleIds && u.roleIds[0]) || user.role,
    roleIds: u.roleIds || roleIdsOf(user),
    isOwner: owner,
    canEdit: Boolean(owner || u._canEdit),
    canMove: Boolean(owner || u._canMove),
    canManageUsers: Boolean(u.canManageUsers || owner),
    canManageGroups: Boolean(u.canManageGroups || owner),
    canManageRoles: Boolean(u.canManageRoles || owner),
    canManageSettings: Boolean(u.canManageSettings || owner),
    canCreateSpaces: Boolean(u.canCreateSpaces || owner),
    canAudit: Boolean(u.canAudit || owner),
    canRestore: Boolean(u.canRestore || owner),
    canCuration: Boolean(u.canCuration || owner),
    canPurge: Boolean(u.canPurge || owner),
    spacePerms,
    spaceMoves,
    exp: latestSessionExp(u.id),
  };
}
