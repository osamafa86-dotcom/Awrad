# AGENTS.md — إرشادات وكلاء البرمجة لمستودع «أوراد مفاتيح العلوم»

> انسخ هذا الملف إلى جذر المستودع باسم `AGENTS.md` (ويمكن ربط `CLAUDE.md` به). يقرأه كل وكيل قبل أي مهمة. ما هنا يغلب على التفضيلات العامة للوكيل.

## 1. ما هذا المشروع؟
نظام متابعة أوراد يومية وأسبوعية لطلاب حلقة علمية: تطبيق طالب (Expo: iOS/Android/ويب) ولوحة للشيخ والمشرف (Next.js) وخلفية Supabase. المرجعان الملزمان:
- `docs/01-design-spec.md` — ماذا نبني ولماذا، وقواعد العمل `BR-xx`، والمتطلبات `F-xx`، والقرارات `D-xx`.
- `docs/02-implementation-plan.md` — المهام بالترتيب مع اختباراتها.
- `docs/design/DESIGN.md` وملف Figma (https://www.figma.com/design/KMQtYs5sFeyMG5lgWqMJOg) — المرجع البصري الملزِم للواجهات؛ الرموز في `packages/design-tokens`.

إن تعارض الكود مع المواصفة فالمواصفة هي الصواب حتى يُعدَّل أحدهما صراحة. إن وجدت غموضًا لا تحسمه المواصفة، **لا تخترع**: اختر أبسط تفسير، سجّله في قسم «قرارات أثناء التنفيذ» في PR، وأضف سؤالًا في `docs/open-questions.md`.

## 2. طريقة العمل
1. **مهمة واحدة في كل مرة** من `02-implementation-plan.md`، بترتيبها واعتمادياتها. لا تبدأ مهمة قبل أن تكون اختبارات المهمة السابقة خضراء في `main`.
2. **اختبار أولًا:** اكتب الاختبار الفاشل المذكور في المهمة، شغّله وتأكد من فشله للسبب الصحيح، ثم نفّذ الحدّ الأدنى، ثم أعد التشغيل.
3. **لا نطاق زائد:** لا ميزة ليس لها `F-xx`، ولا تحسين لم تطلبه المهمة. إن رأيت تحسينًا، سجّله في `docs/backlog.md` ولا تنفّذه.
4. **كل مهمة = فرع + PR** باسم `task/T1-6-save-log`. وصف الـ PR: ما نُفِّذ، أرقام `F/BR` المغطّاة، كيف تحقّقت، وأي قرار اتّخذته.
5. **قبل طلب المراجعة:** `pnpm lint && pnpm typecheck && pnpm test` خضراء محليًا؛ لواجهات الجوّال لقطة شاشة RTL من منصّة واحدة على الأقل في وصف الـ PR.
6. **المراجع مستقل** (وكيل آخر أو بشري) ويتحقّق من: مطابقة المواصفة، وجود الاختبارات المذكورة، احترام القواعد أدناه.

## 3. قواعد غير قابلة للتفاوض
- **لا اسم عادة ولا بند في الكود.** العادات بيانات من `habits`/`habit_items`. الاستثناء: `supabase/seed.sql` وملفات fixtures.
- **الكتابة في السجلّات عبر `save_log()` فقط.** لا `insert`/`update` مباشر على `logs`, `log_entries`, `log_entry_items` من أي عميل.
- **RLS على كل جدول.** أي جدول جديد يأتي في نفس الـ PR مع سياساته واختبار يثبت العزل (طالب لا يرى غيره، مشرف لا يرى خارج مجموعاته).
- **مفتاح `service_role` لا يغادر الخادم.** مكانه أسرار Edge Functions وCI فقط.
- **RTL بالخصائص المنطقية فقط.** `start/end` لا `left/right`. قاعدة ESLint تفرض ذلك؛ لا تعطّلها.
- **النصوص العربية في `messages/ar.ts`** لكل تطبيق، لا داخل المكوّنات. الفصحى المبسّطة، بلا تشكيل إلا للضرورة.
- **التواريخ نصوص `YYYY-MM-DD`** في حدود الواجهات والـ RPC؛ «اليوم» يُحسب بمنطقة الطالب (`todayIn`/`local_today`) لا بـ `new Date()` مجرّدة.
- **لا SDK تحليلات لطرف ثالث.** تقارير الأعطال فقط إن أُضيفت، مع إخفاء البيانات الشخصية.
- **لا بيانات حقيقية في المستودع.** fixtures بأسماء وهمية.
- **لا تعدّل ترحيلًا مُدمَجًا.** أضف ترحيلًا جديدًا.
- **الواجهة من الرموز والتصميم.** الألوان والمسافات والخطوط من `@awrad/design-tokens` فقط؛ أسماء المكوّنات كما في Figma؛ الذهب للإتمام وحده؛ حالات اليوم الأربع تُميَّز بالشكل؛ العدّادات بلا مسافات (`10/13`)؛ رمز الدخول والبريد `direction: ltr`؛ لا `numberOfLines={1}` على عنوان أو اسم؛ الإجراء الأساسي آخر السطر.

## 4. الأوامر
```bash
pnpm install
pnpm db:start        # عنقود PostgreSQL 16 محلي باسم awrad على المنفذ 54329 (بلا Docker)
pnpm db:reset        # shim + الترحيلات + البذرة على العنقود المحلي فقط (يرفض أي هدف آخر)
pnpm db:types        # توليد أنواع TypeScript من المخطّط
pnpm lint && pnpm typecheck && pnpm test
pnpm --filter @awrad/db test       # اختبارات قاعدة البيانات و RLS
pnpm --filter mobile start         # Expo
pnpm --filter admin dev            # Next.js
pnpm --filter admin e2e            # Playwright
supabase functions serve           # Edge Functions محليًا
```
لا Inbucket محليًا: تدفقات OTP تُحاكى في الاختبارات المحلية، والمصادقة الحقيقية تحتاج مشروع Supabase. أدوات اختبار قاعدة البيانات في `supabase/tests/helpers.ts`: `createTestUser` و`createTestGroup` و`clientAs(email)`؛ يُدرَج المستخدمون مباشرة في `auth.users` (ومُشغِّل `handle_new_user` يُنشئ الملف من الدعوة)، ويُضبط الدور `authenticated` ومطالبات JWT لكل معاملة؛ لا كلمات مرور.

## 5. الهيكل
```
apps/mobile      تطبيق الطالب (Expo Router, NativeWind)
apps/admin       اللوحة (Next.js App Router, Tailwind, shadcn/ui)
packages/domain  الأنواع، zod، قواعد اليوم/الأسبوع/الهجري، fixtures المشتركة
packages/supabase-client  العميل المُنمَّط ودوال RPC
packages/design-tokens    رموز التصميم: tokens.json · tokens.css · theme.ts (نسخة حرفية من Figma، لا تُحرَّر يدويًا)
supabase/        الترحيلات، الدوال، البذرة، اختبارات DB
scripts/import-legacy     ترحيل Google Sheets (سكربت يشغّله الفريق)
docs/            المواصفة والخطة والأدلّة
```

## 6. اصطلاحات
- Commits: Conventional Commits (`feat`, `fix`, `test`, `db`, `chore`, `docs`) مع نطاق الحزمة: `feat(mobile): ...`.
- TypeScript `strict`؛ لا `any` إلا بتعليق `// why:`.
- أسماء الملفات: `kebab-case` للمجلدات والوحدات، `PascalCase` للمكوّنات.
- SQL: `snake_case`؛ كل دالة RPC `security definer` تبدأ بـ `set search_path = public` وتتحقّق من الصلاحية صراحة.
- أخطاء RPC رموز ثابتة (`FORBIDDEN`, `FUTURE_DATE`, `DATE_OUT_OF_WINDOW`, `INVALID_WEEK_START`, `FREQUENCY_MISMATCH`, `INACTIVE_HABIT`, `INVALID_ITEM`, `INACTIVE_USER`, `MISSING_ENTRY`) تُترجم في الواجهة.
- الاختبارات بجانب الكود (`__tests__/`) أو في `supabase/tests/`؛ اسم الاختبار يصف السلوك لا الدالة.

## 7. تعريف «منتهٍ»
انظر `docs/02-implementation-plan.md` → «تعريف منتهٍ». باختصار: اختبارات المهمة خضراء، lint/typecheck خضراء، RLS لأي جدول جديد، RTL مُتحقَّق، نصوص في `messages/`، PR مراجَع.

## 8. عند الشكّ
- غموض في قاعدة عمل → اقرأ `BR-xx` في المواصفة أولًا؛ ثم `17.2` (قرارات حُسمت)؛ ثم اسأل في `docs/open-questions.md`.
- شيء لا يعمل على الويب في Expo → ابحث عن مكتبة تدعم الويب قبل كتابة كود خاص بمنصّة.
- حاجة لمفتاح الخدمة في العميل → خطأ تصميمي؛ انقل المنطق إلى Edge Function أو RPC.
- شاشة أو حالة غير مرسومة في Figma (تحميل، فراغ، لوحي) → صمّمها بالرموز نفسها وبأقرب شاشة مرسومة، وأرفق لقطة في وصف الـ PR.
