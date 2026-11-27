// Tier (b) accounts. The local parts follow the repo's fixtures (p1, sup1, admin @test); the domain has
// a dot because the sign-in form, like the mobile one, only accepts addresses with a domain suffix.
export const TEST_USERS = {
  admin: { email: 'admin@test.example', fullName: 'مدير الاختبار', role: 'admin', inGroup: false, isTracked: false },
  sup1: { email: 'sup1@test.example', fullName: 'مشرف الاختبار', role: 'supervisor', inGroup: true, isTracked: true },
  p1: { email: 'p1@test.example', fullName: 'طالب الاختبار', role: 'student', inGroup: true, isTracked: true },
  // A 40+ character name: the overview must wrap it, never clip it (DESIGN.md §7 rule 9).
  p3: {
    email: 'p3@test.example',
    fullName: 'عبدالرحمن بن محمد بن عبدالله بن إبراهيم آل سعيد',
    role: 'student',
    inGroup: true,
    isTracked: true,
  },
} as const;

export const TEST_GROUP_NAME = 'مجموعة اختبار اللوحة';

/** A group nobody in TEST_USERS supervises: the admin sees it in the overview filter, sup1 does not. */
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
