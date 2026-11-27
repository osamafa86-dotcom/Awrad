# إعداد بيئة التطوير

## المتطلبات
- Node 22 أو أحدث، وpnpm 10 (`pnpm install` في جذر المستودع).
- عميل `psql` وPostgreSQL 16 (أدوات `pg_createcluster` و`pg_ctlcluster` على Debian/Ubuntu) للمسار ب.
- Docker وSupabase CLI للمسار أ.
- انسخ `.env.example` إلى `.env` (لا يُرفع إلى git). السكربتات تقرأ `.env` تلقائيًا.

## المسار أ: مع Docker (سير عمل Supabase القياسي)
```bash
supabase start      # يشغّل الحزمة المحلية كاملة ويطبّق الترحيلات
supabase status     # يعرض API URL وDB URL والمفاتيح؛ انسخها إلى .env
supabase db reset   # الترحيلات ثم supabase/seed.sql
```
في هذا المسار لا حاجة إلى ملف المحاكاة (shim) لأن Supabase توفّر `auth` والأدوار.
استخدم `supabase db reset` فقط؛ لا تشغّل `pnpm db:reset` على قاعدة Supabase Docker.
حزمة Supabase المحلية ومشاريع السحابة على PostgreSQL 17 (`major_version = 17` في `supabase/config.jsonc`؛ أداة Supabase تقبل 15 و17 فقط)، أما عنقود المسار ب فيبقى PostgreSQL 16. الترحيلات SQL عادي يجب أن يعمل على الاثنين، وCI يشغّلها على 16 (المهمّة `check`) وعلى 17 (المهمّة `admin-e2e`).

## المسار ب: بلا Docker (حاويات التطوير وCI)
> **تحذير:** `pnpm db:reset` للمسار ب فقط ويحذف القاعدة ثم ينشئها. يرفض أي هدف غير `127.0.0.1:54329/awrad`
> (إلا مع `--force` صريح). لا توجّهه أبدًا إلى Supabase Docker أو إلى مشروع سحابي.

يحتاج هذا المسار صلاحية root (أو sudo) لأن `pg_createcluster` و`su postgres` يتطلبانها.
يعتمد على عنقود PostgreSQL 16 مستقل باسم `awrad` على المنفذ **54329** (لا يمسّ العنقود `main`).

```bash
pnpm db:start   # ينشئ العنقود إن لزم، يشغّله، يضبط كلمة مرور postgres وينشئ قاعدة awrad
pnpm db:reset   # يحذف القاعدة وينشئها، ثم يطبّق shim ثم الترحيلات ثم seed.sql
pnpm db:stop    # يوقف العنقود
```
الرابط الافتراضي: `SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54329/awrad`.
للتحقق يدويًا:
```bash
psql "$SUPABASE_DB_URL" -c '\dt'
psql "$SUPABASE_DB_URL" -Atc "select auth.uid() is null, auth.role() is null"   # t|t
```
خيار `pnpm db:reset -- --no-shim` يتخطى ملفات `supabase/shim`.

### لماذا ملف المحاكاة (shim)؟
`supabase/shim/0000_auth.sql` يعيد إنشاء ما تقدّمه Supabase جاهزًا: مخطّط `auth` وجدول `auth.users`
ودوال `auth.uid()` و`auth.role()` و`auth.jwt()` (تقرأ `request.jwt.claims`) والأدوار `anon` و`authenticated`
و`service_role`. بدونه لا تعمل سياسات RLS ولا اختباراتها على PostgreSQL عادي. هو للمحلي وCI فقط:
`db:reset` لا يطبّقه إلا إذا كان المضيف `127.0.0.1` أو `localhost`، ولا يُطبَّق أبدًا على مشروع Supabase حقيقي.
يجب ألا تعتمد الترحيلات على شيء من المحاكاة غير ما توفّره Supabase نفسها.

### توليد الأنواع
`pnpm db:types` يشغّل `supabase gen types typescript --remote="$SUPABASE_DB_URL" --schema public` (بلا Docker، من مجلد عمل مؤقت فارغ حتى لا يقرأ `supabase/config.jsonc`) ثم ينسّق الناتج بـ prettier، فيُكتب `packages/supabase-client/src/database.types.ts` بشكل حتمي.

