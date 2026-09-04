import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, Folder, Lock, Plus, Search, Shield, Users, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EntityPicker } from "@/components/entity-picker";
import { ExpandRow, NEW_ROW, useExpandSession } from "@/components/expand-row";
import {
	can,
	effectiveAccess,
	explain,
	mergeGrant,
	PORTAL_ACTIONS,
	syntheticUserFromGroup,
	TREE_ACTIONS
} from "@/lib/acl";
import { t, te, tp } from "@/lib/i18n";
import { PASSWORD_MIN } from "@/lib/security";
import { deleteGroup, deleteRole, deleteUser, listUsers, saveGroup, saveRole, saveUser } from "@/lib/portal";

const INPUT = "field-input h-9 w-full rounded-md border border-border bg-transparent px-3 text-sm text-fg outline-none placeholder:text-subtle";

function sessionGone(err) {
	return String(err?.message || err || "").includes("errors.sessionExpired");
}

function prettyLogin(name) {
	return String(name || "").trim();
}

function roleTitle(id, roles) {
	if (id === "owner") return t("access.roleOwner");
	if (id === "admin") return t("access.roleAdminShort");
	if (id === "editeur") return t("access.roleEditeur");
	if (id === "lecteur") return t("access.roleLecteur");
	return roles.find((r) => r.id === id)?.name || id;
}

function actionLabel(a) {
	const key = `access.act.${a}`;
	const s = t(key);
	return s === key ? a : s;
}

function sourceLabel(src) {
	if (!src) return t("access.whyNone");
	if (src.kind === "direct") return t("access.whyDirect");
	if (src.kind === "public") return t("access.whyPublic");
	if (src.kind === "system") return t("access.whySystem", { name: src.role?.name || t("access.roleOwner") });
	if (src.kind === "group") {
		const role = src.role?.name ? roleTitle(src.role.id, [src.role]) : t("access.aRole");
		return t("access.whyGroup", { role, group: src.group?.name || t("access.typeGroup") });
	}
	if (src.kind === "role") return t("access.whyRole", { name: src.role?.name || t("access.aRole") });
	return t("access.whyDirect");
}

function accountSource(src) {
	if (src === "ad") return t("access.sourceAd");
	if (src === "oidc") return t("access.sourceOidc");
	return t("access.sourceLocal");
}

function pickerProviders(directories) {
	const list = [{ id: "local", label: t("access.sourceLocal"), kind: "local" }];
	for (const d of directories || []) {
		list.push({ id: d.id, label: d.domain || t("ldap.directory"), kind: "ad" });
	}
	return list;
}

function localEffect(grants, res, id, action) {
	const g = (grants || []).find((x) => x.res === res && x.id === id);
	if (!g) return "inherit";
	if ((g.deny || []).includes(action) || (g.deny || []).includes("*")) return "deny";
	if ((g.allow || []).includes(action) || (g.allow || []).includes("*")) return "allow";
	return "inherit";
}

function setEffect(grants, res, id, action, next) {
	const list = (grants || []).map((g) => ({ ...g, allow: [...(g.allow || [])], deny: [...(g.deny || [])] }));
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

function cycleEffect(cur) {
	if (cur === "inherit") return "allow";
	if (cur === "allow") return "deny";
	return "inherit";
}

function roleProbe(grants, tabs) {
	return {
		roles: [{ id: "_probe", name: "_", grants: grants || [] }],
		users: [],
		groups: [],
		tabs: tabs || []
	};
}

function MiniDoc(dir) {
	return { users: dir.users, groups: dir.groups, roles: dir.roles, tabs: dir.tabs };
}

function inheritedGrantsOf(user, dir) {
	const grants = [];
	const roles = dir.roles || [];
	const roleOf = (id) => roles.find((r) => r.id === id);
	for (const rid of user?.roleIds || []) {
		const role = roleOf(rid);
		if (role) for (const g of role.grants || []) mergeGrant(grants, g);
	}
	const groups = (dir.groups || []).filter((g) => (user?.groupIds || []).includes(g.id) || (g.members || []).includes(user?.id));
	for (const group of groups) {
		for (const g of group.grants || []) mergeGrant(grants, g);
		for (const rid of group.roleIds || []) {
			const role = roleOf(rid);
			if (role) for (const g of role.grants || []) mergeGrant(grants, g);
		}
	}
	return grants;
}

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function same(a, b) {
	return JSON.stringify(a) === JSON.stringify(b);
}

function useDirectory(token) {
	const [users, setUsers] = useState([]);
	const [groups, setGroups] = useState([]);
	const [roles, setRoles] = useState([]);
	const [tabs, setTabs] = useState([]);
	const [busy, setBusy] = useState(true);
	function apply(res) {
		if (res.users) setUsers(res.users);
		if (res.groups) setGroups(res.groups);
		if (res.roles) setRoles(res.roles);
		if (res.tabs) setTabs(res.tabs);
	}
	useEffect(() => {
		listUsers({ data: { token } }).then((res) => {
			apply(res);
			setBusy(false);
		}).catch((err) => {
			setBusy(false);
			if (!sessionGone(err)) toast.error(te(err));
		});
	}, [token]);
	return { users, groups, roles, tabs, busy, apply, setBusy };
}

function ListShell({ toolbar, children }) {
	return (
		<div className="am-work">
			<div className="am-toolbar">{toolbar}</div>
			<div className="am-list-wrap">{children}</div>
		</div>
	);
}

function ListHead({ cells, grip }) {
	return (
		<div className="am-list-head" aria-hidden>
			{grip ? <span className="am-chevron-spacer" /> : null}
			<span className="am-chevron-spacer" />
			<div className="am-row-cells">{cells}</div>
		</div>
	);
}

function holdersLine(users, groups) {
	return `${tp("access.nUsers", users || 0)} · ${tp("access.nGroups", groups || 0)}`;
}

function bits(names) {
	const list = (names || []).filter(Boolean);
	if (!list.length) return "—";
	if (list.length <= 2) return list.join(", ");
	return `${list.slice(0, 2).join(", ")} +${list.length - 2}`;
}

function FilterBar({ value, onChange, items }) {
	return (
		<div className="am-filters" role="tablist" aria-label={t("access.filterAll")}>
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

function SearchField({ value, onChange, placeholder }) {
	return (
		<label className="am-search">
			<Search className="size-3.5" aria-hidden />
			<input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
		</label>
	);
}

function EmptyHint({ text, action, icon: Icon }) {
	return (
		<div className="empty-page is-compact">
			{Icon ? (
				<div className="empty-page-mark">
					<Icon className="size-7" aria-hidden />
				</div>
			) : null}
			<p>{text}</p>
			{action ? <div className="empty-page-action">{action}</div> : null}
		</div>
	);
}

function StatusText({ off }) {
	return <span className={`am-status${off ? " is-off" : ""}`}>{off ? t("access.disabled") : t("access.active")}</span>;
}

function PermWord({ action, state, inheritedOn, onCycle, readOnly }) {
	const label = actionLabel(action);
	const title = state === "allow"
		? t("access.direct")
		: state === "deny"
			? t("access.denied")
			: inheritedOn
				? t("access.inherited")
				: t("access.none");
	if (readOnly) {
		if (state === "deny") return <span className="am-perm is-deny" title={title}>{label} —</span>;
		if (state === "allow" || inheritedOn) return <span className={`am-perm is-on${state === "inherit" ? " is-in" : ""}`} title={title}>{label} ✓</span>;
		return <span className="am-perm" title={title}>{label} —</span>;
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

function PermLine({ res, id, actions, grants, setGrants, tabs, readOnly }) {
	const probe = roleProbe(grants, tabs);
	const user = { id: "_u", roleIds: ["_probe"], grants: [] };
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
						readOnly={readOnly}
						onCycle={() => setGrants(setEffect(grants, res, id, action, cycleEffect(state)))}
					/>
				);
			})}
		</span>
	);
}

