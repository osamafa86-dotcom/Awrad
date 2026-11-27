# أصول المتاجر — «أوراد — مفاتيح العلوم»

نصوص صفحة التطبيق في App Store وGoogle Play (الجزء 5.2a) وصورهما وأيقونات التطبيق (الجزء 5.2b، كلها مُنتَجة من Figma).

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
      images/               # icon.png  featureGraphic.png  phoneScreenshots/1..3.png
  screenshots/ar-SA/        # 1_today.png  2_summary.png  3_weekly.png
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

## الصور المُنتَجة (5.2b)

ملف Figma `KMQtYs5sFeyMG5lgWqMJOg`. كل التصديرات PNG معتمة (الخلفية الخضراء `#12392c` مخبوزة فيها)، والتركيبات بـ PIL.

| الملف | العقدة | المقياس | الخطوة | الناتج |
|---|---|---|---|---|
| `assets/images/icon.png` | `8:33` | ×4 | تصدير مباشر (معتم، بلا ألفا) | 1024×1024 RGB |
| `assets/images/android-icon-foreground.png` | العلامة `8:7` | ×4 | الألفا مُشتقّة من مسافة اللون عن الخلفية نحو الذهب، العلامة بارتفاع 55% من اللوحة في المنتصف (داخل المنطقة الآمنة 66%) | 1024×1024 RGBA |
| `assets/images/android-icon-background.png` | — | — | لون مصمت `#12392c` | 1024×1024 RGB |
| `assets/images/android-icon-monochrome.png` | `8:7` | ×4 | الصورة الظلّية نفسها بالأبيض الصرف على شفافية | 1024×1024 RGBA |
| `assets/images/splash-icon.png` | `33:138` | ×3 | قصّ مربّع مركزي 1170×1170 ثم تصغير إلى 1024 (الميدالية والاسم) | 1024×1024 RGB |
| `assets/images/favicon.png` | `8:33` | — | تصغير الأيقونة | 48×48 RGB |
| `screenshots/ar-SA/1_today.png` | `33:154` | ×1 | تسطيح الألفا | 1320×2868 RGB |
| `screenshots/ar-SA/2_summary.png` | `33:184` | ×1 | تسطيح الألفا | 1320×2868 RGB |
| `screenshots/ar-SA/3_weekly.png` | `33:305` | ×1 | تسطيح الألفا | 1320×2868 RGB |
| `play/ar/images/icon.png` | `8:33` | ×4 | تصغير إلى 512 | 512×512 RGB |
| `play/ar/images/featureGraphic.png` | `8:26` + `8:8` | ×4 | الميدالية 500×500 يسارًا والشعار الأفقي بارتفاع 210 يمينًا على `#12392c` | 1024×500 RGB |
| `play/ar/images/phoneScreenshots/1..3.png` | الإطارات الثلاثة | ×1 | تبطين جانبي على الأخضر إلى 1613×2868 (9:16) بدل القصّ من الأسفل، فيبقى العنوان والهاتف كاملين بشريط التنقل | 1613×2868 RGB |

ملاحظات: `app.json` يضبط الإقلاع بـ `expo-splash-screen` (`resizeMode: contain`، `backgroundColor: #12392c` وهو `bg/brand`) فلا تغيير في الإعداد. لإعادة التوليد: صدّر العقد أعلاه بالمقاييس المذكورة وأعد التركيب بالخطوات في الجدول.

## بنود مفتوحة للمالك

1. **النطاق الإنتاجي:** `privacy_url.txt` و`support_url.txt` يشيران إلى نطاق الاختبار `awrad.emdatra.org`؛ استبدلهما بالنطاق الإنتاجي قبل التقديم. رابط الدعم الحالي هو صفحة الخصوصية العامة (وآخر أقسامها قسم «التواصل»، `/privacy#التواصل` والمقطع مرمَّز بالنسبة المئوية `%D8%A7%D9%84%D8%AA%D9%88%D8%A7%D8%B5%D9%84` كي يبقى الملف ASCII). **المقطع لا يفعل شيئًا حاليًا:** مُصيِّر Markdown في اللوحة لا يعطي العناوين `id`، فيفتح الرابط الصفحة من أعلاها إلى أن تُعطى العناوين معرّفات. استبدل الرابط بصفحة دعم حقيقية متى وُجدت.
2. **حساب مراجعة تجريبي:** آبل وGoogle تطلبان حسابًا للمراجعة، والدخول برمز البريد يحتاج بريدًا يستطيع المراجع قراءته؛ يلزم حساب تجريبي مُعدّ مسبقًا.
3. **الإنجليزية:** لغة العرض الحالية العربية وحدها؛ إضافة `en-US` لاحقة.
4. **`store.social_media`:** جواب سؤال «وسائل التواصل» في استبيان التصنيف العمري إقرارٌ من المالك لآبل، ولا يُخمَّن من الشيفرة. التطبيق لا يعرض محتوى طالب لطالب آخر، لكن القرار للمالك.
5. **بريد التواصل:** `docs/privacy-policy.md` (السطر 40) ما زال فيه البديل `privacy@<domain>`؛ يلزم بريد حقيقي (تشترطه آبل وGoogle، ويُدخل أيضًا في حقل التواصل بـ Play وبيانات المراجعة في ASC).
6. **رابط الخصوصية داخل التطبيق:** يظهر صفّ «سياسة الخصوصية» في الإعدادات فقط إن وُجد `EXPO_PUBLIC_ADMIN_URL` وقت البناء؛ يجب ضبطه في بناء المتاجر (`.env.production`، DEP-11).
