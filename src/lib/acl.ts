export type ResKind = "portal" | "tab" | "cat" | "card";

export type Grant = {
	res: ResKind;
	id: string;
	allow: string[];
	deny: string[];
	scope?: "public";
};

export type GrantInput = {
	res: ResKind;
	id: string;
	allow?: string[];
	deny?: string[];
	scope?: "public";
};

export type Card = { id: string; title?: string; kind?: string; categoryId?: string; [key: string]: any };
export type Category = {
	id: string;
	name?: string;
	restricted?: boolean;
	sortOrder?: number;
	apps?: Card[];
	categories?: Category[];
	editors?: string[];
	viewers?: string[];
	[key: string]: any;
};
export type Tab = {
	id: string;
	name?: string;
	restricted?: boolean;
	categories?: Category[];
	editors?: string[];
	viewers?: string[];
	[key: string]: any;
};

export type Role = {
	id: string;
	name?: string;
	description?: string;
	system?: boolean;
	grants: GrantInput[];
	[key: string]: any;
};

export type User = {
	id: string;
	username?: string;
	roleIds?: string[];
	role?: string;
	groupIds?: string[];
	grants?: GrantInput[];
	[key: string]: any;
};

export type Group = {
	id: string;
	name?: string;
	roleIds?: string[];
	role?: string;
	members?: string[];
	grants?: GrantInput[];
	[key: string]: any;
};

export type AclDoc = {
	tabs?: Tab[];
	users?: User[];
	groups?: Group[];
	roles?: Role[];
	[key: string]: any;
};

const RES: ResKind[] = ["portal", "tab", "cat", "card"];
export const PORTAL_ACTIONS = [
	"users.manage",
	"groups.manage",
	"roles.manage",
	"settings",
	"audit",
	"restore",
	"purge",
	"spaces.create"
];
export const NODE_ACTIONS = ["view", "open", "edit", "create", "delete", "move"];
export const TREE_ACTIONS: Record<string, string[]> = {
	tab: ["view", "open", "edit", "create", "delete", "move"],
	cat: ["view", "open", "edit", "create", "delete", "move"],
	card: ["view", "open", "edit", "delete", "move"]
};
export const SYSTEM_ROLE_IDS = ["owner", "admin", "editeur", "lecteur"];
const ALL_ACTIONS = [...PORTAL_ACTIONS, ...NODE_ACTIONS, "*"];

const SPEC: Record<string, number> = {
	card: 400,
	"card:*": 300,
	cat: 200,
	"cat:*": 150,
	tab: 100,
	"tab:*": 50,
	portal: 10
};

export function asIdList(raw: unknown): string[] {
	if (!Array.isArray(raw)) return [];
	const out: string[] = [];
	const seen = new Set<string>();
	for (const value of raw) {
		const id = String(value || "").trim();
		if (!id || seen.has(id)) continue;
		seen.add(id);
		out.push(id);
	}
	return out;
}

function asActions(raw: unknown): string[] {
	if (!Array.isArray(raw)) return [];
	const out: string[] = [];
	const seen = new Set<string>();
	for (const value of raw) {
		const a = String(value || "").trim();
		if (!ALL_ACTIONS.includes(a) || seen.has(a)) continue;
		seen.add(a);
		out.push(a);
	}
	return out;
}

export function asGrants(raw: unknown): Grant[] {
	if (!Array.isArray(raw)) return [];
	const out: Grant[] = [];
	for (const row of raw.slice(0, 200)) {
		const res = RES.includes(row?.res) ? (row.res as ResKind) : undefined;
		if (!res) continue;
		const id = String(row?.id || "*").slice(0, 80) || "*";
		const allow = asActions(row?.allow);
		const deny = asActions(row?.deny);
		if (!allow.length && !deny.length) continue;
		const grant: Grant = { res, id, allow, deny };
		if (row?.scope === "public") grant.scope = "public";
		out.push(grant);
	}
	return out;
}

