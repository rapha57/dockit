const TIMEOUT_MS = 8000;
export const LDAP_FILTER_DEFAULT = "(&(objectClass=user)(sAMAccountName={username}))";
export const LDAP_MAX = 8;
export const LDAP_GROUP_MAX = 20;
const GROUP_OBJECTCLASS = "(|(objectClass=group)(objectClass=groupOfUniqueNames)(objectClass=groupOfNames))";

function asStrings(value) {
	if (value == null || value === "") return [];
	const list = Array.isArray(value) ? value : [value];
	const out = [];
	for (const item of list) {
		if (item == null) continue;
		if (typeof item === "string") {
			if (item) out.push(item);
			continue;
		}
		if (typeof Buffer !== "undefined" && Buffer.isBuffer(item)) {
			const s = item.toString("utf8");
			if (s) out.push(s);
			continue;
		}
		const s = String(item).trim();
		if (s && s !== "[object Object]") out.push(s);
	}
	return out;
}

function attrOf(entry, name) {
	if (!entry || typeof entry !== "object") return [];
	if (name in entry) return asStrings(entry[name]);
	const lower = String(name).toLowerCase();
	for (const [k, v] of Object.entries(entry)) {
		if (k.toLowerCase() === lower) return asStrings(v);
	}
	return [];
}

function entryDn(entry) {
	return String(entry?.dn || entry?.objectName || attrOf(entry, "dn")[0] || "").trim();
}

function entryName(entry) {
	const cn = attrOf(entry, "cn")[0] || attrOf(entry, "sAMAccountName")[0] || attrOf(entry, "name")[0] || "";
	if (cn) return cn.slice(0, 60);
	const dn = entryDn(entry);
	const first = dn.split(",")[0] || "";
	return first.replace(/^[^=]+=/i, "").slice(0, 60);
}

export function normDn(dn) {
	return String(dn || "").trim().replace(/\s*,\s*/g, ",").replace(/\s+/g, " ").toLowerCase();
}

export function adGroupKey(dirId, dn) {
	return `${String(dirId || "").slice(0, 80)}:${normDn(dn)}`.slice(0, 400);
}

export function asDirectory(row) {
	if (!row || typeof row !== "object") return null;
	const tls = row.tls !== false && row.ldapTls !== false;
	const id = String(row.id || "").trim().slice(0, 80) || crypto.randomUUID();
	return {
		id,
		enabled: Boolean(row.enabled ?? row.ldapEnabled),
		host: String(row.host || row.ldapHost || "").trim().slice(0, 253),
		port: Math.max(1, Math.min(65535, Number(row.port || row.ldapPort) || 0)) || (tls ? 636 : 389),
		tls,
		tlsVerify: row.tlsVerify !== false && row.ldapTlsVerify !== false,
		bindDn: String(row.bindDn || row.ldapBindDn || "").trim().slice(0, 300),
		bindPassword: String(row.bindPassword || row.ldapBindPassword || "").slice(0, 200),
		baseDn: String(row.baseDn || row.ldapBaseDn || "").trim().slice(0, 300),
		userFilter: String(row.userFilter || row.ldapUserFilter || "").trim().slice(0, 300),
		domain: String(row.domain || row.ldapDomain || "").trim().slice(0, 60),
		autoCreate: Boolean(row.autoCreate ?? row.ldapAutoCreate)
	};
}

export function asDirectories(s) {
	const raw = s?.ldapDirectories;
	if (Array.isArray(raw) && raw.length) {
		const out = [];
		const seen = new Set();
		for (const row of raw.slice(0, LDAP_MAX)) {
			const d = asDirectory(row);
			if (!d || seen.has(d.id)) continue;
			seen.add(d.id);
			out.push(d);
		}
		return out;
	}
	if (s && (s.ldapEnabled || s.ldapHost || s.ldapDomain)) {
		const d = asDirectory({
			id: "ad",
			enabled: s.ldapEnabled,
			host: s.ldapHost,
			port: s.ldapPort,
			tls: s.ldapTls,
			tlsVerify: s.ldapTlsVerify,
			bindDn: s.ldapBindDn,
			bindPassword: s.ldapBindPassword,
			baseDn: s.ldapBaseDn,
			userFilter: s.ldapUserFilter,
			domain: s.ldapDomain,
			autoCreate: s.ldapAutoCreate
		});
		return d ? [d] : [];
	}
	return [];
}

