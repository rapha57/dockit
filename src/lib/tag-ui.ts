import type { CSSProperties } from "react";
import type { DocSpace, PortalCard } from "@/lib/portal";
import { localeTag } from "@/lib/i18n";
import { defaultTagHex, remapTagHex, tagInk, tagTone } from "@/lib/tag-colors";

export function fold(s: unknown) {
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function collectTags(
  catalog: DocSpace[] | null | undefined,
  tagColors: Record<string, string> | null | undefined,
  alpha: boolean,
  match?: (app: PortalCard) => boolean,
) {
  const map = new Map<string, { name: string; count: number }>();
  for (const space of catalog ?? [])
    for (const cat of space.categories)
      for (const app of cat.cards) {
        if ((app.kind || "app") !== "app") continue;
        if (match && !match(app)) continue;
        for (const tag of app.tags) {
          const key = tag.toLowerCase();
          const cur = map.get(key);
          if (cur) cur.count += 1;
          else
            map.set(key, {
              name: tag,
              count: 1,
            });
        }
      }
  if (!match) {
    for (const name of Object.keys(tagColors ?? {})) {
      const key = name.toLowerCase();
      if (!map.has(key))
        map.set(key, {
          name,
          count: 0,
        });
    }
  }
  const rows = [...map.values()];
  if (alpha === false) return rows;
  return rows.sort((a, b) => a.name.localeCompare(b.name, localeTag(), { sensitivity: "base" }));
}

export function orderedTags(names: string[] | null | undefined, alpha: boolean) {
  const list = Array.isArray(names) ? [...names] : [];
  if (alpha === false) return list;
  return list.sort((a, b) => String(a).localeCompare(String(b), localeTag(), { sensitivity: "base" }));
}

export function lookupTagColor(name: string, colors: Record<string, string> | null | undefined) {
  if (!colors) return void 0;
  if (colors[name]) return remapTagHex(colors[name]);
  const key = name.toLowerCase();
  for (const [k, v] of Object.entries(colors)) if (k.toLowerCase() === key) return remapTagHex(v);
}

export function tagPaint(name: string, colors: Record<string, string> | null | undefined) {
  const hex = lookupTagColor(name, colors) || defaultTagHex(name);
  return {
    tone: tagTone(name),
    style: {
      ["--tag-bg"]: hex,
      ["--tag-fg"]: tagInk(hex),
    } as CSSProperties,
  };
}
