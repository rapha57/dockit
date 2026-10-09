import { asDocRev } from "../doc-rev";
import { newId } from "../id";
import { toClientAsset } from "../assets-url";
import { normalizeScope } from "../oidc-scope";
import { cleanProxyPort } from "../outbound-proxy";
import {
  envLdapBindPassword,
  envOidcClientSecret,
  isDevRuntime,
  isLocalHttp,
  trustProxy,
} from "../security-runtime";
import { appendHistory, snapshotSpace, snapshotCat } from "../history";
import type { HistoryEvent } from "../history";
import { asTimeZone } from "../i18n";
import { asDirectories, asLoginOrder, directoryReady } from "../ldap-runtime";
import {
  asGrants,
  can,
  isOwnerUser,
  roleIdsOf,
  roleSummary,
  type AclDoc,
  type Group,
  type Role,
  type User,
} from "../acl";
import {
  asAuthSource,
  asIdList,
  tt,
  type ClickStats,
  type Doc,
  type DocSpace,
  type HydratedUser,
  type PortalCard,
  type PortalCategory,
  type StoredUser,
} from "./types";
import {
  catCanSee,
  ensureGroups,
  ensureRoles,
  normalizeCatAccess,
  normalizeItem,
  spaceCanSee,
} from "./model";
import { ensureUsers, isDefaultAdminPassword, requireUser, sessionInfo } from "./session";
import { readDoc } from "./store";
import { FAVS_TAB, prefsFromCookieHeader } from "../ui-prefs";

