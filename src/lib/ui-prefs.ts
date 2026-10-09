export type UiPrefs = {
  favIds: string[];
  openFavs: boolean;
  lastSpaceId: string;
  collapsedCats: string[];
};

const LS_KEY = "portal-ui-prefs";
const COOKIE_KEY = "portal-ui-prefs";
export const FAVS_TAB = "favs";
const MAX_FAVS = 80;
const MAX_COLLAPSED = 80;
const MAX_AGE = 60 * 60 * 24 * 400;

export const DEFAULT_UI_PREFS: UiPrefs = {
  favIds: [],
  openFavs: false,
  lastSpaceId: "",
  collapsedCats: [],
};

function asIdList(raw: unknown, max: number): string[] {
  if (!Array.isArray(raw)) return [];
  return [
    ...new Set(raw.map((id) => String(id)).filter((id) => id.length > 0 && id.length <= 80)),
  ].slice(0, max);
}

function asSpaceId(raw: unknown): string {
  const id = String(raw || "");
  return id.length > 0 && id.length <= 80 ? id : "";
}

function asPrefs(raw: unknown): UiPrefs | null {
  if (!raw || typeof raw !== "object") return null;
  const doc = raw as Partial<UiPrefs>;
  return {
    favIds: asIdList(doc.favIds, MAX_FAVS),
    openFavs: doc.openFavs === true,
    lastSpaceId: asSpaceId(doc.lastSpaceId),
    collapsedCats: asIdList(doc.collapsedCats, MAX_COLLAPSED),
  };
}

export function rememberedSpaceId(
  enabled: boolean,
  lastSpaceId: string,
  spaceIds: readonly string[],
): string {
  if (!enabled || lastSpaceId === FAVS_TAB) return "";
  return lastSpaceId && spaceIds.includes(lastSpaceId) ? lastSpaceId : "";
}

export function rememberedFavs(enabled: boolean, lastSpaceId: string): boolean {
  return enabled && lastSpaceId === FAVS_TAB;
}

export function prefsFromCookieHeader(header: string | null | undefined): UiPrefs | null {
  if (!header) return null;
  const prefix = `${COOKIE_KEY}=`;
  for (const part of header.split(";")) {
    const row = part.trim();
    if (!row.startsWith(prefix)) continue;
    const raw = row.slice(prefix.length);
    try {
      return parseRaw(decodeURIComponent(raw));
    } catch {
      return parseRaw(raw);
    }
  }
  return null;
}

export function applyRememberedSpace<
  T extends {
    activeSpaceId: string;
    spaces: { id: string }[];
    catalog?: { id: string; categories: unknown }[] | null;
    categories: unknown;
  },
>(data: T, lastSpaceId: string, enabled: boolean): T {
  const id = rememberedSpaceId(
    enabled,
    lastSpaceId,
    data.spaces.map((s) => s.id),
  );
  if (!id || id === data.activeSpaceId) return data;
  const entry = (data.catalog ?? []).find((t) => t.id === id);
  if (!entry) return data;
  return { ...data, activeSpaceId: id, categories: entry.categories };
}

function parseRaw(text: string | null | undefined): UiPrefs | null {
  if (!text) return null;
  try {
    return asPrefs(JSON.parse(text));
  } catch {
    return null;
  }
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const parts = document.cookie.split("; ");
  for (const part of parts) {
    if (!part.startsWith(`${name}=`)) continue;
    try {
      return decodeURIComponent(part.slice(name.length + 1));
    } catch {
      return part.slice(name.length + 1);
    }
  }
  return null;
}

export function readUiPrefs(): UiPrefs {
  if (typeof window === "undefined") return DEFAULT_UI_PREFS;
  try {
    const fromLs = parseRaw(localStorage.getItem(LS_KEY));
    if (fromLs) return fromLs;
  } catch {
    /* ignore */
  }
  const fromCookie = parseRaw(readCookie(COOKIE_KEY));
  return fromCookie ?? DEFAULT_UI_PREFS;
}

const COOKIE_BUDGET = 3500;

export function bootUiPrefs(
  raw:
    | {
        favIds?: string[];
        openFavs?: boolean;
        lastSpaceId?: string;
      }
    | null
    | undefined,
): UiPrefs {
  if (!raw) return DEFAULT_UI_PREFS;
  return {
    ...DEFAULT_UI_PREFS,
    favIds: asIdList(raw.favIds, MAX_FAVS),
    openFavs: raw.openFavs === true,
    lastSpaceId: asSpaceId(raw.lastSpaceId),
  };
}

export function prefsCookiePayload(prefs: UiPrefs): {
  lastSpaceId: string;
  openFavs: boolean;
  favIds?: string[];
} {
  const slim = { lastSpaceId: prefs.lastSpaceId, openFavs: prefs.openFavs };
  const withFavs = { ...slim, favIds: prefs.favIds };
  if (encodeURIComponent(JSON.stringify(withFavs)).length <= COOKIE_BUDGET) return withFavs;
  return slim;
}

export function writeUiPrefs(next: UiPrefs) {
  const prefs = asPrefs(next) ?? DEFAULT_UI_PREFS;
  const json = JSON.stringify(prefs);
  try {
    localStorage.setItem(LS_KEY, json);
  } catch {
    /* ignore */
  }
  try {
    const slim = JSON.stringify(prefsCookiePayload(prefs));
    document.cookie = `${COOKIE_KEY}=${encodeURIComponent(slim)}; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax`;
  } catch {
    /* ignore */
  }
  return prefs;
}

export function clearUiPrefs(): UiPrefs {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
  try {
    document.cookie = `${COOKIE_KEY}=; Path=/; Max-Age=0; SameSite=Lax`;
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem("portal-theme");
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_UI_PREFS };
}
