import { newId } from "../id";
import { safeAppHref, safeEmbedHref } from "../safe-href";
import { DEFAULT_OIDC_SCOPE } from "../oidc-scope";
import { filterGroupNames } from "../oidc-groups";
import { t, withLocale } from "../i18n";
import { remapTagHex } from "../tag-colors";
import {
  asGrants,
  can,
  defaultRoles,
  grantsFromLegacyRole,
  groupsOf,
  isOwnerUser,
  isSystemRole,
  roleIdsOf,
  type AclDoc,
  type GrantInput,
  type Group,
  type Role,
  type Space,
  type User,
} from "../acl";
import type { HistoryEvent } from "../history";
import { rdnValue } from "../ldap-runtime";
import {
  asAuthSource,
  asCheck,
  asCheckHost,
  asIdList,
  asKind,
  type AuthSource,
  type Doc,
  type DocSpace,
  type HydratedUser,
  type PortalCard,
  type PortalCategory,
  type PortalSettings,
  type StoredUser,
} from "./types";

function asSpan(v: unknown): 1 | 2 | 3 {
  const n = Number(v);
  return n === 2 || n === 3 ? n : 1;
}
function asTags(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  const seen = /* @__PURE__ */ new Set<string>();
  for (const raw of v) {
    const tag = String(raw ?? "")
      .trim()
      .slice(0, 32);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= 3) break;
  }
  return out;
}
function asEmbedBg(raw: unknown): string | undefined {
  const v = String(raw || "")
    .trim()
    .toLowerCase();
  if (!v) return void 0;
  if (v === "default") return "default";
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  return void 0;
}
function asExtraLinks(raw: unknown): { title: string; url: string; openIn?: "_blank" | "_self" }[] {
  if (!Array.isArray(raw)) return [];
  const out: { title: string; url: string; openIn?: "_blank" | "_self" }[] = [];
  const seen = /* @__PURE__ */ new Set<string>();
  for (const row of raw) {
    const title = String((row as any)?.title ?? "")
      .trim()
      .slice(0, 40);
    const url = safeAppHref((row as any)?.url);
    if (!url) continue;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const openIn = (row as any)?.openIn === "_self" ? ("_self" as const) : undefined;
    out.push({
      title,
      url,
      ...(openIn ? { openIn } : {}),
    });
    if (out.length >= 20) break;
  }
  return out;
}
export function normalizeItem(a: unknown, categoryId: string, sortOrder: number): PortalCard {
  const row =
    a && typeof a === "object"
      ? (a as Record<string, unknown> & {
          kind?: unknown;
          links?: unknown;
          url?: unknown;
          id?: string;
          title?: unknown;
          description?: unknown;
          icon?: unknown;
          openIn?: unknown;
          tags?: unknown;
          colSpan?: unknown;
          rowSpan?: unknown;
          check?: unknown;
          checkHost?: unknown;
          clicks?: unknown;
          linkMenu?: unknown;
          embedBorder?: unknown;
          embedBg?: unknown;
        })
      : {};
  const kind = asKind(row.kind);
  let linksFull: { title: string; url: string; openIn?: "_blank" | "_self" }[] = [];
  if (kind === "app") {
    const extras = asExtraLinks(row.links);
    const main = safeAppHref(row.url == null ? undefined : String(row.url));
    if (main && extras[0]?.url !== main) extras.unshift({ title: "", url: main });
    linksFull = extras.slice(0, 20);
  }
  return {
    id: row.id || newId(),
    categoryId,
    kind,
    title: String(row.title || (kind === "note" || kind === "embed" ? "" : "Untitled")).slice(
      0,
      80,
    ),
    description: String(row.description || "").slice(0, 8e3),
    url:
      kind === "app"
        ? undefined
        : kind === "embed"
          ? safeEmbedHref(row.url == null ? undefined : String(row.url)) || ""
          : safeAppHref(row.url == null ? undefined : String(row.url)) || "",
    icon: String(
      row.icon || (kind === "note" ? "FileText" : kind === "embed" ? "AppWindow" : "Link"),
    ),
    openIn: row.openIn === "_self" ? "_self" : "_blank",
    tags: kind === "app" ? asTags(row.tags) : [],
    colSpan: asSpan(row.colSpan),
    rowSpan: asSpan(row.rowSpan),
    sortOrder,
    check: kind === "app" ? asCheck(row.check) : "off",
    checkHost: kind === "app" && asCheck(row.check) === "icmp" ? asCheckHost(row.checkHost) : "",
    clicks: Math.max(0, Math.floor(Number(row.clicks) || 0)),
    links: kind === "app" ? linksFull : [],
    linkMenu: kind === "app" ? Boolean(row.linkMenu) : false,
    embedBorder: kind === "embed" ? Boolean(row.embedBorder) : void 0,
    embedBg: kind === "embed" ? asEmbedBg(row.embedBg) : void 0,
  };
}
export function defaultSettings(): PortalSettings {
  return {
    title: "Dockit",
    subtitle: "Pin your URLs",
    logo: "",
    healthChecks: true,
    usageStats: true,
    infoBar: true,
    tagColors: {},
    cssLight: "",
    cssDark: "",
    documentTitle: "Dockit",
    favicon: "",
    favsHideLabel: false,
    restoreLastSpace: false,
    favNotes: false,
    favEmbeds: false,
    onlineIcons: false,
    navRichIcons: false,
    headerGlass: true,
    probeBlink: false,
    annexFade: false,
    catCounts: false,
    pruneOrphanTags: false,
    tagsAlpha: true,
    cardResize: true,
    cardIconBg: true,
    cardContextMenu: true,
    cardDragCollapse: true,
    ctxHideUrl: false,
    infoStats: true,
    infoLegend: true,
    probeTlsVerify: false,
    curationWebhook: "",
    curationCron: "",
    probeCaPem: "",
    probeAuthOnly: false,
    requireLogin: false,
    sessionHttpOnly: true,
    devAdminNoPassword: false,
    proxyAuthEnabled: false,
    proxyAuthHeader: "X-Remote-User",
    outboundProxyEnabled: false,
    outboundProxyHost: "",
    outboundProxyPort: 3128,
    outboundProxyUsername: "",
    outboundProxyPassword: "",
    oidcEnabled: false,
    oidcIssuer: "",
    oidcClientId: "",
    oidcClientSecret: "",
    oidcScope: DEFAULT_OIDC_SCOPE,
    oidcGroupFilter: "",
    oidcLabel: "SSO",
    oidcAutoCreate: false,
    oidcAutoRedirect: false,
    ldapEnabled: false,
    ldapHost: "",
    ldapPort: 636,
    ldapTls: true,
    ldapTlsVerify: true,
    ldapBindDn: "",
    ldapBindPassword: "",
    ldapBaseDn: "",
    ldapUserFilter: "",
    ldapDomain: "",
    ldapAutoCreate: false,
    ldapDirectories: [],
    loginOrder: ["local"],
    locale: "en",
    dateFormat: "ymd",
    timeFormat: "24h",
    timezone: "",
    numberFormat: "auto",
  };
}
export function blankSpaces(locale?: unknown): { lastSpaceId: string; spaces: DocSpace[] } {
  const spaceId = newId();
  const catId = newId();
  const name = withLocale(locale ?? "en", () => t("seed.space"));
  const category = withLocale(locale ?? "en", () => t("seed.category"));
  return {
    lastSpaceId: spaceId,
    spaces: [
      {
        id: spaceId,
        name,
        icon: "Layers",
        sortOrder: 1,
        restricted: false,
        viewers: [],
        editors: [],
        hideLabel: false,
        categories: [
          {
            id: catId,
            name: category,
            icon: "AppWindow",
            sortOrder: 1,
            restricted: false,
            viewers: [],
            editors: [],
            cards: [],
          },
        ],
      },
    ],
  };
}
export function defaultStore(): Doc {
  const blank = blankSpaces();
  return {
    settings: defaultSettings(),
    customIcons: [],
    lastSpaceId: blank.lastSpaceId,
    clickDays: {},
    users: [],
    groups: [],
    roles: defaultRoles(),
    history: [],
    spaces: blank.spaces,
    rev: 0,
  };
}
export function assignTagColors(doc: Doc, tags: unknown, extras: unknown) {
  const colors = { ...asTagColors(doc.settings.tagColors) };
  const extra =
    extras && typeof extras === "object" && !Array.isArray(extras)
      ? (extras as Record<string, unknown>)
      : {};
  for (const raw of Array.isArray(tags) ? tags : []) {
    const tag = String(raw || "")
      .trim()
      .slice(0, 32);
    if (!tag) continue;
    if (Object.keys(colors).some((k) => k.toLowerCase() === tag.toLowerCase())) continue;
    const hit = Object.entries(extra).find(
      ([k, v]) => k.toLowerCase() === tag.toLowerCase() && /^#[0-9a-f]{6}$/i.test(String(v)),
    );
    if (!hit) continue;
    colors[tag] = String(hit[1]).toLowerCase();
  }
  doc.settings.tagColors = colors;
}
export function eachItem(doc: Doc, fn: (app: PortalCard) => void) {
  for (const space of doc.spaces)
    for (const cat of space.categories) for (const app of cat.cards) fn(app);
}
export function unwrapBackup(raw: any) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  if (raw.settings && Array.isArray(raw.spaces)) return raw;
  if (raw.backup && typeof raw.backup === "object") return raw.backup;
  return raw;
}
export function pruneUnusedTags(doc: Doc) {
  if (!doc.settings.pruneOrphanTags) return;
  const used = new Set<string>();
  eachItem(doc, (app) => {
    if ((app.kind || "app") !== "app") return;
    for (const tag of app.tags || []) used.add(String(tag).toLowerCase());
  });
  const colors = { ...asTagColors(doc.settings.tagColors) };
  for (const name of Object.keys(colors)) {
    if (!used.has(name.toLowerCase())) delete colors[name];
  }
  doc.settings.tagColors = colors;
}
export function asTagColors(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const name = String(key || "")
      .trim()
      .slice(0, 32);
    const hex = remapTagHex(
      String(value || "")
        .trim()
        .toLowerCase(),
    );
    if (!name || !/^#[0-9a-f]{6}$/.test(hex)) continue;
    out[name] = hex;
    if (Object.keys(out).length >= 80) break;
  }
  return out;
}
export function asClickDays(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
    const n = Math.max(0, Math.floor(Number(value) || 0));
    if (!n) continue;
    out[key] = n;
    if (Object.keys(out).length >= 800) break;
  }
  return out;
}
export function asUsers(raw: unknown): StoredUser[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((u: any) => {
      const row = u;
      const id = String(row.id || newId());
      let roleIds = roleIdsOf(row).map((r) => String(r).slice(0, 80));
      if (id === "admin") roleIds = ["owner"];
      else {
        roleIds = roleIds.filter((r) => r !== "owner");
        if (!roleIds.length) roleIds = ["lecteur"];
      }
      return {
        id,
        username: String(row.username || "")
          .trim()
          .toLowerCase()
          .slice(0, 40),
        passHash: String(row.passHash || ""),
        role: roleIds[0],
        roleIds,
        groupIds: asIdList(row.groupIds),
        grants: asGrants(row.grants),
        disabled: id === "admin" ? false : Boolean(row.disabled),
        source: asAuthSource(row.source),
        externalId: String(row.externalId || "").slice(0, 400),
      };
    })
    .filter((u) => u.username);
}
export function authExternalId(source: AuthSource, ...parts: string[]): string {
  return [source, ...parts.map((p) => String(p || "").trim())]
    .filter(Boolean)
    .join(":")
    .slice(0, 400);
}
export function findUserForAuth<
  T extends { username?: string; source?: string; externalId?: string },
