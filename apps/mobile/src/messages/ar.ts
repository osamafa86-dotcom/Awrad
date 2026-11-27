// كل نصوص واجهة تطبيق الطالب. لا نصّ عربيّ داخل المكوّنات.

/** Arabic counted noun: 1 → «بند واحد», 2 → «بندان», 3–10 → «3 بنود», 11+ (and 0) → «11 بندًا». */
function countText(n: number, one: string, two: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n >= 3 && n <= 10) return `${n} ${few}`;
  return `${n} ${many}`;
}

/** «يوم واحد» · «يومان» · «5 أيام» · «12 يومًا» (0 → «0 يوم»). */
function daysText(n: number): string {
  return n === 0 ? `${n} يوم` : countText(n, 'يوم واحد', 'يومان', 'أيام', 'يومًا');
}

/** Habits still short of done: «بقي بند واحد» · «بقي بندان» · «بقي 3 بنود» · «بقي 11 بندًا». */
function remainingText(n: number): string {
  return `بقي ${countText(n, 'بند واحد', 'بندان', 'بنود', 'بندًا')}`;
}

const dash = '—';

/** Keeps a number (and its «%») in order inside RTL text on every platform. */
function isolate(text: string): string {
  return `\u2066${text}\u2069`;
}

/** «أسبوع واحد» · «أسبوعان» · «5 أسابيع» · «11 أسبوعًا». */
function weeksText(n: number): string {
  return n === 0 ? `${n} أسبوع` : countText(n, 'أسبوع واحد', 'أسبوعان', 'أسابيع', 'أسبوعًا');
}

const gregorianMonths = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
] as const;

const summaryStates = {
  achieved: 'مُنجَز',
  failed: 'غير مُنجَز',
  neutral: 'بلا تكليف',
  missing: 'غير مسجَّل',
  future: 'لم يأتِ بعد',
} as const;