function ResourceTree({ tabs, grants, setGrants, query, readOnly }) {
	const [open, setOpen] = useState({});
	const q = String(query || "").trim().toLowerCase();
	function hit(name) {
		return !q || String(name || "").toLowerCase().includes(q) || actionLabel(q).toLowerCase().includes(q);
	}
	const list = (tabs || []).map((tab) => {
		const cats = (tab.categories || []).map((cat) => {
			const apps = (cat.apps || []).filter((a) => hit(a.title) || hit(cat.name) || hit(tab.name));
			return { ...cat, apps, _hit: hit(cat.name) || apps.length > 0 };
		}).filter((c) => !q || c._hit);
		return { ...tab, categories: cats, _hit: hit(tab.name) || cats.length > 0 };
	}).filter((tab) => !q || tab._hit);

	return (
		<div className="am-tree" role="tree">
			{list.map((tab) => (
				<div key={tab.id} className="am-tree-block">
					<div className="am-tree-row" role="treeitem">
						<button type="button" className="am-tree-name" onClick={() => setOpen((o) => ({ ...o, [tab.id]: !o[tab.id] }))}>
							{tab.name}
							{tab.restricted ? <Lock className="size-3" aria-label={t("access.restricted")} /> : null}
						</button>
						<PermLine res="tab" id={tab.id} actions={TREE_ACTIONS.tab} grants={grants} setGrants={setGrants} tabs={tabs} readOnly={readOnly} />
					</div>
					{open[tab.id] || q ? (tab.categories || []).map((cat) => (
						<div key={cat.id}>
							<div className="am-tree-row is-cat">
								<button type="button" className="am-tree-name" onClick={() => setOpen((o) => ({ ...o, [cat.id]: !o[cat.id] }))}>
									{cat.name}
									{cat.restricted ? <Lock className="size-3" /> : null}
								</button>
								<PermLine res="cat" id={cat.id} actions={TREE_ACTIONS.cat} grants={grants} setGrants={setGrants} tabs={tabs} readOnly={readOnly} />
							</div>
							{open[cat.id] || q ? (cat.apps || []).map((app) => (
								<div key={app.id} className="am-tree-row is-card">
									<span className="am-tree-name">{app.title || t("empty.untitled")}</span>
									<PermLine res="card" id={app.id} actions={TREE_ACTIONS.card} grants={grants} setGrants={setGrants} tabs={tabs} readOnly={readOnly} />
								</div>
							)) : null}
						</div>
					)) : null}
				</div>
			))}
		</div>
	);
}

function PortalActions({ grants, setGrants, locked }) {
	return (
		<div className="am-perms is-portal">
			{PORTAL_ACTIONS.map((action) => {
				const state = localEffect(grants, "portal", "*", action);
				return (
					<PermWord
						key={action}
						action={action}
						state={state}
						inheritedOn={false}
						readOnly={locked}
						onCycle={() => setGrants(setEffect(grants, "portal", "*", action, cycleEffect(state)))}
					/>
				);
			})}
		</div>
	);
}