>(
  users: T[] | null | undefined,
  username: string,
  source: AuthSource,
  externalId?: string,
): T | undefined {
  const name = String(username || "")
    .trim()
    .toLowerCase();
  if (!name) return undefined;
  const list = users || [];
  if (externalId) {
    const byExt = list.find(
      (u) => asAuthSource(u.source) === source && u.externalId === externalId,
    );
    if (byExt) return byExt;
  }
  return list.find(
    (u) => String(u.username || "").toLowerCase() === name && asAuthSource(u.source) === source,
  );
}
const GROUP_CAP = 160;
export function asGroups(raw: unknown): Group[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, GROUP_CAP)
    .map((g: any) => {
      const source = g?.source === "ad" || g?.source === "oidc" ? g.source : "local";
      let roleIds = roleIdsOf(g)
        .map((r) => String(r).slice(0, 80))
        .filter((r) => r !== "owner");
      if (!roleIds.length && source === "local") roleIds = ["lecteur"];
      return {
        id: String(g?.id || newId()),
        name: String(g?.name || "")
          .trim()
          .slice(0, 60),
        members: asIdList(g?.members),
        role: roleIds[0] || "",
        roleIds,
        grants: asGrants(g?.grants),
        source,
        externalId: String(g?.externalId || "").slice(0, 400),
      };
    })
    .filter((g) => g.name);
}
export function ensureGroups(doc: Doc) {
  if (!Array.isArray(doc.groups)) doc.groups = [];
  doc.groups = asGroups(doc.groups);
  return doc.groups;
}
export function asRoles(raw: unknown): Role[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 40)
    .map((r: any) => {
      const id = String(r?.id || newId()).slice(0, 80);
      const system = isSystemRole(id);
      let grants: GrantInput[] = grantsFromLegacyRole(r);
      if (id === "owner") grants = [{ res: "portal", id: "*", allow: ["*"] }];
      return {
        id,
        name:
          String(r?.name || id)
            .trim()
            .slice(0, 40) || id,
        description: String(r?.description || "")
          .trim()
          .slice(0, 200),
        system,
        grants,
      };
    })
    .filter((r) => r.name);
}
export function ensureRoles(doc: Doc) {
  const byId = new Map<string, Role>();
  for (const r of asRoles(doc.roles)) byId.set(r.id, r);
  for (const s of defaultRoles()) {
    const cur = byId.get(s.id);
    if (!cur) byId.set(s.id, { ...s });
    else {
      cur.system = true;
      cur.name = s.name;
      cur.description = s.description;
      cur.grants = structuredClone(s.grants);
    }
  }
  doc.roles = [...byId.values()].slice(0, 40);
  return doc.roles;
}
export function normalizeSpaceAccess(space: any) {
  const editors = asIdList(space.editors);
  const viewers = asIdList(space.viewers);
  for (const id of editors) if (!viewers.includes(id)) viewers.push(id);
  return {
    restricted: Boolean(space.restricted),
    viewers,
    editors,
    hideLabel: Boolean(space.hideLabel),
  };
}
export function normalizeCatAccess(cat: any) {
  const editors = asIdList(cat.editors);
  const viewers = asIdList(cat.viewers);
  for (const id of editors) if (!viewers.includes(id)) viewers.push(id);
  return {
    restricted: Boolean(cat.restricted),
    viewers,
    editors,
  };
}
export function spaceCanSee(
  space: Space | DocSpace | null | undefined,
  user: User | null | undefined,
  doc: AclDoc,
) {
  if (!space) return false;
  return can(user, "view", { res: "space", id: space.id }, doc);
}
export function spaceCanEdit(
  space: Space | DocSpace | null | undefined,
  user: User | null | undefined,
  doc: AclDoc,
) {
  if (!space || !user) return false;
  return can(user, "edit", { res: "space", id: space.id }, doc);
}
export function spaceCanMove(
  space: Space | DocSpace | null | undefined,
  user: User | null | undefined,
  doc: AclDoc,
) {
  if (!space || !user) return false;
  return can(user, "move", { res: "space", id: space.id }, doc);
}
export function catCanSee(
  cat: PortalCategory | null | undefined,
  user: User | null | undefined,
  doc: AclDoc,
) {
  if (!cat) return false;
  return can(user, "view", { res: "cat", id: cat.id }, doc);
}
export function hydrateUser(
  user: StoredUser | null | undefined,
  doc: Doc,
): HydratedUser | null | undefined {
  if (!user) return user;
  if ((user as HydratedUser)._ids) return user as HydratedUser;
  const groups = groupsOf(user, doc);
  const ids = [user.id, ...groups.map((g) => g.id)];
  const owner = isOwnerUser(user);
  const portal = { res: "portal" as const };
  const canCreateSpaces = owner || can(user, "spaces.create", portal, doc);
  const canAudit = owner || can(user, "audit", portal, doc);
  const canRestore = owner || can(user, "restore", portal, doc);
  const canCuration = owner || can(user, "curation", portal, doc);
  const canPurge = owner || can(user, "purge", portal, doc);
  const canManageSettings = owner || can(user, "settings", portal, doc);
  const canManageUsers = owner || can(user, "users.manage", portal, doc);
  const canManageGroups = owner || can(user, "groups.manage", portal, doc);
  const canManageRoles = owner || can(user, "roles.manage", portal, doc);
  const anyEdit =
    owner ||
    canCreateSpaces ||
    (doc.spaces || []).some((t) => can(user, "edit", { res: "space", id: t.id }, doc));
  const anyMove =
    owner || (doc.spaces || []).some((t) => can(user, "move", { res: "space", id: t.id }, doc));
  // Effective roles: the account's own roles plus those inherited from groups,
  // ordered by privilege so the top entry is the highest effective role.
  const ROLE_RANK: Record<string, number> = { owner: 4, admin: 3, editeur: 2, lecteur: 0 };
  const roleIds = Array.from(
    new Set([...roleIdsOf(user), ...groups.flatMap((g) => roleIdsOf(g))]),
  ).sort((a, b) => (ROLE_RANK[b] ?? 1) - (ROLE_RANK[a] ?? 1));
  return {
    ...user,
    role: owner ? "owner" : roleIds[0] || "lecteur",
    roleId: roleIds[0] || user.role,
    roleIds,
    canCreateSpaces,
    canAudit,
    canRestore,
    canCuration,
    canPurge,
    canManageSettings,
    canManageUsers,
    canManageGroups,
    canManageRoles,
    groupIds: groups.map((g) => g.id),
    _ids: ids,
    _canEdit: anyEdit,
    _canMove: anyMove,
  };
}
export function canSetNodeAcl(user: HydratedUser | null | undefined): boolean {
  if (!user) return false;
  return isOwnerUser(user) || Boolean(user.canManageUsers || user.canManageRoles);
}
export function historyVisible(doc: Doc, user: HydratedUser | null | undefined, ev: HistoryEvent) {
  if (!user) return false;
  if (isOwnerUser(user) || user.canAudit) return true;
  if (!user.canRestore) return false;
  const type = String(ev?.type || "");
  if (type === "login") return ev.actor === user.username;
  if (/^(user|group|role|settings|theme|oidc|ldap|auth|portal)\./.test(type)) return false;
  const spaceMeta = ev?.snapshot?.space;
  if (!spaceMeta) return false;
  const live = doc.spaces.find((t) => t.id === spaceMeta.id);
  return spaceCanEdit(live || spaceMeta, user, doc);
}
export function syncGroupMembers(doc: Doc, groupId: string, memberIds: unknown) {
  ensureGroups(doc);
  const g = doc.groups.find((row) => row.id === groupId);
  if (!g) return;
  const next = asIdList(memberIds).filter((id) =>
    doc.users.some((u) => u.id === id && u.id !== "admin"),
  );
  g.members = next;
  for (const u of doc.users) {
    u.groupIds = asIdList(u.groupIds);
    const has = next.includes(u.id);
    if (has && !u.groupIds.includes(groupId)) u.groupIds.push(groupId);
    if (!has) u.groupIds = u.groupIds.filter((id) => id !== groupId);
  }
}
export function upsertAdGroups(
  doc: Doc,
  _dir: unknown,
  listed: { key?: string; name?: string; dn?: string; id?: string }[] | null | undefined,
) {
  ensureGroups(doc);
  for (const row of listed || []) {
    if (!row?.key || !row?.name) continue;
    const existing = doc.groups.find((g) => g.source === "ad" && g.externalId === row.key);
    if (existing) {
      existing.name = String(row.name).trim().slice(0, 60) || existing.name;
      continue;
    }
    if (doc.groups.length >= GROUP_CAP) break;
    doc.groups.push({
      id: newId(),
      name: String(row.name).trim().slice(0, 60),
      members: [],
      role: "",
      roleIds: [],
      grants: [],
      source: "ad",
      externalId: String(row.key).slice(0, 400),
    });
  }
}
export function inLinkedAdGroups(doc: Doc, dirId: string, memberOf: string[] | null | undefined) {
  if (!memberOf?.length) return false;
  ensureGroups(doc);
  const prefix = `${dirId}:`;
  const names = new Set(memberOf.map((dn) => rdnValue(String(dn)).toLowerCase()));
  return doc.groups.some((g) => {
    if (g.source !== "ad" || !String(g.externalId || "").startsWith(prefix)) return false;
    return names.has(rdnValue(String(g.externalId).slice(prefix.length)).toLowerCase());
  });
}
export function inLinkedOidcGroups(doc: Doc, issuer: string, names: string[] | null | undefined) {
  if (!names?.length) return false;
  ensureGroups(doc);
  const keys = new Set(names.map((name) => `oidc:${issuer.slice(0, 60)}:${name.slice(0, 200)}`));
  return doc.groups.some((g) => g.source === "oidc" && g.externalId && keys.has(g.externalId));
}
export function applyAdMembership(
  doc: Doc,
  user: StoredUser | null | undefined,
  dirId: string,
  memberOf: string[] | null,
) {
  if (!user || user.id === "admin") return;
  // Directory accounts carry no personal role: rights come from the mapping.
  if (user.source === "ad") {
    user.roleIds = [];
    user.role = "";
  }
  if (memberOf == null) return;
  ensureGroups(doc);
  const prefix = `${dirId}:`;
  // Compare group CNs, not full DNs: some directories (Glauth) report memberOf
  // DNs that differ from the group entry DN (ou=groups vs ou=users).
  const names = new Set(
    (Array.isArray(memberOf) ? memberOf : []).map((dn) => rdnValue(String(dn)).toLowerCase()),
  );
  let groupIds = asIdList(user.groupIds);
  for (const g of doc.groups) {
    if (g.source !== "ad" || !String(g.externalId || "").startsWith(prefix)) continue;
    // Mapping: membership is resolved from the directory at sign-in. The stored
    // members list mirrors it for display, but rights flow through groupIds.
    const isMember = names.has(rdnValue(String(g.externalId).slice(prefix.length)).toLowerCase());
    const members = asIdList(g.members).filter((id) => id !== user.id);
    if (isMember) members.push(user.id);
    g.members = members;
    groupIds = isMember
      ? Array.from(new Set([...groupIds, g.id]))
      : groupIds.filter((id) => id !== g.id);
  }
  user.groupIds = groupIds;
}
function upsertOidcGroups(doc: Doc, issuer: string, names: string[]) {
  ensureGroups(doc);
  for (const name of names) {
    const key = `oidc:${issuer.slice(0, 60)}:${name.slice(0, 200)}`;
    const existing = doc.groups.find((g) => g.source === "oidc" && g.externalId === key);
    if (existing) continue;
    if (doc.groups.length >= GROUP_CAP) break;
    doc.groups.push({
      id: newId(),
      name: name.slice(0, 60),
      members: [],
      role: "",
      roleIds: [],
      grants: [],
      source: "oidc",
      externalId: key,
    });
  }
}
export function applyOidcGroups(
  doc: Doc,
  user: StoredUser | null | undefined,
  issuer: string,
  claimed: string[],
) {
  if (!user || user.id === "admin") return;
  // Filtering here covers creation and membership in one place: a group the
  // filter now excludes also drops the user on this login, rather than keeping
  // a stale membership no admin can see the source of.
  const names = filterGroupNames(claimed, doc.settings?.oidcGroupFilter);
  upsertOidcGroups(doc, issuer, names);
  ensureGroups(doc);
  const keys = new Set(names.map((name) => `oidc:${issuer.slice(0, 60)}:${name.slice(0, 200)}`));
  for (const g of doc.groups) {
    if (g.source !== "oidc" || !g.externalId) continue;
    const members = asIdList(g.members).filter((id) => id !== user.id);
    if (keys.has(g.externalId)) members.push(user.id);
    g.members = members;
  }
  user.groupIds = doc.groups.filter((g) => asIdList(g.members).includes(user.id)).map((g) => g.id);
}
export function syncUserGroups(doc: Doc, userId: string, groupIds: unknown) {
  ensureGroups(doc);
  const user = doc.users.find((u) => u.id === userId);
  if (!user || user.id === "admin" || isOwnerUser(user)) return;
  const next = asIdList(groupIds).filter((id) => doc.groups.some((g) => g.id === id));
  user.groupIds = next;
  for (const g of doc.groups) {
    g.members = asIdList(g.members);
    const has = next.includes(g.id);
    if (has && !g.members.includes(userId)) g.members.push(userId);
    if (!has) g.members = g.members.filter((id) => id !== userId);
  }
}
export function stripUserAccess(doc: Doc, userId: string) {
  for (const space of doc.spaces) {
    space.editors = (space.editors || []).filter((id) => id !== userId);
    space.viewers = (space.viewers || []).filter((id) => id !== userId);
    for (const cat of space.categories || []) {
      cat.editors = (cat.editors || []).filter((id) => id !== userId);
      cat.viewers = (cat.viewers || []).filter((id) => id !== userId);
    }
  }
}