export function mergeGrant(list: Grant[], grant: GrantInput): Grant[] {
	const allow = asActions(grant.allow);
	const deny = asActions(grant.deny);
	if (!allow.length && !deny.length) return list;
	const scope = grant.scope === "public" ? "public" : undefined;
	const hit = list.find((g) => g.res === grant.res && g.id === grant.id && (g.scope || undefined) === scope);
	if (hit) {
		hit.allow = asActions([...hit.allow, ...allow]);
		hit.deny = asActions([...hit.deny, ...deny]);
		return list;
	}
	list.push({
		res: grant.res,
		id: grant.id,
		allow,
		deny,
		...(scope ? { scope } : {})
	});
	return list;
}

export function defaultRoles(): Role[] {
	return [
		{
			id: "owner",
			name: "Owner",
			description: "",
			system: true,
			grants: [{ res: "portal", id: "*", allow: ["*"] }]
		},
		{
			id: "admin",
			name: "Admin",
			description: "",
			system: true,
			grants: [
				{ res: "portal", id: "*", allow: ["users.manage", "groups.manage", "roles.manage", "settings", "audit", "restore"] },
				{ res: "tab", id: "*", allow: ["view", "open"] }
			]
		},
		{
			id: "editeur",
			name: "Editor",
			description: "",
			system: true,
			grants: [
				{ res: "portal", id: "*", allow: ["restore"] },
				{ res: "tab", id: "*", allow: ["view", "open", "edit", "create", "delete", "move"], scope: "public" }
			]
		},
		{
			id: "lecteur",
			name: "Viewer",
			description: "",
			system: true,
			grants: []
		}
	];
}

export function grantsFromLegacyRole(r: any): Grant[] {
	if (Array.isArray(r?.grants) && r.grants.length) return asGrants(r.grants);
	const grants: Grant[] = [];
	const p = r?.perms && typeof r.perms === "object" ? r.perms : {};
	const portalAllow: string[] = [];
	if (p.audit) portalAllow.push("audit");
	if (p.restore) portalAllow.push("restore");
	if (p.purge) portalAllow.push("purge");
	if (p.settings) portalAllow.push("settings");
	if (p.access) portalAllow.push("users.manage", "groups.manage");
	if (p.createSpaces) portalAllow.push("spaces.create");
	if (portalAllow.length) mergeGrant(grants, { res: "portal", id: "*", allow: portalAllow });
	if (r?.tabs && typeof r.tabs === "object") {
		for (const [tid, lv] of Object.entries(r.tabs)) {
			if (lv === "edit") mergeGrant(grants, { res: "tab", id: String(tid), allow: ["view", "open", "edit", "move"] });
			else if (lv === "view") mergeGrant(grants, { res: "tab", id: String(tid), allow: ["view", "open"] });
		}
	}
	if (r?.cats && typeof r.cats === "object") {
		for (const [cid, on] of Object.entries(r.cats)) {
			if (on) mergeGrant(grants, { res: "cat", id: String(cid), allow: ["view", "open"] });
		}
	}
	return grants;
}

export function isSystemRole(id: unknown): boolean {
	return SYSTEM_ROLE_IDS.includes(id as string);
}

export function isOwnerUser(user: User | null | undefined): boolean {
	if (!user) return false;
	if (user.id === "admin") return true;
	const ids = roleIdsOf(user);
	return ids.includes("owner");
}

export function roleIdsOf(row: any): string[] {
	const ids = asIdList(row?.roleIds);
	if (ids.length) return ids;
	const legacy = String(row?.role || "").trim();
	return legacy ? [legacy] : [];
}

export function groupsOf(user: User | null | undefined, doc: AclDoc): Group[] {
	if (!user) return [];
	const ids = new Set(asIdList(user.groupIds));
	for (const g of doc.groups || []) if ((g.members || []).includes(user.id)) ids.add(g.id);
	return (doc.groups || []).filter((g) => ids.has(g.id));
}

export type ChainNode = { res: ResKind; id: string; name?: string; restricted: boolean };
export type LocateResult = { tab?: Tab; cat?: Category; app?: Card; chain: ChainNode[] };

