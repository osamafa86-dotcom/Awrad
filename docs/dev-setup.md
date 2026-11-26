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
اضبط `SUPABASE_DB_URL` على عنوان القاعدة الذي يعرضه `supabase status` (عادةً المنفذ 54322).

## المسار ب: بلا Docker (حاويات التطوير وCI)
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
`pnpm db:types` يشغّل `supabase gen types typescript --db-url "$SUPABASE_DB_URL" --schema public`
ويكتب `packages/supabase-client/src/database.types.ts`. هذه الحزمة تُنشأ في مهمة لاحقة،
فيفشل الأمر الآن برسالة واضحة، وهذا متوقّع.

## استكشاف الأخطاء
- **العنقود موجود لكنه متوقّف:** `pnpm db:start` يشغّله؛ وللتشخيص `pg_lsclusters` وسجل
  `/var/log/postgresql/postgresql-16-awrad.log`.
- **المنفذ مشغول:** غيّر المنفذ بإيقاف الخدمة المستخدمة له (`ss -ltnp | grep 54329`). السكربت يرفض عنقودًا باسم `awrad` على منفذ مختلف؛ احذفه بـ `pg_dropcluster 16 awrad --stop` ثم أعد `pnpm db:start`.
- **فشل كلمة المرور:** `pnpm db:start` يعيد ضبطها إلى `postgres`؛ تأكد أن `.env` لا يحوي رابطًا بكلمة أخرى.
- **`db:reset` يفشل في منتصف ملف:** السكربت يتوقف عند أول خطأ (`ON_ERROR_STOP`) ويطبع اسم الملف والسطر.
