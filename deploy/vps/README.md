# أوراد — النسخة التجريبية على خادم المالك (`deploy/vps/`)

لوحة الشيخ وويب الطالب وواجهة متوافقة مع Supabase، مستضافةٌ ذاتيًّا على خادم المالك خلف Caddy الرئيس.
القاعدة: **المستودع يملك وصف بنيته، ومستودع البنية (mahfazapay) يملك مفاتيح تنفيذها** — هنا الوصف، والتنفيذ
في `deploy/ops/task.sh` هناك.

| الاسم | ما يخدمه |
|---|---|
| `awrad.emdatra.org` | لوحة الشيخ — حاوية Next.js (`awrad-admin:3000`) |
| `awrad-app.emdatra.org` | ويب الطالب — تصدير Expo ساكن في `/srv/sites/www/awrad-app/current` يخدمه Caddy |
| `awrad-api.emdatra.org` | `/auth/v1` ← GoTrue · `/rest/v1` ← PostgREST · `/functions/v1` ← Edge Runtime · `/auth-templates/` قوالب البريد؛ غير ذلك 404 |
| `awrad-mail.emdatra.org` | صندوق Mailpit (رموز الدخول) خلف `basic_auth` |

## الملفات

| الملف | |
|---|---|
| `docker-compose.yml` | مشروع `awrad`: `db`، `migrate` (مرّة)، `awrad-auth`، `awrad-rest`، `awrad-functions`، `awrad-mail`، `awrad-admin`، `web-build` (مرّة). **لا منفذ منشور**؛ الخدمات التي تنضمّ إلى `deploy_default` المشتركة مسمّاةٌ `awrad-*` (compose يسجّل اسم الخدمة على كل شبكاتها)، وبها يصل Caddy |
| `Dockerfile.admin` | ثلاث مراحل: `workspace` (المستودع وتبعيّاته — فيه يجري تصدير Expo)، `build` (`next build` بـ `output: 'standalone'`)، `admin` (الخادم وحده، مستخدم `node`) |
| `migrate.sh` | `supabase/migrations/*.sql` بالترتيب ثمّ `supabase/seed.sql` مرّة، كـ `postgres`، مع التتبّع في `ops.schema_migrations`، ثمّ `NOTIFY pgrst` |
| `web-build.sh` | `expo export -p web` ثمّ نسخٌ إلى `releases/<id>` وتبديل الرابط `current` ذرّيًّا |
| `functions-main/index.ts` | موجّه Edge Runtime: اسم الدالة من أوّل مقطع، والتحقّق من JWT قبل إنشاء العامل (إلا `send-reminders` في `NO_VERIFY_JWT`: تتحقّق بنفسها من `CRON_SECRET`)، وقائمة متغيّرات العامل المسموحة |
| `db-init/roles.sql`, `db-init/jwt.sql`, `db-init/auth-grants.sql`, `db-init/extensions.sql` | تُنفَّذ مرّةً عند تهيئة الحجم: كلمات مرور الأدوار، وإعدادات JWT، وصلاحيات `postgres` على `auth.users` (TRIGGER وREFERENCES وDELETE) التي تحتاجها الترحيلات، و`pg_cron` و`pg_net` لمهمّة التذكيرات |
| `auth-templates/magic-link.html` | بريد رمز الدخول بالعربية (`{{ .Token }}`)؛ يُنسخ إلى `/srv/sites/www/awrad-api/auth-templates/` |
| `awrad.caddy.tmpl` | الكتل الأربع؛ تملؤها المهمّة بحسب وضع Cloudflare |
| `seed-demo.sh` | الحسابات التجريبية وسجلّاتها (عبر `save_log` وحده) ومجلسٌ بحضور — مرّة |

## الأسرار — أين هي

على الخادم وحده، تولّدها المهمّة مرّة ولا تطبعها:

- `/opt/sites/awrad/.env` (600): `POSTGRES_PASSWORD`، `JWT_SECRET`، `ANON_KEY`، `SERVICE_ROLE_KEY`، `MAIL_USER`، `MAIL_PASSWORD`، و`CRON_SECRET` (التذكيرات؛ انظر أدناه).
- `/opt/sites/awrad/secrets/mail-basicauth.txt` (600): مستخدم صندوق البريد وكلمة مروره — `sudo cat` عبر SSH.
- `/opt/sites/awrad/secrets/mail-ui.htpasswd` (644، بصمة bcrypt وحدها): Mailpit نفسه يطلب الكلمة (`MP_UI_AUTH_FILE`)، فلا تقرأ حاويةٌ أخرى على `deploy_default` الرموز.

`ANON_KEY` عامّ بطبيعته (يُبنى في اللوحة والويب). `SERVICE_ROLE_KEY` لا يغادر الخادم: يصل دالة `invite-user` بيئةً (موجّه الدوال يمرّر للعامل قائمةً محدّدة لا بيئته كلّها)، وسكربت البذرة يقرؤه python من ملف `.env` نفسه فلا يظهر في وسائط أي عملية.

## إعادة النشر

ادفع إلى الفرع ثمّ أعِد مهمّة mahfazapay (أو على الخادم):

```sh
cd /opt/sites/awrad/repo
dc() { docker compose -p awrad --env-file /opt/sites/awrad/.env -f deploy/vps/docker-compose.yml "$@"; }
dc --profile build build                   # فشلُ البناء لا يمسّ ما يعمل
dc up -d db && dc --profile tools run --rm migrate
dc up -d awrad-auth awrad-rest awrad-functions awrad-mail awrad-admin
WEB_BUILD_MEM=2048m WEB_BUILD_HEAP=1536 dc --profile build run --rm web-build   # المهمّة تحسبهما من الذاكرة المتاحة
```

