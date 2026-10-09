import { asDocRev, assertWritableRev, bumpDocRev, takeExpectedRev } from "../doc-rev";
import { setExtraCaPem } from "../tls-ca";
import { newId } from "../id";
import { MAX_CUSTOM_ICONS } from "../assets-url";
import { sanitizeThemeCss } from "../theme-css";
import { normalizeScope } from "../oidc-scope";
import { GROUP_FILTER_MAX } from "../oidc-groups";
import { cleanProxyHost, cleanProxyPort, setOutboundProxy } from "../outbound-proxy";
import {
  assertProductionSecrets,
  envLdapBindPassword,
  envOidcClientSecret,
  isLocalHttp,
} from "../security-runtime";
import { asHistory, snapshotToDisk } from "../history";
import { asNumberFormat, asTimeFormat, asTimeZone, DATE_FORMATS } from "../i18n";
import { asDirectories, asLoginOrder, syncLegacyLdap } from "../ldap-runtime";
import { absorbResourceAcl } from "../acl";
import type { CustomIcon, Doc, DocSpace, PortalSettings } from "./types";
import {
  asTagColors,
  asUsers,
  asGroups,
  asRoles,
  asClickDays,
  defaultStore,
  ensureGroups,
  ensureRoles,
  normalizeCatAccess,
  normalizeItem,
  normalizeSpaceAccess,
} from "./model";

