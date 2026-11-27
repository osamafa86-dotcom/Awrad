// Thin adapter: the fake Supabase client and the seeded habit fixtures live in src/preview (PREVIEW-2),
// shared with the dev-only preview mode. The jest suites keep their own signed-in test student.
export { fakeDb, fakeSupabase, resetFakeDb, type FakeLogRow } from '../../src/preview/fakeSupabase';
export {
  adhkar,
  dailyHabits,
  fiqh,
  lessonPrep,
  memorization,
  qiyam,
  quran,
  sahihayn,
  tafsir,
  tazkiyah,
  tristateHabits,
  weeklyHabits,
  weeklyTristateHabits,
} from '../../src/preview/fixtures';

export const USER_ID = 'u-1';
export const fakeProfile = {
  id: USER_ID,
  full_name: 'طالب تجريبي',
  role: 'student',
  group_id: 'g-1',
  timezone: null,
  is_active: true,
  is_tracked: true,
};
