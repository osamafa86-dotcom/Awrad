# خطة تنفيذ نظام متابعة الأوراد — مفاتيح العلوم

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Read the spec (`01-design-spec.md`) and the agents guide (`03-agents-guide.md`) before any task.

> **لوكلاء البرمجة:** نفّذوا هذه الخطة مهمةً مهمةً، كل مهمة في سياق جديد، ومراجع مستقل بعد كل مهمة. اقرأوا المواصفة `01-design-spec.md` ودليل الوكلاء `03-agents-guide.md` قبل أي مهمة. الخانات `- [ ]` للمتابعة.

**الهدف:** بناء موقع وتطبيق جوّال يحلّان محلّ روابط Google الثلاثة لمتابعة الأوراد اليومية والأسبوعية، مع لوحة للشيخ والمشرف، وحساب تلقائي للسلاسل والنسب، وخصوصية مفروضة في قاعدة البيانات.

**المعمارية:** Monorepo بلغة TypeScript. تطبيق الطالب بـ Expo (iOS/Android/ويب من كود واحد)، لوحة الإدارة بـ Next.js، والخلفية Supabase (PostgreSQL + RLS + دوال RPC + Edge Functions + pg_cron). قاعدة البيانات مصدر الحقيقة للتجميع (السلاسل والنسب)، وحزمة `domain` مشتركة تحمل الأنواع والقواعد للعرض الفوري، وتُختبر الاثنتان على fixtures مشتركة.

**التقنيات:** TypeScript (strict) · pnpm + Turborepo · Expo SDK ≥ 54 + Expo Router + NativeWind · Next.js ≥ 15 + Tailwind + shadcn/ui + TanStack Table · Supabase (Postgres 15+, Auth Email OTP, RLS, Edge Functions/Deno, pg_cron, pg_net) · zod · `@umalqura/core` · `date-fns` + `@date-fns/tz` · Vitest · React Native Testing Library · Playwright · Expo Push · Resend (SMTP).

**المواصفة:** `01-design-spec.md` — هذه الخطة تستند إليها؛ أرقام `F-xx` و`BR-xx` و`D-xx` تشير إليها.

---

## القيود العامة (تنطبق على كل مهمة)

- Node ≥ 22 LTS (`.nvmrc`)، TypeScript ≥ 5.6 بوضع `strict: true`، لا `any` صريح إلا بتعليق مبرَّر.
- Expo SDK ≥ 54، Next.js ≥ 15، React ≥ 19، PostgreSQL 15+؛ تثبيت الإصدارات في `package.json`.
- **لا اسم عادة ولا بند في الكود**؛ العادات بيانات (`habits`, `habit_items`) تُقرأ من قاعدة البيانات. الاستثناء الوحيد: `supabase/seed.sql` وملفات fixtures الاختبار.
- **كل كتابة في `logs`/`log_entries`/`log_entry_items` عبر `save_log()` فقط**؛ لا سياسات insert/update مباشرة لهذه الجداول.
- RLS مفعَّل على **كل** جدول في مخطّط `public`؛ أي جدول جديد يأتي مع سياساته واختبارها في نفس المهمة.
- التواريخ في الحزمة المشتركة والـ RPC نصوص `YYYY-MM-DD` (نوع `date` في SQL)؛ لا `Date` في حدود الواجهات.
- RTL: خصائص منطقية فقط (`marginStart/End`, `paddingStart/End`, `ms-/me-/ps-/pe-/start-/end-`)؛ قاعدة ESLint تمنع `left/right/marginLeft/marginRight/paddingLeft/paddingRight/textAlign: 'left'|'right'`.
- نصوص الواجهة بالعربية الفصحى المبسّطة، في ملف رسائل واحد لكل تطبيق (`messages/ar.ts`) لا متناثرة في المكوّنات.
- **المرجع البصري ملزِم** (المواصفة §11.0): الألوان والمسافات والزوايا والمقاسات من `@awrad/design-tokens` (نسخة حرفية من تسليم التصميم) لا قيم مباشرة في المكوّنات؛ أسماء المكوّنات كما في Figma؛ الذهب للإتمام وحده؛ العدّادات بلا مسافات (`10/13`)؛ حالات اليوم الأربع تُميَّز بالشكل؛ لا `numberOfLines={1}` على عنوان أو اسم؛ حالات التحميل والفراغ غير المرسومة تُصمَّم بالرموز نفسها وتُراجَع في PR.
- الافتراضيات (من المواصفة): `streak_threshold_pct=100`, `backfill_days=2`, `weekly_grace_days=3`, `excused_counts_as_absent=false`, `hijri_adjustment_days=0`, `default_reminder_time="21:00"`, `groups.week_starts_on=0` (الأحد), `groups.timezone='Asia/Riyadh'`.
- أخطاء الـ RPC تُرفع بـ `raise exception` ورسالة رمزية ثابتة من القائمة: `FORBIDDEN`, `FUTURE_DATE`, `DATE_OUT_OF_WINDOW`, `INVALID_WEEK_START`, `FREQUENCY_MISMATCH`, `INACTIVE_HABIT`, `INVALID_ITEM`, `INACTIVE_USER`, `MISSING_ENTRY`؛ الواجهة تترجمها إلى عربية في `messages/ar.ts`.
- مفتاح `service_role` في أسرار Edge Functions و CI فقط؛ لا يظهر في أي تطبيق أو ملف ملتزَم.
- كل مهمة تنتهي بـ: `pnpm lint && pnpm typecheck && pnpm test` خضراء + commit برسالة Conventional Commits (`feat:`, `fix:`, `test:`, `chore:`, `db:`).

## محاور المراجعة (Review Focus)

حالات تُسقط المستخدم ولا يغطّيها نصّ المواصفة مباشرة؛ لكلٍّ منها اختبار مُسنَد إلى المهمة المالكة:

1. **الحفظ قرب منتصف الليل عبر المناطق الزمنية:** العميل في UTC يرى يومًا مختلفًا عن يوم الطالب المحلي؛ يجب أن يُقبل التاريخ المحلي ويُرفض المستقبلي بحساب الخادم لا العميل. → اختبار في **T1.6** (`save_log` مع `local_today`).
2. **قائمة اختيار جزئية مع حالة متناقضة من العميل:** العميل يرسل `status: done` و 10 بنود من 13؛ الخادم يجب أن يشتقّ الحالة من البنود ويتجاهل حالة العميل (إلا `not_required`). → **T1.6**.
3. **يوم كل عاداته `not_required`:** يجب أن يكون `neutral` ولا يقطع السلسلة ولا يُحسب فيها. → **T1.7** و **T1.8**.
4. **مشرف يستعلم عن طالب من مجموعة أخرى:** صفر صفوف، لا خطأ، في كل الجداول الشخصية وفي `get_student_summary`. → **T1.5** و **T1.7**.
5. **عادة مؤرشفة في منتصف الفترة:** حفظ سجلّ بتاريخ بعد `active_to` يُرفض؛ عرض سجلّ قديم يُظهر العادة القديمة باسمها؛ يوم قديم يُحسب مقابل العادات النشطة في تاريخه. → **T1.2**, **T1.6**, **T1.7**.
6. **تصدير CSV بعربية إلى Excel:** يجب أن يبدأ الملف بعلامة BOM (`﻿`) وإلا ظهرت الحروف مشوَّهة. → **T3.7**.
7. **ضغط مزدوج على «حفظ»:** طلبان متزامنان لنفس اليوم ينتجان صفًّا واحدًا. → **T1.6**.
8. **سجلّ ناقص:** حفظ بلا مدخل لعادة نشطة يُرفض بـ `MISSING_ENTRY`؛ قائمة بلا بنود تُحفظ `not_done` ولا تُسقَط. → **T1.6**.
9. **مجلس مشترك ومشرف:** مشرف يُعلّم حضور طالب من مجموعة أخرى في مجلس مشترك → `FORBIDDEN`؛ ونقل طالب بين المجموعات لا يُغيّر نسبة حضوره. → **T1.4**, **T1.7**.
10. **تكبير خط النظام 150% وأسماء طويلة:** لا نص مقصوص في رأس اليوم ولا في بطاقات الملخّص ولا في شبكة اللوحة؛ العناوين تلتفّ إلى سطرين. → **T2.8**, **T3.3**.

---

## خريطة الملفات

```
awrad/
├── .nvmrc  .gitignore  package.json  pnpm-workspace.yaml  turbo.json  AGENTS.md  README.md
├── .github/workflows/ci.yml
├── packages/
│   ├── config/                      # tsconfig.base.json, eslint.config.js, prettier.config.js
│   ├── domain/                      # @awrad/domain
│   │   ├── src/{types,schemas,dates,hijri,dayStatus,streaks,messages,index}.ts
│   │   ├── src/__tests__/*.test.ts
│   │   └── fixtures/{day-status.json,streaks.json,summary.json}   # مشتركة مع اختبارات SQL
│   ├── supabase-client/             # @awrad/supabase-client
│   │   └── src/{database.types.ts (مولَّد), client.ts, rpc.ts, index.ts}
│   └── design-tokens/               # @awrad/design-tokens: tokens.json · tokens.css · theme.ts (من تسليم التصميم)
├── supabase/
│   ├── config.toml  seed.sql
│   ├── migrations/00{01..10}_*.sql
│   ├── functions/{invite-user,send-reminders}/index.ts
│   └── tests/{helpers.ts, vitest.config.ts, 000x_*.test.ts}
├── apps/
│   ├── mobile/                      # Expo
│   │   ├── app.json  app/_layout.tsx  app/(auth)/{login,verify}.tsx
│   │   ├── app/(tabs)/{_layout,today,weekly,summary,history,settings}.tsx
│   │   ├── app/log/[period]/[date].tsx
│   │   ├── src/{components,hooks,lib,messages}/
│   │   └── __tests__/
│   └── admin/                       # Next.js
│       ├── app/{layout,page}.tsx  middleware.ts
│       ├── app/(public)/privacy/page.tsx
│       ├── app/(dash)/{students,attendance,support,habits,reports,settings}/...
│       ├── app/api/export/route.ts
│       ├── src/{components,lib,messages}/
│       └── e2e/*.spec.ts            # Playwright
├── scripts/import-legacy/           # src/{parse,map,run}.ts, fixtures/*.csv, mapping.example.json
└── docs/                            # هذه الوثائق + design/DESIGN.md + admin-manual.md, student-guide.md, runbook.md
```

---

## المرحلة 0 — التأسيس

### Task 0.1: هيكل الـ Monorepo والأدوات و CI

