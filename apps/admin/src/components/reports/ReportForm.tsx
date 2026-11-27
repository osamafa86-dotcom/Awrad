'use client';

import { Download } from 'lucide-react';
import { useId, useState } from 'react';

import { FilterSelect } from '@/components/FilterSelect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  EXPORT_KINDS,
  periodProblem,
  REPORT_PRESETS,
  reportPresets,
  type ExportKind,
  type ReportPreset,
} from '@/lib/export-query';
import { formatHijri } from '@/lib/format';
import type { GroupOption } from '@/lib/students';
import { cn } from '@/lib/utils';
import { ar } from '@/messages/ar';

const t = ar.reports;
const ALL = 'all';

export interface ReportFormProps {
  /** The groups the viewer may pick: all for an admin, the supervised ones for a supervisor. */
  groups: GroupOption[];
  /** `YYYY-MM-DD` in the viewer's zone: the presets are counted from it. */
  today: string;
  hijriAdjustment: number;
}

/** A Gregorian date field whose label carries the Hijri equivalent (BR-09). */
function DateField({
  label,
  value,
  onChange,
  hijriAdjustment,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  hijriAdjustment: number;
}) {
  const id = useId();
  const valid = periodProblem(value, value) === null;
  return (
    <div className="flex min-w-192 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-8">
        <Label htmlFor={id} className="t-label-sm text-fg-secondary">
          {label}
        </Label>
        {valid ? (
          <span id={`${id}-hijri`} className="t-caption text-fg-tertiary">
            {formatHijri(value, hijriAdjustment)}
          </span>
        ) : null}
      </div>
      <Input
        id={id}
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={valid ? `${id}-hijri` : undefined}
      />
    </div>
  );
}

/**
 * a10 — F-65: the report kind, the period (presets or two dates) and the group, then «تنزيل CSV», a plain
 * link to GET /api/export (the browser downloads the attachment; RLS scopes the rows on the server).
 */
export function ReportForm({ groups, today, hijriAdjustment }: ReportFormProps) {
  const presets = reportPresets(today);
  const [kind, setKind] = useState<ExportKind>('daily');
  const [preset, setPreset] = useState<ReportPreset | null>('thisMonth');
  const [from, setFrom] = useState(presets.thisMonth.from);
  const [to, setTo] = useState(presets.thisMonth.to);
  const [group, setGroup] = useState(ALL);
  const reasonId = useId();

  function pick(next: ReportPreset) {
    setPreset(next);
    setFrom(presets[next].from);
    setTo(presets[next].to);
  }

  const problem = periodProblem(from, to);
  const href = `/api/export?${new URLSearchParams({ kind, from, to, group }).toString()}`;

  return (
    <div className="flex flex-col gap-24">
      <div className="flex flex-col gap-4">
        <h1 className="t-display-title text-fg-primary">{t.title}</h1>
        <p className="t-body-md text-fg-secondary">{t.subtitle}</p>
      </div>

      <div className="flex flex-col gap-24 rounded-xl border border-line-subtle bg-surface p-24">
        <div className="flex flex-wrap items-end gap-16">
          <FilterSelect
            label={t.kind}
            value={kind}
            options={EXPORT_KINDS.map((value) => ({ value, label: t.kinds[value] }))}
            onValueChange={(value) => setKind(value as ExportKind)}
            className="min-w-192"
          />
          <FilterSelect
            label={t.group}
            value={group}
            options={[{ value: ALL, label: t.allGroups }, ...groups.map((g) => ({ value: g.id, label: g.name }))]}
            onValueChange={setGroup}
            className="min-w-192"
          />
        </div>

        <fieldset className="flex flex-col gap-12">
          <legend className="mb-12 t-label-md text-fg-primary">{t.period}</legend>
          <div role="group" aria-label={t.presetsLabel} className="flex flex-wrap gap-8">
            {REPORT_PRESETS.map((value) => (
              <Button
                key={value}
                type="button"
                variant="secondary"
                size="md"
                aria-pressed={preset === value}
                onClick={() => pick(value)}
                className={cn(preset === value && 'border-action bg-action-tint')}
              >
                {t.presets[value]}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-16">
            <DateField
              label={t.from}
              value={from}
              hijriAdjustment={hijriAdjustment}
              onChange={(value) => {
                setPreset(null);
                setFrom(value);
              }}
            />
            <DateField
              label={t.to}
              value={to}
              hijriAdjustment={hijriAdjustment}
              onChange={(value) => {
                setPreset(null);
                setTo(value);
              }}
            />
          </div>
        </fieldset>

        {groups.length === 0 ? <p className="t-body-sm text-fg-secondary">{t.noGroups}</p> : null}

        {/* The primary action last in the line (DESIGN.md §7 rule 3). */}
        <div className="flex flex-wrap items-center justify-between gap-12">
          <p className="t-body-sm text-fg-secondary">{t.excelNote}</p>
          <div className="flex flex-col items-end gap-4">
            {problem ? (
              <Button size="md" disabled aria-describedby={reasonId}>
                <Download aria-hidden="true" className="size-20" />
                {t.download}
              </Button>
            ) : (
              <Button asChild size="md">
                <a href={href} download>
                  <Download aria-hidden="true" className="size-20" />
                  {t.download}
                </a>
              </Button>
            )}
            {problem ? (
              <p id={reasonId} className="t-body-sm text-status-notdone">
                {t.invalid[problem]}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