function dataPath(join: (dir: string, ...parts: string[]) => string) {
  const custom = process.env.PORTAL_DATA_FILE?.trim();
  if (custom) return custom;
  return join(process.cwd(), "data", "portal.json");
}
export function fromDisk(raw: unknown): Doc | null {
  return asStore(raw);
}
export function parseStoreText(text: string): Doc {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("errors.storeUnreadable");
  }
  const parsed = asStore(raw);
  if (!parsed) throw new Error("errors.storeUnreadable");
  return parsed;
}
function isMissingStoreFile(err: unknown): boolean {
  return Boolean(
    err &&
    typeof err === "object" &&
    "code" in err &&
    (err as NodeJS.ErrnoException).code === "ENOENT",
  );
}
export function asStore(raw: unknown): Doc | null {
  if (!raw || typeof raw !== "object") return null;
  const doc = raw as {
    settings?: Record<string, unknown>;
    spaces?: unknown;
    customIcons?: unknown;
    lastSpaceId?: unknown;
    clickDays?: unknown;
    users?: unknown;
    groups?: unknown;
    roles?: unknown;
    history?: unknown;
    rev?: unknown;
  };
  const spaces = Array.isArray(doc.spaces) ? doc.spaces : null;
  if (!doc.settings || !spaces) return null;
  const settings = doc.settings;
  const parsed: Doc = {
    settings: {
      title: String(settings.title || "Dockit"),
      subtitle: String(settings.subtitle || ""),
      logo: typeof settings.logo === "string" ? settings.logo : "",
      healthChecks: doc.settings.healthChecks !== false,
      usageStats: doc.settings.usageStats !== false,
      infoBar: doc.settings.infoBar !== false,
      tagColors: asTagColors(doc.settings.tagColors),
      cssLight: sanitizeThemeCss(
        typeof doc.settings.cssLight === "string" ? doc.settings.cssLight : "",
      ),
      cssDark: sanitizeThemeCss(
        typeof doc.settings.cssDark === "string" ? doc.settings.cssDark : "",
      ),
      documentTitle: String(doc.settings.documentTitle || "Dockit").slice(0, 60),
      favicon: typeof doc.settings.favicon === "string" ? doc.settings.favicon.slice(0, 4e5) : "",
      favsHideLabel: Boolean(doc.settings.favsHideLabel),
      restoreLastSpace: Boolean(doc.settings.restoreLastSpace),
      favNotes: Boolean(doc.settings.favNotes),
      favEmbeds: Boolean(doc.settings.favEmbeds),
      onlineIcons: Boolean(doc.settings.onlineIcons),
      navRichIcons: Boolean(doc.settings.navRichIcons),
      headerGlass: doc.settings.headerGlass !== false,
      probeBlink: Boolean(doc.settings.probeBlink),
      annexFade: Boolean(doc.settings.annexFade),
      catCounts: Boolean(doc.settings.catCounts),
      pruneOrphanTags: Boolean(doc.settings.pruneOrphanTags),
      tagsAlpha: doc.settings.tagsAlpha !== false,
      cardResize: doc.settings.cardResize !== false,
      cardIconBg: doc.settings.cardIconBg !== false,
      cardContextMenu: doc.settings.cardContextMenu !== false,
      cardDragCollapse: doc.settings.cardDragCollapse !== false,
      ctxHideUrl: Boolean(doc.settings.ctxHideUrl),
      infoStats: doc.settings.infoStats !== false,
      infoLegend: doc.settings.infoLegend !== false,
      probeTlsVerify: Boolean(doc.settings.probeTlsVerify),
      curationWebhook: String(doc.settings.curationWebhook || "")
        .trim()
        .slice(0, 2000),
      curationCron: String(doc.settings.curationCron || "")
        .trim()
        .slice(0, 80),
      probeCaPem: String(doc.settings.probeCaPem || "").slice(0, 2e4),
      probeAuthOnly: Boolean(doc.settings.probeAuthOnly),
      requireLogin: Boolean(doc.settings.requireLogin),
      sessionHttpOnly: Boolean(doc.settings.sessionHttpOnly),
      devAdminNoPassword: Boolean(doc.settings.devAdminNoPassword),
      oidcEnabled: Boolean(doc.settings.oidcEnabled),
      oidcIssuer: String(doc.settings.oidcIssuer || "")
        .trim()
        .slice(0, 300),
      oidcClientId: String(doc.settings.oidcClientId || "")
        .trim()
        .slice(0, 120),
      oidcClientSecret: String(doc.settings.oidcClientSecret || "").slice(0, 200),
      oidcScope: normalizeScope(
        doc.settings.oidcScope == null ? undefined : String(doc.settings.oidcScope),
      ),
      oidcGroupFilter: String(doc.settings.oidcGroupFilter || "")
        .trim()
        .slice(0, GROUP_FILTER_MAX),
      oidcLabel:
        String(doc.settings.oidcLabel || "SSO")
          .trim()
          .slice(0, 40) || "SSO",
      oidcAutoCreate: Boolean(doc.settings.oidcAutoCreate),
      oidcAutoRedirect: Boolean(doc.settings.oidcAutoRedirect),
      proxyAuthEnabled: Boolean(doc.settings.proxyAuthEnabled),
      proxyAuthHeader: /^[A-Za-z0-9-]+$/.test(String(doc.settings.proxyAuthHeader || "").trim())
        ? String(doc.settings.proxyAuthHeader).trim()
        : "X-Remote-User",
      outboundProxyEnabled: Boolean(doc.settings.outboundProxyEnabled),
      outboundProxyHost: cleanProxyHost(doc.settings.outboundProxyHost),
      outboundProxyPort: cleanProxyPort(doc.settings.outboundProxyPort),
      outboundProxyUsername: String(doc.settings.outboundProxyUsername || "")
        .trim()
        .slice(0, 120),
      outboundProxyPassword: String(doc.settings.outboundProxyPassword || "").slice(0, 200),
      ...syncLegacyLdap(asDirectories(doc.settings)),
      ldapDirectories: asDirectories(doc.settings),
      loginOrder: asLoginOrder(doc.settings.loginOrder, asDirectories(doc.settings)),
      locale: settings.locale === "fr" ? "fr" : "en",
      dateFormat: DATE_FORMATS.includes(settings.dateFormat as (typeof DATE_FORMATS)[number])
        ? (settings.dateFormat as (typeof DATE_FORMATS)[number])
        : "ymd",
      timeFormat: asTimeFormat(settings.timeFormat),
      timezone: asTimeZone(settings.timezone),
      numberFormat: asNumberFormat(settings.numberFormat),
    },
    customIcons: (Array.isArray(doc.customIcons) ? doc.customIcons : []).slice(
      0,
      MAX_CUSTOM_ICONS,
    ) as CustomIcon[],
    lastSpaceId: typeof doc.lastSpaceId === "string" ? doc.lastSpaceId : void 0,
    clickDays: asClickDays(doc.clickDays),
    users: asUsers(doc.users),
    groups: asGroups(doc.groups),
    roles: asRoles(doc.roles),
    history: asHistory(doc.history),
    rev: asDocRev(doc.rev),
    spaces: spaces.map((t, i: number) => {
      const space =
        t && typeof t === "object"
          ? (t as Record<string, unknown> & {
              categories?: unknown[];
              id?: string;
              name?: string;
              icon?: string;
              sortOrder?: number;
            })
          : {};
      const cats = Array.isArray(space.categories) ? space.categories : [];
      return {
        id: space.id || newId(),
        name: String(space.name || ""),
        icon: String(space.icon || "Layers"),
        sortOrder: Number(space.sortOrder ?? i + 1),
        ...normalizeSpaceAccess(space),
        categories: cats.map((c, j: number) => {
          const cat =
            c && typeof c === "object"
              ? (c as Record<string, unknown> & {
                  id?: string;
                  name?: string;
                  icon?: string;
                  cards?: unknown[];
                  sortOrder?: number;
                })
              : {};
          const cards = Array.isArray(cat.cards) ? cat.cards : [];
          return {
            id: String(cat.id || newId()),
            name: String(cat.name || ""),
            icon: String(cat.icon || "AppWindow"),
            sortOrder: Number(cat.sortOrder ?? j + 1),
            ...normalizeCatAccess(cat),
            cards: cards.map((a, k: number) => {
              const item = a && typeof a === "object" ? (a as { sortOrder?: number }) : {};
              return normalizeItem(a, String(cat.id || ""), Number(item.sortOrder ?? k + 1));
            }),
          };
        }),
      };
    }) as DocSpace[],
  };
  absorbResourceAcl(parsed);
  setOutboundProxy({
    enabled: Boolean(parsed.settings.outboundProxyEnabled),
    host: parsed.settings.outboundProxyHost,
    port: parsed.settings.outboundProxyPort,
    username: parsed.settings.outboundProxyUsername,
    password: parsed.settings.outboundProxyPassword,
  });
  return parsed;
}
function historyToDisk(row: any): any {
  if (!row || typeof row !== "object") return row;
  const restored = row.restored && typeof row.restored === "object" ? row.restored : {};
  return {
    ...row,
    restored: {
      space: Boolean(restored.space),
      categories: Array.isArray(restored.categories) ? restored.categories : [],
      cards: Array.isArray(restored.cards) ? restored.cards : [],
    },
    snapshot: snapshotToDisk(row.snapshot),
  };
}
function persistableSettings(s: PortalSettings): PortalSettings {
  const dirs = asDirectories(s).map((d) => ({
    ...d,
    bindPassword: envLdapBindPassword(d.id) ? "" : String(d.bindPassword || ""),
  }));
  const legacy = syncLegacyLdap(dirs);
  return {
    ...s,
    ...legacy,
    oidcClientSecret: envOidcClientSecret() ? "" : String(s.oidcClientSecret || ""),
    ldapDirectories: dirs,
  };
}
function applyEnvSecrets(doc: Doc) {
  const oidc = envOidcClientSecret();
  if (oidc) doc.settings.oidcClientSecret = oidc;
  const dirs = asDirectories(doc.settings);
  let touch = Boolean(oidc);
  for (const d of dirs) {
    const password = envLdapBindPassword(d.id);
    if (!password) continue;
    d.bindPassword = password;
    touch = true;
  }
  if (!touch) return;
  doc.settings.ldapDirectories = dirs;
  Object.assign(doc.settings, syncLegacyLdap(dirs));
}
export function toDisk(doc: Doc) {
  const { spaces, lastSpaceId, history, settings, ...rest } = doc;
  return {
    ...rest,
    settings: persistableSettings(settings),
    lastSpaceId: lastSpaceId,
    spaces: (spaces || []).map((t) => ({
      ...t,
      categories: (t.categories || []).map((c) => {
        const { cards, ...cat } = c;
        return {
          ...cat,
          cards: cards || [],
        };
      }),
    })),
    history: (history || []).map(historyToDisk),
  };
}
let liveDoc: Doc | null = null;
let liveMtime = 0;
let liveDirty = false;

