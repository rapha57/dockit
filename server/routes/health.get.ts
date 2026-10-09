import { defineEventHandler, setResponseHeader, setResponseStatus } from "h3";
import { healthPayload } from "../../src/lib/health-check";

export default defineEventHandler(async (event) => {
	const body = await healthPayload();
	setResponseHeader(event, "Cache-Control", "no-store");
	setResponseHeader(event, "Content-Type", "application/json");
	if (!body.ok) setResponseStatus(event, 503);
	return body;
});