function EffectiveTree({ user, doc, onWhy }) {
	const tree = useMemo(() => effectiveAccess(user, doc), [user, doc]);
	const [open, setOpen] = useState({});
	function words(actions, res, id) {
		return (
			<span className="am-perms">
				{actions.map((a) => (
					<button key={a} type="button" className="am-perm is-on" onClick={() => onWhy?.(explain(user, a, { res, id }, doc))}>
						{actionLabel(a)} ✓
					</button>
				))}
			</span>
		);
	}
	return (
		<div className="am-tree">
			{tree.portal.length ? (
				<div className="am-tree-row">
					<span className="am-tree-name">{t("access.permPortal")}</span>
					{words(tree.portal, "portal", "*")}
				</div>
			) : null}
			{tree.publicOnly ? <p className="am-public">{t("access.publicSpaces", { n: tree.publicOnly })}</p> : null}
			{tree.tabs.map((tab) => (
				<div key={tab.id}>
					<div className="am-tree-row">
						<button type="button" className="am-tree-name" onClick={() => setOpen((o) => ({ ...o, [tab.id]: !o[tab.id] }))}>{tab.name}</button>
						{words(tab.actions, "tab", tab.id)}
					</div>
					{open[tab.id] ? tab.cats.map((cat) => (
						<div key={cat.id}>
							<div className="am-tree-row is-cat">
								<button type="button" className="am-tree-name" onClick={() => setOpen((o) => ({ ...o, [cat.id]: !o[cat.id] }))}>{cat.name}</button>
								{words(cat.actions, "cat", cat.id)}
							</div>
							{open[cat.id] ? cat.cards.map((card) => (
								<div key={card.id} className="am-tree-row is-card">
									<span className="am-tree-name">{card.name || t("empty.untitled")}</span>
									{words(card.actions, "card", card.id)}
								</div>
							)) : null}
						</div>
					)) : null}
				</div>
			))}
		</div>
	);
}

function WhyPanel({ info, onClose }) {
	if (!info) return null;
	return (
		<div className="am-why" role="status">
			<div className="am-why-top">
				<p>{t("access.whyTitle", { action: actionLabel(info.action), name: info.resource?.name || t("access.permPortal") })}</p>
				<button type="button" className="am-icon-btn" onClick={onClose} aria-label={t("actions.close")}>
					<X className="size-3.5" />
				</button>
			</div>
			<ul>
				{(info.sources || []).length ? info.sources.map((s, i) => (
					<li key={i} className={s.effect === "deny" ? "is-deny" : ""}>
						{s.effect === "deny" ? "✕ " : "✓ "}
						{sourceLabel(s)}
					</li>
				)) : <li>{t("access.whyNone")}</li>}
			</ul>
		</div>
	);
}

export function ConfirmPopup({ title, body, onCancel, onOk, busy, okLabel, danger = true }) {
	useEffect(() => {
		const onKey = (e) => {
			if (e.key !== "Escape") return;
			e.preventDefault();
			e.stopImmediatePropagation();
			onCancel();
		};
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	}, [onCancel]);
	if (typeof document === "undefined") return null;
	return createPortal(
		<div className="am-popup" role="presentation" onClick={onCancel}>
			<div
				className="am-popup-box"
				role="alertdialog"
				aria-modal="true"
				aria-labelledby="am-popup-title"
				onClick={(e) => e.stopPropagation()}
			>
				<h3 id="am-popup-title" className="dialog-title">{title}</h3>
				<p className="mt-2 text-sm text-muted">{body}</p>
				<div className="mt-5 flex justify-end gap-2">
					<Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>{t("actions.cancel")}</Button>
					<Button type="button" variant={danger ? "danger" : undefined} onClick={onOk} disabled={busy}>{okLabel || t("actions.delete")}</Button>
				</div>
			</div>
		</div>,
		document.body
	);
}

function Section({ title, hint, children }) {
	return (
		<section className="am-sec">
			{title ? <h5>{title}</h5> : null}
			{hint ? <p className="am-note">{hint}</p> : null}
			{children}
		</section>
	);
}

function Pair({ children }) {
	return <div className="am-pair">{children}</div>;
}

