import { createError, defineEventHandler, getRequestURL, readBody, setResponseHeader } from "h3";
import { sessCookieHeader } from "../../../../src/lib/session-cookie";

export default defineEventHandler(async (event) => {
	const body = await readBody(event);
	const token = String(body?.token || "");
	if (!/^[a-f0-9]{48}$/i.test(token)) throw createError({ statusCode: 400, statusMessage: "Jeton invalide" });
	const secure = getRequestURL(event).protocol === "https:";
	setResponseHeader(event, "Set-Cookie", sessCookieHeader(token, secure));
	return { ok: true };
});