function publicUser(u: StoredUser, _doc: AclDoc) {
  const roleIds = roleIdsOf(u);
  return {
    kind: "user" as const,
    id: u.id,
    username: u.username,
    name: u.username,
    role: roleIds[0] || u.role,
    roleIds,
    grants: asGrants(u.grants),
    disabled: Boolean(u.disabled),
    source: asAuthSource(u.source),
    externalId: String(u.externalId || ""),
    groupIds: asIdList(u.groupIds),
  };
}
function publicGroup(g: Group, _doc: AclDoc) {
  const roleIds = roleIdsOf(g);
  return {
    kind: "group" as const,
    id: g.id,
    name: g.name,
    role: roleIds[0] || g.role || "lecteur",
    roleIds,
    grants: asGrants(g.grants),
    source: g.source === "ad" || g.source === "oidc" ? g.source : "local",
    externalId: String(g.externalId || ""),
    members: asIdList(g.members),
  };
}
function directoryOf(doc: Doc) {
  return ensureUsers(doc)
    .filter((u) => u.id !== "admin")
    .map((u) => ({
      id: u.id,
      username: u.username,
      role: roleIdsOf(u)[0] || u.role,
    }));
}
function publicRole(r: Role, doc: Doc) {
  ensureUsers(doc);
  ensureGroups(doc);
  const counts = roleSummary(r, doc);
  return {
    id: r.id,
    name: r.name,
    description: r.description || "",
    system: Boolean(r.system),
    grants: asGrants(r.grants),
    userCount: counts.userCount,
    groupCount: counts.groupCount,
    grantCount: counts.grantCount,
  };
}
export function directoryPayload(doc: Doc, actor: User) {
  ensureUsers(doc);
  ensureGroups(doc);
  ensureRoles(doc);
  const ownerActor = isOwnerUser(actor);
  return {
    users: doc.users
      .filter((u) => (ownerActor ? true : u.id === actor.id || u.id !== "admin"))
      .map((u) => publicUser(u, doc)),
    groups: doc.groups.map((g) => publicGroup(g, doc)),
    roles: doc.roles.map((r) => publicRole(r, doc)),
    spaces: manageSpaces(doc),
    directory: directoryOf(doc),
    rev: asDocRev(doc.rev),
  };
}
export async function emit(
  doc: Doc,
  user: StoredUser | HydratedUser | null | undefined,
  spaceId?: string,
) {
  const out = view(doc, spaceId, user as HydratedUser | null);
  if (out.session && user?.id === "admin")
    out.session.mustChangePassword = await isDefaultAdminPassword(doc);
  return out;
}
function dayKey(d = /* @__PURE__ */ new Date(), tz?: unknown) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: asTimeZone(tz) || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
function seesFullCatalog(doc: Doc, user: User | null | undefined) {
  if (user && isOwnerUser(user)) return true;
  for (const space of doc.spaces || []) {
    if (!can(user, "view", { res: "space", id: space.id }, doc)) return false;
    for (const cat of space.categories || []) {
      if (!can(user, "view", { res: "cat", id: cat.id }, doc)) return false;
      for (const app of cat.cards || []) {
        if (!can(user, "view", { res: "card", id: app.id }, doc)) return false;
      }
    }
  }
  return true;
}
export function clickStatsFor(doc: Doc, user: User | null | undefined): ClickStats {
  const stats = computeClickStats(doc);
  if (seesFullCatalog(doc, user)) return { ...stats, fullCatalog: true };
  return {
    all: 0,
    today: 0,
    week: 0,
    month: 0,
    year: 0,
    spanDays: 0,
    fullCatalog: false,
  };
}
function computeClickStats(doc: Doc) {
  let all = 0;
  for (const space of doc.spaces)
    for (const cat of space.categories)
      for (const app of cat.cards) if (app.kind === "app") all += app.clicks || 0;
  const days = doc.clickDays ?? {};
  const now = Date.now();
  const tz = doc.settings?.timezone;
  const today = dayKey(new Date(now), tz);
  const weekFrom = dayKey(/* @__PURE__ */ new Date(now - 5184e5), tz);
  const monthFrom = dayKey(/* @__PURE__ */ new Date(now - 25056e5), tz);
  const yearFrom = dayKey(/* @__PURE__ */ new Date(now - 314496e5), tz);
  let todayN = 0;
  let week = 0;
  let month = 0;
  let year = 0;
  for (const [key, raw] of Object.entries(days)) {
    if (key > today) continue;
    const n = raw || 0;
    if (key === today) todayN += n;
    if (key >= weekFrom) week += n;
    if (key >= monthFrom) month += n;
    if (key >= yearFrom) year += n;
  }
  const oldest = Object.keys(days)
    .filter((k) => k <= today && (days[k] || 0) > 0)
    .sort()[0];
  const spanDays = oldest
    ? Math.max(
        0,
        Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${oldest}T00:00:00Z`)) / 864e5),
      )
    : 0;
  return {
    all,
    today: todayN,
    week,
    month,
    year,
    spanDays,
  };
}
export function bumpClickDay(doc: Doc) {
  const key = dayKey(new Date(), doc.settings?.timezone);
  const days = { ...(doc.clickDays ?? {}) };
  days[key] = (days[key] || 0) + 1;
  const cutoff = dayKey(/* @__PURE__ */ new Date(Date.now() - 3456e7), doc.settings?.timezone);
  for (const k of Object.keys(days)) if (k < cutoff) delete days[k];
  doc.clickDays = days;
}
export async function loadPortal(
  spaceId: string | undefined,
  token: string | null | undefined,
  request?: { url?: string; headers?: { get?: (k: string) => string | null } } | null,
) {
  const doc = await readDoc();
  let user: HydratedUser | null = null;
  if (token)
    try {
      user = requireUser(doc, token);
    } catch {
      user = null;
    }
  const prefs = prefsFromCookieHeader(request?.headers?.get?.("cookie") || "");
  const restore = Boolean(doc.settings.restoreLastSpace);
  const last = prefs?.lastSpaceId || "";
  const resolved = spaceId || (restore && last && last !== FAVS_TAB ? last : undefined);
  const out = view(doc, resolved, user);
  if (out.session && user?.id === "admin")
    out.session.mustChangePassword = await isDefaultAdminPassword(doc);
  out.runtime.localHttp = isLocalHttp(request);
  const hasCards = (out.catalog ?? []).some((space) =>
    (space.categories || []).some((cat) => (cat.cards || []).length > 0),
  );
  out.runtime.bootFavs = Boolean(
    out.spaces.length && (restore ? last === FAVS_TAB : Boolean(prefs?.openFavs && hasCards)),
  );
  out.runtime.favIds = prefs?.favIds ?? [];
  out.runtime.lastSpaceId = last;
  out.runtime.openFavs = Boolean(prefs?.openFavs);
  return out;
}
function publicSpaces(doc: Doc, user: HydratedUser | null) {
  return [...doc.spaces]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter((t) => spaceCanSee(t, user, doc))
    .map((t) => ({
      id: t.id,
      name: t.name,
      icon: t.icon,
      sortOrder: t.sortOrder,
      restricted: Boolean(t.restricted),
      viewers: [] as string[],
      editors: [] as string[],
      hideLabel: Boolean(t.hideLabel),
    }));
}
function manageSpaces(doc: Doc) {
  return [...doc.spaces]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((t) => ({
      id: t.id,
      name: t.name,
      icon: t.icon,
      categories: (t.categories || []).map((c) => ({
        id: c.id,
        name: c.name,
        restricted: Boolean(c.restricted),
        cards: (c.cards || []).map((a) => ({
          id: a.id,
          title: a.title || "",
          kind: a.kind || "app",
        })),
      })),
      sortOrder: t.sortOrder,
      restricted: Boolean(t.restricted),
      hideLabel: Boolean(t.hideLabel),
    }));
}
function clientSettings(doc: Doc, user: HydratedUser | null | undefined) {
  const s = doc.settings;
  const cronEnv = String(process.env.PORTAL_CURATION_CRON || "").trim();
  const hookEnv = String(process.env.PORTAL_CURATION_WEBHOOK || "").trim();
  const dirs = asDirectories(s);
  const realms = dirs.filter(directoryReady).map((d) => ({ id: d.id, label: d.domain }));
  const out: any = {
    ...s,
    logo: toClientAsset(s.logo),
    favicon: toClientAsset(s.favicon),
    oidcEnabled: Boolean(s.oidcEnabled) && Boolean(s.oidcIssuer) && Boolean(s.oidcClientId),
    oidcLabel: String(s.oidcLabel || "SSO").slice(0, 40) || "SSO",
    oidcAutoRedirect: Boolean(s.oidcAutoRedirect),
    requireLogin: Boolean(s.requireLogin),
    proxyAuthEnabled: Boolean(s.proxyAuthEnabled),
    outboundProxyEnabled: Boolean(s.outboundProxyEnabled),
    outboundProxyHost: String(s.outboundProxyHost || ""),
    outboundProxyPort: cleanProxyPort(s.outboundProxyPort),
    outboundProxyUsername: String(s.outboundProxyUsername || ""),
    outboundProxyHasPassword: Boolean(s.outboundProxyPassword),
    oidcHasSecret: Boolean(envOidcClientSecret() || s.oidcClientSecret),
    oidcSecretFromEnv: Boolean(envOidcClientSecret()),
    ldapEnabled: realms.length > 0,
    ldapDomain: realms[0]?.label || "",
    ldapHasBindPassword: dirs.some((d) => Boolean(envLdapBindPassword(d.id) || d.bindPassword)),
    ldapBindFromEnv:
      dirs.some((d) => Boolean(envLdapBindPassword(d.id))) || Boolean(envLdapBindPassword()),
    ldapDirectories: dirs.map((d) => {
      const fromEnv = Boolean(envLdapBindPassword(d.id));
      const row: any = {
        ...d,
        hasBindPassword: fromEnv || Boolean(d.bindPassword),
        bindFromEnv: fromEnv,
      };
      delete row.bindPassword;
      return row;
    }),
    ldapRealms: realms,
    loginOrder: asLoginOrder(s.loginOrder, dirs),
    devAdminNoPassword: isDevRuntime() && Boolean(s.devAdminNoPassword),
    curationWebhook:
      user && (isOwnerUser(user) || user.canCuration)
        ? hookEnv
          ? ""
          : String(s.curationWebhook || "")
        : "",
    curationCron:
      user && (isOwnerUser(user) || user.canCuration)
        ? cronEnv || String(s.curationCron || "")
        : "",
    curationCronFromEnv:
      Boolean(cronEnv) && Boolean(user && (isOwnerUser(user) || user.canCuration)),
    curationWebhookFromEnv:
      Boolean(hookEnv) && Boolean(user && (isOwnerUser(user) || user.canCuration)),
    probeCaPem:
      user && (isOwnerUser(user) || user.canManageSettings) ? String(s.probeCaPem || "") : "",
  };
  delete out.oidcClientSecret;
  delete out.ldapBindPassword;
  delete out.outboundProxyPassword;
  if (!isOwnerUser(user) && !user?.canManageSettings) {
    delete out.oidcIssuer;
    delete out.oidcClientId;
    delete out.oidcScope;
    delete out.oidcGroupFilter;
    delete out.oidcAutoCreate;
    delete out.proxyAuthHeader;
    delete out.outboundProxyHost;
    delete out.outboundProxyPort;
    delete out.outboundProxyUsername;
    delete out.outboundProxyHasPassword;
    delete out.outboundProxyEnabled;
    delete out.oidcHasSecret;
    delete out.ldapHost;
    delete out.ldapPort;
    delete out.ldapTls;
    delete out.ldapTlsVerify;
    delete out.ldapBindDn;
    delete out.ldapBaseDn;
    delete out.ldapUserFilter;
    delete out.ldapAutoCreate;
    delete out.ldapHasBindPassword;
    delete out.ldapDirectories;
  } else {
    out.oidcIssuer = String(s.oidcIssuer || "");
    out.oidcClientId = String(s.oidcClientId || "");
    out.oidcScope = normalizeScope(s.oidcScope);
    out.oidcGroupFilter = String(s.oidcGroupFilter || "");
    out.oidcAutoCreate = Boolean(s.oidcAutoCreate);
    out.ldapHost = String(s.ldapHost || "");
    out.ldapPort = Number(s.ldapPort) || (s.ldapTls === false ? 389 : 636);
    out.ldapTls = s.ldapTls !== false;
    out.ldapTlsVerify = s.ldapTlsVerify !== false;
    out.ldapBindDn = String(s.ldapBindDn || "");
    out.ldapBaseDn = String(s.ldapBaseDn || "");
    out.ldapUserFilter = String(s.ldapUserFilter || "");
    out.ldapAutoCreate = Boolean(s.ldapAutoCreate);
    out.ldapDirectories = dirs.map((d) => {
      const fromEnv = Boolean(envLdapBindPassword(d.id));
      const row: any = {
        ...d,
        hasBindPassword: fromEnv || Boolean(d.bindPassword),
        bindFromEnv: fromEnv,
      };
      delete row.bindPassword;
      return row;
    });
  }
  return out;
}
export function view(doc: Doc, spaceId: string | undefined, user: HydratedUser | null) {
  const session = user ? sessionInfo(user, doc) : null;
  if (doc.settings.requireLogin && !user) {
    return {
      settings: clientSettings(doc, user),
      customIcons: [],
      spaces: [],
      activeSpaceId: "",
      categories: [],
      catalog: [],
      clickStats: {
        all: 0,
        today: 0,
        week: 0,
        month: 0,
        year: 0,
        spanDays: 0,
        fullCatalog: true,
      },
      session: null,
      directory: [],
      runtime: {
        isDev: isDevRuntime(),
        publicOrigin: String(process.env.PORTAL_PUBLIC_ORIGIN || "").trim(),
        trustProxy: trustProxy(),
        localHttp: false,
        bootFavs: false,
        favIds: [] as string[],
        lastSpaceId: "",
        openFavs: false,
      },
      rev: asDocRev(doc.rev),
    };
  }
  const spaces = publicSpaces(doc, user);
  const activeSpaceId =
    (spaceId && spaces.some((s) => s.id === spaceId) && spaceId) || spaces[0]?.id || "";
  const stored = doc.spaces.find((t) => t.id === activeSpaceId);
  const sortCats = (cats: PortalCategory[]) =>
    [...cats]
      .filter((c) => catCanSee(c, user, doc))
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((c) => ({
        ...c,
        cards: [...c.cards]
          .filter((a) => can(user, "view", { res: "card", id: a.id }, doc))
          .sort((a, b) => a.sortOrder - b.sortOrder),
      }));
  const stripAcl = (cats: PortalCategory[]) =>
    sortCats(cats).map((c) => ({ ...c, viewers: [] as string[], editors: [] as string[] }));
  const visibleIds = new Set(spaces.map((s) => s.id));
  const catalog = [...doc.spaces]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter((t) => visibleIds.has(t.id))
    .map((t) => ({
      id: t.id,
      name: t.name,
      icon: t.icon,
      sortOrder: t.sortOrder,
      restricted: Boolean(t.restricted),
      viewers: [] as string[],
      editors: [] as string[],
      hideLabel: Boolean(t.hideLabel),
      categories: stripAcl(t.categories ?? []),
    }));
  return {
    settings: clientSettings(doc, user),
    customIcons: (doc.customIcons || []).map((ic) => ({
      ...ic,
      dataUrl: toClientAsset(ic.dataUrl),
    })),
    spaces: spaces,
    activeSpaceId,
    categories: sortCats(stored?.categories ?? []),
    catalog,
    clickStats: clickStatsFor(doc, user),
    session,
    directory: session?.canManageUsers ? directoryOf(doc) : [],
    runtime: {
      isDev: isDevRuntime(),
      publicOrigin: String(process.env.PORTAL_PUBLIC_ORIGIN || "").trim(),
      trustProxy: trustProxy(),
      localHttp: false,
      bootFavs: false,
      favIds: [] as string[],
      lastSpaceId: "",
      openFavs: false,
    },
    rev: asDocRev(doc.rev),
  };
}
export function spaceOfCategory(doc: Doc, categoryId: string): DocSpace {
  const space = doc.spaces.find((t) => t.categories!.some((c) => c.id === categoryId));
  if (!space) throw new Error("errors.categoryNotFound");
  return space;
}
export function categoryOf(doc: Doc, categoryId: string): { space: DocSpace; cat: PortalCategory } {
  for (const space of doc.spaces) {
    const cat = space.categories!.find((c) => c.id === categoryId);
    if (cat)
      return {
        space,
        cat,
      };
  }
  throw new Error("errors.categoryNotFound");
}
export function cardOf(
  doc: Doc,
  appId: string,
): { space: DocSpace; cat: PortalCategory; app: PortalCard } {
  for (const space of doc.spaces)
    for (const cat of space.categories!) {
      const app = cat.cards.find((a) => a.id === appId);
      if (app)
        return {
          space,
          cat,
          app,
        };
    }
  throw new Error("errors.appNotFound");
}
function liveCardId(doc: Doc, id: string) {
  for (const space of doc.spaces)
    for (const cat of space.categories!) if (cat.cards.some((a) => a.id === id)) return true;
  return false;
}
type MetaShape = {
  id?: string;
  name?: string;
  icon?: string;
  restricted?: boolean;
  viewers?: string[];
  editors?: string[];
  hideLabel?: boolean;
  sortOrder?: number;
  cards?: any[];
  categories?: any[];
  [key: string]: any;
};
function ensureRestoredSpace(doc: Doc, meta: MetaShape | null | undefined): DocSpace {
  if (!meta) throw new Error("errors.historySpaceMissing");
  const byId = doc.spaces.find((t) => t.id === meta.id);
  if (byId) return byId;
  const byName = doc.spaces.find(
    (t) => t.name.toLowerCase() === String(meta.name || "").toLowerCase(),
  );
  if (byName) return byName;
  const space: DocSpace = {
    id: meta.id && !doc.spaces.some((t) => t.id === meta.id) ? meta.id : newId(),
    name: meta.name || "Space",
    icon: meta.icon || "Layers",
    sortOrder: Math.max(0, ...doc.spaces.map((t) => t.sortOrder)) + 1,
    restricted: Boolean(meta.restricted),
    viewers: Array.isArray(meta.viewers) ? [...meta.viewers] : [],
    editors: Array.isArray(meta.editors) ? [...meta.editors] : [],
    hideLabel: Boolean(meta.hideLabel),
    categories: [],
  };
  doc.spaces.push(space);
  return space;
}
function ensureRestoredCat(space: DocSpace, meta: MetaShape | null | undefined): PortalCategory {
  if (!meta) throw new Error("errors.historyCategoryMissing");
  const cats = space.categories ?? (space.categories = []);
  const byId = cats.find((c) => c.id === meta.id);
  if (byId) return byId;
  const byName = cats.find((c) => c.name.toLowerCase() === String(meta.name || "").toLowerCase());
  if (byName) return byName;
  const cat: PortalCategory = {
    id: meta.id && !cats.some((c) => c.id === meta.id) ? meta.id : newId(),
    name: meta.name || "Category",
    icon: meta.icon || "AppWindow",
    sortOrder: Math.max(0, ...cats.map((c) => c.sortOrder)) + 1,
    ...normalizeCatAccess(meta),
    cards: [],
  };
  cats.push(cat);
  return cat;
}
function putRestoredCard(
  doc: Doc,
  spaceMeta: MetaShape | null | undefined,
  catMeta: MetaShape | null | undefined,
  app: any,
) {
  const space = ensureRestoredSpace(doc, spaceMeta);
  const cat = ensureRestoredCat(space, catMeta);
  const id = app.id && !liveCardId(doc, app.id) ? app.id : newId();
  const sortOrder = Math.max(0, ...cat.cards.map((a) => a.sortOrder)) + 1;
  cat.cards.push(
    normalizeItem(
      {
        ...app,
        id,
      },
      cat.id,
      sortOrder,
    ),
  );
  return {
    space,
    cat,
    id,
  };
}
function markRestored(ev: HistoryEvent, scope: "space" | "category" | "card", id?: string) {
  if (!ev.restored)
    ev.restored = {
      space: false,
      categories: [],
      cards: [],
    };
  if (scope === "space") ev.restored.space = true;
  else if (scope === "category") {
    if (!ev.restored.categories.includes(id || "")) ev.restored.categories.push(id || "");
  } else if (!ev.restored.cards.includes(id || "")) ev.restored.cards.push(id || "");
}
function snapshotCardFromEvent(
  ev: HistoryEvent,
  targetId: string,
): { card: any; category: any; space: any } | null {
  const snap = ev.snapshot || {};
  const space = snap.space;
  if (snap.card && snap.card.id === targetId)
    return {
      card: snap.card,
      category: snap.category,
      space,
    };
  for (const card of snap.cards || [])
    if (card.id === targetId)
      return {
        card,
        category: snap.category,
        space,
      };
  for (const cat of snap.categories || [])
    for (const card of cat.cards || [])
      if (card.id === targetId)
        return {
          card,
          category: snapshotCat(cat),
          space,
        };
  return null;
}
export function restoreHistoryItem(
  doc: Doc,
  user: HydratedUser,
  eventId: string,
  scope: "space" | "category" | "card",
  targetId: string,
) {
  const ev = (doc.history || []).find((row) => row.id === eventId);
  if (!ev || ev.purged || !ev.snapshot) throw new Error("errors.trashMissing");
  const snap = ev.snapshot;
  if (scope === "card") {
    const found = snapshotCardFromEvent(ev, targetId);
    if (!found) throw new Error("errors.historyCardMissing");
    putRestoredCard(doc, found.space, found.category, found.card);
    markRestored(ev, "card", targetId);
    appendHistory(doc, user, {
      type: "card.restore",
      label: found.card.title || tt(doc, "empty.untitled"),
      snapshot: {
        space: found.space,
        category: found.category,
      },
    });
    return found.space.id;
  }
  if (scope === "category") {
    let catMeta = snap.category && snap.category.id === targetId ? snap.category : null;
    let cards = snap.cards || [];
    const spaceMeta = snap.space;
    if (!catMeta) {
      const cat = (snap.categories || []).find((c: any) => c.id === targetId);
      if (!cat) throw new Error("errors.historyCategoryMissing");
      catMeta = snapshotCat(cat);
      cards = cat.cards || [];
    }
    const space = ensureRestoredSpace(doc, spaceMeta);
    const cat = ensureRestoredCat(space, catMeta);
    for (const card of cards) {
      if (liveCardId(doc, card.id)) continue;
      putRestoredCard(doc, snapshotSpace(space), snapshotCat(cat), card);
      markRestored(ev, "card", card.id);
    }
    markRestored(ev, "category", targetId);
    appendHistory(doc, user, {
      type: "category.restore",
      label: catMeta.name,
      snapshot: { space: snapshotSpace(space), category: catMeta },
    });
    return space.id;
  }
  if (scope === "space") {
    if (!snap.space) throw new Error("errors.historySpaceMissing");
    const spaceMeta = snap.space;
    const space = ensureRestoredSpace(doc, spaceMeta);
    for (const cat of snap.categories || []) {
      const created = ensureRestoredCat(space, snapshotCat(cat));
      for (const card of cat.cards || []) {
        if (liveCardId(doc, card.id)) continue;
        putRestoredCard(doc, snapshotSpace(space), snapshotCat(created), card);
        markRestored(ev, "card", card.id);
      }
      markRestored(ev, "category", cat.id);
    }
    markRestored(ev, "space", spaceMeta.id);
    appendHistory(doc, user, {
      type: "space.restore",
      label: spaceMeta.name,
      snapshot: { space: snapshotSpace(space) },
    });
    return space.id;
  }
  throw new Error("errors.restoreFail");
}
