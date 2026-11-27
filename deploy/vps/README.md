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
| `docker-compose.yml` | مشروع `awrad`: `db`، `migrate` (مرّة)، `auth`، `rest`، `functions`، `mail`، `admin`، `web-build` (مرّة). **لا منفذ منشور**؛ Caddy يصل بالأسماء `awrad-*` على `deploy_default` |
| `Dockerfile.admin` | ثلاث مراحل: `workspace` (المستودع وتبعيّاته — فيه يجري تصدير Expo)، `build` (`next build` بـ `output: 'standalone'`)، `admin` (الخادم وحده، مستخدم `node`) |
| `migrate.sh` | `supabase/migrations/*.sql` بالترتيب ثمّ `supabase/seed.sql` مرّة، كـ `postgres`، مع التتبّع في `ops.schema_migrations`، ثمّ `NOTIFY pgrst` |
| `web-build.sh` | `expo export -p web` ثمّ نسخٌ إلى `releases/<id>` وتبديل الرابط `current` ذرّيًّا |
| `functions-main/index.ts` | موجّه Edge Runtime: اسم الدالة من أوّل مقطع، والتحقّق من JWT قبل إنشاء العامل |
| `db-init/roles.sql`, `db-init/jwt.sql` | تُنفَّذ مرّةً عند تهيئة الحجم: كلمات مرور الأدوار وإعدادات JWT |
| `auth-templates/magic-link.html` | بريد رمز الدخول بالعربية (`{{ .Token }}`)؛ يُنسخ إلى `/srv/sites/www/awrad-api/auth-templates/` |
| `awrad.caddy.tmpl` | الكتل الأربع؛ تملؤها المهمّة بحسب وضع Cloudflare |
| `seed-demo.sh` | الحسابات التجريبية وسجلّاتها (عبر `save_log` وحده) ومجلسٌ بحضور — مرّة |

## الأسرار — أين هي

على الخادم وحده، تولّدها المهمّة مرّة ولا تطبعها:

- `/opt/sites/awrad/.env` (600): `POSTGRES_PASSWORD`، `JWT_SECRET`، `ANON_KEY`، `SERVICE_ROLE_KEY`، `MAIL_USER`، `MAIL_PASSWORD`.
- `/opt/sites/awrad/secrets/mail-basicauth.txt` (600): مستخدم صندوق البريد وكلمة مروره — `sudo cat` عبر SSH.

`ANON_KEY` عامّ بطبيعته (يُبنى في اللوحة والويب). `SERVICE_ROLE_KEY` لا يغادر الخادم: يصل دالة `invite-user` بيئةً، وسكربت البذرة يمرّره بيئةً لا وسيطًا.

## إعادة النشر

ادفع إلى الفرع ثمّ أعِد مهمّة mahfazapay (أو على الخادم):

```sh
cd /opt/sites/awrad/repo
dc() { docker compose -p awrad --env-file /opt/sites/awrad/.env -f deploy/vps/docker-compose.yml "$@"; }
dc --profile build build                   # فشلُ البناء لا يمسّ ما يعمل
dc up -d db && dc run --rm migrate
dc up -d auth rest functions mail admin
dc --profile build run --rm web-build
```

الأسرار لا تُولَّد ثانية، والحسابات لا تُمسّ (علامة `secrets/demo-seeded.done`).

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
