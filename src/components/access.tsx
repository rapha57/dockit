import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, Copy, Lock, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	can,
	effectiveAccess,
	explain,
	PORTAL_ACTIONS,
	syntheticUserFromGroup,
	TREE_ACTIONS
} from "@/lib/acl";
import { t, te, tp } from "@/lib/i18n";
import { PASSWORD_MIN } from "@/lib/security";
import { deleteGroup, deleteRole, deleteUser, listUsers, saveGroup, saveRole, saveUser } from "@/lib/portal";

const INPUT = "field-input h-10 w-full rounded-md border border-border bg-transparent px-3 text-sm text-fg outline-none placeholder:text-subtle";

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

function namesOf(ids, rows, key = "name") {
	return (ids || []).map((id) => {
		const row = rows.find((r) => r.id === id);
		return row ? prettyLogin(row[key] || row.username || row.name) : null;
	}).filter(Boolean);
}

function joinNames(list, empty) {
	if (!list.length) return empty;
	if (list.length <= 2) return list.join(", ");
	return `${list.slice(0, 2).join(", ")} +${list.length - 2}`;
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

function Workbench({ toolbar, master, detail, selected, onBack }) {
	return (
		<div className={`am-work${selected ? " has-detail" : ""}`}>
			<div className="am-toolbar">{toolbar}</div>
			<div className="am-stage">
				<div className="am-master" hidden={false}>{master}</div>
				{selected ? (
					<div className="am-inspector" role="region" aria-live="polite">
						<button type="button" className="am-back" onClick={onBack}>
							<ChevronLeft className="size-3.5" /> {t("access.backList")}
						</button>
						{detail}
					</div>
				) : null}
			</div>
		</div>
	);
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

function EmptyHint({ text, action }) {
	return (
		<div className="am-empty">
			<p>{text}</p>
			{action}
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

function ConfirmPopup({ title, body, onCancel, onOk, busy }) {
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
					<Button type="button" variant="danger" onClick={onOk} disabled={busy}>{t("actions.delete")}</Button>
				</div>
			</div>
		</div>,
		document.body
	);
}

function Section({ title, hint, children }) {
	return (
		<section className="am-sec">
			<h5>{title}</h5>
			{hint ? <p className="am-note">{hint}</p> : null}
			{children}
		</section>
	);
}

function CheckList({ items, values, onToggle, labelOf }) {
	return (
		<ul className="am-check-list">
			{items.map((item) => (
				<li key={item.id}>
					<label>
						<input type="checkbox" checked={values.includes(item.id)} onChange={() => onToggle(item.id)} />
						{labelOf(item)}
					</label>
				</li>
			))}
		</ul>
	);
}

export function AccessUsers({ token, actor, tabs: seedTabs }) {
	const dir = useDirectory(token);
	const tabs = dir.tabs.length ? dir.tabs : seedTabs || [];
	const [q, setQ] = useState("");
	const [filter, setFilter] = useState("all");
	const [sel, setSel] = useState(null);
	const [why, setWhy] = useState(null);
	const [confirm, setConfirm] = useState(null);
	const [draft, setDraft] = useState(null);
	const creating = Boolean(draft && !draft.id);
	const people = dir.users;
	const filtered = people.filter((u) => {
		if (filter === "disabled" && !u.disabled) return false;
		if (filter !== "all" && filter !== "disabled" && !(u.roleIds || []).includes(filter)) return false;
		if (q && !prettyLogin(u.username).toLowerCase().includes(q.toLowerCase())) return false;
		return true;
	});
	const canCreate = actor?.role === "admin" || actor?.canManageUsers;
	const lockedOwner = draft?.id === "admin";
	const current = people.find((u) => u.id === sel);

	function open(u) {
		setWhy(null);
		setConfirm(null);
		setSel(u.id);
		setDraft({
			id: u.id,
			username: u.username,
			password: "",
			roleIds: [...(u.roleIds || [])],
			groupIds: [...(u.groupIds || [])],
			grants: [...(u.grants || [])],
			disabled: Boolean(u.disabled)
		});
	}
	function openCreate() {
		setSel("new");
		setDraft({ id: "", username: "", password: "", roleIds: ["lecteur"], groupIds: [], grants: [], disabled: false });
	}
	function close() {
		setSel(null);
		setDraft(null);
		setWhy(null);
		setConfirm(null);
	}
	function toggle(list, id, fallback) {
		const has = list.includes(id);
		const next = has ? list.filter((x) => x !== id) : [...list, id];
		return next.length ? next : fallback;
	}
	async function save() {
		if (!draft?.username?.trim()) return;
		dir.setBusy(true);
		try {
			dir.apply(await saveUser({
				data: {
					token,
					id: draft.id || undefined,
					username: draft.username,
					password: draft.password || undefined,
					roleIds: draft.roleIds,
					groupIds: draft.groupIds,
					grants: draft.grants,
					disabled: draft.disabled
				}
			}));
			toast.success(t("toast.saved"));
			if (!draft.id) close();
			else setDraft({ ...draft, password: "" });
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
			close();
		} catch (err) {
			if (!sessionGone(err)) toast.error(te(err));
		} finally {
			dir.setBusy(false);
		}
	}

	return (
		<Workbench
			selected={Boolean(draft)}
			onBack={close}
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
			master={!dir.busy && !filtered.length ? (
				<EmptyHint text={t("access.empty")} action={canCreate ? <Button type="button" size="sm" onClick={openCreate}>{t("access.create")}</Button> : null} />
			) : (
				<table className="am-table">
					<thead>
						<tr>
							<th>{t("access.colUser")}</th>
							<th>{t("access.groups")}</th>
							<th>{t("users.role")}</th>
							<th>{t("access.colStatus")}</th>
						</tr>
					</thead>
					<tbody>
						{filtered.map((u) => (
							<tr key={u.id} className={sel === u.id ? "is-on" : ""} onClick={() => open(u)}>
								<td>{prettyLogin(u.username)}</td>
								<td className="am-dim">{joinNames(namesOf(u.groupIds, dir.groups), "—")}</td>
								<td>{joinNames((u.roleIds || []).map((id) => roleTitle(id, dir.roles)), "—")}</td>
								<td><StatusText off={u.disabled} /></td>
							</tr>
						))}
					</tbody>
				</table>
			)}
			detail={draft ? (
				<>
					<header className="am-id-head">
						<h4>{creating ? t("access.create") : prettyLogin(draft.username)}</h4>
						{!creating ? <StatusText off={draft.disabled} /> : null}
					</header>
					<Section title={t("access.identity")}>
						<label className="am-field">
							<span>{t("lock.username")}</span>
							<input className={INPUT} value={draft.username} disabled={lockedOwner} autoComplete="off" onChange={(e) => setDraft({ ...draft, username: e.target.value })} />
						</label>
						<label className="am-field">
							<span>{creating ? t("lock.password") : t("users.newPassword")}</span>
							<input className={INPUT} type="password" value={draft.password} autoComplete="new-password" onChange={(e) => setDraft({ ...draft, password: e.target.value })} />
						</label>
						{!lockedOwner ? (
							<label className="am-inline">
								<input type="checkbox" checked={Boolean(draft.disabled)} onChange={() => setDraft({ ...draft, disabled: !draft.disabled })} />
								{t("access.disabled")}
							</label>
						) : <p className="am-note">{t("access.roleLocked")}</p>}
					</Section>
					{!lockedOwner ? (
						<>
							<Section title={t("users.role")}>
								<CheckList
									items={dir.roles.filter((r) => r.id !== "owner")}
									values={draft.roleIds || []}
									labelOf={(r) => roleTitle(r.id, dir.roles)}
									onToggle={(id) => setDraft({ ...draft, roleIds: toggle(draft.roleIds, id, ["lecteur"]) })}
								/>
							</Section>
							{dir.groups.length ? (
								<Section title={t("access.groupsOf")}>
									<CheckList
										items={dir.groups}
										values={draft.groupIds || []}
										labelOf={(g) => g.name}
										onToggle={(id) => setDraft({ ...draft, groupIds: toggle(draft.groupIds, id, []) })}
									/>
								</Section>
							) : null}
							<Section title={t("access.directPerms")} hint={t("access.directHint")}>
								<ResourceTree tabs={tabs} grants={draft.grants || []} setGrants={(g) => setDraft({ ...draft, grants: g })} query="" />
							</Section>
						</>
					) : null}
					<div className="am-actions">
						<Button type="button" size="sm" disabled={dir.busy || !draft.username.trim() || (creating && (draft.password || "").length < PASSWORD_MIN)} onClick={() => void save()}>
							{t("actions.save")}
						</Button>
						{!creating && !lockedOwner ? (
							<button type="button" className="am-text-btn is-danger" onClick={() => setConfirm(current)}>{t("access.deleteConfirm")}</button>
						) : null}
					</div>
					{confirm ? (
						<ConfirmPopup
							title={t("access.deleteUserTitle", { name: prettyLogin(confirm.username) })}
							body={t("access.deleteUserBody")}
							busy={dir.busy}
							onCancel={() => setConfirm(null)}
							onOk={() => void remove(confirm)}
						/>
					) : null}
					{current && !creating ? (
						<Section title={t("access.effective")} hint={t("access.whyClick")}>
							<EffectiveTree user={current} doc={MiniDoc(dir)} onWhy={setWhy} />
							<WhyPanel info={why} onClose={() => setWhy(null)} />
						</Section>
					) : null}
				</>
			) : null}
		/>
	);
}

export function AccessGroups({ token, actor, tabs: seedTabs }) {
	const dir = useDirectory(token);
	const tabs = dir.tabs.length ? dir.tabs : seedTabs || [];
	const [q, setQ] = useState("");
	const [sel, setSel] = useState(null);
	const [draft, setDraft] = useState(null);
	const [why, setWhy] = useState(null);
	const [confirm, setConfirm] = useState(null);
	const filtered = dir.groups.filter((g) => !q || g.name.toLowerCase().includes(q.toLowerCase()));
	const canCreate = actor?.role === "admin" || actor?.canManageGroups || actor?.canManageUsers;
	const people = dir.users.filter((u) => u.id !== "admin");
	const current = dir.groups.find((g) => g.id === sel);

	function open(g) {
		setWhy(null);
		setConfirm(null);
		setSel(g.id);
		setDraft({ id: g.id, name: g.name, roleIds: [...(g.roleIds || [])], members: [...(g.members || [])] });
	}
	function close() {
		setSel(null);
		setDraft(null);
		setWhy(null);
		setConfirm(null);
	}
	function toggle(list, id, fallback) {
		const has = list.includes(id);
		const next = has ? list.filter((x) => x !== id) : [...list, id];
		return next.length || fallback === undefined ? next : fallback;
	}
	async function save() {
		if (!draft?.name?.trim()) return;
		dir.setBusy(true);
		try {
			dir.apply(await saveGroup({
				data: { token, id: draft.id || undefined, name: draft.name, roleIds: draft.roleIds, members: draft.members }
			}));
			toast.success(t("toast.saved"));
			if (!draft.id) close();
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
			close();
		} catch (err) {
			if (!sessionGone(err)) toast.error(te(err));
		} finally {
			dir.setBusy(false);
		}
	}

	return (
		<Workbench
			selected={Boolean(draft)}
			onBack={close}
			toolbar={(
				<>
					<SearchField value={q} onChange={setQ} placeholder={t("nav.search")} />
					{canCreate ? (
						<Button type="button" size="sm" className="h-9 shrink-0" onClick={() => { setSel("new"); setDraft({ id: "", name: "", roleIds: ["lecteur"], members: [] }); }}>
							<Plus className="size-3.5" /> {t("access.createGroup")}
						</Button>
					) : null}
				</>
			)}
			master={!dir.busy && !filtered.length ? (
				<EmptyHint text={t("access.noGroups")} action={canCreate ? <Button type="button" size="sm" onClick={() => { setSel("new"); setDraft({ id: "", name: "", roleIds: ["lecteur"], members: [] }); }}>{t("access.createGroup")}</Button> : null} />
			) : (
				<table className="am-table">
					<thead>
						<tr>
							<th>{t("access.groupName")}</th>
							<th>{t("access.members")}</th>
							<th>{t("users.role")}</th>
						</tr>
					</thead>
					<tbody>
						{filtered.map((g) => (
							<tr key={g.id} className={sel === g.id ? "is-on" : ""} onClick={() => open(g)}>
								<td>{g.name}</td>
								<td className="am-dim">{tp("access.memberCount", (g.members || []).length)}</td>
								<td>{joinNames((g.roleIds || []).map((id) => roleTitle(id, dir.roles)), "—")}</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
			detail={draft ? (
				<>
					<header className="am-id-head">
						<h4>{draft.id ? draft.name || t("access.newGroup") : t("access.createGroup")}</h4>
					</header>
					<Section title={t("access.identity")}>
						<label className="am-field">
							<span>{t("access.groupName")}</span>
							<input className={INPUT} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
						</label>
					</Section>
					<Section title={t("users.role")}>
						<CheckList
							items={dir.roles.filter((r) => r.id !== "owner")}
							values={draft.roleIds || []}
							labelOf={(r) => roleTitle(r.id, dir.roles)}
							onToggle={(id) => setDraft({ ...draft, roleIds: toggle(draft.roleIds, id, ["lecteur"]) })}
						/>
					</Section>
					<Section title={t("access.members")}>
						{people.length ? (
							<CheckList
								items={people}
								values={draft.members || []}
								labelOf={(u) => prettyLogin(u.username)}
								onToggle={(id) => setDraft({ ...draft, members: toggle(draft.members, id, []) })}
							/>
						) : <p className="am-note">{t("access.noMembers")}</p>}
					</Section>
					<div className="am-actions">
						<Button type="button" size="sm" disabled={dir.busy || !draft.name.trim()} onClick={() => void save()}>{t("actions.save")}</Button>
						{draft.id ? <button type="button" className="am-text-btn is-danger" onClick={() => setConfirm(current)}>{t("access.deleteConfirm")}</button> : null}
					</div>
					{confirm ? (
						<ConfirmPopup
							title={t("access.deleteGroupTitle", { name: confirm.name })}
							body={t("access.deleteGroupBody", { n: (confirm.members || []).length })}
							busy={dir.busy}
							onCancel={() => setConfirm(null)}
							onOk={() => void remove(confirm)}
						/>
					) : null}
					{current && draft.id ? (
						<Section title={t("access.effective")} hint={t("access.groupEffectiveHint", { n: (current.members || []).length })}>
							<EffectiveTree user={syntheticUserFromGroup(current)} doc={MiniDoc({ ...dir, tabs })} onWhy={setWhy} />
							<WhyPanel info={why} onClose={() => setWhy(null)} />
						</Section>
					) : null}
				</>
			) : null}
		/>
	);
}

export function AccessRoles({ token, actor, tabs: seedTabs }) {
	const dir = useDirectory(token);
	const tabs = dir.tabs.length ? dir.tabs : seedTabs || [];
	const [sel, setSel] = useState(null);
	const [screen, setScreen] = useState("detail");
	const [draft, setDraft] = useState(null);
	const [q, setQ] = useState("");
	const [search, setSearch] = useState("");
	const [basedOn, setBasedOn] = useState("");
	const [confirm, setConfirm] = useState(null);
	const [filter, setFilter] = useState("all");
	const current = dir.roles.find((r) => r.id === sel);
	const qn = search.trim().toLowerCase();
	const filteredRoles = dir.roles.filter((r) => {
		if (filter === "system" && !r.system) return false;
		if (filter === "custom" && r.system) return false;
		if (qn && !roleTitle(r.id, dir.roles).toLowerCase().includes(qn)) return false;
		return true;
	});

	function open(r) {
		setSel(r.id);
		setScreen("detail");
		setConfirm(null);
		setDraft(null);
	}
	function startCreate(from) {
		const src = from || dir.roles.find((r) => r.id === basedOn);
		const copied = Boolean(from && src);
		setScreen("edit");
		setSel("new");
		setDraft({
			id: "",
			name: copied ? `${String(src.name || "").replace(/\s*\((copie|copy)\)\s*$/i, "")} (${t("copy.suffix")})`.slice(0, 40) : "",
			description: src?.description || "",
			grants: src ? JSON.parse(JSON.stringify(src.grants || [])) : [],
			userIds: [],
			groupIds: []
		});
	}
	function startEdit(r) {
		if (r.id === "owner") return;
		setScreen("edit");
		setDraft({
			id: r.id,
			name: r.name,
			description: r.description || "",
			grants: JSON.parse(JSON.stringify(r.grants || [])),
			userIds: dir.users.filter((u) => (u.roleIds || []).includes(r.id) && u.id !== "admin").map((u) => u.id),
			groupIds: dir.groups.filter((g) => (g.roleIds || []).includes(r.id)).map((g) => g.id)
		});
	}
	async function save() {
		if (!draft?.name?.trim()) return;
		dir.setBusy(true);
		try {
			dir.apply(await saveRole({
				data: {
					token,
					id: draft.id || undefined,
					name: draft.name.trim(),
					description: draft.description,
					grants: draft.grants,
					userIds: draft.userIds,
					groupIds: draft.groupIds
				}
			}));
			toast.success(t("toast.saved"));
			setScreen("detail");
			setDraft(null);
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
			setSel(null);
		} catch (err) {
			if (!sessionGone(err)) toast.error(te(err));
		} finally {
			dir.setBusy(false);
		}
	}

	if (screen === "edit" && draft) {
		const locked = draft.id === "owner";
		return (
			<div className="am-work is-editor">
				<div className="am-toolbar">
					<button type="button" className="am-back is-inline" onClick={() => { setScreen("detail"); setDraft(null); }}>
						<ChevronLeft className="size-3.5" /> {t("access.backList")}
					</button>
					<span className="am-toolbar-title">{draft.id ? t("access.editRole") : t("access.createRole")}</span>
				</div>
				<div className="am-editor">
					<div className="am-editor-meta">
						<label className="am-field">
							<span>{t("access.roleName")}</span>
							<input className={INPUT} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
						</label>
						<label className="am-field">
							<span>{t("access.roleDesc")}</span>
							<textarea className={`${INPUT} am-textarea`} rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
						</label>
						{!draft.id ? (
							<label className="am-field">
								<span>{t("access.basedOn")}</span>
								<select className={INPUT} value={basedOn} onChange={(e) => {
									const id = e.target.value;
									setBasedOn(id);
									const src = dir.roles.find((r) => r.id === id);
									if (src) setDraft({ ...draft, grants: JSON.parse(JSON.stringify(src.grants || [])) });
								}}>
									<option value="">{t("access.basedNone")}</option>
									{dir.roles.map((r) => <option key={r.id} value={r.id}>{roleTitle(r.id, dir.roles)}</option>)}
								</select>
							</label>
						) : null}
						{!locked ? (
							<>
								<p className="am-kicker">{t("access.typeUser")}</p>
								<CheckList items={dir.users.filter((u) => u.id !== "admin")} values={draft.userIds || []} labelOf={(u) => prettyLogin(u.username)} onToggle={(id) => setDraft({ ...draft, userIds: draft.userIds.includes(id) ? draft.userIds.filter((x) => x !== id) : [...draft.userIds, id] })} />
								<p className="am-kicker">{t("access.typeGroup")}</p>
								<CheckList items={dir.groups} values={draft.groupIds || []} labelOf={(g) => g.name} onToggle={(id) => setDraft({ ...draft, groupIds: draft.groupIds.includes(id) ? draft.groupIds.filter((x) => x !== id) : [...draft.groupIds, id] })} />
							</>
						) : <p className="am-note">{t("access.roleLocked")}</p>}
					</div>
					<div className="am-editor-body">
						<p className="am-kicker">{t("access.permPortal")}</p>
						<PortalActions grants={draft.grants} setGrants={(g) => setDraft({ ...draft, grants: g })} locked={locked} />
						<SearchField value={q} onChange={setQ} placeholder={t("access.searchPerms")} />
						<ResourceTree tabs={tabs} grants={draft.grants} setGrants={locked ? () => {} : (g) => setDraft({ ...draft, grants: g })} query={q} readOnly={locked} />
					</div>
				</div>
				<div className="am-editor-foot">
					<button type="button" className="am-text-btn" onClick={() => { setScreen("detail"); setDraft(null); }}>{t("actions.cancel")}</button>
					<Button type="button" size="sm" disabled={dir.busy || !draft.name.trim()} onClick={() => void save()}>{draft.id ? t("actions.save") : t("access.createRole")}</Button>
				</div>
			</div>
		);
	}

	return (
		<Workbench
			selected={Boolean(current)}
			onBack={() => setSel(null)}
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
					<Button type="button" size="sm" className="h-9 shrink-0" onClick={() => startCreate()}>
						<Plus className="size-3.5" /> {t("access.createRole")}
					</Button>
				</>
			)}
			master={!filteredRoles.length ? (
				<EmptyHint text={t("access.noCustomRoles")} action={<Button type="button" size="sm" onClick={() => startCreate()}>{t("access.createRole")}</Button>} />
			) : (
				<table className="am-table">
					<thead>
						<tr>
							<th>{t("access.roleName")}</th>
							<th>{t("access.roleHolders")}</th>
							<th>{t("access.colType")}</th>
						</tr>
					</thead>
					<tbody>
						{filteredRoles.map((r) => (
							<tr key={r.id} className={sel === r.id ? "is-on" : ""} onClick={() => open(r)}>
								<td>{roleTitle(r.id, dir.roles)}</td>
								<td className="am-dim">{t("access.assignedPlain", { users: r.userCount || 0, groups: r.groupCount || 0 })}</td>
								<td className="am-dim">{r.system ? t("access.system") : t("access.custom")}</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
			detail={current ? (
				<>
					<header className="am-id-head">
						<div>
							<h4>{roleTitle(current.id, dir.roles)}</h4>
							<p className="am-note">{current.description || (current.system ? t("access.systemHint") : t("access.noDesc"))}</p>
						</div>
					</header>
					<p className="am-stat">{t("access.roleStats", { users: current.userCount || 0, groups: current.groupCount || 0, n: current.grantCount || 0 })}</p>
					<div className="am-actions">
						{current.id !== "owner" ? <Button type="button" size="sm" onClick={() => startEdit(current)}>{t("access.editRole")}</Button> : null}
						<button type="button" className="am-text-btn" onClick={() => startCreate(current)}><Copy className="size-3.5" /> {t("access.duplicate")}</button>
						{!current.system ? <button type="button" className="am-text-btn is-danger" onClick={() => setConfirm(current)}>{t("access.deleteConfirm")}</button> : null}
					</div>
					{confirm ? (
						<ConfirmPopup
							title={t("access.deleteRoleTitle", { name: confirm.name })}
							body={t("access.deleteRoleBody", { users: confirm.userCount || 0, groups: confirm.groupCount || 0 })}
							busy={dir.busy}
							onCancel={() => setConfirm(null)}
							onOk={() => void remove(confirm)}
						/>
					) : null}
					<Section title={t("access.permissions")}>
						<EffectiveTree user={{ id: "_r", roleIds: [current.id], grants: [] }} doc={MiniDoc(dir)} />
					</Section>
				</>
			) : null}
		/>
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
