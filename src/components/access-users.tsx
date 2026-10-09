import { useMemo, useRef, useState } from "react";

import { Plus, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { EmptyState } from "@/components/empty-state";
import { ChipList, EntityPicker } from "@/components/entity-picker";
import { ExpandRow, NEW_ROW, useExpandSession } from "@/components/expand-row";
import { Field } from "@/components/field";
import { type Decision, type GrantInput, type Space, type User } from "@/lib/acl";
import { t, te } from "@/lib/i18n";
import { PASSWORD_MAX, passwordPolicyError } from "@/lib/security";
import { deleteUser, saveUser } from "@/lib/portal";
import { sessionGone } from "@/lib/session-gone";
import { isConflict } from "@/lib/doc-rev";

import { SeeAsButton, SeeAsPreview } from "@/components/access-see-as";
import {
  Actor,
  ConfirmPopup,
  DiscardAsk,
  ExpandCard,
  FilterBar,
  INPUT_SM,
  ListHead,
  ListShell,
  PasswordHint,
  PermBlocks,
  RowActions,
  SearchField,
  SortLabel,
  StatusText,
  clone,
  effectiveRoleIds,
  prettyLogin,
  roleTitle,
  same,
  typeLabel,
  useColSort,
  useDirectory,
} from "./access-shared";

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
  const [seeAs, setSeeAs] = useState<{ id: string; username: string } | null>(null);
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
          return effectiveRoleIds(u, dir.groups)
            .map((id) => roleTitle(id, dir.roles))
            .join(", ");
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
    const pwdErr = creating || pwd ? passwordPolicyError(pwd) : "";
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
      isConflict(err);
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
      isConflict(err);
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
      isConflict(err);
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
          {people.length ? (
            <select
              className={`${INPUT_SM} max-w-[12rem] shrink-0`}
              defaultValue=""
              aria-label={t("access.seeAs")}
              onChange={(e) => {
                const id = e.target.value;
                const u = people.find((row) => row.id === id);
                if (u) setSeeAs({ id: u.id, username: String(u.username || "") });
                e.target.value = "";
              }}
            >
              <option value="">{t("access.seeAsPick")}</option>
              {people.map((u) => (
                <option key={u.id} value={u.id}>
                  {prettyLogin(u.username)}
                </option>
              ))}
            </select>
          ) : null}
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
              <SortLabel
                key="u"
                id="user"
                sort={col.sort}
                onToggle={col.toggle}
                count={filtered.length}
              >
                {t("access.colUser")}
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
                key="s"
                id="status"
                sort={col.sort}
                onToggle={col.toggle}
                count={filtered.length}
              >
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
                              onChange={(e) => patch({ ...rowDraft, password2: e.target.value })}
                            />
                            <PasswordHint value={rowDraft.password2 || ""} />
                          </Field>
                        </div>
                        <p className="settings-hint">{t("users.passwordKeep")}</p>
                        {rowDraft.password && rowDraft.password !== (rowDraft.password2 || "") ? (
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
                              onChange={() => patch({ ...rowDraft, disabled: !rowDraft.disabled })}
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
                              providers={[
                                { id: "local", label: t("access.idpTypeLocal"), kind: "local" },
                              ]}
                              readOnly={remoteManaged}
                              onChange={(ids) => patch({ ...rowDraft, groupIds: ids })}
                            />
                          </Field>
                        </div>
                      ) : (
                        <div className="field-row">
                          <Field label={t("users.role")}>
                            <ChipList names={effTitles} title={t("access.roles")} />
                          </Field>
                          <Field label={t("access.groupsOf")}>
                            <ChipList names={groupNames} title={t("access.groups")} />
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
                      (creating || rowDraft.password) &&
                      passwordPolicyError(rowDraft.password || ""),
                    ) ||
                    (lockedOwner &&
                      Boolean(rowDraft.password) &&
                      rowDraft.password !== (rowDraft.password2 || ""))
                  }
                  extra={
                    !expand.editing && !creating ? (
                      <>
                        <SeeAsButton
                          username={view.username || ""}
                          onClick={() => setSeeAs({ id: view.id, username: view.username || "" })}
                        />
                        {!lockedOwner ? (
                          <button
                            type="button"
                            className="am-text-btn"
                            onClick={() => void setDisabled(view, !view.disabled)}
                          >
                            {view.disabled ? t("access.enable") : t("access.disable")}
                          </button>
                        ) : null}
                      </>
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
      {seeAs ? (
        <SeeAsPreview
          token={token}
          userId={seeAs.id}
          username={seeAs.username}
          onClose={() => setSeeAs(null)}
        />
      ) : null}
    </ListShell>
  );
}
