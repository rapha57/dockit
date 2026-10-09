import type { Directory } from "../ldap-runtime";
import type { AclDoc, Group, Role, User } from "../acl";
import type { HistoryEvent } from "../history";
import { t, withLocale } from "../i18n";

export type { CurationCheck, CurationNotify } from "../curation-runtime";
export type { CurationJobView } from "../curation-runtime";

export type UserRole = "owner" | "admin" | "editeur" | "lecteur";
export type SpacePerm = "view" | "edit";
export type AuthSource = "local" | "ad" | "oidc" | "proxy";
export type ItemKind = "app" | "note" | "embed";
export type CheckMode = "off" | "http" | "icmp";

export type PortalUser = {
  id: string;
  username: string;
  passHash: string;
  role: UserRole;
  canCreateSpaces?: boolean;
};

export type SessionInfo = {
  username?: string;
  role?: string;
  roleId?: string;
  roleIds: string[];
  isOwner: boolean;
  canEdit: boolean;
  canManageUsers: boolean;
  canManageGroups: boolean;
  canManageRoles: boolean;
  canManageSettings: boolean;
  canCreateSpaces: boolean;
  canAudit: boolean;
  canRestore: boolean;
  canCuration: boolean;
  canPurge: boolean;
  canMove: boolean;
  spacePerms: Record<string, SpacePerm>;
  spaceMoves: Record<string, boolean>;
  exp?: number;
  mustChangePassword?: boolean;
};

export type DirectoryUser = {
  id: string;
  username: string;
  role: UserRole;
};

export type PortalCard = {
  id: string;
  categoryId: string;
  kind: ItemKind;
  title: string;
  description: string;
  url?: string;
  icon: string;
  openIn: "_blank" | "_self";
  tags: string[];
  colSpan: 1 | 2 | 3;
  rowSpan: 1 | 2 | 3;
  sortOrder: number;
  check: CheckMode;
  checkHost: string;
  clicks: number;
  linkMenu?: boolean;
  embedBorder?: boolean;
  embedBg?: string;
  links: { title: string; url: string; openIn?: "_blank" | "_self" }[];
};

/** Main link of a card: apps read their first link, embeds their iframe src. */
export function cardUrl(app: { kind?: ItemKind; url?: string; links?: { url: string }[] }): string {
  if ((app.kind || "app") === "embed") return String(app.url || "");
  return String(app.links?.[0]?.url || app.url || "");
}

export type PortalCategory = {
  id: string;
  name: string;
  icon: string;
  sortOrder: number;
  restricted: boolean;
  viewers: string[];
  editors: string[];
  cards: PortalCard[];
};

export type PortalSpace = {
  id: string;
  name: string;
  icon: string;
  sortOrder: number;
  restricted: boolean;
  viewers: string[];
  editors: string[];
  hideLabel: boolean;
};

export type PortalSettings = {
  title: string;
  subtitle: string;
  logo: string;
  healthChecks: boolean;
  usageStats: boolean;
  infoBar: boolean;
  tagColors: Record<string, string>;
  cssLight: string;
  cssDark: string;
  documentTitle: string;
  locale: "en" | "fr";
  dateFormat: "ymd" | "yyyy" | "dmy" | "mdy" | "iso";
  timeFormat: "24h" | "12h";
  numberFormat?: import("../i18n").NumberFormat;
  timezone: string;
  favicon: string;
  favsHideLabel: boolean;
  restoreLastSpace: boolean;
  favNotes: boolean;
  favEmbeds: boolean;
  onlineIcons: boolean;
  navRichIcons: boolean;
  headerGlass: boolean;
  probeBlink: boolean;
  annexFade: boolean;
  catCounts: boolean;
  pruneOrphanTags: boolean;
  tagsAlpha: boolean;
  cardResize: boolean;
  cardIconBg: boolean;
  cardContextMenu: boolean;
  cardDragCollapse: boolean;
  ctxHideUrl: boolean;
  infoStats: boolean;
  infoLegend: boolean;
  probeTlsVerify: boolean;
  curationWebhook?: string;
  curationCron?: string;
  probeCaPem?: string;
  probeAuthOnly: boolean;
  requireLogin: boolean;
  sessionHttpOnly: boolean;
  devAdminNoPassword: boolean;
  proxyAuthEnabled: boolean;
  proxyAuthHeader: string;
  outboundProxyEnabled: boolean;
  outboundProxyHost: string;
  outboundProxyPort: number;
  outboundProxyUsername: string;
  outboundProxyPassword: string;
  oidcEnabled: boolean;
  oidcIssuer: string;
  oidcClientId: string;
  oidcClientSecret: string;
  oidcScope: string;
  oidcGroupFilter: string;
  oidcLabel: string;
  oidcAutoCreate: boolean;
  oidcAutoRedirect: boolean;
  ldapEnabled: boolean;
  ldapHost: string;
  ldapPort: number;
  ldapTls: boolean;
  ldapTlsVerify: boolean;
  ldapBindDn: string;
  ldapBindPassword: string;
  ldapBaseDn: string;
  ldapUserFilter: string;
  ldapDomain: string;
  ldapAutoCreate: boolean;
  ldapDirectories: Directory[];
  loginOrder: string[];
  /** Present on client payloads only (see clientSettings). */
  oidcHasSecret?: boolean;
  /** Present on client payloads only (see clientSettings). */
  oidcSecretFromEnv?: boolean;
  /** Present on client payloads only (see clientSettings). */
  ldapHasBindPassword?: boolean;
  /** Present on client payloads only (see clientSettings). */
  ldapBindFromEnv?: boolean;
  /** Present on client payloads only (see clientSettings). */
  curationCronFromEnv?: boolean;
  /** Present on client payloads only (see clientSettings). */
  curationWebhookFromEnv?: boolean;
};

