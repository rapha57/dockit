import { useEffect, useState } from "react";
import { Download, ScrollText, Search, Trash2, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { EdgeFade } from "@/components/edge-fade";
import { Skeleton } from "@/components/ui/skeleton";
import { askConfirm } from "@/components/confirm-dialog";
import { useColSort, SortLabel } from "@/components/access";
import { toast } from "sonner";
import { t, te, tp, formatWhen } from "@/lib/i18n";
import { auditCsv } from "@/lib/history";
import type { AuditRow, TrashRow } from "@/lib/history";
import { listHistory, restoreHistory, purgeTrash, exportAudit } from "@/lib/portal";
import type { PortalData } from "@/lib/portal-ui";
import { sessionGone } from "@/lib/session-gone";

export function formatHistoryWhen(at: number) {
  return formatWhen(at);
}
export function historyScopeLabel(scope: string | undefined, kind: string | undefined) {
  if (scope === "space" || kind === "space") return t("nav.space");
  if (scope === "category" || kind === "category") return t("item.category");
  if (kind === "note") return t("history.scopeNote");
  if (kind === "embed") return t("history.scopeEmbed");
  return t("history.scopeCard");
}
function historyCountLabel(n: number | undefined) {
  if (!n) return "";
  return tp("history.cardCount", n);
}
function historyMatches(needle: string, parts: (string | undefined | null)[]) {
  if (!needle) return true;
  return parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(needle);
}
export function HistoryPanel({
  token,
  tab,
  onClose,
  onRestored,
}: {
  token: string;
  tab: string;
  onClose: () => void;
  onRestored: (next: PortalData) => void;
}) {
  const [pane, setPane] = useState(tab === "audit" ? "audit" : "recovery");
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [trash, setTrash] = useState<TrashRow[]>([]);
  const [canPurge, setCanPurge] = useState(false);
  const [canAudit, setCanAudit] = useState(true);
  const [canRestore, setCanRestore] = useState(true);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  async function reload() {
    const res = await listHistory({
      data: {
        token,
      },
    });
    setAudit(res.audit || []);
    setTrash(res.trash || []);
    setCanPurge(Boolean(res.canEmpty));
    setCanAudit(res.canAudit !== false);
    setCanRestore(res.canRestore !== false);
    setReady(true);
  }
  useEffect(() => {
    reload().catch((err) => {
      setReady(true);
      if (sessionGone(err)) return;
      toast.error(te(err));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload reads latest token from props; fetch once on mount
  }, [token]);
  const needle = q.trim().toLowerCase();
  const col = useColSort();
  const trashRows = col.apply(
    (filter === "all" ? trash : trash.filter((row) => row.scope === filter)).filter((row) =>
      historyMatches(needle, [
        row.label,
        row.path,
        row.actor,
        historyScopeLabel(row.scope, row.kind),
        historyCountLabel(row.count),
        formatHistoryWhen(row.at),
      ]),
    ),
    (row, key) => {
      if (key === "a") return row.label || "";
      if (key === "b") return row.path || "";
      if (key === "date") return Number(row.at) || 0;
      return "";
    },
  );
  const auditRows = col.apply(
    audit
      .filter((row) => filter === "all" || String(row.type || "").startsWith(`${filter}.`))
      .filter((row) =>
        historyMatches(needle, [
          t(`audit.${row.type}`),
          row.label,
          row.path,
          row.actor,
          formatHistoryWhen(row.at),
        ]),
      ),
    (row, key) => {
      if (key === "a") return t(`audit.${row.type}`);
      if (key === "b") return [row.label, row.path].filter(Boolean).join(" ");
      if (key === "date") return Number(row.at) || 0;
      return "";
    },
  );
  async function restore(row: TrashRow) {
    if (busy) return;
    setBusy(true);
    try {
      const next = await restoreHistory({
        data: {
          token,
          id: row.id,
          scope: row.scope,
          targetId: row.targetId,
        },
      });
      onRestored?.(next);
      toast.success(t("history.restored"));
      await reload();
    } catch (err) {
      if (sessionGone(err)) return;
      toast.error(te(err));
    } finally {
      setBusy(false);
    }
  }
  async function downloadAudit() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await exportAudit({
        data: {
          token,
        },
      });
      const blob = new Blob([auditCsv(res.rows || [])], {
        type: "text/csv;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(t("history.exported"));
    } catch (err) {
      if (sessionGone(err)) return;
      toast.error(te(err));
    } finally {
      setBusy(false);
    }
  }
  async function purge() {
    if (!canPurge || busy) return;
    if (
      !(await askConfirm({
        title: t("actions.emptyTrash"),
        body: t("confirm.emptyTrash"),
        okLabel: t("actions.emptyTrash"),
      }))
    )
      return;
    setBusy(true);
    try {
      const res = await purgeTrash({
        data: {
          token,
        },
      });
      if (res.portal) onRestored?.(res.portal);
      setAudit(res.audit || []);
      setTrash(res.trash || []);
      toast.success(t("history.purged"));
    } catch (err) {
      if (sessionGone(err)) return;
      toast.error(te(err));
    } finally {
      setBusy(false);
    }
  }
  const current =
    pane === "audit"
      ? {
          label: t("history.audit"),
          lead: t("history.auditLead"),
        }
      : {
          label: t("history.recovery"),
          lead: t("history.recoveryLead"),
        };
  const emptyText =
    needle || filter !== "all"
      ? t("empty.noResults")
      : pane === "audit"
        ? t("history.noAudit")
        : t("history.nothing");
  const rows = pane === "audit" ? auditRows : trashRows;
  return (
    <div className="settings-frame is-wide is-access">
      <nav className="settings-nav" aria-label={t("history.sectionsAria")}>
        <p className="menu-title">{t("history.title")}</p>
        {canRestore ? (
          <button
            type="button"
            className={`settings-nav-item ${pane === "recovery" ? "is-on" : ""}`}
            onClick={() => {
              setPane("recovery");
              setQ("");
            }}
          >
            <Undo2 className="size-4 shrink-0" />
            {t("history.recovery")}
          </button>
        ) : null}
        {canAudit ? (
          <button
            type="button"
            className={`settings-nav-item ${pane === "audit" ? "is-on" : ""}`}
            onClick={() => {
              setPane("audit");
              setQ("");
            }}
          >
            <ScrollText className="size-4 shrink-0" />
            {t("history.audit")}
          </button>
        ) : null}
      </nav>
      <div className="settings-body">
        <div className="settings-head">
          <div className="settings-head-copy">
            <h3 className="dialog-title">{current.label}</h3>
            <p className="settings-lead">{current.lead}</p>
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
              <div className="am-filters" role="tablist" aria-label={t("access.filterAll")}>
                {[
                  ["all", t("access.filterAll")],
                  ["card", t("history.cards")],
                  ["category", t("history.categories")],
                  ["space", t("history.spaces")],
                ].map(([id, label]) => (
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
              {pane === "recovery" && canPurge ? (
                <Button
                  type="button"
                  variant="danger"
                  className="am-create shrink-0 ml-auto"
                  disabled={busy || trash.length === 0}
                  onClick={() => void purge()}
                >
                  <Trash2 className="size-3.5" />
                  {t("actions.emptyTrash")}
                </Button>
              ) : null}
              {pane === "audit" ? (
                <button
                  type="button"
                  className="am-create shrink-0"
                  disabled={busy || !ready}
                  onClick={() => void downloadAudit()}
                >
                  <Download className="size-3.5" />
                  {t("actions.exportCsv")}
                </button>
              ) : null}
            </div>
            {ready && rows.length ? (
              <div className={`am-list-head is-history${pane === "recovery" ? " is-recovery" : ""}`}>
                <div className="am-row-cells">
                  <SortLabel id="a" sort={col.sort} onToggle={col.toggle} count={rows.length}>
                    {pane === "audit" ? t("audit.csvAction") : t("audit.csvItem")}
                  </SortLabel>
                  <SortLabel id="b" sort={col.sort} onToggle={col.toggle} count={rows.length}>
                    {pane === "audit" ? t("audit.csvItem") : t("audit.csvPlace")}
                  </SortLabel>
                  <SortLabel id="date" sort={col.sort} onToggle={col.toggle} count={rows.length}>
                    {t("audit.csvDate")}
                  </SortLabel>
                  {pane === "recovery" ? <span className="am-row-action" /> : null}
                </div>
              </div>
            ) : null}
            <EdgeFade className="am-list-wrap">
              {!ready ? (
                <div className="am-list" aria-busy="true" aria-label={t("history.loading")}>
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-full" />
                </div>
              ) : !rows.length ? (
                <EmptyState compact icon={pane === "audit" ? ScrollText : Undo2} text={emptyText} />
              ) : (
                <div className={`am-list is-history${pane === "recovery" ? " is-recovery" : ""}`} role="list">
                  {pane === "audit"
                    ? auditRows.map((row) => (
                        <div key={row.id} className="am-row is-static" role="listitem">
                          <div className="am-row-head">
                            <div className="am-row-cells">
                              <span className="am-row-title">{t(`audit.${row.type}`)}</span>
                              <span className="am-dim">
                                {[row.label, row.path].filter(Boolean).join(" · ") || "—"}
                              </span>
                              <span className="am-dim">
                                {[formatHistoryWhen(row.at), row.actor].filter(Boolean).join(" · ")}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))
                    : trashRows.map((row) => (
                        <div
                          key={`${row.id}:${row.scope}:${row.targetId}`}
                          className="am-row is-static"
                          role="listitem"
                        >
                          <div className="am-row-head">
                            <div className="am-row-cells">
                              <span className="am-row-title">
                                {row.label}
                                <span className="am-row-sub">
                                  {historyScopeLabel(row.scope, row.kind)}
                                </span>
                              </span>
                              <span className="am-dim">
                                {[row.path, historyCountLabel(row.count)].filter(Boolean).join(" · ") ||
                                  "—"}
                              </span>
                              <span className="am-dim">
                                {[formatHistoryWhen(row.at), row.actor].filter(Boolean).join(" · ")}
                              </span>
                              <span className="am-row-action">
                                <button
                                  type="button"
                                  className="card-tool am-row-restore"
                                  aria-label={t("actions.restore")}
                                  title={t("actions.restore")}
                                  disabled={busy}
                                  onClick={() => void restore(row)}
                                >
                                  <Undo2 className="size-3.5" />
                                </button>
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                </div>
              )}
            </EdgeFade>
          </div>
        </div>
      </div>
    </div>
  );
}
