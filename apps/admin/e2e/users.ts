// Tier (b) accounts. The local parts follow the repo's fixtures (p1, sup1, admin @test); the domain has
// a dot because the sign-in form, like the mobile one, only accepts addresses with a domain suffix.
export const TEST_USERS = {
  admin: { email: 'admin@test.example', fullName: 'مدير الاختبار', role: 'admin', inGroup: false, isTracked: false },
  sup1: { email: 'sup1@test.example', fullName: 'مشرف الاختبار', role: 'supervisor', inGroup: true, isTracked: true },
  p1: { email: 'p1@test.example', fullName: 'طالب الاختبار', role: 'student', inGroup: true, isTracked: true },
} as const;

export const TEST_GROUP_NAME = 'مجموعة اختبار اللوحة';
