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
| `docker-compose.yml` | مشروع `$SITE` (من `-p` وحده؛ لا `name:` في الملف): `db`، `migrate` (مرّة)، `auth`، `rest`، `functions`، `mail`، `admin`، `web-build` (مرّة). **لا منفذ منشور**. اسم الخدمة لا يقبل متغيّرًا، فالخدمات التي تنضمّ إلى `deploy_default` المشتركة تحمل اسمًا مجرّدًا ويصلها Caddy باسمها الصريح `${SITE}-auth`، `${SITE}-rest`، `${SITE}-functions`، `${SITE}-mail`، `${SITE}-admin` (و`${SITE}-db` على شبكة المشروع) — RUNBOOK §2؛ لا يُنادى الاسم المجرّد أبدًا |
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

## الأسرار — أين هي

على الخادم وحده، تولّدها المهمّة مرّة ولا تطبعها (لكل بيئة مجلّدها `/opt/sites/$SITE`؛ القيم أدناه للتجريبية):

- `/opt/sites/awrad/.env` (600): `POSTGRES_PASSWORD`، `JWT_SECRET`، `ANON_KEY`، `SERVICE_ROLE_KEY`، `MAIL_USER`، `MAIL_PASSWORD`، و`CRON_SECRET` (التذكيرات؛ انظر أدناه).
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
| `SITE` | `awrad` | `awrad-prod` | `awrad` — **فاكتبه دائمًا**: إنتاجٌ بلا `SITE` يأخذ أسماء التجريبية البديلة |
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

### ما يغيّره المتحكّم في `task.sh` (mahfazapay، جولة منفصلة)

الملفات هنا تُبقي التجريبية كما هي بقيمها اليوم؛ و`task.sh` الحاليّ لا يعمل عليها حتى تُطبَّق البنود 1–8 (أوّلها: `.env`
القائم بلا أسماء نطاق، فيفشل compose؛ والمُصيِّر الحاليّ يرفض `__SITE__`). البنود كلّها تتقارب، فتُعاد المهمّة بلا ضرر.

**ترتيب العمل:** (أ) يُدفع فرع Awrad `build/mvp` أوّلًا — دفعه لا ينشر شيئًا بنفسه: الخادم لا يسحب الفرع إلا حين تعمل مهمّة
mahfazapay. (ب) ثمّ جولة `task.sh` واحدة بالبنود كلّها، ودفعها إلى mahfazapay `main` هو الذي ينشر (يسحب `build/mvp` ويبني).
لا تُعَد المهمّة الحاليّة بين (أ) و(ب): ستفشل قبل أي `up` (لا يُمسّ ما يعمل)، لكنّها جولةٌ ضائعة.

- [ ] **1. الهوية أعلى الملف لكل بيئة:** `SITE` و`ZONE` و`ADMIN_HOST`/`APP_HOST`/`API_HOST`/`MAIL_HOST` (للإنتاج قيمه)،
  و`WWW_APP=/srv/sites/www/$SITE-app` و`WWW_API=/srv/sites/www/$SITE-api` بدل `awrad-app`/`awrad-api` الحرفيّين.
  فحصا `wallt.emdatra.org`/`fin.emdatra.org` يبقيان حرفيّين (موقعان آخران، لا `$ZONE`).
- [ ] **2. مفاتيح `.env` غير السرّية:** في §٣، كل تشغيل وقبل أوّل `dc`، اكتب (إضافةً أو استبدالًا، ذرّيًا كـ `CRON_SECRET`)
  `SITE` و`ADMIN_HOST` و`APP_HOST` و`API_HOST` و`MAIL_HOST` و`AWRAD_SECRETS=$SECRETS_DIR` و`WEB_ROOT=$WWW_APP`. وصدِّرها أيضًا في `dc()` (`SITE=… ADMIN_HOST=… docker compose …`؛ البيئة تغلب
  `--env-file`)، و`export WEB_ROOT=$WWW_APP` بجوار `export AWRAD_SECRETS` القائم.
  ثم قبل البناء: `dc --profile tools --profile build config -q || fail` (يفشل بلا تغيير إن غاب اسم، أو إن كان compose أقدم من
  الاستيفاء المتداخل `${A:-/x/${B:-y}}` الذي تستعمله المسارات الافتراضية)، و`dc config --format json` يُقرأ منه أنّ كل اسمٍ بديل
  يبدأ بـ `$SITE-` — بوّابةٌ تقيس الأثر لا سلامة ما حوله.
- [ ] **3. تأكيد `SITE`:** بعد كتابة المفاتيح وقبل أوّل `dc`، تفشل المهمّة إن غاب `SITE` من `.env` أو خالف مشروع `-p`:
  `s=$(envval SITE); [ -n "$s" ] && [ "$s" = "$SITE" ] || fail ".env: SITE=«$s» لا يطابق المشروع $SITE — لم يُغيَّر شيء"`.
  (`SITE` الغائب يأخذ في compose القيمة `awrad`، فبيئةُ إنتاجٍ بلا `SITE` كانت ستحمل أسماء التجريبية البديلة.)
- [ ] **3ب. `mask()` يحجب الأسرار وحدها، لا الأسماء ولا المسارات:** اليوم يحجب كل قيمة في `.env` طولها ≥ 8، فستصير
  `ADMIN_HOST` … و`AWRAD_SECRETS` و`WEB_ROOT` `***` في السجلّ. اجعله قائمةً بالاسم: `POSTGRES_PASSWORD` و`JWT_SECRET`
  و`ANON_KEY` و`SERVICE_ROLE_KEY` و`MAIL_PASSWORD` و`CRON_SECRET` (و`MAIL_USER` ليس سرًّا).
