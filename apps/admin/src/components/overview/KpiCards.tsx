import { TriangleAlert } from 'lucide-react';
import { useId } from 'react';

import type { OverviewKpis } from '@/lib/overview';
import { cn } from '@/lib/utils';
import { ar } from '@/messages/ar';

const t = ar.overview;

export interface KpiCardProps {
  label: string;
  value: string;
  caption?: string;
  /** DESIGN.md §6 `KpiCard` تنبيه: something needs the شيخ's attention. */
  alert?: boolean;
}

/** DESIGN.md §6 `KpiCard` (عادية · تنبيه): a label, a big number and a line under it. Labels wrap. */
export function KpiCard({ label, value, caption, alert = false }: KpiCardProps) {
  const labelId = useId();
  return (
    <div
      role="group"
      aria-labelledby={labelId}
      data-variant={alert ? 'alert' : 'normal'}
      className={cn(
        'flex min-w-0 flex-1 flex-col gap-8 rounded-2xl border bg-surface p-24',
        alert ? 'border-2 border-status-notdone' : 'border-line-subtle',
      )}
    >
      <p className="flex items-start gap-8 t-body-sm text-fg-secondary">
        {alert ? (
          <TriangleAlert role="img" aria-label={t.alertMark} className="size-20 shrink-0 text-status-notdone" />
        ) : null}
        <span id={labelId}>{label}</span>
      </p>
      <p data-kpi-value className={cn('t-number-lg', alert ? 'text-status-notdone' : 'text-fg-primary')}>
        {value}
      </p>
      {caption ? <p className="t-caption text-fg-secondary">{caption}</p> : null}
    </div>
  );
}

/** The three overview KPIs (spec §11.2); the inactive and open-support cards turn to alert above zero. */
export function KpiCards({ kpis, shown }: { kpis: OverviewKpis; shown: number }) {
  return (
    <div className="flex flex-col gap-16 md:flex-row">
      <KpiCard
        label={t.kpis.loggedThisWeek}
        value={kpis.loggedThisWeekPct === null ? t.none : t.pct(kpis.loggedThisWeekPct)}
        caption={t.kpiCaptions.loggedThisWeek(shown)}
      />
      <KpiCard
        label={t.kpis.inactive}
        value={String(kpis.inactive3DaysCount)}
        caption={t.kpiCaptions.inactive}
        alert={kpis.inactive3DaysCount > 0}
      />
      <KpiCard
        label={t.kpis.openSupport}
        value={String(kpis.openSupportCount)}
        caption={t.kpiCaptions.openSupport}
        alert={kpis.openSupportCount > 0}
      />
    </div>
  );
}
