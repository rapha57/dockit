import { cronMatches, cronMinuteKey } from "./curation-cron";
import { isOwnerUser } from "./acl";

let started = false;
let lastMinute = "";

export function scheduleTick(spec: string, at: Date, prevMinute: string): { fire: boolean; minute: string } {
	const s = String(spec || "").trim();
	if (!s || !cronMatches(s, at)) return { fire: false, minute: prevMinute };
	const key = cronMinuteKey(at);
	if (key === prevMinute) return { fire: false, minute: prevMinute };
	return { fire: true, minute: key };
}

export function ensureCurationSchedule() {
	if (started) return;
	started = true;
	setInterval(() => {
		void tick();
	}, 30_000);
	void tick();
}

async function tick() {
	const { readDoc } = await import("./portal/core");
	const doc = await readDoc();
	const spec = String(process.env.PORTAL_CURATION_CRON || doc.settings.curationCron || "").trim();
	const now = new Date();
	const next = scheduleTick(spec, now, lastMinute);
	if (!next.fire) return;
	lastMinute = next.minute;
	const { launchCurationScan } = await import("./portal/fns-data");
	const owner = doc.users.find((u) => isOwnerUser(u)) ?? null;
	await launchCurationScan(doc, owner);
}
