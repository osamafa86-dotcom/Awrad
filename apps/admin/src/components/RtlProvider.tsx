'use client';

import { Direction } from 'radix-ui';
import type { ReactNode } from 'react';

/**
 * RTL-1: Radix primitives do not read <html dir>; without a direction they lay out (and handle arrow keys)
 * left-to-right. The root layout wraps the app in this so every Tabs, Select, DropdownMenu… is RTL.
 */
export function RtlProvider({ children }: { children: ReactNode }) {
  return <Direction.Provider dir="rtl">{children}</Direction.Provider>;
}