## استكشاف الأخطاء
- **العنقود موجود لكنه متوقّف:** `pnpm db:start` يشغّله؛ وللتشخيص `pg_lsclusters` وسجل
  `/var/log/postgresql/postgresql-16-awrad.log`.
- **المنفذ مشغول:** غيّر المنفذ بإيقاف الخدمة المستخدمة له (`ss -ltnp | grep 54329`). السكربت يرفض عنقودًا باسم `awrad` على منفذ مختلف؛ احذفه بـ `pg_dropcluster 16 awrad --stop` ثم أعد `pnpm db:start`.
- **فشل كلمة المرور:** `pnpm db:start` يعيد ضبطها إلى `postgres`؛ تأكد أن `.env` لا يحوي رابطًا بكلمة أخرى.
- **`db:reset` يفشل في منتصف ملف:** السكربت يتوقف عند أول خطأ (`ON_ERROR_STOP`) ويطبع اسم الملف والسطر.

## لوحة الإدارة (apps/admin)
لوحة الشيخ والمشرف: Next.js 16 (App Router) وTailwind 4 ومكوّنات بأسلوب shadcn مكتوبة يدويًا على `radix-ui`.

**المتغيّرات:** `NEXT_PUBLIC_SUPABASE_URL` و`NEXT_PUBLIC_SUPABASE_ANON_KEY` (API URL والمفتاح العام من `supabase status`
أو من لوحة المشروع). Next يقرأ ملفات `.env*` من مجلد التطبيق لا من الجذر، فضعهما في `apps/admin/.env.local` أو صدّرهما في الطرفية.
البناء يُضمِّن قيم `NEXT_PUBLIC_*` في الحزمة، فأعد `next build` بعد تغييرهما.

```bash
pnpm --filter admin dev         # http://localhost:3000
pnpm --filter admin test        # Vitest: الحارس resolveAccess والشريط الجانبي (بلا متغيّرات)
pnpm --filter admin e2e         # Playwright: يبني ثم يشغّل next start على المنفذ 3100
```

**الحارس:** `apps/admin/proxy.ts` (اسم middleware في Next 16) يطبّق `resolveAccess()` من `src/lib/access.ts` على كل طلب:
غير المسجَّل إلى `/login?next=…`، والطالب أو الحساب غير المفعَّل أو بلا ملف إلى `/unauthorized`، والمشرف خارج
`/habits` و`/settings`. هذا للتجربة فقط؛ الحماية الفعلية في RLS. `/privacy` (سياسة الخصوصية، F-80) عامة: يفتحها الجميع
مسجَّلين أو لا وبأي دور، بلا تحويل.

**سياسة الخصوصية (F-80):** النص العربي المعتمد في `docs/privacy-policy.md` (أربعة عناوين `##` بهذا الترتيب: «ما نجمعه»،
«من يرى بياناتك»، «حذف حسابك»، «التواصل»). الصفحة `apps/admin/app/(public)/privacy/page.tsx` تقرؤه وقت البناء
(`force-static`) وتعرضه بمحوّل صغير داخل المستودع (`src/lib/markdown.ts`: `#` و`##` وفقرات وقوائم `-` و`**عريض**` فقط)
داخل غلاف عام (`app/(public)/layout.tsx`) بلا شريط جانبي ولا جلسة. تطبيق الطالب يربط إليها من الإعدادات
(`${EXPO_PUBLIC_ADMIN_URL}/privacy`)، فالمسار ثابت. عدّل الملف ثم أعد البناء لتظهر التعديلات.

