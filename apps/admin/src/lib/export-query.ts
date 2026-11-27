// The export's query (F-65, EXP-1): what GET /api/export accepts, the file name it answers with, and the
// period presets the reports page offers. Pure, shared by the route handler and the page.
import { addDays, diffDays } from '@awrad/domain';
import { z } from 'zod';

import { monthBounds, monthOf } from './month';

export const EXPORT_KINDS = ['daily', 'weekly', 'attendance'] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

/** Longest period one file covers, in days counting both ends (a leap year). */
export const MAX_RANGE_DAYS = 366;

/** `YYYY-MM-DD` naming a day that exists (no 2026-02-30). */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  });

export type PeriodProblem = 'dates' | 'order' | 'range';

/** Why `from`–`to` cannot be exported (the reason under a disabled «تنزيل CSV»), or null when it can. */
export function periodProblem(from: string, to: string): PeriodProblem | null {
  if (!isoDate.safeParse(from).success || !isoDate.safeParse(to).success) return 'dates';
  if (from > to) return 'order';
  if (diffDays(from, to) + 1 > MAX_RANGE_DAYS) return 'range';
  return null;
}

export const exportQuerySchema = z
  .object({
    kind: z.enum(EXPORT_KINDS),
    from: isoDate,
    to: isoDate,
    group: z.union([z.literal('all'), z.uuid()]).default('all'),
  })
  .refine((q) => periodProblem(q.from, q.to) === null, { path: ['to'] });

export type ExportQuery = z.output<typeof exportQuerySchema>;

/** The query of a request, or `{ ok: false }` for anything the schema refuses. An empty group means all. */
export function parseExportQuery(params: URLSearchParams): { ok: true; data: ExportQuery } | { ok: false } {
  const result = exportQuerySchema.safeParse({
    kind: params.get('kind') ?? undefined,
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
    group: params.get('group') || undefined,
  });
  return result.success ? { ok: true, data: result.data } : { ok: false };
}

/** `awrad-daily-2026-11-01_2026-11-30.csv` (ASCII only: it also goes in the plain `filename=`). */
export function exportFilename(q: Pick<ExportQuery, 'kind' | 'from' | 'to'>): string {
  return `awrad-${q.kind}-${q.from}_${q.to}.csv`;
}

export interface Period {
  from: string;
  to: string;
}

export const REPORT_PRESETS = ['thisMonth', 'lastMonth', 'last30'] as const;
export type ReportPreset = (typeof REPORT_PRESETS)[number];

/** «هذا الشهر» (whole month), «الشهر الماضي» and «آخر 30 يومًا» (ending today), from the viewer's today. */
export function reportPresets(today: string): Record<ReportPreset, Period> {
  const thisMonth = monthBounds(monthOf(today));
  return {
    thisMonth,
    lastMonth: monthBounds(monthOf(addDays(thisMonth.from, -1))),
    last30: { from: addDays(today, -29), to: today },
  };
}
