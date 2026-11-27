'use client';

import { useMemo, useState } from 'react';

import { SearchField } from '@/components/SearchField';
import type { FieldAria } from '@/components/habits/Field';
import { ar } from '@/messages/ar';

/** Case and `_`/spaces do not matter: «new york» finds America/New_York. */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[_\s]+/g, ' ').trim();
}

export interface TimezonePickerProps {
  /** The listbox's id, aria-invalid and aria-describedby (from Field). */
  aria: FieldAria;
  value: string;
  /** In display order (timezoneOptions: the region first). */
  options: readonly string[];
  onChange(zone: string): void;
}

/**
 * An IANA zone: a search field narrowing a native listbox (keyboard and screen-reader friendly with 400+
 * zones). The selected zone stays listed while the search hides it. Zone names are Latin, so the list is LTR.
 */
export function TimezonePicker({ aria, value, options, onChange }: TimezonePickerProps) {
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const q = normalize(query);
    if (!q) return options;
    const matches = options.filter((zone) => normalize(zone).includes(q));
    return matches.includes(value) ? matches : [value, ...matches];
  }, [options, query, value]);

  return (
    <div className="flex flex-col gap-8">
      <SearchField label={ar.settings.groupForm.timezoneSearch} value={query} onChange={(event) => setQuery(event.target.value)} />
      <select
        {...aria}
        size={6}
        dir="ltr"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-line-input bg-surface p-4 t-body-md text-fg-primary outline-none focus:border-2 focus:border-line-focus aria-invalid:border-2 aria-invalid:border-status-notdone [&>option]:min-h-32 [&>option]:rounded-sm [&>option]:px-8 [&>option]:py-4 [&>option:checked]:bg-action-tint"
      >
        {shown.map((zone) => (
          <option key={zone} value={zone}>
            {zone}
          </option>
        ))}
      </select>
    </div>
  );
}
