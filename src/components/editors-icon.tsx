import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Globe, Search, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EdgeFade } from "@/components/edge-fade";
import { ModalShell } from "@/components/modal-shell";
import { askConfirm } from "@/components/confirm-dialog";
import { t, te } from "@/lib/i18n";
import {
  ICON_OPTIONS,
  PRODUCT_ICONS,
  PortalIcon,
  fileToDataUrl,
  iconifySrc,
  urlToDataUrl,
} from "@/lib/icons";
import { grabSiteFavicon, saveCustomIcon } from "@/lib/portal";
import type { CustomIcon } from "@/lib/portal/types";
import { safeEmbedHref } from "@/lib/safe-href";
import { sessionGone } from "@/lib/session-gone";

export function IconPicker({
  value,
  onChange,
  token,
  library,
  onLibrary,
  online,
  siteUrl,
  pictosOnly,
  header,
}: {
  value: string;
  onChange: (v: string) => void;
  token: string;
  library: CustomIcon[];
  onLibrary: (icons: CustomIcon[]) => void;
  online: boolean;
  siteUrl?: string;
  pictosOnly?: boolean;
  header?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [remote, setRemote] = useState<{ id: string; src: string }[]>([]);
  const [busyIcon, setBusyIcon] = useState(false);
  const [tab, setTab] = useState<"all" | "icons" | "symbols">("all");
  const query = q.trim().toLowerCase();
  useEffect(() => {
    if (!open || pictosOnly || !online || query.length < 2) {
      if (!open || pictosOnly || query.length < 2) setRemote([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`https://api.iconify.design/search?query=${encodeURIComponent(query)}&limit=48`, {
        signal: ctrl.signal,
      })
        .then((r) => r.json())
        .then((json) => {
          const ids = ((json.icons ?? []) as string[]).slice(0, 48);
          setRemote(ids.map((id) => ({ id, src: iconifySrc(id) })).filter((x) => x.src));
        })
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, online, open, pictosOnly]);
  function close() {
    setOpen(false);
    setQ("");
    setTab("all");
  }
  function choose(next: string) {
    onChange(next);
    close();
  }
  async function pickRemote(src: string) {
    setBusyIcon(true);
    try {
      choose(await urlToDataUrl(src));
    } catch (err) {
      toast.error(te(err));
    } finally {
      setBusyIcon(false);
    }
  }
  async function importFile(file: File) {
    if (!file) return;
    setBusyIcon(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const name = file.name.replace(/\.[^.]+$/, "").slice(0, 80) || "icone";
      if (token)
        onLibrary(
          await saveCustomIcon({
            data: {
              token,
              name,
              dataUrl,
            },
          }),
        );
      choose(dataUrl);
    } catch (err) {
      if (sessionGone(err)) return;
      toast.error(te(err));
    } finally {
      setBusyIcon(false);
    }
  }
  async function grabFavicon() {
    const href = safeEmbedHref(siteUrl);
    if (!href) {
      toast.error(t("icons.needUrl"));
      return;
    }
    if (!token) {
      toast.error(t("icons.needSession"));
      return;
    }
    const current = (value || "").trim();
    if (
      current &&
      current !== "Link" &&
      current !== "AppWindow" &&
      !(await askConfirm({
        title: t("icons.choose"),
        body: t("icons.replaceConfirm"),
        okLabel: t("actions.save"),
      }))
    )
      return;
    setBusyIcon(true);
    try {
      const row = await grabSiteFavicon({
        data: {
          token,
          url: href,
        },
      });
      if (!row?.dataUrl) throw new Error("errors.noFavicon");
      choose(row.dataUrl);
      toast.success(t("toast.faviconApplied"));
    } catch (err) {
      if (sessionGone(err)) return;
      toast.error(te(err));
    } finally {
      setBusyIcon(false);
    }
  }
  const searching = q.trim().length >= 2 && online && !pictosOnly;
  const gridItems: {
    key: string;
    title: string;
    value: string;
    src?: string;
    Icon?: LucideIcon;
    remote?: boolean;
    code?: string;
  }[] = (() => {
    const needle = q.trim().toLowerCase();
    const customs = library.map((p) => ({
      key: `c-${p.id}`,
      title: p.name || p.id,
      value: p.dataUrl,
      src: p.dataUrl,
      code: p.name || p.id,
    }));
    const prods = PRODUCT_ICONS.map((p) => ({
      key: `p-${p.slug}`,
      title: p.label,
      value: p.slug,
      src: p.src,
      code: p.slug,
    }));
    const syms = ICON_OPTIONS.map((o) => ({
      key: `s-${o.name}`,
      title: t(`iconLabel.${o.name}`),
      value: o.name,
      Icon: o.Icon,
      code: o.name,
    }));
    const base = pictosOnly
      ? syms
      : tab === "symbols"
        ? syms
        : tab === "icons"
          ? [...customs, ...prods]
          : [...customs, ...prods, ...syms];
    const remoteHits = searching
      ? remote.map((p) => ({
          key: `r-${p.id}`,
          title: p.id,
          value: p.src,
          src: p.src,
          remote: true,
          code: p.id,
        }))
      : [];
    return [...remoteHits, ...base].filter(
      (item) =>
        !needle ||
        item.title.toLowerCase().includes(needle) ||
        item.value.toLowerCase().includes(needle),
    );
  })();
  return (
    <>
      <button
        type="button"
        className={`brand-preview icon-trigger${header ? " is-header" : ""}`}
        title={t("icons.choose")}
        aria-label={t("icons.choose")}
        onClick={() => setOpen(true)}
      >
        <PortalIcon name={value} className={header ? "size-7" : "size-6"} />
      </button>
      {open ? (
        <ModalShell onClose={close} padded={false} label={t("icons.choose")}>
          <div className="icon-pick-frame">
            <div className="icon-pick-head">
              <h3 className="dialog-title">{t("item.icon")}</h3>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={close}
                aria-label={t("actions.close")}
                title={t("actions.close")}
              >
                <X className="size-4" />
              </Button>
            </div>
            <EdgeFade className="icon-pick-body">
              <div className="icon-pick-tool">
                <div className="am-search">
                  <Search className="size-3.5" aria-hidden />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder={
                      pictosOnly
                        ? t("icons.filterLib")
                        : !online
                          ? `${t("icons.filterLib")} (${t("icons.onlineOff")})`
                          : t("icons.filterOnline")
                    }
                    aria-label={t("icons.filterOnline")}
                    autoFocus
                  />
                </div>
              </div>
              {!pictosOnly ? (
                <div className="icon-pick-tabsrow">
                  <div className="am-filters" role="tablist" aria-label={t("item.icon")}>
                    {(
                      [
                        ["all", t("icons.tabAll")],
                        ["icons", t("icons.tabIcons")],
                        ["symbols", t("icons.tabSymbols")],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        role="tab"
                        aria-selected={tab === id}
                        className={tab === id ? "is-on" : ""}
                        onClick={() => setTab(id)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="icon-pick-actions">
                    {siteUrl != null ? (
                      <button
                        type="button"
                        className="am-create shrink-0"
                        disabled={busyIcon || !token}
                        title={t("icons.faviconHint")}
                        onClick={() => void grabFavicon()}
                      >
                        <Globe className="size-3.5" />
                        {busyIcon ? t("icons.fetching") : t("icons.siteFavicon")}
                      </button>
                    ) : null}
                    <label className="am-create shrink-0 cursor-pointer">
                      <Upload className="size-3.5" />
                      {t("icons.importPng")}
                      <input
                        type="file"
                        accept="image/png,image/svg+xml,image/webp,image/jpeg,image/gif,image/x-icon,.png,.svg,.webp,.jpg,.jpeg,.ico"
                        className="hidden"
                        disabled={busyIcon}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (file) void importFile(file);
                        }}
                      />
                    </label>
                  </div>
                </div>
              ) : null}
              {gridItems.length ? (
                <div className="icon-pick-grid">
                  {gridItems.map((item) =>
                    item.src ? (
                      <button
                        key={item.key}
                        type="button"
                        title={item.code || item.title}
                        onClick={() => {
                          if (item.remote && item.src) void pickRemote(item.src);
                          else choose(item.value);
                        }}
                        className={`flex size-11 items-center justify-center rounded-lg border ${
                          value === item.value
                            ? "border-transparent bg-elevated ring-1 ring-border"
                            : "border-transparent hover:bg-elevated"
                        }`}
                      >
                        <img src={item.src} alt="" className="size-6 object-contain" />
                      </button>
                    ) : (
                      <button
                        key={item.key}
                        type="button"
                        title={item.code || item.title}
                        onClick={() => choose(item.value)}
                        className={`flex size-11 items-center justify-center rounded-lg border ${
                          value === item.value
                            ? "border-transparent bg-elevated text-fg ring-1 ring-border"
                            : "border-transparent text-muted hover:bg-elevated hover:text-fg"
                        }`}
                      >
                        {item.Icon ? <item.Icon className="size-6" /> : null}
                      </button>
                    ),
                  )}
                </div>
              ) : (
                <p className="am-note">{t("empty.noResults")}</p>
              )}
            </EdgeFade>
          </div>
        </ModalShell>
      ) : null}
    </>
  );
}
