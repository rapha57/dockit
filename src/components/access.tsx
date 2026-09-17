import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { Copy, Folder, Lock, Plus, RefreshCw, Search, Shield, Users, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

import { EmptyState } from "@/components/empty-state";
import { EdgeFade } from "@/components/edge-fade";
import { ConfirmDialog, type ConfirmDialogProps } from "@/components/confirm-dialog";
import { ChipList, EntityPicker } from "@/components/entity-picker";
import { ExpandRow, NEW_ROW, useExpandSession } from "@/components/expand-row";
import { Field } from "@/components/field";
import { FormActions } from "@/components/form-actions";
import {
  can,
  effectiveAccess,
  explain,
  isSystemRole,
  PORTAL_ACTIONS,
  syntheticUserFromGroup,
  TREE_ACTIONS,
  type AclDoc,
  type Category,
  type CategoryMoveImpact,
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
import { PASSWORD_MAX, PASSWORD_MIN, passwordMeter, passwordPolicyError } from "@/lib/security";
import {
  deleteGroup,
  deleteRole,
  deleteUser,
  listUsers,
  saveGroup,
  saveRole,
  saveUser,
  searchLdapGroups,
  linkLdapGroups,
  syncLdapGroup,
} from "@/lib/portal";
import type { LdapGroupHit } from "@/lib/ldap-runtime";
import { sessionGone } from "@/lib/session-gone";

const INPUT_SM = "h-9 rounded-md bg-transparent";

type Provider = { id: string; label: string; kind: string };
type LdapDirectory = { id: string; domain?: string; enabled?: boolean; host?: string };
type Actor = {
  id?: string;
  role?: string;
  canManageUsers?: boolean;
  canManageGroups?: boolean;
  canManageRoles?: boolean;
  canManageSettings?: boolean;
};
type Effect = "inherit" | "allow" | "deny";

function prettyLogin(name: unknown): string {
  return String(name || "").trim();
}

function roleTitle(id: string, roles: Role[]): string {
  if (id === "owner") return t("access.roleOwner");
  if (id === "admin") return t("access.roleAdminShort");
  if (id === "editeur") return t("access.roleEditeur");
  if (id === "lecteur") return t("access.roleLecteur");
  return roles.find((r) => r.id === id)?.name || id;
}

function systemRoleDesc(id: string): string | null {
  if (id === "owner") return t("access.roleDescOwner");
  if (id === "admin") return t("access.roleDescAdmin");
  if (id === "editeur") return t("access.roleDescEditor");
  if (id === "lecteur") return t("access.roleDescViewer");
  return null;
}

function actionLabel(a: string): string {
  const key = `access.act.${a}`;
  const s = t(key);
  return s === key ? a : s;
}

function sourceLabel(src: Source | null | undefined): string {
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

function remoteSourceLabel(src: unknown): string | null {
  if (src === "ad") return t("access.sourceAd");
  if (src === "oidc") return t("access.sourceOidc");
  return null;
}

function typeLabel(src: unknown): string {
  return remoteSourceLabel(src) || t("lock.local");
}

function effectiveRoleIds(
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

function pickerProviders(directories: LdapDirectory[] | null | undefined): Provider[] {
  const list: Provider[] = [{ id: "local", label: t("access.idpTypeLocal"), kind: "local" }];
  for (const d of directories || []) {
    list.push({ id: d.id, label: d.domain || t("ldap.directory"), kind: "ad" });
  }
  return list;
}

function localEffect(grants: GrantInput[] | null | undefined, res: ResKind, id: string, action: string): Effect {
  const g = (grants || []).find((x) => x.res === res && x.id === id);
  if (!g) return "inherit";
  if ((g.deny || []).includes(action) || (g.deny || []).includes("*")) return "deny";
  if ((g.allow || []).includes(action) || (g.allow || []).includes("*")) return "allow";
  return "inherit";
}

function setEffect(grants: GrantInput[] | null | undefined, res: ResKind, id: string, action: string, next: Effect): Grant[] {
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

function cycleEffect(cur: Effect): Effect {
  if (cur === "inherit") return "allow";
  if (cur === "allow") return "deny";
  return "inherit";
}

function roleProbe(grants: GrantInput[] | null | undefined, spaces: Space[] | null | undefined): AclDoc {
  return {
    roles: [{ id: "_probe", name: "_", grants: grants || [] }],
    users: [],
    groups: [],
    spaces: spaces || [],
  };
}

type Dir = {
  users: User[];
  groups: Group[];
  roles: Role[];
  spaces: Space[];
  busy: boolean;
  apply: (res: Partial<{ users: User[]; groups: Group[]; roles: Role[]; spaces: Space[] }>) => void;
  setBusy: (v: boolean) => void;
};

function MiniDoc(dir: Dir): AclDoc {
  return { users: dir.users, groups: dir.groups, roles: dir.roles, spaces: dir.spaces };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function useDirectory(token: string): Dir {
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [busy, setBusy] = useState(true);
  function apply(res: Partial<{ users: User[]; groups: Group[]; roles: Role[]; spaces: Space[] }>) {
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
      });
  }, [token]);
  return { users, groups, roles, spaces, busy, apply, setBusy };
}

function ListShell({ toolbar, head, children }: { toolbar?: ReactNode; head?: ReactNode; children?: ReactNode }) {
  return (
    <div className="am-work">
      <div className="am-toolbar">{toolbar}</div>
      {head}
      <EdgeFade className="am-list-wrap">{children}</EdgeFade>
    </div>
  );
}

function ListHead({ cells, grip, className }: { cells?: ReactNode; grip?: boolean; className?: string }) {
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

function holdersLine(users: number, groups: number): string {
  return `${tp("access.nUsers", users || 0)} · ${tp("access.nGroups", groups || 0)}`;
}

function bits(names: (string | null | undefined)[] | null | undefined): string {
  const list = (names || []).filter(Boolean);
  if (!list.length) return "—";
  if (list.length <= 2) return list.join(", ");
  return `${list.slice(0, 2).join(", ")} +${list.length - 2}`;
}

type FilterItem = { id: string; label: ReactNode };

function FilterBar({
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

function SearchField({
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

function StatusText({ off }: { off?: boolean }) {
  return (
    <span className={`am-status${off ? " is-off" : ""}`}>
      {off ? t("access.disabled") : t("access.active")}
    </span>
  );
}

function PermWord({
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

function PermChips({
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

function PermLine({
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

function ResourceTree({
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
                <Lock className="size-3" aria-label={t("access.restricted")} {...{ title: t("access.restricted") }} />
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

function EffectiveTree({
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

function WhyPanel({ info, onClose }: { info: Decision | null | undefined; onClose: () => void }) {
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

function ExpandCard({
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

function DiscardAsk({
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

function PermBlocks({
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

function PasswordHint({ value, required = false }: { value?: string; required?: boolean }) {
  const pwd = String(value || "");
  if (!required && !pwd) return null;
  const meter = passwordMeter(pwd);
  const tone =
    meter.strength === "short" || meter.strength === "weak"
      ? "is-warn"
      : meter.strength === "good" || meter.strength === "strong"
        ? "is-ok"
        : "";
  const strength = pwd ? t(`users.pw${meter.strength[0].toUpperCase()}${meter.strength.slice(1)}`) : t("users.passwordMin", { n: PASSWORD_MIN });
  const remain = meter.remaining > 0 ? tp("users.passwordRemain", meter.remaining) : tp("users.passwordLeft", meter.left);
  return (
    <p className={`theme-css-meta am-pw-hint ${tone}`}>
      <span>{strength}</span>
      <span>{remain}</span>
    </p>
  );
}

function RowActions({
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
    return <FormActions busy={Boolean(busy)} disabled={saveDisabled} onCancel={onCancel} />;
  }
  return (
    <div className="am-actions">
      {extra || danger ? (
        <div className="am-actions-start">
          {extra}
          {danger}
        </div>
      ) : null}
      {onEdit ? (
        <Button type="button" onClick={onEdit}>
          {t("actions.edit")}
        </Button>
      ) : null}
    </div>
  );
}

type UserDraft = {
  id: string;
  username: string;
  password: string;
  password2: string;
  roleIds: string[];
  groupIds: string[];
  grants: GrantInput[];
  disabled: boolean;
  source: string;
};

export function AccessUsers({
  token,
  actor,
  spaces: seedSpaces,
}: {
  token: string;
  actor?: Actor;
  spaces?: Space[];
}) {
  const dir = useDirectory(token);
  const spaces = dir.spaces.length ? dir.spaces : seedSpaces || [];
  const expand = useExpandSession();
  const snap = useRef<UserDraft | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [draft, setDraft] = useState<UserDraft | null>(null);
  const [why, setWhy] = useState<Decision | null>(null);
  const [confirm, setConfirm] = useState<User | null>(null);
  const creating = expand.openId === NEW_ROW;
  const people = dir.users;
  const canCreate = Boolean(actor?.canManageUsers);
  const lockedOwner = draft?.id === "admin";
  const current = people.find((u) => u.id === expand.openId);

  const filtered = people.filter((u) => {
    if (filter === "disabled" && !u.disabled) return false;
    if (filter === "local" && (u.source === "ad" || u.source === "oidc")) return false;
    if (filter === "remote" && u.source !== "ad" && u.source !== "oidc") return false;
    if (q && !prettyLogin(u.username).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  const col = useColSort();
  const sorted = useMemo(
    () =>
      col.apply(filtered, (u, key) => {
        if (key === "user") return prettyLogin(u.username);
        if (key === "role")
          return effectiveRoleIds(u, dir.groups).map((id) => roleTitle(id, dir.roles)).join(", ");
        if (key === "type") return typeLabel(u.source);
        if (key === "status") return u.disabled ? 1 : 0;
        return "";
      }),
    [filtered, col, dir.groups, dir.roles],
  );

  function userDraft(u: User): UserDraft {
    return {
      id: u.id,
      username: u.username || "",
      password: "",
      password2: "",
      roleIds: [...(u.roleIds || [])],
      groupIds: [...(u.groupIds || [])],
      grants: clone(u.grants || []),
      disabled: Boolean(u.disabled),
      source: u.source || "local",
    };
  }
  function blankDraft(): UserDraft {
    return {
      id: "",
      username: "",
      password: "",
      password2: "",
      roleIds: ["lecteur"],
      groupIds: [],
      grants: [],
      disabled: false,
      source: "local",
    };
  }
  function load(next: UserDraft | null, edit?: boolean) {
    snap.current = next ? clone(next) : null;
    setDraft(next);
    setWhy(null);
    expand.markDirty(false);
    if (edit) expand.setEditing(true);
  }
  function patch(next: UserDraft) {
    setDraft(next);
    expand.markDirty(!same(next, snap.current));
  }
  function toggleRow(u: User) {
    if (expand.openId === u.id) {
      expand.requestClose(() => load(null));
      return;
    }
    expand.requestOpen(u.id, { apply: () => load(userDraft(u)) });
  }
  function openCreate() {
    expand.requestOpen(NEW_ROW, { edit: true, apply: () => load(blankDraft(), true) });
  }
  function beginEdit() {
    if (!draft) return;
    snap.current = clone(draft);
    expand.markDirty(false);
    expand.setEditing(true);
  }
  function cancelEdit() {
    if (creating) {
      expand.markDirty(false);
      expand.requestClose(() => load(null));
      return;
    }
    const restored = snap.current ? clone(snap.current) : draft;
    load(restored);
    expand.setEditing(false);
  }
  async function save() {
    if (!draft?.username?.trim()) return;
    const pwd = draft.password || "";
    if (draft.id === "admin" && pwd && pwd !== (draft.password2 || "")) {
      toast.error(t("access.passwordMismatch"));
      return;
    }
    const pwdErr = (creating || pwd) ? passwordPolicyError(pwd) : "";
    if (pwdErr) {
      toast.error(te(new Error(pwdErr)));
      return;
    }
    dir.setBusy(true);
    try {
      const res = await saveUser({
        data: {
          token,
          id: draft.id || undefined,
          username: draft.username,
          password: pwd || undefined,
          roleIds: draft.roleIds,
          groupIds: draft.groupIds,
          grants: draft.grants,
          disabled: draft.disabled,
        },
      });
      dir.apply(res);
      toast.success(t("toast.saved"));
      const saved: User | undefined =
        (res.users || []).find((u: User) => u.id === draft.id) ||
        (res.users || []).find((u: User) => u.username === draft.username.trim().toLowerCase());
      if (saved) {
        expand.stay(saved.id);
        load(userDraft(saved));
      } else {
        expand.stay(draft.id || null);
        patch({ ...draft, password: "" });
        snap.current = clone({ ...draft, password: "" } as UserDraft);
        expand.markDirty(false);
        expand.setEditing(false);
      }
    } catch (err) {
      if (!sessionGone(err)) toast.error(te(err));
    } finally {
      dir.setBusy(false);
    }
  }
  async function setDisabled(u: User, disabled: boolean) {
    dir.setBusy(true);
    try {
      dir.apply(
        await saveUser({
          data: {
            token,
            id: u.id,
            username: u.username || "",
            roleIds: u.roleIds,
            groupIds: u.groupIds,
            grants: u.grants,
            disabled,
          },
        }),
      );
      toast.success(t("toast.saved"));
      if (draft && draft.id === u.id) {
        const next = { ...draft, disabled };
        snap.current = clone({ ...(snap.current as UserDraft), disabled });
        setDraft(next);
      }
    } catch (err) {
      if (!sessionGone(err)) toast.error(te(err));
    } finally {
      dir.setBusy(false);
    }
  }
  async function remove(u: User) {
    dir.setBusy(true);
    try {
      dir.apply(await deleteUser({ data: { token, id: u.id } }));
      toast.success(t("users.deleted"));
      setConfirm(null);
      expand.markDirty(false);
      expand.requestClose(() => load(null));
    } catch (err) {
      if (!sessionGone(err)) toast.error(te(err));
    } finally {
      dir.setBusy(false);
    }
  }

  const rows = creating
    ? [
        {
          id: NEW_ROW,
          username: draft?.username || t("access.newUser"),
          roleIds: draft?.roleIds || [],
          disabled: false,
          phantom: true,
        },
        ...sorted,
      ]
    : sorted;
  const empty = !dir.busy && !filtered.length && !creating;

  return (
    <ListShell
      toolbar={
        <>
          <SearchField value={q} onChange={setQ} placeholder={t("nav.search")} />
          <FilterBar
            value={filter}
            onChange={setFilter}
            label={t("access.colType")}
            items={[
              { id: "all", label: t("access.filterAll") },
              { id: "local", label: t("lock.local") },
              { id: "remote", label: t("access.typeRemote") },
              { id: "disabled", label: t("access.disabled") },
            ]}
          />
          {canCreate ? (
            <button type="button" className="am-create shrink-0" onClick={openCreate}>
              <Plus className="size-3.5" /> {t("access.create")}
            </button>
          ) : null}
        </>
      }
      head={
        empty ? null : (
          <ListHead
            className="is-typed"
            cells={[
              <SortLabel key="u" id="user" sort={col.sort} onToggle={col.toggle} count={filtered.length}>
                {t("access.colUser")}
              </SortLabel>,
              <SortLabel key="r" id="role" sort={col.sort} onToggle={col.toggle} count={filtered.length}>
                {t("users.role")}
              </SortLabel>,
              <SortLabel key="t" id="type" sort={col.sort} onToggle={col.toggle} count={filtered.length}>
                {t("access.colType")}
              </SortLabel>,
              <SortLabel key="s" id="status" sort={col.sort} onToggle={col.toggle} count={filtered.length}>
                {t("access.colStatus")}
              </SortLabel>,
            ]}
          />
        )
      }
    >
      {empty ? (
        <EmptyState
          compact
          icon={Users}
          text={t("access.empty")}
          action={
            canCreate ? (
              <Button type="button" onClick={openCreate}>
                {t("access.create")}
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="am-list is-typed" role="list">
          {rows.map((u) => {
            const open = expand.openId === u.id || (u.phantom && creating);
            const rowDraft = open ? draft : null;
            const view = current?.id === u.id && !u.phantom ? current : u;
            const remoteManaged = view.source === "ad" || view.source === "oidc";
            const effTitles = effectiveRoleIds(rowDraft || u, dir.groups).map((id) =>
              roleTitle(id, dir.roles),
            );
            const groupNames = dir.groups
              .filter(
                (g) =>
                  ((rowDraft ? rowDraft.groupIds : u.groupIds) || []).includes(g.id) ||
                  (g.members || []).includes(u.id || ""),
              )
              .map((g) => g.name);
            const liveUser = {
              id: u.phantom ? "_new" : view.id,
              username: rowDraft?.username || u.username,
              roleIds: rowDraft?.roleIds || u.roleIds,
              groupIds: rowDraft?.groupIds || u.groupIds,
              grants: rowDraft?.grants || view.grants,
              source: rowDraft?.source || u.source,
              disabled: rowDraft ? rowDraft.disabled : u.disabled,
            };
            const body = rowDraft ? (
              <>
                {expand.editing ? (
                  <ExpandCard
                    kicker={t("access.secIdentity")}
                    hint={lockedOwner ? t("access.roleLocked") : undefined}
                  >
                    {lockedOwner ? (
                      <>
                        <div className="field-row">
                          <Field label={t("users.newPassword")}>
                            <Input
                              className={INPUT_SM}
                              type="password"
                              value={rowDraft.password}
                              autoComplete="new-password"
                              maxLength={PASSWORD_MAX}
                              onChange={(e) => patch({ ...rowDraft, password: e.target.value })}
                            />
                            <PasswordHint value={rowDraft.password} />
                          </Field>
                          <Field label={t("access.confirmPassword")}>
                            <Input
                              className={INPUT_SM}
                              type="password"
                              value={rowDraft.password2 || ""}
                              autoComplete="new-password"
                              maxLength={PASSWORD_MAX}
                              onChange={(e) =>
                                patch({ ...rowDraft, password2: e.target.value })
                              }
                            />
                            <PasswordHint value={rowDraft.password2 || ""} />
                          </Field>
                        </div>
                        <p className="settings-hint">{t("users.passwordKeep")}</p>
                        {rowDraft.password &&
                        rowDraft.password !== (rowDraft.password2 || "") ? (
                          <p className="settings-hint is-warn">{t("access.passwordMismatch")}</p>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <div className="field-row">
                          <Field label={t("lock.username")}>
                            <Input
                              className={INPUT_SM}
                              value={rowDraft.username}
                              autoComplete="off"
                              onChange={(e) => patch({ ...rowDraft, username: e.target.value })}
                            />
                          </Field>
                          <Field label={creating ? t("lock.password") : t("users.newPassword")}>
                            <Input
                              className={INPUT_SM}
                              type="password"
                              value={rowDraft.password}
                              autoComplete="new-password"
                              maxLength={PASSWORD_MAX}
                              onChange={(e) => patch({ ...rowDraft, password: e.target.value })}
                            />
                            <PasswordHint value={rowDraft.password} required={creating} />
                          </Field>
                        </div>
                        <div className="settings-toggles">
                          <label>
                            <input
                              type="checkbox"
                              checked={Boolean(rowDraft.disabled)}
                              onChange={() =>
                                patch({ ...rowDraft, disabled: !rowDraft.disabled })
                              }
                            />
                            {t("access.disabled")}
                          </label>
                        </div>
                      </>
                    )}
                  </ExpandCard>
                ) : lockedOwner ? (
                  <p className="am-meta">{t("access.adminAccountHint")}</p>
                ) : null}
                {!lockedOwner ? (
                  <>
                    <ExpandCard
                      kicker={t("access.secAccess")}
                      hint={remoteManaged ? t("access.remoteManagedHint") : undefined}
                    >
                      {expand.editing ? (
                        <div className="field-row">
                          <Field label={t("users.role")}>
                            <EntityPicker
                              kind="role"
                              items={dir.roles.filter((r) => r.id !== "owner")}
                              selectedIds={
                                remoteManaged
                                  ? effectiveRoleIds(rowDraft || u, dir.groups)
                                  : rowDraft.roleIds || []
                              }
                              labelOf={(r) => roleTitle(r.id, dir.roles)}
                              providers={[
                                { id: "local", label: t("access.idpTypeLocal"), kind: "local" },
                              ]}
                              readOnly={remoteManaged}
                              onChange={(ids) =>
                                patch({ ...rowDraft, roleIds: ids.length ? ids : ["lecteur"] })
                              }
                            />
                          </Field>
                          <Field label={t("access.groupsOf")}>
                            <EntityPicker
                              kind="group"
                              items={dir.groups}
                              selectedIds={rowDraft.groupIds || []}
                              labelOf={(g) => g.name}
                              providers={[{ id: "local", label: t("access.idpTypeLocal"), kind: "local" }]}
                              readOnly={remoteManaged}
                              onChange={(ids) => patch({ ...rowDraft, groupIds: ids })}
                            />
                          </Field>
                        </div>
                      ) : (
                        <div className="field-row">
                          <Field label={t("users.role")}>
                            <ChipList names={effTitles} />
                          </Field>
                          <Field label={t("access.groupsOf")}>
                            <ChipList names={groupNames} />
                          </Field>
                        </div>
                      )}
                    </ExpandCard>
                    <ExpandCard kicker={t("access.secPermissions")}>
                      <PermBlocks
                        user={liveUser}
                        dir={dir}
                        spaces={spaces}
                        grants={rowDraft.grants || []}
                        setGrants={(g) => patch({ ...rowDraft, grants: g })}
                        editing={expand.editing}
                        why={why}
                        setWhy={setWhy}
                      />
                    </ExpandCard>
                  </>
                ) : null}
                <RowActions
                  editing={expand.editing}
                  onEdit={canCreate || lockedOwner ? beginEdit : null}
                  onCancel={cancelEdit}
                  busy={dir.busy}
                  saveDisabled={
                    !rowDraft.username.trim() ||
                    Boolean(
                      (creating || rowDraft.password) && passwordPolicyError(rowDraft.password || ""),
                    ) ||
                    (lockedOwner &&
                      Boolean(rowDraft.password) &&
                      rowDraft.password !== (rowDraft.password2 || ""))
                  }
                  extra={
                    !expand.editing && !creating && !lockedOwner ? (
                      <button
                        type="button"
                        className="am-text-btn"
                        onClick={() => void setDisabled(view, !view.disabled)}
                      >
                        {view.disabled ? t("access.enable") : t("access.disable")}
                      </button>
                    ) : null
                  }
                  danger={
                    !expand.editing && !creating && !lockedOwner ? (
                      <button
                        type="button"
                        className="am-text-btn is-danger"
                        onClick={() => setConfirm(view)}
                      >
                        {t("access.deleteConfirm")}
                      </button>
                    ) : null
                  }
                />
              </>
            ) : null;
            return (
              <ExpandRow
                key={u.id}
                id={u.id}
                expanded={open}
                onToggle={() => (u.phantom ? expand.requestClose(() => load(null)) : toggleRow(u))}
                cells={[
                  <span key="n" className="am-row-title">
                    {prettyLogin(rowDraft?.username || u.username) || t("access.newUser")}
                  </span>,
                  <span key="c" className="am-dim" title={effTitles.join(", ")}>
                    {effTitles[0] || "—"}
                    {effTitles.length > 1 ? ` +${effTitles.length - 1}` : ""}
                  </span>,
                  <span key="t" className="am-dim">
                    {typeLabel(u.source)}
                  </span>,
                  <span key="s" className="am-dim">
                    <StatusText off={rowDraft ? rowDraft.disabled : u.disabled} />
                  </span>,
                ]}
              >
                {rowDraft && expand.editing ? (
                  <form
                    className="settings-stack"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void save();
                    }}
                  >
                    {body}
                  </form>
                ) : rowDraft ? (
                  <div className="settings-stack">{body}</div>
                ) : null}
              </ExpandRow>
            );
          })}
        </div>
      )}
      {confirm ? (
        <ConfirmPopup
          title={t("access.deleteUserTitle", { name: prettyLogin(confirm.username) })}
          body={t("access.deleteUserBody")}
          busy={dir.busy}
          onCancel={() => setConfirm(null)}
          onOk={() => void remove(confirm)}
        />
      ) : null}
      <DiscardAsk ask={expand.ask} onKeep={expand.dismissAsk} onDiscard={expand.confirmAsk} />
    </ListShell>
  );
}

type GroupDraft = {
  id: string;
  name: string;
  roleIds: string[];
  members: string[];
  grants: GrantInput[];
  source: string;
};

export function AccessGroups({
  token,
  actor,
  spaces: seedSpaces,
  directories,
}: {
  token: string;
  actor?: Actor;
  spaces?: Space[];
  directories?: LdapDirectory[];
}) {
  const dir = useDirectory(token);
  const spaces = dir.spaces.length ? dir.spaces : seedSpaces || [];
  const expand = useExpandSession();
  const snap = useRef<GroupDraft | null>(null);
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<GroupDraft | null>(null);
  const [why, setWhy] = useState<Decision | null>(null);
  const [confirm, setConfirm] = useState<Group | null>(null);
  const creating = expand.openId === NEW_ROW;
  const [typeFilter, setTypeFilter] = useState("all");
  const filtered = dir.groups.filter((g) => {
    if (!q || (g.name || "").toLowerCase().includes(q.toLowerCase())) {
      if (typeFilter === "local" && (g.source === "ad" || g.source === "oidc")) return false;
      if (typeFilter === "remote" && g.source !== "ad" && g.source !== "oidc") return false;
      return true;
    }
    return false;
  });
  const col = useColSort();
  const sorted = useMemo(
    () =>
      col.apply(filtered, (g, key) => {
        if (key === "name") return g.name || "";
        if (key === "role")
          return (g.roleIds || []).map((id) => roleTitle(id, dir.roles)).join(", ");
        if (key === "type") return typeLabel(g.source);
        if (key === "members") return (g.members || []).length;
        return "";
      }),
    [filtered, col, dir.roles],
  );
  const canCreate = Boolean(actor?.canManageGroups || actor?.canManageUsers);
  const people = dir.users.filter((u) => u.id !== "admin");
  const current = dir.groups.find((g) => g.id === expand.openId);
  const readyDirs = (directories || []).filter(
    (d) => d.enabled && String(d.host || "").trim() && String(d.domain || "").trim(),
  );
  const providers = pickerProviders(readyDirs);
  const adProviders = providers.filter((p) => p.kind === "ad");

  const searchDirGroups = useCallback(async (directoryId: string, query: string) => {
    const res = await searchLdapGroups({ data: { token, directoryId, query } });
    return (res.groups || []) as LdapGroupHit[];
  }, [token]);
  async function linkDirGroups(directoryId: string, rows: LdapGroupHit[]) {
    if (!rows.length) return;
    dir.setBusy(true);
    try {
      dir.apply(
        await linkLdapGroups({
          data: {
            token,
            directoryId,
            groups: rows.map((r) => ({ dn: r.dn, name: r.name })),
          },
        }),
      );
      toast.success(tp("access.groupsLinked", rows.length));
    } catch (err) {
      if (!sessionGone(err)) toast.error(te(err));
    } finally {
      dir.setBusy(false);
    }
  }

  function groupDraft(g: Group): GroupDraft {
    return {
      id: g.id,
      name: g.name || "",
      roleIds: [...(g.roleIds || [])],
      members: [...(g.members || [])],
      grants: clone(g.grants || []),
      source: g.source || "local",
    };
  }
  function blankDraft(): GroupDraft {
    return { id: "", name: "", roleIds: ["lecteur"], members: [], grants: [], source: "local" };
  }
  function load(next: GroupDraft | null, edit?: boolean) {
    snap.current = next ? clone(next) : null;
    setDraft(next);
    setWhy(null);
    expand.markDirty(false);
    if (edit) expand.setEditing(true);
  }
  function patch(next: GroupDraft) {
    setDraft(next);
    expand.markDirty(!same(next, snap.current));
  }
  function toggleRow(g: Group) {
    if (expand.openId === g.id) {
      expand.requestClose(() => load(null));
      return;
    }
    expand.requestOpen(g.id, { apply: () => load(groupDraft(g)) });
  }
  function openCreate() {
    expand.requestOpen(NEW_ROW, { edit: true, apply: () => load(blankDraft(), true) });
  }
  function beginEdit() {
    if (!draft) return;
    snap.current = clone(draft);
    expand.markDirty(false);
    expand.setEditing(true);
  }
  function cancelEdit() {
    if (creating) {
      expand.markDirty(false);
      expand.requestClose(() => load(null));
      return;
    }
    load(snap.current ? clone(snap.current) : draft);
    expand.setEditing(false);
  }
  async function save() {
    if (!draft?.name?.trim()) return;
    dir.setBusy(true);
    try {
      const res = await saveGroup({
        data: {
          token,
          id: draft.id || undefined,
          name: draft.name,
          roleIds: draft.roleIds,
          members: draft.members,
          grants: draft.grants,
        },
      });
      dir.apply(res);
      toast.success(t("toast.saved"));
      const saved: Group | undefined =
        (res.groups || []).find((g: Group) => g.id === draft.id) ||
        (res.groups || []).find((g: Group) => (g.name || "").toLowerCase() === draft.name.trim().toLowerCase());
      if (saved) {
        expand.stay(saved.id);
        load(groupDraft(saved));
      } else {
        expand.stay(draft.id || null);
        expand.setEditing(false);
        expand.markDirty(false);
      }
    } catch (err) {
      if (!sessionGone(err)) toast.error(te(err));
    } finally {
      dir.setBusy(false);
    }
  }
  async function remove(g: Group) {
    dir.setBusy(true);
    try {
      dir.apply(await deleteGroup({ data: { token, id: g.id } }));
      toast.success(t("access.deletedGroup"));
      setConfirm(null);
      expand.markDirty(false);
      expand.requestClose(() => load(null));
    } catch (err) {
      if (!sessionGone(err)) toast.error(te(err));
    } finally {
      dir.setBusy(false);
    }
  }
  async function sync(g: Group) {
    dir.setBusy(true);
    try {
      dir.apply(await syncLdapGroup({ data: { token, groupId: g.id } }));
      toast.success(t("access.groupSynced"));
    } catch (err) {
      if (!sessionGone(err)) toast.error(te(err));
    } finally {
      dir.setBusy(false);
    }
  }

  type GroupRow =
    | Group
    | { id: string; name: string; roleIds: string[]; members: string[]; phantom: true; source?: string };
  const rows: GroupRow[] = creating
    ? [
        {
          id: NEW_ROW,
          name: draft?.name || t("access.newGroup"),
          roleIds: draft?.roleIds || [],
          members: draft?.members || [],
          phantom: true,
        },
        ...sorted,
      ]
    : sorted;
  const empty = !dir.busy && !filtered.length && !creating;

  return (
    <ListShell
      toolbar={
        <>
          <SearchField value={q} onChange={setQ} placeholder={t("nav.search")} />
          <FilterBar
            value={typeFilter}
            onChange={setTypeFilter}
            label={t("access.colType")}
            items={[
              { id: "all", label: t("access.filterAll") },
              { id: "local", label: t("lock.local") },
              { id: "remote", label: t("access.typeRemote") },
            ]}
          />
          <div className="am-toolbar-actions">
            {canCreate && adProviders.length ? (
              <EntityPicker
                kind="group"
                items={[]}
                selectedIds={[]}
                trigger="button"
                addLabel={t("access.addFromDir")}
                providers={adProviders}
                excludeIds={dir.groups.filter((g) => g.source === "ad").map((g) => g.externalId)}
                labelOf={(g) => g.name || ""}
                onChange={() => {}}
                searchRemote={searchDirGroups}
                onRemoteAdd={linkDirGroups}
              />
            ) : null}
            {canCreate ? (
              <button type="button" className="am-create shrink-0" onClick={openCreate}>
                <Plus className="size-3.5" /> {t("access.createGroup")}
              </button>
            ) : null}
          </div>
        </>
      }
      head={
        empty ? null : (
          <ListHead
            className="is-typed is-actions"
            cells={[
              <SortLabel key="n" id="name" sort={col.sort} onToggle={col.toggle} count={filtered.length}>
                {t("access.groupName")}
              </SortLabel>,
              <SortLabel key="r" id="role" sort={col.sort} onToggle={col.toggle} count={filtered.length}>
                {t("users.role")}
              </SortLabel>,
              <SortLabel key="t" id="type" sort={col.sort} onToggle={col.toggle} count={filtered.length}>
                {t("access.colType")}
              </SortLabel>,
              <SortLabel key="m" id="members" sort={col.sort} onToggle={col.toggle} count={filtered.length}>
                {t("access.members")}
              </SortLabel>,
              <span key="a" className="am-row-action" />,
            ]}
          />
        )
      }
    >
      {empty ? (
        <EmptyState
          compact
          icon={Folder}
          text={t("access.noGroups")}
          action={
            canCreate ? (
              <Button type="button" onClick={openCreate}>
                {t("access.createGroup")}
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="am-list is-typed is-actions" role="list">
          {rows.map((g) => {
            const open = expand.openId === g.id || (("phantom" in g && g.phantom) && creating);
            const rowDraft = open ? draft : null;
            const view: GroupRow = current?.id === g.id && !("phantom" in g) ? current : g;
            const isAd = view.source === "ad";
            return (
              <ExpandRow
                key={g.id}
                id={g.id}
                expanded={open}
                onToggle={() => ("phantom" in g ? expand.requestClose(() => load(null)) : toggleRow(g))}
                cells={[
                  <span key="n" className="am-row-title">
                    {rowDraft?.name || g.name || t("access.newGroup")}
                  </span>,
                  <span key="c" className="am-dim">
                    {bits(
                      (rowDraft?.roleIds || g.roleIds || []).map((id) => roleTitle(id, dir.roles)),
                    )}
                  </span>,
                  <span key="t" className="am-dim">
                    {typeLabel(g.source)}
                  </span>,
                  <span key="m" className="am-dim">
                    {tp("access.memberCount", (rowDraft?.members || g.members || []).length)}
                  </span>,
                  <span key="a" className="am-row-action">
                    {isAd && !("phantom" in view) ? (
                      <button
                        type="button"
                        className="card-tool"
                        disabled={dir.busy}
                        title={t("access.syncGroup")}
                        aria-label={t("access.syncGroup")}
                        onClick={() => void sync(view)}
                      >
                        <RefreshCw className="size-3.5" />
                      </button>
                    ) : null}
                  </span>,
                ]}
              >
                {rowDraft ? (
                  <form
                    className="settings-stack"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (expand.editing) void save();
                    }}
                  >
                    {expand.editing ? (
                      <ExpandCard kicker={t("access.secIdentity")}>
                        <Field label={t("access.groupName")}>
                          <Input
                            className={INPUT_SM}
                            value={rowDraft.name}
                            disabled={view.source === "ad"}
                            onChange={(e) => patch({ ...rowDraft, name: e.target.value })}
                          />
                        </Field>
                      </ExpandCard>
                    ) : null}
                    <ExpandCard
                      kicker={t("access.secAccess")}
                      hint={view.source === "ad" ? t("access.adMembersHint") : undefined}
                    >
                      {expand.editing ? (
                        <div className="field-row">
                          <Field label={t("users.role")}>
                            <EntityPicker
                              kind="role"
                              items={dir.roles.filter((r) => r.id !== "owner")}
                              selectedIds={rowDraft.roleIds || []}
                              labelOf={(r) => roleTitle(r.id, dir.roles)}
                              providers={[
                                { id: "local", label: t("access.idpTypeLocal"), kind: "local" },
                              ]}
                              onChange={(ids) =>
                                patch({
                                  ...rowDraft,
                                  roleIds:
                                    view.source === "ad" || view.source === "oidc"
                                      ? ids
                                      : ids.length
                                        ? ids
                                        : ["lecteur"],
                                })
                              }
                            />
                          </Field>
                          <Field label={t("access.members")}>
                            <EntityPicker
                              kind="user"
                              items={people}
                              selectedIds={rowDraft.members || []}
                              labelOf={(u) => prettyLogin(u.username)}
                              providers={providers}
                              readOnly={view.source === "ad"}
                              onChange={(ids) => patch({ ...rowDraft, members: ids })}
                            />
                          </Field>
                        </div>
                      ) : (
                        <div className="field-row">
                          <Field label={t("users.role")}>
                            <ChipList
                              names={(rowDraft.roleIds || []).map((id) => roleTitle(id, dir.roles))}
                            />
                          </Field>
                          <Field label={t("access.members")}>
                            <ChipList
                              names={(rowDraft.members || []).map((id) =>
                                prettyLogin(people.find((u) => u.id === id)?.username || id),
                              )}
                            />
                          </Field>
                        </div>
                      )}
                    </ExpandCard>
                    <ExpandCard kicker={t("access.secPermissions")}>
                      <PermBlocks
                        user={syntheticUserFromGroup({
                          id: "phantom" in view ? "_new" : view.id,
                          name: rowDraft.name,
                          roleIds: rowDraft.roleIds,
                          grants: rowDraft.grants,
                          members: rowDraft.members,
                        })}
                        dir={{ ...dir, spaces }}
                        spaces={spaces}
                        grants={rowDraft.grants || []}
                        setGrants={(next) => patch({ ...rowDraft, grants: next })}
                        editing={expand.editing}
                        why={why}
                        setWhy={setWhy}
                      />
                    </ExpandCard>
                    <RowActions
                      editing={expand.editing}
                      onEdit={canCreate ? beginEdit : null}
                      onCancel={cancelEdit}
                      busy={dir.busy}
                      saveDisabled={!rowDraft.name.trim()}
                      danger={
                        !expand.editing && !creating ? (
                          <button
                            type="button"
                            className="am-text-btn is-danger"
                            onClick={() => setConfirm(view)}
                          >
                            {t("access.deleteConfirm")}
                          </button>
                        ) : null
                      }
                    />
                  </form>
                ) : null}
              </ExpandRow>
            );
          })}
        </div>
      )}
      {confirm ? (
        <ConfirmPopup
          title={t("access.deleteGroupTitle", { name: confirm.name })}
          body={t("access.deleteGroupBody", {
            members: tp("access.memberCount", (confirm.members || []).length),
          })}
          busy={dir.busy}
          onCancel={() => setConfirm(null)}
          onOk={() => void remove(confirm)}
        />
      ) : null}
      <DiscardAsk ask={expand.ask} onKeep={expand.dismissAsk} onDiscard={expand.confirmAsk} />
    </ListShell>
  );
}

type RoleDraft = {
  id: string;
  name: string;
  description: string;
  grants: GrantInput[];
  userIds: string[];
  groupIds: string[];
  system: boolean;
};
type RoleRow = Role & { userCount?: number; groupCount?: number };

export function AccessRoles({
  token,
  spaces: seedSpaces,
  directories,
}: {
  token: string;
  spaces?: Space[];
  directories?: LdapDirectory[];
}) {
  const dir = useDirectory(token);
  const spaces = dir.spaces.length ? dir.spaces : seedSpaces || [];
  const expand = useExpandSession();
  const snap = useRef<RoleDraft | null>(null);
  const [draft, setDraft] = useState<RoleDraft | null>(null);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [basedOn, setBasedOn] = useState("");
  const [confirm, setConfirm] = useState<RoleRow | null>(null);
  const [filter, setFilter] = useState("all");
  const creating = expand.openId === NEW_ROW;
  const current = dir.roles.find((r) => r.id === expand.openId);
  const qn = search.trim().toLowerCase();
  const filteredRoles = dir.roles.filter((r) => {
    if (filter === "system" && !r.system) return false;
    if (filter === "custom" && r.system) return false;
    if (qn && !roleTitle(r.id, dir.roles).toLowerCase().includes(qn)) return false;
    return true;
  });
  const col = useColSort();
  const sortedRoles = useMemo(
    () =>
      col.apply(filteredRoles, (r, key) => {
        if (key === "name") return roleTitle(r.id, dir.roles);
        if (key === "holders")
          return (r.userCount || 0) + (r.groupCount || 0);
        if (key === "type") return r.system ? 0 : 1;
        return "";
      }),
    [filteredRoles, col, dir.roles],
  );
  const providers = pickerProviders(directories);

  function holders(r: Role) {
    return {
      userIds: dir.users
        .filter((u) => (u.roleIds || []).includes(r.id) && u.id !== "admin")
        .map((u) => u.id),
      groupIds: dir.groups.filter((g) => (g.roleIds || []).includes(r.id)).map((g) => g.id),
    };
  }
  function roleDraft(r: Role): RoleDraft {
    const h = holders(r);
    return {
      id: r.id,
      name: r.name || "",
      description: r.description || "",
      grants: clone(r.grants || []),
      userIds: h.userIds,
      groupIds: h.groupIds,
      system: Boolean(r.system),
    };
  }
  function blankDraft(from?: Role): RoleDraft {
    const src = from || dir.roles.find((r) => r.id === basedOn);
    const copied = Boolean(from && src);
    return {
      id: "",
      name: copied
        ? `${String(src?.name || "").replace(/\s*\((copie|copy)\)\s*$/i, "")} (${t("copy.suffix")})`.slice(
            0,
            40,
          )
        : "",
      description: src?.description || "",
      grants: src ? clone(src.grants || []) : [],
      userIds: [],
      groupIds: [],
      system: false,
    };
  }
  function load(next: RoleDraft | null, edit?: boolean) {
    snap.current = next ? clone(next) : null;
    setDraft(next);
    expand.markDirty(false);
    if (edit) expand.setEditing(true);
  }
  function patch(next: RoleDraft) {
    setDraft(next);
    expand.markDirty(!same(next, snap.current));
  }
  function toggleRow(r: Role) {
    if (expand.openId === r.id) {
      expand.requestClose(() => load(null));
      return;
    }
    expand.requestOpen(r.id, { apply: () => load(roleDraft(r)) });
  }
  function openCreate(from?: Role) {
    expand.requestOpen(NEW_ROW, { edit: true, apply: () => load(blankDraft(from), true) });
  }
  function beginEdit() {
    if (!draft || draft.id === "owner") return;
    snap.current = clone(draft);
    expand.markDirty(false);
    expand.setEditing(true);
  }
  function cancelEdit() {
    if (creating) {
      expand.markDirty(false);
      expand.requestClose(() => load(null));
      return;
    }
    load(snap.current ? clone(snap.current) : draft);
    expand.setEditing(false);
  }
  async function save() {
    if (!draft?.name?.trim()) return;
    dir.setBusy(true);
    try {
      const res = await saveRole({
        data: {
          token,
          id: draft.id || undefined,
          name: draft.name.trim(),
          description: draft.description,
          grants: draft.grants,
          userIds: draft.userIds,
          groupIds: draft.groupIds,
        },
      });
      dir.apply(res);
      toast.success(t("toast.saved"));
      const saved: Role | undefined =
        (res.roles || []).find((r: Role) => r.id === draft.id) ||
        (res.roles || []).find((r: Role) => (r.name || "").toLowerCase() === draft.name.trim().toLowerCase());
      if (saved) {
        expand.stay(saved.id);
        load(roleDraft(saved));
      } else {
        expand.stay(draft.id || null);
        expand.setEditing(false);
        expand.markDirty(false);
      }
    } catch (err) {
      if (!sessionGone(err)) toast.error(te(err));
    } finally {
      dir.setBusy(false);
    }
  }
  async function remove(r: RoleRow) {
    dir.setBusy(true);
    try {
      dir.apply(await deleteRole({ data: { token, id: r.id } }));
      toast.success(t("access.deletedRole"));
      setConfirm(null);
      expand.markDirty(false);
      expand.requestClose(() => load(null));
    } catch (err) {
      if (!sessionGone(err)) toast.error(te(err));
    } finally {
      dir.setBusy(false);
    }
  }

  type RoleTableRow =
    | RoleRow
    | { id: string; name: string; system: boolean; userCount: number; groupCount: number; phantom: true };
  const rows: RoleTableRow[] = creating
    ? [
        {
          id: NEW_ROW,
          name: draft?.name || t("access.createRole"),
          system: false,
          userCount: 0,
          groupCount: 0,
          phantom: true,
        },
        ...sortedRoles,
      ]
    : sortedRoles;
  const empty = !dir.busy && !filteredRoles.length && !creating;
  const defLocked = Boolean(draft?.system || isSystemRole(draft?.id));
  const holdersLocked = draft?.id === "owner";

  return (
    <ListShell
      toolbar={
        <>
          <SearchField value={search} onChange={setSearch} placeholder={t("access.searchRoles")} />
          <FilterBar
            value={filter}
            onChange={setFilter}
            label={t("access.colType")}
            items={[
              { id: "all", label: t("access.filterAll") },
              { id: "system", label: t("access.system") },
              { id: "custom", label: t("access.custom") },
            ]}
          />
          <button type="button" className="am-create shrink-0" onClick={() => openCreate()}>
            <Plus className="size-3.5" /> {t("access.createRole")}
          </button>
        </>
      }
      head={
        empty ? null : (
          <ListHead
            cells={[
              <SortLabel key="n" id="name" sort={col.sort} onToggle={col.toggle} count={filteredRoles.length}>
                {t("access.roleName")}
              </SortLabel>,
              <SortLabel key="h" id="holders" sort={col.sort} onToggle={col.toggle} count={filteredRoles.length}>
                {t("access.roleHolders")}
              </SortLabel>,
              <SortLabel key="t" id="type" sort={col.sort} onToggle={col.toggle} count={filteredRoles.length}>
                {t("access.colType")}
              </SortLabel>,
            ]}
          />
        )
      }
    >
      {empty ? (
        <EmptyState
          compact
          icon={Shield}
          text={t("access.noCustomRoles")}
          action={
            <Button type="button" onClick={() => openCreate()}>
              {t("access.createRole")}
            </Button>
          }
        />
      ) : (
        <div className="am-list" role="list">
          {rows.map((r) => {
            const open = expand.openId === r.id || (("phantom" in r && r.phantom) && creating);
            const rowDraft = open ? draft : null;
            const view: RoleTableRow = current?.id === r.id && !("phantom" in r) ? current : r;
            const roleLead = (rowDraft?.description || "").trim() || systemRoleDesc(view.id);
            return (
              <ExpandRow
                key={r.id}
                id={r.id}
                expanded={open}
                onToggle={() => ("phantom" in r ? expand.requestClose(() => load(null)) : toggleRow(r))}
                cells={[
                  <span key="n" className="am-row-title">
                    {rowDraft?.name || roleTitle(r.id, dir.roles) || t("access.createRole")}
                  </span>,
                  <span key="h" className="am-dim">
                    {holdersLine(
                      r.phantom ? (rowDraft?.userIds || []).length : r.userCount || 0,
                      r.phantom ? (rowDraft?.groupIds || []).length : r.groupCount || 0,
                    )}
                  </span>,
                  <span key="t" className="am-dim">
                    {r.system ? t("access.system") : t("access.custom")}
                  </span>,
                ]}
              >
                {rowDraft ? (
                  <form
                    className="settings-stack"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (expand.editing) void save();
                    }}
                  >
                    {expand.editing && !defLocked ? (
                      <ExpandCard kicker={t("access.secDefinition")}>
                        <div className="field-row">
                          <Field label={t("access.roleName")}>
                            <Input
                              className={INPUT_SM}
                              value={rowDraft.name}
                              onChange={(e) => patch({ ...rowDraft, name: e.target.value })}
                            />
                          </Field>
                          {creating ? (
                            <Field label={t("access.basedOn")}>
                              <Select
                                className={INPUT_SM}
                                value={basedOn}
                                onChange={(e) => {
                                  const id = e.target.value;
                                  setBasedOn(id);
                                  const src = dir.roles.find((x) => x.id === id);
                                  if (src) patch({ ...rowDraft, grants: clone(src.grants || []) });
                                }}
                              >
                                <option value="">{t("access.basedNone")}</option>
                                {dir.roles.map((x) => (
                                  <option key={x.id} value={x.id}>
                                    {roleTitle(x.id, dir.roles)}
                                  </option>
                                ))}
                              </Select>
                            </Field>
                          ) : (
                            <Field label={t("access.roleDesc")}>
                              <Input
                                className={INPUT_SM}
                                value={rowDraft.description}
                                onChange={(e) => patch({ ...rowDraft, description: e.target.value })}
                              />
                            </Field>
                          )}
                        </div>
                        {creating ? (
                          <Field label={t("access.roleDesc")}>
                            <Input
                              className={INPUT_SM}
                              value={rowDraft.description}
                              onChange={(e) => patch({ ...rowDraft, description: e.target.value })}
                            />
                          </Field>
                        ) : null}
                      </ExpandCard>
                    ) : roleLead ? (
                      <div className="settings-card">
                        <p className="am-meta">{roleLead}</p>
                      </div>
                    ) : null}
                    {expand.editing ? (
                      <ExpandCard kicker={t("access.secHolders")}>
                        <div className="field-row">
                          <Field label={t("access.typeUser")}>
                            <EntityPicker
                              kind="user"
                              items={dir.users.filter((u) => u.id !== "admin")}
                              selectedIds={rowDraft.userIds || []}
                              labelOf={(u) => prettyLogin(u.username)}
                              providers={providers}
                              readOnly={holdersLocked}
                              onChange={(ids) => patch({ ...rowDraft, userIds: ids })}
                            />
                          </Field>
                          <Field label={t("access.typeGroup")}>
                            <EntityPicker
                              kind="group"
                              items={dir.groups}
                              selectedIds={rowDraft.groupIds || []}
                              labelOf={(g) => g.name}
                              providers={[
                                { id: "local", label: t("access.idpTypeLocal"), kind: "local" },
                              ]}
                              readOnly={holdersLocked}
                              onChange={(ids) => patch({ ...rowDraft, groupIds: ids })}
                            />
                          </Field>
                        </div>
                      </ExpandCard>
                    ) : null}
                    <ExpandCard kicker={t("access.secPermissions")}>
                      <div className="am-perm-block">
                        {expand.editing && !defLocked ? (
                          <SearchField
                            value={q}
                            onChange={setQ}
                            placeholder={t("access.searchPerms")}
                          />
                        ) : null}
                        <ResourceTree
                          spaces={spaces}
                          grants={rowDraft.grants}
                          setGrants={
                            defLocked || !expand.editing
                              ? () => {}
                              : (g) => patch({ ...rowDraft, grants: g })
                          }
                          query={expand.editing ? q : ""}
                          readOnly={defLocked || !expand.editing}
                        />
                      </div>
                    </ExpandCard>
                    <RowActions
                      editing={expand.editing}
                      onEdit={view.id !== "owner" && !view.phantom ? beginEdit : null}
                      onCancel={cancelEdit}
                      busy={dir.busy}
                      saveDisabled={!rowDraft.name.trim()}
                      extra={
                        !expand.editing && !creating ? (
                          <button
                            type="button"
                            className="am-text-btn"
                            title={t("access.duplicate")}
                            onClick={() => openCreate(view as RoleRow)}
                          >
                            <Copy className="size-3.5" /> {t("access.duplicate")}
                          </button>
                        ) : null
                      }
                      danger={
                        !expand.editing && !creating && !view.system ? (
                          <button
                            type="button"
                            className="am-text-btn is-danger"
                            onClick={() => setConfirm(view as RoleRow)}
                          >
                            {t("access.deleteConfirm")}
                          </button>
                        ) : null
                      }
                    />
                  </form>
                ) : null}
              </ExpandRow>
            );
          })}
        </div>
      )}
      {confirm ? (
        <ConfirmPopup
          title={t("access.deleteRoleTitle", { name: confirm.name })}
          body={t("access.deleteRoleBody", {
            users: tp("access.nUsers", confirm.userCount || 0),
            groups: tp("access.nGroups", confirm.groupCount || 0),
          })}
          busy={dir.busy}
          onCancel={() => setConfirm(null)}
          onOk={() => void remove(confirm)}
        />
      ) : null}
      <DiscardAsk ask={expand.ask} onKeep={expand.dismissAsk} onDiscard={expand.confirmAsk} />
    </ListShell>
  );
}

export function MovePickDialog({
  category,
  spaces,
  fromSpaceId,
  busy,
  onCancel,
  onContinue,
}: {
  category?: Category | null;
  spaces?: Space[];
  fromSpaceId?: string;
  busy?: boolean;
  onCancel: () => void;
  onContinue: (destId: string) => void;
}) {
  const others = (spaces || []).filter((space) => space.id !== fromSpaceId);
  const [dest, setDest] = useState(others[0]?.id || "");
  return (
    <div>
      <h3 className="dialog-title">{t("access.moveTitle", { name: category?.name })}</h3>
      <p className="mt-2 text-sm text-muted">{t("access.movePickLead")}</p>
      {others.length ? (
        <label className="am-field mt-3">
          <span>{t("access.moveDest")}</span>
          <Select className={INPUT_SM} value={dest} onChange={(e) => setDest(e.target.value)}>
            {others.map((space) => (
              <option key={space.id} value={space.id}>
                {space.name}
              </option>
            ))}
          </Select>
        </label>
      ) : (
        <p className="mt-3 text-sm text-muted">{t("access.moveNoDest")}</p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
          {t("actions.cancel")}
        </Button>
        <Button type="button" disabled={busy || !dest} onClick={() => onContinue(dest)}>
          {t("access.movePreview")}
        </Button>
      </div>
    </div>
  );
}

export function MoveSectionDialog({
  impact,
  busy,
  onCancel,
  onConfirm,
}: {
  impact?: CategoryMoveImpact | null;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!impact) return null;
  return (
    <div>
      <h3 className="dialog-title">{t("access.moveTitle", { name: impact.categoryName })}</h3>
      <p className="mt-2 text-sm text-muted">
        {t("access.moveFromTo", { from: impact.fromName, to: impact.toName })}
      </p>
      {impact.changed ? (
        <div className="am-impact">
          <p className="am-kicker">{t("access.moveImpact")}</p>
          <p className="am-note">
            {t("access.moveImpactLead", { roles: impact.roleCount, users: impact.userCount })}
          </p>
          {impact.lost.map((row) => (
            <p key={`l-${row.id}`} className="am-impact-row">
              {row.name} — {t("access.loses")} {row.lost.map(actionLabel).join(", ")}
            </p>
          ))}
          {impact.gained.map((row) => (
            <p key={`g-${row.id}`} className="am-impact-row">
              {row.name} — {t("access.gains")} {row.gained.map(actionLabel).join(", ")}
            </p>
          ))}
          <p className="am-note">{t("access.moveDirectKeep")}</p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">{t("access.moveNoImpact")}</p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
          {t("actions.cancel")}
        </Button>
        <Button type="button" onClick={onConfirm} disabled={busy}>
          {t("access.moveConfirm")}
        </Button>
      </div>
    </div>
  );
}