export function locate(doc: AclDoc, res: ResKind, id: string | null | undefined): LocateResult {
	if (res === "portal" || !id || id === "*") {
		return {
			chain: [{ res: "portal", id: "*", restricted: false }]
		};
	}
	for (const tab of doc.tabs || []) {
		if (res === "tab" && tab.id === id) {
			return {
				tab,
				chain: [
					{ res: "tab", id: tab.id, name: tab.name, restricted: Boolean(tab.restricted) },
					{ res: "portal", id: "*", restricted: false }
				]
			};
		}
		for (const cat of tab.categories || []) {
			if (res === "cat" && cat.id === id) {
				return {
					tab,
					cat,
					chain: [
						{ res: "cat", id: cat.id, name: cat.name, restricted: Boolean(cat.restricted) },
						{ res: "tab", id: tab.id, name: tab.name, restricted: Boolean(tab.restricted) },
						{ res: "portal", id: "*", restricted: false }
					]
				};
			}
			if (res === "card") {
				const app = (cat.apps || []).find((a) => a.id === id);
				if (app) {
					return {
						tab,
						cat,
						app,
						chain: [
							{ res: "card", id: app.id, name: app.title, restricted: false },
							{ res: "cat", id: cat.id, name: cat.name, restricted: Boolean(cat.restricted) },
							{ res: "tab", id: tab.id, name: tab.name, restricted: Boolean(tab.restricted) },
							{ res: "portal", id: "*", restricted: false }
						]
					};
				}
			}
		}
	}
	return {
		chain: [{ res: "portal", id: "*", restricted: false }]
	};
}

function chainRestricted(chain: ChainNode[]): boolean {
	return chain.some((n) => n.restricted);
}

function scoreGrant(grant: Grant, node: ChainNode): number {
	if (grant.res !== node.res) return 0;
	if (grant.id === node.id) return SPEC[grant.res] || 0;
	if (grant.id === "*") return SPEC[`${grant.res}:*`] || 0;
	return 0;
}

function actionHits(list: string[], action: string): boolean {
	return list.includes("*") || list.includes(action);
}

export type SourceKind = "direct" | "system" | "role" | "group" | "public";
type Pack = { grant: Grant; kind: SourceKind; role?: Role | null; group?: Group };

function collectPacked(user: User | null | undefined, doc: AclDoc): Pack[] {
	const out: Pack[] = [];
	if (!user) return out;
	for (const grant of asGrants(user.grants)) {
		out.push({ grant, kind: "direct" });
	}
	const roles = doc.roles || [];
	const roleOf = (id: string) => roles.find((r) => r.id === id);
	for (const rid of roleIdsOf(user)) {
		const role = roleOf(rid);
		if (!role) continue;
		for (const grant of asGrants(role.grants)) {
			out.push({ grant, kind: role.system ? "system" : "role", role });
		}
	}
	for (const group of groupsOf(user, doc)) {
		for (const grant of asGrants(group.grants)) {
			out.push({ grant, kind: "group", group, role: null });
		}
		for (const rid of roleIdsOf(group)) {
			const role = roleOf(rid);
			if (!role) continue;
			for (const grant of asGrants(role.grants)) {
				out.push({
					grant,
					kind: "group",
					group,
					role
				});
			}
		}
	}
	return out;
}

type Effect = "allow" | "deny";
type MatchHit = { spec: number; effect: Effect; node: ChainNode };

function matchesGrant(grant: Grant, action: string, chain: ChainNode[]): MatchHit | null {
	if (grant.scope === "public" && chainRestricted(chain)) return null;
	let best: MatchHit | null = null;
	for (const node of chain) {
		const spec = scoreGrant(grant, node);
		if (!spec) continue;
		const deny = actionHits(grant.deny || [], action);
		const allow = actionHits(grant.allow || [], action);
		if (!deny && !allow) continue;
		const row: MatchHit = { spec, effect: deny ? "deny" : "allow", node };
		if (!best || row.spec > best.spec || (row.spec === best.spec && row.effect === "deny")) best = row;
	}
	return best;
}

export type Resource = { res?: ResKind; id?: string | null };
export type Source = Pack & { effect: Effect; spec: number; node: ChainNode };
export type Winner = { kind: string; role?: { id: string; name?: string } | Role | null; effect: Effect; spec: number; group?: Group; node?: ChainNode };
export type Decision = { allowed: boolean; action: string; resource: ChainNode; winner: Winner | null; sources: Source[] };

