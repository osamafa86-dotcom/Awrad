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
مشاريع السحابة تُنشأ على PostgreSQL 16 ليتطابق مع العنقود المحلي (`major_version = 16` في `supabase/config.jsonc`)، أو تُرقّى الاثنتان معًا.

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
`/habits` و`/settings`. هذا للتجربة فقط؛ الحماية الفعلية في RLS.

**طبقتا اختبار e2e** (`apps/admin/e2e/auth.spec.ts`، مشروعا `desktop` 1440 و`mobile` 390):
- **(أ) بلا تسجيل دخول — تعمل في أي مكان.** إن لم تُضبط `NEXT_PUBLIC_*` يبني الاختبار على `http://127.0.0.1:54321`
  بمفتاح وهمي؛ لا شيء يستمع هناك فيُعامَل كل طلب كغير مسجَّل. تتحقّق من التحويل إلى `/login` وRTL وحقل البريد LTR والخطّين والوضع الداكن.
- **(ب) بتسجيل دخول — تحتاج حزمة Supabase.** تُتخطّى ما لم تُضبط `E2E_SUPABASE_URL` و`E2E_SERVICE_ROLE_KEY`.
  `e2e/seed.ts` (إعداد Playwright العام) يُنشئ مجموعة اختبار ودعوات وحسابات `admin@`/`sup1@`/`p1@test.example`
  (مُشغِّل `handle_new_user` يبني الملفات)، والدخول عبر الواجهة برمز يولّده `auth.admin.generateLink`.

تشغيل الطبقة (ب) محليًا (يحتاج Docker):
```bash
supabase start -x studio,imgproxy,edge-runtime,logflare,vector,realtime,storage-api,postgres-meta,supavisor
eval "$(supabase status -o env)"      # API_URL و ANON_KEY و SERVICE_ROLE_KEY
NEXT_PUBLIC_SUPABASE_URL=$API_URL NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY \
E2E_SUPABASE_URL=$API_URL E2E_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY pnpm --filter admin e2e
```
`E2E_SKIP_BUILD=1` يعيد استخدام بناء `.next` الموجود. إن لم يتوفّر متصفح Playwright فاضبط
`PW_CHROMIUM_EXECUTABLE` على مسار Chromium مثبَّت. في CI تشغّل المهمّة `admin-e2e` الطبقتين معًا.

## قبل النشر (Task 5.1)
- [ ] استبدل `extra.eas.projectId` في `apps/mobile/app.json` (القيمة المؤقتة `REPLACE_WITH_EAS_PROJECT_ID`) بمعرّف مشروع EAS؛ وإلا يعرض التطبيق «الإشعارات غير متاحة في هذا الإصدار».
