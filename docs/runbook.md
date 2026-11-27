# دليل التشغيل — أوراد

لمن يشغّل النظام: النشر، والنسخ الاحتياطي، والأسرار، والأعطال. يصف ما يعمل اليوم على خادم المالك
(القرار DEP-8)، ويقول صراحةً ما لم يُبنَ بعد.

**المرجع الملزِم** لما يعمل وأين: [`deploy/vps/README.md`](../deploy/vps/README.md). هذا الدليل لا يكرّره،
بل يرتّب حوله الإجراءات.

> **ما ليس موجودًا بعد:** بيئة إنتاج منفصلة (الموجود نسخة تجريبية)، ومزوّد بريد حقيقي (المفاتيح `SMTP_*` جاهزة في
> compose؛ بدونها تُجمع الرموز في Mailpit)، والمؤقّت الليلي للنسخ الاحتياطي وأوّل تمرين استعادة على الخادم (السكربتان
> جاهزان، §3)، وبناءات المتاجر (لا ملف `apps/awrad.yml` في مستودع `appstore-release` بعد).
>
> المواصفة (§15) تصف بديلًا سحابيًا: Supabase Cloud للخلفية وVercel للوحة وEAS للبناءات. لم يُعتمد للتشغيل؛
> الترحيلات تبقى صالحة عليه إن اختير لاحقًا.

## 1. البنية على الخادم