export function directoryReady(d) {
	return Boolean(d?.enabled) && Boolean(String(d.host || "").trim()) && Boolean(String(d.domain || "").trim());
}

export function syncLegacyLdap(dirs) {
	const d = dirs[0];
	if (!d) {
		return {
			ldapEnabled: false,
			ldapHost: "",
			ldapPort: 636,
			ldapTls: true,
			ldapTlsVerify: true,
			ldapBindDn: "",
			ldapBindPassword: "",
			ldapBaseDn: "",
			ldapUserFilter: "",
			ldapDomain: "",
			ldapAutoCreate: false
		};
	}
	return {
		ldapEnabled: d.enabled,
		ldapHost: d.host,
		ldapPort: d.port,
		ldapTls: d.tls,
		ldapTlsVerify: d.tlsVerify,
		ldapBindDn: d.bindDn,
		ldapBindPassword: d.bindPassword,
		ldapBaseDn: d.baseDn,
		ldapUserFilter: d.userFilter,
		ldapDomain: d.domain,
		ldapAutoCreate: d.autoCreate
	};
}

export function asLoginOrder(raw, dirs) {
	const list = Array.isArray(dirs) ? dirs : [];
	const known = new Set(["local", ...list.map((d) => d.id)]);
	const seen = new Set();
	const out = [];
	const push = (id) => {
		if (!id || seen.has(id) || !known.has(id)) return;
		seen.add(id);
		out.push(id);
	};
	if (Array.isArray(raw)) {
		for (const value of raw) {
			if (value === "local") push("local");
			else if (value === "ad") push(list.find((d) => d.id === "ad")?.id || list[0]?.id);
			else push(String(value || "").trim().slice(0, 80));
		}
	}
	if (!seen.has("local")) out.unshift("local");
	for (const d of list) push(d.id);
	return out;
}

export function pickDirectory(s, id) {
	const dirs = asDirectories(s);
	if (id && id !== "ad" && id !== "local") return dirs.find((d) => d.id === id) || null;
	return dirs.find(directoryReady) || dirs[0] || null;
}

export function ldapLoginName(raw) {
	let u = String(raw || "").trim();
	if (u.includes("\\")) u = u.slice(u.lastIndexOf("\\") + 1);
	if (u.includes("@")) u = u.slice(0, u.indexOf("@"));
	return u.toLowerCase().slice(0, 40);
}

function escapeFilter(value) {
	return String(value || "").replace(/[\0*\\\(\)]/g, (ch) => {
		const hex = ch.charCodeAt(0).toString(16).padStart(2, "0");
		return `\\${hex}`;
	});
}

function ldapUrl(d) {
	const host = String(d.host || d.ldapHost || "").trim();
	if (!host) throw new Error("errors.ldapHost");
	if (/[\s/]/.test(host) || host.includes(":")) throw new Error("errors.ldapHost");
	const tls = d.tls !== false && d.ldapTls !== false;
	const port = Math.max(1, Math.min(65535, Number(d.port || d.ldapPort) || (tls ? 636 : 389)));
	return {
		url: `${tls ? "ldaps" : "ldap"}://${host}:${port}`,
		tlsOptions: tls ? { rejectUnauthorized: d.tlsVerify !== false && d.ldapTlsVerify !== false } : undefined
	};
}

async function withClient(d, fn) {
	const { Client } = await import("ldapts");
	const { url, tlsOptions } = ldapUrl(d);
	const client = new Client({
		url,
		timeout: TIMEOUT_MS,
		connectTimeout: TIMEOUT_MS,
		tlsOptions
	});
	try {
		return await fn(client);
	} finally {
		try {
			await client.unbind();
		} catch {
			// ignore
		}
	}
}

function bindIdentity(d, sam) {
	const domain = String(d.domain || d.ldapDomain || "").trim();
	if (domain.includes(".")) return `${sam}@${domain}`;
	if (domain) return `${domain}\\${sam}`;
	return sam;
}

async function searchUserEntry(client, dir, sam) {
	const base = String(dir.baseDn || "").trim();
	if (!base) return null;
	const filterTpl = String(dir.userFilter || "").trim() || LDAP_FILTER_DEFAULT;
	const filter = filterTpl.replaceAll("{username}", escapeFilter(sam));
	const { searchEntries } = await client.search(base, {
		scope: "sub",
		filter,
		sizeLimit: 2,
		timeLimit: 8,
		attributes: ["dn", "memberOf", "sAMAccountName", "cn"]
	});
	if (searchEntries?.length !== 1) return null;
	return searchEntries[0];
}