function DiscardAsk({ ask, onKeep, onDiscard }) {
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

function PermBlocks({ user, dir, tabs, grants, setGrants, editing, why, setWhy, hideDirectEdit }) {
	const inherited = useMemo(() => inheritedGrantsOf(user, dir), [user, dir]);
	const [pane, setPane] = useState(editing ? "direct" : "effective");
	const [pq, setPq] = useState("");
	const liveUser = user ? { ...user, grants: grants || user.grants || [] } : null;
	useEffect(() => {
		setPane(editing ? "direct" : "effective");
	}, [editing]);
	return (
		<Section>
			<FilterBar
				value={pane}
				onChange={setPane}
				items={[
					{ id: "direct", label: t("access.direct") },
					{ id: "inherited", label: t("access.inherited") },
					{ id: "effective", label: t("access.effective") }
				]}
			/>
			{pane === "direct" ? (
				<>
					{editing && !hideDirectEdit ? <SearchField value={pq} onChange={setPq} placeholder={t("access.searchPerms")} /> : null}
					{(grants || []).length || (editing && !hideDirectEdit) ? (
						<ResourceTree tabs={tabs} grants={grants || []} setGrants={setGrants || (() => {})} query={editing ? pq : ""} readOnly={!editing || hideDirectEdit} />
					) : <p className="am-note">{t("access.none")}</p>}
				</>
			) : null}
			{pane === "inherited" ? (
				inherited.length ? (
					<ResourceTree tabs={tabs} grants={inherited} setGrants={() => {}} query="" readOnly />
				) : <p className="am-note">{t("access.none")}</p>
			) : null}
			{pane === "effective" ? (
				liveUser ? (
					<>
						<EffectiveTree user={liveUser} doc={MiniDoc(dir)} onWhy={setWhy} />
						<WhyPanel info={why} onClose={() => setWhy(null)} />
					</>
				) : <p className="am-note">{t("access.none")}</p>
			) : null}
		</Section>
	);
}

function RowActions({ editing, onEdit, onCancel, onSave, saveDisabled, extra, danger }) {
	if (editing) {
		return (
			<div className="am-actions">
				<button type="button" className="am-text-btn" onClick={onCancel}>{t("actions.cancel")}</button>
				<Button type="button" size="sm" disabled={saveDisabled} onClick={onSave}>{t("actions.save")}</Button>
			</div>
		);
	}
	return (
		<div className="am-actions">
			{onEdit ? <Button type="button" size="sm" onClick={onEdit}>{t("actions.edit")}</Button> : null}
			{extra}
			{danger}
		</div>
	);
}

export function AccessUsers({ token, actor, tabs: seedTabs, directories }) {
	const dir = useDirectory(token);
	const tabs = dir.tabs.length ? dir.tabs : seedTabs || [];
	const expand = useExpandSession();
	const snap = useRef(null);
	const [q, setQ] = useState("");
	const [filter, setFilter] = useState("all");
	const [draft, setDraft] = useState(null);
	const [why, setWhy] = useState(null);
	const [confirm, setConfirm] = useState(null);
	const creating = expand.openId === NEW_ROW;
	const people = dir.users;
	const providers = pickerProviders(directories);
	const canCreate = actor?.role === "admin" || actor?.canManageUsers;
	const lockedOwner = draft?.id === "admin";
	const current = people.find((u) => u.id === expand.openId);

	const filtered = people.filter((u) => {
		if (filter === "disabled" && !u.disabled) return false;
		if (filter !== "all" && filter !== "disabled" && !(u.roleIds || []).includes(filter)) return false;
		if (q && !prettyLogin(u.username).toLowerCase().includes(q.toLowerCase())) return false;
		return true;
	});

	function userDraft(u) {
		return {
			id: u.id,
			username: u.username,
			password: "",
			password2: "",
			roleIds: [...(u.roleIds || [])],
			groupIds: [...(u.groupIds || [])],
			grants: clone(u.grants || []),
			disabled: Boolean(u.disabled),
			source: u.source || "local"
		};
	}
	function blankDraft() {
		return { id: "", username: "", password: "", password2: "", roleIds: ["lecteur"], groupIds: [], grants: [], disabled: false, source: "local" };
	}
	function load(next, edit) {
		snap.current = next ? clone(next) : null;
		setDraft(next);
		setWhy(null);
		expand.markDirty(false);
		if (edit) expand.setEditing(true);
	}
	function patch(next) {
		setDraft(next);
		expand.markDirty(!same(next, snap.current));
	}
	function toggleRow(u) {
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
		if (draft.id === "admin" && pwd) {
			if (pwd !== (draft.password2 || "")) {
				toast.error(t("access.passwordMismatch"));
				return;
			}
			if (pwd.length < PASSWORD_MIN) {
				toast.error(t("users.passwordMin", { n: PASSWORD_MIN }));
				return;
			}
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
					disabled: draft.disabled
				}
			});
			dir.apply(res);
			toast.success(t("toast.saved"));
			const saved = (res.users || []).find((u) => u.id === draft.id)
				|| (res.users || []).find((u) => u.username === draft.username.trim().toLowerCase());
			if (saved) {
				expand.stay(saved.id);
				load(userDraft(saved));
			} else {
				expand.stay(draft.id || null);
				patch({ ...draft, password: "" });
				snap.current = clone({ ...draft, password: "" });
				expand.markDirty(false);
				expand.setEditing(false);
			}
		} catch (err) {
			if (!sessionGone(err)) toast.error(te(err));
		} finally {
			dir.setBusy(false);
		}
	}
	async function setDisabled(u, disabled) {
		dir.setBusy(true);
		try {
			dir.apply(await saveUser({
				data: {
					token,
					id: u.id,
					username: u.username,
					roleIds: u.roleIds,
					groupIds: u.groupIds,
					grants: u.grants,
					disabled
				}
			}));
			toast.success(t("toast.saved"));
			if (draft && draft.id === u.id) {
				const next = { ...draft, disabled };
				snap.current = clone({ ...snap.current, disabled });
				setDraft(next);
			}
		} catch (err) {
			if (!sessionGone(err)) toast.error(te(err));
		} finally {
			dir.setBusy(false);
		}
	}
	async function remove(u) {
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

	const rows = creating ? [{ id: NEW_ROW, username: draft?.username || t("access.newUser"), roleIds: draft?.roleIds || [], disabled: false, phantom: true }, ...filtered] : filtered;
	const empty = !dir.busy && !filtered.length && !creating;

	return (
		<ListShell
			toolbar={(
				<>
					<SearchField value={q} onChange={setQ} placeholder={t("nav.search")} />
					<FilterBar
						value={filter}
						onChange={setFilter}
						items={[
							{ id: "all", label: t("access.filterAll") },
							...dir.roles.filter((r) => r.id !== "owner").map((r) => ({ id: r.id, label: roleTitle(r.id, dir.roles) })),
							{ id: "disabled", label: t("access.disabled") }
						]}
					/>
					{canCreate ? (
						<Button type="button" size="sm" className="h-9 shrink-0" onClick={openCreate}>
							<Plus className="size-3.5" /> {t("access.create")}
						</Button>
					) : null}
				</>
			)}
		>
			{empty ? (
				<EmptyHint icon={Users} text={t("access.empty")} action={canCreate ? <Button type="button" size="sm" onClick={openCreate}>{t("access.create")}</Button> : null} />
			) : (
				<div className="am-list" role="list">
					<ListHead cells={[<span key="u">{t("access.colUser")}</span>, <span key="r">{t("users.role")}</span>, <span key="s" className="am-row-end">{t("access.colStatus")}</span>]} />
					{rows.map((u) => {
						const open = expand.openId === u.id || (u.phantom && creating);
						const rowDraft = open ? draft : null;
						const view = current && !u.phantom ? current : u;
						return (
							<ExpandRow
								key={u.id}
								id={u.id}
								expanded={open}
								onToggle={() => (u.phantom ? expand.requestClose(() => load(null)) : toggleRow(u))}
								cells={[
									<span key="n" className="am-row-title">{prettyLogin(rowDraft?.username || u.username) || t("access.newUser")}</span>,
									<span key="c" className="am-dim">{bits((rowDraft?.roleIds || u.roleIds || []).map((id) => roleTitle(id, dir.roles)))}</span>,
									<span key="s" className="am-row-end am-dim"><StatusText off={rowDraft ? rowDraft.disabled : u.disabled} /></span>
								]}
							>
								{rowDraft ? (
									<>
										{expand.editing ? (
											<Section>
												{lockedOwner ? (
													<>
														<p className="am-meta">{t("access.roleLocked")}</p>
														<Pair>
															<label className="am-field">
																<span>{t("users.newPassword")}</span>
																<input className={INPUT} type="password" value={rowDraft.password} autoComplete="new-password" onChange={(e) => patch({ ...rowDraft, password: e.target.value })} />
															</label>
															<label className="am-field">
																<span>{t("access.confirmPassword")}</span>
																<input className={INPUT} type="password" value={rowDraft.password2 || ""} autoComplete="new-password" onChange={(e) => patch({ ...rowDraft, password2: e.target.value })} />
															</label>
														</Pair>
														<p className="am-note">{t("users.passwordKeep")}</p>
														{rowDraft.password && rowDraft.password !== (rowDraft.password2 || "") ? (
															<p className="am-note is-warn">{t("access.passwordMismatch")}</p>
														) : null}
													</>
												) : (
													<>
														<Pair>
															<label className="am-field">
																<span>{t("lock.username")}</span>
																<input className={INPUT} value={rowDraft.username} autoComplete="off" onChange={(e) => patch({ ...rowDraft, username: e.target.value })} />
															</label>
															<label className="am-field">
																<span>{creating ? t("lock.password") : t("users.newPassword")}</span>
																<input className={INPUT} type="password" value={rowDraft.password} autoComplete="new-password" onChange={(e) => patch({ ...rowDraft, password: e.target.value })} />
															</label>
														</Pair>
														<label className="am-inline">
															<input type="checkbox" checked={Boolean(rowDraft.disabled)} onChange={() => patch({ ...rowDraft, disabled: !rowDraft.disabled })} />
															{t("access.disabled")}
														</label>
													</>
												)}
											</Section>
										) : (
											<p className="am-meta">{accountSource(view.source || rowDraft.source)} · <StatusText off={rowDraft.disabled} /></p>
										)}
										{!lockedOwner ? (
											<>
												<Section>
													<Pair>
														<div>
															<h5>{t("users.role")}</h5>
															<EntityPicker
																kind="role"
																items={dir.roles.filter((r) => r.id !== "owner")}
																selectedIds={rowDraft.roleIds || []}
																labelOf={(r) => roleTitle(r.id, dir.roles)}
																providers={[{ id: "local", label: t("access.sourceLocal"), kind: "local" }]}
																readOnly={!expand.editing}
																onChange={(ids) => patch({ ...rowDraft, roleIds: ids.length ? ids : ["lecteur"] })}
															/>
														</div>
														<div>
															<h5>{t("access.groupsOf")}</h5>
															<EntityPicker
																kind="group"
																items={dir.groups}
																selectedIds={rowDraft.groupIds || []}
																labelOf={(g) => g.name}
																providers={providers}
																readOnly={!expand.editing}
																onChange={(ids) => patch({ ...rowDraft, groupIds: ids })}
															/>
														</div>
													</Pair>
												</Section>
												<PermBlocks
													user={view.phantom ? null : { ...view, roleIds: rowDraft.roleIds, groupIds: rowDraft.groupIds, grants: rowDraft.grants }}
													dir={dir}
													tabs={tabs}
													grants={rowDraft.grants || []}
													setGrants={(g) => patch({ ...rowDraft, grants: g })}
													editing={expand.editing}
													why={why}
													setWhy={setWhy}
												/>
											</>
										) : null}
										<RowActions
											editing={expand.editing}
											onEdit={canCreate && !lockedOwner ? beginEdit : (lockedOwner ? beginEdit : null)}
											onCancel={cancelEdit}
											onSave={() => void save()}
											saveDisabled={dir.busy || !rowDraft.username.trim() || (creating && (rowDraft.password || "").length < PASSWORD_MIN) || (lockedOwner && Boolean(rowDraft.password) && (rowDraft.password !== (rowDraft.password2 || "") || rowDraft.password.length < PASSWORD_MIN))}
											extra={!expand.editing && !creating && !lockedOwner ? (
												<button type="button" className="am-text-btn" onClick={() => void setDisabled(view, !view.disabled)}>
													{view.disabled ? t("access.enable") : t("access.disable")}
												</button>
											) : null}
											danger={!expand.editing && !creating && !lockedOwner ? (
												<button type="button" className="am-text-btn is-danger" onClick={() => setConfirm(view)}>{t("access.deleteConfirm")}</button>
											) : null}
										/>
									</>
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

export function AccessGroups({ token, actor, tabs: seedTabs, directories }) {
	const dir = useDirectory(token);
	const tabs = dir.tabs.length ? dir.tabs : seedTabs || [];
	const expand = useExpandSession();
	const snap = useRef(null);
	const [q, setQ] = useState("");
	const [draft, setDraft] = useState(null);
	const [why, setWhy] = useState(null);
	const [confirm, setConfirm] = useState(null);
	const creating = expand.openId === NEW_ROW;
	const filtered = dir.groups.filter((g) => !q || g.name.toLowerCase().includes(q.toLowerCase()));
	const canCreate = actor?.role === "admin" || actor?.canManageGroups || actor?.canManageUsers;
	const people = dir.users.filter((u) => u.id !== "admin");
	const current = dir.groups.find((g) => g.id === expand.openId);
	const providers = pickerProviders(directories);

	function groupDraft(g) {
		return { id: g.id, name: g.name, roleIds: [...(g.roleIds || [])], members: [...(g.members || [])], source: g.source || "local" };
	}
	function blankDraft() {
		return { id: "", name: "", roleIds: ["lecteur"], members: [], source: "local" };
	}
	function load(next, edit) {
		snap.current = next ? clone(next) : null;
		setDraft(next);
		setWhy(null);
		expand.markDirty(false);
		if (edit) expand.setEditing(true);
	}
	function patch(next) {
		setDraft(next);
		expand.markDirty(!same(next, snap.current));
	}
	function toggleRow(g) {
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
				data: { token, id: draft.id || undefined, name: draft.name, roleIds: draft.roleIds, members: draft.members }
			});
			dir.apply(res);
			toast.success(t("toast.saved"));
			const saved = (res.groups || []).find((g) => g.id === draft.id)
				|| (res.groups || []).find((g) => g.name.toLowerCase() === draft.name.trim().toLowerCase());
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
	async function remove(g) {
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

	const rows = creating ? [{ id: NEW_ROW, name: draft?.name || t("access.newGroup"), roleIds: draft?.roleIds || [], members: draft?.members || [], phantom: true }, ...filtered] : filtered;
	const empty = !dir.busy && !filtered.length && !creating;

	return (
		<ListShell
			toolbar={(
				<>
					<SearchField value={q} onChange={setQ} placeholder={t("nav.search")} />
					{canCreate ? (
						<Button type="button" size="sm" className="h-9 shrink-0" onClick={openCreate}>
							<Plus className="size-3.5" /> {t("access.createGroup")}
						</Button>
					) : null}
				</>
			)}
		>
			{empty ? (
				<EmptyHint icon={Folder} text={t("access.noGroups")} action={canCreate ? <Button type="button" size="sm" onClick={openCreate}>{t("access.createGroup")}</Button> : null} />
			) : (
				<div className="am-list" role="list">
					<ListHead cells={[<span key="n">{t("access.groupName")}</span>, <span key="r">{t("users.role")}</span>, <span key="m" className="am-row-end">{t("access.members")}</span>]} />
					{rows.map((g) => {
						const open = expand.openId === g.id || (g.phantom && creating);
						const rowDraft = open ? draft : null;
						const view = current && !g.phantom ? current : g;
						return (
							<ExpandRow
								key={g.id}
								id={g.id}
								expanded={open}
								onToggle={() => (g.phantom ? expand.requestClose(() => load(null)) : toggleRow(g))}
								cells={[
									<span key="n" className="am-row-title">{rowDraft?.name || g.name || t("access.newGroup")}</span>,
									<span key="c" className="am-dim">{bits((rowDraft?.roleIds || g.roleIds || []).map((id) => roleTitle(id, dir.roles)))}</span>,
									<span key="m" className="am-row-end am-dim">{tp("access.memberCount", (rowDraft?.members || g.members || []).length)}</span>
								]}
							>
								{rowDraft ? (
									<>
										{expand.editing ? (
											<Section>
												<label className="am-field">
													<span>{t("access.groupName")}</span>
													<input className={INPUT} value={rowDraft.name} onChange={(e) => patch({ ...rowDraft, name: e.target.value })} />
												</label>
											</Section>
										) : view.source === "ad" ? (
											<p className="am-meta">{t("access.sourceAd")}</p>
										) : null}
										<Section>
											<Pair>
												<div>
													<h5>{t("users.role")}</h5>
													<EntityPicker
														kind="role"
														items={dir.roles.filter((r) => r.id !== "owner")}
														selectedIds={rowDraft.roleIds || []}
														labelOf={(r) => roleTitle(r.id, dir.roles)}
														providers={[{ id: "local", label: t("access.sourceLocal"), kind: "local" }]}
														readOnly={!expand.editing}
														onChange={(ids) => patch({ ...rowDraft, roleIds: ids.length ? ids : ["lecteur"] })}
													/>
												</div>
												<div>
													<h5>{t("access.members")}</h5>
													<EntityPicker
														kind="user"
														items={people}
														selectedIds={rowDraft.members || []}
														labelOf={(u) => prettyLogin(u.username)}
														providers={providers}
														readOnly={!expand.editing || view.source === "ad"}
														onChange={(ids) => patch({ ...rowDraft, members: ids })}
													/>
												</div>
											</Pair>
										</Section>
										{view.id && !view.phantom ? (
											<PermBlocks
												user={syntheticUserFromGroup({ ...view, roleIds: rowDraft.roleIds, members: rowDraft.members })}
												dir={{ ...dir, tabs }}
												tabs={tabs}
												grants={view.grants || []}
												editing={false}
												hideDirectEdit
												why={why}
												setWhy={setWhy}
											/>
										) : null}
										<RowActions
											editing={expand.editing}
											onEdit={canCreate ? beginEdit : null}
											onCancel={cancelEdit}
											onSave={() => void save()}
											saveDisabled={dir.busy || !rowDraft.name.trim()}
											danger={!expand.editing && !creating ? (
												<button type="button" className="am-text-btn is-danger" onClick={() => setConfirm(view)}>{t("access.deleteConfirm")}</button>
											) : null}
										/>
									</>
								) : null}
							</ExpandRow>
						);
					})}
				</div>
			)}
			{confirm ? (
				<ConfirmPopup
					title={t("access.deleteGroupTitle", { name: confirm.name })}
					body={t("access.deleteGroupBody", { members: tp("access.memberCount", (confirm.members || []).length) })}
					busy={dir.busy}
					onCancel={() => setConfirm(null)}
					onOk={() => void remove(confirm)}
				/>
			) : null}
			<DiscardAsk ask={expand.ask} onKeep={expand.dismissAsk} onDiscard={expand.confirmAsk} />
		</ListShell>
	);
}

export function AccessRoles({ token, tabs: seedTabs, directories }) {
	const dir = useDirectory(token);
	const tabs = dir.tabs.length ? dir.tabs : seedTabs || [];
	const expand = useExpandSession();
	const snap = useRef(null);
	const [draft, setDraft] = useState(null);
	const [q, setQ] = useState("");
	const [search, setSearch] = useState("");
	const [basedOn, setBasedOn] = useState("");
	const [confirm, setConfirm] = useState(null);
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
	const providers = pickerProviders(directories);

	function holders(r) {
		return {
			userIds: dir.users.filter((u) => (u.roleIds || []).includes(r.id) && u.id !== "admin").map((u) => u.id),
			groupIds: dir.groups.filter((g) => (g.roleIds || []).includes(r.id)).map((g) => g.id)
		};
	}
	function roleDraft(r) {
		const h = holders(r);
		return {
			id: r.id,
			name: r.name,
			description: r.description || "",
			grants: clone(r.grants || []),
			userIds: h.userIds,
			groupIds: h.groupIds,
			system: Boolean(r.system)
		};
	}
	function blankDraft(from) {
		const src = from || dir.roles.find((r) => r.id === basedOn);
		const copied = Boolean(from && src);
		return {
			id: "",
			name: copied ? `${String(src.name || "").replace(/\s*\((copie|copy)\)\s*$/i, "")} (${t("copy.suffix")})`.slice(0, 40) : "",
			description: src?.description || "",
			grants: src ? clone(src.grants || []) : [],
			userIds: [],
			groupIds: [],
			system: false
		};
	}
	function load(next, edit) {
		snap.current = next ? clone(next) : null;
		setDraft(next);
		expand.markDirty(false);
		if (edit) expand.setEditing(true);
	}
	function patch(next) {
		setDraft(next);
		expand.markDirty(!same(next, snap.current));
	}
	function toggleRow(r) {
		if (expand.openId === r.id) {
			expand.requestClose(() => load(null));
			return;
		}
		expand.requestOpen(r.id, { apply: () => load(roleDraft(r)) });
	}
	function openCreate(from) {
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
					groupIds: draft.groupIds
				}
			});
			dir.apply(res);
			toast.success(t("toast.saved"));
			const saved = (res.roles || []).find((r) => r.id === draft.id)
				|| (res.roles || []).find((r) => r.name.toLowerCase() === draft.name.trim().toLowerCase());
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
	async function remove(r) {
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

	const rows = creating ? [{ id: NEW_ROW, name: draft?.name || t("access.createRole"), system: false, userCount: 0, groupCount: 0, phantom: true }, ...filteredRoles] : filteredRoles;
	const empty = !filteredRoles.length && !creating;
	const locked = draft?.id === "owner";

	return (
		<ListShell
			toolbar={(
				<>
					<SearchField value={search} onChange={setSearch} placeholder={t("access.searchRoles")} />
					<FilterBar
						value={filter}
						onChange={setFilter}
						items={[
							{ id: "all", label: t("access.filterAll") },
							{ id: "system", label: t("access.system") },
							{ id: "custom", label: t("access.custom") }
						]}
					/>
					<Button type="button" size="sm" className="h-9 shrink-0" onClick={() => openCreate()}>
						<Plus className="size-3.5" /> {t("access.createRole")}
					</Button>
				</>
			)}
		>
			{empty ? (
				<EmptyHint icon={Shield} text={t("access.noCustomRoles")} action={<Button type="button" size="sm" onClick={() => openCreate()}>{t("access.createRole")}</Button>} />
			) : (
				<div className="am-list" role="list">
					<ListHead cells={[<span key="n">{t("access.roleName")}</span>, <span key="h">{t("access.roleHolders")}</span>, <span key="t" className="am-row-end">{t("access.colType")}</span>]} />
					{rows.map((r) => {
						const open = expand.openId === r.id || (r.phantom && creating);
						const rowDraft = open ? draft : null;
						const view = current && !r.phantom ? current : r;
						return (
							<ExpandRow
								key={r.id}
								id={r.id}
								expanded={open}
								onToggle={() => (r.phantom ? expand.requestClose(() => load(null)) : toggleRow(r))}
								cells={[
									<span key="n" className="am-row-title">{rowDraft?.name || roleTitle(r.id, dir.roles) || t("access.createRole")}</span>,
									<span key="h" className="am-dim">{holdersLine(view.userCount || (rowDraft?.userIds || []).length, view.groupCount || (rowDraft?.groupIds || []).length)}</span>,
									<span key="t" className="am-row-end am-dim">{r.system ? t("access.system") : t("access.custom")}</span>
								]}
							>
								{rowDraft ? (
									<>
										{expand.editing ? (
											<Section>
												<Pair>
													<label className="am-field">
														<span>{t("access.roleName")}</span>
														<input className={INPUT} value={rowDraft.name} disabled={locked} onChange={(e) => patch({ ...rowDraft, name: e.target.value })} />
													</label>
													{creating ? (
														<label className="am-field">
															<span>{t("access.basedOn")}</span>
															<select className={INPUT} value={basedOn} onChange={(e) => {
																const id = e.target.value;
																setBasedOn(id);
																const src = dir.roles.find((x) => x.id === id);
																if (src) patch({ ...rowDraft, grants: clone(src.grants || []) });
															}}>
																<option value="">{t("access.basedNone")}</option>
																{dir.roles.map((x) => <option key={x.id} value={x.id}>{roleTitle(x.id, dir.roles)}</option>)}
															</select>
														</label>
													) : (
														<label className="am-field">
															<span>{t("access.roleDesc")}</span>
															<input className={INPUT} value={rowDraft.description} disabled={locked} onChange={(e) => patch({ ...rowDraft, description: e.target.value })} />
														</label>
													)}
												</Pair>
												{creating ? (
													<label className="am-field">
														<span>{t("access.roleDesc")}</span>
														<input className={INPUT} value={rowDraft.description} onChange={(e) => patch({ ...rowDraft, description: e.target.value })} />
													</label>
												) : null}
											</Section>
										) : (
											<p className="am-meta">{rowDraft.description || (view.system ? t("access.systemHint") : t("access.noDesc"))}</p>
										)}
										<Section>
											<Pair>
												<div>
													<h5>{t("access.typeUser")}</h5>
													<EntityPicker
														kind="user"
														items={dir.users.filter((u) => u.id !== "admin")}
														selectedIds={rowDraft.userIds || []}
														labelOf={(u) => prettyLogin(u.username)}
														providers={providers}
														readOnly={!expand.editing || locked}
														onChange={(ids) => patch({ ...rowDraft, userIds: ids })}
													/>
												</div>
												<div>
													<h5>{t("access.typeGroup")}</h5>
													<EntityPicker
														kind="group"
														items={dir.groups}
														selectedIds={rowDraft.groupIds || []}
														labelOf={(g) => g.name}
														providers={providers}
														readOnly={!expand.editing || locked}
														onChange={(ids) => patch({ ...rowDraft, groupIds: ids })}
													/>
												</div>
											</Pair>
										</Section>
										<Section title={t("access.permissions")}>
											<p className="am-kicker">{t("access.permPortal")}</p>
											<PortalActions grants={rowDraft.grants} setGrants={locked || !expand.editing ? () => {} : (g) => patch({ ...rowDraft, grants: g })} locked={locked || !expand.editing} />
											{expand.editing && !locked ? <SearchField value={q} onChange={setQ} placeholder={t("access.searchPerms")} /> : null}
											<ResourceTree
												tabs={tabs}
												grants={rowDraft.grants}
												setGrants={locked || !expand.editing ? () => {} : (g) => patch({ ...rowDraft, grants: g })}
												query={expand.editing ? q : ""}
												readOnly={locked || !expand.editing}
											/>
										</Section>
										<RowActions
											editing={expand.editing}
											onEdit={view.id !== "owner" && !view.phantom ? beginEdit : null}
											onCancel={cancelEdit}
											onSave={() => void save()}
											saveDisabled={dir.busy || !rowDraft.name.trim()}
											extra={!expand.editing && !creating ? (
												<button type="button" className="am-text-btn" onClick={() => openCreate(view)}><Copy className="size-3.5" /> {t("access.duplicate")}</button>
											) : null}
											danger={!expand.editing && !creating && !view.system ? (
												<button type="button" className="am-text-btn is-danger" onClick={() => setConfirm(view)}>{t("access.deleteConfirm")}</button>
											) : null}
										/>
									</>
								) : null}
							</ExpandRow>
						);
					})}
				</div>
			)}
			{confirm ? (
				<ConfirmPopup
					title={t("access.deleteRoleTitle", { name: confirm.name })}
					body={t("access.deleteRoleBody", { users: tp("access.nUsers", confirm.userCount || 0), groups: tp("access.nGroups", confirm.groupCount || 0) })}
					busy={dir.busy}
					onCancel={() => setConfirm(null)}
					onOk={() => void remove(confirm)}
				/>
			) : null}
			<DiscardAsk ask={expand.ask} onKeep={expand.dismissAsk} onDiscard={expand.confirmAsk} />
		</ListShell>
	);
}

export function MovePickDialog({ category, tabs, fromTabId, busy, onCancel, onContinue }) {
	const others = (tabs || []).filter((tab) => tab.id !== fromTabId);
	const [dest, setDest] = useState(others[0]?.id || "");
	return (
		<div>
			<h3 className="dialog-title">{t("access.moveTitle", { name: category?.name })}</h3>
			<p className="mt-2 text-sm text-muted">{t("access.movePickLead")}</p>
			{others.length ? (
				<label className="am-field mt-3">
					<span>{t("access.moveDest")}</span>
					<select className={INPUT} value={dest} onChange={(e) => setDest(e.target.value)}>
						{others.map((tab) => <option key={tab.id} value={tab.id}>{tab.name}</option>)}
					</select>
				</label>
			) : <p className="mt-3 text-sm text-muted">{t("access.moveNoDest")}</p>}
			<div className="mt-5 flex justify-end gap-2">
				<Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>{t("actions.cancel")}</Button>
				<Button type="button" disabled={busy || !dest} onClick={() => onContinue(dest)}>{t("access.movePreview")}</Button>
			</div>
		</div>
	);
}

export function MoveSectionDialog({ impact, busy, onCancel, onConfirm }) {
	if (!impact) return null;
	return (
		<div>
			<h3 className="dialog-title">{t("access.moveTitle", { name: impact.categoryName })}</h3>
			<p className="mt-2 text-sm text-muted">{t("access.moveFromTo", { from: impact.fromName, to: impact.toName })}</p>
			{impact.changed ? (
				<div className="am-impact">
					<p className="am-kicker">{t("access.moveImpact")}</p>
					<p className="am-note">{t("access.moveImpactLead", { roles: impact.roleCount, users: impact.userCount })}</p>
					{impact.lost.map((row) => (
						<p key={`l-${row.id}`} className="am-impact-row">{row.name} — {t("access.loses")} {row.lost.map(actionLabel).join(", ")}</p>
					))}
					{impact.gained.map((row) => (
						<p key={`g-${row.id}`} className="am-impact-row">{row.name} — {t("access.gains")} {row.gained.map(actionLabel).join(", ")}</p>
					))}
					<p className="am-note">{t("access.moveDirectKeep")}</p>
				</div>
			) : <p className="mt-3 text-sm text-muted">{t("access.moveNoImpact")}</p>}
			<div className="mt-5 flex justify-end gap-2">
				<Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>{t("actions.cancel")}</Button>
				<Button type="button" onClick={onConfirm} disabled={busy}>{t("access.moveConfirm")}</Button>
			</div>
		</div>
	);
}
