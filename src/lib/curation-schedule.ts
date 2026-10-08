import { cronMatches, cronMinuteKey } from "./curation-cron";
import { isOwnerUser } from "./acl";

let started = false;
let lastMinute = "";

export function ensureCurationSchedule() {
	if (started) return;
	const spec = String(process.env.PORTAL_CURATION_CRON || "").trim();
	if (!spec) return;
	started = true;
	setInterval(() => {
		void tick(spec);
	}, 30_000);
	void tick(spec);
}

async function tick(spec: string) {
	const now = new Date();
	if (!cronMatches(spec, now)) return;
	const key = cronMinuteKey(now);
	if (key === lastMinute) return;
	lastMinute = key;
	const { readDoc } = await import("./portal/core");
	const { launchCurationScan } = await import("./portal/fns-data");
	const doc = await readDoc();
	const owner = doc.users.find((u) => isOwnerUser(u)) ?? null;
	await launchCurationScan(doc, owner);
}
