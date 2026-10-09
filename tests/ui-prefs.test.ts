import { describe, expect, it } from "vitest";
import {
  DEFAULT_UI_PREFS,
  FAVS_TAB,
  applyRememberedSpace,
  bootUiPrefs,
  prefsCookiePayload,
  prefsFromCookieHeader,
  rememberedFavs,
  rememberedSpaceId,
} from "@/lib/ui-prefs";

describe("remembered space prefs", () => {
  it("ignores lastSpaceId until the portal option is on", () => {
    expect(rememberedSpaceId(false, "lab", ["infra", "lab"])).toBe("");
    expect(rememberedSpaceId(true, "lab", ["infra", "lab"])).toBe("lab");
    expect(rememberedSpaceId(true, "gone", ["infra"])).toBe("");
    expect(rememberedSpaceId(true, "", ["lab"])).toBe("");
    expect(rememberedSpaceId(true, FAVS_TAB, ["infra", "lab"])).toBe("");
  });

  it("treats favs as a remembered tab, not a space", () => {
    expect(rememberedFavs(false, FAVS_TAB)).toBe(false);
    expect(rememberedFavs(true, "lab")).toBe(false);
    expect(rememberedFavs(true, FAVS_TAB)).toBe(true);
  });

  it("reads last tab from the prefs cookie", () => {
    const json = encodeURIComponent(JSON.stringify({ ...DEFAULT_UI_PREFS, lastSpaceId: FAVS_TAB }));
    expect(prefsFromCookieHeader(`portal-ui-prefs=${json}`)?.lastSpaceId).toBe(FAVS_TAB);
    expect(prefsFromCookieHeader(`a=1; portal-ui-prefs=${json}; b=2`)?.lastSpaceId).toBe(FAVS_TAB);
    expect(prefsFromCookieHeader("")).toBeNull();
  });

  it("puts fav ids in the cookie but not collapsed categories", () => {
    const prefs = {
      ...DEFAULT_UI_PREFS,
      favIds: ["a1", "a2"],
      collapsedCats: ["c1"],
      lastSpaceId: FAVS_TAB,
      openFavs: true,
    };
    const slim = prefsCookiePayload(prefs);
    expect(slim).toEqual({ lastSpaceId: FAVS_TAB, openFavs: true, favIds: ["a1", "a2"] });
    expect("collapsedCats" in slim).toBe(false);
    const encoded = encodeURIComponent(JSON.stringify(slim));
    expect(prefsFromCookieHeader(`portal-ui-prefs=${encoded}`)).toEqual({
      ...DEFAULT_UI_PREFS,
      lastSpaceId: FAVS_TAB,
      openFavs: true,
      favIds: ["a1", "a2"],
    });
    expect(bootUiPrefs(slim)).toEqual({
      ...DEFAULT_UI_PREFS,
      lastSpaceId: FAVS_TAB,
      openFavs: true,
      favIds: ["a1", "a2"],
    });
  });

  it("drops fav ids from the cookie when the payload would overflow", () => {
    const prefs = {
      ...DEFAULT_UI_PREFS,
      favIds: Array.from({ length: 80 }, (_, i) => `id-${"x".repeat(70)}${i}`),
      lastSpaceId: FAVS_TAB,
      openFavs: true,
    };
    const slim = prefsCookiePayload(prefs);
    expect(slim.favIds).toBeUndefined();
    expect(encodeURIComponent(JSON.stringify(slim)).length).toBeLessThan(3500);
  });

  it("swaps the active space from catalog when restoring", () => {
    const data = {
      activeSpaceId: "infra",
      spaces: [{ id: "infra" }, { id: "lab" }],
      catalog: [
        { id: "infra", categories: [{ id: "c1" }] },
        { id: "lab", categories: [{ id: "c2" }] },
      ],
      categories: [{ id: "c1" }],
    };
    expect(applyRememberedSpace(data, "lab", false)).toBe(data);
    expect(applyRememberedSpace(data, DEFAULT_UI_PREFS.lastSpaceId, true)).toBe(data);
    expect(applyRememberedSpace(data, FAVS_TAB, true)).toBe(data);
    expect(applyRememberedSpace(data, "lab", true)).toEqual({
      ...data,
      activeSpaceId: "lab",
      categories: [{ id: "c2" }],
    });
  });
});