export function decide(user: User | null | undefined, action: string, resource: Resource | null | undefined, doc: AclDoc): Decision {
	const res = resource?.res || "portal";
	const id = resource?.id || "*";
	const found = locate(doc, res, id);
	const chain = found.chain || [];
	const target: ChainNode = chain[0] || { res, id, restricted: false };
	const sources: Source[] = [];

	if (isOwnerUser(user)) {
		const winner: Winner = { kind: "system", role: { id: "owner", name: "Owner" }, effect: "allow", spec: 1000 };
		return {
			allowed: true,
			action,
			resource: target,
			winner,
			sources: [winner as unknown as Source]
		};
	}

	for (const pack of collectPacked(user, doc)) {
		const hit = matchesGrant(pack.grant, action, chain);
		if (!hit) continue;
		sources.push({
			...pack,
			effect: hit.effect,
			spec: hit.spec,
			node: hit.node
		});
	}

	sources.sort((a, b) => b.spec - a.spec || (a.effect === "deny" ? -1 : 1) - (b.effect === "deny" ? -1 : 1));
	const topSpec = sources[0]?.spec || 0;
	const atTop = sources.filter((s) => s.spec === topSpec);
	const deny = atTop.find((s) => s.effect === "deny");
	const allow = atTop.find((s) => s.effect === "allow");
	if (deny) {
		return { allowed: false, action, resource: target, winner: deny, sources };
	}
	if (allow) {
		return { allowed: true, action, resource: target, winner: allow, sources };
	}

	const implicit = (action === "view" || action === "open") && !chainRestricted(chain);
	if (implicit) {
		const winner: Winner = { kind: "public", effect: "allow", spec: 1 };
		return { allowed: true, action, resource: target, winner, sources: [winner as unknown as Source] };
	}
	return { allowed: false, action, resource: target, winner: null, sources };
}

export function can(user: User | null | undefined, action: string, resource: Resource | null | undefined, doc: AclDoc): boolean {
	return decide(user, action, resource, doc).allowed;
}

export function explain(user: User | null | undefined, action: string, resource: Resource | null | undefined, doc: AclDoc): Decision {
	return decide(user, action, resource, doc);
}

export type AccessCard = { res: "card"; id: string; name: string; kind?: string; actions: string[] };
export type AccessCategory = { res: "cat"; id: string; name?: string; restricted: boolean; actions: string[]; cards: AccessCard[] };
export type AccessTab = { res: "tab"; id: string; name?: string; restricted: boolean; actions: string[]; cats: AccessCategory[] };
export type EffectiveAccess = { portal: string[]; tabs: AccessTab[] };

export function effectiveAccess(user: User | null | undefined, doc: AclDoc): EffectiveAccess {
	const portal = PORTAL_ACTIONS.filter((a) => can(user, a, { res: "portal" }, doc));
	const tabs: AccessTab[] = [];
	for (const tab of doc.tabs || []) {
		const tabActs = NODE_ACTIONS.filter((a) => can(user, a, { res: "tab", id: tab.id }, doc));
		if (!tabActs.includes("view")) continue;
		const cats: AccessCategory[] = [];
		for (const cat of tab.categories || []) {
			const catActs = NODE_ACTIONS.filter((a) => can(user, a, { res: "cat", id: cat.id }, doc));
			if (!catActs.includes("view")) continue;
			const cards: AccessCard[] = [];
			for (const app of cat.apps || []) {
				const cardActs = NODE_ACTIONS.filter((a) => can(user, a, { res: "card", id: app.id }, doc));
				if (!cardActs.includes("view")) continue;
				const extra = cardActs.filter((a) => a !== "view" && a !== "open");
				if (extra.length === 0 && !appHasOwnGrant(user, doc, app.id) && catActs.includes("view")) {
					if (cardActs.length <= 2 && !tab.restricted && !cat.restricted) continue;
				}
				cards.push({
					res: "card",
					id: app.id,
					name: app.title || app.id,
					kind: app.kind,
					actions: cardActs
				});
			}
			cats.push({
				res: "cat",
				id: cat.id,
				name: cat.name,
				restricted: Boolean(cat.restricted),
				actions: catActs,
				cards
			});
		}
		tabs.push({
			res: "tab",
			id: tab.id,
			name: tab.name,
			restricted: Boolean(tab.restricted),
			actions: tabActs,
			cats
		});
	}
	return { portal, tabs };
}

function appHasOwnGrant(user: User | null | undefined, doc: AclDoc, appId: string): boolean {
	return collectPacked(user, doc).some((p) => p.grant.res === "card" && p.grant.id === appId);
}

