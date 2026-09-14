import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  Activity,
  BadgeInfo,
  Bug,
  Download,
  FileText,
  Globe,
  MousePointerClick,
  Palette,
  RotateCcw,
  Settings2,
  Shield,
  Sparkles,
  Tags,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/field";
import { EdgeFade } from "@/components/edge-fade";
import { askConfirm } from "@/components/confirm-dialog";
import { BrandPick } from "@/components/brand-pick";
import { FormActions } from "@/components/form-actions";
import { useColSort, SortLabel } from "@/components/access";
import { useTheme } from "@/components/theme";
import { t, te, tp, asLocale, asDateFormat, asTimeFormat, asTimeZone, asNumberFormat, localeTag, formatNumber, formatWhen, listTimeZones } from "@/lib/i18n";
import { CSS_MAX, sanitizeThemeCss } from "@/lib/theme-css";
import { checkLatestRelease } from "@/lib/release";
import { exportPortal, type PortalSettings, type SessionInfo } from "@/lib/portal";
import { collectInventory, inventoryCsv, inventoryPdf } from "@/lib/inventory";
import { TAG_PALETTE, defaultTagHex, remapTagHex, tagInk } from "@/lib/tag-colors";
import { settingsBase, FIELD_SM, type SettingsPayload, type TagsPayload, type CatalogSpace, type DirectoryEntry, type MenuSpace, type PortalData } from "@/lib/portal-ui";
import { lookupTagColor } from "@/lib/tag-ui";
import { BmcMark, DockitMark, fileToDataUrl, toFaviconDataUrl } from "@/lib/icons";
import { PORTAL_VERSION, isNewerVersion } from "@/lib/portal-version";

export function settingsSections() {
  const raw: [string, typeof Settings2][] = [
    ["general", Settings2],
    ["locales", Globe],
    ["themes", Palette],
    ["presentation", Sparkles],
    ["reachability", Activity],
    ["tags", Tags],
    ["security", Shield],
    ["debug", Bug],
    ["info", MousePointerClick],
    ["backup", Download],
    ["reset", RotateCcw],
    ["about", BadgeInfo],
  ];
  return raw.map(([id, icon]) => ({
    id,
    icon,
    label: t(`sections.${id}.label`),
    lead: t(`sections.${id}.lead`),
  }));
}
function catalogHasProbes(catalog: CatalogSpace[]): boolean {
  for (const space of catalog)
    for (const cat of space.categories)
      for (const card of cat.cards) {
        if ((card.kind || "app") !== "app") continue;
        if (card.check && card.check !== "off") return true;
      }
  return false;
}

