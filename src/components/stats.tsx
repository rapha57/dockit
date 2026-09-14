import { useMemo, type ReactNode } from "react";
import { AlertTriangle, BarChart3, CircleHelp, MousePointerClick, SquareMenu, Star, X } from "lucide-react";
import { t, tp, formatNumber, localeTag } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { PortalIcon } from "@/lib/icons";
import { tagPaint } from "@/lib/tag-ui";
import type { CatalogSpace } from "@/lib/portal-ui";
import type { ClickStats } from "@/lib/portal";

function fmtCount(n: number) {
  return formatNumber(n);
}

export function collectTopApps(catalog: CatalogSpace[] | null | undefined, limit = 10) {
  const rows: { id: string; title: string; icon: string; tab: string; clicks: number }[] = [];
  for (const tab of catalog ?? [])
    for (const cat of tab.categories)
      for (const app of cat.cards) {
        if ((app.kind || "app") !== "app") continue;
        rows.push({
          id: app.id,
          title: app.title,
          icon: app.icon,
          tab: tab.name,
          clicks: app.clicks || 0,
        });
      }
  return rows
    .sort((a, b) => b.clicks - a.clicks || a.title.localeCompare(b.title, localeTag()))
    .slice(0, limit);
}
export function StatsPanel({
  catalog,
  scoped,
  onClose,
}: {
  catalog: CatalogSpace[];
  scoped: boolean;
  onClose: () => void;
}) {
  const top = useMemo(() => collectTopApps(catalog, 10).filter((r) => r.clicks > 0), [catalog]);
  const max = Math.max(1, ...top.map((r) => r.clicks));
  const total = top.reduce((sum, row) => sum + row.clicks, 0);
  return (
    <div className="stats-panel">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h3 className="dialog-title">{t("stats.title")}</h3>
          <p className="mt-1 text-sm text-muted">{t(scoped ? "stats.leadVisible" : "stats.lead")}</p>
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
      {top.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted">{t("empty.noClicks")}</p>
      ) : (
        <ol className="stats-list">
          {top.map((row, index) => (
            <li key={row.id} className="stats-row">
              <span className="stats-rank">{index + 1}</span>
              <span className="portal-mark flex size-8 items-center justify-center rounded-md">
                <PortalIcon name={row.icon} className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{row.title}</p>
                <p className="truncate text-xs text-muted">{row.tab}</p>
                <div className="stats-meter mt-1.5">
                  <span
                    style={{
                      width: `${Math.max(6, (row.clicks / max) * 100)}%`,
                    }}
                  />
                </div>
              </div>
              <span className="stats-count">{row.clicks}</span>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-5 text-xs text-subtle">{tp("info.total", total)}</p>
    </div>
  );
}

function LegendSample({ children }: { children: ReactNode }) {
  return (
    <span className="legend-sample" aria-hidden>
      {children}
    </span>
  );
}

export function LegendPanel({ onClose }: { onClose: () => void }) {
  const tagSample = t("legend.tagSample");
  const tag = tagPaint(tagSample, null);
  const rows: { id: string; sample: ReactNode; title: string; hint: string }[] = [
    {
      id: "hub",
      sample: (
        <span className="card-tool is-hub">
          <SquareMenu className="size-3.5" />
        </span>
      ),
      title: t("legend.hub"),
      hint: t("legend.hubHint"),
    },
    {
      id: "annex",
      sample: (
        <span className="card-tool">
          <SquareMenu className="size-3.5" />
        </span>
      ),
      title: t("legend.annex"),
      hint: t("legend.annexHint"),
    },
    {
      id: "probe",
      sample: <span className="status-mark is-up" />,
      title: t("legend.probe"),
      hint: t("legend.probeHint"),
    },
    {
      id: "fav",
      sample: (
        <span className="fav-star is-on">
          <Star className="size-3.5" fill="currentColor" />
        </span>
      ),
      title: t("legend.fav"),
      hint: t("legend.favHint"),
    },
    {
      id: "tags",
      sample: (
        <span className="tag-chip" data-tone={tag.tone} style={tag.style}>
          {tagSample}
        </span>
      ),
      title: t("legend.tags"),
      hint: t("legend.tagsHint"),
    },
  ];
  return (
    <div className="stats-panel">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h3 className="dialog-title">{t("legend.title")}</h3>
          <p className="mt-1 text-sm text-muted">{t("legend.lead")}</p>
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
      <ul className="legend-list">
        {rows.map((row) => (
          <li key={row.id} className="legend-row">
            <LegendSample>{row.sample}</LegendSample>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{row.title}</p>
              <p className="text-xs text-muted">{row.hint}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StatsBar({
  stats,
  infoBar,
  downCount,
  downOn,
  probeBlink,
  onDown,
  onStats,
  onLegend,
}: {
  stats: ClickStats | null | undefined;
  infoBar: boolean;
  downCount: number;
  downOn: boolean;
  probeBlink?: boolean;
  onDown?: () => void;
  onStats?: () => void;
  onLegend?: () => void;
}) {
  const span = Number(stats?.spanDays) || 0;
  const fullCatalog = stats?.fullCatalog !== false;
  const metrics = infoBar && fullCatalog
    ? [
        {
          key: "today",
          label: t("info.day"),
          value: stats?.today ?? 0,
          hint: t("info.today"),
        },
        span >= 1
          ? {
              key: "week",
              label: t("info.week"),
              value: stats?.week ?? 0,
              hint: t("info.last7"),
            }
          : null,
        span >= 7
          ? {
              key: "month",
              label: t("info.month"),
              value: stats?.month ?? 0,
              hint: t("info.last30"),
            }
          : null,
        span >= 30
          ? {
              key: "year",
              label: t("info.year"),
              value: stats?.year ?? 0,
              hint: t("info.last12"),
            }
          : null,
      ].filter((m): m is { key: string; label: string; value: number; hint: string } => m !== null)
    : [];
  if (!metrics.length && downCount === 0 && !onStats && !onLegend) return null;
  return (
    <div className="info-bar" role="status" aria-label={t("aria.information")}>
      <div className="info-bar-inner">
        {metrics.length || onStats || onLegend ? (
          <div className="info-metrics">
            <MousePointerClick className="info-click-ico" aria-hidden />
            {metrics.map((m, i) => (
              <span key={m.key} className="info-metric" title={m.hint}>
                {i > 0 ? <span className="info-dot" aria-hidden /> : null}
                <b>{fmtCount(m.value)}</b> <span>{m.label}</span>
                {m.key === "year" && onStats ? (
                  <button
                    type="button"
                    className="info-stats-btn"
                    aria-label={t("stats.title")}
                    title={t("stats.topApps")}
                    onClick={(e) => {
                      e.stopPropagation();
                      onStats();
                    }}
                  >
                    <BarChart3 className="size-3" />
                  </button>
                ) : null}
              </span>
            ))}
            {onStats && !metrics.some((m) => m.key === "year") ? (
              <button
                type="button"
                className="info-stats-btn"
                aria-label={t("stats.title")}
                title={t("stats.topApps")}
                onClick={onStats}
              >
                <BarChart3 className="size-3" />
              </button>
            ) : null}
            {onLegend ? (
              <button
                type="button"
                className="info-stats-btn"
                aria-label={t("legend.title")}
                title={t("legend.title")}
                onClick={(e) => {
                  e.stopPropagation();
                  onLegend();
                }}
              >
                <CircleHelp className="size-3" />
              </button>
            ) : null}
          </div>
        ) : (
          <span />
        )}
        {downCount > 0 ? (
          <button
            type="button"
            className={`info-bar-warn ${downOn ? "is-on" : ""} ${probeBlink ? "is-blink" : ""}`}
            onClick={onDown}
            aria-pressed={downOn}
            title={downOn ? t("stats.showAll") : t("stats.showDown")}
          >
            <AlertTriangle className="size-3" />
            {tp("info.downCount", downCount)}
          </button>
        ) : null}
      </div>
    </div>
  );
}