**الحذف النهائي:** صفحة الطالب ودرج طلبات الحذف يفتحان الحوار نفسه `src/components/ConfirmDeleteDialog.tsx`: يسمّي الطالب
وما يُحذف (الحساب، السجلّات، الحضور، طلبات الدعم)، ولا يتفعّل «حذف نهائي» حتى يُكتب الاسم الكامل كما هو (أو العبارة «حذف نهائي» إن لم يكن للطالب اسم مسجَّل)، ولا يُغلق
بـ Esc أثناء الحذف. `admin_delete_user` (ترحيل 0012) يحذف مع الحساب دعواته (كل صفّ في `invitations` ببريده)، ولا يبقى
إلا صفّ التدقيق `user.delete` بالمعرّف والبريد.

**طبقتا اختبار e2e** (`apps/admin/e2e/auth.spec.ts`، مشروعا `desktop` 1440 و`mobile` 390):
- **(أ) بلا تسجيل دخول — تعمل في أي مكان.** إن لم تُضبط `NEXT_PUBLIC_*` يبني الاختبار على `http://127.0.0.1:54321`
  بمفتاح وهمي؛ لا شيء يستمع هناك فيُعامَل كل طلب كغير مسجَّل. تتحقّق من التحويل إلى `/login` وRTL وحقل البريد LTR والخطّين والوضع الداكن.
- **(ب) بتسجيل دخول — تحتاج حزمة Supabase.** تُتخطّى ما لم تُضبط `E2E_SUPABASE_URL` و`E2E_SERVICE_ROLE_KEY`.
  `e2e/seed.ts` (إعداد Playwright العام) يُنشئ مجموعتَي اختبار ودعوات وحسابات (مُشغِّل `handle_new_user` يبني الملفات):
  `admin@` (مدير بلا مجموعة، غير مُتابَع)، و`sup1@`/`p1@`/`p3@test.example` في «مجموعة اختبار اللوحة» و`sup1` مشرفها،
  و`sup2@`/`p2@test.example` في «مجموعة اختبار أخرى» و`sup2` مشرفها (كل المشرفين والطلاب مُتابَعون)،
  و`p4@test.example` «طالب يطلب الحذف» في «مجموعة اختبار اللوحة» بطلب حذف حساب مفتوح (يُدرج بمفتاح الخدمة)،
  و`p5@test.example` «طالب للحذف النهائي» في المجموعة نفسها (مُتابَع) بسجلّ يومي واحد قبل يومين يُحفظ عبر `save_log` بجلسة المدير، وحضور في مجلس «مجلس اختبار الحذف النهائي» لمجموعته
بذلك اليوم عبر `set_attendance`؛
  والدخول عبر الواجهة برمز يولّده `auth.admin.generateLink`.
  ثم يحفظ سجلّات يومية معلومة لـ `p1` و`p3` عبر `save_log` بجلسة المدير (`generateLink` ثم `verifyOtp` بالمفتاح العام
  `E2E_SUPABASE_ANON_KEY`)، بتواريخ نسبية إلى اليوم بمنطقة `Asia/Riyadh`؛ فحزمة تبقى أيامًا تحتفظ بسجلّات الأيام السابقة أيضًا.
  ويحفظ لـ `p1` سجلّ الأسبوع الحالي (بداية أسبوع مجموعته) بمراجعة «مراجعة الأسبوع التجريبية» وطلب دعم
  «أحتاج مساعدة في ورد القيام» فتكون حالته `open` (BR-10). `resetSupportFixtures()` في `e2e/seed.ts` يعيد بمفتاح الخدمة
  هذا الطلب مفتوحًا (ويُفرغ حقول المعالجة) ويعيد إنشاء `p4` وطلبه إن حُذفا؛ تستدعيه البذرة ويستدعيه `e2e/support.spec.ts`
  قبل الملف وبعده، لأن مشروعَي `desktop` و`mobile` يعالجان الطلب ويحذفان `p4` كلٌّ في دوره.
  و`resetPermanentDeletionFixture()` يعيد إنشاء `p5` وسجلّه إن حُذفا؛ تستدعيه البذرة ويستدعيه `e2e/privacy.spec.ts` قبل الملف
  وبعده: الطبقة (أ) تفتح `/privacy` بلا دخول وتتحقّق من العناوين الأربعة و`lang="ar" dir="rtl"` ومهلة «30 يومًا»، والطبقة (ب)
  تفتحها بجلسة المدير (بلا تحويل) ثم تتحقّق أن لـ `p5` سجلّات وحضورًا، وتحذفه من صفحته بالتأكيد المزدوج، وتتحقّق بمفتاح الخدمة