export function AdminPanel({
  tab,
  settings,
  runtime,
  catalog,
  tags,
  token,
  session,
  busy,
  onTab,
  onCancel,
  onSaveSettings,
  onResetClicks,
  onResetProbes,
  onApplyTags,
  onSaveTheme,
  onResetPortal,
  onImportPortal,
}: {
  tab: string;
  settings: PortalSettings;
  runtime?: PortalData["runtime"];
  catalog: CatalogSpace[];
  tags: { name: string; count: number }[];
  spaces: MenuSpace[];
  directory: DirectoryEntry[];
  token: string;
  session: SessionInfo | null;
  busy: boolean;
  onTab: (id: string) => void;
  onCancel: () => void;
  onSaveSettings: (payload: SettingsPayload, opts?: { close?: boolean }) => void;
  onResetClicks: () => void;
  onResetProbes: () => void;
  onApplyTags: (payload: TagsPayload) => void;
  onSaveTheme: (payload: { cssLight: string; cssDark: string }) => void;
  onResetPortal: () => void;
  onImportPortal: (payload: unknown) => void;
}) {
  const sections = settingsSections().filter((s) => {
    if (s.id === "about") return true;
    return session?.canManageSettings;
  });
  const current = sections.find((s) => s.id === tab) ?? sections[0];
  return (
    <div className="settings-frame is-wide is-access">
      <nav className="settings-nav" aria-label={t("settings.sectionsAria")}>
        <p className="menu-title">{t("settings.title")}</p>
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`settings-nav-item${tab === s.id ? " is-on" : ""}`}
            onClick={() => onTab(s.id)}
          >
            <s.icon className="size-4 shrink-0" />
            {s.label}
          </button>
        ))}
      </nav>
      <div className="settings-body">
        <div className="settings-head">
          <div className="settings-head-copy">
            <h3 className="dialog-title">{current?.label || t("settings.title")}</h3>
            {current?.lead ? <p className="settings-lead">{current.lead}</p> : null}
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
        {tab === "general" ? (
          <EdgeFade className="settings-pane">
            <SettingsForm
              initial={settings}
              busy={busy}
              embedded
              onCancel={onCancel}
              onSave={(payload) => onSaveSettings(payload)}
            />
          </EdgeFade>
        ) : tab === "locales" ? (
          <EdgeFade className="settings-pane">
            <LocalesForm initial={settings} onSave={(payload) => onSaveSettings(payload)} />
          </EdgeFade>
        ) : tab === "presentation" ? (
          <EdgeFade className="settings-pane">
            <PresentationForm initial={settings} onSave={(payload) => onSaveSettings(payload)} />
          </EdgeFade>
        ) : tab === "reachability" ? (
          <EdgeFade className="settings-pane">
            <ReachabilityForm initial={settings} onSave={(payload) => onSaveSettings(payload)} />
          </EdgeFade>
        ) : tab === "security" ? (
          <EdgeFade className="settings-pane">
            <SecurityForm
              initial={settings}
              onSave={(payload) => onSaveSettings(payload)}
            />
          </EdgeFade>
        ) : tab === "debug" ? (
          <EdgeFade className="settings-pane">
            <DebugPanel
              settings={settings}
              runtime={runtime}
              session={session}
              busy={busy}
              onSave={(payload) => onSaveSettings(payload)}
            />
          </EdgeFade>
        ) : tab === "info" ? (
          <EdgeFade className="settings-pane">
            <InfoBarForm
              initial={settings}
              onSave={(payload) => onSaveSettings(payload)}
            />
          </EdgeFade>
        ) : tab === "themes" ? (
          <EdgeFade className="settings-pane">
            <ThemeForm initial={settings} busy={busy} onCancel={onCancel} onSave={onSaveTheme} />
          </EdgeFade>
        ) : tab === "backup" ? (
          <EdgeFade className="settings-pane">
            <BackupForm
              token={token}
              busy={busy}
              catalog={catalog}
              title={settings.title}
              onImport={onImportPortal}
            />
          </EdgeFade>
        ) : tab === "reset" && session?.canManageSettings ? (
          <EdgeFade className="settings-pane">
            <div className="settings-stack">
              <div className="settings-card">
                <p className="settings-kicker">{t("info.probeResetKicker")}</p>
                <p className="settings-hint">{t("info.probeResetHint")}</p>
                <Button
                  type="button"
                  variant="danger"
                  className="am-create self-start"
                  disabled={busy || !catalogHasProbes(catalog)}
                  onClick={async () => {
                    if (
                      !(await askConfirm({
                        title: t("confirm.resetProbes"),
                        body: t("info.probeResetConfirm"),
                        okLabel: t("info.probeResetAction"),
                      }))
                    )
                      return;
                    onResetProbes();
                  }}
                >
                  {t("info.probeResetAction")}
                </Button>
              </div>
              <div className="settings-card">
                <p className="settings-kicker">{t("info.resetKicker")}</p>
                <p className="settings-hint">{t("info.resetHint")}</p>
                <Button
                  type="button"
                  variant="danger"
                  className="am-create self-start"
                  disabled={busy || !onResetClicks}
                  onClick={async () => {
                    if (!onResetClicks) return;
                    if (
                      !(await askConfirm({
                        title: t("confirm.resetClicks"),
                        body: t("info.resetConfirm"),
                        okLabel: t("info.resetAction"),
                      }))
                    )
                      return;
                    onResetClicks();
                  }}
                >
                  {t("info.resetAction")}
                </Button>
              </div>
              <div className="settings-card">
                <p className="settings-kicker">{t("sections.reset.label")}</p>
                <p className="settings-hint">{t("settings.resetBody")}</p>
                {session?.isOwner ? (
                  <Button
                    type="button"
                    variant="danger"
                    className="am-create self-start"
                    disabled={busy}
                    onClick={async () => {
                      if (
                        !(await askConfirm({
                          title: t("sections.reset.label"),
                          body: t("settings.resetConfirm"),
                          okLabel: t("sections.reset.label"),
                        }))
                      )
                        return;
                      onResetPortal();
                    }}
                  >
                    {t("settings.resetAction")}
                  </Button>
                ) : null}
              </div>
            </div>
          </EdgeFade>
        ) : tab === "about" || !session?.canManageSettings ? (
          <EdgeFade className="settings-pane">
            <AboutForm />
          </EdgeFade>
        ) : (
          <div className="settings-pane is-fill">
            <TagManager
              tags={tags}
              colors={settings.tagColors}
              busy={busy}
              embedded
              settings={settings}
              pruneOrphanTags={Boolean(settings.pruneOrphanTags)}
              tagsAlpha={settings.tagsAlpha !== false}
              onCancel={onCancel}
              onSave={(payload) =>
                onSaveSettings(payload, {
                  close: false,
                })
              }
              onApply={onApplyTags}
            />
          </div>
        )}
        {tab === "general" ||
        tab === "locales" ||
        tab === "presentation" ||
        tab === "reachability" ||
        tab === "security" ||
        tab === "info" ||
        tab === "themes" ||
        tab === "tags" ? (
          <FormActions busy={busy} hideCancel form="settings-form" />
        ) : null}
      </div>
    </div>
  );
}
export function AboutForm() {
  const [release, setRelease] = useState<{ kind: string; latest?: string; url?: string } | null>(
    null,
  );
  useEffect(() => {
    let live = true;
    checkLatestRelease({
      data: {},
    })
      .then((row) => {
        if (!live) return;
        const latest = String(row?.latest || "").trim();
        if (!latest) {
          setRelease({
            kind: "none",
          });
          return;
        }
        setRelease(
          isNewerVersion(latest, PORTAL_VERSION)
            ? {
                kind: "update",
                latest,
                url: String(row?.url || ""),
              }
            : {
                kind: "ok",
              },
        );
      })
      .catch(() => {
        if (live)
          setRelease({
            kind: "none",
          });
      });
    return () => {
      live = false;
    };
  }, []);
  return (
    <div className="settings-stack">
      <div className="about-hero">
        <DockitMark className="dockit-mark about-mark" />
        <p className="about-name">Dockit</p>
        {release?.kind === "ok" || release?.kind === "update" ? (
          <a
            href="https://buymeacoffee.com/rapha57"
            target="_blank"
            rel="noopener noreferrer"
            className="about-coffee"
          >
            <BmcMark className="about-bmc" />
            {t("about.coffee")}
          </a>
        ) : null}
      </div>
      <div className="settings-card">
        <dl className="about-dl">
          <dt>{t("about.created")}</dt>
          <dd>{t("about.createdOn")}</dd>
          <dt>{t("about.build")}</dt>
          <dd className="about-build">
            {PORTAL_VERSION}
            {release?.kind === "ok" ? (
              <span className="about-build-badge">{t("about.upToDate")}</span>
            ) : release?.kind === "update" ? (
              <a
                className="about-build-badge is-update"
                href={release.url}
                target="_blank"
                rel="noopener noreferrer"
                title={t("about.openVersion", {
                  v: release.latest,
                })}
              >
                {t("about.update", {
                  v: release.latest,
                })}
              </a>
            ) : release?.kind === "offline" ? (
              <span className="about-build-badge is-offline">{t("about.offline")}</span>
            ) : null}
          </dd>
        </dl>
      </div>
      <div className="settings-card">
        <p className="settings-kicker">{t("about.tech")}</p>
        <dl className="about-dl">
          <dt>{t("about.stackApp")}</dt>
          <dd>React 19 · TanStack Start · Vite · Nitro</dd>
          <dt>{t("about.stackUi")}</dt>
          <dd>Tailwind CSS · Lucide</dd>
          <dt>{t("about.stackData")}</dt>
          <dd>Zod</dd>
          <dt>{t("about.license")}</dt>
          <dd>
            <a
              href="https://opensource.org/licenses/MIT"
              target="_blank"
              rel="noopener noreferrer"
            >
              MIT
            </a>
          </dd>
          <dt>{t("about.source")}</dt>
          <dd>
            <a
              href="https://github.com/rapha57/dockit"
              target="_blank"
              rel="noopener noreferrer"
            >
              github.com/rapha57/dockit
            </a>
          </dd>
        </dl>
      </div>
    </div>
  );
}
export function SettingsForm({
  initial,
  embedded,
  onCancel,
  onSave,
}: {
  initial: PortalSettings;
  busy: boolean;
  embedded?: boolean;
  onCancel: () => void;
  onSave: (payload: SettingsPayload) => void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [subtitle, setSubtitle] = useState(initial.subtitle);
  const [logo, setLogo] = useState(initial.logo || "");
  const [documentTitle, setDocumentTitle] = useState(initial.documentTitle || "Dockit");
  const [favicon, setFavicon] = useState(initial.favicon || "");
  async function applyLogo(next: string) {
    setLogo(next);
    if (!next) {
      setFavicon("");
      return;
    }
    try {
      setFavicon(await toFaviconDataUrl(next));
    } catch {
      setFavicon(next);
    }
  }
  return (
    <form
      id="settings-form"
      className="settings-stack"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          ...settingsBase(initial),
          title: title.trim() || "Dockit",
          subtitle: subtitle.trim(),
          logo,
          documentTitle: documentTitle.trim() || "Dockit",
          favicon,
        });
      }}
    >
      {!embedded && (
        <div className="mb-4 flex items-center justify-between">
          <h3 className="dialog-title">{t("settings.portalParams")}</h3>
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
      )}
      <div className="settings-card">
        <p className="settings-kicker">{t("settings.brand")}</p>
        <div className="brand-row">
          <BrandPick
            label={t("settings.logo")}
            hint={t("settings.logoHint")}
            resetLabel={t("settings.resetLogo")}
            accept="image/png,image/svg+xml,image/webp,image/jpeg"
            src={logo}
            onFile={async (file) => {
              await applyLogo(await fileToDataUrl(file));
            }}
            onReset={() => void applyLogo("")}
          >
            {logo ? (
              <img src={logo} alt="" className="brand-preview-img" />
            ) : (
              <DockitMark className="dockit-mark brand-mark" />
            )}
          </BrandPick>
          <BrandPick
            label={t("settings.favicon")}
            hint={t("settings.faviconHint")}
            resetLabel={t("settings.resetFavicon")}
            accept="image/png,image/svg+xml,image/webp,image/jpeg,image/x-icon,image/vnd.microsoft.icon,.ico"
            src={favicon}
            variant="tab"
            onFile={async (file) => {
              setFavicon(await toFaviconDataUrl(await fileToDataUrl(file)));
            }}
            onReset={() => setFavicon("")}
          >
            {favicon ? (
              <img key="ico" src={favicon} alt="" className="brand-tab-ico" />
            ) : logo ? (
              <img key="ico" src={logo} alt="" className="brand-tab-ico" />
            ) : (
              <DockitMark key="ico" className="dockit-mark brand-tab-ico" />
            )}
            <span key="title" className="brand-tab-title">
              {documentTitle.trim() || "Dockit"}
            </span>
          </BrandPick>
        </div>
        <p className="settings-hint">{t("settings.brandClick")}</p>
      </div>
      <div className="settings-card">
        <p className="settings-kicker">{t("settings.texts")}</p>
        <div className="field-row">
          <Field label={t("settings.portalName")}>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </Field>
          <Field label={t("settings.subtitle")}>
            <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
          </Field>
        </div>
        <Field label={t("settings.documentTitle")}>
          <Input
            value={documentTitle}
            onChange={(e) => setDocumentTitle(e.target.value)}
            placeholder="Dockit"
          />
        </Field>
      </div>
    </form>
  );
}
export function TimeZoneField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const groups = useMemo(() => listTimeZones(), []);
  return (
    <Field label={t("lang.timezone")}>
      <Select value={value} onChange={(e) => onChange(asTimeZone(e.target.value))}>
        <option value="">{t("lang.timezoneLocal")}</option>
        {groups.map((g) => (
          <optgroup key={g.region} label={g.region === "Other" ? t("lang.tzOther") : g.region}>
            {g.zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.label}
              </option>
            ))}
          </optgroup>
        ))}
      </Select>
      <p className="settings-hint">{t("lang.timezoneHint")}</p>
    </Field>
  );
}
const REGIONS: {
  id: string;
  labelKey: string;
  locale: "en" | "fr";
  dateFormat: "ymd" | "yyyy" | "dmy" | "mdy" | "iso";
  timeFormat: "24h" | "12h";
  numberFormat: "auto" | "space-comma" | "comma-dot" | "dot-comma" | "apostrophe-comma";
}[] = [
  { id: "en-US", labelKey: "lang.regionEnUs", locale: "en", dateFormat: "mdy", timeFormat: "12h", numberFormat: "comma-dot" },
  { id: "en-GB", labelKey: "lang.regionEnGb", locale: "en", dateFormat: "dmy", timeFormat: "24h", numberFormat: "comma-dot" },
  { id: "fr-FR", labelKey: "lang.regionFrFr", locale: "fr", dateFormat: "dmy", timeFormat: "24h", numberFormat: "space-comma" },
  { id: "fr-CH", labelKey: "lang.regionFrCh", locale: "fr", dateFormat: "dmy", timeFormat: "24h", numberFormat: "apostrophe-comma" },
  { id: "fr-BE", labelKey: "lang.regionFrBe", locale: "fr", dateFormat: "dmy", timeFormat: "24h", numberFormat: "dot-comma" },
  { id: "fr-LU", labelKey: "lang.regionFrLu", locale: "fr", dateFormat: "dmy", timeFormat: "24h", numberFormat: "space-comma" },
];
export function LocalesForm({
  initial,
  onSave,
}: {
  initial: PortalSettings;
  onSave: (payload: SettingsPayload) => void;
}) {
  const [locale, setLocaleDraft] = useState(asLocale(initial.locale));
  const [dateFormat, setDateDraft] = useState(asDateFormat(initial.dateFormat));
  const [timeFormat, setTimeDraft] = useState(asTimeFormat(initial.timeFormat));
  const [timezone, setZoneDraft] = useState(asTimeZone(initial.timezone));
  const [numberFormat, setNumberDraft] = useState(asNumberFormat(initial.numberFormat));
  const regionId = useMemo(() => {
    const loc = asLocale(locale);
    const date = asDateFormat(dateFormat);
    const time = asTimeFormat(timeFormat);
    const num = asNumberFormat(numberFormat);
    const sameCore = (r: (typeof REGIONS)[number]) =>
      r.locale === loc && r.dateFormat === date && r.timeFormat === time;
    if (num !== "auto") return REGIONS.find((r) => sameCore(r) && r.numberFormat === num)?.id ?? null;
    return REGIONS.find(sameCore)?.id ?? null;
  }, [locale, dateFormat, timeFormat, numberFormat]);
  const sample = formatWhen(new Date(), true, {
    dateFormat,
    timeFormat,
    timezone,
  });
  const currentRegion = regionId ?? "custom";
  return (
    <form
      id="settings-form"
      className="settings-stack locales-stack"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          ...settingsBase(initial),
          locale: asLocale(locale),
          dateFormat: asDateFormat(dateFormat),
          timeFormat: asTimeFormat(timeFormat),
          timezone: asTimeZone(timezone),
          numberFormat: asNumberFormat(numberFormat),
        });
      }}
    >
      <div className="settings-card">
        <p className="settings-kicker">{t("lang.sectionRegion")}</p>
        <Field label={t("lang.region")}>
          <Select
            value={currentRegion}
            onChange={(e) => {
              const reg = REGIONS.find((r) => r.id === e.target.value);
              if (reg) {
                setLocaleDraft(reg.locale);
                setDateDraft(reg.dateFormat);
                setTimeDraft(reg.timeFormat);
                setNumberDraft(reg.numberFormat);
              }
            }}
          >
            {REGIONS.map((r) => (
              <option key={r.id} value={r.id}>
                {t(r.labelKey)}
              </option>
            ))}
            <option value="custom">{t("lang.regionCustom")}</option>
          </Select>
          <p className="settings-hint">{t("lang.regionHint")}</p>
        </Field>
        <Field label={t("lang.label")}>
          <Select value={locale} onChange={(e) => { setLocaleDraft(asLocale(e.target.value)); }}>
            <option value="en">{t("lang.en")}</option>
            <option value="fr">{t("lang.fr")}</option>
          </Select>
          <p className="settings-hint">{t("lang.hint")}</p>
        </Field>
      </div>
      <div className="settings-card">
        <p className="settings-kicker">{t("lang.sectionFormat")}</p>
        <div className="field-row">
          <Field label={t("lang.dateFormat")}>
            <Select value={dateFormat} onChange={(e) => { setDateDraft(asDateFormat(e.target.value)); }}>
              <option value="ymd">{t("lang.dateYmd")}</option>
              <option value="yyyy">{t("lang.dateYyyy")}</option>
              <option value="dmy">{t("lang.dateDmy")}</option>
              <option value="mdy">{t("lang.dateMdy")}</option>
              <option value="iso">{t("lang.dateIso")}</option>
            </Select>
            <p className="settings-hint">{t("lang.dateHint")}</p>
          </Field>
          <Field label={t("lang.timeFormat")}>
            <Select value={timeFormat} onChange={(e) => { setTimeDraft(asTimeFormat(e.target.value)); }}>
              <option value="24h">{t("lang.time24")}</option>
              <option value="12h">{t("lang.time12")}</option>
            </Select>
            <p className="settings-hint">{t("lang.timeHint")}</p>
          </Field>
        </div>
        <TimeZoneField value={timezone} onChange={setZoneDraft} />
      </div>
      <div className="settings-card">
        <p className="settings-kicker">{t("lang.sectionNumbers")}</p>
        <Field label={t("lang.numberFormat")}>
          <Select
            value={numberFormat}
            onChange={(e) => { setNumberDraft(asNumberFormat(e.target.value)); }}
          >
            <option value="auto">{t("lang.numberAuto")}</option>
            <option value="space-comma">{t("lang.numberSpaceComma")}</option>
            <option value="comma-dot">{t("lang.numberCommaDot")}</option>
            <option value="dot-comma">{t("lang.numberDotComma")}</option>
            <option value="apostrophe-comma">{t("lang.numberApostropheComma")}</option>
          </Select>
          <p className="settings-hint">{t("lang.numberHint")}</p>
        </Field>
      </div>
      <div className="settings-card">
        <p className="settings-kicker">{t("lang.sectionSample")}</p>
        <div className="lang-sample" aria-hidden>
          <span className="lang-sample-row">
            <span className="lang-sample-label">{t("lang.sampleDate")}</span>
            <span className="lang-sample-value">{sample}</span>
          </span>
          <span className="lang-sample-row">
            <span className="lang-sample-label">{t("lang.sampleNumbers")}</span>
            <span className="lang-sample-value">{formatNumber(1234567.89, numberFormat)}</span>
          </span>
        </div>
      </div>
    </form>
  );
}
export function BackupForm({
  token,
  busy,
  catalog,
  title,
  onImport,
}: {
  token: string;
  busy: boolean;
  catalog: CatalogSpace[];
  title: string;
  onImport: (payload: unknown) => void;
}) {
  const [pending, setPending] = useState(false);
  const working = busy || pending;
  async function doExport() {
    setPending(true);
    try {
      const payload = await exportPortal({
        data: {
          token,
        },
      });
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dockit-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(t("backup.downloaded"));
    } catch (err) {
      toast.error(te(err));
    } finally {
      setPending(false);
    }
  }
  async function doImport(file: File) {
    if (!file) return;
    if (file.size > 5e6) {
      toast.error(t("backup.fileTooBig"));
      return;
    }
    if (
      !(await askConfirm({
        title: t("actions.importJson"),
        body: t("confirm.importPortal"),
        okLabel: t("actions.importJson"),
      }))
    )
      return;
    setPending(true);
    try {
      const text = await file.text();
      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error("errors.badBackup");
      }
      await onImport(payload);
    } catch (err) {
      toast.error(te(err));
    } finally {
      setPending(false);
    }
  }
  function inventoryRows() {
    return collectInventory(catalog);
  }
  function downloadCsv() {
    const rows = inventoryRows();
    const blob = new Blob([inventoryCsv(rows)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${t("inventory.fileName")}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(t("backup.csvDownloaded"));
  }
  function downloadPdf() {
    try {
      const blob = new Blob([inventoryPdf(inventoryRows(), title || "Dockit") as BlobPart], {
        type: "application/pdf",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${t("inventory.fileName")}-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(t("backup.pdfDownloaded"));
    } catch (err) {
      toast.error(te(err));
    }
  }
  return (
    <div className="settings-stack">
      <div className="settings-card">
        <p className="settings-kicker">{t("backup.portal")}</p>
        <p className="settings-hint">{t("backup.importHint")}</p>
        <div className="settings-actions is-start">
          <button
            type="button"
            className="am-create"
            disabled={working}
            onClick={() => void doExport()}
          >
            <Download className="size-3.5" />
            {t("actions.exportJson")}
          </button>
          <label className={`settings-file ${working ? "is-disabled" : ""}`}>
            <Upload className="size-3.5" />
            {t("actions.importJson")}
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              disabled={working}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void doImport(file);
              }}
            />
          </label>
        </div>
      </div>
      <div className="settings-card">
        <p className="settings-kicker">{t("backup.inventory")}</p>
        <p className="settings-hint">{t("backup.inventoryHint")}</p>
        <div className="settings-actions is-start">
          <button
            type="button"
            className="am-create"
            disabled={working}
            onClick={downloadCsv}
          >
            <Download className="size-3.5" />
            {t("actions.exportCsv")}
          </button>
          <button
            type="button"
            className="am-create"
            disabled={working}
            onClick={downloadPdf}
          >
            <FileText className="size-3.5" />
            {t("actions.exportPdf")}
          </button>
        </div>
      </div>
    </div>
  );
}
export function PresentationForm({
  initial,
  onSave,
}: {
  initial: PortalSettings;
  onSave: (payload: SettingsPayload) => void;
}) {
  const [usageStats, setUsageStats] = useState(initial.usageStats !== false);
  const [favNotes, setFavNotes] = useState(Boolean(initial.favNotes));
  const [favEmbeds, setFavEmbeds] = useState(Boolean(initial.favEmbeds));
  const [onlineIcons, setOnlineIcons] = useState(Boolean(initial.onlineIcons));
  const [navRichIcons, setNavRichIcons] = useState(Boolean(initial.navRichIcons));
  const [annexFade, setAnnexFade] = useState(Boolean(initial.annexFade));
  const [catCounts, setCatCounts] = useState(Boolean(initial.catCounts));
  const [cardResize, setCardResize] = useState(initial.cardResize !== false);
  const [cardContextMenu, setCardContextMenu] = useState(initial.cardContextMenu !== false);
  const [cardDragCollapse, setCardDragCollapse] = useState(initial.cardDragCollapse !== false);
  const [ctxHideUrl, setCtxHideUrl] = useState(Boolean(initial.ctxHideUrl));
  const [cardIconBg, setCardIconBg] = useState(initial.cardIconBg !== false);
  const [infoBar, setInfoBar] = useState(initial.infoBar !== false);
  return (
    <form
      id="settings-form"
      className="settings-stack"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          ...settingsBase(initial),
          usageStats,
          favNotes,
          favEmbeds,
          onlineIcons,
          navRichIcons,
          annexFade,
          catCounts,
          cardResize,
          cardContextMenu,
          cardDragCollapse,
          ctxHideUrl,
          cardIconBg,
          infoBar,
        });
      }}
    >
      <div className="settings-card">
        <p className="settings-kicker">{t("history.cards")}</p>
        <div className="settings-toggles">
          <label>
            <input
              type="checkbox"
              checked={usageStats}
              onChange={(e) => setUsageStats(e.target.checked)}
            />
            {t("pres.clickCount")}
          </label>
          <p className="settings-hint">{t("pres.clickCountHint")}</p>
          <label>
            <input
              type="checkbox"
              checked={catCounts}
              onChange={(e) => setCatCounts(e.target.checked)}
            />
            {t("pres.catCounts")}
          </label>
          <p className="settings-hint">{t("pres.catCountsHint")}</p>
          <label>
            <input
              type="checkbox"
              checked={favEmbeds}
              onChange={(e) => setFavEmbeds(e.target.checked)}
            />
            {t("pres.favEmbeds")}
          </label>
          <p className="settings-hint">{t("pres.favEmbedsHint")}</p>
          <label>
            <input
              type="checkbox"
              checked={favNotes}
              onChange={(e) => setFavNotes(e.target.checked)}
            />
            {t("pres.favNotes")}
          </label>
          <p className="settings-hint">{t("pres.favNotesHint")}</p>
          <label>
            <input
              type="checkbox"
              checked={cardResize}
              onChange={(e) => setCardResize(e.target.checked)}
            />
            {t("pres.cardResize")}
          </label>
          <p className="settings-hint">{t("pres.cardResizeHint")}</p>
          <label>
            <input
              type="checkbox"
              checked={cardIconBg}
              onChange={(e) => setCardIconBg(e.target.checked)}
            />
            {t("pres.cardIconBg")}
          </label>
          <p className="settings-hint">{t("pres.cardIconBgHint")}</p>
          <label>
            <input
              type="checkbox"
              checked={cardContextMenu}
              onChange={(e) => setCardContextMenu(e.target.checked)}
            />
            {t("pres.cardContextMenu")}
          </label>
          <p className="settings-hint">{t("pres.cardContextMenuHint")}</p>
          <label>
            <input
              type="checkbox"
              checked={cardDragCollapse}
              onChange={(e) => setCardDragCollapse(e.target.checked)}
            />
            {t("pres.cardDragCollapse")}
          </label>
          <p className="settings-hint">{t("pres.cardDragCollapseHint")}</p>
        </div>
      </div>
      <div className="settings-card">
        <p className="settings-kicker">{t("pres.icons")}</p>
        <div className="settings-toggles">
          <label>
            <input
              type="checkbox"
              checked={onlineIcons}
              onChange={(e) => setOnlineIcons(e.target.checked)}
            />
            {t("pres.onlineIcons")}
          </label>
          <p className="settings-hint">{t("pres.onlineIconsHint")}</p>
          <label>
            <input
              type="checkbox"
              checked={navRichIcons}
              onChange={(e) => setNavRichIcons(e.target.checked)}
            />
            {t("pres.navRichIcons")}
          </label>
          <p className="settings-hint">{t("pres.navRichIconsHint")}</p>
        </div>
      </div>
      <div className="settings-card">
        <p className="settings-kicker">{t("pres.menus")}</p>
        <div className="settings-toggles">
          <label>
            <input
              type="checkbox"
              checked={annexFade}
              onChange={(e) => setAnnexFade(e.target.checked)}
            />
            {t("pres.annexFade")}
          </label>
          <p className="settings-hint">{t("pres.annexFadeHint")}</p>
          <label>
            <input
              type="checkbox"
              checked={ctxHideUrl}
              onChange={(e) => setCtxHideUrl(e.target.checked)}
            />
            {t("pres.ctxHideUrl")}
          </label>
          <p className="settings-hint">{t("pres.ctxHideUrlHint")}</p>
        </div>
      </div>
      <div className="settings-card">
        <p className="settings-kicker">{t("pres.infoBar")}</p>
        <div className="settings-toggles">
          <label>
            <input
              type="checkbox"
              checked={infoBar}
              onChange={(e) => setInfoBar(e.target.checked)}
            />
            {t("pres.showInfoBar")}
          </label>
          <p className="settings-hint">{t("pres.showInfoBarHint")}</p>
        </div>
      </div>
    </form>
  );
}
export function ReachabilityForm({
  initial,
  onSave,
}: {
  initial: PortalSettings;
  onSave: (payload: SettingsPayload) => void;
}) {
  const [healthChecks, setHealthChecks] = useState(initial.healthChecks !== false);
  const [probeBlink, setProbeBlink] = useState(Boolean(initial.probeBlink));
  const infoBar = initial.infoBar !== false;
  return (
    <form
      id="settings-form"
      className="settings-stack"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          ...settingsBase(initial),
          healthChecks,
          probeBlink,
        });
      }}
    >
      <div className="settings-card">
        <p className="settings-kicker">{t("reach.probes")}</p>
        <div className="settings-toggles">
          <label>
            <input
              type="checkbox"
              checked={healthChecks}
              onChange={(e) => setHealthChecks(e.target.checked)}
            />
            {t("reach.httpIcmp")}
          </label>
          <p className="settings-hint">{t("reach.perCard")}</p>
          <label className={`is-child ${infoBar && healthChecks ? "" : "is-disabled"}`}>
            <input
              type="checkbox"
              checked={probeBlink}
              disabled={!infoBar || !healthChecks}
              onChange={(e) => setProbeBlink(e.target.checked)}
            />
            {t("reach.blink")}
          </label>
          <p className="settings-hint">{t("reach.blinkHint")}</p>
          {!infoBar ? <p className="settings-hint">{t("reach.infoHidden")}</p> : null}
        </div>
      </div>
    </form>
  );
}
export function SecurityForm({
  initial,
  onSave,
}: {
  initial: PortalSettings;
  onSave: (payload: SettingsPayload) => void;
}) {
  const [probeTlsVerify, setProbeTlsVerify] = useState(Boolean(initial.probeTlsVerify));
  const [probeAuthOnly, setProbeAuthOnly] = useState(Boolean(initial.probeAuthOnly));
  const [sessionHttpOnly, setSessionHttpOnly] = useState(Boolean(initial.sessionHttpOnly));
  const [proxyAuthEnabled, setProxyAuthEnabled] = useState(Boolean(initial.proxyAuthEnabled));
  const [proxyAuthHeader, setProxyAuthHeader] = useState(initial.proxyAuthHeader || "X-Remote-User");
  return (
    <form
      id="settings-form"
      className="settings-stack"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          ...settingsBase(initial),
          probeTlsVerify,
          probeAuthOnly,
          sessionHttpOnly,
          proxyAuthEnabled,
          proxyAuthHeader: proxyAuthHeader.trim().slice(0, 64),
        });
      }}
    >
      <div className="settings-card">
        <p className="settings-kicker">{t("reach.probes")}</p>
        <div className="settings-toggles">
          <label>
            <input
              type="checkbox"
              checked={probeTlsVerify}
              onChange={(e) => setProbeTlsVerify(e.target.checked)}
            />
            {t("sec.tls")}
          </label>
          <p className="settings-hint">{t("sec.tlsHint")}</p>
          <label>
            <input
              type="checkbox"
              checked={probeAuthOnly}
              onChange={(e) => setProbeAuthOnly(e.target.checked)}
            />
            {t("sec.authOnly")}
          </label>
          <p className="settings-hint">{t("sec.authOnlyHint")}</p>
        </div>
      </div>
      <div className="settings-card">
        <p className="settings-kicker">{t("sec.session")}</p>
        <div className="settings-toggles">
          <label>
            <input
              type="checkbox"
              checked={sessionHttpOnly}
              onChange={(e) => setSessionHttpOnly(e.target.checked)}
            />
            {t("sec.httpOnly")}
          </label>
          <p className="settings-hint">{t("sec.httpOnlyHint")}</p>
        </div>
      </div>

      <div className="settings-card">
        <p className="settings-kicker">{t("sec.proxyAuth")}</p>
        <div className="settings-toggles">
          <label>
            <input
              type="checkbox"
              checked={proxyAuthEnabled}
              onChange={(e) => setProxyAuthEnabled(e.target.checked)}
            />
            {t("sec.proxyAuthOn")}
          </label>
          <p className="settings-hint">{t("sec.proxyAuthHint")}</p>
        </div>
        <Field
          className={`is-child ${proxyAuthEnabled ? "" : "is-disabled"}`}
          label={t("sec.proxyAuthHeader")}
        >
          <Input
            value={proxyAuthHeader}
            disabled={!proxyAuthEnabled}
            placeholder="X-Remote-User"
            onChange={(e) => setProxyAuthHeader(e.target.value)}
          />
        </Field>
      </div>
    </form>
  );
}
export function DebugPanel({
  settings,
  runtime,
  session,
  busy,
  onSave,
}: {
  settings: PortalSettings;
  runtime?: PortalData["runtime"];
  session: SessionInfo | null;
  busy: boolean;
  onSave: (payload: SettingsPayload) => void;
}) {
  const s = settings || ({} as PortalSettings);
  const r =
    runtime ||
    ({
      isDev: false,
      publicOrigin: "",
      trustProxy: false,
    } as NonNullable<PortalData["runtime"]>);
  const rows = [
    r.isDev
      ? {
          level: "warn",
          title: t("debug.devTitle"),
          detail: t("debug.devDetail"),
        }
      : {
          level: "ok",
          title: t("debug.prodTitle"),
          detail: t("debug.prodDetail"),
        },
    session?.mustChangePassword
      ? {
          level: "error",
          title: t("debug.weakTitle"),
          detail: t("debug.weakDetail"),
        }
      : null,
    r.isDev && s.devAdminNoPassword
      ? {
          level: "error",
          title: t("debug.noPwTitle"),
          detail: t("debug.noPwDetail"),
        }
      : null,
    s.oidcEnabled && !r.publicOrigin
      ? {
          level: "warn",
          title: t("debug.oidcOriginTitle"),
          detail: t("debug.oidcOriginDetail"),
        }
      : null,
    s.oidcEnabled && !r.trustProxy
      ? {
          level: "warn",
          title: t("debug.proxyTitle"),
          detail: t("debug.proxyDetail"),
        }
      : null,
    s.oidcAutoCreate
      ? {
          level: "warn",
          title: t("debug.autoCreateTitle"),
          detail: t("debug.autoCreateDetail"),
        }
      : null,
    (Array.isArray(s.ldapDirectories) ? s.ldapDirectories : []).some(
      (d) => d.enabled && d.tls === false,
    ) ||
    (s.ldapEnabled && s.ldapTls === false)
      ? {
          level: "warn",
          title: t("debug.ldapTlsTitle"),
          detail: t("debug.ldapTlsDetail"),
        }
      : null,
    (Array.isArray(s.ldapDirectories) ? s.ldapDirectories : []).some(
      (d) => d.enabled && d.autoCreate,
    ) || s.ldapAutoCreate
      ? {
          level: "warn",
          title: t("debug.ldapAutoTitle"),
          detail: t("debug.ldapAutoDetail"),
        }
      : null,
    !s.sessionHttpOnly
      ? {
          level: "info",
          title: t("debug.tokenTitle"),
          detail: t("debug.tokenDetail"),
        }
      : {
          level: "ok",
          title: t("debug.cookieTitle"),
          detail: t("debug.cookieDetail"),
        },
    s.healthChecks !== false && !s.probeTlsVerify
      ? {
          level: "info",
          title: t("debug.tlsTitle"),
          detail: t("debug.tlsDetail"),
        }
      : null,
    s.healthChecks !== false && !s.probeAuthOnly
      ? {
          level: "info",
          title: t("debug.publicTitle"),
          detail: t("debug.publicDetail"),
        }
      : null,
  ].filter((row): row is { level: string; title: string; detail: string } => row !== null);
  return (
    <div className="settings-stack">
      <div className="settings-card">
        <p className="settings-kicker">{t("debug.checks")}</p>
        <p className="settings-hint">{t("debug.intro")}</p>
        {rows.map((row) => (
        <div key={row.title} className={`debug-row is-${row.level}`}>
          <span className="debug-level">
            {row.level === "error"
              ? t("debug.critical")
              : row.level === "warn"
                ? t("debug.warn")
                : row.level === "ok"
                  ? t("debug.ok")
                  : t("debug.info")}
          </span>
          <div>
            <p className="debug-title">{row.title}</p>
            <p className="settings-hint">{row.detail}</p>
          </div>
        </div>
        ))}
      </div>

      <div className="settings-card">
        <p className="settings-kicker">{t("sec.dev")}</p>
        <div className="settings-toggles">
          <label className={runtime?.isDev ? "" : "is-disabled"}>
            <input
              type="checkbox"
              checked={Boolean(s.devAdminNoPassword)}
              disabled={!runtime?.isDev || busy}
              onChange={(e) =>
                onSave({ ...settingsBase(s), devAdminNoPassword: e.target.checked })
              }
            />
            {t("sec.noPassword")}
          </label>
          <p className="settings-hint">
            {runtime?.isDev ? t("sec.noPasswordHintDev") : t("sec.noPasswordHintProd")}
          </p>
        </div>
      </div>
    </div>
  );
}
export function InfoBarForm({
  initial,
  onSave,
}: {
  initial: PortalSettings;
  onSave: (payload: SettingsPayload) => void;
}) {
  const [infoStats, setInfoStats] = useState(initial.infoStats !== false);
  const [infoLegend, setInfoLegend] = useState(Boolean(initial.infoLegend));
  const infoBar = initial.infoBar !== false;
  return (
    <form
      id="settings-form"
      className="settings-stack"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          ...settingsBase(initial),
          infoStats,
          infoLegend,
        });
      }}
    >
      <div className="settings-card">
        <p className="settings-kicker">{t("stats.title")}</p>
        <div className="settings-toggles">
          <label className={infoBar ? "" : "is-disabled"}>
            <input
              type="checkbox"
              checked={infoStats}
              disabled={!infoBar}
              onChange={(e) => setInfoStats(e.target.checked)}
            />
            {t("info.statsIcon")}
          </label>
          <p className="settings-hint">{infoBar ? t("info.statsHint") : t("info.statsHintHidden")}</p>
        </div>
      </div>
      <div className="settings-card">
        <p className="settings-kicker">{t("legend.title")}</p>
        <div className="settings-toggles">
          <label className={infoBar ? "" : "is-disabled"}>
            <input
              type="checkbox"
              checked={infoLegend}
              disabled={!infoBar}
              onChange={(e) => setInfoLegend(e.target.checked)}
            />
            {t("info.legendIcon")}
          </label>
          <p className="settings-hint">{infoBar ? t("info.legendHint") : t("info.statsHintHidden")}</p>
        </div>
      </div>
    </form>
  );
}
type ThemeColors = { bg: string; surface: string; header: string };
const THEME_COLOR_FIELDS: { id: keyof ThemeColors; cssVar: string }[] = [
  {
    id: "bg",
    cssVar: "--color-bg",
  },
  {
    id: "surface",
    cssVar: "--color-surface",
  },
  {
    id: "header",
    cssVar: "--color-header",
  },
];
const LIGHT_COLORS = {
  bg: "#fcfcfd",
  surface: "#ffffff",
  header: "#fcfcfc",
};
const DARK_COLORS = {
  bg: "#0e1116",
  surface: "#171b22",
  header: "#12151b",
};
const MANAGED_BLOCK_RE =
  /html\.(?:light|dark)\s*\{\s*(?:--color-(?:bg|surface|header)\s*:\s*#[0-9a-fA-F]{3,8}\s*;\s*)+\}/g;
export function expandHex(raw: string) {
  const s = raw.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s))
    return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase();
  return null;
}
export function hexLuma(raw: unknown) {
  const hex = expandHex(String(raw || ""));
  if (!hex) return 1;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function parseThemeCss(css: string, fallback: ThemeColors) {
  const colors = {
    ...fallback,
  };
  for (const field of THEME_COLOR_FIELDS) {
    const re = new RegExp(`${field.cssVar.replace(/-/g, "\\-")}\\s*:\\s*(#[0-9a-fA-F]{3,8})`, "g");
    let match;
    let last = null;
    while ((match = re.exec(css))) last = match[1];
    const hex = last ? expandHex(last) : null;
    if (hex) colors[field.id] = hex;
  }
  return {
    colors,
    extra: css.replace(MANAGED_BLOCK_RE, "").trim(),
  };
}
export function composeThemeCss(mode: string, colors: ThemeColors, extra: string) {
  const block = `html.${mode} {\n  --color-bg: ${colors.bg};\n  --color-surface: ${colors.surface};\n  --color-header: ${colors.header};\n}`;
  const rest = extra.trim();
  return rest ? `${rest}\n${block}\n` : `${block}\n`;
}
export function ThemeColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="theme-chip">
      <span>{label}</span>
      <span
        className={`theme-hex${hexLuma(value) < 0.55 ? " is-dark" : ""}`}
        style={{
          background: value,
        }}
      >
        <input
          type="color"
          value={value}
          aria-label={`${label} (hex ${value})`}
          title={value}
          onChange={(e) => onChange(e.target.value.toLowerCase())}
        />
        <span className="theme-hex-code">{value}</span>
      </span>
    </label>
  );
}
export function ThemeForm({
  initial,
  onSave,
}: {
  initial: PortalSettings;
  busy: boolean;
  onCancel: () => void;
  onSave: (payload: { cssLight: string; cssDark: string }) => void;
}) {
  const { theme, apply } = useTheme();
  const [pane, setPane] = useState(theme);
  const lightParsed = parseThemeCss(initial.cssLight || "", LIGHT_COLORS);
  const darkParsed = parseThemeCss(initial.cssDark || "", DARK_COLORS);
  const [lightColors, setLightColors] = useState(lightParsed.colors);
  const [darkColors, setDarkColors] = useState(darkParsed.colors);
  const [lightExtra, setLightExtra] = useState(lightParsed.extra);
  const [darkExtra, setDarkExtra] = useState(darkParsed.extra);
  const colors = pane === "light" ? lightColors : darkColors;
  const setColors = pane === "light" ? setLightColors : setDarkColors;
  const extra = pane === "light" ? lightExtra : darkExtra;
  const setExtra = pane === "light" ? setLightExtra : setDarkExtra;
  useEffect(() => {
    const el = document.createElement("style");
    el.id = "portal-user-theme-draft";
    document.head.appendChild(el);
    return () => {
      el.remove();
    };
  }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const el = document.getElementById("portal-user-theme-draft");
      if (!el) return;
      const css =
        theme === "dark"
          ? composeThemeCss("dark", darkColors, darkExtra)
          : composeThemeCss("light", lightColors, lightExtra);
      el.textContent = sanitizeThemeCss(css);
    });
    return () => cancelAnimationFrame(frame);
  }, [theme, lightColors, darkColors, lightExtra, darkExtra]);
  return (
    <form
      id="settings-form"
      className="settings-stack theme-stack"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          cssLight: composeThemeCss("light", lightColors, lightExtra),
          cssDark: composeThemeCss("dark", darkColors, darkExtra),
        });
      }}
    >
      <div className="settings-card">
        <p className="settings-kicker">{t("theme.colors")}</p>
        <div className="am-filters" role="tablist" aria-label={t("theme.colors")}>
          <button
            type="button"
            role="tab"
            aria-selected={pane === "light"}
            className={pane === "light" ? "is-on" : ""}
            onClick={() => {
              setPane("light");
              apply("light");
            }}
          >
            {t("theme.light")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={pane === "dark"}
            className={pane === "dark" ? "is-on" : ""}
            onClick={() => {
              setPane("dark");
              apply("dark");
            }}
          >
            {t("theme.dark")}
          </button>
        </div>
        <div className="theme-palette">
          {THEME_COLOR_FIELDS.map((field) => (
            <ThemeColorField
              key={field.id}
              label={t(`theme.${field.id}`)}
              value={colors[field.id]}
              onChange={(next) =>
                setColors((prev) => ({
                  ...prev,
                  [field.id]: next,
                }))
              }
            />
          ))}
        </div>
        <div className="theme-css-meta">
          <span />
          <button
            type="button"
            className="settings-link"
            onClick={() => setColors({ ...(pane === "light" ? LIGHT_COLORS : DARK_COLORS) })}
          >
            {t("theme.resetColors")}
          </button>
        </div>
      </div>
      <div className="settings-card">
        <p className="settings-kicker">{t("theme.css")}</p>
        <textarea
          className="field-input theme-extra-css w-full resize-y rounded-lg border border-border bg-transparent p-2.5 font-mono leading-relaxed text-fg outline-none placeholder:text-subtle"
          value={extra}
          spellCheck={false}
          maxLength={CSS_MAX}
          placeholder={t("theme.cssHint")}
          onChange={(e) => setExtra(e.target.value)}
        />
        <div className="theme-css-meta">
          <span>
            {extra.length.toLocaleString(localeTag())} / {CSS_MAX.toLocaleString(localeTag())}
          </span>
          <button
            type="button"
            className="settings-link"
            onClick={() => {
              setExtra("");
            }}
          >
            {t("theme.reset")}
          </button>
        </div>
      </div>
    </form>
  );
}
export function TagColorPick({
  hex,
  name,
  disabled,
  onChange,
}: {
  hex: string;
  name: string;
  disabled?: boolean;
  onChange: (hex: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({
    top: 0,
    left: 0,
  });
  const current = remapTagHex(hex);
  const ink = tagInk(current);
  function place() {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = 196;
    const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
    const top = r.bottom + 6 + 168 > window.innerHeight ? r.top - 174 : r.bottom + 6;
    setPos({
      top,
      left,
    });
  }
  useEffect(() => {
    if (!open) return;
    place();
    const onDoc = (e: PointerEvent) => {
      if (
        btnRef.current?.contains(e.target as Node) ||
        panelRef.current?.contains(e.target as Node)
      )
        return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <>
      <button
        type="button"
        ref={btnRef}
        className="picker-color-btn"
        disabled={disabled}
        style={
          {
            ["--tag-bg"]: current,
            ["--tag-fg"]: ink,
          } as CSSProperties
        }
        title={t("tags.colorOf", {
          name,
        })}
        aria-label={t("tags.colorOf", {
          name,
        })}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
      />
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panelRef}
              className="tag-palette"
              role="listbox"
              aria-label={t("tags.palette")}
              style={{
                top: pos.top,
                left: pos.left,
              }}
            >
              {TAG_PALETTE.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  role="option"
                  className={`tag-palette-dot${swatch === current ? " is-on" : ""}`}
                  style={
                    {
                      ["--tag-bg"]: swatch,
                      ["--tag-fg"]: tagInk(swatch),
                    } as CSSProperties
                  }
                  aria-selected={swatch === current}
                  aria-label={t("tags.pickColor")}
                  title={swatch}
                  onClick={() => {
                    onChange(swatch);
                    setOpen(false);
                  }}
                />
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
export function TagManager({
  tags,
  colors,
  busy,
  settings,
  pruneOrphanTags,
  tagsAlpha,
  onSave,
  onApply,
}: {
  tags: { name: string; count: number }[];
  colors: Record<string, string>;
  busy: boolean;
  embedded?: boolean;
  settings: PortalSettings;
  pruneOrphanTags: boolean;
  tagsAlpha: boolean;
  onCancel: () => void;
  onSave: (payload: SettingsPayload) => void;
  onApply: (payload: TagsPayload) => void;
}) {
  const [prune, setPrune] = useState(Boolean(pruneOrphanTags));
  const [alpha, setAlpha] = useState(tagsAlpha !== false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [createDraft, setCreateDraft] = useState("");
  const col = useColSort();
  const sortedTags = col.apply(tags, (row, key) => {
    if (key === "name") return row.name || "";
    if (key === "count") return row.count || 0;
    return "";
  });
  const [localColors, setLocalColors] = useState(colors ?? {});
  useEffect(() => {
    setPrune(Boolean(pruneOrphanTags));
  }, [pruneOrphanTags]);
  useEffect(() => {
    setAlpha(tagsAlpha !== false);
  }, [tagsAlpha]);
  useEffect(() => {
    setLocalColors(colors ?? {});
  }, [colors]);
  function createTag() {
    const name = createDraft.trim().slice(0, 32);
    if (!name || busy) return;
    if (tags.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      toast.error(t("tags.exists"));
      return;
    }
    if (tags.length >= 80) {
      toast.error(t("tags.tooMany"));
      return;
    }
    setCreateDraft("");
    onApply({
      create: [name],
    });
  }
  function renameTag(from: string, to: string) {
    const next = String(to || "")
      .trim()
      .slice(0, 32);
    if (!next || next === from || busy) return;
    onApply({
      rename: [
        {
          from,
          to: next,
        },
      ],
    });
  }
  async function removeTag(name: string) {
    if (
      !(await askConfirm({
        title: t("actions.delete"),
        body: t("confirm.deleteTag", { name }),
      }))
    )
      return;
    onApply({
      remove: [name],
    });
  }
  function changeColor(name: string, hex: string) {
    const next = remapTagHex((expandHex(hex) ?? String(hex || "")).toLowerCase());
    if (!/^#[0-9a-f]{6}$/.test(next)) return;
    setLocalColors((cur) => ({
      ...cur,
      [name]: next,
    }));
    onApply({
      colors: {
        [name]: next,
      },
    });
  }
  return (
    <form
      id="settings-form"
      className="settings-stack"
      onSubmit={(e) => {
        e.preventDefault();
        onSave?.({
          ...settingsBase(settings || {}),
          pruneOrphanTags: prune,
          tagsAlpha: alpha,
        });
        toast.success(t("toast.saved"));
      }}
    >
      <div className="settings-card">
        <p className="settings-kicker">{t("tags.memory")}</p>
        <div className="settings-toggles">
          <label>
            <input type="checkbox" checked={prune} onChange={(e) => setPrune(e.target.checked)} />
            {t("tags.prune")}
          </label>
          <p className="settings-hint">{t("tags.pruneHint")}</p>
          <label>
            <input type="checkbox" checked={alpha} onChange={(e) => setAlpha(e.target.checked)} />
            {t("tags.alpha")}
          </label>
          <p className="settings-hint">{t("tags.alphaHint")}</p>
        </div>
      </div>
      <div className="settings-card tag-list-card">
        <p className="settings-kicker">
          {tags.length ? tp("tags.count", tags.length) : t("item.tags")}
        </p>
        <Input
          className={FIELD_SM}
          value={createDraft}
          placeholder={t("tags.newPlaceholder")}
          maxLength={32}
          disabled={busy || tags.length >= 80}
          onChange={(e) => setCreateDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              createTag();
            }
          }}
        />
        {tags.length === 0 ? (
          <p className="settings-hint">{t("tags.empty")}</p>
        ) : (
          <div className="am-work">
            <div className="am-list-head is-tags">
              <div className="am-row-cells">
                <SortLabel id="name" sort={col.sort} onToggle={col.toggle} count={tags.length}>
                  {t("item.name")}
                </SortLabel>
                <SortLabel id="count" sort={col.sort} onToggle={col.toggle} className="am-row-end" count={tags.length}>
                  {t("tags.countCol")}
                </SortLabel>
                <span className="am-row-action" />
              </div>
            </div>
            <EdgeFade className="am-list-wrap">
              <div className="am-list is-tags" role="list">
                {sortedTags.map((row) => {
                  const draft = drafts[row.name] ?? row.name;
                  const hex = lookupTagColor(row.name, localColors) ?? defaultTagHex(row.name);
                  return (
                    <div key={row.name} className="am-row is-static" role="listitem">
                      <div className="am-row-head">
                        <div className="am-row-cells">
                          <span className="am-row-title tag-name-cell">
                            <TagColorPick
                              hex={hex}
                              name={row.name}
                              disabled={busy}
                              onChange={(next) => changeColor(row.name, next)}
                            />
                            <input
                              className="tag-item-name h-7 w-full min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 text-[0.8125rem] font-medium outline-none hover:border-border hover:bg-elevated focus:border-border focus:bg-elevated"
                              value={draft}
                              aria-label={t("tags.nameOf", {
                                name: row.name,
                              })}
                              onChange={(e) =>
                                setDrafts((d) => ({
                                  ...d,
                                  [row.name]: e.target.value,
                                }))
                              }
                              onBlur={() => renameTag(row.name, draft)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  e.currentTarget.blur();
                                }
                              }}
                            />
                          </span>
                          <span className="am-row-end">{row.count}</span>
                          <span className="am-row-action">
                            <button
                              type="button"
                              className="card-tool is-danger"
                              disabled={busy}
                              aria-label={t("tags.deleteAria", {
                                name: row.name,
                              })}
                              title={t("tags.deleteAria", {
                                name: row.name,
                              })}
                              onClick={() => removeTag(row.name)}
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                 })}
               </div>
             </EdgeFade>
           </div>
         )}
       </div>
     </form>
   );
 }
