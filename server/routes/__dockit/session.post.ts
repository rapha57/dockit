import { createError, defineEventHandler, getRequestURL, readBody, setResponseHeader } from "h3";
import { acceptSessionToken } from "../../../src/lib/portal/session-mem";
import { sessCookieHeader } from "../../../src/lib/session-cookie";

export default defineEventHandler(async (event) => {
	const body = await readBody(event);
	const token = acceptSessionToken(body?.token);
	if (!token) {
		throw createError({ statusCode: 401, statusMessage: "Jeton invalide" });
	}
	const secure = getRequestURL(event).protocol === "https:";
	setResponseHeader(event, "Set-Cookie", sessCookieHeader(token, secure));
	return { ok: true };
});
