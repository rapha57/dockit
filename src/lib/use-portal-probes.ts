import { useEffect, useMemo, useRef, useState } from "react";
import { probeTargets } from "@/lib/portal";
import type { ProbeResult } from "@/lib/probe";
import type { PortalData } from "@/lib/portal-ui";

export function usePortalProbes(data: PortalData, token: string) {
	const [health, setHealth] = useState<Record<string, ProbeResult>>({});
	const healthBusy = useRef(false);
	const probeList = useMemo(() => {
		if (data.settings.healthChecks === false) return [];
		const out: { id: string; mode: string; url?: string; host?: string }[] = [];
		for (const space of data.catalog ?? [])
			for (const cat of space.categories)
				for (const app of cat.cards) {
					if ((app.kind || "app") !== "app" || app.check === "off" || !app.check) continue;
					if (app.check === "http")
						out.push({
							id: app.id,
							mode: "http",
							url: app.url,
						});
					else if (app.check === "icmp")
						out.push({
							id: app.id,
							mode: "icmp",
							host: app.checkHost,
						});
				}
		return out;
	}, [data.catalog, data.settings.healthChecks]);
	const probeKey = probeList.map((t) => `${t.id}:${t.mode}:${t.url ?? ""}:${t.host ?? ""}`).join("|");
	useEffect(() => {
		if (!probeList.length) {
			setHealth({});
			return;
		}
		let cancelled = false;
		async function run() {
			if (healthBusy.current) return;
			healthBusy.current = true;
			try {
				const chunkSize = 4;
				for (let i = 0; i < probeList.length; i += chunkSize) {
					if (cancelled) return;
					const chunk = probeList.slice(i, i + chunkSize);
					try {
						const rows = await probeTargets({
							data: {
								token: token || undefined,
								ids: chunk.map((t) => t.id),
							},
						});
						if (cancelled) return;
						setHealth((cur) => {
							const next = { ...cur };
							for (const row of rows) next[row.id] = row;
							return next;
						});
					} catch {
						// ignore
					}
				}
			} finally {
				healthBusy.current = false;
			}
		}
		let idleId = 0;
		const kick = () => {
			if (cancelled) return;
			run();
		};
		if (typeof requestIdleCallback === "function")
			idleId = requestIdleCallback(kick, { timeout: 800 });
		else idleId = window.setTimeout(kick, 280);
		const timer = window.setInterval(() => {
			if (document.hidden) return;
			run();
		}, 6e4);
		return () => {
			cancelled = true;
			if (typeof cancelIdleCallback === "function") cancelIdleCallback(idleId);
			window.clearTimeout(idleId);
			window.clearInterval(timer);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps -- probe run keyed on probeKey, not the array identity
	}, [probeKey, token]);
	return { health, setHealth };
}
