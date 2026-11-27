'use client';

import { todayIn } from '@awrad/domain';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useId, useMemo, useState, useTransition, type ReactNode } from 'react';

import { saveAttendance } from '@/actions/attendance';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/ui/button';
import {
  attendanceErrorText,
  buildSections,
  countMarks,
  type AttendanceResult,
  type AttendanceStatus,
  type Mark,
  type Member,
  type MemberSection,
  type SessionDetail,
} from '@/lib/attendance';
import { formatClock, formatGregorian, formatHijri } from '@/lib/format';
import type { GroupOption } from '@/lib/students';
import { ar } from '@/messages/ar';

import { AttendanceSegment } from './AttendanceSegment';
import { DeleteSessionDialog } from './DeleteSessionDialog';

const t = ar.attendance;

type Statuses = Record<string, AttendanceStatus | null>;

export interface AttendanceGridProps {
  session: SessionDetail;
  /** The groups whose people the viewer marks (admin: all; supervisor: the supervised ones). */
  groups: GroupOption[];
  /** Their tracked, active people. */
  members: Member[];
  /** The saved marks (they pre-fill the grid; editing later is this same page). */
  marks: Mark[];
  /** Admins: «حذف المجلس». */
  canDelete: boolean;
  /** The viewer's zone, for «آخر حفظ». */
  timezone: string;
  hijriAdjustment?: number;
}

/**
 * a03/a21 — F-62: the session's tracked people in one section per group, each with an
 * AttendanceSegment, «الكل حاضر» per section, and one «حفظ» that sends the rows with a status.
 */
export function AttendanceGrid(props: AttendanceGridProps) {
  const { session, groups, members, marks, canDelete, timezone, hijriAdjustment = 0 } = props;
  const sections = useMemo(() => buildSections(session.groupId, groups, members), [session.groupId, groups, members]);
  const saved = useMemo(() => new Set(marks.map((mark) => mark.userId)), [marks]);
  const [statuses, setStatuses] = useState<Statuses>(() =>
    Object.fromEntries(marks.map((mark) => [mark.userId, mark.status])),
  );
  const [result, setResult] = useState<AttendanceResult | null>(null);
  const [pending, startTransition] = useTransition();

  const rows = sections.flatMap((section) =>
    section.members.flatMap((m) => {
      const status = statuses[m.id];
      return status ? [{ userId: m.id, status }] : [];
    }),
  );
  const counts = countMarks(sections, marks);
  const error = attendanceErrorText(result);

  function set(userId: string, status: AttendanceStatus | null) {
    setResult(null);
    setStatuses((previous) => ({ ...previous, [userId]: status }));
  }

  function allPresent(section: MemberSection) {
    setResult(null);
    setStatuses((previous) => ({
      ...previous,
      ...Object.fromEntries(section.members.map((m) => [m.id, 'present' as const])),
    }));
  }

  function save() {
    startTransition(async () => {
      // On success the action revalidates this page, so `marks` (counts, «آخر حفظ», locks) arrive fresh.
      setResult(await saveAttendance(session.id, rows));
    });
  }

  return (
    <div className="flex flex-col gap-24">
      <header className="flex flex-col gap-16">
        <Link
          href="/attendance"
          className="inline-flex w-fit items-center gap-4 rounded-sm t-label-md text-link outline-none hover:underline focus-visible:ring-2 focus-visible:ring-line-focus"
        >
          {/* «back» points to the start side under RTL (DESIGN.md §7 rule 3). */}
          <ChevronRight aria-hidden="true" className="size-16 ltr:-scale-x-100" />
          {t.detail.back}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-16">
          <div className="flex min-w-0 flex-col gap-4">
            <h1 className="t-display-title break-words text-fg-primary">{session.title ?? t.untitled}</h1>
            <dl className="flex flex-wrap items-center gap-x-16 gap-y-4 t-body-sm text-fg-secondary">
              <Fact label={t.detail.date}>
                {formatHijri(session.date, hijriAdjustment)} · {formatGregorian(session.date)}
              </Fact>
              <Fact label={t.detail.group}>{session.groupName ?? t.allGroups}</Fact>
            </dl>
          </div>
          {canDelete ? <DeleteSessionDialog sessionId={session.id} /> : null}
        </div>
      </header>

      {sections.length === 0 ? (
        <p className="rounded-xl border border-line-subtle bg-surface px-24 py-32 text-center t-body-md text-fg-secondary">
          {t.detail.noSections}
        </p>
      ) : (
        <>
          {sections.map((section) => (
            <Section
              key={section.group.id}
              section={section}
              onAllPresent={() => allPresent(section)}
              disabled={pending}
            >
              {section.members.map((m) => (
                <li
                  key={m.id}
                  className="flex flex-col gap-12 py-12 sm:flex-row sm:items-center sm:justify-between sm:gap-16"
                >
                  <span className="flex min-w-0 items-center gap-12">
                    <Avatar name={m.fullName} />
                    <span className="min-w-0 break-words t-body-strong text-fg-primary">{m.fullName}</span>
                  </span>
                  <AttendanceSegment
                    name={`attendance-${m.id}`}
                    label={m.fullName}
                    value={statuses[m.id] ?? null}
                    onChange={(status) => set(m.id, status)}
                    locked={saved.has(m.id)}
                    disabled={pending}
                  />
                </li>
              ))}
            </Section>
          ))}

          <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-12 rounded-xl border border-line-subtle bg-surface p-16">
            <div className="flex min-w-0 flex-col gap-4" aria-live="polite">
              {error ? (
                <p role="alert" className="t-body-md text-status-notdone">
                  {error}
                </p>
              ) : result?.ok ? (
                <p className="t-body-strong text-status-done">{t.saved}</p>
              ) : null}
              <p className="t-body-sm text-fg-secondary">{t.counts(counts)}</p>
              {counts.lastSavedAt ? (
                <p className="t-caption text-fg-secondary">
                  {t.lastSaved(
                    formatGregorian(todayIn(timezone, new Date(counts.lastSavedAt))),
                    formatClock(counts.lastSavedAt, timezone),
                  )}
                </p>
              ) : null}
            </div>
            <Button size="md" onClick={save} disabled={pending || rows.length === 0} aria-busy={pending}>
              {pending ? t.saving : t.save}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-4">
      <dt>{label}:</dt>
      <dd className="text-fg-primary">{children}</dd>
    </div>
  );
}

function Section({
  section,
  onAllPresent,
  disabled,
  children,
}: {
  section: MemberSection;
  onAllPresent(): void;
  disabled: boolean;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-8 rounded-xl border border-line-subtle bg-surface p-16">
      <div className="flex flex-wrap items-center justify-between gap-12">
        <h2 id={titleId} className="t-display-section text-fg-primary">
          {section.group.name}
        </h2>
        {section.members.length > 0 ? (
          <Button variant="secondary" size="md" onClick={onAllPresent} disabled={disabled}>
            {t.allPresent}
          </Button>
        ) : null}
      </div>
      {section.members.length === 0 ? (
        <p className="t-body-md text-fg-secondary">{t.detail.noMembers}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line-subtle">{children}</ul>
      )}
    </section>
  );
}