**الملفات:**
- إنشاء: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.nvmrc`, `.gitignore`, `README.md`, `AGENTS.md` (نسخة من `docs/03-agents-guide.md`)
- إنشاء: `packages/config/{package.json,tsconfig.base.json,eslint.config.js,prettier.config.js}`
- إنشاء: `.github/workflows/ci.yml`

**الواجهات:**
- يُنتج: سكربتات جذرية `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format` تمرّ عبر Turborepo على كل الحزم؛ إعداد ESLint مشترك يحوي قاعدة RTL (`no-restricted-syntax` على الخصائص الفيزيائية).

- [ ] **الخطوة 1:** `git init`، `.nvmrc` = `22`، `pnpm init`، إضافة `turbo` و`typescript` و`eslint` و`prettier` و`vitest` كتبعيات تطوير جذرية.
- [ ] **الخطوة 2:** `pnpm-workspace.yaml` يشمل `apps/*`, `packages/*`, `supabase`, `scripts/*`.
- [ ] **الخطوة 3:** `packages/config/eslint.config.js` يحوي قاعدة `no-restricted-syntax` ترفض الخصائص `left`, `right`, `marginLeft`, `marginRight`, `paddingLeft`, `paddingRight`, `borderLeft*`, `borderRight*` وقيم `textAlign: 'left' | 'right'` في كائنات الأنماط وفي أصناف Tailwind (`ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`, `text-left`, `text-right`) — رسالة الخطأ: `استخدم الخصائص المنطقية (start/end) بدل left/right`.
- [ ] **الخطوة 4:** `ci.yml`: على `pull_request` و`push` إلى `main`: checkout → pnpm setup → `pnpm install --frozen-lockfile` → `pnpm lint` → `pnpm typecheck` → `pnpm test`. (مهمة قاعدة البيانات تُضاف في T1.1.)
- [ ] **الخطوة 5:** تحقّق: `pnpm turbo run lint typecheck test` تنجح على مستودع بلا حزم (مخرجات: `No tasks were executed` أو نجاح فارغ).
- [ ] **الخطوة 6:** commit: `chore: scaffold monorepo with turborepo, shared config and CI`

### Task 0.2: Supabase محلي وبيئة التطوير

**الملفات:**
- إنشاء: `supabase/config.toml` (عبر `supabase init`), `.env.example`, `docs/dev-setup.md`
- تعديل: `package.json` (سكربتات `db:start`, `db:stop`, `db:reset`, `db:types`)

**الواجهات:**
- يُنتج: `pnpm db:reset` = `supabase db reset` (يطبّق الترحيلات ثم `seed.sql`)؛ `pnpm db:types` = `supabase gen types typescript --local > packages/supabase-client/src/database.types.ts`؛ متغيّرات `.env.example`: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `RESEND_API_KEY`.

- [ ] **الخطوة 1:** `supabase init` ثم `supabase start`؛ في `config.toml`: تفعيل `[auth.email] enable_signup = false`, `otp_length = 6`, `otp_expiry = 600`.
- [ ] **الخطوة 2:** كتابة `.env.example` و`docs/dev-setup.md` (خطوات التشغيل المحلي بالعربية: Docker، `pnpm db:start`، `pnpm db:reset`).
- [ ] **الخطوة 3:** تحقّق: `supabase status` يعرض `API URL` و`DB URL`؛ `pnpm db:reset` تنجح بلا ترحيلات.
- [ ] **الخطوة 4:** commit: `chore: add local supabase setup and env template`

### Task 0.3: حزمة رموز التصميم `@awrad/design-tokens` ووثيقة التصميم

**الملفات:**
- إنشاء: `packages/design-tokens/{package.json,tsconfig.json}`, `packages/design-tokens/src/{tokens.json,tokens.css,theme.ts,index.ts}`, `packages/design-tokens/src/__tests__/tokens.test.ts`, `docs/design/DESIGN.md`

**الواجهات:**
- يُنتج: نسخة **حرفية** من ملفات التسليم (`design/tokens.json`, `design/tokens.css`, `design/theme.ts` من مجلد الخطة) دون تعديل؛ `index.ts` يُصدّر `lightColors`, `darkColors`, `space`, `radius`, `type` من `theme.ts` و`tokensJson` من الملف المصدري؛ `tokens.css` يُستورد في جذر Next.js. أي تغيير لاحق يأتي من Figma ثم يُعاد التوليد، ولا يُحرَّر يدويًا.

- [ ] **الخطوة 1: الاختبارات الفاشلة:** `theme.ts` و`tokens.json` متطابقان في القيم (كل مفتاح `color/*` في JSON له نظير camelCase في `lightColors`/`darkColors` بالقيمة نفسها)؛ `tokens.css` يحوي `--bg-canvas` و`--gold-gilt` و`--status-done-hatch` في الكتل الثلاث (`:root`، `[data-theme="dark"]`، `prefers-color-scheme: dark`)؛ `type.displayHijri.fontFamily === 'MarkaziText-Bold'`.
- [ ] **الخطوة 2:** تشغيل → فشل. **الخطوة 3:** انسخ الملفات واكتب `index.ts`. **الخطوة 4:** تشغيل → نجاح.
- [ ] **الخطوة 5:** commit: `chore(design-tokens): add design tokens and handoff document from figma`

---

## المرحلة 1 — النواة: قاعدة البيانات والمنطق المشترك

> تُنفَّذ بالترتيب. اختبارات قاعدة البيانات تعمل بـ Vitest ضدّ Supabase المحلي عبر `pg` (كـ superuser للتحقّق من البنية) و`@supabase/supabase-js` (كمستخدمين مختلفين للتحقّق من RLS).

### Task 1.1: الترحيل 0001 — الأنواع، المجموعات، الملفات، الإعدادات، التدقيق (F-81) + مُشغِّل إنشاء الملف

**الملفات:**
- إنشاء: `supabase/migrations/0001_core.sql`
- إنشاء: `supabase/tests/helpers.ts`, `supabase/tests/vitest.config.ts`, `supabase/package.json`, `supabase/tests/0001_core.test.ts`
- تعديل: `.github/workflows/ci.yml` (مهمة `db-tests`: `supabase start` → `supabase db reset` → `pnpm --filter supabase test`)

**الواجهات:**
- يُنتج: الأنواع المعدودة الستة، الجداول `groups`, `group_supervisors`, `profiles`, `invitations`, `app_settings`, `audit_log` كما في المواصفة §10.2 (بما فيها `profiles.weekly_reminder`, `profiles.is_tracked`, `profiles.joined_at`, `invitations.joined_at`, `invitations.is_tracked`)؛ الدوال `current_user_role() returns user_role`, `is_admin() returns boolean`, `is_supervisor_of(p_group uuid) returns boolean`, `setting_int(p_key text) returns int`, `setting_bool(p_key text) returns boolean`, `setting_text(p_key text) returns text`؛ المُشغِّل `handle_new_user()` على `auth.users` بعد الإدراج.
- `helpers.ts` يُصدِّر: `adminDb(): pg.Client`, `createTestUser(opts: {email, password, fullName, role, groupId?, isTracked?, supervises?: string[]}): Promise<{id}>` (عبر `auth.admin.createUser` + دعوة مسبقة), `clientAs(email, password): Promise<SupabaseClient>`, `resetTestData()`.

- [ ] **الخطوة 1: اكتب الاختبارات الفاشلة** في `0001_core.test.ts`:
```ts
test('app_settings seeded with six defaults', async () => {
  const rows = await db.query('select key, value from app_settings order by key');
  expect(Object.fromEntries(rows.rows.map(r => [r.key, r.value]))).toEqual({
    backfill_days: 2, default_reminder_time: '21:00', excused_counts_as_absent: false,
    hijri_adjustment_days: 0, streak_threshold_pct: 100, weekly_grace_days: 3,
  });
});
test('groups.week_starts_on rejects 7', ...);            // توقع خطأ check constraint
test('new auth user with matching invitation gets profile with role/group and invitation.accepted_at set', ...);
test('new auth user without invitation gets inactive student profile', ...); // is_active=false
test('non-admin cannot change own role/group_id/full_name/is_active/is_tracked/joined_at', ...); // المُشغِّل protect_profile_fields
test('new profile gets reminder_time = default_reminder_time (21:00) and joined_at/is_tracked from invitation', ...);
test('admin without invitation defaults is_tracked=false; student defaults true', ...);
```
- [ ] **الخطوة 2:** `pnpm --filter supabase test` → فشل (الجداول غير موجودة).
- [ ] **الخطوة 3:** اكتب `0001_core.sql`: الأنواع والجداول (§10.2)، إدراج الافتراضيات الستة في `app_settings`، الدوال المساعدة (`security definer`, `stable`)، `handle_new_user()` (يبحث في `invitations` بالبريد غير حساس لحالة الأحرف؛ عند عدم وجودها ينشئ ملفًا `role='student', is_active=false, full_name = coalesce(raw_user_meta_data->>'full_name', email)`), ومُشغِّل `protect_profile_fields()` قبل التحديث يرفع `FORBIDDEN` إذا غيّر غير المدير أي حقل خارج `timezone, reminder_time, weekly_reminder`. `handle_new_user` يضبط `joined_at` و`is_tracked` من الدعوة، و`reminder_time = setting_text('default_reminder_time')::time`، وعند غياب الدعوة `is_tracked = (role <> 'admin')`. جدول `invitations` يُنشأ هنا لأن المُشغِّل يعتمد عليه. `is_supervisor_of(p_group)` تقرأ `group_supervisors`.
- [ ] **الخطوة 4:** `pnpm db:reset && pnpm --filter supabase test` → نجاح.
- [ ] **الخطوة 5:** إضافة مهمة `db-tests` في `ci.yml` باستخدام `supabase/setup-cli` action.
- [ ] **الخطوة 6:** commit: `db: core schema (groups, profiles, settings, audit) with profile provisioning trigger`

### Task 1.2: الترحيل 0002 — العادات وبنودها + البذرة + `active_habits_on`

**الملفات:**
- إنشاء: `supabase/migrations/0002_habits.sql`, `supabase/seed.sql`, `supabase/tests/0002_habits.test.ts`

**الواجهات:**
- يُنتج: جدولا `habits`, `habit_items` (§10.2)؛ الدالة `active_habits_on(p_date date, p_frequency habit_frequency) returns setof habits` (مرتبة بـ `sort_order`)؛ الدالة `active_items_on(p_habit uuid, p_date date) returns setof habit_items`.
- بذرة العادات بـ slugs ثابتة: يومية `quran_wird`, `adhkar` (checklist، 13 بندًا بترتيب الدليل), `qiyam`, `tafsir_ibn_juzayy`, `sahihayn`؛ أسبوعية `quran_memorization`, `fiqh_lesson`, `tazkiyah_hikam`, `lesson_prep` (checklist: بندان). `active_from = '2020-01-01'` ليغطّي البيانات المرحَّلة. `target_text` من جدول المواصفة §2.2.

- [ ] **الخطوة 1: الاختبارات الفاشلة:**
```ts
test('seed has 5 daily and 4 weekly habits in guide order', ...);   // slugs بالترتيب أعلاه
test('adhkar has 13 active items, lesson_prep has 2', ...);
test('active_habits_on excludes habit with active_to before date', ...); // أدرج عادة active_to='2026-01-31' ثم استعلم بـ '2026-02-01'
test('active_habits_on includes habit on its active_to date (inclusive)', ...);
test('habits check rejects active_to < active_from', ...);
```
- [ ] **الخطوة 2:** تشغيل → فشل.
- [ ] **الخطوة 3:** اكتب الترحيل والبذرة والدالتين.
- [ ] **الخطوة 4:** تشغيل → نجاح.
- [ ] **الخطوة 5:** commit: `db: habits and items with seed and active_habits_on`

### Task 1.3: الترحيل 0003 — السجلّات ودوال التاريخ (BR-06, BR-08, BR-12)

**الملفات:**
- إنشاء: `supabase/migrations/0003_logs.sql`, `supabase/tests/0003_logs.test.ts`

**الواجهات:**
- يُنتج: الجداول `logs`, `log_entries`, `log_entry_items` (§10.2) مع الفهارس؛ الدوال `week_start(p_date date, p_week_starts_on int) returns date`, `user_timezone(p_user uuid) returns text` (= `coalesce(profiles.timezone, groups.timezone, 'Asia/Riyadh')`), `local_today(p_user uuid, p_now timestamptz default now()) returns date`, `user_week_starts_on(p_user uuid) returns int` (= `coalesce(groups.week_starts_on, 0)`)؛ مُشغِّل `set_updated_at` على `logs`.

- [ ] **الخطوة 1: الاختبارات الفاشلة:**
```ts
test("week_start('2026-11-26', 0) = '2026-11-22'", ...);   // الخميس → الأحد
test("week_start('2026-11-26', 6) = '2026-11-21'", ...);   // → السبت
test("week_start('2026-11-22', 0) = '2026-11-22'", ...);   // يوم البداية نفسه
test("local_today for Asia/Riyadh user at 2026-11-26T22:30:00Z = '2026-11-27'", ...);
test("local_today falls back to group timezone then Asia/Riyadh", ...);
test('logs unique (user_id, period, period_start)', ...);
```
- [ ] **الخطوة 2:** تشغيل → فشل.
- [ ] **الخطوة 3:** اكتب الترحيل. `week_start` بصيغة: `p_date - ((extract(dow from p_date)::int - p_week_starts_on + 7) % 7)`.
- [ ] **الخطوة 4:** تشغيل → نجاح.
- [ ] **الخطوة 5:** commit: `db: logs tables and date helpers (week_start, local_today)`

### Task 1.4: الترحيل 0004 — المجالس والحضور ورموز الإشعارات وطلبات الحذف

**الملفات:**
- إنشاء: `supabase/migrations/0004_sessions.sql`, `supabase/tests/0004_sessions.test.ts`

**الواجهات:**
- يُنتج: `sessions` (بـ `group_id` قابل للفراغ = مجلس مشترك), `attendance`, `push_tokens` (منصّات `ios`/`android` فقط), `deletion_requests` (§10.2)؛ RPC `set_attendance(p_session_id uuid, p_rows jsonb) returns int` حيث `p_rows = [{"user_id": "...", "status": "present"}]`، تُدرج/تُحدّث في معاملة واحدة وتُسجّل `recorded_by = auth.uid()`، وتُرجع عدد الصفوف؛ القواعد: المدير يُعلّم أي مستخدم مُتابَع؛ المشرف يُعلّم فقط مستخدمي مجموعاته (`group_supervisors`) وفي مجالس مجموعاته أو المشتركة، وإلا `FORBIDDEN`؛ مستخدم غير مُتابَع أو ليس في مجموعة المجلس (إن كان المجلس لمجموعة) → `INVALID_ITEM`؛ RPC `request_account_deletion() returns uuid` يُدرج طلبًا للمستدعي (طلب مفتوح واحد فقط).

- [ ] **الخطوة 1: الاختبارات الفاشلة:** الفريدية `(session_id,user_id)`؛ `push_tokens.platform` يرفض `'web'`؛ `set_attendance` يُدرج 3 صفوف ثم يُحدّث واحدًا دون تكرار؛ مشرف مجموعة أخرى في مجلس G1 → `FORBIDDEN`؛ في مجلس مشترك (`group_id null`) المشرف `sup1` يُعلّم `p1` بنجاح و`p2` → `FORBIDDEN`؛ مستخدم من مجموعة أخرى في مجلس G1 عبر المدير → `INVALID_ITEM`؛ `request_account_deletion` مرّتين → طلب مفتوح واحد.
- [ ] **الخطوة 2:** تشغيل → فشل. **الخطوة 3:** اكتب الترحيل. **الخطوة 4:** تشغيل → نجاح.
- [ ] **الخطوة 5:** commit: `db: sessions, attendance with set_attendance rpc, push tokens`

### Task 1.5: الترحيل 0005 — سياسات RLS الكاملة (BR-11)

**الملفات:**
- إنشاء: `supabase/migrations/0005_rls.sql`, `supabase/tests/0005_rls.test.ts`

**الواجهات:**
- يُنتج: `enable row level security` على كل الجداول + السياسات حسب المواصفة §10.4. لا سياسات insert/update/delete على `logs`/`log_entries`/`log_entry_items` (الكتابة عبر `save_log` فقط، T1.6).
- `helpers.ts` يُنشئ مجموعة بيانات اختبار ثابتة في `beforeAll`: مجموعتان `G1`, `G2`؛ مدير `admin@test`؛ مشرفان `sup1@test` (G1), `sup2@test` (G2)؛ طلاب `p1@test` (G1), `p2@test` (G2). كلمة مرور موحّدة للاختبار فقط.

- [ ] **الخطوة 1: الاختبارات الفاشلة** (كل اختبار يستخدم `clientAs(...)`):
```ts
test('student sees only own profile', ...);                       // p1 → 1 صف
test('student reading another student logs gets 0 rows', ...);
test('supervisor sees profiles of own group only', ...);          // sup1 → p1 + sup1، لا p2
test('supervisor reading other-group logs gets 0 rows', ...);
test('admin sees all profiles', ...);                             // 5
test('student direct insert into logs is rejected', ...);         // خطأ RLS
test('student can update own reminder_time', ...);
test('everyone authenticated can read habits and app_settings', ...);
test('student cannot read audit_log or invitations', ...);        // 0 صف
test('student can upsert own push_tokens only', ...);
test('supervisor listed in group_supervisors for G1 and G2 sees both groups', ...);
test('student reads own deletion_requests only', ...);
test('every public table has rowsecurity = true', ...);
```
- [ ] **الخطوة 2:** تشغيل → فشل. **الخطوة 3:** اكتب السياسات. **الخطوة 4:** تشغيل → نجاح.
- [ ] **الخطوة 5:** commit: `db: row level security policies for all tables`

### Task 1.6: الترحيل 0006 — RPC `save_log` (BR-05, BR-06, BR-07, BR-08, BR-10, BR-12, BR-14)

**الملفات:**
- إنشاء: `supabase/migrations/0006_save_log.sql`, `supabase/tests/0006_save_log.test.ts`

**الواجهات:**
- يُنتج:
```sql
create or replace function save_log(
  p_period habit_frequency, p_period_start date, p_entries jsonb,
  p_note text default null, p_review_text text default null,
  p_support_request_text text default null, p_user_id uuid default null
) returns uuid language plpgsql security definer set search_path = public;
-- p_entries: [{"habit_id": uuid, "status": "done|not_done|not_required", "checked_item_ids": [uuid]}]
```
- القواعد المطبَّقة بالترتيب: (1) المستخدم الهدف `v_user = coalesce(p_user_id, auth.uid())`؛ إن اختلف عن `auth.uid()` وجب `is_admin()` وإلا `FORBIDDEN`؛ المستخدم غير النشط → `INACTIVE_USER`. (2) `v_today = local_today(v_user)`؛ `p_period_start > v_today` → `FUTURE_DATE`. (3) يومي: `p_period_start < v_today - setting_int('backfill_days')` ولم يكن المستدعي مديرًا → `DATE_OUT_OF_WINDOW`. (4) أسبوعي: `p_period_start <> week_start(p_period_start, group.week_starts_on)` → `INVALID_WEEK_START`؛ `v_today > p_period_start + 6 + setting_int('weekly_grace_days')` ولم يكن مديرًا → `DATE_OUT_OF_WINDOW`. (5) كل عادة نشطة في `active_habits_on(p_period_start, p_period)` يجب أن يكون لها مدخل وإلا `MISSING_ENTRY` (BR-14)؛ ولكل مدخل: العادة في القائمة النشطة وإلا `INACTIVE_HABIT`/`FREQUENCY_MISMATCH`؛ لعادة `checklist`: إن كانت الحالة `not_required` تُحفظ بلا بنود؛ وإلا تُشتقّ الحالة: كل البنود النشطة معلَّمة → `done`، غير ذلك → `not_done`، وأي `checked_item_id` ليس بندًا نشطًا للعادة → `INVALID_ITEM`. (6) Upsert في `logs` على `(user_id, period, period_start)`؛ حذف مدخلات السجلّ وإعادة إدراجها؛ `support_status` حسب BR-10 (نصّ غير فارغ → `open`، فارغ → `none`، وإن كان `handled` وتغيّر النصّ → `open`). (7) إن تجاوز المدير النافذة أو كتب لغيره → صفّ في `audit_log` بـ `action='log.admin_save'`.

- [ ] **الخطوة 1: الاختبارات الفاشلة:**
```ts
test('student saves today daily log with 5 entries and gets same id on second save (upsert)', ...);
test('two concurrent saves for same day produce one logs row', ...);               // Promise.all
test('future date rejected FUTURE_DATE', ...);
test('date older than backfill_days rejected DATE_OUT_OF_WINDOW; admin bypass succeeds and writes audit_log', ...);
test('local date near midnight accepted: user tz Asia/Riyadh, server now 22:30Z → period_start = tomorrow-UTC accepted', ...); // يحتاج helper يمرّر p_now عبر إعداد الاختبار: استخدم set_config('app.test_now', ...) تقرأه local_today عند وجوده
test('checklist: client status done with 10/13 items stored as not_done with 10 items', ...);
test('checklist: all 13 items → done; not_required → no items stored', ...);
test('checked_item_id not belonging to habit → INVALID_ITEM', ...);
test('weekly: period_start not a week start → INVALID_WEEK_START', ...);
test('weekly: saved on grace day 3 accepted, day 4 rejected', ...);
test('weekly with support text sets support_status open; empty text sets none', ...);
test('inactive habit on that date → INACTIVE_HABIT; weekly habit in daily log → FREQUENCY_MISMATCH', ...);
test('student saving for another user → FORBIDDEN', ...);
test('entries missing one active habit → MISSING_ENTRY', ...);
test('checklist with empty checked_item_ids and status not_done is stored (not dropped)', ...);
test('inactive (is_active=false) user → INACTIVE_USER', ...);
```
- [ ] **الخطوة 2:** تشغيل → فشل.
- [ ] **الخطوة 3:** اكتب `save_log`. لدعم اختبار منتصف الليل: عدّل `local_today` لتقرأ `nullif(current_setting('app.test_now', true), '')::timestamptz` إن وُجد (للاختبارات فقط؛ لا يُضبط في الإنتاج).
- [ ] **الخطوة 4:** تشغيل → نجاح.
- [ ] **الخطوة 5:** commit: `db: save_log rpc with window, habit and checklist validation`

### Task 1.7: الترحيل 0007 — `v_day_status` ودوال الملخّص والتقويم ونظرة المجموعة (BR-01, BR-02, BR-03, BR-04, BR-13)

**الملفات:**
- إنشاء: `supabase/migrations/0007_summary.sql`, `supabase/tests/0007_summary.test.ts`, `supabase/tests/fixtures.ts` (محمّل fixtures من `packages/domain/fixtures/*.json`)

**الواجهات:**
- يُنتج:
  - عرض `v_day_status(user_id uuid, log_date date, state text, completion_pct numeric)` للأيام **المسجَّلة** فقط (`achieved|failed|neutral` حسب BR-01/02؛ `missing` = غياب الصفّ).
  - `get_student_summary(p_user_id uuid default auth.uid(), p_from date default null, p_to date default null) returns jsonb` بالشكل:
    ```json
    { "days_logged": 86, "completion_pct": 91, "attendance_pct": 75,
      "longest_streak": 23, "current_streak": 12,
      "per_habit": [{"habit_id":"…","slug":"quran_wird","name":"…","completion_pct":90}],
      "weekly": {"weeks_logged": 11, "completion_pct": 84} }
    ```
    `attendance_pct` و`weekly` يكونان `null` إن لم توجد بيانات. المشرف يستطيع تمرير `p_user_id` لطالب في مجموعته، والمدير لأي طالب؛ غير ذلك `FORBIDDEN`.
  - `get_calendar(p_user_id uuid, p_from date, p_to date) returns table(log_date date, state text, completion_pct numeric)` يملأ كل أيام المدى بـ `missing` حيث لا سجلّ (حتى `local_today` فقط؛ المدى ≤ 62 يومًا).
  - `get_group_overview(p_group_id uuid, p_from date, p_to date) returns table(user_id uuid, full_name text, log_date date, state text)` للملفات `is_tracked and is_active` فقط؛ `FORBIDDEN` لغير مدير/مشرف المجموعة.
  - `attendance_pct` في الملخّص يُحسب على كل صفوف `attendance` للطالب لمجالس تاريخها ≥ `joined_at` (BR-13)، لا على مجموعته الحالية.
- fixtures مشتركة بصيغة: `{ "name": "...", "today": "2026-11-26", "thresholdPct": 100, "days": [{"date": "...", "entries": [...]}], "expect": {"longest": 5, "current": 3, "completionPct": 89} }`.

- [ ] **الخطوة 1: اكتب fixtures** في `packages/domain/fixtures/`:
  - `streaks.json`: (A) 5 أيام `achieved` ثم `failed` ثم 3 `achieved` حتى اليوم → `longest 5, current 3`. (B) `achieved, neutral, achieved` → `longest 2, current 2`. (C) اليوم `missing`، آخر 4 أيام `achieved` → `current 4`. (D) أمس `missing`، اليوم `achieved` → `current 1`. (E) كل الأيام `neutral` → `longest 0, current 0`. (F) أيام قبل `joined_at` لا تُحسب.
  - `summary.json`: يومان: الأول 5 عادات `done` (5/5)، الثاني 3 `done` + 1 `not_done` + 1 `not_required` (3/4) → `completion_pct = round(8/9*100) = 89`؛ حضور 4 مجالس: `present, present, absent, excused` → `attendance_pct = 67`.
  - `day-status.json`: (1) كل `done` → `achieved, 100`؛ (2) checklist 10/13 والبقية `done` → `failed, 95` (= (4 + 10/13)/5 = 0.9538 → 95) عند عتبة 100، و`achieved` عند عتبة 90؛ (3) كل `not_required` → `neutral, null`؛ (4) 3 `done` + 2 `not_required` → `achieved, 100`.
- [ ] **الخطوة 2: الاختبارات الفاشلة:** محمّل يُدرج كل fixture عبر `save_log` بصلاحية المدير (مع `app.test_now` = `today` الخاص بالـ fixture) ثم يستدعي الدوال ويقارن بالتوقّعات؛ إضافة إلى: `supervisor of other group calling get_student_summary → FORBIDDEN`؛ `get_calendar fills 30 days with missing`؛ `attendance_pct unchanged after moving student to another group`؛ `untracked supervisor absent from get_group_overview`؛ `archived habit still appears in old day status under its old name` (محور المراجعة 5).
- [ ] **الخطوة 3:** تشغيل → فشل. **الخطوة 4:** اكتب العرض والدوال (gaps-and-islands بـ window functions؛ `neutral` لا يقطع ولا يُحسب). **الخطوة 5:** تشغيل → نجاح.
- [ ] **الخطوة 6:** commit: `db: day status view, student summary, calendar and group overview`

### Task 1.8: الحزمة المشتركة `@awrad/domain` (BR-01, BR-02, BR-04, BR-06, BR-08, BR-09)

**الملفات:**
- إنشاء: `packages/domain/{package.json,tsconfig.json,vitest.config.ts}`, `src/{types,schemas,dates,hijri,dayStatus,streaks,index}.ts`, `src/__tests__/{dates,hijri,dayStatus,streaks,schemas}.test.ts`

**الواجهات:**
- يُنتج (كلها مُصدَّرة من `index.ts`):
```ts
export type Frequency = 'daily' | 'weekly';
export type HabitKind = 'tristate' | 'checklist';
export type EntryStatus = 'done' | 'not_done' | 'not_required';
export type DayState = 'achieved' | 'failed' | 'neutral' | 'missing';
export interface HabitItemDef { id: string; name: string; sortOrder: number; activeFrom: string; activeTo: string | null }
export interface HabitDef { id: string; slug: string; name: string; targetText: string | null; frequency: Frequency; kind: HabitKind; sortOrder: number; activeFrom: string; activeTo: string | null; items: HabitItemDef[] }
export interface EntryInput { habitId: string; status: EntryStatus; checkedItemIds?: string[] }
export interface SaveLogInput { period: Frequency; periodStart: string; entries: EntryInput[]; note?: string; reviewText?: string; supportRequestText?: string }
export const saveLogSchema: z.ZodType<SaveLogInput>;                // zod
export function isActiveOn(def: { activeFrom: string; activeTo: string | null }, date: string): boolean;
export function activeHabitsOn(habits: HabitDef[], date: string, frequency: Frequency): HabitDef[];
export function computeDayStatus(habits: HabitDef[], entries: EntryInput[], date: string, thresholdPct: number): { state: Exclude<DayState,'missing'>; completionPct: number | null };
export function computeStreaks(days: Array<{ date: string; state: DayState }>, today: string, joinedAt: string): { current: number; longest: number };
export function todayIn(timezone: string, now?: Date): string;      // 'YYYY-MM-DD'
export function addDays(date: string, n: number): string;
export function weekStartFor(date: string, weekStartsOn: 0|1|2|3|4|5|6): string;
export function isWithinBackfill(date: string, today: string, backfillDays: number): boolean;
export function toHijri(date: string, adjustmentDays?: number): { year: number; month: number; day: number; monthName: string; formatted: string }; // «١٥ جمادى الأولى ١٤٤٨هـ» بأرقام غربية افتراضيًا: "15 جمادى الأولى 1448هـ"
export const RPC_ERROR_CODES: readonly ['FORBIDDEN','FUTURE_DATE','DATE_OUT_OF_WINDOW','INVALID_WEEK_START','FREQUENCY_MISMATCH','INACTIVE_HABIT','INVALID_ITEM','INACTIVE_USER','MISSING_ENTRY'];
```
- يستهلك: fixtures `packages/domain/fixtures/*.json` (نفس ملفات T1.7).

- [ ] **الخطوة 1: الاختبارات الفاشلة:**
```ts
test("weekStartFor('2026-11-26', 0) === '2026-11-22'"); test("weekStartFor('2026-11-26', 6) === '2026-11-21'");
test("todayIn('Asia/Riyadh', new Date('2026-11-26T22:30:00Z')) === '2026-11-27'");
test("isWithinBackfill('2026-11-24','2026-11-26',2) true; '2026-11-23' false; '2026-11-27' false");
test("toHijri('2025-03-01') → {year:1446, month:9, day:1}");      // 1 رمضان 1446 (أم القرى)
test("toHijri('2025-06-06') → {year:1446, month:12, day:10}");    // 10 ذو الحجة 1446
test("toHijri('2025-03-01', 1) → day 2");                          // فارق يوم
test.each(dayStatusFixtures)('computeDayStatus matches fixture %s', ...);
test.each(streakFixtures)('computeStreaks matches fixture %s', ...);
test('saveLogSchema rejects period_start not YYYY-MM-DD and empty entries');
```
- [ ] **الخطوة 2:** تشغيل → فشل. **الخطوة 3:** نفّذ (`@umalqura/core` للهجري؛ `@date-fns/tz` لـ `todayIn`). **الخطوة 4:** تشغيل → نجاح.
- [ ] **الخطوة 5:** commit: `feat(domain): shared types, schemas, date/hijri utils, day status and streak rules`

### Task 1.9: الحزمة `@awrad/supabase-client` والأنواع المولَّدة

**الملفات:**
- إنشاء: `packages/supabase-client/{package.json,tsconfig.json}`, `src/{database.types.ts,client.ts,rpc.ts,index.ts}`, `src/__tests__/rpc.test.ts`

**الواجهات:**
- يُنتج: `createBrowserClient(url, anonKey, storage?)`; `createServerClient(...)` (غلاف `@supabase/ssr` للوحة)؛ دوال RPC مُنمَّطة: `saveLog(client, input: SaveLogInput, userId?: string): Promise<string>` (تحوّل camelCase إلى معاملات `save_log` و`checkedItemIds → checked_item_ids`)، `getStudentSummary(client, opts?)`, `getCalendar(client, userId, from, to)`, `getGroupOverview(client, groupId, from, to)`, `setAttendance(client, sessionId, rows)`, `requestAccountDeletion(client)`, `fetchActiveHabits(client, date, frequency): Promise<HabitDef[]>` (تجمع `habits` + `habit_items` وتُرجع `HabitDef[]`)، و`parseRpcError(e): RpcErrorCode | 'UNKNOWN'`.

- [ ] **الخطوة 1:** `pnpm db:types` لتوليد `database.types.ts`.
- [ ] **الخطوة 2: الاختبارات الفاشلة:** `saveLog` يستدعي `client.rpc('save_log', {...})` بمعاملات snake_case صحيحة (mock)؛ `parseRpcError` يستخرج `DATE_OUT_OF_WINDOW` من رسالة PostgrestError.
- [ ] **الخطوة 3:** نفّذ. **الخطوة 4:** اختبارات + `typecheck` → نجاح.
- [ ] **الخطوة 5:** commit: `feat(supabase-client): typed client and rpc helpers`

**معيار إنهاء المرحلة 1:** كل اختبارات `supabase/tests` و`packages/*` خضراء في CI؛ `pnpm db:reset` ينتج قاعدة ببذرة العادات؛ لا جدول بلا RLS (استعلام تحقّق في `0005_rls.test.ts`: `select tablename from pg_tables where schemaname='public' and rowsecurity=false` → صفر).

---

## المرحلة 2 — تطبيق الطالب (Expo: iOS · Android · ويب)

> كل مهمة واجهة تنتهي بتحقّق على ثلاث منصّات: `expo start` على iOS Simulator و Android Emulator، و`expo start --web`. اختبارات المكوّنات بـ React Native Testing Library مع mock لعميل Supabase (`src/lib/__mocks__/supabase.ts`).

### Task 2.1: هيكل تطبيق Expo، RTL، الخط، السمة، عميل Supabase

**الملفات:**
- إنشاء: `apps/mobile/{app.json,package.json,tsconfig.json,babel.config.js,metro.config.js,tailwind.config.js,global.css}`, `app/_layout.tsx`, `app/(tabs)/_layout.tsx` (5 تبويبات فارغة), `src/lib/supabase.ts`, `src/lib/theme.ts`, `src/messages/ar.ts`, `src/lib/rtl.ts`, `__tests__/rtl.test.ts`

**الواجهات:**
- يُنتج: `supabase` (عميل من `@awrad/supabase-client` مع `expo-secure-store` على الجوّال و`localStorage` على الويب)؛ `theme` من `@awrad/design-tokens` (`lightColors`/`darkColors`/`space`/`radius`/`type`؛ لا قيم ألوان في المكوّنات) مع `useTheme()` يختار الوضع حسب `useColorScheme()`؛ `messages.ar` كائن نصوص؛ `ensureRTL()` تُنادى قبل التصيير.

- [ ] **الخطوة 1:** `pnpm create expo-app apps/mobile --template tabs` ثم تحويله إلى pnpm workspace؛ إضافة NativeWind، `expo-router`, `expo-secure-store`, `expo-font`, `@expo-google-fonts/ibm-plex-sans-arabic` (400/500/600) و`@expo-google-fonts/markazi-text` (600/700) بأسماء الخطوط الواردة في `theme.ts`, `lucide-react-native` (سماكة 1.75) مع أيقونتَي `rub`/`rub-fill` كمكوّنات SVG مصدَّرة من Figma (`react-native-svg`), `@awrad/domain`, `@awrad/supabase-client`, `@awrad/design-tokens`.
- [ ] **الخطوة 2:** `app.json`: `"supportsRTL": true`, `"locales"`: ar، `"scheme": "awrad"`, معرّفات `ios.bundleIdentifier`/`android.package` مؤقّتة `org.mafatih.awrad`؛ `web.output: "static"`.
- [ ] **الخطوة 3:** `rtl.ts`: `I18nManager.allowRTL(true); I18nManager.forceRTL(true);` وعلى الويب `document.documentElement.dir = 'rtl'; lang = 'ar'`.
- [ ] **الخطوة 4: اختبار:** `rtl.test.ts` يتحقّق أن `I18nManager.isRTL === true` بعد `ensureRTL()` (mock لـ I18nManager).
- [ ] **الخطوة 5:** تحقّق يدوي: التبويبات تظهر من اليمين بأسماء Figma (`TabBar`)؛ الخطّان محمَّلان (التاريخ الهجري بـ Markazi Text)؛ `pnpm --filter mobile exec expo export -p web` ينجح وينتج `dist/`.
- [ ] **الخطوة 6:** commit: `feat(mobile): expo scaffold with rtl, arabic font, theme and supabase client`

### Task 2.2: الدخول برمز البريد (F-01..F-03)

**الملفات:**
- إنشاء: `app/(auth)/login.tsx`, `app/(auth)/verify.tsx`, `src/hooks/useSession.ts`, `src/components/OtpInput.tsx`, `__tests__/login.test.tsx`
- تعديل: `app/_layout.tsx` (حارس: لا جلسة → `(auth)`؛ جلسة بملف `is_active=false` → شاشة «حسابك غير مفعَّل، تواصل مع المشرف»؛ ملف `is_tracked=false` (مدير/مشرف غير مُتابَع) → شاشة «لوحتك على الويب» مع رابط اللوحة وزر خروج)

**الواجهات:**
- يُنتج: `useSession(): { session, profile, loading, signOut }` (يقرأ `profiles` للمستخدم الحالي)؛ `login.tsx` يستدعي `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })`؛ `verify.tsx` يستدعي `verifyOtp({ email, token, type: 'email' })`.
- **المرجع البصري:** إطارات m01–m05 وd01؛ مكوّنا `OtpInput` (6 خانات، `direction: ltr` على الصفّ وحده) و`TextField`؛ شاشة m05 لحساب غير مُتابَع.

- [ ] **الخطوة 1: اختبارات فاشلة:** إدخال بريد غير مسجَّل (mock يُرجع خطأ `otp_disabled`/`signups not allowed`) → يظهر نصّ `messages.ar.auth.unknownEmail` = «هذا البريد غير مسجَّل لدينا. تواصل مع المشرف.»؛ زر «إعادة الإرسال» معطّل 60 ثانية؛ رمز من 6 أرقام يستدعي `verifyOtp` بالمعاملات الصحيحة.
- [ ] **الخطوة 2:** تشغيل → فشل. **الخطوة 3:** نفّذ الشاشات والحارس. **الخطوة 4:** تشغيل → نجاح + تحقّق يدوي بحساب من بذرة الاختبار (رموز OTP تظهر في Inbucket المحلي: `supabase status` → `Inbucket URL`).
- [ ] **الخطوة 5:** commit: `feat(mobile): email otp sign-in and session guard`

### Task 2.3: شاشة «اليوم» (F-10..F-15)

**الملفات:**
- إنشاء: `app/(tabs)/today.tsx`, `src/components/{DateHeader,RubMark,HabitRow,Tristate,HabitChecklist,ChecklistChip,DayStatusBanner,SaveBar,StreakChip}.tsx`, `src/hooks/{useActiveHabits,useLog,useSaveLog,useSettings,useDraft}.ts`, `__tests__/today.test.tsx`
- تعديل: `src/messages/ar.ts`

**الواجهات:**
- يستهلك: `fetchActiveHabits`, `saveLog`, `parseRpcError` (T1.9)؛ `computeDayStatus`, `todayIn`, `isWithinBackfill`, `toHijri` (T1.8).
- يُنتج: `useActiveHabits(date, frequency): { habits: HabitDef[], loading }`; `useLog(period, periodStart): { log, entries, loading, refetch }` (يقرأ `logs` + `log_entries` + `log_entry_items` عبر select واحد متداخل)؛ `useSaveLog(): { save(input: SaveLogInput): Promise<void>, saving, error: RpcErrorCode | null }`; `useSettings(): { backfillDays, thresholdPct, hijriAdjustment, weekStartsOn, timezone }` (من `app_settings` + `groups`)؛ `useDraft(key)` لحفظ المسوّدة محليًا (AsyncStorage) حتى الحفظ الناجح.
- المكوّنات بأسماء Figma (إطارات m10–m15 وd10–d12): `HabitRow({ habit, entry, onChange })` = `RubMark` + الاسم والهدف + `Tristate({ value, onChange })`؛ `HabitChecklist({ habit, checkedIds, notRequired, onChange })` من `ChecklistChip` مع عدّاد `n/m` بلا مسافات وشريط تقدّم وزرّي «تعليم الكل» و«غير مطلوب اليوم»؛ `DateHeader({ date, onPrev, onNext, canPrev, canNext })` يعرض الهجري كبيرًا (Markazi Text) والميلادي تحته وعلامات الأوراد و`StreakChip`، وأزرار التنقّل 40×40 مع `hitSlop` إلى 44؛ `DayStatusBanner({ state, completionPct })`; `SaveBar({ canSave, saving, onSave, onMarkAllDone })` مع زر «تعليم الكل تم» (F-16).

- [ ] **الخطوة 1: اختبارات فاشلة:**
```ts
test('renders 5 daily habits from fetchActiveHabits in sort order');
test('checklist counter shows "10/13" (no spaces) after checking 10 items');
test('save sends SaveLogInput with period daily, periodStart = today, checkedItemIds for checklist');
test('after save, banner shows "يوم مُنجَز" when all done; "بقي بندان" when 2 missing'); // computeDayStatus
test('prev arrow disabled beyond backfill window (today-2) and next disabled at today');
test('DATE_OUT_OF_WINDOW error shows messages.ar.errors.DATE_OUT_OF_WINDOW');
test('save button disabled until every tristate habit has a status; checklist needs none (0 checked = not_done)');
test('disabled save shows one reason line, e.g. "بقي ورد القيام بلا حالة"');
test('"تعليم الكل تم" sets every tristate to done and checks all checklist items');
```
- [ ] **الخطوة 2:** تشغيل → فشل. **الخطوة 3:** نفّذ. **الخطوة 4:** تشغيل → نجاح + تحقّق على المنصّات الثلاث (RTL، الخط، الأزرار ≥ 44pt).
- [ ] **الخطوة 5:** commit: `feat(mobile): today screen with tri-state habits, checklist and save`

### Task 2.4: شاشة «أسبوعي» (F-20..F-24)

**الملفات:**
- إنشاء: `app/(tabs)/weekly.tsx`, `src/components/WeekHeader.tsx`, `src/hooks/useWeek.ts`, `__tests__/weekly.test.tsx`

**الواجهات:**
- يستهلك: مكوّنات T2.3 (`HabitTristate`, `HabitChecklist`), `weekStartFor`, `useSettings`.
- يُنتج: `useWeek(offset: 0 | -1): { weekStart, weekEnd, canEdit }` حسب BR-06 (المهلة `weeklyGraceDays` من الإعدادات).
- **المرجع البصري:** إطارا m20 وd20؛ `WeekHeader` يضع عنوان الأسبوع في صفّ مستقلّ وأسهم التنقّل تحته (لا اقتصاص)، والهجري تحت الميلادي.

- [ ] **الخطوة 1: اختبارات فاشلة:** العنوان «الأسبوع من 22 نوفمبر إلى 28 نوفمبر» عند `today='2026-11-26'` و`weekStartsOn=0`؛ الحفظ يرسل `period: 'weekly'` و`periodStart: '2026-11-22'` و`reviewText` و`supportRequestText`؛ تنبيه «لم تسجّل الأسبوع الماضي» يظهر فقط إن كان الأسبوع الماضي بلا سجلّ وضمن المهلة.
- [ ] **الخطوة 2–4:** فشل → تنفيذ → نجاح.
- [ ] **الخطوة 5:** commit: `feat(mobile): weekly review screen`

### Task 2.5: شاشة «ملخّصي» (F-30..F-33)

**الملفات:**
- إنشاء: `app/(tabs)/summary.tsx`, `src/components/{StatCard,RangeTabs,MonthCalendar,CalendarCell,HabitBar,EmptyState}.tsx`, `src/hooks/{useSummary,useCalendar}.ts`, `__tests__/summary.test.tsx`

**الواجهات:**
- يستهلك: `getStudentSummary`, `getCalendar` (T1.9), `toHijri`.
- **المرجع البصري:** إطارا m21 وd21؛ `StatCard` بنوعين (عادية · سلسلة) ورقم كبير بـ `type.displayNumber`؛ `HabitBar` لكل ورد.
- يُنتج: `useSummary(range: '30d' | '90d' | 'all')`; `useCalendar(month: string)` (يحسب `from`/`to` للشهر الميلادي ويستدعي `getCalendar(client, userId, from, to)`)؛ `MonthCalendar({ days, onPrevMonth, onNextMonth })` يعرض الشهر الميلادي، وفي الرأس الشهر/الشهرين الهجريين المقابلين (مثل «جمادى الأولى – جمادى الآخرة 1448»)، وأعمدة الأسبوع تبدأ حسب `weekStartsOn`.

- [ ] **الخطوة 1: اختبارات فاشلة:** البطاقات الخمس تعرض القيم من mock (`86`, `91%`, `75%`, `23`, `12`)؛ `attendance_pct = null` يعرض «—»؛ التقويم يميّز 4 حالات بالشكل لا باللون وحده (`CalendarCell`: ممتلئ، مظلَّل بخطوط مائلة، إطار، رقم ونقطة) مع حالتي «اليوم» و«مستقبل»، ويضع أول عمود حسب `weekStartsOn`؛ طالب بلا سجلّات يرى `EmptyState` يشرح أن الملخّص يظهر بعد أول تسجيل (غير مرسوم؛ بالرموز نفسها)؛ تبديل النطاق يستدعي RPC بـ `p_from` الصحيح (`today-29` لـ 30 يومًا).
- [ ] **الخطوة 2–4:** فشل → تنفيذ → نجاح.
- [ ] **الخطوة 5:** commit: `feat(mobile): summary screen with stats, calendar and per-habit bars`

### Task 2.6: شاشة «السجلّ» وصفحة اليوم/الأسبوع (F-40)

**الملفات:**
- إنشاء: `app/(tabs)/history.tsx`, `app/log/[period]/[date].tsx`, `src/components/{HistoryRow,StatusChip}.tsx`, `src/hooks/useLogList.ts`, `__tests__/history.test.tsx` (المرجع البصري: m22، m23)

**الواجهات:**
- يُنتج: `useLogList(period, page)` قائمة مُرقَّمة (20 لكل صفحة) من `logs` مع حالة اليوم من `get_calendar`/`v_day_status`؛ صفحة `[date]` تُعيد استخدام شاشة اليوم/الأسبوعي بوضع `readOnly = !isWithinBackfill(...)`.

- [ ] **الخطوة 1: اختبارات فاشلة:** القائمة تعرض التاريخين الهجري والميلادي وحالة كل يوم؛ يوم خارج النافذة يُفتح للقراءة فقط (لا زر حفظ)؛ يوم داخلها يُفتح للتعديل.
- [ ] **الخطوة 2–4:** فشل → تنفيذ → نجاح.
- [ ] **الخطوة 5:** commit: `feat(mobile): history list and read-only/editable log detail`

### Task 2.7: الإعدادات والإشعارات (F-50..F-52)

**الملفات:**
- إنشاء: `app/(tabs)/settings.tsx`, `src/components/{ListRow,Toggle}.tsx`, `src/lib/notifications.ts`, `src/hooks/useProfileSettings.ts`, `__tests__/settings.test.tsx` (المرجع البصري: m24، m25، d24)

**الواجهات:**
- يُنتج: `registerForPush(): Promise<string | null>` (`expo-notifications` → `getExpoPushTokenAsync` → upsert في `push_tokens` بـ `platform` `ios|android`؛ على الويب تُرجع `null`)؛ `requestDeletion()` يستدعي `requestAccountDeletion` بعد تأكيد مزدوج ويعرض «استُلم طلبك وسيُنفَّذ خلال 30 يومًا»؛ `useProfileSettings(): { reminderTime, weeklyReminder, timezone, update(partial) }` يكتب في `profiles` (الحقول المسموحة فقط)؛ عند استلام إشعار بالضغط ينتقل إلى تبويب اليوم (`awrad://today`).

- [ ] **الخطوة 1: اختبارات فاشلة:** تغيير وقت التذكير يستدعي `update({ reminder_time: '20:30' })`؛ إيقاف الإشعارات يحذف رموز المستخدم من `push_tokens`؛ زر الخروج يستدعي `signOut`؛ روابط «سياسة الخصوصية» تفتح `https://<admin-domain>/privacy`؛ على الويب يظهر تنبيه «ثبّت التطبيق على هاتفك لتصلك التذكيرات» بدل مفتاح الإشعارات؛ «طلب حذف حسابي» يستدعي `requestAccountDeletion` بعد التأكيد.
- [ ] **الخطوة 2–4:** فشل → تنفيذ → نجاح (الويب: `registerForPush` يُرجع `null` ويُخفي خيار الإشعارات).
- [ ] **الخطوة 5:** commit: `feat(mobile): settings with reminder time and push registration`

### Task 2.8: بناء الويب واختبار دخاني + فحص وصولية

**الملفات:**
- إنشاء: `apps/mobile/e2e/web-smoke.spec.ts` (Playwright على مخرجات `expo export -p web`), `apps/mobile/playwright.config.ts`
- تعديل: `.github/workflows/ci.yml` (مهمة `mobile-web`)

- [ ] **الخطوة 1: اختبار فاشل:** `document.documentElement.dir === 'rtl'` و`lang === 'ar'`؛ شاشة الدخول تعرض عنوان «نظام متابعة الأوراد»؛ لا أخطاء console.
- [ ] **الخطوة 2:** تشغيل → فشل (لا إعداد). **الخطوة 3:** إعداد Playwright يخدم `dist/` محليًا. **الخطوة 4:** نجاح؛ إضافة المهمة إلى CI.
- [ ] **الخطوة 5:** خطوة CI تفشل إن وُجد `numberOfLines={1}` في `apps/mobile` خارج سطر يحمل تعليق `// why:` (قاعدة التصميم 9).
- [ ] **الخطوة 6:** فحص يدوي: تكبير خط النظام 150% لا يقطع النصوص في رأس اليوم وبطاقات الملخّص؛ قارئ الشاشة يقرأ أزرار الحالة بأسماء عربية (`accessibilityLabel`).
- [ ] **الخطوة 7:** commit: `test(mobile): web smoke test, a11y labels and no-truncation check`

**معيار إنهاء المرحلة 2:** طالب من بذرة الاختبار يدخل، يسجّل يومه وأسبوعه، ويرى ملخّصه على iOS وAndroid والويب؛ كل اختبارات `apps/mobile` خضراء.

---

## المرحلة 3 — لوحة الشيخ/المشرف (Next.js)

> Playwright e2e يعمل ضدّ Supabase المحلي ببذرة الاختبار (مدير، مشرفان، طلاب). كل صفحة تُبنى بـ Server Components للقراءة و Server Actions للكتابة (عبر `createServerClient`).

### Task 3.1: هيكل Next.js، RTL، الحارس حسب الدور

**الملفات:**
- إنشاء: `apps/admin/{package.json,next.config.ts,tailwind.config.ts,components.json,playwright.config.ts}`, `app/layout.tsx`, `app/(dash)/layout.tsx` (شريط جانبي), `app/(dash)/page.tsx` (مؤقّت), `app/(auth)/login/page.tsx`, `app/(auth)/verify/page.tsx`, `app/unauthorized/page.tsx`, `middleware.ts`, `src/lib/supabase/{server,client}.ts`, `src/messages/ar.ts`, `e2e/auth.spec.ts`

**الواجهات:**
- يُنتج: `middleware.ts` يسمح بـ `/(dash)/*` لدور `admin|supervisor` فقط، ويحوّل الطالب إلى `/unauthorized`، وغير المصادَق إلى `/login`؛ `getCurrentProfile()` في `server.ts`؛ `<html lang="ar" dir="rtl">`؛ استيراد `tokens.css` من `@awrad/design-tokens` في `app/layout.tsx`، وخطّا Markazi Text وIBM Plex Sans Arabic عبر `next/font/google` بمتغيّرات تغذّي `--font-display` و`--font-ui`؛ الوضع الداكن يتبع النظام ويُفرض بـ `data-theme` (D20)؛ `Sidebar` بسبعة أقسام على اليمين ودرج يُفتح من اليسار على الجوال (إطارات a01، a20، a30).

- [ ] **الخطوة 1: اختبار فاشل (Playwright):** دخول `p1@test` → يُحوَّل إلى `/unauthorized` بنصّ «هذه اللوحة للمشرفين»؛ دخول `admin@test` → يرى الشريط الجانبي بالعناصر السبعة؛ `sup1@test` لا يرى عنصرَي «العادات» و«الإعدادات».
- [ ] **الخطوة 2–4:** فشل → تنفيذ → نجاح.
- [ ] **الخطوة 5:** commit: `feat(admin): next.js scaffold with rtl layout and role guard`

### Task 3.2: دالة `invite-user` وصفحات الطلاب (F-61)

**الملفات:**
- إنشاء: `supabase/functions/invite-user/index.ts`, `supabase/functions/_shared/{auth.ts,cors.ts}`, `supabase/functions/invite-user/index.test.ts` (Deno)
- إنشاء: `app/(dash)/students/{page,new/page,[id]/page}.tsx`, `src/components/students/{StudentsTable,InviteForm,StudentDetail}.tsx`, `src/actions/students.ts`, `e2e/students.spec.ts`

**الواجهات:**
- يُنتج: Edge Function `POST /invite-user` بجسم `{ email, full_name, role, group_id, joined_at?, is_tracked? }`: تتحقّق أن JWT المستدعي لمدير (`is_admin` عبر عميل بمفتاح المستخدم)، تُدرج `invitations`، تستدعي `auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name } })` (المُشغِّل T1.1 ينشئ الملف)، ثم `auth.admin.generateLink`/`signInWithOtp` لإرسال بريد ترحيبي، وتُرجع `{ profile_id }`؛ أخطاء: `403 FORBIDDEN`, `409 EMAIL_EXISTS`.
- Server Actions: `inviteStudent(form)`, `updateStudent(id, {full_name, group_id, is_active, is_tracked, joined_at})`, `deleteStudent(id)` (حذف `auth.users` عبر دالة Edge أو RPC بصلاحية مدير — يحذف بالتسلسل).
- `StudentDetail` يعرض `get_student_summary` + تقويم + جدول السجلّات + الحضور + الملاحظات (حسب D6). المرجع البصري: a08 (جدول الطلاب بعمود اسم مرن)، a09 (نافذة الدعوة بحقل تاريخ الانضمام)، a02 (ملف الطالب).

- [ ] **الخطوة 1: اختبارات فاشلة:** Deno: استدعاء بدون JWT مدير → 403؛ ببريد موجود → 409. Playwright: المدير يدعو `new@test` فيظهر في القائمة كـ «نشط» وفي المجموعة الصحيحة؛ المشرف لا يرى زر «دعوة»؛ بحث بالاسم يُصفّي القائمة.
- [ ] **الخطوة 2–4:** فشل → تنفيذ → نجاح (`supabase functions serve` محليًا).
- [ ] **الخطوة 5:** commit: `feat(admin): invite-user function and students management`

### Task 3.3: نظرة عامة (F-60)

**الملفات:**
- إنشاء: `app/(dash)/page.tsx` (استبدال المؤقّت), `src/components/overview/{KpiCards,ActivityGrid,GroupFilter}.tsx`, `src/lib/queries/overview.ts`, `e2e/overview.spec.ts`

**الواجهات:**
- يستهلك: `getGroupOverview`, `getStudentSummary`.
- يُنتج: `getOverview(groupId | 'all', days = 14): Promise<{ rows: Array<{ userId, fullName, cells: DayState[], currentStreak, completionPct }>, kpis: { loggedThisWeekPct, inactive3DaysCount, openSupportCount } }>`. للمشرف تُقيَّد المجموعات تلقائيًا بـ RLS. المرجع البصري: a01 وa20؛ مكوّنات `KpiCard` (عادية · تنبيه) و`ActivityRow` (14 خلية بحالات اليوم الأربع بالشكل)؛ حالة فراغ «لا طلاب بعد» غير مرسومة تُصمَّم بالرموز.

- [ ] **الخطوة 1: اختبار فاشل:** مع بذرة تحوي سجلّات معلومة: الشبكة تعرض 14 عمودًا بتواريخ هجرية/ميلادية في الرأس؛ طالب بلا تسجيل 3 أيام يحمل علامة ⚠ ويُحسب في «منقطعون»؛ اسم طالب طويل (40 حرفًا) يلتفّ ولا يُقصّ؛ الضغط على الاسم يفتح `/students/[id]`.
- [ ] **الخطوة 2–4:** فشل → تنفيذ → نجاح.
- [ ] **الخطوة 5:** commit: `feat(admin): overview grid and kpis`

### Task 3.4: الحضور (F-62)

**الملفات:**
- إنشاء: `app/(dash)/attendance/{page,[sessionId]/page}.tsx`, `src/components/attendance/{SessionList,NewSessionDialog,AttendanceGrid}.tsx`, `src/actions/attendance.ts`, `e2e/attendance.spec.ts`

**الواجهات:**
- يستهلك: `setAttendance` (T1.9). Server Actions: `createSession({ group_id: string | null, session_date, title })` (`null` = مجلس مشترك لكل المجموعات)، `saveAttendance(sessionId, rows)`. `AttendanceGrid` يعرض المُتابَعين مقسَّمين بالمجموعات مع «الكل حاضر» لكل قسم؛ المشرف يرى أقسام مجموعاته فقط. المرجع البصري: a03 وa21؛ مكوّن `AttendanceSegment` (لم يُسجَّل · حاضر · غائب · معذور).

- [ ] **الخطوة 1: اختبار فاشل:** المدير ينشئ مجلسًا لـ G1 بتاريخ اليوم؛ الشبكة تعرض طلاب G1 فقط؛ «الكل حاضر» ثم تعليم واحد غائبًا ثم حفظ → ملخّص الطالب الغائب يعرض `attendance_pct = 0` والحاضر `100`؛ المشرف `sup2` لا يرى مجالس G1؛ في مجلس مشترك يرى المدير قسمَي G1 وG2 ويرى `sup2` قسم G2 فقط ويحفظه.
- [ ] **الخطوة 2–4:** فشل → تنفيذ → نجاح.
- [ ] **الخطوة 5:** commit: `feat(admin): sessions and attendance marking`

### Task 3.5: إدارة العادات ومسار الأرشفة والاستبدال (F-63, BR-07)

**الملفات:**
- إنشاء: `supabase/migrations/0008_habit_admin.sql`, `supabase/tests/0008_habit_admin.test.ts`
- إنشاء: `app/(dash)/habits/page.tsx`, `src/components/habits/{HabitTable,HabitForm,ItemsEditor,ReplaceHabitDialog}.tsx`, `src/actions/habits.ts`, `e2e/habits.spec.ts`

**الواجهات:**
- يُنتج: RPC `archive_and_replace_habit(p_old_habit_id uuid, p_new jsonb, p_switch_date date) returns uuid` (مدير فقط): تضبط `active_to = p_switch_date - 1` للقديمة وتُدرج الجديدة بـ `active_from = p_switch_date` ونفس `frequency` و`sort_order`، وتُسجّل في `audit_log`؛ مُشغِّل يمنع `delete` من `habits` إذا كان لها `log_entries` (رسالة `HABIT_HAS_LOGS`)؛ Server Actions: `upsertHabit`, `reorderHabits(ids[])`, `upsertItem`, `archiveItem`, `replaceHabit`. المرجع البصري: a06 (جدول العادات بعمود هدف مرن ومقبض سحب) وa07 (نافذة الأرشفة والاستبدال).

- [ ] **الخطوة 1: اختبارات فاشلة:** DB: الاستبدال بتاريخ `2026-12-01` → القديمة `active_to='2026-11-30'`، الجديدة `active_from='2026-12-01'`؛ `active_habits_on('2026-11-30')` تعرض القديمة و`('2026-12-01')` الجديدة فقط؛ حذف عادة لها سجلّات → `HABIT_HAS_LOGS`. Playwright: تعديل اسم في مكانه ينعكس فورًا؛ نافذة «أرشفة واستبدال» تطلب الاسم والهدف وتاريخ البدء.
- [ ] **الخطوة 2–4:** فشل → تنفيذ → نجاح.
- [ ] **الخطوة 5:** commit: `feat(admin): habits management with archive-and-replace`

### Task 3.6: صندوق طلبات الدعم (F-64)

**الملفات:**
- إنشاء: `supabase/migrations/0009_support.sql`, `supabase/tests/0009_support.test.ts`, `app/(dash)/support/page.tsx`, `src/components/support/{SupportList,HandleDialog}.tsx`, `src/actions/support.ts`, `e2e/support.spec.ts`

**الواجهات:**
- يُنتج: RPC `handle_support_request(p_log_id uuid, p_note text) returns void` (مدير أو مشرف مجموعة الطالب): تضبط `support_status='handled', handled_by, handled_at, handled_note` وتُسجّل في `audit_log`. تبويب ثالث «طلبات حذف الحساب» يعرض `deletion_requests` المفتوحة مع زر «حذف نهائي» (يستدعي `deleteStudent` من T3.2 ثم يضبط `handled_at`). المرجع البصري: a04 وa05.

- [ ] **الخطوة 1: اختبارات فاشلة:** DB: مشرف مجموعة أخرى → `FORBIDDEN`؛ بعد المعالجة يعدّل الطالب النصّ عبر `save_log` → تعود `open` (BR-10). Playwright: القائمة تعرض الطلبات المفتوحة باسم الطالب والأسبوع ونصّ المراجعة؛ «تمّت المعالجة» يُخفيها من المفتوحة ويُظهرها في تبويب «المعالَجة».
- [ ] **الخطوة 2–4:** فشل → تنفيذ → نجاح.
- [ ] **الخطوة 5:** commit: `feat(admin): support requests inbox`

### Task 3.7: التقارير والتصدير (F-65)

**الملفات:**
- إنشاء: `app/(dash)/reports/page.tsx`, `app/api/export/route.ts`, `src/lib/csv.ts`, `src/lib/__tests__/csv.test.ts`, `e2e/reports.spec.ts`

**الواجهات:**
- يُنتج: `toCsv(rows: Record<string, string | number | null>[], headers: string[]): string` يبدأ بـ `﻿` ويقتبس الحقول ويستخدم `\r\n`؛ `GET /api/export?kind=daily|weekly|attendance&from=&to=&group=` يُرجع `text/csv; charset=utf-8` باسم ملف `awrad-daily-2026-11-01_2026-11-30.csv`، والصفوف مقيَّدة بـ RLS للمستدعي. أعمدة اليومي: الطالب، المجموعة، التاريخ، التاريخ الهجري، ثم عمود لكل عادة نشطة في الفترة (`تم/لم يتم/غير مطلوب` أو `n/m` للقوائم)، نسبة اليوم، الحالة، الملاحظة. المرجع البصري: a10.

- [ ] **الخطوة 1: اختبارات فاشلة:** `toCsv` يبدأ بـ BOM ويقتبس حقلًا يحوي فاصلة أو سطرًا جديدًا؛ Playwright: تنزيل CSV للمدير يحوي صفوف G1 وG2، وللمشرف `sup1` صفوف G1 فقط.
- [ ] **الخطوة 2–4:** فشل → تنفيذ → نجاح.
- [ ] **الخطوة 5:** commit: `feat(admin): csv export with bom and rls scoping`

### Task 3.8: الإعدادات (F-66)

**الملفات:**
- إنشاء: `app/(dash)/settings/page.tsx`, `src/components/settings/{AppSettingsForm,GroupsTable,GroupForm}.tsx`, `src/actions/settings.ts`, `e2e/settings.spec.ts`

**الواجهات:**
- يُنتج: نموذج يعدّل المفاتيح الستة في `app_settings` بتحقّق zod (`streak_threshold_pct` 50–100، `backfill_days` 0–14، `weekly_grace_days` 0–7، `hijri_adjustment_days` −2…2، وقت `HH:MM`)؛ إدارة المجموعات (اسم، منطقة زمنية من قائمة IANA، بداية الأسبوع، المشرفون — اختيار متعدّد يكتب في `group_supervisors`). كل تعديل يُسجَّل في `audit_log` بـ `settings.update`/`group.update`. المرجع البصري: a11.

- [ ] **الخطوة 1: اختبار فاشل:** تغيير `backfill_days` إلى 5 → `app_settings` تتحدّث وصفّ تدقيق يُضاف؛ المشرف لا يصل إلى `/settings`.
- [ ] **الخطوة 2–4:** فشل → تنفيذ → نجاح.
- [ ] **الخطوة 5:** commit: `feat(admin): app and group settings`

### Task 3.9: صفحة سياسة الخصوصية وحذف الحساب (F-80)

**الملفات:**
- إنشاء: `app/(public)/privacy/page.tsx`, `docs/privacy-policy.md` (المصدر العربي), `e2e/privacy.spec.ts`
- تعديل: `middleware.ts` (استثناء `/privacy`), `src/components/students/StudentDetail.tsx` (زر «حذف نهائي» بتأكيد مزدوج)

- [ ] **الخطوة 1: اختبار فاشل:** `/privacy` تُفتح دون دخول وتحوي العناوين: «ما نجمعه»، «من يرى بياناتك»، «حذف حسابك»، «التواصل»؛ حذف طالب يحذف سجلّاته (`logs` للمستخدم = 0) وحضوره.
- [ ] **الخطوة 2–4:** فشل → تنفيذ → نجاح.
- [ ] **الخطوة 5:** commit: `feat(admin): public privacy policy and permanent account deletion`

**معيار إنهاء المرحلة 3:** المدير يدعو طالبًا، يسجّل حضور مجلس، يستبدل عادة، يعالج طلب دعم، ويصدّر CSV؛ المشرف يرى مجموعته فقط؛ كل اختبارات Playwright خضراء في CI.

---

## المرحلة 4 — الإشعارات والترحيل

### Task 4.1: التذكيرات: `reminder_log` + دالة `send-reminders` + جدولة `pg_cron`

**الملفات:**
- إنشاء: `supabase/migrations/0010_reminders.sql`, `supabase/tests/0010_reminders.test.ts`, `supabase/functions/send-reminders/{index.ts,select.ts,select.test.ts}`

**الواجهات:**
- يُنتج: جدول `reminder_log(id, user_id, kind text check (kind in ('daily','weekly')), sent_for date, sent_at timestamptz, unique(user_id, kind, sent_for))`؛ RPC `due_reminders(p_now timestamptz) returns table(user_id uuid, kind text, sent_for date, tokens text[])` تُرجع المستخدمين النشطين المُتابَعين (`is_active and is_tracked`) الذين: ساعة `reminder_time` بمنطقتهم تساوي ساعة `p_now` المحلية، ولم يسجّلوا `sent_for` (اليومي: لا سجلّ `daily` لـ `local_today`؛ الأسبوعي: `local_today` هو آخر يوم في الأسبوع ولا سجلّ `weekly` للأسبوع)، ولم يُرسَل لهم اليوم (`reminder_log`)، ولهم رموز؛ جدولة: `select cron.schedule('send-reminders', '0 * * * *', $$ select net.http_post(url := current_setting('app.functions_url') || '/send-reminders', headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.cron_secret'))) $$)`.
- دالة Edge: تتحقّق من `CRON_SECRET`، تستدعي `due_reminders(now())` بمفتاح الخدمة، تُرسل عبر Expo Push API على دفعات 100، تُدرج في `reminder_log`، وتحذف الرموز التي تُرجع `DeviceNotRegistered`. النصّ اليومي: «لم تسجّل وردك اليوم بعد — دقيقة واحدة تكفي.» الأسبوعي: «حان وقت مراجعتك الأسبوعية.»

- [ ] **الخطوة 1: اختبارات فاشلة:** DB: مستخدم `reminder_time='21:00'`, منطقة `Asia/Riyadh`, `p_now='2026-11-26T18:10:00Z'` (= 21:10 محلي) ولم يسجّل → يظهر؛ سجّل اليوم → لا يظهر؛ أُرسل له اليوم → لا يظهر؛ `p_now` في ساعة 20 محلي → لا يظهر؛ الأسبوعي يظهر فقط في آخر يوم من أسبوع المجموعة. Deno: `chunk(tokens, 100)` و معالجة ردّ `DeviceNotRegistered` يحذف الرمز (mock fetch).
- [ ] **الخطوة 2–4:** فشل → تنفيذ → نجاح؛ تحقّق يدوي بإشعار حقيقي على جهاز عبر `supabase functions serve` + Expo Go/بناء تطوير.
- [ ] **الخطوة 5:** commit: `feat: hourly reminder job with expo push`

### Task 4.2: سكربت ترحيل بيانات Google Sheets

**الملفات:**
- إنشاء: `scripts/import-legacy/{package.json,tsconfig.json}`, `src/{parse,map,run,report,index}.ts`, `src/__tests__/{parse,map,run}.test.ts`, `fixtures/{daily.sample.csv,weekly.sample.csv,attendance.sample.csv}`, `mapping.example.json`, `README.md`

**الواجهات:**
- يُنتج: `parseDailyCsv(text): LegacyDailyRow[]` (يتعرّف أعمدة Google Forms: «الطابع الزمني», «اسمك», «التاريخ», وأعمدة العادات بنصوص `تم|لم يتم|غير مطلوب اليوم`, وأعمدة القوائم مفصولة بفواصل)؛ `buildMapping(rows, habits, profiles): Mapping` مع اقتراحات تطابق تقريبي للأسماء (normalize: إزالة التشكيل والهمزات وال التعريف)؛ `planImport(rows, mapping): ImportPlan` (`toImport`, `duplicatesResolved` بالأحدث حسب الطابع الزمني, `unmappedNames`, `invalidDates`)؛ `executeImport(plan, { dryRun })` يتصل بـ `SUPABASE_DB_URL` مباشرة (`pg`)، ويُنشئ لكل اسم غير موجود حسابًا معطَّلًا ببريد نائب `legacy-<n>@legacy.awrad.local` إن أُذن بذلك في الربط (`createMissingAsInactive: true`)، ثم داخل معاملة لكل طالب يستدعي `save_log(..., p_user_id)` بجلسة مدير (`set_config('request.jwt.claims', ...)`) فيتجاوز النافذة، ويضبط `joined_at = least(joined_at, أقدم سجلّ)`؛ الخانات الفارغة حسب `blankPolicy` (`not_required` افتراضيًا، BR-14)؛ CLI: `pnpm import-legacy --daily daily.csv --weekly weekly.csv --attendance attendance.csv --mapping mapping.json [--execute]` (الافتراضي معاينة).

- [ ] **الخطوة 1: اختبارات فاشلة:** `parse` يقرأ عيّنة بـ 12 صفًّا؛ صفّان لنفس الطالب والتاريخ → الأحدث يُعتمد ويُدرج القديم في `duplicatesResolved`؛ اسم غير مطابق → في `unmappedNames` ولا يُستورد؛ `dryRun: true` لا يستدعي `save_log` (mock)؛ تنفيذ مرّتين لا يُنتج صفوفًا مكرّرة (اختبار تكاملي ضدّ DB محلي)؛ الخانة الفارغة → `not_required` افتراضيًا و`not_done` عند `blankPolicy: 'not_done'`؛ بعد الاستيراد `joined_at` = أقدم تاريخ مستورد إن كان أقدم؛ اسم غير موجود مع `createMissingAsInactive` يُنشئ ملفًا معطَّلًا ببريد نائب.
- [ ] **الخطوة 2–4:** فشل → تنفيذ → نجاح.
- [ ] **الخطوة 5:** commit: `feat(scripts): legacy google sheets import with dry-run report`

### ~~T4.3~~ واجهة الاستيراد في اللوحة — مؤجَّلة إلى V2 (F-67)
حُذفت من النسخة الأولى بعد مراجعة المنفّذ: الاستيراد يحدث مرة واحدة ويحتاج اتصالًا مباشرًا بقاعدة البيانات ومفتاح الخدمة، فيُشغَّل السكربت (T4.2) بإشراف الفريق على ملفات الشيخ. انظر المرحلة 6.

**معيار إنهاء المرحلة 4:** تذكير حقيقي يصل لجهاز اختبار في الوقت المحدّد ولا يصل لمن سجّل؛ ملف Sheets حقيقي (مجهَّل) يُستورد بمعاينة ثم تنفيذ، وتظهر سلاسل الطلاب القديمة في ملخّصاتهم.

---

## المرحلة 5 — التجربة والإطلاق

### Task 5.1: البيئات والنشر (staging/production)
- [ ] إنشاء مشروعَي Supabase (staging, production)؛ `supabase link` و`supabase db push` لـ staging من CI على `main`، وللإنتاج يدويًا بموافقة (`workflow_dispatch`).
- [ ] أسرار الدوال: `supabase secrets set CRON_SECRET=… RESEND_API_KEY=…`؛ ضبط SMTP مخصّص (Resend) في Auth settings؛ قالب بريد OTP بالعربية (`supabase/templates/otp.html`).
- [ ] `app.functions_url` و`app.cron_secret` كـ database settings (`alter database postgres set app.functions_url = '…'`).
- [ ] Vercel: مشروع `admin` (Next.js) ومشروع `student-web` (مخرجات `expo export -p web`) مع متغيّرات البيئة.
- [ ] EAS: `eas.json` بملفات `development`, `preview`, `production`؛ `eas build --profile preview` لـ iOS (TestFlight) وAndroid (Internal testing)؛ إعداد FCM credentials وAPNs key في EAS.
- [ ] تحقّق: الدخول على staging ببريد حقيقي، إشعار تجريبي يصل، اللوحة تعمل على الرابط الإنتاجي.
- [ ] commit: `chore: environments, deployment workflows and eas profiles`

### Task 5.2: الهوية البصرية وأصول المتاجر (يعتمد على D18)
- [ ] تصدير الأصول من Figma (الهوية `8:45`، الإقلاع `33:138`، لقطات المتجر `33:154` و`33:184` و`33:305`): أيقونة التطبيق بكل المقاسات (مفتاح ذهبي على أخضر بلا نص)، شاشة البداية، ثلاث لقطات متجر 1320×2868 ثم مقاسات Android؛ اسم التطبيق «أوراد — مفاتيح العلوم» بعد تأكيد D18؛ وصف عربي قصير وطويل.
- [ ] commit: `chore(mobile): app icons, splash and store assets`

### Task 5.3: التجربة مع مجموعة واحدة (أسبوعان)
- [ ] إنشاء المجموعة ودعوة طلابها؛ ترحيل بياناتهم القديمة.
- [ ] قناة ملاحظات واحدة (مجموعة واتساب/نموذج) ⇒ تذاكر في المستودع بتسمية `pilot:`.
- [ ] معايير الخروج: ≥ 80% من الطلاب سجّلوا ≥ 5 أيام/أسبوع؛ صفر خلل خصوصية؛ لا خلل يمنع الحفظ؛ الشيخ سجّل حضور مجلسَين من اللوحة.
- [ ] إصلاح ما يظهر، ثم `eas update` للإصلاحات JS و`eas build` إن لزم.

### Task 5.4: نشر المتاجر
- [ ] App Store Connect: حساب مراجعة تجريبي (`reviewer@…` بطالب ببيانات)، ملاحظات المراجع بالعربية والإنجليزية، إعلان الخصوصية (App Privacy) مطابق لـ F-80، رابط حذف الحساب (مطلب Apple).
- [ ] Google Play: نموذج Data safety، الفئة «نمط حياة/تعليم»، الإصدار عبر Internal → Closed → Production.
- [ ] `eas submit` للمنصّتين؛ متابعة المراجعة؛ الردّ على الملاحظات.

### Task 5.5: الوثائق والتسليم
- [ ] `docs/admin-manual.md`: دليل الشيخ/المشرف بالعربية مع لقطات (دعوة طالب، الحضور، استبدال عادة، طلبات الدعم، التصدير، الاستيراد، الإعدادات).
- [ ] `docs/student-guide.md`: نسخة محدَّثة من «دليل الطالب» الحالي تحلّ فيه «حسابك» محلّ «روابطك الثلاثة».
- [ ] `docs/runbook.md`: النسخ الاحتياطي والاستعادة، تدوير الأسرار، إضافة مجموعة، ترقية الإصدارات، ما يُفعل إذا لم تصل الإشعارات/البريد.
- [ ] commit: `docs: admin manual, student guide and runbook`

**معيار إنهاء المرحلة 5:** التطبيق منشور على المتجرَين، اللوحة على نطاق الإنتاج، كل الطلاب مدعوون، والروابط القديمة أُغلقت أو جُعلت للقراءة فقط.

---

## المرحلة 6 — ما بعد الإطلاق (Backlog مرتَّب بالأولوية)

| # | الميزة | المرجع | ملاحظة |
|---|---|---|---|
| 1 | الدخول بحساب Google | F-04 / D1 | Supabase OAuth + `expo-auth-session` |
| 2 | Offline-first: صفّ محلي للحفظ وإعادة الإرسال | §3.2 | TanStack Query persist + مزامنة عند الاتصال |
| 3 | متتبّع الختمة (الربع 1–240 وتقدير يوم الختم) | F-34 | يحتاج حقل `quran_position` أو عادة من نوع `counter` |
| 4 | عادات مخصّصة بالمجموعة/الطالب | D7 | جدول `habit_assignments(user_id/group_id, habit_id, active_from, active_to)` |
| 5 | مزايا المشرف داخل تطبيق الجوّال (الحضور، النظرة العامة) | F-68 | إعادة استخدام RPCs الموجودة |
| 6 | إشعار بريدي بديل | F-53 | Resend من `send-reminders` |
| 7 | الأرقام العربية-الهندية كخيار | §4 | إعداد في الملف |
| 8 | لغة ثانية (إنجليزية) | §3.2 | i18n في `messages/` |
| 9 | شارات خاصة (أربعون يومًا، ختمة) بلا مقارنة بين الطلاب | §3.3 | بعد موافقة الشيخ على الفكرة |
| 10 | واجهة الاستيراد داخل اللوحة | F-67 | تغليف `scripts/import-legacy` بدالة Edge + معالج رفع ومعاينة |
| 11 | تذكير ويب (Web Push أو بريد) | D16 / F-53 | إن طلبه الشيخ بعد التجربة |
| 12 | مقاس اللوحي للتطبيق واللوحة، وصقل الوضع الداكن للوحة بشاشات مرسومة | §11.0 / D20 / D21 | بعد التجربة |

---

## تعريف «منتهٍ» لكل مهمة (Definition of Done)
1. الاختبارات المذكورة في المهمة موجودة وخضراء، و`pnpm lint && pnpm typecheck && pnpm test` خضراء.
2. لا نصّ عربي خارج `messages/ar.ts`، ولا اسم عادة في الكود.
3. لا خاصية `left/right` فيزيائية (قاعدة ESLint).
4. أي جدول/RPC جديد: سياسات RLS + اختبار صلاحيات في نفس المهمة.
5. تحقّق RTL يدوي للواجهات على المنصّات المستهدفة.
6. commit واحد أو أكثر برسائل Conventional Commits، وPR يصف المهمة ويشير إلى `F-xx`/`BR-xx`.
7. مراجعة مستقلة (وكيل مراجع أو بشري) قبل المهمة التالية.
8. مطابقة الإطار المرجعي في Figma للشاشة المنفَّذة (المسافات والمقاسات من الرموز، لا قيم يدوية)، والالتزام بقواعد التصميم التسع (المواصفة §11.0).
9. حالات التحميل والفراغ والخطأ لكل شاشة موجودة، ومصمَّمة بالرموز نفسها حيث لم تُرسم، ومرفقة بلقطة في وصف الـ PR.

## تقدير الجهد (بوكلاء برمجة + مراجع بشري)

| المرحلة | المهام | التقدير |
|---|---|---|
| 0 التأسيس | 3 | 2 أيام |
| 1 النواة | 9 | 1.5 أسبوع |
| 2 تطبيق الطالب | 8 | 2 أسابيع |
| 3 اللوحة | 9 | 1.5–2 أسابيع |
| 4 الإشعارات والترحيل | 2 | 1 أسبوع |
| 5 التجربة والإطلاق | 5 | 2–3 أسابيع (منها أسبوعان تجربة ومراجعة المتاجر خارج سيطرتنا) |
| **المجموع حتى الإطلاق** | **36** | **≈ 8–10 أسابيع** تقويمية؛ 6–7 أسابيع عمل فعلي |

الاعتماديات الحرجة: T0.3 قبل T2.1 وT3.1؛ المرحلة 1 قبل 2 و3؛ المرحلتان 2 و3 يمكن أن تسيرا بالتوازي؛ T4.1 بعد T2.7؛ T4.2 بعد T3.2 ويحتاج عيّنات D15؛ T5.2 يحتاج قرار D13؛ T5.4 يحتاج D8 وD17.
