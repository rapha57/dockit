import { createError, defineEventHandler, getRequestURL, readBody, setResponseHeader } from "h3";
import { sessionAlive } from "../../../../src/lib/portal";
import { sessCookieHeader } from "../../../../src/lib/session-cookie";

export default defineEventHandler(async (event) => {
	const body = await readBody(event);
	const token = String(body?.token || "");
	if (!/^[a-f0-9]{48}$/i.test(token) || !sessionAlive(token)) {
		throw createError({ statusCode: 401, statusMessage: "Jeton invalide" });
	}
	const secure = getRequestURL(event).protocol === "https:";
	setResponseHeader(event, "Set-Cookie", sessCookieHeader(token, secure));
	return { ok: true };
});
