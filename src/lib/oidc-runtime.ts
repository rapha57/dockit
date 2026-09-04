import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { trustProxy } from "./security-runtime";

const TIMEOUT_MS = 8000;
const DISCOVER_TTL = 10 * 60 * 1000;

type Discovery = {
	issuer: string;
	authorization_endpoint: string;
	token_endpoint: string;
	userinfo_endpoint: string;
	jwks_uri: string;
};

const discoveryCache = new Map<string, { at: number; value: Discovery }>();

export function randomUrlToken(bytes = 32) {
	return randomBytes(bytes).toString("base64url");
}

export function s256(verifier: string) {
	return createHash("sha256").update(verifier).digest("base64url");
}

export function normalizeIssuer(raw: string) {
	const text = String(raw || "").trim();
	if (!text) throw new Error("errors.oidcIssuerRequired");
	const u = new URL(text);
	if (u.username || u.password) throw new Error("errors.oidcIssuerInvalid");
	const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
	if (u.protocol !== "https:" && !local) throw new Error("errors.oidcIssuerHttps");
	if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("errors.oidcIssuerInvalid");
	return `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
}

function assertHttpsEndpoint(raw: string, localIssuer: boolean) {
	const u = new URL(raw);
	if (u.username || u.password) throw new Error("errors.oidcEndpointInvalid");
	const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
	if (u.protocol !== "https:" && !(local || localIssuer)) throw new Error("errors.oidcEndpointHttps");
	return u.href;
}

async function fetchJson(url: string, init: RequestInit = {}) {
	const ac = new AbortController();
	const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
	try {
		const res = await fetch(url, { ...init, signal: ac.signal, redirect: "error" });
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		return await res.json();
	} finally {
		clearTimeout(timer);
	}
}

export async function discoverOidc(issuerRaw: string): Promise<Discovery> {
	const issuer = normalizeIssuer(issuerRaw);
	const hit = discoveryCache.get(issuer);
	if (hit && Date.now() - hit.at < DISCOVER_TTL) return hit.value;
	const local = issuer.startsWith("http://localhost") || issuer.startsWith("http://127.0.0.1");
	const json = await fetchJson(`${issuer}/.well-known/openid-configuration`);
	const value: Discovery = {
		issuer: String(json.issuer || issuer),
		authorization_endpoint: assertHttpsEndpoint(String(json.authorization_endpoint || ""), local),
		token_endpoint: assertHttpsEndpoint(String(json.token_endpoint || ""), local),
		userinfo_endpoint: assertHttpsEndpoint(String(json.userinfo_endpoint || ""), local),
		jwks_uri: assertHttpsEndpoint(String(json.jwks_uri || ""), local)
	};
	discoveryCache.set(issuer, { at: Date.now(), value });
	return value;
}

export function buildAuthorizeUrl(disc: Discovery, opts: {
	clientId: string;
	redirectUri: string;
	state: string;
	nonce: string;
	challenge: string;
	scope?: string;
}) {
	const url = new URL(disc.authorization_endpoint);
	url.searchParams.set("response_type", "code");
	url.searchParams.set("client_id", opts.clientId);
	url.searchParams.set("redirect_uri", opts.redirectUri);
	url.searchParams.set("scope", opts.scope || "openid profile email");
	url.searchParams.set("state", opts.state);
	url.searchParams.set("nonce", opts.nonce);
	url.searchParams.set("code_challenge", opts.challenge);
	url.searchParams.set("code_challenge_method", "S256");
	return url.toString();
}

export async function exchangeCode(disc: Discovery, opts: {
	clientId: string;
	clientSecret: string;
	code: string;
	redirectUri: string;
	verifier: string;
}) {
	const body = new URLSearchParams({
		grant_type: "authorization_code",
		code: opts.code,
		redirect_uri: opts.redirectUri,
		client_id: opts.clientId,
		code_verifier: opts.verifier
	});
	const headers: Record<string, string> = {
		Accept: "application/json",
		"Content-Type": "application/x-www-form-urlencoded"
	};
	if (opts.clientSecret) {
		const basic = Buffer.from(`${opts.clientId}:${opts.clientSecret}`).toString("base64");
		headers.Authorization = `Basic ${basic}`;
	}
	const json = await fetchJson(disc.token_endpoint, {
		method: "POST",
		headers,
		body
	});
	const access = String(json.access_token || "");
	const idToken = String(json.id_token || "");
	if (!access) throw new Error("errors.oidcTokenMissing");
	if (!idToken) throw new Error("errors.oidcIdTokenMissing");
	return {
		accessToken: access,
		idToken
	};
}

export async function verifyIdToken(disc: Discovery, idToken: string, opts: {
	clientId: string;
	nonce: string;
}) {
	const JWKS = createRemoteJWKSet(new URL(disc.jwks_uri));
	const { payload } = await jwtVerify(idToken, JWKS, {
		issuer: disc.issuer,
		audience: opts.clientId,
		clockTolerance: 30
	});
	if (String(payload.nonce || "") !== opts.nonce) throw new Error("errors.oidcNonce");
}

export async function fetchUserInfo(disc: Discovery, accessToken: string) {
	const json = await fetchJson(disc.userinfo_endpoint, {
		headers: {
			Accept: "application/json",
			Authorization: `Bearer ${accessToken}`
		}
	});
	return json && typeof json === "object" ? json as Record<string, unknown> : {};
}

export function usernameFromClaims(info: Record<string, unknown>) {
	const email = String(info.email || "");
	const raw = String(info.preferred_username || info.nickname || (email.includes("@") ? email.split("@")[0] : "") || info.sub || "");
	const name = raw.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 40);
	if (!name) throw new Error("errors.oidcNoId");
	return name;
}

export function publicOrigin(request: Request | undefined) {
	const raw = String(process.env.PORTAL_PUBLIC_ORIGIN || "").trim();
	if (raw) {
		const u = new URL(raw);
		if (u.username || u.password) throw new Error("errors.originInvalid");
		if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("errors.originInvalid");
		return u.origin;
	}
	const headers = request?.headers;
	const get = (k: string) => {
		try {
			return typeof headers?.get === "function" ? headers.get(k) : "";
		} catch {
			return "";
		}
	};
	if (trustProxy()) {
		const xfProto = String(get("x-forwarded-proto") || "").split(",")[0].trim();
		const xfHost = String(get("x-forwarded-host") || get("host") || "").split(",")[0].trim();
		if (xfHost) {
			const proto = xfProto || "https";
			return `${proto}://${xfHost}`;
		}
	}
	try {
		if (request?.url) return new URL(request.url).origin;
	} catch {}
	return "";
}
