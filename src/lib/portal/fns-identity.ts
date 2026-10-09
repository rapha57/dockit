import { PASSWORD_MAX } from "../security";
import { appendHistory } from "../history";
import { asGrants, isOwnerUser, isSystemRole, roleIdsOf, setRoleHolders, stripRole } from "../acl";
import { attachDocRev } from "../doc-rev";
import { createServerFn } from "@tanstack/react-start";
import { newId } from "../id";
import { z } from "zod";
import { Doc, adminMustChangePassword, asIdList, directoryPayload, ensureGroups, ensureRoles, ensureUsers, hashPassword, hydrateUser, mutate, readDocUnlocked, requireAccountManager, requireStrongPassword, stripUserAccess, syncGroupMembers, syncUserGroups, tok, tokenField, view, withLock } from "./core";

const grantField = z.object({
	res: z.enum(["portal", "space", "cat", "card"]),
	id: z.string().min(1).max(80),
	allow: z.array(z.string()).optional(),
	deny: z.array(z.string()).optional(),
	scope: z.enum(["public"]).optional()
});
function cleanRoleIds(doc: Doc, ids: unknown, { allowOwner = false, allowEmpty = false } = {}) {
	const allowed = new Set((doc.roles || []).map((r) => r.id));
	const out: string[] = [];
	for (const id of asIdList(ids)) {
		if (!allowed.has(id)) continue;
		if (id === "owner" && !allowOwner) continue;
		if (!out.includes(id)) out.push(id);
	}
	if (out.length) return out;
	return allowEmpty ? [] : ["lecteur"];
}
export const listUsers = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({ token: tokenField })).handler(async ({ data, request }) => withLock(async () => {
	const doc = await readDocUnlocked();
	const actor = requireAccountManager(doc, tok(data, request), { allowWeakAdmin: true });
	return directoryPayload(doc, actor);
}));
export const previewAsUser = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
	token: tokenField,
	userId: z.string().min(1).max(80)
})).handler(async ({ data, request }) => withLock(async () => {
	const doc = await readDocUnlocked();
	const actor = requireAccountManager(doc, tok(data, request));
	if (!isOwnerUser(actor) && !actor.canManageUsers) throw new Error("errors.insufficient");
	const target = doc.users.find((u) => u.id === data.userId);
	if (!target) throw new Error("errors.userNotFound");
	const user = hydrateUser(target, doc);
	if (!user) throw new Error("errors.userNotFound");
	const portal = view(doc, undefined, user);
	return {
		asUser: {
			id: target.id,
			username: String(target.username || ""),
			role: portal.session?.role || target.role,
			disabled: Boolean(target.disabled)
		},
		spaces: portal.spaces,
		catalog: portal.catalog
	};
}));
export const saveUser = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
	token: tokenField,
	id: z.string().optional(),
	username: z.string().min(1).max(40),
	password: z.string().max(PASSWORD_MAX).optional(),
	role: z.string().min(1).max(80).optional(),
	roleIds: z.array(z.string()).optional(),
	grants: z.array(grantField).optional(),
	disabled: z.boolean().optional(),
	groupIds: z.array(z.string()).optional()
})).handler(async ({ data, request }) => mutate(data, request, async (doc) => {
	const actor = requireAccountManager(doc, tok(data, request), { allowWeakAdmin: true });
	if (!isOwnerUser(actor) && !actor.canManageUsers) throw new Error("errors.insufficient");
	if (adminMustChangePassword(doc) && (data.id !== "admin" || !data.password)) {
		throw new Error("errors.mustChangePassword");
	}
	ensureRoles(doc);
	const username = data.username.trim().toLowerCase();
	if (data.id === "admin" || isOwnerUser({ id: data.id || "", roleIds: data.roleIds })) {
		if (!isOwnerUser(actor)) throw new Error("errors.adminOnly");
		const admin = ensureUsers(doc).find((u) => u.id === "admin");
		if (!admin) throw new Error("errors.adminNotFound");
		if (data.password) {
			requireStrongPassword(data.password);
			admin.passHash = await hashPassword(data.password);
			appendHistory(doc, actor, {
				type: "user.update",
				label: admin.username
			});
		}
		return directoryPayload(doc, actor);
	}
	const existing = data.id ? doc.users.find((u) => u.id === data.id) : void 0;
	if (existing && isOwnerUser(existing)) throw new Error("errors.adminPasswordOnly");
	const remote = Boolean(existing && (existing.source === "ad" || existing.source === "oidc"));
	// Directory-provisioned accounts keep their login role: rights come from the
	// group mapping resolved at sign-in.
	const roleIds = remote ? roleIdsOf(existing) : cleanRoleIds(doc, data.roleIds?.length ? data.roleIds : data.role ? [data.role] : existing ? roleIdsOf(existing) : ["lecteur"]);
	let target = existing;
	if (existing) {
		existing.username = username;
		existing.roleIds = roleIds;
		existing.role = roleIds[0];
		if (data.grants) existing.grants = asGrants(data.grants);
		if (data.disabled !== undefined) existing.disabled = Boolean(data.disabled);
		if (data.password) {
			requireStrongPassword(data.password);
			existing.passHash = await hashPassword(data.password);
		}
	} else {
		requireStrongPassword(data.password || "");
		if (doc.users.some((u) => u.username === username)) throw new Error("errors.usernameTaken");
		target = {
			id: newId(),
			username,
			passHash: await hashPassword(data.password || ""),
			role: roleIds[0],
			roleIds,
			grants: asGrants(data.grants),
			disabled: Boolean(data.disabled),
			groupIds: []
		};
		doc.users.push(target);
	}
	if (data.groupIds && !remote) syncUserGroups(doc, target!.id, data.groupIds);
	appendHistory(doc, actor, {
		type: existing ? "user.update" : "user.create",
		label: username
	});
	return directoryPayload(doc, actor);
}, { allowWeakAdmin: true }));
export const deleteUser = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
	token: tokenField,
	id: z.string().min(1)
})).handler(async ({ data, request }) => mutate(data, request, (doc) => {
	const actor = requireAccountManager(doc, tok(data, request));
	const target = doc.users.find((u) => u.id === data.id);
	if (!target) throw new Error("errors.userNotFound");
	if (target.id === "admin") throw new Error("errors.cannotDeleteAdmin");
	if (!isOwnerUser(actor) && (isOwnerUser(target) || roleIdsOf(target).includes("admin") || target.role === "admin")) throw new Error("errors.cannotDeleteAdmin");
	stripUserAccess(doc, target.id);
	syncUserGroups(doc, target.id, []);
	doc.users = doc.users.filter((u) => u.id !== data.id);
	appendHistory(doc, actor, {
		type: "user.delete",
		label: target.username
	});
	return directoryPayload(doc, actor);
}));
export const saveGroup = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
	token: tokenField,
	id: z.string().optional(),
	name: z.string().min(1).max(60),
	role: z.string().min(1).max(80).optional(),
	roleIds: z.array(z.string()).optional(),
	members: z.array(z.string()).optional(),
	grants: z.array(grantField).optional()
})).handler(async ({ data, request }) => mutate(data, request, (doc) => {
	const actor = requireAccountManager(doc, tok(data, request));
	if (!isOwnerUser(actor) && !actor.canManageGroups) throw new Error("errors.insufficient");
	ensureGroups(doc);
	ensureRoles(doc);
	let target = data.id ? doc.groups.find((g) => g.id === data.id) : void 0;
	if (data.id && !target) throw new Error("errors.userNotFound");
	const roleIds = cleanRoleIds(doc, data.roleIds?.length ? data.roleIds : data.role ? [data.role] : target?.source === "ad" || target?.source === "oidc" ? [] : ["lecteur"], { allowEmpty: target?.source === "ad" || target?.source === "oidc" });
	const name = data.name.trim().slice(0, 60);
	if (!name) throw new Error("errors.nameRequired");
	if (target?.source === "ad" || target?.source === "oidc") {
		target.roleIds = roleIds;
		target.role = roleIds[0] || "";
		if (data.grants) target.grants = asGrants(data.grants);
	} else if (target) {
		if (doc.groups.some((g) => g.id !== target!.id && (g.name || "").toLowerCase() === name.toLowerCase())) throw new Error("errors.usernameTaken");
		target.name = name;
		target.roleIds = roleIds;
		target.role = roleIds[0];
		if (data.grants) target.grants = asGrants(data.grants);
	} else {
		if (doc.groups.some((g) => (g.name || "").toLowerCase() === name.toLowerCase())) throw new Error("errors.usernameTaken");
		target = {
			id: newId(),
			name,
			members: [],
			role: roleIds[0],
			roleIds,
			grants: asGrants(data.grants),
			source: "local",
			externalId: ""
		};
		doc.groups.push(target);
	}
	if (target.source !== "ad" && target.source !== "oidc") syncGroupMembers(doc, target.id, data.members ?? target.members);
	appendHistory(doc, actor, {
		type: data.id ? "group.update" : "group.create",
		label: target.name
	});
	return directoryPayload(doc, actor);
}));
export const deleteGroup = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
	token: tokenField,
	id: z.string().min(1)
})).handler(async ({ data, request }) => mutate(data, request, (doc) => {
	const actor = requireAccountManager(doc, tok(data, request));
	ensureGroups(doc);
	const target = doc.groups.find((g) => g.id === data.id);
	if (!target) throw new Error("errors.userNotFound");
	syncGroupMembers(doc, target.id, []);
	stripUserAccess(doc, target.id);
	doc.groups = doc.groups.filter((g) => g.id !== data.id);
	appendHistory(doc, actor, {
		type: "group.delete",
		label: target.name
	});
	return directoryPayload(doc, actor);
}));
export const saveRole = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
	token: tokenField,
	id: z.string().optional(),
	name: z.string().min(1).max(40),
	description: z.string().max(200).optional(),
	grants: z.array(grantField).optional(),
	userIds: z.array(z.string()).optional(),
	groupIds: z.array(z.string()).optional()
})).handler(async ({ data, request }) => mutate(data, request, (doc) => {
	const actor = requireAccountManager(doc, tok(data, request));
	if (!isOwnerUser(actor) && !actor.canManageRoles) throw new Error("errors.insufficient");
	ensureRoles(doc);
	const name = data.name.trim().slice(0, 40);
	if (!name) throw new Error("errors.nameRequired");
	let target = data.id ? doc.roles.find((r) => r.id === data.id) : void 0;
	if (data.id && !target) throw new Error("errors.userNotFound");
	if (target && (target.system || isSystemRole(target.id))) {
		if (target.id === "owner") return directoryPayload(doc, actor);
		if (data.userIds || data.groupIds) setRoleHolders(doc, target.id, data.userIds || [], data.groupIds || []);
		appendHistory(doc, actor, {
			type: "role.update",
			label: target.name
		});
		return directoryPayload(doc, actor);
	}
	const description = String(data.description || "").trim().slice(0, 200);
	const grants = asGrants(data.grants);
	if (target) {
		if (doc.roles.some((r) => r.id !== target!.id && (r.name || "").toLowerCase() === name.toLowerCase())) throw new Error("errors.usernameTaken");
		target.name = name;
		target.description = description;
		target.grants = grants;
	} else {
		if (doc.roles.length >= 40) throw new Error("errors.tooManyIcons");
		if (doc.roles.some((r) => (r.name || "").toLowerCase() === name.toLowerCase())) throw new Error("errors.usernameTaken");
		target = {
			id: newId(),
			name,
			description,
			system: false,
			grants
		};
		doc.roles.push(target);
	}
	if (target.id !== "owner" && (data.userIds || data.groupIds)) setRoleHolders(doc, target.id, data.userIds || [], data.groupIds || []);
	appendHistory(doc, actor, {
		type: data.id ? "role.update" : "role.create",
		label: target.name
	});
	return directoryPayload(doc, actor);
}));
export const deleteRole = createServerFn({ method: "POST" }).middleware([attachDocRev]).validator(z.object({
	token: tokenField,
	id: z.string().min(1)
})).handler(async ({ data, request }) => mutate(data, request, (doc) => {
	const actor = requireAccountManager(doc, tok(data, request));
	if (!isOwnerUser(actor) && !actor.canManageRoles) throw new Error("errors.insufficient");
	ensureRoles(doc);
	const target = doc.roles.find((r) => r.id === data.id);
	if (!target) throw new Error("errors.userNotFound");
	if (target.system || isSystemRole(target.id)) throw new Error("errors.insufficient");
	stripRole(doc, target.id);
	doc.roles = doc.roles.filter((r) => r.id !== data.id);
	appendHistory(doc, actor, {
		type: "role.delete",
		label: target.name
	});
	return directoryPayload(doc, actor);
}));
