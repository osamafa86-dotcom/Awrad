import { todayIn } from '@awrad/domain';

// The app's single source of "now". Production never sets the override; preview mode (PREVIEW-2) pins
// it to the fixture date so screenshots are stable.
let nowOverride: Date | null = null;

export function setNowOverride(date: Date | null): void {
  nowOverride = date;
}

export function now(): Date {
  return nowOverride ?? new Date();
}

/** "Today" (`YYYY-MM-DD`) in the student's zone (BR-08). */
export function localToday(timezone: string): string {
  return todayIn(timezone, now());
}
