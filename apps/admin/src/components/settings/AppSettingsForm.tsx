'use client';

import { startTransition, useActionState, useState } from 'react';

import { updateAppSettings } from '@/actions/settings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  SETTING_RANGES,
  settingsErrorText,
  type AppSettings,
  type IntegerSettingKey,
  type SettingKey,
} from '@/lib/settings';
import { ar } from '@/messages/ar';

const t = ar.settings.app;

const NUMBER_FIELDS: readonly IntegerSettingKey[] = [
  'streak_threshold_pct',
  'backfill_days',
  'weekly_grace_days',
  'hijri_adjustment_days',
];

export interface AppSettingsFormProps {
  /** The values stored now (prefilled). */
  settings: AppSettings;
}

/**
 * a11 «إعدادات النظام»: the six app settings, each with a one-line explanation (they change the app and the
 * dashboard for everyone), «حفظ» last; a saved notice, or each invalid field's error under it.
 */
export function AppSettingsForm({ settings }: AppSettingsFormProps) {
  const [state, action, pending] = useActionState(updateAppSettings, null);
  const error = settingsErrorText(state, 'app');
  const invalid = new Set<SettingKey>(state && !state.ok ? (state.fields ?? []) : []);
  const [numbers, setNumbers] = useState<Record<IntegerSettingKey, string>>({
    streak_threshold_pct: String(settings.streak_threshold_pct),
    backfill_days: String(settings.backfill_days),
    weekly_grace_days: String(settings.weekly_grace_days),
    hijri_adjustment_days: String(settings.hijri_adjustment_days),
  });
  const [excused, setExcused] = useState(settings.excused_counts_as_absent);
  const [reminder, setReminder] = useState(settings.default_reminder_time);
  // «حُفظت» describes the last save only: it goes once a value changes again.
  const [edited, setEdited] = useState(false);

  /** The hint, and the error when invalid, both describe the control. */
  const describe = (field: SettingKey) => ({
    'aria-describedby': invalid.has(field) ? `${field}-hint ${field}-error` : `${field}-hint`,
    'aria-invalid': invalid.has(field) ? true : undefined,
  });
  const notes = (field: SettingKey) => (
    <>
      <p id={`${field}-hint`} className="t-body-sm text-fg-secondary">
        {t.fields[field].hint}
      </p>
      {invalid.has(field) ? (
        <p id={`${field}-error`} className="t-body-sm text-status-notdone">
          {ar.settings.fieldErrors[field]}
        </p>
      ) : null}
    </>
  );

  return (
    <form
      // why: submitted by hand, not through `action=`: React resets a form after its action, and Radix Switch
      // answers a reset by calling onCheckedChange with its first value, which would undo the saved toggle.
      onSubmit={(event) => {
        event.preventDefault();
        setEdited(false);
        const data = new FormData(event.currentTarget);
        startTransition(() => action(data));
      }}
      noValidate
      className="flex flex-col gap-20 rounded-xl border border-line-subtle bg-surface p-24">
      <div className="grid gap-20 md:grid-cols-2">
        {NUMBER_FIELDS.map((field) => (
          <div key={field} className="flex flex-col gap-8">
            <Label htmlFor={field}>{t.fields[field].label}</Label>
            <Input
              id={field}
              name={field}
              type="number"
              inputMode="numeric"
              step={1}
              min={SETTING_RANGES[field].min}
              max={SETTING_RANGES[field].max}
              className="tabular-nums"
              value={numbers[field]}
              onChange={(event) => {
                setEdited(true);
                setNumbers((v) => ({ ...v, [field]: event.target.value }));
              }}
              {...describe(field)}
            />
            {notes(field)}
          </div>
        ))}

        <div className="flex flex-col gap-8">
          <Label htmlFor="default_reminder_time">{t.fields.default_reminder_time.label}</Label>
          <Input
            id="default_reminder_time"
            name="default_reminder_time"
            type="time"
            className="tabular-nums"
            value={reminder}
            onChange={(event) => {
              setEdited(true);
              setReminder(event.target.value);
            }}
            {...describe('default_reminder_time')}
          />
          {notes('default_reminder_time')}
        </div>

        <div className="flex flex-col gap-8">
          <div className="flex min-h-44 items-center gap-12">
            <Switch
              id="excused_counts_as_absent"
              checked={excused}
              onCheckedChange={(checked) => {
                setEdited(true);
                setExcused(checked);
              }}
              {...describe('excused_counts_as_absent')}
            />
            <input type="hidden" name="excused_counts_as_absent" value={excused ? 'true' : 'false'} />
            <Label htmlFor="excused_counts_as_absent">{t.fields.excused_counts_as_absent.label}</Label>
          </div>
          {notes('excused_counts_as_absent')}
        </div>
      </div>

      {error && !(state && !state.ok && state.code === 'INVALID_INPUT') ? (
        <p role="alert" className="t-body-md text-status-notdone">
          {error}
        </p>
      ) : null}
      {/* Always rendered, so screen readers announce the notice when it appears. */}
      <p role="status" className="t-body-md text-status-done empty:hidden">
        {state?.ok && !edited ? t.saved : null}
      </p>

      <div className="flex flex-wrap justify-end gap-8">
        <Button type="submit" size="md" disabled={pending} aria-busy={pending}>
          {pending ? t.saving : t.save}
        </Button>
      </div>
    </form>
  );
}
