import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { Lock, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

import { EdgeFade } from "@/components/edge-fade";
import { ConfirmDialog, type ConfirmDialogProps } from "@/components/confirm-dialog";
import {
  can,
  effectiveAccess,
  explain,
  PORTAL_ACTIONS,
  TREE_ACTIONS,
  type AclDoc,
  type Decision,
  type Grant,
  type GrantInput,
  type Group,
  type ResKind,
  type Role,
  type Source,
  type Space,
  type User,
} from "@/lib/acl";
import { t, te, tp, localeTag, formatNumber } from "@/lib/i18n";
import { PASSWORD_MIN, passwordMeter } from "@/lib/security";
import { listUsers } from "@/lib/portal";
import { sessionGone } from "@/lib/session-gone";
import { isConflict, noteDocRev } from "@/lib/doc-rev";

export const INPUT_SM = "h-9 rounded-md bg-transparent";

export type Provider = { id: string; label: string; kind: string };
export type LdapDirectory = { id: string; domain?: string; enabled?: boolean; host?: string };
export type Actor = {
  id?: string;
  role?: string;
  canManageUsers?: boolean;
  canManageGroups?: boolean;
  canManageRoles?: boolean;
  canManageSettings?: boolean;
};
export type Effect = "inherit" | "allow" | "deny";

export function prettyLogin(name: unknown): string {
  return String(name || "").trim();
}

export function roleTitle(id: string, roles: Role[]): string {
  if (id === "owner") return t("access.roleOwner");
  if (id === "admin") return t("access.roleAdminShort");
  if (id === "editeur") return t("access.roleEditeur");
  if (id === "lecteur") return t("access.roleLecteur");
  return roles.find((r) => r.id === id)?.name || id;
}

export function systemRoleDesc(id: string): string | null {
  if (id === "owner") return t("access.roleDescOwner");
  if (id === "admin") return t("access.roleDescAdmin");
  if (id === "editeur") return t("access.roleDescEditor");
  if (id === "lecteur") return t("access.roleDescViewer");
  return null;
}

export function actionLabel(a: string): string {
  const key = `access.act.${a}`;
  const s = t(key);
  return s === key ? a : s;
}

export function sourceLabel(src: Source | null | undefined): string {
  if (!src) return t("access.whyNone");
  if (src.kind === "direct") return t("access.whyDirect");
  if (src.kind === "public") return t("access.whyPublic");
  if (src.kind === "system")
    return t("access.whySystem", { name: src.role?.name || t("access.roleOwner") });
  if (src.kind === "group") {
    const role = src.role?.name ? roleTitle(src.role.id, [src.role]) : t("access.aRole");
    return t("access.whyGroup", { role, group: src.group?.name || t("access.typeGroup") });
  }
  if (src.kind === "role")
    return t("access.whyRole", { name: src.role?.name || t("access.aRole") });
  return t("access.whyDirect");
}

export function remoteSourceLabel(src: unknown): string | null {
  if (src === "ad") return t("access.sourceAd");
  if (src === "oidc") return t("access.sourceOidc");
  return null;
}

export function typeLabel(src: unknown): string {
  return remoteSourceLabel(src) || t("lock.local");
}

export function effectiveRoleIds(
  u: { roleIds?: string[]; groupIds?: string[]; id?: string },
  groups: { id: string; roleIds?: string[]; members?: string[] }[],
): string[] {
  const ids = new Set(u.roleIds || []);
  for (const g of groups) {
    if ((u.groupIds || []).includes(g.id) || (g.members || []).includes(u.id || "")) {
      for (const r of g.roleIds || []) ids.add(r);
    }
  }
  return [...ids];
}

export function pickerProviders(directories: LdapDirectory[] | null | undefined): Provider[] {
  const list: Provider[] = [{ id: "local", label: t("access.idpTypeLocal"), kind: "local" }];
  for (const d of directories || []) {
    list.push({ id: d.id, label: d.domain || t("ldap.directory"), kind: "ad" });
  }
  return list;
}

export function localEffect(
  grants: GrantInput[] | null | undefined,
  res: ResKind,
  id: string,
  action: string,
): Effect {
  const g = (grants || []).find((x) => x.res === res && x.id === id);
  if (!g) return "inherit";
  if ((g.deny || []).includes(action) || (g.deny || []).includes("*")) return "deny";
  if ((g.allow || []).includes(action) || (g.allow || []).includes("*")) return "allow";
  return "inherit";
}

export function setEffect(
  grants: GrantInput[] | null | undefined,
  res: ResKind,
  id: string,
  action: string,
  next: Effect,
): Grant[] {
  const list: Grant[] = (grants || []).map((g) => ({
    res: g.res,
    id: g.id,
    scope: g.scope,
    allow: [...(g.allow || [])],
    deny: [...(g.deny || [])],
  }));
  let g = list.find((x) => x.res === res && x.id === id);
  if (!g) {
    g = { res, id, allow: [], deny: [] };
    list.push(g);
  }
  g.allow = g.allow.filter((a) => a !== action);
  g.deny = g.deny.filter((a) => a !== action);
  if (next === "allow") g.allow.push(action);
  if (next === "deny") g.deny.push(action);
  return list.filter((x) => x.allow.length || x.deny.length);
}

export function cycleEffect(cur: Effect): Effect {
  if (cur === "inherit") return "allow";
  if (cur === "allow") return "deny";
  return "inherit";
}

export function roleProbe(
  grants: GrantInput[] | null | undefined,
  spaces: Space[] | null | undefined,
): AclDoc {
  return {
    roles: [{ id: "_probe", name: "_", grants: grants || [] }],
    users: [],
    groups: [],
    spaces: spaces || [],
  };
}

export type Dir = {
  users: User[];
  groups: Group[];
  roles: Role[];
  spaces: Space[];
  busy: boolean;
  apply: (res: Partial<{ users: User[]; groups: Group[]; roles: Role[]; spaces: Space[] }>) => void;
  setBusy: (v: boolean) => void;
};

export function MiniDoc(dir: Dir): AclDoc {
  return { users: dir.users, groups: dir.groups, roles: dir.roles, spaces: dir.spaces };
}

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function useDirectory(token: string): Dir {
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [busy, setBusy] = useState(true);
  function apply(
    res: Partial<{ users: User[]; groups: Group[]; roles: Role[]; spaces: Space[]; rev?: number }>,
  ) {
    noteDocRev(res);
    if (res.users) setUsers(res.users);
    if (res.groups) setGroups(res.groups);
    if (res.roles) setRoles(res.roles);
    if (res.spaces) setSpaces(res.spaces);
  }
  useEffect(() => {
    listUsers({ data: { token } })
      .then((res: any) => {
        apply(res);
        setBusy(false);
      })
      .catch((err: unknown) => {
        setBusy(false);
        if (!sessionGone(err)) toast.error(te(err));
        isConflict(err);
      });
    const onConflict = () => {
      listUsers({ data: { token } })
        .then((res: any) => apply(res))
        .catch((err: unknown) => {
          if (!sessionGone(err)) toast.error(te(err));
          isConflict(err);
        });
    };
    window.addEventListener("portal-doc-conflict", onConflict);
    return () => window.removeEventListener("portal-doc-conflict", onConflict);
  }, [token]);
  return { users, groups, roles, spaces, busy, apply, setBusy };
}

export function ListShell({
  toolbar,
  head,
  children,
}: {
  toolbar?: ReactNode;
  head?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="am-work">
      <div className="am-toolbar">{toolbar}</div>
      {head}
      <EdgeFade className="am-list-wrap">{children}</EdgeFade>
    </div>
  );
}

export function ListHead({
  cells,
  grip,
  className,
}: {
  cells?: ReactNode;
  grip?: boolean;
  className?: string;
}) {
  return (
    <div className={`am-list-head${className ? ` ${className}` : ""}`}>
      {grip ? <span className="am-chevron-spacer" /> : null}
      <span className="am-chevron-spacer" />
      <div className="am-row-cells">{cells}</div>
    </div>
  );
}

export type ColSort = { key: string | null; dir: "asc" | "desc" };

export function useColSort() {
  const [sort, setSort] = useState<ColSort>({
    key: null,
    dir: "asc",
  });
  const toggle = useCallback((key: string) => {
    setSort((cur) =>
      cur.key === key
        ? {
            key,
            dir: cur.dir === "asc" ? "desc" : "asc",
          }
        : {
            key,
            dir: "asc",
          },
    );
  }, []);
  const apply = useCallback(
    <T,>(rows: T[] | null | undefined, get: (row: T, key: string) => string | number): T[] => {
      if (!sort.key || !rows?.length) return rows || [];
      const sign = sort.dir === "asc" ? 1 : -1;
      const key = sort.key;
      return [...rows].sort((a, b) => {
        const va = get(a, key);
        const vb = get(b, key);
        if (typeof va === "number" && typeof vb === "number") return (va - vb) * sign;
        return (
          String(va || "").localeCompare(String(vb || ""), localeTag(), {
            sensitivity: "base",
            numeric: true,
          }) * sign
        );
      });
    },
    [sort],
  );
  return {
    sort,
    toggle,
    apply,
  };
}

export function SortLabel({
  id,
  sort,
  onToggle,
  children,
  className,
  count,
}: {
  id: string;
  sort: ColSort;
  onToggle: (id: string) => void;
  children?: ReactNode;
  className?: string;
  count?: number;
}) {
  const on = sort.key === id;
  const label =
    on && count != null && (typeof children === "string" || typeof children === "number")
      ? t("sort.counted", { label: String(children), n: formatNumber(count) })
      : children;
  return (
    <button
      type="button"
      className={`am-sort${on ? " is-on" : ""}${className ? ` ${className}` : ""}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle(id);
      }}
    >
      {label}
      {on ? (
        <span className="am-sort-dir" aria-hidden>
          {sort.dir === "asc" ? "↑" : "↓"}
        </span>
      ) : null}
    </button>
  );
}

export function holdersLine(users: number, groups: number): string {
  return `${tp("access.nUsers", users || 0)} · ${tp("access.nGroups", groups || 0)}`;
}

export function bits(names: (string | null | undefined)[] | null | undefined): string {
  const list = (names || []).filter(Boolean);
  if (!list.length) return "—";
  if (list.length <= 2) return list.join(", ");
  return `${list.slice(0, 2).join(", ")} +${list.length - 2}`;
}

export type FilterItem = { id: string; label: ReactNode };

export function FilterBar({
  value,
  onChange,
  items,
  label,
}: {
  value: string;
  onChange: (id: string) => void;
  items: FilterItem[];
  label?: string;
}) {
  return (
    <div className="am-filters" role="tablist" aria-label={label || t("access.filterAll")}>
      {items.map((f) => (
        <button
          key={f.id}
          type="button"
          role="tab"
          aria-selected={value === f.id}
          className={value === f.id ? "is-on" : ""}
          onClick={() => onChange(f.id)}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="am-search">
      <Search className="size-3.5" aria-hidden />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
    </label>
  );
}

export function StatusText({ off }: { off?: boolean }) {
  return (
    <span className={`am-status${off ? " is-off" : ""}`}>
      {off ? t("access.disabled") : t("access.active")}
    </span>
  );
}

export function PermWord({
  action,
  state,
  inheritedOn,
  onCycle,
  readOnly,
}: {
  action: string;
  state: Effect;
  inheritedOn?: boolean;
  onCycle?: () => void;
  readOnly?: boolean;
}) {
  const label = actionLabel(action);
  const title =
    state === "allow"
      ? t("access.permException")
      : state === "deny"
        ? t("access.denied")
        : inheritedOn
          ? t("access.permFromRole")
          : t("access.none");
  if (readOnly) {
    if (state === "deny")
      return (
        <span className="am-perm is-deny" title={title}>
          {label} —
        </span>
      );
    if (state === "allow" || inheritedOn)
      return (
        <span className={`am-perm is-on${state === "inherit" ? " is-in" : ""}`} title={title}>
          {label} ✓
        </span>
      );
    return (
      <span className="am-perm" title={title}>
        {label} —
      </span>
    );
  }
  return (
    <button
      type="button"
      className={`am-perm is-${state}${inheritedOn && state === "inherit" ? " is-in" : ""}`}
      title={`${label}: ${title}`}
      aria-label={`${label}: ${title}`}
      onClick={onCycle}
    >
      {label} {state === "deny" ? "—" : state === "allow" || inheritedOn ? "✓" : "—"}
    </button>
  );
}

export function PermChips({
  actions,
  onPick,
}: {
  actions: string[];
  onPick?: (action: string) => void;
}) {
  if (!actions.length) return null;
  return (
    <span className="am-chips">
      {actions.map((action) => (
        <button
          key={action}
          type="button"
          className="am-chip"
          title={actionLabel(action)}
          onClick={() => onPick?.(action)}
        >
          {actionLabel(action)}
        </button>
      ))}
    </span>
  );
}

export function PermLine({
  res,
  id,
  actions,
  grants,
  setGrants,
  spaces,
  readOnly,
}: {
  res: ResKind;
  id: string;
  actions: string[];
  grants: GrantInput[] | null | undefined;
  setGrants: (g: Grant[]) => void;
  spaces: Space[] | null | undefined;
  readOnly?: boolean;
}) {
  const probe = roleProbe(grants, spaces);
  const user: User = { id: "_u", roleIds: ["_probe"], grants: [] };
  if (readOnly) {
    const granted = actions.filter((action) => {
      const state = localEffect(grants, res, id, action);
      if (state === "allow") return true;
      if (state === "deny") return false;
      return can(user, action, { res, id }, probe);
    });
    return <PermChips actions={granted} />;
  }
  return (
    <span className="am-perms">
      {actions.map((action) => {
        const state = localEffect(grants, res, id, action);
        const inheritedOn = state === "inherit" && can(user, action, { res, id }, probe);
        return (
          <PermWord
            key={action}
            action={action}
            state={state}
            inheritedOn={inheritedOn}
            onCycle={() => setGrants(setEffect(grants, res, id, action, cycleEffect(state)))}
          />
        );
      })}
    </span>
  );
}

export function ResourceTree({
  spaces,
  grants,
  setGrants,
  query,
  readOnly,
}: {
  spaces: Space[] | null | undefined;
  grants: GrantInput[] | null | undefined;
  setGrants: (g: Grant[]) => void;
  query?: string;
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const q = String(query || "")
    .trim()
    .toLowerCase();
  function hit(name: unknown): boolean {
    return (
      !q ||
      String(name || "")
        .toLowerCase()
        .includes(q) ||
      actionLabel(q).toLowerCase().includes(q)
    );
  }
  const list = (spaces || [])
    .map((space) => {
      const cats = (space.categories || [])
        .map((cat) => {
          const cards = (cat.cards || []).filter(
            (a) => hit(a.title) || hit(cat.name) || hit(space.name),
          );
          return { ...cat, _hit: hit(cat.name) || cards.length > 0 };
        })
        .filter((c) => !q || c._hit);
      return { ...space, categories: cats, _hit: hit(space.name) || cats.length > 0 };
    })
    .filter((space) => !q || space._hit);

  const portalHit =
    !q ||
    hit(t("access.permPortal")) ||
    PORTAL_ACTIONS.some((a) => actionLabel(a).toLowerCase().includes(q));

  return (
    <div className="am-tree" role="tree">
      {portalHit ? (
        <div className="am-tree-row" role="treeitem">
          <span className="am-tree-name">{t("access.permPortal")}</span>
          <PermLine
            res="portal"
            id="*"
            actions={PORTAL_ACTIONS}
            grants={grants}
            setGrants={setGrants}
            spaces={spaces}
            readOnly={readOnly}
          />
        </div>
      ) : null}
      {list.map((space) => (
        <div key={space.id} className="am-tree-block">
          <div className="am-tree-row" role="treeitem">
            <button
              type="button"
              className="am-tree-name"
              onClick={() => setOpen((o) => ({ ...o, [space.id]: !o[space.id] }))}
            >
              {space.name}
              {space.restricted ? (
                <Lock
                  className="size-3"
                  aria-label={t("access.restricted")}
                  {...{ title: t("access.restricted") }}
                />
              ) : null}
            </button>
            <PermLine
              res="space"
              id={space.id}
              actions={TREE_ACTIONS.space}
              grants={grants}
              setGrants={setGrants}
              spaces={spaces}
              readOnly={readOnly}
            />
          </div>
          {open[space.id] || q
            ? (space.categories || []).map((cat) => (
                <div key={cat.id}>
                  <div className="am-tree-row is-cat">
                    <button
                      type="button"
                      className="am-tree-name"
                      onClick={() => setOpen((o) => ({ ...o, [cat.id]: !o[cat.id] }))}
                    >
                      {cat.name}
                      {cat.restricted ? (
                        <Lock className="size-3" aria-label={t("access.restricted")} />
                      ) : null}
                    </button>
                    <PermLine
                      res="cat"
                      id={cat.id}
                      actions={TREE_ACTIONS.cat}
                      grants={grants}
                      setGrants={setGrants}
                      spaces={spaces}
                      readOnly={readOnly}
                    />
                  </div>
                  {open[cat.id] || q
                    ? (cat.cards || []).map((card) => (
                        <div key={card.id} className="am-tree-row is-card">
                          <span className="am-tree-name">{card.title || t("empty.untitled")}</span>
                          <PermLine
                            res="card"
                            id={card.id}
                            actions={TREE_ACTIONS.card}
                            grants={grants}
                            setGrants={setGrants}
                            spaces={spaces}
                            readOnly={readOnly}
                          />
                        </div>
                      ))
                    : null}
                </div>
              ))
            : null}
        </div>
      ))}
    </div>
  );
}

export function EffectiveTree({
  user,
  doc,
  onWhy,
}: {
  user: User | null | undefined;
  doc: AclDoc;
  onWhy?: (d: Decision) => void;
}) {
  const tree = useMemo(() => effectiveAccess(user, doc), [user, doc]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  function words(allowed: string[] | undefined, res: ResKind, id: string) {
    return (
      <PermChips
        actions={allowed || []}
        onPick={(action) => onWhy?.(explain(user, action, { res, id }, doc))}
      />
    );
  }
  return (
    <div className="am-tree">
      <div className="am-tree-row">
        <span className="am-tree-name">{t("access.permPortal")}</span>
        {words(tree.portal, "portal", "*")}
      </div>
      {tree.spaces.map((space) => (
        <div key={space.id}>
          <div className="am-tree-row">
            <button
              type="button"
              className="am-tree-name"
              onClick={() => setOpen((o) => ({ ...o, [space.id]: !o[space.id] }))}
            >
              {space.name}
            </button>
            {words(space.actions, "space", space.id)}
          </div>
          {open[space.id]
            ? space.cats.map((cat) => (
                <div key={cat.id}>
                  <div className="am-tree-row is-cat">
                    <button
                      type="button"
                      className="am-tree-name"
                      onClick={() => setOpen((o) => ({ ...o, [cat.id]: !o[cat.id] }))}
                    >
                      {cat.name}
                    </button>
                    {words(cat.actions, "cat", cat.id)}
                  </div>
                  {open[cat.id]
                    ? cat.cards.map((card) => (
                        <div key={card.id} className="am-tree-row is-card">
                          <span className="am-tree-name">{card.name || t("empty.untitled")}</span>
                          {words(card.actions, "card", card.id)}
                        </div>
                      ))
                    : null}
                </div>
              ))
            : null}
        </div>
      ))}
    </div>
  );
}

export function WhyPanel({
  info,
  onClose,
}: {
  info: Decision | null | undefined;
  onClose: () => void;
}) {
  if (!info) return null;
  return (
    <div className="am-why" role="status">
      <div className="am-why-top">
        <p>
          {t("access.whyTitle", {
            action: actionLabel(info.action),
            name: info.resource?.name || t("access.permPortal"),
          })}
        </p>
        <button
          type="button"
          className="am-icon-btn"
          onClick={onClose}
          aria-label={t("actions.close")}
          title={t("actions.close")}
        >
          <X className="size-3.5" />
        </button>
      </div>
      <ul>
        {(info.sources || []).length ? (
          info.sources.map((s, i) => (
            <li key={i} className={s.effect === "deny" ? "is-deny" : ""}>
              {s.effect === "deny" ? "✕ " : "✓ "}
              {sourceLabel(s)}
            </li>
          ))
        ) : (
          <li>{t("access.whyNone")}</li>
        )}
      </ul>
    </div>
  );
}

export function ConfirmPopup(props: ConfirmDialogProps) {
  return <ConfirmDialog {...props} />;
}

export function ExpandCard({
  kicker,
  hint,
  children,
}: {
  kicker?: ReactNode;
  hint?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="settings-card">
      {kicker ? <p className="settings-kicker">{kicker}</p> : null}
      {children}
      {hint ? <p className="settings-hint">{hint}</p> : null}
    </div>
  );
}

export function DiscardAsk({
  ask,
  onKeep,
  onDiscard,
}: {
  ask?: unknown;
  onKeep: () => void;
  onDiscard: () => void;
}) {
  if (!ask) return null;
  return (
    <ConfirmPopup
      title={t("access.discardTitle")}
      body={t("access.discardBody")}
      okLabel={t("access.discard")}
      onCancel={onKeep}
      onOk={onDiscard}
    />
  );
}

export function PermBlocks({
  user,
  dir,
  spaces,
  grants,
  setGrants,
  editing,
  why,
  setWhy,
}: {
  user: User | null | undefined;
  dir: Dir;
  spaces: Space[] | null | undefined;
  grants: GrantInput[] | null | undefined;
  setGrants?: (g: Grant[]) => void;
  editing?: boolean;
  why: Decision | null | undefined;
  setWhy: (d: Decision | null) => void;
}) {
  const [pq, setPq] = useState("");
  const liveUser = user ? { ...user, grants: grants || user.grants || [] } : null;
  if (editing) {
    return (
      <div className="am-perm-block">
        <SearchField value={pq} onChange={setPq} placeholder={t("access.searchPerms")} />
        <ResourceTree
          spaces={spaces}
          grants={grants || []}
          setGrants={setGrants || (() => {})}
          query={pq}
        />
      </div>
    );
  }
  if (!liveUser) return <p className="am-empty-line">{t("access.none")}</p>;
  return (
    <div className="am-perm-block">
      <EffectiveTree user={liveUser} doc={MiniDoc(dir)} onWhy={setWhy} />
      <WhyPanel info={why} onClose={() => setWhy(null)} />
    </div>
  );
}

export function PasswordHint({ value, required = false }: { value?: string; required?: boolean }) {
  const pwd = String(value || "");
  if (!required && !pwd) return null;
  const meter = passwordMeter(pwd);
  const tone =
    meter.strength === "short" || meter.strength === "weak"
      ? "is-warn"
      : meter.strength === "good" || meter.strength === "strong"
        ? "is-ok"
        : "";
  const strength = pwd
    ? t(`users.pw${meter.strength[0].toUpperCase()}${meter.strength.slice(1)}`)
    : t("users.passwordMin", { n: PASSWORD_MIN });
  const remain =
    meter.remaining > 0
      ? tp("users.passwordRemain", meter.remaining)
      : tp("users.passwordLeft", meter.left);
  return (
    <p className={`theme-css-meta am-pw-hint ${tone}`}>
      <span>{strength}</span>
      <span>{remain}</span>
    </p>
  );
}

export function RowActions({
  editing,
  onEdit,
  onCancel,
  saveDisabled,
  busy,
  extra,
  danger,
}: {
  editing?: boolean;
  onEdit?: (() => void) | null;
  onCancel: () => void;
  saveDisabled?: boolean;
  busy?: boolean;
  extra?: ReactNode;
  danger?: ReactNode;
}) {
  if (editing) {
    return (
      <div className="am-actions">
        <button type="button" className="am-text-btn" onClick={onCancel}>
          {t("actions.cancel")}
        </button>
        <Button type="submit" disabled={saveDisabled || busy}>
          {t("actions.save")}
        </Button>
      </div>
    );
  }
  return (
    <div className="am-actions">
      {extra}
      {danger}
      {onEdit ? (
        <Button type="button" onClick={onEdit}>
          {t("actions.edit")}
        </Button>
      ) : null}
    </div>
  );
}
