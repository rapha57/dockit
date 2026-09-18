import type { getCuration, getPortal } from "@/lib/portal";
import type { CheckMode, ItemKind, PortalSettings } from "@/lib/portal";
import { asDateFormat, asLocale, asNumberFormat, asTimeFormat, asTimeZone } from "@/lib/i18n";

export type PortalData = Awaited<ReturnType<typeof getPortal>>;
export type MenuSpace = PortalData["spaces"][number];
export type CatalogSpace = PortalData["catalog"][number];
export type DirectoryEntry = PortalData["directory"][number];
export type CurationViewData = Awaited<ReturnType<typeof getCuration>>;

export type AccessPayload = {
  restricted?: boolean;
  viewers?: string[];
  editors?: string[];
  hideLabel?: boolean;
};

export type CardFormPayload = {
  categoryId: string;
  kind: ItemKind;
  title: string;
  description: string;
  url: string;
  icon: string;
  tags: string[];
  colSpan: 1 | 2 | 3;
  rowSpan: 1 | 2 | 3;
  check?: CheckMode;
  checkHost?: string;
  links?: { title: string; url: string; openIn?: "_blank" | "_self" }[];
  linkMenu?: boolean;
  embedBorder?: boolean;
  embedBg?: string;
  tagColors?: Record<string, string>;
};

export type TagsPayload = {
  create?: string[];
  rename?: { from: string; to: string }[];
  remove?: string[];
  colors?: Record<string, string>;
};

export type SettingsPayload = {
  title: string;
  subtitle: string;
  logo: string;
  healthChecks: boolean;
  usageStats: boolean;
  infoBar: boolean;
  favNotes: boolean;
  favEmbeds: boolean;
  onlineIcons: boolean;
  navRichIcons: boolean;
  headerGlass: boolean;
  locale: "en" | "fr";
  dateFormat: "ymd" | "yyyy" | "dmy" | "mdy" | "iso";
  timeFormat: "24h" | "12h";
  timezone: string;
  numberFormat: "auto" | "space-comma" | "comma-dot" | "dot-comma" | "apostrophe-comma";
  proxyAuthEnabled?: boolean;
  proxyAuthHeader?: string;
  outboundProxyEnabled?: boolean;
  outboundProxyHost?: string;
  outboundProxyPort?: number;
  outboundProxyUsername?: string;
  outboundProxyPassword?: string;
  outboundProxyHasPassword?: boolean;
  probeBlink: boolean;
  annexFade: boolean;
  catCounts: boolean;
  pruneOrphanTags: boolean;
  tagsAlpha: boolean;
  cardResize: boolean;
  cardIconBg?: boolean;
  cardContextMenu: boolean;
  cardDragCollapse: boolean;
  ctxHideUrl: boolean;
  infoStats: boolean;
  infoLegend: boolean;
  probeTlsVerify: boolean;
  probeAuthOnly: boolean;
  requireLogin: boolean;
  sessionHttpOnly: boolean;
  devAdminNoPassword: boolean;
  documentTitle: string;
  favicon: string;
};

export type OidcPayload = {
  oidcEnabled: boolean;
  oidcIssuer: string;
  oidcClientId: string;
  oidcClientSecret?: string;
  oidcScope?: string;
  oidcLabel?: string;
  oidcAutoCreate?: boolean;
  oidcAutoRedirect?: boolean;
};

export type LdapDirectoryPayload = {
  id: string;
  enabled: boolean;
  host: string;
  port?: number;
  tls?: boolean;
  tlsVerify?: boolean;
  bindDn?: string;
  bindPassword?: string;
  baseDn?: string;
  userFilter?: string;
  domain?: string;
  autoCreate?: boolean;
};

export type LdapPayload = { ldapDirectories: LdapDirectoryPayload[] };

export function settingsBase(initial: PortalSettings): SettingsPayload {
  return {
    title: initial.title,
    subtitle: initial.subtitle || "",
    logo: initial.logo || "",
    healthChecks: initial.healthChecks !== false,
    usageStats: initial.usageStats !== false,
    infoBar: initial.infoBar !== false,
    favNotes: Boolean(initial.favNotes),
    favEmbeds: Boolean(initial.favEmbeds),
    onlineIcons: Boolean(initial.onlineIcons),
    navRichIcons: Boolean(initial.navRichIcons),
    headerGlass: initial.headerGlass !== false,
    cardIconBg: initial.cardIconBg !== false,
    locale: asLocale(initial.locale),
    dateFormat: asDateFormat(initial.dateFormat),
    timeFormat: asTimeFormat(initial.timeFormat),
    timezone: asTimeZone(initial.timezone),
    numberFormat: asNumberFormat(initial.numberFormat),
    probeBlink: Boolean(initial.probeBlink),
    annexFade: Boolean(initial.annexFade),
    catCounts: Boolean(initial.catCounts),
    pruneOrphanTags: Boolean(initial.pruneOrphanTags),
    tagsAlpha: initial.tagsAlpha !== false,
    cardResize: initial.cardResize !== false,
    cardContextMenu: initial.cardContextMenu !== false,
    cardDragCollapse: initial.cardDragCollapse !== false,
    ctxHideUrl: Boolean(initial.ctxHideUrl),
    infoStats: initial.infoStats !== false,
    infoLegend: initial.infoLegend !== false,
    probeTlsVerify: Boolean(initial.probeTlsVerify),
    probeAuthOnly: Boolean(initial.probeAuthOnly),
    requireLogin: Boolean(initial.requireLogin),
    outboundProxyEnabled: Boolean(initial.outboundProxyEnabled),
    outboundProxyHost: String(initial.outboundProxyHost || ""),
    outboundProxyPort: Number(initial.outboundProxyPort) > 0 ? Number(initial.outboundProxyPort) : 3128,
    outboundProxyUsername: String(initial.outboundProxyUsername || ""),
    outboundProxyPassword: "",
    outboundProxyHasPassword: Boolean((initial as { outboundProxyHasPassword?: boolean }).outboundProxyHasPassword),
    sessionHttpOnly: Boolean(initial.sessionHttpOnly),
    devAdminNoPassword: Boolean(initial.devAdminNoPassword),
    documentTitle: initial.documentTitle || "Dockit",
    favicon: initial.favicon || "",
  };
}

export const FIELD_SM = "h-9 rounded-md bg-transparent";
