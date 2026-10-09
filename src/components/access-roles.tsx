import { useMemo, useRef, useState } from "react";

import { Copy, Plus, Shield } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

import { EmptyState } from "@/components/empty-state";
import { EntityPicker } from "@/components/entity-picker";
import { ExpandRow, NEW_ROW, useExpandSession } from "@/components/expand-row";
import { Field } from "@/components/field";
import { isSystemRole, type GrantInput, type Role, type Space } from "@/lib/acl";
import { t, te, tp } from "@/lib/i18n";
import { deleteRole, saveRole } from "@/lib/portal";
import { sessionGone } from "@/lib/session-gone";
import { isConflict } from "@/lib/doc-rev";

import {
  ConfirmPopup,
  DiscardAsk,
  ExpandCard,
  FilterBar,
  INPUT_SM,
  LdapDirectory,
  ListHead,
  ListShell,
  ResourceTree,
  RowActions,
  SearchField,
  SortLabel,
  clone,
  holdersLine,
  pickerProviders,
  prettyLogin,
  roleTitle,
  same,
  systemRoleDesc,
  useColSort,
  useDirectory,
} from "./access-shared";

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
        if (key === "holders") return (r.userCount || 0) + (r.groupCount || 0);
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
        (res.roles || []).find(
          (r: Role) => (r.name || "").toLowerCase() === draft.name.trim().toLowerCase(),
        );
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
      isConflict(err);
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
      isConflict(err);
    } finally {
      dir.setBusy(false);
    }
  }

  type RoleTableRow =
    | RoleRow
    | {
        id: string;
        name: string;
        system: boolean;
        userCount: number;
        groupCount: number;
        phantom: true;
      };
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
          <SearchField value={search} onChange={setSearch} placeholder={t("nav.search")} />
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
              <SortLabel
                key="n"
                id="name"
                sort={col.sort}
                onToggle={col.toggle}
                count={filteredRoles.length}
              >
                {t("access.roleName")}
              </SortLabel>,
              <SortLabel
                key="h"
                id="holders"
                sort={col.sort}
                onToggle={col.toggle}
                count={filteredRoles.length}
              >
                {t("access.roleHolders")}
              </SortLabel>,
              <SortLabel
                key="t"
                id="type"
                sort={col.sort}
                onToggle={col.toggle}
                count={filteredRoles.length}
              >
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
            const open = expand.openId === r.id || ("phantom" in r && r.phantom && creating);
            const rowDraft = open ? draft : null;
            const view: RoleTableRow = current?.id === r.id && !("phantom" in r) ? current : r;
            const roleLead = (rowDraft?.description || "").trim() || systemRoleDesc(view.id);
            return (
              <ExpandRow
                key={r.id}
                id={r.id}
                expanded={open}
                onToggle={() =>
                  "phantom" in r ? expand.requestClose(() => load(null)) : toggleRow(r)
                }
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
                                onChange={(e) =>
                                  patch({ ...rowDraft, description: e.target.value })
                                }
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
