import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// jsdom has no ResizeObserver; Radix Switch measures its thumb with one.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);
const updateAppSettings = vi.fn();
vi.mock('@/actions/settings', () => ({ updateAppSettings: (...a: unknown[]) => updateAppSettings(...a) }));

import { AppSettingsForm } from '@/components/settings/AppSettingsForm';
import { DEFAULT_SETTINGS } from '@/lib/settings';
import { ar } from '@/messages/ar';

const t = ar.settings.app;

beforeEach(() => {
  vi.resetAllMocks();
});

describe('AppSettingsForm', () => {
  it('shows the current values with their ranges, a one-line explanation each, and «حفظ» last', () => {
    render(<AppSettingsForm settings={{ ...DEFAULT_SETTINGS, backfill_days: 4, excused_counts_as_absent: true }} />);
    const backfill = screen.getByLabelText(t.fields.backfill_days.label);
    expect(backfill).toHaveValue(4);
    expect(backfill).toHaveAttribute('min', '0');
    expect(backfill).toHaveAttribute('max', '14');
    expect(screen.getByLabelText(t.fields.streak_threshold_pct.label)).toHaveValue(100);
    expect(screen.getByLabelText(t.fields.hijri_adjustment_days.label)).toHaveAttribute('min', '-2');
    expect(screen.getByLabelText(t.fields.default_reminder_time.label)).toHaveValue('21:00');
    expect(screen.getByRole('switch', { name: t.fields.excused_counts_as_absent.label })).toBeChecked();
    expect(screen.getByText(t.fields.backfill_days.hint)).toBeInTheDocument();
    expect(backfill).toHaveAccessibleDescription(t.fields.backfill_days.hint);
    const buttons = screen.getAllByRole('button');
    expect(buttons.at(-1)).toHaveAccessibleName(t.save);
  });

  it('shows the per-field error the action returns, tied to its input', async () => {
    updateAppSettings.mockResolvedValue({ ok: false, code: 'INVALID_INPUT', fields: ['backfill_days'] });
    render(<AppSettingsForm settings={DEFAULT_SETTINGS} />);
    const backfill = screen.getByLabelText(t.fields.backfill_days.label);
    await userEvent.clear(backfill);
    await userEvent.type(backfill, '20');
    await userEvent.click(screen.getByRole('button', { name: t.save }));
    expect(await screen.findByText(ar.settings.fieldErrors.backfill_days)).toBeInTheDocument();
    expect(backfill).toHaveAttribute('aria-invalid', 'true');
    expect(backfill).toHaveAccessibleDescription(
      `${t.fields.backfill_days.hint} ${ar.settings.fieldErrors.backfill_days}`,
    );
    // The typed value survives the failed attempt.
    expect(backfill).toHaveValue(20);
    const sent = updateAppSettings.mock.calls[0]![1] as FormData;
    expect(sent.get('backfill_days')).toBe('20');
    expect(sent.get('excused_counts_as_absent')).toBe('false');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('shows the saved notice after a successful save', async () => {
    updateAppSettings.mockResolvedValue({ ok: true });
    render(<AppSettingsForm settings={DEFAULT_SETTINGS} />);
    await userEvent.click(screen.getByRole('switch', { name: t.fields.excused_counts_as_absent.label }));
    await userEvent.click(screen.getByRole('button', { name: t.save }));
    expect(await screen.findByText(t.saved)).toHaveAttribute('role', 'status');
    const sent = updateAppSettings.mock.calls[0]![1] as FormData;
    expect(sent.get('excused_counts_as_absent')).toBe('true');
  });

  it('shows the mapped message for a failed save', async () => {
    updateAppSettings.mockResolvedValue({ ok: false, code: 'SAVE_FAILED' });
    render(<AppSettingsForm settings={DEFAULT_SETTINGS} />);
    await userEvent.click(screen.getByRole('button', { name: t.save }));
    expect(await screen.findByRole('alert')).toHaveTextContent(ar.settings.errors.app.SAVE_FAILED);
  });
});
