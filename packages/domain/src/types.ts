export type Frequency = 'daily' | 'weekly';
export type HabitKind = 'tristate' | 'checklist';
export type EntryStatus = 'done' | 'not_done' | 'not_required';
export type DayState = 'achieved' | 'failed' | 'neutral' | 'missing';

export interface HabitItemDef {
  id: string;
  name: string;
  sortOrder: number;
  activeFrom: string;
  activeTo: string | null;
}

export interface HabitDef {
  id: string;
  slug: string;
  name: string;
  targetText: string | null;
  frequency: Frequency;
  kind: HabitKind;
  sortOrder: number;
  activeFrom: string;
  activeTo: string | null;
  items: HabitItemDef[];
}

export interface EntryInput {
  habitId: string;
  status: EntryStatus;
  checkedItemIds?: string[];
}

export const RPC_ERROR_CODES = [
  'FORBIDDEN',
  'FUTURE_DATE',
  'DATE_OUT_OF_WINDOW',
  'INVALID_WEEK_START',
  'FREQUENCY_MISMATCH',
  'INACTIVE_HABIT',
  'INVALID_ITEM',
  'INACTIVE_USER',
  'MISSING_ENTRY',
] as const;

export type RpcErrorCode = (typeof RPC_ERROR_CODES)[number];
