import { defineEventHandler, setResponseHeader } from "h3";
import { clearSessCookieHeader } from "../../../../src/lib/session-cookie";

export default defineEventHandler((event) => {
	setResponseHeader(event, "Set-Cookie", clearSessCookieHeader());
	return { ok: true };
});
