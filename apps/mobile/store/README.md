# أصول المتاجر — «أوراد — مفاتيح العلوم»

نصوص صفحة التطبيق في App Store وGoogle Play (الجزء 5.2a). الصور (الجزء 5.2b) لم تُنتَج بعد — انظر آخر الملف.

## التخطيط

```
apps/mobile/store/
  metadata/                 # iOS فقط — fastlane deliver (والأب الذي تحته مجلدات اللغات)
    ar-SA/
      name.txt  subtitle.txt  description.txt  keywords.txt
      promotional_text.txt  release_notes.txt  privacy_url.txt  support_url.txt
  play/                     # Android — fastlane supply (خارج شجرة iOS كي لا يرى deliver لغةً اسمها android)
    ar/
      title.txt  short_description.txt  full_description.txt
      changelogs/default.txt
      images/               # (5.2b) icon.png  featureGraphic.png  phoneScreenshots/1..3.png
  screenshots/ar-SA/        # (5.2b) 1_today.png  2_summary.png  3_weekly.png
```

يقرؤها خط النشر في مستودع appstore-release (`apps/awrad.yml`) هكذا:

| المفتاح | يقرأ |
|---|---|
| `store.metadata` | `apps/mobile/store/metadata` (الأب؛ تحته `ar-SA/` بالنصوص وروابط الخصوصية والدعم) |
| `store.screenshots` | `apps/mobile/store/screenshots` (الأب؛ تحته `ar-SA/`) |
| `android.metadata` | `apps/mobile/store/play` (مجلد اللغة `ar` تحته) |

## الحدود وعدد الأحرف المقاس

العدّ بـ python `len()` على النص بعد `strip()`. كل ملف ينتهي بسطر جديد واحد بلا مسافات زائدة.

| الملف | الحدّ | المقاس |
|---|---|---|
| iOS `name.txt` | 30 | 21 |
| iOS `subtitle.txt` | 30 | 24 |
| iOS `description.txt` | 4000 | 1595 |
| iOS `keywords.txt` (مفصولة بفواصل بلا مسافات) | 100 | 89 |
| iOS `promotional_text.txt` | 170 | 113 |
| iOS `release_notes.txt` (1.0.0، ثلاث نقاط) | 4000 | 156 |
| iOS `privacy_url.txt` / `support_url.txt` | — | 33 / 76 |
| Android `title.txt` | 30 | 21 |
| Android `short_description.txt` | 80 | 62 |
| Android `full_description.txt` (= وصف iOS) | 4000 | 1595 |
| Android `changelogs/default.txt` (= ملاحظات الإصدار) | 500 | 156 |

العدّ بـ `len()` يطابق عدّ المتجرين لأن النصوص بلا رموز تعبيرية.

## iPhone فقط في 1.0

`ios.supportsTablet` في `app.json` = `false`: الإصدار 1.0 للآيفون وحده، فلا لقطات iPad مطلوبة، ومستخدمو iPad يشغّلون تطبيق الآيفون بوضع التوافق. تخطيطات الأجهزة اللوحية في V2 (ثم تُعاد القيمة إلى `true` وتُنتج لقطات 2064×2752).

## الصور المطلوبة في 5.2b (من Figma)

المعرّفات والمقاييس تحقّقت في المحاولة السابقة (`download_assets` نجح؛ عائق التنزيل أن المضيف www.figma.com محجوب من وكيل الجلسة).

| الأصل | العقدة | المقياس | الناتج |
|---|---|---|---|
| أيقونة التطبيق | `8:33` | ×4 | 1024×1024 → `assets/images/icon.png` |
| مقدّمة الأيقونة التكيّفية (Android) | علامة `8:7` | ×4 | تُحشى بشفافية إلى 1024×1024 → `android-icon-foreground.png` |
| أحادية اللون (Android) | من العلامة `8:7` | — | `android-icon-monochrome.png` |
| شاشة البداية | `33:138` | ×3 | قصّ مربّع مركزي (الميدالية والاسم) لـ `resizeMode: contain` على `#12392c` → `splash-icon.png` |
| لقطة 1 | `33:154` | ×1 | 1320×2868 → `store/screenshots/ar-SA/1_today.png` |
| لقطة 2 | `33:184` | ×1 | 1320×2868 → `store/screenshots/ar-SA/2_summary.png` |
| لقطة 3 | `33:305` | ×1 | 1320×2868 → `store/screenshots/ar-SA/3_weekly.png` |
| أيقونة Play | `8:33` | — | 512×512 → `store/play/ar/images/icon.png` |
| صورة الميزة | — | — | 1024×500 → `store/play/ar/images/featureGraphic.png` |
| لقطات الهاتف (Play) | نفس العقد الثلاث | — | `store/play/ar/images/phoneScreenshots/1..3.png` مقصوصة أو مبطَّنة إلى 9:16 |

ملاحظات: `app.json` يضبط الإقلاع بـ `expo-splash-screen` (`resizeMode: contain`، `backgroundColor: #12392c` وهو `bg/brand` في رموز التصميم) فلا تغيير في الإعداد. الإعداد التكيّفي يستعمل أيضًا `android-icon-background.png` و`android-icon-monochrome.png` في `assets/images` (لا ذكر لهما في المهمة): يبقى الخلفية لونًا مصمتًا والأحادية مشتقّة من العلامة.

## بنود مفتوحة للمالك

1. **النطاق الإنتاجي:** `privacy_url.txt` و`support_url.txt` يشيران إلى نطاق الاختبار `awrad.emdatra.org`؛ استبدلهما بالنطاق الإنتاجي قبل التقديم. رابط الدعم الحالي هو قسم «التواصل» في صفحة الخصوصية (`/privacy#التواصل`، والمقطع مرمَّز بالنسبة المئوية `%D8%A7%D9%84%D8%AA%D9%88%D8%A7%D8%B5%D9%84` كي يبقى الملف ASCII)؛ استبدله بصفحة دعم حقيقية متى وُجدت.
2. **حساب مراجعة تجريبي:** آبل وGoogle تطلبان حسابًا للمراجعة، والدخول برمز البريد يحتاج بريدًا يستطيع المراجع قراءته؛ يلزم حساب تجريبي مُعدّ مسبقًا.
3. **الإنجليزية:** لغة العرض الحالية العربية وحدها؛ إضافة `en-US` لاحقة.
4. **`store.social_media`:** جواب سؤال «وسائل التواصل» في استبيان التصنيف العمري إقرارٌ من المالك لآبل، ولا يُخمَّن من الشيفرة. التطبيق لا يعرض محتوى طالب لطالب آخر، لكن القرار للمالك.
5. **بريد التواصل:** `docs/privacy-policy.md` (السطر 40) ما زال فيه البديل `privacy@<domain>`؛ يلزم بريد حقيقي (تشترطه آبل وGoogle، ويُدخل أيضًا في حقل التواصل بـ Play وبيانات المراجعة في ASC).
6. **رابط الخصوصية داخل التطبيق:** يظهر صفّ «سياسة الخصوصية» في الإعدادات فقط إن وُجد `EXPO_PUBLIC_ADMIN_URL` وقت البناء؛ يجب ضبطه في بناء المتاجر (`.env.production`، DEP-11).