export function syntheticUserFromGroup(group: Group): User {
	return {
		id: group.id,
		username: group.name,
		roleIds: roleIdsOf(group),
		groupIds: [],
		grants: asGrants(group.grants)
	};
}

export function absorbResourceAcl(doc: AclDoc): boolean {
	let moved = false;
	for (const tab of doc.tabs || []) {
		const editors = asIdList(tab.editors);
		const viewers = asIdList(tab.viewers);
		if (editors.length || viewers.length) moved = true;
		for (const id of editors) addGrantToPrincipal(doc, id, { res: "tab", id: tab.id, allow: ["view", "open", "edit", "move"] });
		for (const id of viewers) {
			if (editors.includes(id)) continue;
			addGrantToPrincipal(doc, id, { res: "tab", id: tab.id, allow: ["view", "open"] });
		}
		tab.editors = [];
		tab.viewers = [];
		for (const cat of tab.categories || []) {
			const cEditors = asIdList(cat.editors);
			const cViewers = asIdList(cat.viewers);
			if (cEditors.length || cViewers.length) moved = true;
			for (const id of cEditors) addGrantToPrincipal(doc, id, { res: "cat", id: cat.id, allow: ["view", "open", "edit", "move"] });
			for (const id of cViewers) {
				if (cEditors.includes(id)) continue;
				addGrantToPrincipal(doc, id, { res: "cat", id: cat.id, allow: ["view", "open"] });
			}
			cat.editors = [];
			cat.viewers = [];
		}
	}
	return moved;
}

function addGrantToPrincipal(doc: AclDoc, principalId: string, grant: GrantInput) {
	const user = (doc.users || []).find((u) => u.id === principalId);
	if (user) {
		user.grants = mergeGrant(asGrants(user.grants), grant);
		return;
	}
	const group = (doc.groups || []).find((g) => g.id === principalId);
	if (group) group.grants = mergeGrant(asGrants(group.grants), grant);
}

export type RoleSummary = { grantCount: number; userCount: number; groupCount: number };

export function roleSummary(role: Role | null | undefined, doc: AclDoc): RoleSummary {
	const grants = asGrants(role?.grants);
	let n = 0;
	for (const g of grants) n += (g.allow?.length || 0) + (g.deny?.length || 0);
	if (grants.some((g) => actionHits(g.allow || [], "*"))) n = 99;
	const users = (doc.users || []).filter((u) => roleIdsOf(u).includes(role?.id || "")).length;
	const groups = (doc.groups || []).filter((g) => roleIdsOf(g).includes(role?.id || "")).length;
	return { grantCount: n, userCount: users, groupCount: groups };
}

export function setRoleHolders(doc: AclDoc, roleId: string, userIds: unknown, groupIds: unknown) {
	const users = new Set(asIdList(userIds));
	const groups = new Set(asIdList(groupIds));
	for (const u of doc.users || []) {
		if (u.id === "admin" || isOwnerUser(u)) continue;
		let ids = roleIdsOf(u).filter((id) => id !== "owner");
		const has = ids.includes(roleId);
		const want = users.has(u.id);
		if (want && !has) ids.push(roleId);
		if (!want && has) ids = ids.filter((id) => id !== roleId);
		if (!ids.length) ids = ["lecteur"];
		u.roleIds = ids;
		u.role = ids[0];
	}
	for (const g of doc.groups || []) {
		let ids = roleIdsOf(g);
		const has = ids.includes(roleId);
		const want = groups.has(g.id);
		if (want && !has) ids.push(roleId);
		if (!want && has) ids = ids.filter((id) => id !== roleId);
		if (!ids.length) ids = ["lecteur"];
		g.roleIds = ids;
		g.role = ids[0];
	}
}

export function stripRole(doc: AclDoc, roleId: string) {
	setRoleHolders(doc, roleId, [], []);
}

export function findCategory(doc: AclDoc, catId: string): { tab: Tab; cat: Category } | null {
	for (const tab of doc.tabs || []) {
		const cat = (tab.categories || []).find((c) => c.id === catId);
		if (cat) return { tab, cat };
	}
	return null;
}

