// Tier (b) accounts. The local parts follow the repo's fixtures (p1, sup1, admin @test); the domain has
// a dot because the sign-in form, like the mobile one, only accepts addresses with a domain suffix.
// `group` is the group the account belongs to ('test' = TEST_GROUP_NAME, 'other' = OTHER_GROUP_NAME); a
// supervisor also supervises their own group (group_supervisors).
export const TEST_USERS = {
  admin: { email: 'admin@test.example', fullName: 'مدير الاختبار', role: 'admin', group: null, isTracked: false },
  sup1: { email: 'sup1@test.example', fullName: 'مشرف الاختبار', role: 'supervisor', group: 'test', isTracked: true },
  p1: { email: 'p1@test.example', fullName: 'طالب الاختبار', role: 'student', group: 'test', isTracked: true },
  // A 40+ character name: the overview must wrap it, never clip it (DESIGN.md §7 rule 9).
  p3: {
    email: 'p3@test.example',
    fullName: 'عبدالرحمن بن محمد بن عبدالله بن إبراهيم آل سعيد',
    role: 'student',
    group: 'test',
    isTracked: true,
  },
  // The other group's supervisor and student (attendance: a supervisor marks only their groups' sections).
  sup2: { email: 'sup2@test.example', fullName: 'مشرف المجموعة الأخرى', role: 'supervisor', group: 'other', isTracked: true },
  p2: { email: 'p2@test.example', fullName: 'طالب المجموعة الأخرى', role: 'student', group: 'other', isTracked: true },
  // A throwaway student with an open account-deletion request: support.spec.ts deletes the account for good,
  // and the seed (or that spec's reset) creates it again when it is missing.
  p4: { email: 'p4@test.example', fullName: 'طالب يطلب الحذف', role: 'student', group: 'test', isTracked: true },
  // Another throwaway student with one daily log: privacy.spec.ts deletes the account for good from its page
  // (the double confirmation) and checks the cascade; resetPermanentDeletionFixture() creates it again.
  p5: { email: 'p5@test.example', fullName: 'طالب للحذف النهائي', role: 'student', group: 'test', isTracked: true },
} as const;

export type TestUserKey = keyof typeof TEST_USERS;

export const TEST_GROUP_NAME = 'مجموعة اختبار اللوحة';

/** The second group, supervised by sup2 only: the admin sees it in the overview filter, sup1 does not. */
export const OTHER_GROUP_NAME = 'مجموعة اختبار أخرى';

/** The test groups' zone (the groups.timezone default); the seeded log dates are days in it. */
export const TEST_TIMEZONE = 'Asia/Riyadh';

/**
 * Daily logs the seed saves through save_log, as days before today in TEST_TIMEZONE:
 * p1 achieved on today−5 and failed on today−6, nothing since (⚠, «منقطعون»); p3 achieved yesterday.
 */
export const SEEDED_LOGS = [
  { user: 'p1', daysAgo: 5, outcome: 'achieved' },
  { user: 'p1', daysAgo: 6, outcome: 'failed' },
  { user: 'p3', daysAgo: 1, outcome: 'achieved' },
] as const;

/**
 * p1's weekly log for the current week (its group's week start, in TEST_TIMEZONE), saved through save_log
 * with every active weekly habit, so support_status is 'open' (BR-10). The seed and support.spec.ts reopen
 * it each time (service role), so a run that marked it handled leaves no trace for the next one.
 */
export const SEEDED_SUPPORT = {
  user: 'p1',
  review: 'مراجعة الأسبوع التجريبية',
  request: 'أحتاج مساعدة في ورد القيام',
} as const;

/** The student whose open deletion request support.spec.ts executes. */
export const DELETION_REQUESTER = 'p4' as const;

/**
 * The student privacy.spec.ts deletes permanently from the student page. The seed saves one daily log for
 * them through save_log (days before today in TEST_TIMEZONE) and marks them present, through set_attendance,
 * in a test-group session of that day with this title (kept apart from attendance.spec.ts's `e2e-مجلس`
 * sessions, which that spec removes), so the spec can see both go.
 */
export const PERMANENT_DELETION = {
  user: 'p5',
  daysAgo: 2,
  outcome: 'achieved',
  sessionTitle: 'مجلس اختبار الحذف النهائي',
} as const;

/** Names of the habits habits.spec.ts creates (and removes); they never belong in a seeded log. */
export const E2E_HABIT_PREFIX = 'e2e-عادة';

/**
 * Habits made by tests: habits.spec.ts's, and the DB tests' (supabase/tests, `test_hab_` slug and name)
 * when they share a local stack. The seed leaves them out of its logs and removes unlogged leftovers.
 */
export const TEST_HABIT_PREFIXES = ['test_hab_', E2E_HABIT_PREFIX] as const;