export async function ldapAuthenticate(s, username, password) {
	const sam = ldapLoginName(username);
	if (!sam || !password) throw new Error("errors.badLogin");
	const dir = s && Array.isArray(s.ldapDirectories) ? pickDirectory(s, s.id) : asDirectory(s) || pickDirectory(s);
	if (!directoryReady(dir)) throw new Error("errors.ldapOff");
	try {
		const bindDn = String(dir.bindDn || "").trim();
		let memberOf = null;
		if (bindDn) {
			const base = String(dir.baseDn || "").trim();
			if (!base) throw new Error("errors.ldapBaseDn");
			const found = await withClient(dir, async (client) => {
				await client.bind(bindDn, String(dir.bindPassword || ""));
				return searchUserEntry(client, dir, sam);
			});
			const userDn = entryDn(found);
			if (!userDn) throw new Error("errors.badLogin");
			memberOf = attrOf(found, "memberOf");
			await withClient(dir, async (client) => {
				await client.bind(userDn, password);
			});
		} else {
			memberOf = await withClient(dir, async (client) => {
				await client.bind(bindIdentity(dir, sam), password);
				const found = await searchUserEntry(client, dir, sam);
				return found ? attrOf(found, "memberOf") : null;
			});
		}
		return { username: sam, memberOf, directoryId: dir.id };
	} catch (err) {
		const name = err?.name || "";
		const code = err?.code;
		if (err instanceof Error && err.message.startsWith("errors.")) throw err;
		if (name === "InvalidCredentialsError" || name === "NoSuchObjectError" || name === "InappropriateAuthError" || code === 49) throw new Error("errors.badLogin");
		if (name === "UnavailableError" || name === "TimeLimitExceededError" || name === "TimeoutError" || name === "ConnectionError" || code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "ETIMEDOUT" || code === "CERT_HAS_EXPIRED" || code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE") {
			throw new Error("errors.ldapUnreachable");
		}
		throw new Error("errors.ldapFail");
	}
}

export async function ldapSearchGroups(dir, query) {
	const d = asDirectory(dir);
	if (!d || !directoryReady(d)) throw new Error("errors.ldapOff");
	const needle = escapeFilter(String(query || "").trim());
	if (needle.length < 2) return [];
	const bindDn = String(d.bindDn || "").trim();
	const base = String(d.baseDn || "").trim();
	if (!bindDn || !base) throw new Error("errors.ldapBaseDn");
	const filter = `(&${GROUP_OBJECTCLASS}(|(cn=*${needle}*)(sAMAccountName=*${needle}*)))`;
	try {
		return await withClient(d, async (client) => {
			await client.bind(bindDn, String(d.bindPassword || ""));
			const { searchEntries } = await client.search(base, {
				scope: "sub",
				filter,
				sizeLimit: LDAP_GROUP_MAX,
				timeLimit: 8,
				attributes: ["dn", "cn", "sAMAccountName", "name"]
			});
			const out = [];
			const seen = new Set();
			for (const entry of searchEntries || []) {
				const dn = entryDn(entry);
				const name = entryName(entry);
				if (!dn || !name) continue;
				const key = adGroupKey(d.id, dn);
				if (seen.has(key)) continue;
				seen.add(key);
				out.push({ id: key, dn, name, key });
				if (out.length >= LDAP_GROUP_MAX) break;
			}
			return out;
		});
	} catch (err) {
		if (err instanceof Error && err.message.startsWith("errors.")) throw err;
		const name = err?.name || "";
		const code = err?.code;
		if (name === "InvalidCredentialsError" || name === "NoSuchObjectError" || name === "InappropriateAuthError" || code === 49) throw new Error("errors.badLogin");
		if (name === "UnavailableError" || name === "TimeLimitExceededError" || name === "TimeoutError" || name === "ConnectionError" || code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "ETIMEDOUT" || code === "CERT_HAS_EXPIRED" || code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE") {
			throw new Error("errors.ldapUnreachable");
		}
		throw new Error("errors.ldapFail");
	}
}