أن لا ملف له ولا سجلّات ولا حضور.

تشغيل الطبقة (ب) محليًا (يحتاج Docker):
```bash
supabase start -x studio,imgproxy,logflare,vector,realtime,storage-api,postgres-meta,supavisor
eval "$(supabase status -o env)"      # API_URL و ANON_KEY و SERVICE_ROLE_KEY
NEXT_PUBLIC_SUPABASE_URL=$API_URL NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY \
E2E_SUPABASE_URL=$API_URL E2E_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY E2E_SUPABASE_ANON_KEY=$ANON_KEY \
pnpm --filter admin e2e
```
`E2E_SKIP_BUILD=1` يعيد استخدام بناء `.next` الموجود. إن لم يتوفّر متصفح Playwright فاضبط
`PW_CHROMIUM_EXECUTABLE` على مسار Chromium مثبَّت. في CI تشغّل المهمّة `admin-e2e` الطبقتين معًا.
مشروع Playwright المسمّى `setup` (`e2e/auth.setup.ts`) يسبق `desktop` و`mobile`: يسجّل دخول `admin@` و`sup1@` و`sup2@` مرة واحدة
عبر الواجهة ويحفظ الجلسات في `e2e/.auth/admin.json` و`e2e/.auth/sup1.json` و`e2e/.auth/sup2.json` (خارج git)، فتحمّلهما ملفات الطبقة (ب)
بـ `test.use({ storageState: authFile('admin') })` بدل تسجيل دخول في كل اختبار؛ `auth.spec.ts` وحده يسجّل الدخول بنفسه
لأن التدفق هو ما يختبره. بلا حزمة Supabase يُتخطّى المشروع ولا يحفظ شيئًا.
`e2e/helpers.ts` يجمع `signIn()` و`oneTimeCode()` و`authFile()` لكل الملفات؛ `e2e/students.spec.ts` يدعو حسابًا ببريد فريد
(`new-<وقت>-<مشروع>@test.example`) ويحذفه بمفتاح الخدمة في النهاية فتبقى البذرة كما هي، و`e2e/attendance.spec.ts`
ينشئ مجالس عناوينها تبدأ بـ `e2e-مجلس` ويحذفها بمفتاح الخدمة قبل الملف وبعده، و`e2e/habits.spec.ts` ينشئ عادات
أسبوعية أسماؤها تبدأ بـ `e2e-عادة` (لا يمسّ عادات البذرة، ولا يضيف يومية فتتغيّر أيام النظرة العامة) ويحذفها كذلك.

### العادات (F-63, BR-07) — ترحيل 0009
`supabase/migrations/0009_habit_admin.sql`: RPC `archive_and_replace_habit(p_old_habit_id, p_new jsonb, p_switch_date)`
للمدير وحده (القديمة `active_to = p_switch_date - 1`، والجديدة بنفس التكرار والترتيب من `p_switch_date`، وصفّ تدقيق
`habit.replace`)، ومُشغِّلا `before delete` على `habits` و`habit_items` يرفضان حذف ما يشير إليه سجلّ برمز `HABIT_HAS_LOGS`
(الأرشفة بدل الحذف)، وفهرسان على `log_entries(habit_id)` و`log_entry_items(habit_item_id)`. بعد إضافته: `pnpm db:reset`
ثم `pnpm db:types`. اختباراته (تعمل على عادات بادئة `test_hab_` يحذفها الملف، فتبقى البذرة كما هي):
```bash
pnpm --filter @awrad/db exec vitest run --config tests/vitest.config.ts tests/0009_habit_admin.test.ts
```
الصفحة `/habits` (للمدير؛ `?tab=weekly` يفتح الأسبوعية): التعديل في المكان والترتيب والأرشفة عبر Server Actions في
`src/actions/habits.ts` تحت RLS، والاستبدال عبر الـ RPC. الترتيب بالسحب يكتب `sort_order` صفًّا صفًّا (انظر `docs/backlog.md`).

