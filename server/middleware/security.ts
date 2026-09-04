import { defineEventHandler, setResponseHeader } from "h3";
import { SECURITY_HEADERS } from "../../src/lib/security-headers";

export default defineEventHandler((event) => {
	for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
		setResponseHeader(event, key, value);
	}
});