export function staleLiveCache(fileMtime: number, loadedMtime: number, dirty: boolean): boolean {
  return !dirty && fileMtime > loadedMtime;
}

export function setLiveDoc(doc: Doc | null) {
  liveDoc = doc;
  liveDirty = Boolean(doc);
  if (!doc) liveMtime = 0;
}

async function fileMtime(path: string): Promise<number> {
  try {
    const { stat } = await import("node:fs/promises");
    return (await stat(path)).mtimeMs;
  } catch {
    return 0;
  }
}
let clickFlushTimer: ReturnType<typeof setTimeout> | null = null;
const CLICK_FLUSH_MS = 4000;
async function persistDocMedia(doc: Doc) {
  const { persistMediaValue } = await import("../assets");
  doc.settings.logo = await persistMediaValue("logo", doc.settings.logo);
  doc.settings.favicon = await persistMediaValue("favicon", doc.settings.favicon);
  const icons = Array.isArray(doc.customIcons) ? doc.customIcons : [];
  const next: CustomIcon[] = [];
  for (const ic of icons.slice(0, MAX_CUSTOM_ICONS)) {
    const id = String(ic.id || newId());
    next.push({
      id,
      name: String(ic.name || "").slice(0, 80),
      dataUrl: await persistMediaValue(`icon-${id}`, ic.dataUrl),
    });
  }
  doc.customIcons = next;
}
export async function readDocUnlocked(): Promise<Doc> {
  assertProductionSecrets();
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const path = dataPath(join);
  const mtime = await fileMtime(path);
  if (liveDoc && !staleLiveCache(mtime, liveMtime, liveDirty)) return liveDoc;
  try {
    const text = await readFile(path, "utf8");
    const parsed = parseStoreText(text);
    ensureRoles(parsed);
    ensureGroups(parsed);
    applyEnvSecrets(parsed);
    liveDoc = parsed;
    liveMtime = mtime;
    liveDirty = false;
    setExtraCaPem(parsed.settings.probeCaPem);
    const { isDefaultAdminPassword } = await import("./session");
    await isDefaultAdminPassword(parsed);
    void import("../curation-schedule").then((m) => m.ensureCurationSchedule()).catch(() => void 0);
    return parsed;
  } catch (err) {
    if (liveDoc) return liveDoc;
    if (!isMissingStoreFile(err)) throw err;
  }
  const seeded = defaultStore();
  await writeDocUnlocked(seeded);
  const { isDefaultAdminPassword } = await import("./session");
  await isDefaultAdminPassword(seeded);
  void import("../curation-schedule").then((m) => m.ensureCurationSchedule()).catch(() => void 0);
  return seeded;
}
async function persistDoc(doc: Doc) {
  await persistDocMedia(doc);
  const disk = toDisk(doc);
  applyEnvSecrets(doc);
  setExtraCaPem(doc.settings.probeCaPem);
  liveDoc = doc;
  const { mkdir, rename, writeFile, unlink } = await import("node:fs/promises");
  const { dirname: dirn, join } = await import("node:path");
  const path = dataPath(join);
  await mkdir(dirn(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${newId()}.tmp`;
  try {
    await writeFile(tmp, `${JSON.stringify(disk, null, 2)}\n`, "utf8");
    await rename(tmp, path);
    liveDirty = false;
    liveMtime = await fileMtime(path);
  } catch (err) {
    await unlink(tmp).catch(() => void 0);
    throw err;
  }
}
export async function writeDocUnlocked(doc: Doc) {
  if (clickFlushTimer) {
    clearTimeout(clickFlushTimer);
    clickFlushTimer = null;
  }
  await persistDoc(doc);
  const { isDefaultAdminPassword } = await import("./session");
  await isDefaultAdminPassword(doc);
}
export function scheduleClickFlush() {
  if (clickFlushTimer) return;
  clickFlushTimer = setTimeout(() => {
    clickFlushTimer = null;
    withLock(async () => {
      if (liveDoc) await persistDoc(liveDoc);
    });
  }, CLICK_FLUSH_MS);
}
let ioChain = Promise.resolve();
export function withLock<T>(fn: () => T | Promise<T>): Promise<T> {
  const run = ioChain.then(fn, fn);
  ioChain = run.then(
    () => void 0,
    () => void 0,
  );
  return run;
}
export async function readDoc() {
  return withLock(readDocUnlocked);
}
export function mutate<T>(
  data: unknown,
  request: { headers?: { get?: (k: string) => string | null } } | null | undefined,
  fn: (doc: Doc) => T | Promise<T>,
  opts?: { allowWeakAdmin?: boolean },
): Promise<T> {
  return withLock(async () => {
    const doc = await readDocUnlocked();
    if (!opts?.allowWeakAdmin) {
      const { gateWeakAdmin } = await import("./session");
      await gateWeakAdmin(doc, data, request);
    }
    const payload =
      data && typeof data === "object" ? (data as { token?: unknown; rev?: unknown }) : undefined;
    const bump = assertWritableRev(doc, takeExpectedRev(payload, request));
    const result = await fn(doc);
    if (bump) bumpDocRev(doc);
    await writeDocUnlocked(doc);
    if (bump && result && typeof result === "object" && "rev" in result) {
      (result as { rev: number }).rev = asDocRev(doc.rev);
    }
    if (result && typeof result === "object" && "runtime" in result) {
      const runtime = (result as { runtime?: { localHttp?: boolean } }).runtime;
      if (runtime && typeof runtime === "object") runtime.localHttp = isLocalHttp(request);
    }
    return result;
  });
}