### طلبات الدعم (F-64, BR-10) — ترحيل 0010
`supabase/migrations/0010_support.sql`: RPC `handle_support_request(p_log_id, p_note)` للمدير أو مشرف مجموعة صاحب السجلّ
(`FORBIDDEN` لغيرهما، و`INVALID_ITEM` لسجلّ غير موجود أو بلا طلب): تضبط `support_status = 'handled'` و`handled_by/at`
و`handled_note` (تُقصّ، والفارغة `null`) وتكتب صفّ تدقيق `support.handle`. إعادة الفتح حين يعدّل الطالب النصّ تبقى في
`save_log` (0006) التي تُفرغ حقول المعالجة. بعد إضافته: `pnpm db:reset` ثم `pnpm db:types`. اختباراته:
```bash
pnpm --filter @awrad/db exec vitest run --config tests/vitest.config.ts tests/0010_support.test.ts
```
الصفحة `/support` (المدير والمشرف؛ `?tab=open|handled|deletion`): «المفتوحة» و«المعالَجة» (آخر 90 يومًا) بـ RLS، وللمدير
وحده «طلبات حذف الحساب» (الطلبات المفتوحة، وآخر موعد بعد 30 يومًا، و«متأخّر» بعده): «حذف نهائي» يستدعي `deleteStudent(id, 'support')`
(`admin_delete_user`؛ صفّ الطلب يُحذف مع الحساب، وصفّ التدقيق هو السجلّ) و«رفض الطلب» يضبط `handled_at/handled_by`
تحت RLS المدير. بطاقة «طلبات دعم مفتوحة» في النظرة العامة تفتح `/support`.

### التقارير والتصدير (F-65)
الصفحة `/reports` (المدير والمشرف): نوع التقرير (يومي · أسبوعي · حضور)، والفترة («هذا الشهر» افتراضيًا، «الشهر الماضي»،
«آخر 30 يومًا»، أو تاريخان ميلاديان يظهر الهجري بجانب كلٍّ منهما)، والمجموعة؛ و«تنزيل CSV» رابط عادي إلى
`GET /api/export?kind=daily|weekly|attendance&from=YYYY-MM-DD&to=YYYY-MM-DD&group=<uuid>|all` (`app/api/export/route.ts`).
المسار يقرأ بعميل الكوكيز فتحدّ RLS الصفوف (المشرف يرى مجموعاته فقط مهما كان `group`): غير المسجَّل `401` والطالب أو
الحساب غير المفعَّل `403` واستعلام خاطئ (تاريخ غير صحيح، `from > to`، فترة أطول من 366 يومًا) `400`، كلها JSON؛ ولهذا
يترك الحارس (`resolveAccess`) مسارات `/api/` لمعالجها بدل التحويل إلى `/login`. الملف `text/csv; charset=utf-8` باسم
`awrad-<kind>-<from>_<to>.csv`، يبدأ بعلامة BOM (فيفتحه Excel بالعربية)، وكل حقل بين علامتَي تنصيص وأسطره `\r\n`، والنصّ
الذي يبدأ بـ `= + - @` أو جدولة يُسبق بفاصلة عليا (`src/lib/csv.ts`). الصفوف في `src/lib/export-rows.ts` (حالة اليوم
بـ `computeDayStatus` وعتبة `streak_threshold_pct`، والهجري بـ `hijri_adjustment_days`): صفّ لكل شخص مُتابَع نشط في كل يوم
(من انضمامه إلى «اليوم» بمنطقة مجموعته) أو أسبوع يبدأ في الفترة، أو لكل تعليم حضور في مجالس الفترة.
تجربته يدويًا: `curl -b <كوكيز الجلسة> 'http://localhost:3000/api/export?kind=daily&from=2026-11-01&to=2026-11-30' -o r.csv`
ثم `head -c 3 r.csv | xxd` يُظهر `efbb bf`. في e2e (`e2e/reports.spec.ts`) يُنزَّل الملف بالنقر على الرابط مع
`page.waitForEvent('download')` ثم يُقرأ من `download.path()`؛ والطلب المباشر بجلسة الدور عبر `page.request.get()`.
البذرة لا تضع في سجلّاتها عادات الاختبار (`test_hab_`، `e2e-عادة`)، وقبل الحفظ تحذف من بقاياها ما لا يشير إليه سجلّ؛ وما يشير إليه سجلّ (`HABIT_HAS_LOGS`) تتركه وتطبع عدده، ويُنظَّف يدويًا على تلك الحزمة.

