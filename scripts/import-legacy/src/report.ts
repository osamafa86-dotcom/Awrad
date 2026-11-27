// The import report: report.json (everything, for the team to inspect) and the Arabic summary
// printed on the terminal. All user-facing strings of the CLI live here.
import type { ImportPlan, RowErrorCode, Source } from './map.ts';
import type { ExecuteResult } from './run.ts';

export interface ImportReport {
  generatedAt: string;
  mode: 'dry-run' | 'execute';
  files: Record<string, string>;
  counts: {
    dailyLogs: number;
    weeklyLogs: number;
    attendanceMarks: number;
    students: number;
    accountsToCreate: number;
    duplicatesResolved: number;
    unmappedNames: number;
    invalidDates: number;
    rowErrors: number;
  };
  students: {
    name: string;
    daily: number;
    weekly: number;
    attendance: number;
    from: string;
    to: string;
  }[];
  toImport: { source: Source; row: number; name: string; periodStart: string }[];
  duplicatesResolved: ImportPlan['duplicatesResolved'];
  unmappedNames: ImportPlan['unmappedNames'];
  invalidDates: ImportPlan['invalidDates'];
  rowErrors: ImportPlan['rowErrors'];
  accountsToCreate: ImportPlan['accountsToCreate'];
  ignoredColumns: ImportPlan['ignoredColumns'];
  result: ExecuteResult;
}

export const messages = {
  source: { daily: 'اليومي', weekly: 'الأسبوعي', attendance: 'الحضور', account: 'الحسابات' },
  rowError: {
    INACTIVE_HABIT: 'عادة غير نشطة في ذلك التاريخ (أنشئ العادة المؤرشفة قبل الاستيراد)',
    INVALID_ITEM: 'بند غير معروف في القائمة',
    INVALID_VALUE: 'قيمة غير مفهومة',
  } satisfies Record<RowErrorCode, string>,
  noName: '(بلا اسم)',
};

export function buildReport(
  plan: ImportPlan,
  result: ExecuteResult,
  meta: { files: Record<string, string>; generatedAt?: string },
): ImportReport {
  const students = new Map<string, ImportReport['students'][number]>();
  const touch = (name: string, date: string) => {
    const s = students.get(name) ?? {
      name,
      daily: 0,
      weekly: 0,
      attendance: 0,
      from: date,
      to: date,
    };
    if (date < s.from) s.from = date;
    if (date > s.to) s.to = date;
    students.set(name, s);
    return s;
  };
  for (const log of plan.toImport) touch(log.name, log.periodStart)[log.period] += 1;
  for (const mark of plan.attendance) touch(mark.name, mark.date).attendance += 1;

  return {
    generatedAt: meta.generatedAt ?? new Date().toISOString(),
    mode: result.dryRun ? 'dry-run' : 'execute',
    files: meta.files,
    counts: {
      dailyLogs: plan.toImport.filter((l) => l.period === 'daily').length,
      weeklyLogs: plan.toImport.filter((l) => l.period === 'weekly').length,
      attendanceMarks: plan.attendance.length,
      students: students.size,
      accountsToCreate: plan.accountsToCreate.length,
      duplicatesResolved: plan.duplicatesResolved.length,
      unmappedNames: plan.unmappedNames.length,
      invalidDates: plan.invalidDates.length,
      rowErrors: plan.rowErrors.length,
    },
    students: [...students.values()],
    toImport: plan.toImport.map(({ source, row, name, periodStart }) => ({
      source,
      row,
      name,
      periodStart,
    })),
    duplicatesResolved: plan.duplicatesResolved,
    unmappedNames: plan.unmappedNames,
    invalidDates: plan.invalidDates,
    rowErrors: plan.rowErrors,
    accountsToCreate: plan.accountsToCreate,
    ignoredColumns: plan.ignoredColumns,
    result,
  };
}

const where = (source: Source | 'account', row: number) =>
  row > 0 ? `${messages.source[source]} صفّ ${row}` : messages.source[source];
const nameOf = (name: string) => name || messages.noName;

/** The Arabic summary printed after a run. */
export function formatSummary(report: ImportReport, reportPath = 'report.json'): string {
  const { counts, result } = report;
  const planned = report.mode === 'dry-run' ? 'ستُستورد' : 'في الخطة';
  const lines: string[] = [
    report.mode === 'dry-run'
      ? 'معاينة الاستيراد — لم يُكتب شيء في قاعدة البيانات'
      : 'تنفيذ الاستيراد',
    '',
    `سجلّات ${planned}: ${counts.dailyLogs} يومي، ${counts.weeklyLogs} أسبوعي؛ علامات حضور: ${counts.attendanceMarks}`,
    `الطلاب: ${counts.students}؛ حسابات معطَّلة ${report.mode === 'dry-run' ? 'ستُنشأ' : 'مطلوبة'}: ${counts.accountsToCreate}`,
  ];
  for (const account of report.accountsToCreate) lines.push(`  • ${account.name}`);

  lines.push(`ردود مكرّرة حُسمت بالأحدث: ${counts.duplicatesResolved}`);
  for (const d of report.duplicatesResolved) {
    lines.push(
      `  • ${where(d.source, d.row)}: ${nameOf(d.name)} ${d.periodStart} ← اعتُمد الصفّ ${d.keptRow}`,
    );
  }

  lines.push(`أسماء غير مطابقة (لن تُستورد): ${counts.unmappedNames}`);
  for (const u of report.unmappedNames) {
    const hint =
      u.suggestions.length > 0
        ? ` — هل هو: ${u.suggestions.map((s) => `${s.fullName} (${s.profileId})`).join('، ')}؟`
        : '';
    lines.push(`  • ${nameOf(u.name)} (${u.rows} صفّ)${hint}`);
  }

  lines.push(`تواريخ غير صالحة: ${counts.invalidDates}`);
  for (const d of report.invalidDates) {
    lines.push(
      `  • ${d.row > 1 ? where(d.source, d.row) : `عنوان عمود في ${messages.source[d.source]}`}: ${nameOf(d.name)} «${d.value}»`,
    );
  }

  lines.push(`صفوف ستُرفض: ${counts.rowErrors}`);
  for (const e of report.rowErrors) {
    lines.push(
      `  • ${where(e.source, e.row)}: ${nameOf(e.name)} ${e.date} «${e.column}» = «${e.value}» — ${messages.rowError[e.code]}`,
    );
  }

  if (report.ignoredColumns.length > 0) {
    const list = report.ignoredColumns.map((c) => `«${c.header}» (${messages.source[c.source]})`);
    lines.push(`أعمدة بلا ربط (تُتجاهل): ${list.join('، ')}`);
  }

  lines.push('');
  if (result.dryRun) {
    lines.push('للتنفيذ أعد التشغيل نفسه مع --execute');
  } else {
    lines.push(`حُفظ: ${result.logsSaved} سجلًّا و${result.attendanceSaved} علامة حضور`);
    lines.push(
      `حسابات أُنشئت: ${result.accountsCreated.length}؛ أُعيد استعمالها: ${result.accountsReused.length}`,
    );
    for (const a of result.accountsCreated) lines.push(`  • ${a.name} ← ${a.email}`);
    lines.push(`تاريخ الانضمام عُدِّل لـ ${result.joinedAtUpdated} طالب`);
    lines.push(`إخفاقات: ${result.failures.length}`);
    for (const f of result.failures)
      lines.push(`  • ${where(f.source, f.row)}: ${nameOf(f.name)} — ${f.code}`);
  }
  lines.push(`التقرير الكامل: ${reportPath}`);
  return lines.join('\n');
}
