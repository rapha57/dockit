import { createError, defineEventHandler, getRouterParam, setResponseHeader } from "h3";
import { readAssetFile } from "../../../../src/lib/assets";

export default defineEventHandler(async (event) => {
	const name = getRouterParam(event, "name") || "";
	const file = await readAssetFile(name);
	if (!file) throw createError({ statusCode: 404, statusMessage: "Not found" });
	setResponseHeader(event, "Content-Type", file.mime);
	setResponseHeader(event, "Cache-Control", "public, max-age=86400, immutable");
	setResponseHeader(event, "X-Content-Type-Options", "nosniff");
	return file.bytes;
});
