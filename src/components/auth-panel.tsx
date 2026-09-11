import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Globe, Lock, Plus, Server, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/field";
import { EdgeFade } from "@/components/edge-fade";
import { ExpandRow, useExpandSession } from "@/components/expand-row";
import { ConfirmPopup } from "@/components/access";
import { t } from "@/lib/i18n";
import type { Directory } from "@/lib/ldap-runtime";
import type { PortalSettings } from "@/lib/portal";
import type { OidcPayload, LdapPayload } from "@/lib/portal-ui";

export function OidcForm({
  initial,
  onSave,
}: {
  initial: PortalSettings;
  onSave: (payload: OidcPayload) => void;
  busy: boolean;
}) {
  const [oidcEnabled, setOidcEnabled] = useState(Boolean(initial.oidcEnabled));
  const [oidcIssuer, setOidcIssuer] = useState(initial.oidcIssuer || "");
  const [oidcClientId, setOidcClientId] = useState(initial.oidcClientId || "");
  const [oidcClientSecret, setOidcClientSecret] = useState("");
  const [oidcLabel, setOidcLabel] = useState(initial.oidcLabel || t("oidc.defaultLabel"));
  const [oidcAutoCreate, setOidcAutoCreate] = useState(Boolean(initial.oidcAutoCreate));
  const [oidcAutoRedirect, setOidcAutoRedirect] = useState(Boolean(initial.oidcAutoRedirect));
  const redirectUri =
    typeof window !== "undefined" ? `${window.location.origin}/oidc/callback` : "/oidc/callback";
  return (
    <form
      id="oidc-form"
      className="settings-stack"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          oidcEnabled,
          oidcIssuer: oidcIssuer.trim(),
          oidcClientId: oidcClientId.trim(),
          oidcClientSecret,
          oidcLabel: oidcLabel.trim() || t("oidc.defaultLabel"),
          oidcAutoCreate,
          oidcAutoRedirect,
        });
      }}
    >
      <div className="settings-card">
        <p className="settings-kicker">{t("oidc.boxService")}</p>
        <div className="settings-toggles">
          <label>
            <input
              type="checkbox"
              checked={oidcEnabled}
              onChange={(e) => setOidcEnabled(e.target.checked)}
            />
            {t("oidc.enable")}
          </label>
          <label>
            <input
              type="checkbox"
              checked={oidcAutoCreate}
              onChange={(e) => setOidcAutoCreate(e.target.checked)}
            />
            {t("oidc.autoCreate")}
          </label>
          <label className="is-child">
            <input
              type="checkbox"
              checked={oidcAutoRedirect}
              disabled={!oidcEnabled}
              onChange={(e) => setOidcAutoRedirect(e.target.checked)}
            />
            {t("oidc.autoRedirect")}
          </label>
        </div>
        <Field label={t("oidc.buttonLabel")}>
          <Input
            value={oidcLabel}
            onChange={(e) => setOidcLabel(e.target.value)}
            placeholder={t("oidc.defaultLabel")}
          />
        </Field>
      </div>
      <div className="settings-card">
        <p className="settings-kicker">{t("oidc.boxClient")}</p>
        <Field label={t("oidc.issuer")} hint={t("oidc.issuerHint")}>
          <Input
            value={oidcIssuer}
            onChange={(e) => setOidcIssuer(e.target.value)}
            placeholder="https://keycloak.exemple/realms/dockit"
            required={oidcEnabled}
          />
        </Field>
        <Field label={t("oidc.clientId")}>
          <Input
            value={oidcClientId}
            onChange={(e) => setOidcClientId(e.target.value)}
            required={oidcEnabled}
          />
        </Field>
        <Field label={t("oidc.clientSecret")} hint={t("oidc.secretHint")}>
          <Input
            type="password"
            value={oidcClientSecret}
            onChange={(e) => setOidcClientSecret(e.target.value)}
            placeholder={
              initial.oidcHasSecret ? t("oidc.secretUnchanged") : t("oidc.secretOptional")
            }
          />
        </Field>
      </div>
      <div className="settings-card">
        <p className="settings-kicker">{t("oidc.redirect")}</p>
        <p className="settings-hint">{redirectUri}</p>
      </div>
    </form>
  );
}
export type LdapDirRow = Directory & { hasBindPassword?: boolean };
export function blankLdapDir(): LdapDirRow {
  return {
    id: crypto.randomUUID(),
    enabled: false,
    host: "",
    port: 636,
    tls: true,
    tlsVerify: true,
    bindDn: "",
    bindPassword: "",
    baseDn: "",
    userFilter: "",
    domain: "",
    autoCreate: false,
  };
}
export function seedLdapDirs(initial: PortalSettings): LdapDirRow[] {
  if (Array.isArray(initial.ldapDirectories) && initial.ldapDirectories.length) {
    return initial.ldapDirectories.map((d) => ({
      ...blankLdapDir(),
      ...d,
      bindPassword: "",
    }));
  }
  if (initial.ldapHost || initial.ldapDomain || initial.ldapEnabled) {
    return [
      {
        ...blankLdapDir(),
        id: "ad",
        enabled: Boolean(initial.ldapEnabled),
        host: initial.ldapHost || "",
        port: Number(initial.ldapPort) || (initial.ldapTls === false ? 389 : 636),
        tls: initial.ldapTls !== false,
        tlsVerify: initial.ldapTlsVerify !== false,
        bindDn: initial.ldapBindDn || "",
        bindPassword: "",
        baseDn: initial.ldapBaseDn || "",
        userFilter: initial.ldapUserFilter || "",
        domain: initial.ldapDomain || "",
        autoCreate: Boolean(initial.ldapAutoCreate),
        hasBindPassword: Boolean(initial.ldapHasBindPassword),
      },
    ];
  }
  return [];
}
export function LockForm({
  busy,
  oidcEnabled,
  oidcAutoRedirect,
  oidcLabel,
  ldapEnabled,
  ldapDomain,
  ldapRealms,
  loginOrder,
  noPassword,
  onCancel,
  onUnlock,
  onOidc,
}: {
  busy: boolean;
  oidcEnabled: boolean;
  oidcAutoRedirect?: boolean;
  oidcLabel: string;
  ldapEnabled: boolean;
  ldapDomain: string;
  ldapRealms?: { id: string; label: string }[];
  loginOrder?: string[];
  noPassword: boolean;
  onCancel: () => void;
  onUnlock: (username: string, password: string, domain: string) => void;
  onOidc?: () => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const realms = Array.isArray(ldapRealms)
    ? ldapRealms
    : ldapEnabled && ldapDomain
      ? [
          {
            id: "ad",
            label: ldapDomain,
          },
        ]
      : [];
  const showDomain = realms.length > 0;
  const [ssoTried, setSsoTried] = useState(false);
  useEffect(() => {
    if (!oidcEnabled || !oidcAutoRedirect || ssoTried || !onOidc) return;
    let last = 0;
    try {
      last = Number(sessionStorage.getItem("oidc-auto") || 0);
    } catch {
      // ignore
    }
    if (Date.now() - last < 30000) return;
    try {
      sessionStorage.setItem("oidc-auto", String(Date.now()));
    } catch {
      // ignore
    }
    setSsoTried(true);
    onOidc();
  }, [oidcEnabled, oidcAutoRedirect, ssoTried, onOidc]);
  const domainOptions = [];
  for (const id of Array.isArray(loginOrder) && loginOrder.length
    ? loginOrder
    : ["local", ...realms.map((r) => r.id)]) {
    if (id === "local")
      domainOptions.push({
        value: "local",
        label: t("lock.local"),
      });
    else {
      const realm = realms.find((r) => r.id === id) || (id === "ad" ? realms[0] : null);
      if (realm)
        domainOptions.push({
          value: realm.id,
          label: realm.label,
        });
    }
  }
  if (!domainOptions.some((o) => o.value === "local"))
    domainOptions.unshift({
      value: "local",
      label: t("lock.local"),
    });
  const [domain, setDomain] = useState(domainOptions[0]?.value || "local");
  return (
    <form
      className="settings-stack"
      onSubmit={(e) => {
        e.preventDefault();
        const name = username.trim() || "admin";
        const bypass = noPassword && (!username.trim() || name.toLowerCase() === "admin");
        onUnlock(name, password, bypass ? "local" : showDomain ? domain : "local");
      }}
    >
      <div className="settings-head">
        <div className="settings-head-copy">
          <h3 className="dialog-title">{t("account.login")}</h3>
          <p className="settings-lead">{t("lock.lead")}</p>
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
      <Field label={t("lock.username")}>
        <div className="field-ico-wrap">
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            required={!noPassword}
          />
          <User className="field-ico" aria-hidden />
        </div>
      </Field>
      <Field label={t("lock.password")}>
        <div className="field-ico-wrap">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required={!noPassword}
          />
          <Lock className="field-ico" aria-hidden />
        </div>
      </Field>
      {showDomain ? (
        <Field label={t("lock.domain")}>
          <div className="field-ico-wrap">
            <Select value={domain} onChange={(e) => setDomain(e.target.value)}>
              {domainOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
            <Server className="field-ico" aria-hidden />
          </div>
        </Field>
      ) : null}
      <div className="settings-actions">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t("actions.cancel")}
        </Button>
        <Button type="submit" variant={noPassword ? "debug" : "default"} disabled={busy}>
          {t("lock.submit")}
        </Button>
      </div>
      {oidcEnabled ? (
        <>
          <div className="lock-or">{t("lock.or")}</div>
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={busy}
            onClick={() => void onOidc?.()}
          >
            <Globe className="size-4" />
            {oidcLabel || t("oidc.defaultLabel")}
          </Button>
          {ssoTried ? <p className="settings-hint">{t("lock.ssoRedirect")}</p> : null}
        </>
      ) : null}
    </form>
  );
}
export function issuerHost(url: unknown) {
  try {
    return new URL(String(url || "")).host || "";
  } catch {
    return "";
  }
}
export function IdentitySourcesPanel({
  settings,
  busy,
  onSaveLdap,
  onSaveOidc,
  onSaveLoginOrder,
}: {
  settings: PortalSettings;
  busy: boolean;
  onSaveLdap: (payload: LdapPayload) => void;
  onSaveOidc: (payload: OidcPayload) => void;
  onSaveLoginOrder: (order: string[]) => void;
}) {
  const expand = useExpandSession();
  const listRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ key: string; pointerId: number } | null>(null);
  const didDrag = useRef(false);
  const snap = useRef("");
  const [dirs, setDirs] = useState<LdapDirRow[]>(() => seedLdapDirs(settings));
  const [order, setOrder] = useState(() =>
    Array.isArray(settings.loginOrder) && settings.loginOrder.length
      ? settings.loginOrder
      : ["local", ...seedLdapDirs(settings).map((d) => d.id)],
  );
  const orderRef = useRef(order);
  orderRef.current = order;
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; name?: string } | null>(null);
  const [oidcDraft, setOidcDraft] = useState(false);
  function patchDir(id: string, next: Partial<LdapDirRow>) {
    setDirs((cur) => {
      const out = cur.map((d) =>
        d.id === id
          ? {
              ...d,
              ...next,
            }
          : d,
      );
      expand.markDirty(JSON.stringify(out) !== snap.current);
      return out;
    });
  }
  function persistDirs(nextDirs?: LdapDirRow[], nextOrder?: string[]) {
    const list = nextDirs || dirs;
    onSaveLdap({
      ldapDirectories: list.map((d) => ({
        id: d.id,
        enabled: Boolean(d.enabled),
        host: String(d.host || "").trim(),
        port: Number(d.port) || (d.tls === false ? 389 : 636),
        tls: d.tls !== false,
        tlsVerify: d.tlsVerify !== false,
        bindDn: String(d.bindDn || "").trim(),
        bindPassword: d.bindPassword || "",
        baseDn: String(d.baseDn || "").trim(),
        userFilter: String(d.userFilter || "").trim(),
        domain: String(d.domain || "").trim(),
        autoCreate: Boolean(d.autoCreate),
      })),
    });
    if (nextOrder) onSaveLoginOrder(nextOrder);
    snap.current = JSON.stringify(list);
    expand.markDirty(false);
  }
  const oidcOn =
    Boolean(settings.oidcEnabled) && Boolean(settings.oidcIssuer) && Boolean(settings.oidcClientId);
  const ranked = [];
  for (const id of order) {
    if (id === "local") {
      ranked.push({
        id: "local",
        name: t("lock.local"),
        type: t("access.idpTypeLocal"),
        host: "",
        on: true,
        draggable: true,
      });
      continue;
    }
    const d = dirs.find((x) => x.id === id);
    if (!d) continue;
    ranked.push({
      id: d.id,
      name: d.domain || t("ldap.directory"),
      type: t("access.idpTypeAd"),
      host: d.host || "",
      on: Boolean(d.enabled),
      draggable: true,
      dir: d,
    });
  }
  if (!ranked.some((r) => r.id === "local"))
    ranked.unshift({
      id: "local",
      name: t("lock.local"),
      type: t("access.idpTypeLocal"),
      host: "",
      on: true,
      draggable: true,
    });
  const extras = [];
  const showOidc = oidcOn || Boolean(settings.oidcEnabled) || oidcDraft;
  if (showOidc) {
    extras.push({
      id: "oidc",
      name: settings.oidcLabel || t("access.oidc"),
      type: t("access.idpTypeOidc"),
      host: issuerHost(settings.oidcIssuer),
      on: oidcOn,
      draggable: false,
    });
  }
  const defaultId =
    order.find((id) => id === "local" || dirs.some((d) => d.id === id && d.enabled)) || "local";
  function toggleRow(id: string, edit: boolean) {
    if (didDrag.current) {
      didDrag.current = false;
      return;
    }
    if (expand.openId === id) {
      expand.requestClose();
      return;
    }
    expand.requestOpen(id, {
      edit: Boolean(edit),
      apply: () => {
        snap.current = JSON.stringify(dirs);
        expand.markDirty(false);
      },
    });
  }
  function addAd() {
    if (dirs.length >= 8) return;
    const d = blankLdapDir();
    const nextDirs = [...dirs, d];
    const nextOrder = [...order.filter((id) => id !== d.id), d.id];
    if (!nextOrder.includes("local")) nextOrder.unshift("local");
    setDirs(nextDirs);
    setOrder(nextOrder);
    snap.current = JSON.stringify(nextDirs);
    expand.requestOpen(d.id, {
      edit: true,
      apply: () => expand.markDirty(false),
    });
  }
  function setDefault(id: string) {
    if (!id || id === "oidc") return;
    const next = [id, ...order.filter((x) => x !== id)];
    if (!next.includes("local")) next.unshift("local");
    setOrder(next);
    onSaveLoginOrder(next);
  }
  function removeProvider(id: string) {
    if (id === "local") return;
    if (id === "oidc") {
      onSaveOidc({
        oidcEnabled: false,
        oidcIssuer: settings.oidcIssuer || "",
        oidcClientId: settings.oidcClientId || "",
        oidcClientSecret: "",
        oidcLabel: settings.oidcLabel || t("oidc.defaultLabel"),
        oidcAutoCreate: Boolean(settings.oidcAutoCreate),
      });
      setOidcDraft(false);
      expand.requestClose();
      return;
    }
    const nextDirs = dirs.filter((d) => d.id !== id);
    const nextOrder = order.filter((x) => x !== id);
    setDirs(nextDirs);
    setOrder(nextOrder);
    persistDirs(nextDirs, nextOrder);
    expand.markDirty(false);
    expand.requestClose();
  }
  function moveOrder(id: string, dir: number) {
    const i = order.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    const next = [...order];
    const [row] = next.splice(i, 1);
    next.splice(j, 0, row);
    setOrder(next);
    onSaveLoginOrder(next);
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
    if (order.length < 2 || e.button !== 0) return;
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
      return id && id !== drag.key && order.includes(id);
    });
    let to = others.length;
    for (let i = 0; i < others.length; i++) {
      const box = others[i].getBoundingClientRect();
      if (e.clientY < box.top + box.height / 2) {
        to = i;
        break;
      }
    }
    setOrder((cur) => {
      const from = cur.findIndex((id) => id === drag.key);
      if (from < 0 || from === to) return cur;
      didDrag.current = true;
      const rest = cur.filter((id) => id !== drag.key);
      rest.splice(to, 0, cur[from]);
      return rest;
    });
  }
  function onGripUp(e: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    endDrag(e.currentTarget, e.pointerId);
    if (didDrag.current) onSaveLoginOrder(orderRef.current);
  }
  type ProviderRow = {
    id: string;
    name: string;
    type: string;
    host: string;
    on: boolean;
    draggable: boolean;
    dir?: LdapDirRow;
  };
  function renderCard(r: ProviderRow) {
    const open = expand.openId === r.id;
    const isDefault = r.id === defaultId;
    const dir = r.dir || dirs.find((d) => d.id === r.id);
    return (
      <ExpandRow
        key={r.id}
        id={r.id}
        className="is-provider"
        expanded={open}
        dragging={dragKey === r.id}
        grip={r.draggable}
        onToggle={() => toggleRow(r.id, r.id !== "local")}
        onAltMove={r.draggable ? (dir) => moveOrder(r.id, dir) : undefined}
        onGripDown={r.draggable ? (e) => onGripDown(e, r.id) : undefined}
        onGripMove={r.draggable ? onGripMove : undefined}
        onGripUp={r.draggable ? onGripUp : undefined}
        cells={[
          <span key="n" className="am-row-title">
            {r.name}
            {r.host ? <span className="am-row-sub">{r.host}</span> : null}
          </span>,
          <span key="s" className={`am-status${r.on ? "" : " is-off"}`}>
            {r.on ? t("access.active") : t("access.disabled")}
          </span>,
          <span key="d">
            {isDefault ? <span className="am-badge">{t("access.idpDefault")}</span> : null}
          </span>,
        ]}
      >
        {r.id === "local" ? (
          <p className="am-note">{t("access.idpLocalHint")}</p>
        ) : r.id === "oidc" ? (
          <>
            <OidcForm
              initial={settings}
              busy={busy}
              onSave={(payload) => {
                onSaveOidc(payload);
                expand.markDirty(false);
              }}
            />
            <div className="am-actions">
              <button
                type="button"
                className="am-text-btn is-danger"
                onClick={() =>
                  setConfirm({
                    id: "oidc",
                  })
                }
              >
                {t("access.idpRemove")}
              </button>
              <Button type="submit" form="oidc-form"  disabled={busy}>
                {t("actions.save")}
              </Button>
            </div>
          </>
        ) : dir ? (
          <form
            id={`ldap-form-${dir.id}`}
            className="settings-stack"
            onSubmit={(e) => {
              e.preventDefault();
              persistDirs(dirs, order);
            }}
          >
            <LdapDirFields d={dir} patch={(next) => patchDir(dir.id, next)} />
            <div className="am-actions">
              <button
                type="button"
                className="am-text-btn"
                onClick={() => {
                  persistDirs(
                    dirs.map((d) =>
                      d.id === dir.id
                        ? {
                            ...d,
                            enabled: !d.enabled,
                          }
                        : d,
                    ),
                    order,
                  );
                  setDirs((cur) =>
                    cur.map((d) =>
                      d.id === dir.id
                        ? {
                            ...d,
                            enabled: !d.enabled,
                          }
                        : d,
                    ),
                  );
                }}
              >
                {dir.enabled ? t("access.disable") : t("access.enable")}
              </button>
              <button type="button" className="am-text-btn" onClick={() => setDefault(dir.id)}>
                {t("access.idpSetDefault")}
              </button>
              <button
                type="button"
                className="am-text-btn is-danger"
                onClick={() =>
                  setConfirm({
                    id: dir.id,
                    name: dir.domain || t("ldap.directory"),
                  })
                }
              >
                {t("access.idpRemove")}
              </button>
              <Button type="submit" disabled={busy}>
                {t("actions.save")}
              </Button>
            </div>
          </form>
        ) : null}
      </ExpandRow>
    );
  }
  return (
    <div className="am-work">
      <div className="am-toolbar">
        <span className="am-toolbar-title">{t("access.idpSources")}</span>
        <button
          type="button"
          className="am-create shrink-0"
          onClick={addAd}
          disabled={dirs.length >= 8}
        >
          <Plus className="size-3.5" /> {t("access.idpAddAd")}
        </button>
        <button
          type="button"
          className="am-create shrink-0"
          onClick={() => {
            setOidcDraft(true);
            toggleRow("oidc", true);
          }}
        >
          <Plus className="size-3.5" /> {t("access.idpAddOidc")}
        </button>
      </div>
      <EdgeFade className="am-list-wrap">
        <div ref={listRef} className="am-providers" role="list">
          {ranked.map(renderCard)}
          {extras.map(renderCard)}
        </div>
      </EdgeFade>
      {confirm ? (
        <ConfirmPopup
          title={t("access.idpRemove")}
          body={confirm.id === "oidc" ? t("access.oidcLead") : t("access.ldapLead")}
          busy={busy}
          okLabel={t("access.idpRemove")}
          onCancel={() => setConfirm(null)}
          onOk={() => {
            removeProvider(confirm.id);
            setConfirm(null);
          }}
        />
      ) : null}
      {expand.ask ? (
        <ConfirmPopup
          title={t("access.discardTitle")}
          body={t("access.discardBody")}
          okLabel={t("access.discard")}
          onCancel={expand.dismissAsk}
          onOk={expand.confirmAsk}
        />
      ) : null}
    </div>
  );
}
export function LdapDirFields({ d, patch }: { d: LdapDirRow; patch: (next: Partial<LdapDirRow>) => void }) {
  const tlsOn = d.tls !== false;
  return (
    <>
      <div className="settings-toggles">
        <label>
          <input
            type="checkbox"
            checked={Boolean(d.enabled)}
            onChange={(e) =>
              patch({
                enabled: e.target.checked,
              })
            }
          />
          {t("ldap.enable")}
        </label>
        <label>
          <input
            type="checkbox"
            checked={Boolean(d.autoCreate)}
            onChange={(e) =>
              patch({
                autoCreate: e.target.checked,
              })
            }
          />
          {t("ldap.autoCreate")}
        </label>
        <label>
          <input
            type="checkbox"
            checked={tlsOn}
            onChange={(e) => {
              const on = e.target.checked;
              patch({
                tls: on,
                port: d.port === 389 || d.port === 636 ? (on ? 636 : 389) : d.port,
              });
            }}
          />
          {t("ldap.tls")}
        </label>
        <label className={`is-child ${tlsOn ? "" : "is-disabled"}`}>
          <input
            type="checkbox"
            checked={d.tlsVerify !== false}
            disabled={!tlsOn}
            onChange={(e) =>
              patch({
                tlsVerify: e.target.checked,
              })
            }
          />
          {t("ldap.tlsVerify")}
        </label>
      </div>
      <div className="field-row">
        <Field label={t("ldap.domain")} hint={t("ldap.domainHint")}>
          <Input
            value={d.domain}
            onChange={(e) =>
              patch({
                domain: e.target.value,
              })
            }
            placeholder="CORP"
            required={Boolean(d.enabled)}
          />
        </Field>
        <Field label={t("ldap.host")} hint={t("ldap.hostHint")}>
          <Input
            value={d.host}
            onChange={(e) =>
              patch({
                host: e.target.value,
              })
            }
            placeholder="dc.example.local"
            required={Boolean(d.enabled)}
          />
        </Field>
      </div>
      <Field label={t("ldap.port")}>
        <Input
          type="number"
          min={1}
          max={65535}
          value={d.port}
          onChange={(e) =>
            patch({
              port: Number(e.target.value) || 0,
            })
          }
        />
      </Field>
      <Field label={t("ldap.bindDn")} hint={t("ldap.bindHint")}>
        <Input
          value={d.bindDn}
          onChange={(e) =>
            patch({
              bindDn: e.target.value,
            })
          }
          placeholder="CN=dockit,OU=Services,DC=example,DC=local"
        />
      </Field>
      <Field label={t("ldap.bindPassword")}>
        <Input
          type="password"
          value={d.bindPassword}
          onChange={(e) =>
            patch({
              bindPassword: e.target.value,
            })
          }
          placeholder={d.hasBindPassword ? t("oidc.secretUnchanged") : t("oidc.secretOptional")}
        />
      </Field>
      <Field label={t("ldap.baseDn")}>
        <Input
          value={d.baseDn}
          onChange={(e) =>
            patch({
              baseDn: e.target.value,
            })
          }
          placeholder="DC=example,DC=local"
          required={Boolean(d.enabled) && Boolean(String(d.bindDn || "").trim())}
        />
      </Field>
      <Field label={t("ldap.filter")} hint={t("ldap.filterHint")}>
        <Input
          value={d.userFilter}
          onChange={(e) =>
            patch({
              userFilter: e.target.value,
            })
          }
          placeholder="(&(objectClass=user)(sAMAccountName={username}))"
        />
      </Field>
    </>
  );
}