### الإعدادات (F-66) — ترحيل 0011
`supabase/migrations/0011_settings.sql`: دالتان للمدير الفعّال وحده (`FORBIDDEN` لغيره)، كلٌّ في معاملة واحدة مع صفّ تدقيق:
- `update_app_settings(p_values jsonb)`: بعض المفاتيح الستة أو كلها (أي مفتاح آخر `INVALID_ITEM`)، بقواعدها: `streak_threshold_pct`
  عدد صحيح 50–100، `backfill_days` 0–14، `weekly_grace_days` 0–7، `hijri_adjustment_days` −2…2، `excused_counts_as_absent` منطقي،
  `default_reminder_time` نصّ `HH:MM`. يُحدَّث الموجود فقط، وصفّ `settings.update` بـ `diff = {key: {old, new}}` لما تغيّر فعلًا (لا صفّ إن لم يتغيّر شيء).
- `upsert_group(p_id, p_name, p_timezone, p_week_starts_on, p_supervisor_ids uuid[])`: `p_id` فارغ ينشئ وإلا يعدّل؛ الاسم مقصوص
  غير فارغ وفريد (بلا اعتبار لحالة الأحرف)، والمنطقة من `pg_timezone_names`، وبداية الأسبوع 0–6، والمشرفون ملفات فعّالة بدور
  `supervisor` أو `admin` (وإلا `INVALID_ITEM`)؛ تستبدل مجموعة `group_supervisors` تمامًا وتكتب `group.create`/`group.update`
  بالفرق (الاسم والمنطقة والأسبوع و`supervisors: {added, removed}`). لا حذف للمجموعات بعد (`docs/backlog.md`).

بعد إضافته: `pnpm db:reset` ثم `pnpm db:types`. اختباراته (تعيد `app_settings` إلى قيمها بعد كل اختبار):
```bash
pnpm --filter @awrad/db exec vitest run --config tests/vitest.config.ts tests/0011_settings.test.ts
```
الصفحة `/settings` (للمدير؛ `proxy.ts` يحوّل المشرف إلى `/`): «إعدادات النظام» بالحقول الستة وشرح سطر لكلٍّ منها، و«المجموعات»
(الاسم، المنطقة، بداية الأسبوع، المشرفون، عدد الأعضاء الفعّالين) مع «مجموعة جديدة» و«تعديل» في نافذة. قائمة المناطق
`Intl.supportedValuesOf('timeZone')` على الخادم، ومناطق المنطقة العربية أولًا. Server Actions في `src/actions/settings.ts`.
`e2e/settings.spec.ts` يغيّر `backfill_days` إلى 5 ويعيده إلى 2 بمفتاح الخدمة قبل الملف وبعده، وينشئ مجموعات أسماؤها تبدأ
بـ `مجموعة الإعدادات` ويحذفها كذلك (بلا أعضاء).

### دعوة طالب (F-01) ودالة `invite-user`
مسار الدعوة: نموذج «دعوة طالب» (`/students/new`) ← Server Action `inviteStudent` (يتحقّق بـ zod، والدور ثابت `student`)
← `supabase.functions.invoke('invite-user')` بعميل الكوكيز فيصل JWT المدير ← الدالة تتحقّق من `is_admin()` بعميل
المستخدم، ثم بمفتاح الخدمة: تُدرج `invitations` ← `auth.admin.createUser({ email_confirm: true })` (مُشغِّل
`handle_new_user` يبني الملف من الدعوة) ← `signInWithOtp` يرسل رمز الدخول بريدًا ترحيبيًا (محليًا في Mailpit؛ إن فشل
تبقى الإجابة 200 مع `welcome_sent: false`). الأخطاء `403 FORBIDDEN` و`409 EMAIL_EXISTS` و`400 INVALID_INPUT`
و`500 INVITE_FAILED`، وتُترجم في `src/messages/ar.ts`. الحذف النهائي ليس دالة Edge بل RPC `admin_delete_user` (ترحيل 0008).

