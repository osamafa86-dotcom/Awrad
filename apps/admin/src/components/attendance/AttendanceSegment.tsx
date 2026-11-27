'use client';

import { Check } from 'lucide-react';

import type { AttendanceStatus } from '@/lib/attendance';
import { cn } from '@/lib/utils';
import { ar } from '@/messages/ar';

const t = ar.attendance.status;

type Option = AttendanceStatus | 'unmarked';
const OPTIONS: readonly Option[] = ['unmarked', 'present', 'absent', 'excused'];

/** The picked segment's colours; the check mark and the word carry the state too (never colour alone). */
const CHECKED: Record<Option, string> = {
  unmarked: 'bg-surface text-fg-primary border-line-input',
  present: 'bg-action text-on-primary border-action',
  absent: 'bg-status-notdone text-on-primary border-status-notdone',
  excused: 'bg-status-neutral-tint text-fg-primary border-status-neutral',
};

export interface AttendanceSegmentProps {
  /** The radio group's form name (unique per row). */
  name: string;
  /** The person's name: the group's accessible name. */
  label: string;
  value: AttendanceStatus | null;
  onChange(value: AttendanceStatus | null): void;
  /** A saved mark can be changed but not removed in this version: «لم يُسجَّل» is then disabled. */
  locked?: boolean;
  disabled?: boolean;
}

/**
 * DESIGN.md §6 `AttendanceSegment` (لم يُسجَّل · حاضر · غائب · معذور): four native radios, so arrow keys
 * and screen readers work as a radiogroup. Each segment is a ≥44px target; on the phone they sit 2×2
 * under the name, from `sm` up in one row.
 */
export function AttendanceSegment({ name, label, value, onChange, locked = false, disabled = false }: AttendanceSegmentProps) {
  const current: Option = value ?? 'unmarked';
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid w-full grid-cols-2 gap-4 rounded-lg bg-sunken p-4 sm:flex sm:w-auto"
    >
      {OPTIONS.map((option) => {
        const checked = current === option;
        const off = disabled || (option === 'unmarked' && locked && value !== null);
        return (
          <label
            key={option}
            className={cn(
              'relative flex min-h-44 flex-1 cursor-pointer items-center justify-center gap-4 rounded-md border px-12',
              't-label-md whitespace-nowrap transition-colors',
              'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-line-focus',
              checked ? CHECKED[option] : 'border-transparent text-fg-secondary hover:bg-surface',
              off && 'cursor-not-allowed opacity-50 hover:bg-transparent',
            )}
          >
            <input
              type="radio"
              name={name}
              value={option}
              checked={checked}
              disabled={off}
              onChange={() => onChange(option === 'unmarked' ? null : option)}
              // The input covers its segment (invisible), so a click or a tap lands on the radio itself.
              className="absolute inset-0 m-0 size-full cursor-pointer appearance-none opacity-0 disabled:cursor-not-allowed"
            />
            {checked && option !== 'unmarked' ? <Check aria-hidden="true" className="size-16" /> : null}
            {t[option]}
          </label>
        );
      })}
    </div>
  );
}