export function moveCategoryInDoc(
	doc: AclDoc,
	catId: string,
	destTabId: string,
	insertAt?: unknown,
): { fromTab: Tab; dest: Tab; cat: Category } | null {
	const found = findCategory(doc, catId);
	const dest = (doc.tabs || []).find((t) => t.id === destTabId);
	if (!found || !dest) return null;
	if (found.tab.id === dest.id && insertAt == null) return null;
	const fromTab = found.tab;
	const cat = found.cat;
	fromTab.categories = (fromTab.categories || []).filter((c) => c.id !== catId);
	fromTab.categories.forEach((c, i) => {
		c.sortOrder = i + 1;
	});
	const destCategories = dest.categories || [];
	const at = insertAt == null ? destCategories.length : Math.max(0, Math.min(Number(insertAt) || 0, destCategories.length));
	dest.categories = destCategories.filter((c) => c.id !== catId);
	dest.categories.splice(at, 0, cat);
	dest.categories.forEach((c, i) => {
		c.sortOrder = i + 1;
	});
	return { fromTab, dest, cat };
}

function roleHolderCounts(doc: AclDoc, roleId: string): { users: number; groups: number; people: number } {
	const users = (doc.users || []).filter((u) => roleIdsOf(u).includes(roleId) && u.id !== "admin").length;
	const groups = (doc.groups || []).filter((g) => roleIdsOf(g).includes(roleId));
	let viaGroups = 0;
	for (const g of groups) viaGroups += (g.members || []).length;
	return { users, groups: groups.length, people: users + viaGroups };
}

type ImpactRow = { id: string; name?: string; users: number; groups: number; people: number; lost: string[]; gained: string[] };
export type CategoryMoveImpact = {
	categoryId: string;
	categoryName?: string;
	fromId: string;
	fromName?: string;
	toId: string;
	toName?: string;
	lost: ImpactRow[];
	gained: ImpactRow[];
	roleCount: number;
	userCount: number;
	changed: boolean;
};

export function categoryMoveImpact(doc: AclDoc, catId: string, destTabId: string): CategoryMoveImpact | null {
	const found = findCategory(doc, catId);
	const dest = (doc.tabs || []).find((t) => t.id === destTabId);
	if (!found || !dest) return null;
	const after: AclDoc = {
		users: doc.users || [],
		groups: doc.groups || [],
		roles: doc.roles || [],
		tabs: (doc.tabs || []).map((t) => ({
			...t,
			categories: [...(t.categories || [])]
		}))
	};
	moveCategoryInDoc(after, catId, destTabId);
	const watch = ["view", "open", "edit", "create", "delete", "move"];
	const lost: ImpactRow[] = [];
	const gained: ImpactRow[] = [];
	for (const role of doc.roles || []) {
		if (role.id === "owner") continue;
		const probe: User = { id: "_p", roleIds: [role.id], grants: [] };
		const beforeActs = watch.filter((a) => can(probe, a, { res: "cat", id: catId }, doc));
		const afterActs = watch.filter((a) => can(probe, a, { res: "cat", id: catId }, after));
		if (beforeActs.join() === afterActs.join()) continue;
		const counts = roleHolderCounts(doc, role.id);
		const row: ImpactRow = {
			id: role.id,
			name: role.name,
			users: counts.users,
			groups: counts.groups,
			people: counts.people,
			lost: beforeActs.filter((a) => !afterActs.includes(a)),
			gained: afterActs.filter((a) => !beforeActs.includes(a))
		};
		if (row.lost.length) lost.push(row);
		if (row.gained.length) gained.push(row);
	}
	const people = new Set<string>();
	for (const row of [...lost, ...gained]) {
		for (const u of doc.users || []) if (roleIdsOf(u).includes(row.id) && u.id !== "admin") people.add(u.id);
		for (const g of doc.groups || []) if (roleIdsOf(g).includes(row.id)) for (const id of g.members || []) people.add(id);
	}
	return {
		categoryId: catId,
		categoryName: found.cat.name,
		fromId: found.tab.id,
		fromName: found.tab.name,
		toId: dest.id,
		toName: dest.name,
		lost,
		gained,
		roleCount: new Set([...lost, ...gained].map((r) => r.id)).size,
		userCount: people.size,
		changed: lost.length + gained.length > 0
	};
}