بنية `supabase/functions`:
- `invite-user/index.ts` و`_shared/auth.ts`: مدخل Deno 2 لا يعمل إلا داخل Supabase Edge Runtime (`supabase start` بلا
  `-x edge-runtime`، أو `supabase functions serve`)؛ يقرأ `SUPABASE_URL` و`SUPABASE_ANON_KEY` و`SUPABASE_SERVICE_ROLE_KEY`
  التي يحقنها المشغّل. `deno.json` (في `supabase/functions/` وفي مجلد كل دالة) يربط `@supabase/supabase-js` بـ `npm:`. مستثناة من `tsc` وeslint في `@awrad/db`.
- `invite-user/handler.ts`: المنطق كله، وحدة نقية بلا استيرادات، تُختبر في Node:
```bash
pnpm --filter @awrad/db exec vitest run --config functions/vitest.config.ts   # handler.test.ts بتبعيات وهمية
pnpm --filter @awrad/db test     # اختبارات قاعدة البيانات ثم اختبارات الدوال
```

### التذكيرات (§12) — ترحيلا 0013 و0014 ودالة `send-reminders`
`supabase/migrations/0013_reminders.sql`:
- `reminder_log(user_id, kind daily|weekly, sent_for, sent_at)` فريد على `(user_id, kind, sent_for)`؛ `sent_for` اليوم المحلي
  (يومي) أو بداية الأسبوع (أسبوعي). RLS مفعّلة **بلا سياسات**: لا يراها المستخدم المسجَّل ولا يكتبها، و`service_role` وحده
  (يتجاوز RLS). تُحذف مع المستخدم (`on delete cascade`).
- `due_reminders(p_now)` لمفتاح الخدمة وحده (`request.jwt.claims.role = service_role`، وإلا `FORBIDDEN`): صفّ لكل تذكير مستحقّ
  مع `tokens text[]`. يومي: ملف فعّال مُتابَع، `reminder_time` غير فارغ وساعته = ساعة `p_now` بمنطقته (الملف ← المجموعة ←
  `Asia/Riyadh`، BR-08)، لا سجلّ `daily` لـ `local_today`، لا `reminder_log` لذلك اليوم، وله رمز. أسبوعي: مع `weekly_reminder`،
  و`local_today` آخر يوم في أسبوع مجموعته (BR-05)، لا سجلّ `weekly` لبداية الأسبوع، ولا `reminder_log` له.
- `ensure_reminder_schedule()` (المدير الفعّال، مفتاح الخدمة، أو الترحيل نفسه): تنشئ مهمّة `pg_cron` باسم `send-reminders`
  (`0 * * * *`) تستدعي `net.http_post(app.functions_url || '/send-reminders', Authorization: Bearer app.cron_secret)`،
  بعد حذف مهمّة بالاسم نفسه إن وُجدت، وترجع `true`. إن غاب `pg_cron` أو `pg_net` أو أحد الإعدادين: `notice` و`false`.
  الترحيل يستدعيها في آخره؛ **محليًا وفي CI لا يوجد pg_cron ولا pg_net**، فيطبع `db:reset` الـ notice ولا يجدول شيئًا.

- **ترحيل 0014 (القرار REM-3)** يستبدل `due_reminders`: التذكيران مفتاحان مستقلّان. اليومي يُطفأ بـ `reminder_time` فارغ،
  والأسبوعي بـ `weekly_reminder` وحده ويُرسَل في آخر يوم من أسبوع المجموعة عند ساعة
  `coalesce(reminder_time, default_reminder_time)` — فمن أطفأ اليومي يبقى له الأسبوعي على الساعة الافتراضية. و«الآن» واحد
  للساعة واليوم: `app.test_now` إن ضُبط (للاختبارات، كما في `local_today`) وإلا `p_now`.
