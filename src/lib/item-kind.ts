import { t } from "@/lib/i18n";

export function itemKind(kind: string | undefined) {
  const k = kind === "note" || kind === "embed" ? kind : "app";
  return {
    option: t(`item.${k}.option`),
    create: t(`item.${k}.create`),
    edit: t(`item.${k}.edit`),
    remove: t(`item.${k}.remove`),
    urlLabel: t(`item.${k}.urlLabel`),
  };
}
