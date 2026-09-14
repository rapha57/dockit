import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import type { LucideIcon } from "lucide-react";
import { Globe, Plus, Search, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/field";
import { Label } from "@/components/ui/label";
import { EdgeFade } from "@/components/edge-fade";
import { ModalShell } from "@/components/modal-shell";
import { FormActions } from "@/components/form-actions";
import { NoteEditor } from "@/components/note-editor";
import { ExpandRow } from "@/components/expand-row";
import { askConfirm } from "@/components/confirm-dialog";
import { t, te, td } from "@/lib/i18n";
import { ICON_OPTIONS, PRODUCT_ICONS, PortalIcon, fileToDataUrl, iconifySrc, urlToDataUrl } from "@/lib/icons";
import { grabSiteFavicon, probePreview, saveCustomIcon, type CustomIcon, type ItemKind, type PortalCard, type PortalCategory, type CheckMode } from "@/lib/portal";
import { safeAppHref } from "@/lib/safe-href";
import { findUrlDuplicates } from "@/lib/dup-url";
import { FIELD_SM, type AccessPayload, type CardFormPayload, type CatalogSpace, type DirectoryEntry, type MenuSpace } from "@/lib/portal-ui";
import { itemKind } from "@/lib/item-kind";
import { fold, lookupTagColor, tagPaint } from "@/lib/tag-ui";
import { randomTagHex } from "@/lib/tag-colors";
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
          setRemote(
            ids
              .map((id) => ({ id, src: iconifySrc(id) }))
              .filter((x) => x.src),
          );
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
    const href = safeAppHref(siteUrl);
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
export function AclFields({
  restricted,
  setRestricted,
  seeHint,
}: {
  restricted: boolean;
  setRestricted: (v: boolean) => void;
  viewers: string[];
  setViewers: (v: string[]) => void;
  editors: string[];
  setEditors: (v: string[]) => void;
  people?: DirectoryEntry[];
  seeHint?: string;
  editHint?: string;
}) {
  return (
    <div className="settings-card">
      <p className="settings-kicker">{t("space.visibility")}</p>
      <div className="settings-toggles">
        <label>
          <input
            type="checkbox"
            checked={restricted}
            onChange={(e) => setRestricted(e.target.checked)}
          />
          {t("space.restrict")}
        </label>
        {seeHint ? <p className="settings-hint">{seeHint}</p> : null}
        <p className="settings-hint">{t("access.restrictedHint")}</p>
      </div>
    </div>
  );
}
export function ItemForm({
  kind,
  initial,
  busy,
  picker,
  people,
  canAcl,
  onCancel,
  onSave,
}: {
  kind: "space" | "category";
  initial?: MenuSpace | PortalCategory | null;
  busy: boolean;
  picker: {
    token: string;
    library: CustomIcon[];
    online: boolean;
    navRichIcons: boolean;
    onLibrary: (icons: CustomIcon[]) => void;
  };
  people: DirectoryEntry[];
  canAcl: boolean;
  onCancel: () => void;
  onSave: (name: string, icon: string, access: AccessPayload) => void;
}) {
  const isSpace = kind === "space";
  const [name, setName] = useState(initial?.name ?? "");
  const [icon, setIcon] = useState(initial?.icon ?? (isSpace ? "Layers" : "Folder"));
  const [restricted, setRestricted] = useState(Boolean(initial?.restricted));
  const [hideLabel, setHideLabel] = useState(Boolean(isSpace && initial && "hideLabel" in initial ? (initial as MenuSpace).hideLabel : false));
  const [viewers, setViewers] = useState(initial?.viewers ?? []);
  const [editors, setEditors] = useState(initial?.editors ?? []);
  return (
    <form
      className="settings-frame is-item is-narrow"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(name.trim(), icon.trim() || (isSpace ? "Layers" : "Folder"), {
          restricted,
          viewers,
          editors,
          ...(isSpace ? { hideLabel } : {}),
        });
      }}
    >
      <div className="settings-body">
        <div className="settings-head">
          <div className="settings-head-copy">
            <h3 className="dialog-title">{initial ? (isSpace ? t("aria.editSpace") : t("aria.editCategory")) : (isSpace ? t("space.create") : t("category.create"))}</h3>
            <p className="settings-lead">{isSpace ? t("item.spaceLead") : t("item.categoryLead")}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onCancel}
            aria-label={t("actions.close")}
            title={t("actions.close")}
          >
            <X className="size-4" />
          </Button>
        </div>
        <EdgeFade className="settings-pane">
          <div className="settings-stack">
            <div className="settings-card">
              <p className="settings-kicker">{t("item.general")}</p>
              <div className="id-head">
                <div className="id-col">
                  <Label>{t("item.icon")}</Label>
                  <IconPicker
                    value={icon}
                    onChange={setIcon}
                    {...picker}
                    pictosOnly={!picker.navRichIcons}
                    header
                  />
                </div>
                <div className="id-col">
                  <div className="id-field">
                    <Label>{t("item.name")}</Label>
                    <Input
                      className={FIELD_SM}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>
              {isSpace ? (
                <div className="settings-toggles">
                  <p className="settings-kicker">{t("item.display")}</p>
                  <label>
                    <input
                      type="checkbox"
                      checked={hideLabel}
                      onChange={(e) => setHideLabel(e.target.checked)}
                    />
                    {t("space.hideLabel")}
                  </label>
                  <p className="settings-hint">{t("space.hideLabelHint")}</p>
                </div>
              ) : null}
            </div>
            {canAcl ? (
              <AclFields
                restricted={restricted}
                setRestricted={setRestricted}
                viewers={viewers}
                setViewers={setViewers}
                editors={editors}
                setEditors={setEditors}
                people={people}
                seeHint={isSpace ? t("space.seeHint") : t("category.seeHint")}
                editHint={isSpace ? t("space.editHint") : t("category.editHint")}
              />
            ) : null}
          </div>
        </EdgeFade>
        <FormActions busy={busy} hideCancel onCancel={onCancel} />
      </div>
    </form>
  );
}
export function FavsForm({
  hideLabel: initialHide,
  busy,
  onCancel,
  onSave,
}: {
  hideLabel: boolean;
  busy: boolean;
  onCancel: () => void;
  onSave: (hideLabel: boolean) => void;
}) {
  const [hideLabel, setHideLabel] = useState(Boolean(initialHide));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(hideLabel);
      }}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <h3 className="dialog-title">{t("nav.favorites")}</h3>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onCancel}
          aria-label={t("actions.close")}
            title={t("actions.close")}
        >
          <X className="size-4" />
        </Button>
      </div>
      <div className="settings-toggles">
        <label>
          <input
            type="checkbox"
            checked={hideLabel}
            onChange={(e) => setHideLabel(e.target.checked)}
          />
          {t("space.hideLabel")}
        </label>
      </div>
      <FormActions busy={busy} hideCancel onCancel={onCancel} />
    </form>
  );
}
export function ExtraLinksField({
  links,
  setLinks,
  linkMenu,
  setLinkMenu,
  onHubEnable,
}: {
  links: { key: string; title: string; url: string; openIn: "_blank" | "_self" }[];
  setLinks: React.Dispatch<React.SetStateAction<{ key: string; title: string; url: string; openIn: "_blank" | "_self" }[]>>;
  linkMenu?: boolean;
  setLinkMenu?: React.Dispatch<React.SetStateAction<boolean>>;
  onHubEnable?: () => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ key: string; pointerId: number } | null>(null);
  const didDrag = useRef(false);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(() => {
    const first = links[0];
    return first && !first.url ? first.key : null;
  });
  const INPUT_SM = FIELD_SM;
  function patch(key: string, next: Partial<{ title: string; url: string; openIn: "_blank" | "_self" }>) {
    setLinks((cur) => cur.map((r) => (r.key === key ? { ...r, ...next } : r)));
  }
  function endDrag(el: HTMLElement | null, pointerId?: number) {
    dragRef.current = null;
    setDragKey(null);
    try {
      if (pointerId != null) el?.releasePointerCapture(pointerId);
    } catch {
      // ignore
    }
  }
  function onGripDown(e: ReactPointerEvent<HTMLElement>, key: string) {
    if (links.length < 2 || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      key,
      pointerId: e.pointerId,
    };
    didDrag.current = false;
    setDragKey(key);
  }
  function onGripMove(e: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const root = listRef.current;
    if (!root) return;
    const others = [...root.querySelectorAll<HTMLElement>("[data-row-id]")].filter((row) => {
      const id = row.getAttribute("data-row-id");
      return id && id !== drag.key;
    });
    let to = others.length;
    for (let i = 0; i < others.length; i++) {
      const box = others[i].getBoundingClientRect();
      if (e.clientY < box.top + box.height / 2) {
        to = i;
        break;
      }
    }
    setLinks((cur) => {
      const from = cur.findIndex((r) => r.key === drag.key);
      if (from < 0 || from === to) return cur;
      didDrag.current = true;
      const rest = cur.filter((r) => r.key !== drag.key);
      rest.splice(to, 0, cur[from]);
      return rest;
    });
  }
  function onGripUp(e: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    endDrag(e.currentTarget, e.pointerId);
  }
  function toggle(id: string) {
    if (didDrag.current) {
      didDrag.current = false;
      return;
    }
    setOpenId((cur) => (cur === id ? null : id));
  }
  function addLink() {
    if (links.length >= 20) return;
    const key = crypto.randomUUID();
    setLinks((cur) => [
      ...cur,
      {
        key,
        title: "",
        url: "",
        openIn: "_blank",
      },
    ]);
    setOpenId(key);
  }
  return (
    <div className="am-work">
      {links.length ? (
        <div ref={listRef} className="am-providers" role="list">
          {links.map((row) => (
            <ExpandRow
              key={row.key}
              id={row.key}
              className="is-provider is-link"
              expanded={openId === row.key}
              dragging={dragKey === row.key}
              grip
              onToggle={() => toggle(row.key)}
              onGripDown={(e) => onGripDown(e, row.key)}
              onGripMove={onGripMove}
              onGripUp={onGripUp}
              cells={[
                <span key="n" className="am-row-title">
                  {row.title.trim() || t("item.name")}
                  {row.url.trim() ? <span className="am-row-sub">{row.url.trim()}</span> : null}
                </span>,
              ]}
            >
              <div className="settings-stack">
                <Field label={t("item.name")}>
                  <Input
                    className={INPUT_SM}
                    value={row.title}
                    onChange={(e) => patch(row.key, { title: e.target.value })}
                    maxLength={40}
                    placeholder={t("item.name")}
                  />
                </Field>
                <Field label={t("item.url")}>
                  <Input
                    className={INPUT_SM}
                    value={row.url}
                    onChange={(e) => patch(row.key, { url: e.target.value })}
                    placeholder="https://"
                  />
                </Field>
                <div className="settings-toggles">
                  <label>
                    <input
                      type="checkbox"
                      checked={row.openIn === "_self"}
                      onChange={(e) => patch(row.key, { openIn: e.target.checked ? "_self" : "_blank" })}
                    />
                    {t("item.sameWindow")}
                  </label>
                  <p className="settings-hint">{t("item.sameWindowHint")}</p>
                </div>
                <div className="am-actions">
                  <button
                    type="button"
                    className="am-text-btn is-danger"
                    onClick={() => {
                      setLinks((cur) => cur.filter((r) => r.key !== row.key));
                      if (openId === row.key) setOpenId(null);
                    }}
                  >
                    {t("item.removeLink")}
                  </button>
                </div>
              </div>
            </ExpandRow>
          ))}
        </div>
      ) : null}
      {links.length < 20 ? (
        <button type="button" className="am-create shrink-0" onClick={addLink}>
          <Plus className="size-3.5" /> {t("actions.addLink")}
        </button>
      ) : null}
      {linkMenu !== undefined && setLinkMenu ? (
        <div className="settings-toggles mt-3">
          <label className={links.length > 1 ? "" : "is-disabled"}>
            <input
              type="checkbox"
              checked={Boolean(linkMenu) && links.length > 1}
              disabled={links.length < 2}
              onChange={(e) => {
                setLinkMenu?.(e.target.checked);
                if (e.target.checked) onHubEnable?.();
              }}
            />
            {t("item.linkMenu")}
          </label>
          <p className="settings-hint">{t("item.linkMenuHint")}</p>
        </div>
      ) : null}
    </div>
  );
}
export function SizePreview({ colSpan, rowSpan }: { colSpan: number; rowSpan: number }) {
  const cols = Math.min(3, Math.max(1, Number(colSpan) || 1));
  const rows = Math.min(3, Math.max(1, Number(rowSpan) || 1));
  const slots = [];
  for (let r = 1; r <= 3; r++)
    for (let c = 1; c <= 3; c++)
      slots.push({
        r,
        c,
      });
  return (
    <div className="size-preview-wrap">
      <div className="size-preview" aria-hidden>
        {slots.map((s) => (
          <div
            key={`${s.r}-${s.c}`}
            className="size-preview-slot"
            style={{
              gridColumn: s.c,
              gridRow: s.r,
            }}
          />
        ))}
        <div
          className="size-preview-card"
          style={{
            gridColumn: `1 / span ${cols}`,
            gridRow: `1 / span ${rows}`,
          }}
        />
      </div>
    </div>
  );
}
export function CardForm({
  categories,
  categoryId,
  catalog,
  initial,
  busy,
  picker,
  probes,
  knownTags,
  tagColors,
  onCancel,
  onSave,
}: {
  categories: PortalCategory[];
  categoryId: string;
  catalog: CatalogSpace[];
  initial?: PortalCard | null;
  busy: boolean;
  picker: {
    token: string;
    library: CustomIcon[];
    online: boolean;
    navRichIcons: boolean;
    onLibrary: (icons: CustomIcon[]) => void;
  };
  probes?: boolean;
  knownTags?: { name: string; count: number }[];
  tagColors?: Record<string, string>;
  onCancel: () => void;
  onSave: (payload: CardFormPayload) => void;
}) {
  const [kind, setKind] = useState(initial?.kind ?? "app");
  const [catId, setCatId] = useState(initial?.categoryId ?? categoryId);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [icon, setIcon] = useState(initial?.icon ?? "Link");
  const [tags, setTags] = useState(initial?.tags ?? []);
  const [tagDraft, setTagDraft] = useState("");
  const [tagHi, setTagHi] = useState(0);
  const [draftColors, setDraftColors] = useState({});
  const [colSpan, setColSpan] = useState<1 | 2 | 3>(initial?.colSpan ?? 1);
  const [rowSpan, setRowSpan] = useState<1 | 2 | 3>(initial?.rowSpan ?? 1);
  const [check, setCheck] = useState<CheckMode>(initial?.check ?? "off");
  const [checkHost, setCheckHost] = useState(initial?.checkHost ?? "");
  const [links, setLinks] = useState<{ key: string; title: string; url: string; openIn: "_blank" | "_self" }[]>(() => {
    const rows = (Array.isArray(initial?.links) ? initial.links : [])
      .map((r) => ({
        key: crypto.randomUUID(),
        title: String(r.title || ""),
        url: String(r.url || ""),
        openIn: (r.openIn === "_self" ? "_self" : "_blank") as "_blank" | "_self",
      }))
      .slice(0, 5);
    const kind0 = initial?.kind || "app";
    const legacy = safeAppHref(initial?.url);
    if (kind0 === "app" && legacy && rows[0]?.url !== legacy)
      rows.unshift({ key: crypto.randomUUID(), title: "", url: legacy, openIn: "_blank" });
    if (!rows.length && kind0 === "app") {
      const key = crypto.randomUUID();
      rows.push({ key, title: "", url: "", openIn: "_blank" });
    }
    return rows;
  });
  const [linkMenu, setLinkMenu] = useState(Boolean(initial?.linkMenu));
  const [embedBorder, setEmbedBorder] = useState(Boolean(initial?.embedBorder));
  const [embedBg, setEmbedBg] = useState<string>(initial?.embedBg || "");
  const [probeBusy, setProbeBusy] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const catOptions = useMemo(() => categories, [categories]);
  const tagMatches = useMemo(() => {
    const s = fold(tagDraft.trim());
    if (!s) return [];
    return (knownTags ?? [])
      .filter(
        (t) =>
          fold(t.name).includes(s) &&
          !tags.some((x) => x.toLowerCase() === t.name.toLowerCase()),
      )
      .slice(0, 8);
  }, [tagDraft, knownTags, tags]);
  function addTag(raw: string) {
    const t = raw.trim().slice(0, 32);
    if (!t) return;
    setTags((cur) => {
      if (cur.length >= 3) return cur;
      if (cur.some((x) => x.toLowerCase() === t.toLowerCase())) return cur;
      setDraftColors((colors) => {
        const merged = {
          ...tagColors,
          ...colors,
        };
        if (lookupTagColor(t, merged)) return colors;
        if ((knownTags ?? []).some((k) => k.name.toLowerCase() === t.toLowerCase())) return colors;
        const used = new Set(Object.values(merged).map((h) => String(h).toLowerCase()));
        return {
          ...colors,
          [t]: randomTagHex(used),
        };
      });
      return [...cur, t];
    });
    setTagDraft("");
  }
  function removeTag(name: string) {
    setTags((cur) => cur.filter((x) => x.toLowerCase() !== name.toLowerCase()));
  }
  function resetFieldsForKind(next: ItemKind) {
    setKind(next);
    setTitle("");
    setDescription("");
    setUrl("");
    setTags([]);
    setTagDraft("");
    setDraftColors({});
    setLinks(next === "app" ? [{ key: crypto.randomUUID(), title: "", url: "", openIn: "_blank" }] : []);
    setLinkMenu(false);
    setEmbedBorder(false);
    setEmbedBg("");
    setCheck("off");
    setCheckHost("");
    setColSpan(1);
    setRowSpan(1);
    setIcon(next === "note" ? "FileText" : next === "embed" ? "AppWindow" : "Link");
  }
  async function changeKind(next: ItemKind) {
    if (next === kind) return;
    const hasContent = Boolean(
      title.trim() ||
      description.trim() ||
      url.trim() ||
      tags.length ||
      links.some((r) => r.title.trim() || r.url.trim()) ||
      check !== "off" ||
      colSpan !== 1 ||
      rowSpan !== 1,
    );
    if (
      hasContent &&
      !(await askConfirm({
        title: t("item.type"),
        body: t("confirm.changeKind"),
        okLabel: t("actions.continue"),
        danger: false,
      }))
    )
      return;
    if (next === "embed" && kind === "app") setUrl(links[0]?.url?.trim() || "");
    if (next === "app" && kind === "embed" && safeAppHref(url))
      setLinks([{ key: crypto.randomUUID(), title: "", url: safeAppHref(url) || "", openIn: "_blank" }]);
    resetFieldsForKind(next);
  }
  const kindMeta = itemKind(kind);
  const heading = initial ? kindMeta.edit : kindMeta.create;
  const kindSelect = (
    <span className="select-wrap">
      <select
        className="kind-select"
        value={kind}
        aria-label={t("item.type")}
        onChange={(e) => void changeKind(e.target.value as ItemKind)}
      >
        <option value="app">{itemKind("app").option}</option>
        <option value="note">{itemKind("note").option}</option>
        <option value="embed">{itemKind("embed").option}</option>
      </select>
    </span>
  );
  const mainLink = kind === "app" ? links[0]?.url || "" : url;
  const canSave =
    kind === "app"
      ? Boolean(title.trim() && safeAppHref(mainLink))
      : kind === "note"
        ? Boolean(description.trim())
        : Boolean(safeAppHref(mainLink));
  const urlDupes = useMemo(
    () => (kind === "note" ? [] : findUrlDuplicates(catalog, mainLink, initial?.id)),
    [catalog, mainLink, kind, initial?.id],
  );
  const urlDupHint = urlDupes.length ? (
    <p className="settings-hint is-warn">
      {urlDupes.length === 1
        ? t("item.urlExists", {
            title: urlDupes[0].title,
            space: urlDupes[0].space,
          })
        : t("item.urlExistsN", {
            n: urlDupes.length,
            list: urlDupes
              .slice(0, 3)
              .map((d) => d.title)
              .join(", "),
          })}
    </p>
  ) : null;
  return (
    <form
      className="settings-frame is-item is-narrow"
      onSubmit={(e) => {
        e.preventDefault();
        if (kind === "app" && !title.trim()) {
          toast.error(t("errors.nameRequired"));
          return;
        }
        if (kind === "app" && !safeAppHref(links[0]?.url || "")) {
          toast.error(t("errors.urlRequired"));
          return;
        }
        if (kind === "note" && !description.trim()) {
          toast.error(t("errors.contentRequired"));
          return;
        }
        if (kind === "embed" && !safeAppHref(url)) {
          toast.error(t("errors.embedUrlRequired"));
          return;
        }
        onSave({
          categoryId: catId,
          kind,
          title: title.trim(),
          description: kind === "embed" ? "" : kind === "app" ? description.trim().slice(0, 40) : description.trim(),
          url: url.trim(),
          icon:
            icon.trim() || (kind === "note" ? "FileText" : kind === "embed" ? "AppWindow" : "Link"),
          tags: kind === "app" ? tags.slice(0, 3) : [],
          colSpan,
          rowSpan,
          check: kind === "app" ? check : "off",
          checkHost: kind === "app" && check === "icmp" ? checkHost.trim() : "",
          links:
            kind === "app"
              ? links
                  .filter((r) => safeAppHref(r.url))
                  .slice(0, 5)
                  .map((r) => ({
                    title: r.title.trim().slice(0, 40),
                    url: safeAppHref(r.url) || r.url.trim().slice(0, 2e3),
                    openIn: r.openIn,
                  }))
              : [],
          linkMenu: kind === "app" ? linkMenu : undefined,
          embedBorder: kind === "embed" ? embedBorder : undefined,
          embedBg: kind === "embed" ? embedBg : undefined,
          tagColors: kind === "app" ? draftColors : undefined,
        });
      }}
    >
      <div className="settings-body">
        <div className="settings-head">
          <div className="settings-head-copy">
            <h3 className="dialog-title">{heading}</h3>
            {kind === "app" ? <p className="settings-lead">{t("item.appLead")}</p> : kind === "note" ? <p className="settings-lead">{t("item.noteLead")}</p> : <p className="settings-lead">{t("item.embedLead")}</p>}
          </div>
          <div className="settings-head-actions">
            {kindSelect}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onCancel}
              aria-label={t("actions.close")}
              title={t("actions.close")}
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
        <EdgeFade className="settings-pane">
          <div className="settings-stack">
            <div className="settings-card">
              <p className="settings-kicker">{t("item.general")}</p>
              {kind === "app" ? (
                <div className="id-head">
                  <div className="id-col">
                    <Label>{t("item.icon")}</Label>
                    <IconPicker
                      value={icon}
                      onChange={setIcon}
                      siteUrl={links[0]?.url || ""}
                      {...picker}
                      header
                    />
                  </div>
                  <div className="id-col">
                    <div className="id-field">
                      <Label>{t("item.name")}</Label>
                      <Input
                        className={FIELD_SM}
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder={t("item.placeholderName")}
                        required
                      />
                    </div>
                    <div className="id-field">
                      <Label>{t("item.category")}</Label>
                      <Select
                        className={FIELD_SM}
                        value={catId}
                        onChange={(e) => setCatId(e.target.value)}
                      >
                        {catOptions.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>
                </div>
              ) : (
                <Field label={t("item.titleOptional")}>
                  <Input
                    className={FIELD_SM}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={t("item.placeholderTitle")}
                  />
                </Field>
              )}
              {kind === "app" ? (
                <Field label={t("item.description")}>
                  <div className="flex items-center gap-2">
                    <Input
                      className={FIELD_SM}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder={t("item.descriptionPlaceholder")}
                      maxLength={40}
                    />
                    <p className="theme-css-meta shrink-0">{description.length}/40</p>
                  </div>
                </Field>
              ) : null}
            </div>
            {kind === "note" || kind === "embed" ? (
              <div className="settings-card">
                <p className="settings-kicker">
                  {kind === "note"
                    ? t("item.content")
                    : kindMeta.urlLabel}
                </p>
              {kind === "note" ? (
                <Field>
                  <NoteEditor value={description} onChange={setDescription} />
                </Field>
              ) : kind === "embed" ? (
                <>
                  <Field>
                    <Input
                      className={FIELD_SM}
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://"
                      required
                    />
                    {urlDupHint}
                  </Field>
                  <div className="settings-toggles">
                    <label>
                      <input
                        type="checkbox"
                        checked={embedBorder}
                        onChange={(e) => setEmbedBorder(e.target.checked)}
                      />
                      {t("item.embedBorder")}
                    </label>
                    <p className="settings-hint">{t("item.embedBorderHint")}</p>
                  </div>
                </>
              ) : null}
            </div>
            ) : null}
            {kind === "app" ? (
              <div className="settings-card">
                <p className="settings-kicker">{t("item.link")}</p>
                <ExtraLinksField
                  links={links}
                  setLinks={setLinks}
                  linkMenu={linkMenu}
                  setLinkMenu={setLinkMenu}
                  onHubEnable={() => setCheck("off")}
                />
              </div>
            ) : null}
            {kind === "app" ? (
              <div className="settings-card">
                <p className="settings-kicker">{t("item.tags")}</p>
                <Field>
                  <div className="flex items-center gap-2">
                    <div className="tag-input-wrap relative flex min-h-9 flex-1 items-center gap-1 rounded-md border border-border bg-transparent px-3">
                    {tags.map((tag) => {
                      const paint = tagPaint(tag, {
                        ...tagColors,
                        ...draftColors,
                      });
                      return (
                        <button
                          key={tag}
                          type="button"
                          data-tone={paint.tone}
                          style={paint.style}
                          className="tag-chip shrink-0"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            removeTag(tag);
                          }}
                        >
                          {tag}
                          <X className="ml-0.5 size-2.5" />
                        </button>
                      );
                    })}
                    <input
                      ref={tagInputRef}
                      className="min-w-[4rem] flex-1 bg-transparent text-sm outline-none placeholder:text-subtle"
                      value={tagDraft}
                      placeholder={tags.length >= 3 ? t("item.maxTags") : t("item.addTag")}
                      disabled={tags.length >= 3}
                      onChange={(e) => {
                        setTagDraft(e.target.value);
                        setTagHi(0);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowDown" && tagMatches.length) {
                          e.preventDefault();
                          setTagHi((i) => (i + 1) % tagMatches.length);
                          return;
                        }
                        if (e.key === "ArrowUp" && tagMatches.length) {
                          e.preventDefault();
                          setTagHi((i) => (i - 1 + tagMatches.length) % tagMatches.length);
                          return;
                        }
                        if (e.key === "Enter" && tagMatches.length) {
                          e.preventDefault();
                          const m = tagMatches[tagHi % tagMatches.length];
                          addTag(m.name);
                          setTagHi(0);
                          return;
                        }
                        if (e.key === "Escape") {
                          e.preventDefault();
                          setTagDraft("");
                          setTagHi(0);
                          return;
                        }
                        if (e.key === "Backspace" && !tagDraft && tags.length) {
                          e.preventDefault();
                          removeTag(tags[tags.length - 1]);
                          setTagHi(0);
                        }
                        if (e.key === "Enter" || e.key === ",") {
                          e.preventDefault();
                          addTag(tagDraft.replace(/,/g, ""));
                        }
                      }}
                      onBlur={() => addTag(tagDraft)}
                    />
                    {tagMatches.length > 0 ? createPortal(
                      <div
                        className="search-suggest"
                        role="listbox"
                        style={{
                          position: "fixed",
                          left: tagInputRef.current?.getBoundingClientRect().left ?? 0,
                          top: (tagInputRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
                          width: tagInputRef.current?.getBoundingClientRect().width ?? 200,
                          zIndex: 9999,
                        }}
                      >
                        {tagMatches.map((t, i) => {
                          const paint = tagPaint(t.name, tagColors);
                          const hi = tagMatches.length ? tagHi % tagMatches.length : 0;
                          return (
                            <button
                              key={t.name}
                              type="button"
                              role="option"
                              aria-selected={i === hi}
                              className={i === hi ? "is-hi" : ""}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                addTag(t.name);
                                setTagDraft("");
                                setTagHi(0);
                              }}
                            >
                              <span data-tone={paint.tone} style={paint.style} className="tag-chip">
                                {t.name}
                              </span>
                              <span className="text-xs text-muted">{t.count}</span>
                            </button>
                          );
                        })}
                      </div>,
                      document.body,
                    ) : null}
                  </div>
                    <p className="theme-css-meta shrink-0">{`${tags.length}/3`}</p>
                  </div>
                </Field>
              </div>
            ) : null}
            {kind !== "app" ? (
              <div className="settings-card">
                <p className="settings-kicker">{t("item.size")}</p>
                <div className="flex items-start gap-4">
                  <div className="flex min-w-0 shrink-0 flex-col gap-1" style={{ flex: "0 0 33%" }}>
                    <Label>{t("item.preview")}</Label>
                    <SizePreview colSpan={colSpan} rowSpan={rowSpan} />
                    <p className="settings-hint text-center tabular-nums">{colSpan} × {rowSpan}</p>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-3">
                    <div className="id-field">
                      <Label>{t("item.width")}</Label>
                      <Select
                        className={FIELD_SM}
                        value={colSpan}
                        onChange={(e) => setColSpan(Number(e.target.value) as 1 | 2 | 3)}
                      >
                        <option value={1}>{t("item.col1")}</option>
                        <option value={2}>{t("item.col2")}</option>
                        <option value={3}>{t("item.colFull")}</option>
                      </Select>
                    </div>
                    <div className="id-field">
                      <Label>{t("item.height")}</Label>
                      <Select
                        className={FIELD_SM}
                        value={rowSpan}
                        onChange={(e) => setRowSpan(Number(e.target.value) as 1 | 2 | 3)}
                      >
                        <option value={1}>{t("item.row1")}</option>
                        <option value={2}>{t("item.row2")}</option>
                        <option value={3}>{t("item.row3")}</option>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
            {kind === "app" ? (
              <div className="settings-card">
                <p className="settings-kicker">{t("probe.control")}</p>
              {probes === false ? (
                <p className="settings-hint">{t("item.probeDisabled")}</p>
              ) : linkMenu ? (
                <p className="settings-hint">{t("item.probeHubHint")}</p>
              ) : (
                <p className="settings-hint">{t("item.probeFirstLinkHint")}</p>
              )}
              <Field>
                <Select
                  className={FIELD_SM}
                  value={check}
                  disabled={probes === false}
                  onChange={(e) => setCheck(e.target.value as CheckMode)}
                >
                  <option value="off">{t("item.probeNone")}</option>
                  <option value="http">{t("item.probeHttp")}</option>
                  <option value="icmp">{t("item.probeIcmp")}</option>
                </Select>
                {check !== "off" && probes !== false ? (
                  <button
                    type="button"
                    className="settings-link self-start"
                    disabled={probeBusy || !picker.token}
                    onClick={async () => {
                      setProbeBusy(true);
                      try {
                        const row = await probePreview({
                          data: {
                            token: picker.token,
                            mode: check === "icmp" ? "icmp" : "http",
                            url: url.trim(),
                            host: checkHost.trim(),
                          },
                        });
                        if (!row) throw new Error("errors.noReply");
                        if (row.ok) toast.success(td(row.detail));
                        else toast.error(td(row.detail));
                      } catch (err) {
                        if (sessionGone(err)) return;
                        toast.error(te(err));
                      } finally {
                        setProbeBusy(false);
                      }
                    }}
                  >
                    {probeBusy ? t("probe.testing") : t("probe.testNow")}
                  </button>
                ) : null}
              </Field>
              {check === "icmp" && probes !== false ? (
                <Field label={t("probe.icmpHost")}>
                  <Input
                    className={FIELD_SM}
                    value={checkHost}
                    onChange={(e) => setCheckHost(e.target.value)}
                    placeholder="10.12.4.20 or host.example"
                    required
                  />
                </Field>
              ) : null}
            </div>
            ) : null}
          </div>
        </EdgeFade>
        <FormActions busy={busy} disabled={!canSave} hideCancel onCancel={onCancel} />
      </div>
    </form>
  );
}