- **الدقائق مُهمَلة عمدًا:** المهمّة تعمل كل ساعة عند الدقيقة 0 وتطابق الساعة وحدها، فتذكير `21:30` يصل نحو `21:00`.
- `reminder_log` يمنع إرسالًا ثانيًا **في الساعة نفسها** (إعادة محاولة أو استدعاء يدوي)؛ الساعة التالية تستبعدها مطابقة الساعة أصلًا.

بعد إضافته: `pnpm db:reset` ثم `pnpm db:types`. الاختبارات:
```bash
pnpm --filter @awrad/db exec vitest run --config tests/vitest.config.ts tests/0013_reminders.test.ts tests/0014_reminders_weekly_time.test.ts
pnpm --filter @awrad/db exec vitest run --config functions/vitest.config.ts   # send-reminders/handler.test.ts وinvite-user
```

`supabase/functions/send-reminders/`: `index.ts` مدخل Deno رقيق (يقرأ `CRON_SECRET` ويبني التبعيات بمفتاح الخدمة: RPC
`due_reminders`، `fetch` إلى Expo، حذف `push_tokens` بالرمز، `upsert` في `reminder_log` بـ `ignoreDuplicates`)؛ `handler.ts`
المنطق النقي: 401 بلا `Bearer <CRON_SECRET>` صحيح (أو إن لم يُضبط)، رسالة لكل رمز على دفعات 100 إلى
`https://exp.host/--/api/v2/push/send`، حذف الرموز التي تذكرتها `DeviceNotRegistered`، ثم صفّ `reminder_log` لكل تذكير
مستحقّ **أيًّا كان ردّ Expo** (فلا يتكرّر في الساعة نفسها)، والجواب `{ due, sent, failed, deletedTokens, deleteFailures,
logFailures }` (فشل الحذف أو كتابة السجلّ يُعدّ ويُطبع بـ `console.error` أعدادًا فقط، ولا يُرمى). التبعيات (عميل الخدمة) لا
تُبنى إلا بعد مطابقة السرّ. النصوص العربية في `messages.ts` وحده. الدالة **بلا verify_jwt** (`supabase/config.jsonc` ← `functions.send-reminders`،
وفي staging قائمة `NO_VERIFY_JWT` في `deploy/vps/functions-main/index.ts`) لأن المستدعي مهمّة cron لا مستخدم.

تمكين الجدولة (Cloud في Task 5.1، وstaging في `deploy/vps/README.md`)، مرّة، بدور يملك قاعدة البيانات (`postgres` على Cloud،
`supabase_admin` على الخادم):
```sql
create extension if not exists pg_cron;   -- على Cloud: Database → Extensions، أو هذا السطر
create extension if not exists pg_net;
alter database postgres set app.functions_url = 'https://<api>/functions/v1';   -- Cloud: https://<ref>.supabase.co/functions/v1
alter database postgres set app.cron_secret = '<secret>';                         -- القيمة نفسها سرّ CRON_SECRET للدالة
-- ثم في جلسة جديدة (إعدادات قاعدة البيانات تسري على الجلسات الجديدة):
select ensure_reminder_schedule();   -- true
select jobname, schedule from cron.job;   -- send-reminders | 0 * * * *
```
وسرّ الدالة: `supabase secrets set CRON_SECRET=<secret>` ثم `supabase functions deploy send-reminders`. لا شيء من هذا يُشغَّل
محليًا. التحقّق بإشعار حقيقي على جهاز في المرحلة 5 (`docs/backlog.md`).

## قبل النشر (Task 5.1)
- [ ] استبدل `extra.eas.projectId` في `apps/mobile/app.json` (القيمة المؤقتة `REPLACE_WITH_EAS_PROJECT_ID`) بمعرّف مشروع EAS؛ وإلا يعرض التطبيق «الإشعارات غير متاحة في هذا الإصدار».