- [ ] **4. أسماء الخدمات:** `awrad-auth awrad-rest awrad-functions awrad-mail awrad-admin` ← `auth rest functions mail admin`
  في `dc --profile tools pull -q …` و`dc up -d --remove-orphans …` وحلقة `for s in …; dc ps -q "$s"` و`dc ps -q awrad-auth`
  (§٩ب). **`--remove-orphans` لازم في أوّل نشرٍ بعد هذا التغيير، وخمس حاويات تُعاد إنشاؤها:** `awrad-awrad-auth-1`
  و`-rest-1` و`-functions-1` و`-mail-1` و`-admin-1` تصير يتيمةً وتحمل الأسماء البديلة نفسها (`awrad-auth` …)، فإن بقيت
  تناوبت مع الجديدة (`awrad-auth-1` …) على DNS. يُتوقّع ثوانٍ من 502 على الأسماء الأربعة، وتضيع رسائل Mailpit (في الذاكرة)؛
  القاعدة (`awrad-db-1`) وحجمها لا يُمسّان. (`dc up -d db` لا يتغيّر.)
- [ ] **5. العناوين على شبكة Caddy:** `cw http://awrad-auth:9999/health` وأخواتها ← `http://$SITE-auth:9999/…`،
  و`FN_URL=http://awrad-functions:9000` ← `http://$SITE-functions:9000` (قيمة التجريبية لا تتغيّر، فلا يُعاد الضبط).
- [ ] **6. فحص التصادم §١:** `ours` ← `{"$SITE-auth", "$SITE-rest", "$SITE-functions", "$SITE-mail", "$SITE-admin", "$SITE-db"}`،
  واستثناء المشروع `== "awrad"` ← `$SITE` (مرّرهما argv). وأضف: لا كتلة Caddy تنادي اسمًا مجرّدًا
  (`grep -E 'reverse_proxy +(auth|rest|functions|mail|admin)(:|$)' /srv/sites/caddy/*.caddy /etc/caddy/Caddyfile` ← لا شيء)،
  لأن البيئتين تسجّلان `auth` … على `deploy_default`.
- [ ] **7. الصور والمرشّحات:** `awrad-admin:latest awrad-workspace:latest` ← `$SITE-admin:latest $SITE-workspace:latest`
  (`old_imgs`، حلقة الحذف، سطر «بُنيت الصورتان»، `grep -E '^awrad-(admin|workspace):'`)؛ و`label=com.docker.compose.project=awrad`
  ← `$SITE` (حذف المتدلّي وعدّ المنافذ)؛ و`docker volume inspect awrad_pgdata` ← `${SITE}_pgdata`.
- [ ] **8. المُصيِّر (§٧):** `awrad.caddy.tmpl` يحمل `__SITE__` **7 مرّات** (5 خوادم خلفية `__SITE__-admin:3000`
  و`-auth:9999` و`-rest:3000` و`-functions:9000` و`-mail:8025`، وجذران `/srv/www/__SITE__-app/current` و`/srv/www/__SITE__-api`)،
  فأضف إلى `values` السطر `"__SITE__": (SITE, 7),` ومرّر `SITE="$SITE"` في بيئة python (كـ `PFX`/`TLS`)، مع `one_line` عليه.
  المُصيِّر الحاليّ يرفض `__SITE__` («unfilled placeholders»)، ولذلك لا تُعاد المهمّة قبل هذا البند. (`check-env.sh` يقيس العدد 7.)
  الجذران: Caddy الرئيس يركّب `/srv/sites/www` على `/srv/www` (`:ro`)، فـ `WEB_ROOT=/srv/sites/www/$SITE-app` يُخدَم من
  `/srv/www/$SITE-app` و`WWW_API=/srv/sites/www/$SITE-api` من `/srv/www/$SITE-api` — أبقِ `WWW_APP`/`WWW_API` تحت
  `/srv/sites/www` بهذين الاسمين. وللإنتاج تُحذف أسطر `X-Robots-Tag "noindex` (القالب يقول: «remove at cutover»).
- [ ] **9. البذرة والحسابات:** `SITE="$SITE" AWRAD_ENV_FILE="$ENV_FILE" bash "$VPS_DIR/seed-demo.sh"`؛ و`like '%@awrad.emdatra.org'`
  ← `'%@$ADMIN_HOST'`، و`admin@awrad.emdatra.org` في §٩ب وسطور الملخّص ← `admin@$ADMIN_HOST` …. (هل تُبذر حساباتٌ تجريبية
  في الإنتاج أصلًا؟ قرارٌ للمالك.)
- [ ] **10. ما بقي حرفيًّا:** تعليق رأس الملف والتراجع (`/opt/sites/awrad` …)، وتعليق سجلّ DNS `"Awrad staging"`، والمتوقَّع في
  `echo` (مثل «المتوقّع 4» على `@awrad.emdatra.org`). والذاكرة: بيئةٌ ثانية تضيف نحو 3 GiB من السقوف (db 1g · functions 768m ·
  admin 512m · auth/rest/mail 256m) — حدود «المتاح» في §١ و§٤ تُراجَع لخادمٍ يحمل الاثنتين.

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
