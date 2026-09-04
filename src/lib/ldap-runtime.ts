const TIMEOUT_MS = 8000;
export const LDAP_FILTER_DEFAULT = "(&(objectClass=user)(sAMAccountName={username}))";

export function ldapReady(s) {
	return Boolean(s?.ldapEnabled) && Boolean(String(s.ldapHost || "").trim()) && Boolean(String(s.ldapDomain || "").trim());
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

function ldapUrl(s) {
	const host = String(s.ldapHost || "").trim();
	if (!host) throw new Error("errors.ldapHost");
	if (/[\s/]/.test(host) || host.includes(":")) throw new Error("errors.ldapHost");
	const tls = Boolean(s.ldapTls);
	const port = Math.max(1, Math.min(65535, Number(s.ldapPort) || (tls ? 636 : 389)));
	return {
		url: `${tls ? "ldaps" : "ldap"}://${host}:${port}`,
		tlsOptions: tls ? { rejectUnauthorized: s.ldapTlsVerify !== false } : undefined
	};
}

async function withClient(s, fn) {
	const { Client } = await import("ldapts");
	const { url, tlsOptions } = ldapUrl(s);
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
		} catch {}
	}
}

function bindIdentity(s, sam) {
	const domain = String(s.ldapDomain || "").trim();
	if (domain.includes(".")) return `${sam}@${domain}`;
	if (domain) return `${domain}\\${sam}`;
	return sam;
}

export async function ldapAuthenticate(s, username, password) {
	const sam = ldapLoginName(username);
	if (!sam || !password) throw new Error("errors.badLogin");
	if (!ldapReady(s)) throw new Error("errors.ldapOff");
	try {
		const bindDn = String(s.ldapBindDn || "").trim();
		if (bindDn) {
			const base = String(s.ldapBaseDn || "").trim();
			if (!base) throw new Error("errors.ldapBaseDn");
			const filterTpl = String(s.ldapUserFilter || "").trim() || LDAP_FILTER_DEFAULT;
			const filter = filterTpl.replaceAll("{username}", escapeFilter(sam));
			const userDn = await withClient(s, async (client) => {
				await client.bind(bindDn, String(s.ldapBindPassword || ""));
				const { searchEntries } = await client.search(base, {
					scope: "sub",
					filter,
					sizeLimit: 2,
					timeLimit: 8,
					attributes: ["dn"]
				});
				if (searchEntries?.length !== 1) throw new Error("errors.badLogin");
				return String(searchEntries[0].dn || "");
			});
			if (!userDn) throw new Error("errors.badLogin");
			await withClient(s, async (client) => {
				await client.bind(userDn, password);
			});
		} else {
			await withClient(s, async (client) => {
				await client.bind(bindIdentity(s, sam), password);
			});
		}
		return { username: sam };
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