export const ar = {
  app: {
    name: 'أوراد',
  },
  tabs: {
    today: 'اليوم',
    weekly: 'أسبوعي',
    summary: 'ملخّصي',
    history: 'السجلّ',
    settings: 'الإعدادات',
  },
  common: {
    comingSoon: 'قريبًا',
    /** A value that is not available (no data yet). */
    dash,
    retry: 'إعادة المحاولة',
  },
  auth: {
    loginTitle: 'تسجيل الدخول',
    loginSubtitle: 'اكتب بريدك الإلكتروني وسنرسل لك رمز دخول.',
    emailLabel: 'البريد الإلكتروني',
    emailPlaceholder: 'name@example.com',
    sendCode: 'أرسل رمز الدخول',
    sending: 'جارٍ الإرسال…',
    notRegistered: 'لم تُسجَّل بعد؟ تواصل مع المشرف',
    unknownEmail: 'هذا البريد غير مسجَّل لدينا. تواصل مع المشرف.',
    sendFailed: 'تعذّر إرسال الرمز. تحقّق من اتصالك وحاول مرة أخرى.',
    invalidEmail: 'اكتب بريدًا إلكترونيًا صحيحًا.',
    verifyTitle: 'أدخل رمز الدخول',
    verifySubtitle: 'أرسلنا رمزًا من 6 أرقام إلى',
    otpLabel: 'رمز الدخول المكوّن من 6 أرقام',
    invalidCode: 'الرمز غير صحيح أو انتهت صلاحيته. حاول مرة أخرى.',
    verifyFailed: 'تعذّر التحقّق من الرمز. تحقّق من اتصالك وحاول مرة أخرى.',
    verifying: 'جارٍ التحقّق…',
    resend: 'إعادة الإرسال',
    resendIn: (seconds: number) => `إعادة الإرسال بعد ${seconds} ث`,
    resent: 'أرسلنا رمزًا جديدًا.',
    changeEmail: 'تغيير البريد',
    inactiveTitle: 'حسابك غير مفعَّل، تواصل مع المشرف',
    inactiveBody: 'لا يمكنك استخدام التطبيق حتى يُفعَّل حسابك.',
    staffTitle: 'لوحتك على الويب',
    staffBody: 'حسابك للإشراف، وأدواته متاحة في لوحة الإدارة على الويب.',
    openDashboard: 'افتح اللوحة',
    signOut: 'تسجيل الخروج',
    profileLoadFailed: 'تعذّر تحميل حسابك.',
    retry: 'إعادة المحاولة',
    loading: 'جارٍ التحميل…',
  },
  today: {
    loading: 'جارٍ تحميل أوراد اليوم…',
    loadFailed: 'تعذّر تحميل أوراد اليوم.',
    retry: 'إعادة المحاولة',
    empty: 'لا أوراد يومية لهذا التاريخ.',
    prevDay: 'اليوم السابق',
    nextDay: 'اليوم التالي',
    relToday: 'اليوم',
    relYesterday: 'أمس',
    weekdays: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
    gregorianMonths,
    /** «اليوم، الخميس» · «أمس، الأربعاء» · «الثلاثاء» */
    dayLabel: (relative: string | null, weekday: string) =>
      relative ? `${relative}، ${weekday}` : weekday,
    gregorianDate: (day: number, month: string, year: number) => `${day} ${month} ${year}`,
    /** Accessible summary of the row of habit marks in the header. */
    marksLabel: (done: number, total: number) => `تمّ ${done} من ${total}`,
    /** Accessible name of each habit mark state. */
    markState: {
      unset: 'لم يُسجَّل',
      done: 'تم',
      not_done: 'لم يتم',
      not_required: 'غير مطلوب',
    },
    tristate: {
      done: 'تم',
      notDone: 'لم يتم',
      notRequired: 'غير مطلوب',
    },
    checkAll: 'تعليم الكل',
    notRequiredToday: 'غير مطلوب اليوم',
    /** Counters have no spaces (DESIGN.md §7 rule 4): «10/13». */
    // Wrapped in LRI…PDI so the bidi algorithm keeps it in order on every platform.
    counter: (done: number, total: number) => `\u2066${done}/${total}\u2069`,
    progressLabel: (done: number, total: number) => `أُنجز ${done} من ${total}`,
    markAllDone: 'تعليم الكل تم',
    save: 'حفظ اليوم',
    /** The one reason under a disabled save button (DESIGN.md §7 rule 6). */
    missingStatus: (habitName: string) => `بقي ${habitName} بلا حالة`,
    allSpecified: 'كل الأوراد محدَّدة.',
    noteLabel: 'ملاحظة (اختياري)',
    noteHelper: 'يراها الشيخ ومشرف مجموعتك فقط.',
    streak: (days: number) => `السلسلة الحالية ${daysText(days)}`,
    banner: {
      achieved: 'حُفظ ✓ — يوم مُنجَز',
      failed: (remaining: number) => `حُفظ ✓ — ${remainingText(remaining)}`,
      failedBody: 'الانتظام أهمّ من الكمال.',
      neutral: 'حُفظ ✓ — يوم بلا تكليف',
      errorTitle: 'تعذّر الحفظ',
      retry: 'أعد المحاولة',
      draftKept: 'حفظنا مسوّدتك على هذا الجهاز.',
      readOnly: 'للقراءة فقط',
      readOnlyBody: 'انتهت مهلة التعديل لهذا اليوم.',
    },
  },
  weekly: {
    loading: 'جارٍ تحميل أوراد الأسبوع…',
    loadFailed: 'تعذّر تحميل أوراد الأسبوع.',
    retry: 'إعادة المحاولة',
    empty: 'لا أوراد أسبوعية لهذا الأسبوع.',
    /** «الأسبوع من 22 نوفمبر إلى 28 نوفمبر» */
    title: (from: string, to: string) => `الأسبوع من ${from} إلى ${to}`,
    /** «جمادى الأولى – جمادى الآخرة 1448» (one month when both ends share it). */
    hijriRange: (from: string, to: string) => (from === to ? from : `${from} – ${to}`),
    prevWeek: 'الأسبوع السابق',
    nextWeek: 'الأسبوع التالي',
    reviewLabel: 'مراجعة عامة للأسبوع',
    supportLabel: 'ما تحتاج فيه دعمًا من الشيخ',
    supportHelper: 'يصل إلى الشيخ والمشرف',
    save: 'حفظ الأسبوع',
    missingStatus: (habitName: string) => `بقي ${habitName} بلا حالة`,
    allSpecified: 'كل الأوراد محدَّدة.',
    lastWeek: {
      title: 'لم تسجّل الأسبوع الماضي',
      body: 'ما زال بإمكانك تسجيله خلال مهلة السماح.',
      action: 'سجّله الآن',
    },
    banner: {
      achieved: 'حُفظ ✓ — أسبوع مُنجَز',
      failed: (remaining: number) => `حُفظ ✓ — ${remainingText(remaining)}`,
      neutral: 'أسبوع بلا تكليف',
      readOnly: 'للقراءة فقط',
      readOnlyBody: 'انتهت مهلة التعديل لهذا الأسبوع.',
    },
  },
  summary: {
    loading: 'جارٍ تحميل ملخّصك…',
    loadFailed: 'تعذّر تحميل ملخّصك. تحقّق من الاتصال وأعد المحاولة.',
    calendarFailed: 'تعذّر تحميل التقويم.',
    rangeLabel: 'مدى الملخّص',
    range: { d30: '30 يومًا', d90: '90 يومًا', all: 'الكل' },
    stats: {
      daysLogged: 'أيام مسجَّلة',
      completion: 'نسبة الإنجاز',
      attendance: 'نسبة الحضور',
      longestStreak: 'أطول سلسلة',
      currentStreak: 'السلسلة الحالية',
    },
    /** «91%» with the number kept in order. */
    pct: (n: number) => isolate(`${n}%`),
    habitsTitle: 'نسبة كل عادة',
    /** «الأسبوعي: 11 أسبوعًا · 84%» */
    weekly: (weeks: number, pct: number | null) =>
      `الأسبوعي: ${weeksText(weeks)} · ${pct === null ? dash : isolate(`${pct}%`)}`,
    prevMonth: 'الشهر السابق',
    nextMonth: 'الشهر التالي',
    /** «نوفمبر 2026» for a `YYYY-MM` month. */
    monthYear: (month: string) => {
      const [y, m] = month.split('-').map(Number);
      return `${gregorianMonths[(m ?? 1) - 1] ?? ''} ${y ?? ''}`;
    },
    /** One-letter weekday names indexed 0 = Sunday. */
    weekdayShort: ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'],
    state: summaryStates,
    /** «26 نوفمبر: مُنجَز» */
    cellLabel: (dayLabel: string, stateLabel: string) => `${dayLabel}: ${stateLabel}`,
    todaySuffix: (stateLabel: string) => `${stateLabel}، اليوم`,
    emptyRange: 'لا تسجيلات في هذه الفترة',
    showAll: 'عرض الكل',
    empty: {
      title: 'لم تسجّل بعد',
      body: 'يظهر ملخّصك بعد أول تسجيل لوردك اليومي',
      action: 'سجّل يومك',
    },
  },
  history: {
    loading: 'جارٍ تحميل السجلّ…',
    loadFailed: 'تعذّر تحميل السجلّ. تحقّق من الاتصال وأعد المحاولة.',
    retry: 'إعادة المحاولة',
    tabsLabel: 'نوع السجلّ',
    tabs: { daily: 'يومي', weekly: 'أسبوعي' },
    empty: { title: 'لا سجلّات بعد', body: 'تظهر هنا الأيام والأسابيع التي تسجّلها.' },
    /** Badge on a row still open for editing (not shown on today). */
    editable: 'قابل للتعديل',
    /** Accessibility hint of a locked row. */
    readOnlyHint: 'للقراءة فقط',
    locked: 'مقفل',
    /** A weekly row's trailing text: weeks carry no day state. */
    weeklyLogged: 'مسجَّل',
    loadingMore: 'جارٍ تحميل المزيد…',
    chip: {
      achieved: 'مُنجَز',
      failed: 'بقي بنود',
      neutral: 'بلا تكليف',
      missing: 'غير مسجَّل',
    },
    back: 'رجوع',
    detailTitle: 'تفاصيل السجلّ',
    invalidLog: 'هذا السجلّ غير موجود.',
  },
  settings: {
    saveFailed: 'تعذّر حفظ التغيير، تحقّق من الاتصال وأعد المحاولة.',
    reminders: 'التذكيرات',
    dailyReminder: 'التذكير اليومي',
    reminderTime: 'الوقت',
    reminderTimeInvalid: 'الوقت غير صحيح',
    reminderTimeHint: 'اكتب الوقت بصيغة ٢٤ ساعة، مثل 21:00',
    weeklyReminder: 'التذكير الأسبوعي',
    notifications: 'الإشعارات',
    pushDenied: 'لم يُسمح بالإشعارات. فعّلها من إعدادات الجهاز لتصلك التذكيرات.',
    pushUnavailable: 'الإشعارات غير متاحة في هذا الإصدار',
    openSettings: 'فتح الإعدادات',
    webInstallBanner: 'ثبّت التطبيق على هاتفك لتصلك التذكيرات',
    channelName: 'التذكيرات',
    timezoneSection: 'المنطقة الزمنية',
    timezone: 'المنطقة الزمنية',
    groupDefault: 'افتراضي المجموعة',
    timezonePickerTitle: 'اختر المنطقة الزمنية',
    close: 'إغلاق',
    about: 'عن التطبيق',
    version: 'الإصدار',
    privacy: 'سياسة الخصوصية',
    support: 'الدعم',
    supportValue: 'تواصل مع المشرف',
    requestDeletion: 'طلب حذف حسابي',
    deletionPending: 'طلب الحذف قيد المعالجة',
    signOut: 'تسجيل الخروج',
    deleteTitle: 'طلب حذف الحساب',
    deleteBody: 'سيُحذف حسابك وسجلّاتك نهائيًا بعد موافقة المشرف خلال 30 يومًا',
    deleteAck: 'أفهم أن هذا لا يمكن التراجع عنه',
    deleteConfirm: 'أرسل طلب الحذف',
    deleteCancel: 'إلغاء',
    deleteFailed: 'تعذّر إرسال الطلب، تحقّق من الاتصال وأعد المحاولة.',
    deleteDone: 'استُلم طلبك وسيُنفَّذ خلال 30 يومًا',
    selected: 'المختار',
    done: 'تم',
  },
  errors: {
    missingEnv:
      'إعدادات الاتصال ناقصة: عيّن EXPO_PUBLIC_SUPABASE_URL وEXPO_PUBLIC_SUPABASE_ANON_KEY في ملف ‎.env',
    // RPC error codes (AGENTS.md §6) and anything unrecognised (usually no connection).
    FORBIDDEN: 'لا تملك صلاحية حفظ هذا السجلّ.',
    FUTURE_DATE: 'لا يمكن التسجيل ليوم لم يأتِ بعد.',
    DATE_OUT_OF_WINDOW: 'انتهت مهلة تعديل هذا اليوم، فلا يمكن حفظه.',
    INVALID_WEEK_START: 'بداية الأسبوع غير صحيحة.',
    FREQUENCY_MISMATCH: 'أحد الأوراد لا يتبع هذا السجلّ. حدّث الصفحة وحاول مرة أخرى.',
    INACTIVE_HABIT: 'تغيّرت قائمة الأوراد. حدّث الصفحة وحاول مرة أخرى.',
    INVALID_ITEM: 'تغيّرت بنود إحدى القوائم. حدّث الصفحة وحاول مرة أخرى.',
    INACTIVE_USER: 'حسابك غير مفعَّل، تواصل مع المشرف.',
    MISSING_ENTRY: 'بقي ورد بلا حالة. حدّد حالة كل ورد ثم احفظ.',
    UNKNOWN: 'تعذّر الحفظ، تحقّق من الاتصال وأعد المحاولة.',
  },
} as const;

export const messages = { ar } as const;
export type Messages = typeof ar;
