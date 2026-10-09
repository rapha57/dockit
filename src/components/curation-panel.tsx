import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Check, Clock, LayoutGrid, ListChecks, Minus, Pencil, ScanSearch, Search, Settings2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/empty-state";
import { EdgeFade } from "@/components/edge-fade";
import { Skeleton } from "@/components/ui/skeleton";
import { ModalShell } from "@/components/modal-shell";
import { ExpandRow } from "@/components/expand-row";
import { useColSort, SortLabel } from "@/components/access";
import { CardForm } from "@/components/editors";
import { t, te, td, tp, formatWhen, formatNumber } from "@/lib/i18n";
import { PortalIcon } from "@/lib/icons";
import { sessionGone } from "@/lib/session-gone";
import { noteDocRev } from "@/lib/doc-rev";
import {
  curationStart,
  curationStatus,
  curationStop,
  getCuration,
  testCurationWebhook,
  updateCurationWebhook,
  type CurationCheck,
  type CurationJobView,
  type CurationNotify,
  type CustomIcon,
  type PortalCard,
  type PortalCategory,
} from "@/lib/portal";
import type { CardFormPayload, CatalogSpace, CurationViewData, PortalData } from "@/lib/portal-ui";
import { cronScheduleSpec, parseCronSchedule, type CronSchedule } from "@/lib/curation-cron";

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];
export function curationTone(status: CurationCheck["status"]): string {
  if (status === "valid") return "text-ok";
  if (status === "redirect") return "text-muted";
  if (status === "error" || status === "timeout") return "text-danger";
  return "text-subtle";
}
function curationStatusLabel(check: CurationCheck): string {
  if (check.status === "valid") return check.httpStatus ? String(check.httpStatus) : t("curation.statusValid");
  if (check.status === "redirect") {
    const target = check.finalUrl || "";
    let short = target;
    try {
      const from = new URL(check.url);
      const to = new URL(target);
      short = to.host === from.host ? `${to.pathname}${to.search}` : target;
    } catch {
      // keep full URL
    }
    return check.httpStatus ? `${check.httpStatus} → ${short}` : short;
  }
  if (check.status === "timeout") return t("curation.statusTimeout");
  if (check.status === "error") return check.httpStatus ? String(check.httpStatus) : t("curation.statusError");
  return t("curation.statusUnknown");
}
function curationStatusTitle(check: CurationCheck): string | undefined {
  if (check.status === "redirect") return check.finalUrl || undefined;
  if (check.detail) return td(check.detail);
  return undefined;
}
export function CurationPanel({
  token,
  busy,
  spacePerms,
  picker,
  catalog,
  probes,
  knownTags,
  tagColors,
  editContext,
  onSaveCard,
  onClose,
  onSaved,
  webhook,
  cron,
  cronFromEnv,
  webhookFromEnv,
}: {
  token: string;
  busy: boolean;
  spacePerms: Record<string, "view" | "edit">;
  picker: {
    token: string;
    library: CustomIcon[];
    online: boolean;
    navRichIcons: boolean;
    onLibrary: (icons: CustomIcon[]) => void;
  };
  catalog: CatalogSpace[];
  probes?: boolean;
  knownTags?: { name: string; count: number }[];
  tagColors?: Record<string, string>;
  editContext: (
    cardId: string,
  ) => { app: PortalCard; categoryId: string; categories: PortalCategory[] } | null;
  onSaveCard: (app: PortalCard, payload: CardFormPayload, onDone: () => void) => void;
  onClose: () => void;
  onSaved?: (next: PortalData) => void;
  webhook?: string;
  cron?: string;
  cronFromEnv?: boolean;
  webhookFromEnv?: boolean;
}) {
  const [pane, setPane] = useState<"results" | "apps" | "settings">("results");
  const [view, setView] = useState<CurationViewData | null>(null);
  const [ready, setReady] = useState(false);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [job, setJob] = useState<CurationJobView | null>(null);
  const [edit, setEdit] = useState<{ app: PortalCard; categoryId: string; categories: PortalCategory[] } | null>(
    null,
  );
  const [hook, setHook] = useState(webhook || "");
  const [cronSpec, setCronSpec] = useState(cron || "");
  const [notify, setNotify] = useState<CurationNotify | null>(null);
  const [testBusy, setTestBusy] = useState(false);
  const savedHook = useRef((webhook || "").trim());
  const saveChain = useRef(Promise.resolve());
  const saveGen = useRef(0);
  const seenFinishRef = useRef(0);
  const logEndRef = useRef<HTMLDivElement>(null);
  const reloadRef = useRef<() => void>(() => {});
  useEffect(() => {
    let alive = true;
    let timer = 0;
    async function reload() {
      try {
        const res = await getCuration({ data: { token } });
        if (alive) {
          setView(res);
          if (res.lastNotify) setNotify(res.lastNotify);
        }
      } catch {
        // ignore — initial load reports its own errors
      }
    }
    reloadRef.current = reload;
    async function tick() {
      try {
        const res = await curationStatus({ data: { token } });
        if (!alive) return;
        setJob(res);
        // Reload whenever a finishedAt we never saw shows up: the job may have
        // started and ended between two polls (800 ms), so watching the
        // running→stopped edge alone misses fast jobs.
        if (!res.running && res.finishedAt > 0 && seenFinishRef.current !== res.finishedAt) {
          seenFinishRef.current = res.finishedAt;
          void reload();
        }
      } catch (err) {
        if (!alive || sessionGone(err)) return;
      }
      if (alive) timer = window.setTimeout(() => void tick(), 800);
    }
    getCuration({ data: { token } })
      .then((res) => {
        if (!alive) return;
        setView(res);
        if (res.lastNotify) setNotify(res.lastNotify);
        setReady(true);
      })
      .catch((err) => {
        if (!alive) return;
        setReady(true);
        if (sessionGone(err)) return;
        toast.error(te(err));
      });
    void tick();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [token]);
  const lastLogLine = job?.log.length ? job.log[job.log.length - 1] : "";
  useEffect(() => {
    const el = logEndRef.current?.parentElement;
    if (el) el.scrollTop = el.scrollHeight;
  }, [job?.log.length, lastLogLine]);
  function checksOf(cardId: string): Record<string, CurationCheck> | undefined {
    const base = view?.checks?.[cardId];
    return base ? { ...base } : undefined;
  }
  const counts = useMemo(() => {
    let valid = 0;
    let redirect = 0;
    let error = 0;
    let timeout = 0;
    let pending = 0;
    for (const ref of view?.queue || []) {
      const raw = checksOf(ref.cardId)?.[ref.key];
      const check = raw && raw.url === ref.url ? raw : undefined;
      if (!check) {
        pending++;
        continue;
      }
      if (check.status === "valid") valid++;
      else if (check.status === "redirect") redirect++;
      else if (check.status === "timeout") timeout++;
      else error++;
    }
    const checked = valid + redirect + error + timeout;
    return { valid, redirect, error, timeout, checked, pending, total: checked + pending };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- checksOf reads view state
  }, [view]);
  const groups = useMemo(() => {
    const prio: Record<CurationCheck["status"], number> = { error: 4, timeout: 3, redirect: 2, valid: 1, unknown: 0 };
    const out: {
      cardId: string;
      spaceId: string;
      title: string;
      icon: string;
      place: string;
      links: { key: string; label: string; url: string; check?: CurationCheck }[];
      probeMode?: "http" | "icmp";
      probeHost?: string;
      probeCheck?: CurationCheck;
      worst?: CurationCheck;
      anyCheck: boolean;
      counts: { valid: number; redirect: number; error: number; timeout: number };
      mixed: boolean;
    }[] = [];
    for (const item of view?.items || []) {
      const checks = checksOf(item.cardId);
      const probeMode = item.probe?.mode;
      const probeHost = probeMode === "icmp" ? item.probe?.host : item.links[0]?.url;
      const probeRaw = probeMode === "icmp" ? checks?.icmp : checks?.main;
      const probeCheck =
        probeRaw && probeHost && probeRaw.url === probeHost ? probeRaw : probeRaw && probeMode === "http" ? probeRaw : undefined;
      const links = item.links.map((link) => {
        const raw = checks?.[link.key];
        return { key: link.key, label: link.label, url: link.url, check: raw && raw.url === link.url ? raw : undefined };
      });
      const counts = { valid: 0, redirect: 0, error: 0, timeout: 0 };
      for (const link of links) {
        if (!link.check || link.check.status === "unknown") continue;
        counts[link.check.status] += 1;
      }
      const states = [counts.valid > 0, counts.redirect > 0, counts.error > 0, counts.timeout > 0].filter(
        (on) => on,
      ).length;
      let worst: CurationCheck | undefined;
      for (const link of links) {
        if (!link.check) continue;
        if (!worst || prio[link.check.status] > prio[worst.status]) worst = link.check;
      }
      if (probeCheck && (!worst || prio[probeCheck.status] > prio[worst.status])) worst = probeCheck;
      out.push({
        cardId: item.cardId,
        spaceId: item.spaceId,
        title: item.title,
        icon: item.icon,
        place: [item.spaceName, item.categoryName].filter(Boolean).join(" · "),
        links,
        probeMode,
        probeHost,
        probeCheck,
        worst,
        anyCheck: Boolean(probeCheck) || links.some((l) => l.check),
        counts,
        mixed: links.length > 1 && states > 1,
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- checksOf reads view state
  }, [view]);
  const filteredGroups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const base = needle
      ? groups.filter(
          (group) =>
            group.title.toLowerCase().includes(needle) ||
            group.place.toLowerCase().includes(needle) ||
            group.links.some(
              (link) =>
                link.label.toLowerCase().includes(needle) || link.url.toLowerCase().includes(needle),
            ),
        )
      : groups;
    if (filter === "all") return base;
    return base.filter((group) => {
      if (filter === "unknown") return !group.anyCheck;
      return group.links.some((link) => {
        const status = link.check?.status;
        if (filter === "valid") return status === "valid";
        if (filter === "redirect") return status === "redirect";
        if (filter === "error") return status === "error" || status === "timeout";
        return false;
      });
    });
  }, [groups, filter, q]);
  async function runScan() {
    if (job?.running || !view || !view.queue.length) return;
    try {
      const res = await curationStart({ data: { token } });
      if (!res.started) toast.info(t("curation.busy"));
    } catch (err) {
      if (sessionGone(err)) return;
      toast.error(te(err));
    }
  }
  async function stopScan() {
    try {
      await curationStop({ data: { token } });
    } catch (err) {
      if (sessionGone(err)) return;
      toast.error(te(err));
    }
  }
  const col = useColSort();
  const useJob = Boolean(job && (job.running || job.done > 0));
  const total = useJob && job ? job.total : counts.total;
  const done = useJob && job ? job.done : counts.checked;
  const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const boxCounts = useJob && job
    ? {
        valid: job.counts.valid,
        redirect: job.counts.redirect,
        error: job.counts.error,
        timeout: job.counts.timeout,
        pending: Math.max(0, job.total - job.done),
      }
    : counts;
  const lastRunAt = Math.max(view?.lastRunAt || 0, job?.finishedAt || 0);
  const boxTitle = job?.running
    ? t("curation.running")
    : lastRunAt
      ? t("curation.lastRun", { when: formatWhen(lastRunAt) })
      : t("curation.neverRun");
  const currentPane =
    pane === "results"
      ? { label: t("curation.results"), lead: t("curation.resultsLead") }
      : pane === "apps"
        ? { label: t("curation.apps"), lead: t("curation.appsLead") }
        : { label: t("curation.settings"), lead: t("curation.settingsLead") };
  const schedule = parseCronSchedule(cronSpec);
  function scheduleHint(next: CronSchedule): string {
    if (next.kind === "hourly") return t("curation.cronSummaryHourly");
    if (next.kind === "daily") {
      return t("curation.cronSummaryDaily", { time: `${String(next.hour).padStart(2, "0")}:00` });
    }
    if (next.kind === "weekly") {
      return t("curation.cronSummaryWeekly", {
        time: `${String(next.hour).padStart(2, "0")}:00`,
        day: t(`curation.dow${next.dow}`),
      });
    }
    if (next.kind === "custom") return t("curation.cronCustomHint");
    return t("curation.cronSummaryOff");
  }
  function persist(patch: { cron?: string; url?: string }, revert: () => void) {
    const gen = ++saveGen.current;
    saveChain.current = saveChain.current.catch(() => undefined).then(async () => {
      if (saveGen.current !== gen) return;
      try {
        const res = await updateCurationWebhook({ data: { token, ...patch } });
        noteDocRev(res);
        onSaved?.(res);
        if (saveGen.current === gen) toast.success(t("toast.saved"));
      } catch (err) {
        if (saveGen.current !== gen) return;
        revert();
        if (!sessionGone(err)) toast.error(te(err));
      }
    });
  }
  function saveCron(next: CronSchedule) {
    if (cronFromEnv) return;
    const spec = cronScheduleSpec(next);
    if (spec === cronSpec.trim()) return;
    const prev = cronSpec;
    setCronSpec(spec);
    persist({ cron: spec }, () => setCronSpec(prev));
  }
  function notifyLine(row: CurationNotify): string {
    const when = formatWhen(row.at);
    const host = row.host || "—";
    if (row.ok) {
      if (row.status) return t("curation.webhookLastOk", { when, host, status: row.status });
      return t("curation.webhookLastOkSimple", { when, host });
    }
    return t("curation.webhookLastFail", { when, host, detail: td(row.detail) });
  }
  function sendTest() {
    if (testBusy) return;
    const href = webhookFromEnv ? "" : hook.trim();
    if (!webhookFromEnv && !href) return;
    setTestBusy(true);
    testCurationWebhook({ data: { token, url: href || undefined } })
      .then((res) => {
        setNotify(res);
        if (res.ok) toast.success(t("curation.webhookTestOk"));
        else toast.error(td(res.detail));
      })
      .catch((err) => {
        if (!sessionGone(err)) toast.error(te(err));
      })
      .finally(() => setTestBusy(false));
  }
  function statusCell(check: CurationCheck | undefined, pending = false) {
    if (!check) {
      return (
        <span className="am-status text-subtle">
          <Minus className="size-3.5 shrink-0" />
          <span className="am-status-text">
            {pending ? t("curation.statusPending") : t("curation.statusUnknown")}
          </span>
        </span>
      );
    }
    const title = curationStatusTitle(check);
    return (
      <span className={`am-status ${curationTone(check.status)}`} title={title}>
        {check.status === "valid" ? (
          <Check className="size-3.5 shrink-0" />
        ) : check.status === "redirect" ? (
          <ArrowUpRight className="size-3.5 shrink-0" />
        ) : check.status === "timeout" ? (
          <Clock className="size-3.5 shrink-0" />
        ) : check.status === "error" ? (
          <X className="size-3.5 shrink-0" />
        ) : (
          <Minus className="size-3.5 shrink-0" />
        )}
        <span className="am-status-text">{curationStatusLabel(check)}</span>
      </span>
    );
  }
  return (
    <>
      <div className="settings-frame is-wide is-access">
        <nav className="settings-nav" aria-label={t("curation.sectionsAria")}>
          <p className="menu-title">{t("curation.title")}</p>
          <button
            type="button"
            className={`settings-nav-item ${pane === "results" ? "is-on" : ""}`}
            onClick={(e) => {
              setPane("results");
              e.currentTarget.scrollIntoView({ inline: "nearest", block: "nearest" });
            }}
          >
            <ListChecks className="size-4 shrink-0" />
            {t("curation.results")}
          </button>
          <button
            type="button"
            className={`settings-nav-item ${pane === "apps" ? "is-on" : ""}`}
            onClick={(e) => {
              setPane("apps");
              e.currentTarget.scrollIntoView({ inline: "nearest", block: "nearest" });
            }}
          >
            <LayoutGrid className="size-4 shrink-0" />
            {t("curation.apps")}
          </button>
          <button
            type="button"
            className={`settings-nav-item ${pane === "settings" ? "is-on" : ""}`}
            onClick={(e) => {
              setPane("settings");
              e.currentTarget.scrollIntoView({ inline: "nearest", block: "nearest" });
            }}
          >
            <Settings2 className="size-4 shrink-0" />
            {t("curation.settings")}
          </button>
        </nav>
      <div className="settings-body">
        <div className="settings-head">
          <div className="settings-head-copy">
            <h3 className="dialog-title">{currentPane.label}</h3>
            <p className="settings-lead">{currentPane.lead}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label={t("actions.close")}
            title={t("actions.close")}
          >
            <X className="size-4" />
          </Button>
        </div>
        {pane === "results" ? (
          <div className="settings-pane is-access">
            <div className="am-work">
              {ready ? (
                <div className="curation-progress">
                  <div className="curation-progress-row">
                    <span className="curation-progress-title">{boxTitle}</span>
                    {total ? (
                      <span className="shrink-0 text-xs tabular-nums text-muted">
                        {formatNumber(done)} / {formatNumber(total)}
                      </span>
                    ) : null}
                  </div>
                  {total ? (
                    <>
                      <div
                        className="h-1.5 w-full overflow-hidden rounded-full bg-elevated"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={total}
                        aria-valuenow={done}
                      >
                        <div
                          className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="curation-counts">
                        <span className="inline-flex items-center gap-1 text-ok">
                          <Check className="size-3.5" />
                          {t("curation.countValid", { n: formatNumber(boxCounts.valid) })}
                        </span>
                        <span className="inline-flex items-center gap-1 text-muted">
                          <ArrowUpRight className="size-3.5" />
                          {tp("curation.countRedirect", boxCounts.redirect, {
                            n: formatNumber(boxCounts.redirect),
                          })}
                        </span>
                        <span className="inline-flex items-center gap-1 text-danger">
                          <X className="size-3.5" />
                          {tp("curation.countError", boxCounts.error, {
                            n: formatNumber(boxCounts.error),
                          })}
                        </span>
                        <span className="inline-flex items-center gap-1 text-danger">
                          <Clock className="size-3.5" />
                          {tp("curation.countTimeout", boxCounts.timeout, {
                            n: formatNumber(boxCounts.timeout),
                          })}
                        </span>
                        {boxCounts.pending ? (
                          <span>{t("curation.countPending", { n: formatNumber(boxCounts.pending) })}</span>
                        ) : null}
                      </div>
                      {job?.running && job.current ? (
                        <p className="curation-progress-current">
                          {t("curation.lastItem")} {job.current}
                        </p>
                      ) : null}
                    </>
                  ) : null}
                </div>
              ) : null}
              <div className="curation-log-box">
                <EdgeFade className="curation-log" aria-live="polite">
                  {job?.log.length ? (
                    job.log.map((line, i) => (
                      <div
                        key={i}
                        className={`curation-log-line${
                          line.startsWith("✓")
                            ? " is-ok"
                            : line.startsWith("↗")
                              ? " is-redirect"
                              : line.startsWith("✕")
                                ? " is-error"
                                : ""
                        }`}
                      >
                        {line}
                      </div>
                    ))
                  ) : (
                    <p className="curation-log-empty">{t("curation.logEmpty")}</p>
                  )}
                  <div ref={logEndRef} />
                </EdgeFade>
              </div>
              <div className="am-actions is-center">
                {job?.running ? (
                  <Button type="button" variant="danger" onClick={() => void stopScan()}>
                    <X className="size-3.5" />
                    {t("curation.cancel")}
                  </Button>
                ) : (
                  <Button type="button" disabled={!ready || !total} onClick={() => void runScan()}>
                    <ScanSearch className="size-3.5" />
                    {t("curation.run")}
                  </Button>
                )}
              </div>
            </div>
          </div>
        ) : pane === "apps" ? (
          <div className="settings-pane is-access">
            <div className="am-work">
              <div className="am-toolbar">
                <label className="am-search">
                  <Search className="size-3.5" aria-hidden />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder={t("nav.search")}
                    aria-label={t("nav.search")}
                  />
                </label>
                <div className="am-filters" role="tablist" aria-label={t("curation.apps")}>
                  {(
                    [
                      ["all", t("access.filterAll")],
                      ["valid", t("curation.filterOk")],
                      ["redirect", t("curation.filterRedirect")],
                      ["error", t("curation.filterError")],
                      ["unknown", t("curation.filterUnknown")],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={filter === id}
                      className={filter === id ? "is-on" : ""}
                      onClick={() => setFilter(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="am-list-head is-curation">
                <span className="am-chevron-spacer" aria-hidden />
                <div className="am-row-cells">
                  <SortLabel id="a" sort={col.sort} onToggle={col.toggle} count={filteredGroups.length}>
                    {t("curation.colCard")}
                  </SortLabel>
                  <SortLabel
                    id="b"
                    sort={col.sort}
                    onToggle={col.toggle}
                    count={filteredGroups.reduce((n, g) => n + g.links.length, 0)}
                  >
                    {t("curation.colLink")}
                  </SortLabel>
                  <SortLabel id="c" sort={col.sort} onToggle={col.toggle} count={filteredGroups.length}>
                    {t("curation.colResult")}
                  </SortLabel>
                  <span className="am-row-action" />
                </div>
              </div>
              <EdgeFade className="am-list-wrap">
                {!ready ? (
                  <div className="am-list" aria-busy="true" aria-label={t("curation.loading")}>
                    <Skeleton className="h-9 w-full" />
                    <Skeleton className="h-9 w-full" />
                    <Skeleton className="h-9 w-full" />
                    <Skeleton className="h-9 w-full" />
                  </div>
                ) : !filteredGroups.length ? (
                  <EmptyState
                    compact
                    icon={LayoutGrid}
                    text={view?.items.length ? t("curation.emptyFilter") : t("curation.empty")}
                  />
                ) : (
                  <div className="am-list is-curation" role="list">
                    {col
                      .apply(filteredGroups, (group, key) => {
                        if (key === "a") return group.title;
                        if (key === "b") return group.links.length;
                        return group.worst
                          ? { error: 4, timeout: 3, redirect: 2, valid: 1, unknown: 0 }[group.worst.status]
                          : -1;
                      })
                      .map((group) => {
                      const canEdit = spacePerms[group.spaceId] === "edit";
                      const expanded = openId === group.cardId;
                      return (
                        <ExpandRow
                          key={group.cardId}
                          id={group.cardId}
                          expanded={expanded}
                          onToggle={() => setOpenId(expanded ? null : group.cardId)}
                          cells={
                            <>
                              <span className="am-row-title is-curation-card">
                                <PortalIcon name={group.icon} className="size-4 shrink-0" />
                                {group.probeMode ? (
                                  <span
                                    className={`status-mark is-${
                                      !group.probeCheck || group.probeCheck.status === "unknown"
                                        ? "wait"
                                        : group.probeCheck.status === "valid" || group.probeCheck.status === "redirect"
                                          ? "up"
                                          : "down"
                                    }`}
                                    title={
                                      group.probeCheck
                                        ? `${t(group.probeMode === "icmp" ? "curation.probeIcmp" : "curation.probeHttp")} · ${curationStatusLabel(group.probeCheck)}`
                                        : t(group.probeMode === "icmp" ? "curation.probeIcmp" : "curation.probeHttp")
                                    }
                                    aria-hidden
                                  />
                                ) : null}
                                <span className="curation-card-name">{group.title}</span>
                                {group.place ? (
                                  <span className="curation-card-place">{group.place}</span>
                                ) : null}
                              </span>
                              <span className="am-row-link">
                                {group.mixed ? (
                                  <span className="curation-split">
                                    {group.counts.valid ? (
                                      <span className="inline-flex items-center gap-1 text-ok">
                                        <Check className="size-3" />
                                        {formatNumber(group.counts.valid)}
                                      </span>
                                    ) : null}
                                    {group.counts.redirect ? (
                                      <span className="inline-flex items-center gap-1 text-muted">
                                        <ArrowUpRight className="size-3" />
                                        {formatNumber(group.counts.redirect)}
                                      </span>
                                    ) : null}
                                    {group.counts.error ? (
                                      <span className="inline-flex items-center gap-1 text-danger">
                                        <X className="size-3" />
                                        {formatNumber(group.counts.error)}
                                      </span>
                                    ) : null}
                                    {group.counts.timeout ? (
                                      <span className="inline-flex items-center gap-1 text-danger">
                                        <Clock className="size-3" />
                                        {formatNumber(group.counts.timeout)}
                                      </span>
                                    ) : null}
                                  </span>
                                ) : group.links.length ? (
                                  tp("curation.linkCount", group.links.length)
                                ) : (
                                  "—"
                                )}
                              </span>
                              {statusCell(group.worst, !group.links.length)}
                              <span className="am-row-action">
                                <button
                                  type="button"
                                  className="card-tool"
                                  disabled={!canEdit}
                                  title={t("curation.editCard")}
                                  aria-label={t("curation.editCard")}
                                  onClick={() => setEdit(editContext(group.cardId))}
                                >
                                  <Pencil className="size-3.5" />
                                </button>
                              </span>
                            </>
                          }
                        >
                          <div className="curation-sub">
                            {group.probeMode ? (
                              <div className="curation-sub-row">
                                <div className="curation-sub-line">
                                  <span className="curation-sub-label">
                                    {t(group.probeMode === "icmp" ? "curation.probeIcmp" : "curation.probeHttp")}
                                  </span>
                                  {statusCell(group.probeCheck, true)}
                                </div>
                                <p className="curation-sub-url" title={group.probeHost || undefined}>
                                  {group.probeHost || "—"}
                                </p>
                              </div>
                            ) : null}
                            {group.links.length ? (
                              group.links.map((link) => (
                                <div key={link.key} className="curation-sub-row">
                                  <div className="curation-sub-line">
                                    <span className="curation-sub-label">{link.label || "—"}</span>
                                    {statusCell(link.check, true)}
                                  </div>
                                  <p className="curation-sub-url" title={link.url}>
                                    {link.url || "—"}
                                  </p>
                                </div>
                              ))
                            ) : group.probeMode ? null : (
                              <div className="curation-sub-row">
                                <div className="curation-sub-line">
                                  <span className="curation-sub-label">—</span>
                                  {statusCell(undefined, false)}
                                </div>
                                <p className="curation-sub-url">{t("curation.statusUnknown")}</p>
                              </div>
                            )}
                          </div>
                        </ExpandRow>
                      );
                    })}
                  </div>
                )}
              </EdgeFade>
            </div>
          </div>
        ) : (
          <div className="settings-pane">
            <div className="settings-stack">
              <div className="settings-card">
                <p className="settings-kicker">{t("curation.cron")}</p>
                <Field className={cronFromEnv ? "is-disabled" : ""} label={t("curation.cronFreq")}>
                  <Select
                    value={schedule.kind}
                    disabled={cronFromEnv}
                    onChange={(e) => {
                      const kind = e.target.value;
                      if (kind === "off") saveCron({ kind: "off" });
                      else if (kind === "hourly") saveCron({ kind: "hourly" });
                      else if (kind === "daily") {
                        const hour = schedule.kind === "weekly" || schedule.kind === "daily" ? schedule.hour : 3;
                        saveCron({ kind: "daily", hour });
                      } else if (kind === "weekly") {
                        const hour = schedule.kind === "weekly" || schedule.kind === "daily" ? schedule.hour : 3;
                        saveCron({ kind: "weekly", hour, dow: schedule.kind === "weekly" ? schedule.dow : 1 });
                      }
                    }}
                  >
                    <option value="off">{t("curation.cronOff")}</option>
                    <option value="hourly">{t("curation.cronHourly")}</option>
                    <option value="daily">{t("curation.cronDaily")}</option>
                    <option value="weekly">{t("curation.cronWeekly")}</option>
                    {schedule.kind === "custom" ? (
                      <option value="custom">{t("curation.cronCustom", { spec: schedule.spec })}</option>
                    ) : null}
                  </Select>
                </Field>
                {schedule.kind === "daily" ? (
                  <Field className={`is-child${cronFromEnv ? " is-disabled" : ""}`} label={t("curation.cronHour")}>
                    <Select
                      value={String(schedule.hour)}
                      disabled={cronFromEnv}
                      onChange={(e) => saveCron({ kind: "daily", hour: Number(e.target.value) })}
                    >
                      {HOURS.map((h) => (
                        <option key={h} value={h}>
                          {`${String(h).padStart(2, "0")}:00`}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ) : null}
                {schedule.kind === "weekly" ? (
                  <div className="settings-fields-row is-child">
                    <Field className={cronFromEnv ? "is-disabled" : ""} label={t("curation.cronHour")}>
                      <Select
                        value={String(schedule.hour)}
                        disabled={cronFromEnv}
                        onChange={(e) =>
                          saveCron({ kind: "weekly", hour: Number(e.target.value), dow: schedule.dow })
                        }
                      >
                        {HOURS.map((h) => (
                          <option key={h} value={h}>
                            {`${String(h).padStart(2, "0")}:00`}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field className={cronFromEnv ? "is-disabled" : ""} label={t("curation.cronDow")}>
                      <Select
                        value={String(schedule.dow)}
                        disabled={cronFromEnv}
                        onChange={(e) =>
                          saveCron({ kind: "weekly", hour: schedule.hour, dow: Number(e.target.value) })
                        }
                      >
                        {WEEKDAYS.map((d) => (
                          <option key={d} value={d}>
                            {t(`curation.dow${d}`)}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                ) : null}
                <p className="settings-hint">{scheduleHint(schedule)}</p>
                {cronFromEnv ? <p className="settings-hint">{t("curation.cronEnv")}</p> : null}
              </div>
              <div className="settings-card">
                <p className="settings-kicker">{t("curation.webhook")}</p>
                <Field className={webhookFromEnv ? "is-disabled" : ""} label={t("curation.webhookUrl")}>
                  <div className="flex gap-2">
                    <span className="min-w-0 flex-1">
                      <Input
                        value={webhookFromEnv ? "" : hook}
                        onChange={(e) => setHook(e.target.value)}
                        onBlur={() => {
                          if (webhookFromEnv) return;
                          const next = hook.trim();
                          if (next === savedHook.current) return;
                          const prev = savedHook.current;
                          savedHook.current = next;
                          persist({ url: next }, () => {
                            savedHook.current = prev;
                            setHook(prev);
                          });
                        }}
                        placeholder="https://"
                        autoComplete="off"
                        disabled={webhookFromEnv}
                      />
                    </span>
                    <Button
                      type="button"
                      variant="secondary"
                      className="shrink-0"
                      disabled={testBusy || (!webhookFromEnv && !hook.trim())}
                      onClick={() => sendTest()}
                    >
                      {t("curation.webhookTest")}
                    </Button>
                  </div>
                  <p className="settings-hint">{webhookFromEnv ? t("curation.webhookEnv") : t("curation.webhookHint")}</p>
                  {notify ? (
                    <p className={`settings-hint${notify.ok ? "" : " is-warn"}`}>{notifyLine(notify)}</p>
                  ) : null}
                </Field>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
    {edit ? (
      <ModalShell size="wide" label={t("curation.editCard")} onClose={() => setEdit(null)}>
        <CardForm
          categories={edit.categories}
          categoryId={edit.categoryId}
          catalog={catalog}
          initial={edit.app}
          busy={busy}
          picker={picker}
          probes={probes}
          knownTags={knownTags}
          tagColors={tagColors}
          onCancel={() => setEdit(null)}
          onSave={(payload) =>
            onSaveCard(edit.app, payload, () => {
              setEdit(null);
              reloadRef.current();
            })
          }
        />
      </ModalShell>
    ) : null}
    </>
  );
}