الأسرار لا تُولَّد ثانية، والحسابات لا تُمسّ (علامة `secrets/demo-seeded.done`).

## التذكيرات كل ساعة (Task 4.1) — مُفعَّلة

**الحال على النسخة التجريبية منذ 2026-11-27** (جولة mahfazapay `e32bbf3`، مقيسة في سجلّها):
`pg_cron` و`pg_net` مفعّلان على الحجم القائم، و`CRON_SECRET` في `/opt/sites/awrad/.env` وتمرّره الخدمة
`awrad-functions` للعامل، و`app.functions_url = http://awrad-functions:9000` و`app.cron_secret` على قاعدة
`postgres`، ومهمّة `send-reminders` مجدولة `0 * * * *` (`ensure_reminder_schedule()` ← `t`). الدالة تردّ 401 بلا
السرّ و200 به. الفحص والأعطال في [`docs/runbook.md`](../../docs/runbook.md) §7.

الترحيل `0013_reminders.sql` يستدعي `ensure_reminder_schedule()`، وهي لا تجدول شيئًا حتى يوجد `pg_cron` و`pg_net` ويُضبط
الإعدادان (notice فقط). الخطوات أدناه هي ما نُفِّذ، مرّةً وبالترتيب؛ تُعاد كما هي على حجم جديد (بعد `down -v` أو استعادة):

1. ولّد `CRON_SECRET` (مثل `openssl rand -hex 32`) وأضفه إلى `/opt/sites/awrad/.env` دون طباعته، ثم
   `dc up -d awrad-functions` (الخدمة تمرّره للعامل؛ بدونه تجيب `send-reminders` بـ 401 دائمًا).
2. الحجم القائم لا يعيد تشغيل `db-init`، فشغّل محتوى `db-init/extensions.sql` مرّة كـ `supabase_admin`
   (`docker exec awrad-db-1 psql -U supabase_admin -d postgres -f -` أو السطرين مباشرة):
   `create extension if not exists pg_cron; create extension if not exists pg_net;`
   الصورة تحمّل `pg_cron` مسبقًا (`shared_preload_libraries`) و`cron.database_name = 'postgres'`؛ إن اختلف أحدهما في
   إصدار الصورة فأوقف هنا وأبلغ. (الحجم الجديد يُنشئهما من `db-init/extensions.sql` وحده.)
3. كـ `supabase_admin` أيضًا. السرّ يُقرأ من `.env` إلى متغيّر psql (`-v`) فلا يُكتب في نصّ SQL ولا في سجلّ الأوامر، و`:'secret'`
   يقتبسه psql. العنوان المضبوط على الخادم هو الداخلي `http://awrad-functions:9000` (`db` و`awrad-functions` على شبكة
   المشروع نفسها، والموجّه يتوقّع `/send-reminders` مباشرة، فلا يمرّ الطلب بـ Caddy ولا يحتاج خروجًا إلى الإنترنت):
   ```sh
   CRON_SECRET=$(sudo grep -m1 '^CRON_SECRET=' /opt/sites/awrad/.env | cut -d= -f2-)
   docker exec -i awrad-db-1 psql -X -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -v secret="$CRON_SECRET" <<'SQL'
   alter database postgres set app.functions_url = 'http://awrad-functions:9000';
   alter database postgres set app.cron_secret = :'secret';
   SQL
   unset CRON_SECRET
   ```
   ثم **في جلسة جديدة** (الإعدادات تسري على الجلسات الجديدة): `select ensure_reminder_schedule();` ← `t`.
   (بديل عبر Caddy: `https://awrad-api.emdatra.org/functions/v1`.)
4. القياس (أعداد فقط، لا أسرار ولا رموز):
   `select count(*) from cron.job where jobname = 'send-reminders';` ← 1، وبعد أوّل ساعة كاملة
   `select status, count(*) from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'send-reminders') group by status;`
   و`select status_code, count(*) from net._http_response group by status_code;` (200 = الدالة أجابت؛ 401 = السرّان مختلفان).

إعادة تشغيل `ensure_reminder_schedule()` آمنة (تحذف المهمّة بالاسم نفسه وتعيد إنشاءها)؛ الإيقاف:
`select cron.unschedule('send-reminders');`.

## الدخول

1. افتح `https://awrad.emdatra.org` (أو `https://awrad-app.emdatra.org` للطالب) واكتب البريد، مثل `admin@awrad.emdatra.org`.
2. افتح `https://awrad-mail.emdatra.org` بالمستخدم وكلمة المرور من `mail-basicauth.txt`، واقرأ الرمز ذا الستّ خانات.
3. اكتب الرمز. الحسابات: `admin@` (الشيخ)، `supervisor@` (المشرف)، `student1@` و`student2@` — كلّها على `awrad.emdatra.org`.

## التراجع الكامل

```sh
docker compose -p awrad --env-file /opt/sites/awrad/.env -f /opt/sites/awrad/repo/deploy/vps/docker-compose.yml down -v   # يحذف القاعدة
sudo rm /srv/sites/caddy/awrad.caddy && docker exec deploy-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
sudo rm -rf /srv/sites/www/awrad-app /srv/sites/www/awrad-api /opt/sites/awrad   # وسجلّات DNS الأربعة من Cloudflare
```
