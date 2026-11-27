import type { StudentSummary } from '@awrad/supabase-client';

/** No daily logs and no weekly logs in the summary's window. */
export function isEmptySummary(s: StudentSummary): boolean {
  return s.daysLogged === 0 && s.weekly === null;
}
