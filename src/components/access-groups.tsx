import { useCallback, useMemo, useRef, useState } from "react";

import { Folder, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { EmptyState } from "@/components/empty-state";
import { ChipList, EntityPicker } from "@/components/entity-picker";
import { ExpandRow, NEW_ROW, useExpandSession } from "@/components/expand-row";
import { Field } from "@/components/field";
import {
  syntheticUserFromGroup,
  type Decision,
  type GrantInput,
  type Group,
  type Space,
} from "@/lib/acl";
import { t, te, tp } from "@/lib/i18n";
import {
  deleteGroup,
  saveGroup,
  searchLdapGroups,
  linkLdapGroups,
  syncLdapGroup,
} from "@/lib/portal";
import type { LdapGroupHit } from "@/lib/ldap-runtime";
import { sessionGone } from "@/lib/session-gone";
import { isConflict } from "@/lib/doc-rev";

import {
  Actor,
  ConfirmPopup,
  DiscardAsk,
  ExpandCard,
  FilterBar,
  INPUT_SM,
  LdapDirectory,
  ListHead,
  ListShell,
  PermBlocks,
  RowActions,
  SearchField,
  SortLabel,
  bits,
  clone,
  pickerProviders,
  prettyLogin,
  roleTitle,
  same,
  typeLabel,
  useColSort,
  useDirectory,
} from "./access-shared";

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

  const searchDirGroups = useCallback(
    async (directoryId: string, query: string) => {
      const res = await searchLdapGroups({ data: { token, directoryId, query } });
      return (res.groups || []) as LdapGroupHit[];
    },
    [token],
  );
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
      isConflict(err);
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
        (res.groups || []).find(
          (g: Group) => (g.name || "").toLowerCase() === draft.name.trim().toLowerCase(),
        );
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
      isConflict(err);
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
      isConflict(err);
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
      isConflict(err);
    } finally {
      dir.setBusy(false);
    }
  }

  type GroupRow =
    | Group
    | {
        id: string;
        name: string;
        roleIds: string[];
        members: string[];
        phantom: true;
        source?: string;
      };
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
              <SortLabel
                key="n"
                id="name"
                sort={col.sort}
                onToggle={col.toggle}
                count={filtered.length}
              >
                {t("access.groupName")}
              </SortLabel>,
              <SortLabel
                key="r"
                id="role"
                sort={col.sort}
                onToggle={col.toggle}
                count={filtered.length}
              >
                {t("users.role")}
              </SortLabel>,
              <SortLabel
                key="t"
                id="type"
                sort={col.sort}
                onToggle={col.toggle}
                count={filtered.length}
              >
                {t("access.colType")}
              </SortLabel>,
              <SortLabel
                key="m"
                id="members"
                sort={col.sort}
                onToggle={col.toggle}
                count={filtered.length}
              >
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
            const open = expand.openId === g.id || ("phantom" in g && g.phantom && creating);
            const rowDraft = open ? draft : null;
            const view: GroupRow = current?.id === g.id && !("phantom" in g) ? current : g;
            const isAd = view.source === "ad";
            return (
              <ExpandRow
                key={g.id}
                id={g.id}
                expanded={open}
                onToggle={() =>
                  "phantom" in g ? expand.requestClose(() => load(null)) : toggleRow(g)
                }
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
                              title={t("access.roles")}
                            />
                          </Field>
                          <Field label={t("access.members")}>
                            <ChipList
                              names={(rowDraft.members || []).map((id) =>
                                prettyLogin(people.find((u) => u.id === id)?.username || id),
                              )}
                              title={t("access.members")}
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
