# أوراد — النسخة التجريبية على خادم المالك (`deploy/vps/`)

لوحة الشيخ وويب الطالب وواجهة متوافقة مع Supabase، مستضافةٌ ذاتيًّا على خادم المالك خلف Caddy الرئيس.
القاعدة: **المستودع يملك وصف بنيته، ومستودع البنية (mahfazapay) يملك مفاتيح تنفيذها** — هنا الوصف، والتنفيذ
في `deploy/ops/task.sh` هناك.

النسخة التجريبية هي `SITE=awrad` على `*.emdatra.org`، والأسماء أدناه أسماؤها؛ بيئةٌ ثانية (الإنتاج) تعمل من الملفات نفسها
بقيمٍ أخرى — انظر [«بيئة ثانية على الخادم نفسه»](#بيئة-ثانية-على-الخادم-نفسه).

| الاسم | ما يخدمه |
|---|---|
| `awrad.emdatra.org` | لوحة الشيخ — حاوية Next.js (`awrad-admin:3000`) |
| `awrad-app.emdatra.org` | ويب الطالب — تصدير Expo ساكن في `/srv/sites/www/awrad-app/current` يخدمه Caddy |
| `awrad-api.emdatra.org` | `/auth/v1` ← GoTrue · `/rest/v1` ← PostgREST · `/functions/v1` ← Edge Runtime · `/auth-templates/` قوالب البريد؛ غير ذلك 404 |
| `awrad-mail.emdatra.org` | صندوق Mailpit (رموز الدخول) خلف `basic_auth` |

## الملفات

| الملف | |
|---|---|
| `docker-compose.yml` | مشروع `$SITE` (من `-p` وحده؛ لا `name:` في الملف): `db`، `migrate` (مرّة)، `auth`، `rest`، `functions`، `mail`، `admin`، `web-build` (مرّة)، `import` (مرّة، ملف التعريف `tools`: استيراد الجداول القديمة). **لا منفذ منشور**. اسم الخدمة لا يقبل متغيّرًا، فالخدمات التي تنضمّ إلى `deploy_default` المشتركة تحمل اسمًا مجرّدًا ويصلها Caddy باسمها الصريح `${SITE}-auth`، `${SITE}-rest`، `${SITE}-functions`، `${SITE}-mail`، `${SITE}-admin` (و`${SITE}-db` على شبكة المشروع) — RUNBOOK §2؛ لا يُنادى الاسم المجرّد أبدًا |
| `env.example` | متغيّرات `/opt/sites/$SITE/.env` موثّقةً، بلا قيمة سرّية |
| `check-env.sh` | فحصٌ بلا Docker (يشغّله CI): يملأ compose بملفّي بيئة (التجريبية ونموذج إنتاج) ويقيس الأسماء البديلة والمسارات والروابط، ويفشل باسم المتغيّر إن غاب اسم نطاق. `--render <compose> <env>` يطبع الملف مملوءًا |
| `Dockerfile.admin` | ثلاث مراحل: `workspace` (المستودع وتبعيّاته — فيه يجري تصدير Expo)، `build` (`next build` بـ `output: 'standalone'`)، `admin` (الخادم وحده، مستخدم `node`) |
| `migrate.sh` | `supabase/migrations/*.sql` بالترتيب ثمّ `supabase/seed.sql` مرّة، كـ `postgres`، مع التتبّع في `ops.schema_migrations`، ثمّ `NOTIFY pgrst` |
| `web-build.sh` | `expo export -p web` ثمّ نسخٌ إلى `releases/<id>` وتبديل الرابط `current` ذرّيًّا |
| `functions-main/index.ts` | موجّه Edge Runtime: اسم الدالة من أوّل مقطع، والتحقّق من JWT قبل إنشاء العامل (إلا `send-reminders` في `NO_VERIFY_JWT`: تتحقّق بنفسها من `CRON_SECRET`)، وقائمة متغيّرات العامل المسموحة |
| `db-init/roles.sql`, `db-init/jwt.sql`, `db-init/auth-grants.sql`, `db-init/extensions.sql` | تُنفَّذ مرّةً عند تهيئة الحجم: كلمات مرور الأدوار، وإعدادات JWT، وصلاحيات `postgres` على `auth.users` (TRIGGER وREFERENCES وDELETE) التي تحتاجها الترحيلات، و`pg_cron` و`pg_net` لمهمّة التذكيرات |
| `auth-templates/magic-link.html` | بريد رمز الدخول بالعربية (`{{ .Token }}`)؛ يُنسخ إلى `/srv/sites/www/$SITE-api/auth-templates/` (يُطلب من `https://$API_HOST/auth-templates/`) |
| `awrad.caddy.tmpl` | الكتل الأربع؛ تملؤها المهمّة بحسب وضع Cloudflare، و`__SITE__` (7 مرّات) بالبيئة: الخوادم الخلفية `$SITE-admin` … والجذران `/srv/www/$SITE-app/current` و`/srv/www/$SITE-api` — Caddy الرئيس يركّب `/srv/sites/www` على `/srv/www`، فـ `WEB_ROOT` يبقى تحت `/srv/sites/www` |
| `seed-demo.sh` | الحسابات التجريبية (`admin@$ADMIN_HOST` …) وسجلّاتها (عبر `save_log` وحده) ومجلسٌ بحضور — مرّة |
| `backup.sh` | نسخة القاعدة (`pg_dump -Fc` داخل الحاوية إلى ملف ثمّ نسخه والتحقّق منه بـ sha256) مع أعداد صفوف كل جدول وأسطر `alter database … set app.*`، في `/opt/sites/$SITE/backups` (700/600)، وحذف ما تجاوز `RETENTION_DAYS` (14). أعداد فقط في المخرجات |
| `restore-rehearsal.sh` | تمرين استعادة: آخر نسخة في قاعدة مؤقّتة داخل حاوية القاعدة، ثمّ مقارنة أعداد الصفوف بما سُجّل وقت النسخ، ثمّ حذف المؤقّتة. الخروج 0 = كل جدول كما سُجّل |

## الأسرار — أين هي

على الخادم وحده، تولّدها المهمّة مرّة ولا تطبعها (لكل بيئة مجلّدها `/opt/sites/$SITE`؛ القيم أدناه للتجريبية):

- `/opt/sites/awrad/.env` (600): `POSTGRES_PASSWORD`، `JWT_SECRET`، `ANON_KEY`، `SERVICE_ROLE_KEY`، `MAIL_USER`، `MAIL_PASSWORD`، و`CRON_SECRET` (التذكيرات؛ انظر أدناه)، و`SMTP_PASS` في الإنتاج (انظر «البريد في الإنتاج»).
- `/opt/sites/$SITE/backups/` (700): النسخ وملفات `*.settings.sql` (فيها `app.cron_secret` وإعدادات JWT؛ 600).
- `/opt/sites/$SITE/import/` (700): ملفات الاستيراد (أسماء طلاب؛ 600) — خارج المستودعين.
- `/opt/sites/awrad/secrets/mail-basicauth.txt` (600): مستخدم صندوق البريد وكلمة مروره — `sudo cat` عبر SSH.
- `/opt/sites/awrad/secrets/mail-ui.htpasswd` (644، بصمة bcrypt وحدها): Mailpit نفسه يطلب الكلمة (`MP_UI_AUTH_FILE`)، فلا تقرأ حاويةٌ أخرى على `deploy_default` الرموز.

`ANON_KEY` عامّ بطبيعته (يُبنى في اللوحة والويب). `SERVICE_ROLE_KEY` لا يغادر الخادم: يصل دالة `invite-user` بيئةً (موجّه الدوال يمرّر للعامل قائمةً محدّدة لا بيئته كلّها)، وسكربت البذرة يقرؤه python من ملف `.env` نفسه فلا يظهر في وسائط أي عملية.

## إعادة النشر

ادفع إلى الفرع ثمّ أعِد مهمّة mahfazapay (أو على الخادم):

```sh
SITE=awrad                                 # أو بيئة الإنتاج
cd "/opt/sites/$SITE/repo"
dc() { docker compose -p "$SITE" --env-file "/opt/sites/$SITE/.env" -f deploy/vps/docker-compose.yml "$@"; }
dc --profile build build                   # فشلُ البناء لا يمسّ ما يعمل
dc up -d db && dc --profile tools run --rm migrate
dc up -d --remove-orphans auth rest functions mail admin
WEB_BUILD_MEM=2048m WEB_BUILD_HEAP=1536 dc --profile build run --rm web-build   # المهمّة تحسبهما من الذاكرة المتاحة
```

`dc` بلا `-p "$SITE"` خطأٌ من المستدعي: الملف لا يسمّي مشروعًا، فيأخذ compose اسم المجلّد (`vps`) — مشروعٌ آخر بأحجامٍ فارغة.

الأسرار لا تُولَّد ثانية، والحسابات لا تُمسّ (علامة `secrets/demo-seeded.done`).

## بيئة ثانية على الخادم نفسه

الإنتاج يعمل بجوار التجريبية على الخادم نفسه: **مشروع compose ثانٍ من الملفات نفسها**، بأحجامه وأسراره وجذر ويبه وأسمائه
العامّة. لا يشترك مع التجريبية إلا في Caddy وشبكة `deploy_default`. كل ما يميّز البيئة متغيّرٌ في `/opt/sites/$SITE/.env`
(قائمته الموثّقة في [`env.example`](env.example)):

| المتغيّر | التجريبية (اليوم) | الإنتاج (مثال؛ النطاق يسمّيه المالك) | إن غاب |
|---|---|---|---|
| `SITE` | `awrad` | `awrad-prod` | يفشل `docker compose config` باسمه (لا قيمة افتراضية: إنتاجٌ بلا `SITE` كان سيأخذ أسماء التجريبية البديلة) |
| `ADMIN_HOST` | `awrad.emdatra.org` | `awrad.example.org` | يفشل `docker compose config` باسمه |
| `APP_HOST` | `awrad-app.emdatra.org` | `app.awrad.example.org` | يفشل باسمه |
| `API_HOST` | `awrad-api.emdatra.org` | `api.awrad.example.org` | يفشل باسمه |
| `MAIL_HOST` | `awrad-mail.emdatra.org` | `mail.awrad.example.org` | يفشل باسمه |
| `AWRAD_SECRETS` | `/opt/sites/awrad/secrets` | `/opt/sites/awrad-prod/secrets` | `/opt/sites/$SITE/secrets` |
| `WEB_ROOT` | `/srv/sites/www/awrad-app` | `/srv/sites/www/awrad-prod-app` | `/srv/sites/www/$SITE-app` |

ومنها يُشتقّ كل شيء: الأسماء البديلة `${SITE}-auth|rest|functions|mail|admin` على `deploy_default` و`${SITE}-db` على شبكة
المشروع، والصورتان `${SITE}-admin:latest` و`${SITE}-workspace:latest` (اللوحة تحمل `https://$API_HOST` مبنيًّا فيها، فلا
تشترك البيئتان في صورة)، والأحجام `${SITE}_pgdata` و`${SITE}_dbconfig` (compose يسبقها باسم المشروع؛ لا `external` ولا
`name:` ثابت)، وروابط GoTrue (`SITE_URL`، `API_EXTERNAL_URL`، `URI_ALLOW_LIST`، قالب البريد، مرسِله `noreply@$ADMIN_HOST`)،
و`NEXT_PUBLIC_SUPABASE_URL` للوحة، و`EXPO_PUBLIC_*` لويب الطالب، وحسابات البذرة `admin@$ADMIN_HOST` ….

**قاعدة `-p "$SITE"`:** اسم المشروع يأتي من سطر الأوامر وحده (`docker compose -p "$SITE" --env-file /opt/sites/$SITE/.env -f …`).
نسيانه خطأ المستدعي — compose يأخذ اسم المجلّد `vps` فيبدأ مشروعًا فارغًا. و`SITE` في `.env` يساوي `-p` دائمًا.

**المجلّدات لكل بيئة:** `/opt/sites/$SITE/` (`.env`، `repo/`، `secrets/`، `.lock`)، `/srv/sites/www/$SITE-app` (ويب الطالب)،
`/srv/sites/www/$SITE-api` (قوالب البريد)، `/srv/sites/caddy/$SITE.caddy`.

**قبل الدفع:** `bash deploy/vps/check-env.sh` (يشغّله CI أيضًا)، ولملفّ بيئةٍ بعينه
`bash deploy/vps/check-env.sh --render deploy/vps/docker-compose.yml <ملف>`.

### ما يغيّره المتحكّم في `task.sh` لبيئة ثانية

بنود الجولة الأربعة عشر (هوية كل بيئة أعلى الملف، ومفاتيح `.env` غير السرّية، وتأكيد `SITE` وشكله، وعدّ المفاتيح، و`mask()`
بالاسم، وأسماء الخدمات المجرّدة، والعناوين `$SITE-*`، وفحص التصادم، والصور والأحجام، والمُصيِّر بـ `__SITE__`، ووضع كلاودفلير،
والبذرة) **طُبِّقت في mahfazapay `a33b200`**، وأثبتها تشغيل 13:01 UTC على التجريبية (`__SITE__` ×7 → `awrad`، والأسماء البديلة
العشرة كما هي، والأحجام لم تتغيّر). ما بقي لبيئة الإنتاج وحدها، في رأس `task.sh`:

- `SITE` و`ZONE` والأسماء الأربعة بقيم الإنتاج، و`TLS_MODE` (أو القياس على `$ADMIN_HOST`).
- `NOINDEX=0`: تُحذف أسطر `X-Robots-Tag "noindex` من الكتل الأربع (بوّابة الملفّ الحيّ تتوقّع 0 لا 4).
- البذرة التجريبية في الإنتاج: قرار المالك (الافتراضي: لا).
- مفاتيح البريد `SMTP_*` في `.env`، و`SMTP_PASS` في قائمة `mask()` (انظر «البريد في الإنتاج»).

## حدود المحاولات على الدخول (GoTrue)

رمز الدخول ستّ خانات صالح عشر دقائق؛ GoTrue v2.198 لا يطبّق حدوده لكل عميل على `/otp` و`/verify` إلا إن سُمّي له رأسٌ
يحمل عنوان العميل (`performRateLimitingWithHeader`)، وبدونها يمكن تجربة الرموز كلّها. القرار FIN-3:

- `docker-compose.yml`: `GOTRUE_RATE_LIMIT_HEADER: X-Real-Client-IP`.
- `awrad.caddy.tmpl`: كتلة الواجهة ترسل إلى `$SITE-auth` الرأس `header_up X-Real-Client-IP {client_ip}` — `header_up`
  يستبدل أي قيمة أرسلها العميل، فلا تُزوَّر. حدود GoTrue الافتراضية (OTP والتحقّق وتجديد الرموز) تسري حينئذٍ لكل عنوان.
- `check-env.sh` يقيس الاثنين معًا (الاسم نفسه في الملفين).

**جولة mahfazapay لاحقة (بعد هذه الدفعة):** `{client_ip}` اليوم عنوان حافّة Cloudflare لا الزائر، فالحدّ يقع على عناوين
Cloudflare (أخشن، لكنه خيرٌ من لا شيء). الجولة تضيف في الـ Caddyfile الرئيس
`servers { trusted_proxies static <نطاقات Cloudflare> ; client_ip_headers CF-Connecting-IP }`، وتقيس قبل وبعد: 31 طلب
`/verify` خاطئًا من عنوان واحد ← 429، وعنوان آخر في الوقت نفسه ← يمرّ. انتبه: طلبات اللوحة من الخادم (تجديد جلسات الطاقم)
تخرج عبر Cloudflare وتعود، فتقع كلّها على عنوان الخادم.

## البريد في الإنتاج (SMTP)

GoTrue يرسل رموز الدخول ورسائل الدعوة. التجريبية ترسل إلى صندوق Mailpit (`$SITE-mail:1025`، بلا مصادقة)؛ الإنتاج يحتاج مزوّد
SMTP حقيقيًّا «من اليوم الأول» (المواصفة §16). القرار FIN-4: المفاتيح تُقرأ من `.env`، وبدونها يبقى Mailpit:

| المفتاح | الافتراضي | |
|---|---|---|
| `SMTP_HOST` | `$SITE-mail` | خادم المزوّد |
| `SMTP_PORT` | `1025` | عادةً 587 |
| `SMTP_USER` / `SMTP_PASS` | فارغان (بلا مصادقة) | `SMTP_PASS` سرّ: في `.env` (600) وفي قائمة `mask()` |
| `SMTP_SENDER` | `noreply@$ADMIN_HOST` | عنوان المرسِل؛ نطاقه يحتاج SPF وDKIM عند المزوّد |
| `RATE_LIMIT_EMAIL_SENT` | `60` | رسائل GoTrue في الساعة للنسخة كلّها؛ ارفعه لدعوة الطلاب دفعةً (D12: حتى 300، مثلًا 400) |

اختيار المزوّد وأسراره وسجلّات DNS بند مالك في 5.1b. بعد الضبط: `dc up -d auth`، ثمّ رمز دخول حقيقي إلى بريد خارجي.

## استيراد الجداول القديمة على الخادم

لا SSH للفريق ولا منفذ للقاعدة، والمفتاح لا يغادر الخادم (القرار FIN-5): خدمة `import` في ملف التعريف `tools` تشغّل
`scripts/import-legacy` داخل شبكة المشروع (`$SITE-db`)، والملفات في `/opt/sites/$SITE/import/` (CSV و`mapping.json`
و`report.json`)، والمخرجات أعداد فقط (`--counts-only` جزء من نقطة الدخول). الخطوات الحرفية لجولة `task.sh` (معاينة ثمّ تنفيذ)
في [`docs/runbook.md`](../../docs/runbook.md) §«استيراد الجداول القديمة».

## النسخ الاحتياطي

`backup.sh` و`restore-rehearsal.sh` (القرار FIN-6) جاهزان ومجرَّبان محليًّا على PostgreSQL 16؛ **تثبيت المؤقّت الليلي وأوّل
تمرين استعادة على الخادم جولة mahfazapay** — بوّابة قبل أن يحمل الإنتاج بيانات حقيقية. الأوامر وخطّة الاستعادة الكاملة في
[`docs/runbook.md`](../../docs/runbook.md) §3.

## التذكيرات كل ساعة (Task 4.1) — مُفعَّلة

**الحال على النسخة التجريبية منذ 2026-11-27** (جولة mahfazapay `e32bbf3`، مقيسة في سجلّها):
`pg_cron` و`pg_net` مفعّلان على الحجم القائم، و`CRON_SECRET` في `/opt/sites/awrad/.env` وتمرّره الخدمة
`functions` (`awrad-functions`) للعامل، و`app.functions_url = http://awrad-functions:9000` و`app.cron_secret` على قاعدة
`postgres`، ومهمّة `send-reminders` مجدولة `0 * * * *` (`ensure_reminder_schedule()` ← `t`). الدالة تردّ 401 بلا
السرّ و200 به. الفحص والأعطال في [`docs/runbook.md`](../../docs/runbook.md) §7.

الترحيل `0013_reminders.sql` يستدعي `ensure_reminder_schedule()`، وهي لا تجدول شيئًا حتى يوجد `pg_cron` و`pg_net` ويُضبط
الإعدادان (notice فقط). الخطوات أدناه هي ما نُفِّذ، مرّةً وبالترتيب؛ تُعاد كما هي على حجم جديد (بعد `down -v` أو استعادة):

1. ولّد `CRON_SECRET` (مثل `openssl rand -hex 32`) وأضفه إلى `/opt/sites/awrad/.env` دون طباعته، ثم
   `dc up -d functions` (الخدمة تمرّره للعامل؛ بدونه تجيب `send-reminders` بـ 401 دائمًا).
2. الحجم القائم لا يعيد تشغيل `db-init`، فشغّل محتوى `db-init/extensions.sql` مرّة كـ `supabase_admin`
   (`dc exec -T db psql -U supabase_admin -d postgres -f -` أو السطرين مباشرة):
   `create extension if not exists pg_cron; create extension if not exists pg_net;`
   الصورة تحمّل `pg_cron` مسبقًا (`shared_preload_libraries`) و`cron.database_name = 'postgres'`؛ إن اختلف أحدهما في
   إصدار الصورة فأوقف هنا وأبلغ. (الحجم الجديد يُنشئهما من `db-init/extensions.sql` وحده.)
3. كـ `supabase_admin` أيضًا. السرّ يُقرأ من `.env` إلى متغيّر psql (`-v`) فلا يُكتب في نصّ SQL ولا في سجلّ الأوامر، و`:'secret'`
   يقتبسه psql. العنوان المضبوط على الخادم هو الداخلي `http://$SITE-functions:9000` (`db` و`functions` على شبكة
   المشروع نفسها، والموجّه يتوقّع `/send-reminders` مباشرة، فلا يمرّ الطلب بـ Caddy ولا يحتاج خروجًا إلى الإنترنت):
   ```sh
   CRON_SECRET=$(sudo grep -m1 '^CRON_SECRET=' "/opt/sites/$SITE/.env" | cut -d= -f2-)
   dc exec -T db psql -X -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -v secret="$CRON_SECRET" \
     -v url="http://$SITE-functions:9000" <<'SQL'
   alter database postgres set app.functions_url = :'url';
   alter database postgres set app.cron_secret = :'secret';
   SQL
   unset CRON_SECRET
   ```
   ثم **في جلسة جديدة** (الإعدادات تسري على الجلسات الجديدة): `select ensure_reminder_schedule();` ← `t`.
   (بديل عبر Caddy: `https://$API_HOST/functions/v1`.)
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

لبيئةٍ واحدة (`SITE`)، لا تمسّ الأخرى:

```sh
docker compose -p "$SITE" --env-file "/opt/sites/$SITE/.env" -f "/opt/sites/$SITE/repo/deploy/vps/docker-compose.yml" down -v   # يحذف قاعدتها
sudo rm "/srv/sites/caddy/$SITE.caddy" && docker exec deploy-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
sudo rm -rf "/srv/sites/www/$SITE-app" "/srv/sites/www/$SITE-api" "/opt/sites/$SITE"   # وسجلّات DNS الأربعة من Cloudflare
```