export type CustomIcon = {
  id: string;
  name: string;
  dataUrl: string;
};

export type ClickStats = {
  all: number;
  today: number;
  week: number;
  month: number;
  year: number;
  spanDays: number;
  fullCatalog?: boolean;
};

export type DocSpace = PortalSpace & { name: string; icon: string; categories: PortalCategory[] };
export type StoredUser = User & { passHash?: string };
export type Doc = Omit<AclDoc, "spaces" | "users" | "groups" | "roles" | "history"> & {
  settings: PortalSettings;
  customIcons: CustomIcon[];
  lastSpaceId?: string;
  clickDays: Record<string, number>;
  users: StoredUser[];
  groups: Group[];
  roles: Role[];
  history: HistoryEvent[];
  spaces: DocSpace[];
  rev: number;
};

export type HydratedUser = StoredUser & {
  roleId?: string;
  roleIds: string[];
  canCreateSpaces: boolean;
  canAudit: boolean;
  canRestore: boolean;
  canCuration: boolean;
  canPurge: boolean;
  canManageSettings: boolean;
  canManageUsers: boolean;
  canManageGroups: boolean;
  canManageRoles: boolean;
  groupIds: string[];
  _ids: string[];
  _canEdit: boolean;
  _canMove: boolean;
};

export function tt(doc: Doc | null | undefined, key: string, vars?: Record<string, unknown>) {
  return withLocale(doc?.settings?.locale, () => t(key, vars));
}

export function asKind(v: unknown): ItemKind {
  return v === "note" || v === "embed" ? v : "app";
}

export function asCheck(v: unknown): CheckMode {
  return v === "http" || v === "icmp" ? v : "off";
}

export function asCheckHost(v: unknown) {
  return String(v ?? "")
    .trim()
    .slice(0, 253);
}

export function asAuthSource(raw: unknown): AuthSource {
  if (raw === "ad" || raw === "oidc" || raw === "proxy") return raw;
  return "local";
}

export function asIdList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = /* @__PURE__ */ new Set<string>();
  for (const value of raw) {
    const id = String(value || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function cardSortKey(
  app: PortalCard | { title?: string; kind?: unknown; description?: string } | null | undefined,
) {
  const title = String(app?.title || "").trim();
  if (title) return title;
  if (asKind(app?.kind) === "note")
    return String(app?.description || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
  return "";
}

export function sortCardsAlpha(
  cards: PortalCard[] | null | undefined,
  locale: unknown,
  dir: unknown,
) {
  const tag = locale === "fr" ? "fr" : "en";
  const signed = dir === "za" ? -1 : 1;
  return [...(cards || [])].sort((a, b) => {
    const ka = cardSortKey(a);
    const kb = cardSortKey(b);
    if (!ka && kb) return 1;
    if (ka && !kb) return -1;
    return (
      signed *
      ka.localeCompare(kb, tag, {
        sensitivity: "base",
        numeric: true,
      })
    );
  });
}

export function cardsAlphaDir(cards: PortalCard[] | null | undefined, locale: unknown) {
  if (!cards || cards.length < 2) return null;
  const ids = cards.map((a) => a.id).join("\n");
  if (
    sortCardsAlpha(cards, locale, "az")
      .map((a) => a.id)
      .join("\n") === ids
  )
    return "az";
  if (
    sortCardsAlpha(cards, locale, "za")
      .map((a) => a.id)
      .join("\n") === ids
  )
    return "za";
  return null;
}
