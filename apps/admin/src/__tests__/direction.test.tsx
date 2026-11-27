import { render, screen } from '@testing-library/react';
import { Select, Tabs } from 'radix-ui';
import { describe, expect, it } from 'vitest';

import { RtlProvider } from '@/components/RtlProvider';

// RTL-1: the root layout wraps everything in RtlProvider, so a Radix primitive lays out RTL without its own dir.
describe('RtlProvider', () => {
  it('gives Radix Tabs and Select dir="rtl"', () => {
    render(
      <RtlProvider>
        <Tabs.Root defaultValue="a">
          <Tabs.List aria-label="tabs">
            <Tabs.Trigger value="a">a</Tabs.Trigger>
          </Tabs.List>
        </Tabs.Root>
        <Select.Root>
          <Select.Trigger aria-label="select">
            <Select.Value />
          </Select.Trigger>
        </Select.Root>
      </RtlProvider>,
    );
    expect(screen.getByRole('tablist').closest('[dir]')).toHaveAttribute('dir', 'rtl');
    expect(screen.getByRole('combobox', { name: 'select' })).toHaveAttribute('dir', 'rtl');
  });

  it('without it Radix falls back to LTR (why the provider exists)', () => {
    render(
      <Tabs.Root defaultValue="a">
        <Tabs.List aria-label="tabs">
          <Tabs.Trigger value="a">a</Tabs.Trigger>
        </Tabs.List>
      </Tabs.Root>,
    );
    expect(screen.getByRole('tablist').closest('[dir]')).toHaveAttribute('dir', 'ltr');
  });
});
