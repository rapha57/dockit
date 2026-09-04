export type UiPrefs = {
  favIds: string[];
  openFavs: boolean;
  collapsedCats: string[];
};

const LS_KEY = "portal-ui-prefs";
const COOKIE_KEY = "portal-ui-prefs";
const MAX_FAVS = 80;
const MAX_COLLAPSED = 80;
const MAX_AGE = 60 * 60 * 24 * 400;

export const DEFAULT_UI_PREFS: UiPrefs = {
  favIds: [],
  openFavs: false,
  collapsedCats: [],
};

function asIdList(raw: unknown, max: number): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((id) => String(id)).filter((id) => id.length > 0 && id.length <= 80))].slice(0, max);
}

function asPrefs(raw: unknown): UiPrefs | null {
  if (!raw || typeof raw !== "object") return null;
  const doc = raw as Partial<UiPrefs>;
  return {
    favIds: asIdList(doc.favIds, MAX_FAVS),
    openFavs: doc.openFavs === true,
    collapsedCats: asIdList(doc.collapsedCats, MAX_COLLAPSED),
  };
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

export function writeUiPrefs(next: UiPrefs) {
  const prefs = asPrefs(next) ?? DEFAULT_UI_PREFS;
  const json = JSON.stringify(prefs);
  try {
    localStorage.setItem(LS_KEY, json);
  } catch {
    /* ignore */
  }
  try {
    document.cookie = `${COOKIE_KEY}=${encodeURIComponent(json)}; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax`;
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
