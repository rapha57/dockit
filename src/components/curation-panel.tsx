import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Check, Clock, LayoutGrid, ListChecks, Minus, Pencil, ScanSearch, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import {
  curationStart,
  curationStatus,
  curationStop,
  getCuration,
  type CurationCheck,
  type CurationJobView,
  type CustomIcon,
  type PortalCard,
  type PortalCategory,
} from "@/lib/portal";
import type { CardFormPayload, CatalogSpace, CurationViewData } from "@/lib/portal-ui";
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
}) {
  const [pane, setPane] = useState<"results" | "apps">("results");
  const [view, setView] = useState<CurationViewData | null>(null);
  const [ready, setReady] = useState(false);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [job, setJob] = useState<CurationJobView | null>(null);
  const [edit, setEdit] = useState<{ app: PortalCard; categoryId: string; categories: PortalCategory[] } | null>(
    null,
  );
  const jobRunningRef = useRef(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const reloadRef = useRef<() => void>(() => {});
  useEffect(() => {
    let alive = true;
    let timer = 0;
    async function reload() {
      try {
        const res = await getCuration({ data: { token } });
        if (alive) setView(res);
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
        const wasRunning = jobRunningRef.current;
        jobRunningRef.current = res.running;
        if (wasRunning && !res.running) void reload();
      } catch (err) {
        if (!alive || sessionGone(err)) return;
      }
      if (alive) timer = window.setTimeout(() => void tick(), 800);
    }
    getCuration({ data: { token } })
      .then((res) => {
        if (!alive) return;
        setView(res);
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
      : { label: t("curation.apps"), lead: t("curation.appsLead") };
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
            onClick={() => setPane("results")}
          >
            <ListChecks className="size-4 shrink-0" />
            {t("curation.results")}
          </button>
          <button
            type="button"
            className={`settings-nav-item ${pane === "apps" ? "is-on" : ""}`}
            onClick={() => setPane("apps")}
          >
            <LayoutGrid className="size-4 shrink-0" />
            {t("curation.apps")}
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
        ) : (
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