مشروع Docker Compose باسم `awrad` من [`deploy/vps/docker-compose.yml`](../deploy/vps/docker-compose.yml)،
خلف Caddy المشترك على الخادم (شبكة `deploy_default`). لا منفذ منشور.
هذا الدليل للنسخة التجريبية (`SITE=awrad`)؛ بيئةٌ ثانية من الملفات نفسها في
[README النشر: «بيئة ثانية على الخادم نفسه»](../deploy/vps/README.md#بيئة-ثانية-على-الخادم-نفسه).

| الخدمة | الصورة | ما تفعله | يصلها الناس عبر |
|---|---|---|---|
| `db` | `supabase/postgres:17.12.0.002` | قاعدة البيانات، وفيها `pg_cron` و`pg_net`. البيانات في الحجم `pgdata` | — (داخلية) |
| `migrate` (مرّة) | `postgres:17-alpine` | يطبّق `supabase/migrations/*.sql` ثم البذرة مرّة (`migrate.sh`) | — |
| `auth` (يصلها Caddy بـ `awrad-auth`) | `supabase/gotrue:v2.198.0` | الدخول برمز البريد | `awrad-api.emdatra.org/auth/v1` |
| `rest` (يصلها Caddy بـ `awrad-rest`) | `postgrest/postgrest:v16.6` | واجهة REST وRPC | `awrad-api.emdatra.org/rest/v1` |
| `functions` (يصلها Caddy بـ `awrad-functions`) | `supabase/edge-runtime:v1.79.5` | `invite-user` و`send-reminders` | `awrad-api.emdatra.org/functions/v1` |
| `mail` (يصلها Caddy بـ `awrad-mail`) | `axllent/mailpit:v1.34.0` | يستقبل كل البريد (رموز الدخول). في الذاكرة: يُمحى عند إعادة التشغيل | `awrad-mail.emdatra.org` (بكلمة مرور) |
| `admin` (يصلها Caddy بـ `awrad-admin`) | `awrad-admin:latest` (يُبنى محليًا) | لوحة الشيخ (Next.js) | `awrad.emdatra.org` |
| `web-build` (مرّة) | `awrad-workspace:latest` | يصدّر ويب الطالب إلى `/srv/sites/www/awrad-app/current` | `awrad-app.emdatra.org` (Caddy يخدمه ساكنًا) |
| `import` (مرّة، `tools`) | `awrad-workspace:latest` | استيراد الجداول القديمة (§9) | — |

| المسار على الخادم | ما فيه |
|---|---|
| `/opt/sites/awrad/repo` | نسخة فرع `build/mvp` من هذا المستودع؛ منها يُبنى كل شيء |
| `/opt/sites/awrad/.env` (600) | الأسرار (§4) |
| `/opt/sites/awrad/secrets/` | كلمة مرور صندوق البريد، وبصمتها، وعلامة البذرة |
| `/srv/sites/caddy/awrad.caddy` | إعداد Caddy للنطاقات الأربعة |

### الاختصار `dc` في كل الأوامر أدناه

كل كتلة أوامر في هذا الدليل تفترض هذين السطرين في أولها، كما يعرّفهما README النشر و`task.sh`
(`dc` يعمل من نسخة المستودع على الخادم):

```sh
cd /opt/sites/awrad/repo
dc() { docker compose -p awrad --env-file /opt/sites/awrad/.env -f deploy/vps/docker-compose.yml "$@"; }
```

## 2. قناة التشغيل: كيف يصل تغيير إلى الخادم

لا SSH للفريق. القناة الوحيدة مستودع المالك الخاص `mahfazapay`:

1. تُكتب الأوامر في `deploy/ops/task.sh` هناك، ويُدفع إلى `main`.
2. وكيل GitHub Actions ذاتي الاستضافة على الخادم يلتقط الدفعة (`.github/workflows/ops.yml`، يعمل عند تغيّر
   `task.sh` وحده) وينفّذ السكربت.
3. المخرجات تُكتب في `deploy/ops-log/latest.md` وتُدفع عائدة. تُقرأ بـ:
   `git fetch origin && git show origin/main:deploy/ops-log/latest.md`.

قواعد كتابة `task.sh` (من `CLAUDE.md` في `mahfazapay`):

- اطبع الأثر ولا تفترضه: `docker ps` أو أعداد قبل التغيير وبعده.
- الردّ `200` وحده ليس دليل نجاح؛ قِس أثر التغيير نفسه.
- الأسرار تُمرَّر بيئةً ولا تُطبع ولو مقتطعة. اقرأها من `.env` إلى متغيّر، أو إلى متغيّر psql بـ `-v`.
- كل تغيير خطر يحمل تراجعه (`trap` أو مسار عودة صريح).
- اختم بـ `exit 0` حين تنتهي بشروط.

## 3. النسخ الاحتياطي والاستعادة

> **السكربتان جاهزان، والتشغيل على الخادم لم يبدأ.** `deploy/vps/backup.sh` و`deploy/vps/restore-rehearsal.sh`
> (القرار FIN-6) مجرَّبان محليًّا على PostgreSQL 16 بلا Docker (نسخة، ثمّ استعادة في قاعدة مؤقّتة وأعداد مطابقة، والتدوير،
> ومسار الفشل). **تثبيت المؤقّت الليلي وأوّل تمرين على الخادم جولة mahfazapay**، وهي بوّابة قبل أن يحمل الإنتاج بيانات
> حقيقية. حتى ذلك الحين: حذف الحجم `pgdata` (مثل `down -v`) يمحو كل البيانات.

### أخذ نسخة (جولة `task.sh`، ثمّ ليليًّا)

```sh
SITE=awrad AWRAD_ENV_FILE=/opt/sites/awrad/.env bash /opt/sites/awrad/repo/deploy/vps/backup.sh
# اختياري: BACKUP_DIR=/opt/sites/awrad/backups (الافتراضي)، RETENTION_DAYS=14 (الافتراضي)
```

ما يفعله، وكل ما يطبعه أحجام وأعداد:

1. يعدّ صفوف كل جدول في `public` و`auth` و`ops` (`<SITE>-<الختم>.counts.tsv`).
2. `pg_dump -Fc` كـ `supabase_admin` **داخل حاوية القاعدة إلى ملف** (أرشيف بمواضع بيانات، لا تدفّق عبر stdout)، دون
   مخطّطَي `cron` و`net` (مهمّة التذكيرات تُعاد بـ `ensure_reminder_schedule()`، §7)، ثمّ ينسخه إلى `backups/` ويقارن
   sha256 داخل الحاوية وخارجها.
3. يكتب أسطر `alter database postgres set app.*` (`app.functions_url` و`app.cron_secret` وإعدادات JWT) في
   `<…>.settings.sql`: نسخة المخطّطات لا تحمل إعدادات القاعدة. **فيها أسرار** — 600 ولا تُطبع.
4. يحذف مجموعات هذه البيئة الأقدم من `RETENTION_DAYS` (لا يحذف الأحدث أبدًا، ولا يمسّ بيئة أخرى).

المجلّد 700 والملفات 600 (`umask 077`). **نسخة خارج الخادم** بند مالك: انسخ `backups/` إلى تخزين آخر بعد كل تشغيل (مثل
rclone مشفّرًا)، وتمرّن على الاستعادة منها مرّة.

للمؤقّت الليلي (جولة mahfazapay): `systemd timer` بجوار مؤقّتات المواقع الأخرى يشغّل السطر أعلاه، ويُكتب ملخّصه في سجلّ.

### تمرين الاستعادة (جولة `task.sh`)

```sh
SITE=awrad AWRAD_ENV_FILE=/opt/sites/awrad/.env bash /opt/sites/awrad/repo/deploy/vps/backup.sh
SITE=awrad AWRAD_ENV_FILE=/opt/sites/awrad/.env bash /opt/sites/awrad/repo/deploy/vps/restore-rehearsal.sh
```

يستعيد آخر نسخة (أو الملف المعطى) في قاعدة مؤقّتة `<site>_restore_rehearsal` **داخل حاوية القاعدة نفسها**، ويقارن عدد صفوف
كل جدول بما سُجّل وقت النسخ، ويتحقّق من أسماء الإعدادين في `settings.sql`، ثمّ يحذف القاعدة المؤقّتة. القاعدة الحيّة لا
تُمسّ. أخطاء `pg_restore` تُعدّ وتُذكر بأسماء الكائنات (امتدادٌ لا يعيش إلا في قاعدة `postgres` متوقَّع). الخروج 0 = كل جدول
كما سُجّل؛ 1 = جدول ناقص أو مختلف (يُذكر). شغّل النسخ والتمرين في الجولة نفسها، فلا تكتب القاعدة بينهما.

### الاستعادة الحقيقية (جولة `task.sh`)

> تمرّن عليها كاملةً أوّلًا في مشروع compose مؤقّت (`-p awrad-restore`، حجمه وحده، بلا Caddy): الخطوات أدناه نفسها،
> ثمّ دخول برمز لحساب مستعاد، وفحص RLS (طالب يرى صفوفه وحده)، وتسجيل RTO وRPO. جولة mahfazapay.

الاستعادة تكتب فوق البيانات الحالية. خذ نسخة من الحالي أولًا، ثمّ:

```sh
set -euo pipefail
cd /opt/sites/awrad/repo
dc() { docker compose -p awrad --env-file /opt/sites/awrad/.env -f deploy/vps/docker-compose.yml "$@"; }
F=/opt/sites/awrad/backups/<الملف>.dump                     # ومعه <…>.settings.sql
dc stop admin auth rest functions                          # لا كتابة أثناء الاستعادة
dc exec -T db sh -c 'cat > /tmp/restore.dump' < "$F"       # ملفٌّ داخل الحاوية: pg_restore يحتاج أرشيفًا قابلًا للقفز
# كـ supabase_admin وبلا --no-owner: تبقى ملكية كل جدول كما في النسخة (جداول auth لـ supabase_auth_admin الذي يتّصل
# به GoTrue، وجداول public وops لـ postgres).
dc exec -T db pg_restore -U supabase_admin -d postgres --clean --if-exists \
  --schema=public --schema=auth --schema=ops /tmp/restore.dump
dc exec -T db rm -f /tmp/restore.dump
dc exec -T db psql -X -v ON_ERROR_STOP=1 -U supabase_admin -d postgres < "${F%.dump}.settings.sql"
dc up -d auth rest functions admin
dc exec -T db psql -U postgres -d postgres -c "notify pgrst, 'reload schema';"
dc exec -T db psql -U postgres -d postgres -tAc "select ensure_reminder_schedule();"   # في جلسة جديدة ← t
```

قارن الأعداد بملف `<…>.counts.tsv` للنسخة. **إن ضاع الحجم كله:** `dc up -d db` يهيّئ حجمًا جديدًا ويشغّل `db-init/*.sql`
(كلمات المرور، JWT، الامتدادات)، ثمّ `dc --profile tools run --rm migrate` يبني المخطّط، ثمّ الاستعادة أعلاه للبيانات.
نقطتا فشلٍ محتملتان يكشفهما التمرين الكامل: `--clean` قد يتعثّر بكائنات خارج المخطّطات الثلاثة تعتمد على `auth.users`،
وأخطاء `pg_restore` المتجاهَلة توقف السكربت تحت `set -e` — راجع عددها ونوعها في التمرين قبل الحاجة.

## 4. تدوير الأسرار

الأسرار في `/opt/sites/awrad/.env` وحده (README النشر، «الأسرار — أين هي»). كل تدوير جولة `task.sh`: تولّد القيمة
الجديدة على الخادم (`openssl rand -hex 32`)، وتكتبها في `.env` دون طباعتها، ثم تعيد تشغيل ما يقرؤها.

| السرّ | ماذا يتطلّب تدويره | أثره على المستخدمين |
|---|---|---|
| `JWT_SECRET` | يُولَّد معه `ANON_KEY` و`SERVICE_ROLE_KEY` جديدان (رموز JWT موقّعة به، بالدورين `anon` و`service_role`). على الحجم القائم: `alter database postgres set "app.settings.jwt_secret" to …` كـ `supabase_admin` (`db-init/jwt.sql` لا يعمل إلا عند التهيئة). ثم `dc up -d auth rest functions`، وإعادة بناء اللوحة وويب الطالب لأن `ANON_KEY` مبنيّ فيهما: `dc --profile build build`، `dc up -d admin`، ثم `web-build` | يخرج الجميع ويدخلون برمز جديد |
| `ANON_KEY` وحده | يُوقَّع بـ `JWT_SECRET` الحالي. `dc up -d functions`، ثم إعادة بناء اللوحة وويب الطالب كما أعلاه. (التطبيق على المتاجر، حين يصدر، يحمله في بنائه: يلزم إصدار جديد) | لا شيء إن بُني الكل |
| `SERVICE_ROLE_KEY` | يُوقَّع بـ `JWT_SECRET` الحالي. `dc up -d functions`. الرمز القديم يبقى صالحًا ما بقي `JWT_SECRET`؛ لإبطاله دوّر `JWT_SECRET` | لا شيء |
| `CRON_SECRET` | يُحدَّث في مكانين معًا: `.env` ثم `dc up -d functions`، و`alter database postgres set app.cron_secret = :'secret'` كـ `supabase_admin` (README النشر، خطوة التذكيرات 3)، ثم `select ensure_reminder_schedule();` في جلسة جديدة | لا شيء؛ إن اختلف السرّان تردّ الدالة 401 ولا تصل التذكيرات |
| `POSTGRES_PASSWORD` | كلمة مرور كل أدوار القاعدة التي تدخل بكلمة: `postgres` و`supabase_admin` (يضبطهما الصورة عند التهيئة؛ `migrate.sh` وسكربت البذرة يتّصلان بـ `postgres`)، وأدوار `db-init/roles.sql`: `authenticator` (PostgREST) و`supabase_auth_admin` (GoTrue) و`pgbouncer` و`supabase_functions_admin` و`supabase_storage_admin` و`supabase_replication_admin` و`supabase_read_only_user`. الترتيب: (1) `alter role … with password` لكلٍّ منها بالكلمة الجديدة، كـ `supabase_admin` عبر المقبس المحلي داخل الحاوية (`dc exec -T db psql -U supabase_admin -d postgres`، كما في خطوة التذكيرات 2 في README النشر)، والكلمة متغيّر psql بـ `-v`؛ (2) الكلمة الجديدة في `.env`؛ (3) `dc up -d db auth rest` (تُعاد بيئتها)؛ (4) القياس: `dc --profile tools run --rm migrate` يمرّ (لا جديد)، و`awrad-auth` و`awrad-rest` يعملان | انقطاع قصير |
| كلمة مرور Mailpit (`MAIL_USER`، `MAIL_PASSWORD`) | تُحدَّث في أربعة أماكن: `.env`، و`secrets/mail-basicauth.txt`، و`secrets/mail-ui.htpasswd` (bcrypt)، وكتلة `basic_auth` في `/srv/sites/caddy/awrad.caddy`. ثم `dc up -d mail` و`docker exec deploy-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile` | من يقرأ الرموز يحتاج الكلمة الجديدة |
| SMTP (`SMTP_PASS`) | حين يُضبط مزوّد البريد (README النشر، «البريد في الإنتاج»): الكلمة الجديدة عند المزوّد، ثمّ في `.env`، ثمّ `dc up -d auth`، ثمّ رمز دخول إلى بريد خارجي. بلا `SMTP_*` يرسل GoTrue إلى Mailpit | لا شيء إن تمّ بالترتيب |

تحقّق بعد كل تدوير: دخول برمز إلى اللوحة، وفي ساعة التذكير التالية §7.

## 5. إضافة مجموعة ومشرف

1. **المجموعة:** المدير في اللوحة ← «الإعدادات» ← «مجموعة جديدة»: الاسم، والمنطقة الزمنية، وبداية الأسبوع
   ([دليل الشيخ](admin-manual.md) §10). لا عمل على الخادم.
2. **المشرف:** اللوحة تدعو **طلابًا** فقط (نموذج الدعوة يرسل الدور `student` دائمًا). دالة `invite-user` تقبل
   `supervisor`، لكن لا واجهة لها بعد. لإنشاء مشرف اليوم، جولة `task.sh` بنمط `deploy/vps/seed-demo.sh`:
   صفّ في `invitations` بالدور `supervisor` والمجموعة، ثم `POST /admin/users` على GoTrue بمفتاح الخدمة
   (يقرؤه python من `.env`، فلا يظهر في وسائط أي عملية). مشغّل `handle_new_user` يبني الملف من الدعوة.
   بديل أبسط: يدعوه المدير طالبًا من اللوحة، ثم في جولة:
   `update profiles set role = 'supervisor' where id = '<id>';` كـ `postgres`.
   الترقية لا تغيّر `is_tracked` ولا `group_id`: يبقى مُتابَعًا في مجموعته، وهذا مقصود لمشرف يسجّل أوراده أيضًا
   (المواصفة §5). إن كان لا يسجّل فأطفئ «مُتابَع» من صفحته في اللوحة (أو
   `update profiles set is_tracked = false where id = '<id>';`)، فلا يظهر في النظرة العامة والحضور.
3. المدير يختاره في «المشرفون» للمجموعة ويحفظ. المشرف يدخل برمز البريد كأي مستخدم.

## 6. ترقية الإصدار (إعادة النشر)

1. الشيفرة تُدمج في `build/mvp` (الفرع الذي ينشره الخادم، `BRANCH=build/mvp` في `task.sh`)، أو في `main` حين يصبح
   هو المصدر: يتغيّر `BRANCH` حينها.
2. جولة `task.sh` تنفّذ ما في README النشر، «إعادة النشر»: جلب الفرع، `dc --profile build build`، الترحيلات بـ
   `migrate`، `dc up -d` للخدمات، ثم `web-build`.
3. **ما يجب أن يُظهره السجلّ** (`latest.md`):
   - رأس الفرع المنشور (SHA) هو المطلوب.
   - البناء نجح (فشله لا يمسّ ما يعمل).
   - الترحيلات: أسماء الملفات الجديدة المطبَّقة، أو لا جديد (`ops.schema_migrations`).
   - `docker ps` لمشروع `awrad`: كل الخدمات `Up`، وتاريخ إنشاء `awrad-admin` بعد الجولة.
   - ردّ كل نطاق مع التحقّق من أنه خادمنا لا غيره (`--resolve <host>:443:127.0.0.1`).
   - رابط `current` لويب الطالب يشير إلى الإصدار الجديد.
4. جرّب الدخول إلى اللوحة وفتح صفحة تغيّرت.

ترحيل جديد لا يُعدَّل بعد دمجه؛ يُضاف ملف جديد. صور الخدمات (`supabase/postgres`، `gotrue`، …) مثبَّتة بأرقامها في
compose؛ ترقيتها تغيير في compose يمرّ بالطريق نفسه، بعد نسخة احتياطية (§3).

## 7. التذكيرات أو البريد لا يصلان

### كيف تعمل التذكيرات

مُفعَّلة على النسخة التجريبية منذ 2026-11-27: `pg_cron` و`pg_net` مفعّلان، و`CRON_SECRET` في `.env`،
و`app.functions_url = http://awrad-functions:9000`، ومهمّة `send-reminders` مجدولة `0 * * * *`.

كل ساعة عند الدقيقة 0، تستدعي المهمّة الدالة `send-reminders` بـ `Authorization: Bearer <CRON_SECRET>`. الدالة
تسأل `due_reminders()` عمّن استحقّ:

- **يومي:** حساب فعّال مُتابَع، وقت تذكيره غير فارغ وساعته هي الساعة الآن بمنطقته، لم يسجّل يومه، ولم يُذكَّر
  اليوم، وله جهاز مسجَّل.
- **أسبوعي:** مثله مع «التذكير الأسبوعي»، في آخر يوم من أسبوع مجموعته، ولم يسجّل الأسبوع.

ثم ترسل إلى Expo Push وتكتب `reminder_log` (فلا تُرسل مرتين في الساعة نفسها).

**تذكير: مستخدم الويب لا تصله تذكيرات** (القرار D16). التذكيرات لتطبيق iOS/Android فقط، ولا تطبيق في المتاجر بعد؛
فلا أجهزة في `push_tokens` إلا من نسخة تطبيق مثبّتة للتجربة، و`due` = 0 أمر طبيعي.

### ردود الدالة

| الردّ | معناه |
|---|---|
| `200` | السرّ صحيح وجرى العمل. في سجلّ الحاوية سطر أعداد: `due`، `sent`، `failed`، `deletedTokens`، `deleteFailures`، `logFailures` |
| `401` (`UNAUTHORIZED`) | السرّ في الطلب لا يطابق `CRON_SECRET` في الحاوية، أو `CRON_SECRET` غائب عنها. لا يُرسل شيء |
| `405` (`METHOD_NOT_ALLOWED`) | الطلب ليس `POST` |
| `500` (`SEND_FAILED`) | تعذّرت قراءة المستحقّين (مثلًا مفتاح الخدمة) |

### الفحوص بالترتيب (جولة `task.sh`، أعداد فقط)

كـ `supabase_admin` على قاعدة `postgres`:

```sql
-- 1) المهمّة موجودة ومفعّلة؟ (1 صفّ، active = t)
select jobname, schedule, active from cron.job where jobname = 'send-reminders';

-- 2) هل تعمل كل ساعة؟ (succeeded يزداد)
select status, count(*), max(start_time) from cron.job_run_details
 where jobid = (select jobid from cron.job where jobname = 'send-reminders') group by status;

-- 3) بماذا ردّت الدالة؟ (200 = جيد؛ 401 = السرّان مختلفان)
select status_code, count(*), max(created) from net._http_response group by status_code;

-- 4) هل سُجّلت تذكيرات؟ وهل للطلاب أجهزة؟
select kind, sent_for, count(*) from reminder_log group by 1, 2 order by 2 desc limit 14;
select platform, count(*) from push_tokens group by 1;
```

وسجلّ الحاوية: `dc logs --since 2h functions | grep send-reminders` (أعداد فقط، بلا رموز ولا عناوين).

| ما تراه | السبب المرجّح | العلاج |
|---|---|---|
| لا صفّ في `cron.job` | لم تُجدول، أو أُعيدت تهيئة القاعدة | `select ensure_reminder_schedule();` في جلسة جديدة؛ إن ردّت `f` فالامتدادان أو الإعدادان غائبان (README النشر، التذكيرات) |
| `job_run_details` بحالة `failed` | خطأ SQL في الطلب | اقرأ `return_message` لآخر صفّ |
| `401` في `net._http_response` | `app.cron_secret` يخالف `CRON_SECRET` في `.env` | أعد ضبطهما معًا (§4، `CRON_SECRET`) |
| لا ردود إطلاقًا، أو أخطاء اتصال | `app.functions_url` خاطئ أو `awrad-functions` متوقّفة | `show app.functions_url;` في جلسة جديدة؛ `dc ps functions` |
| `200` و`due` = 0 | لا مستحقّ: لا أجهزة، أو الكل سجّل، أو ليست ساعتهم | طبيعي؛ راجع وقت تذكير الطالب ومنطقته |
| `sent` > 0 لكن الطالب لم يرَ شيئًا | الإشعارات ممنوعة على جهازه، أو Expo قبلها ولم يسلّمها | تحقّق من إذن الإشعارات في جهازه |
| `failed` > 0 | Expo رفض الرسائل؛ `DeviceNotRegistered` يحذف الرمز وحده (`deletedTokens`) | الطالب يفتح التطبيق فيسجّل جهازه من جديد |

**إيصالات Expo:** الدالة تقرأ «تذاكر» Expo عند الإرسال (تُعدّ في `sent` و`failed`)، ولا تطلب «الإيصالات»
اللاحقة (`getReceipts`) ولا تحفظ أرقام التذاكر. فلا يظهر عندنا ما ردّته Apple أو Google بعد قبول Expo. هذا غير مبني.

### البريد (رموز الدخول والدعوات)

كل بريد يذهب اليوم إلى Mailpit لا إلى صندوق المستخدم. «لم يصل الرمز» تعني:

1. افتح `https://awrad-mail.emdatra.org` بكلمة المرور من `secrets/mail-basicauth.txt`. الرسالة هناك؟ فالإرسال سليم.
2. Mailpit في الذاكرة: إعادة تشغيله تمحو الرسائل، والحدّ 500 رسالة.
3. ليست هناك؟ `dc logs --since 30m auth` (حدود المعدّل: رسالة لكل مستخدم في الثانية، و`RATE_LIMIT_EMAIL_SENT` رسالة في
   الساعة، 60 افتراضيًا؛ و`/otp` و`/verify` محدودان لكل عنوان عميل — 429 = حدّ)، و`dc ps mail`.
4. «هذا البريد غير مسجَّل لدينا» عند الدخول: لا حساب بهذا البريد (يُدعى أولًا).

## 8. التراجع

التراجع الكامل (حذف المشروع والقاعدة وإعداد Caddy والمجلّدات) في README النشر، «التراجع الكامل». يحذف كل
البيانات: خذ نسخة (§3) قبله. لإيقاف التذكيرات وحدها: `select cron.unschedule('send-reminders');`.

## 9. استيراد الجداول القديمة

خدمة `import` (ملف التعريف `tools`، القرار FIN-5) تشغّل `scripts/import-legacy` داخل شبكة المشروع: القاعدة `awrad-db` بلا
منفذ منشور، والمفاتيح من `.env` بيئةً (لا رابط ولا وسيط)، والملفات من `/opt/sites/awrad/import/` على الخادم، والمخرجات
أعداد فقط (`--counts-only` في نقطة الدخول؛ سجلّ المهمّة يُدفع إلى git). ما يُستورد وما لا يُستورد في
[`scripts/import-legacy/README.md`](../scripts/import-legacy/README.md) ودليل المدير §9.

**ما يفعله المالك عبر SSH (مرّة):** ينسخ ملفات CSV الثلاثة إلى الخادم، لا إلى أي مستودع:

```sh
sudo install -d -m 700 /opt/sites/awrad/import
sudo install -m 600 daily.csv weekly.csv attendance.csv /opt/sites/awrad/import/
```

**الجولة الأولى (`task.sh`): مسودة الربط ثمّ المعاينة.** بلا `mapping.json` يكتب السكربت مسودة ولا يستورد شيئًا:

```sh
cd /opt/sites/awrad/repo
dc() { docker compose -p awrad --env-file /opt/sites/awrad/.env -f deploy/vps/docker-compose.yml "$@"; }
I=/import                                                     # = /opt/sites/awrad/import داخل الحاوية
ARGS="--daily $I/daily.csv --weekly $I/weekly.csv --attendance $I/attendance.csv --mapping $I/mapping.json --report $I/report.json"
dc --profile tools build import                               # الصورة نفسها التي يبنيها web-build (workspace)
dc --profile tools run --rm import $ARGS                      # مسودة mapping.json (أو معاينة إن وُجد الملف)
sudo ls -l /opt/sites/awrad/import                             # الأحجام والصلاحيات، لا المحتوى
```

المالك يراجع `mapping.json` عبر SSH مع الشيخ (الأسماء، والأعمدة، وأعمدة النصوص، والطلاب الذين غادروا)، ويعيده إلى المكان نفسه
(`sudo install -m 600`). ثمّ جولة **معاينة** بالسطر نفسه: «لم يُكتب شيء في قاعدة البيانات»، ومعها الأعداد — السجلّات
والنصوص، والأسماء غير المطابقة، والتواريخ غير الصالحة، والصفوف المرفوضة، والسجلّات الموجودة التي ستُترك. التفاصيل بالأسماء في
`report.json` (600) يقرؤها المالك.

**جولة التنفيذ** بعد موافقة الشيخ على المعاينة، بعد نسخة احتياطية (§3):

```sh
SITE=awrad AWRAD_ENV_FILE=/opt/sites/awrad/.env bash deploy/vps/backup.sh
dc --profile tools run --rm import $ARGS --execute            # [--admin <بريد المدير> إن تعدّد المديرون]
echo "exit=$?"                                                 # 1 = صفٌّ رُفض (العدد في الملخّص، التفاصيل في report.json)
```

القياس بعده (أعداد فقط): `dc exec -T db psql -U postgres -d postgres -tAc "select count(*) from logs"` قبل التنفيذ وبعده،
والفرق يساوي «حُفظ: N سجلًّا». إعادة الجولة آمنة: السجلّات الموجودة تُترك ولا يُكتب شيء ثانيةً (القرار FIN-9).
بعد الاستيراد: احذف الملفات من الخادم إن لم تعد لازمة (`sudo rm -r /opt/sites/awrad/import`).

