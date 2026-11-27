// كل نصوص واجهة لوحة الشيخ والمشرف. لا نصّ عربيّ داخل المكوّنات.
// نصوص الدخول منقولة حرفيًا من تطبيق الطالب (apps/mobile/src/messages/ar.ts) ليتطابق التطبيقان.

/** Keeps a number-with-symbol run (`10/13`, `91%`) in reading order inside Arabic text (DESIGN.md §7 rule 4). */
function isolate(text: string): string {
  return `\u2066${text}\u2069`;
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

/** The four day states (DESIGN.md §7 rule 2) and a day still to come, shared by every day cell. */
const dayState = {
  achieved: 'مُنجَز',
  failed: 'غير مُنجَز',
  neutral: 'بلا تكليف',
  missing: 'غير مسجَّل',
  future: 'لم يأتِ بعد',
} as const;

export const ar = {
  app: {
    name: 'أوراد',
    /** The system name under the app name on the sign-in screens (spec §11.1 m01). */
    tagline: 'نظام متابعة الأوراد',
    /** Browser tab title. */
    title: 'أوراد — لوحة الإشراف',
  },
  common: {
    comingSoon: 'قريبًا',
  },
  nav: {
    /** Accessible name of the sidebar navigation. */
    label: 'أقسام اللوحة',
    overview: 'نظرة عامة',
    students: 'الطلاب',
    attendance: 'الحضور',
    support: 'طلبات الدعم',
    habits: 'العادات',
    reports: 'التقارير',
    settings: 'الإعدادات',
    openMenu: 'فتح القائمة',
    closeMenu: 'إغلاق القائمة',
  },
  auth: {
    loginTitle: 'تسجيل الدخول',
    loginSubtitle: 'اكتب بريدك الإلكتروني وسنرسل لك رمز دخول.',
    emailLabel: 'البريد الإلكتروني',
    emailPlaceholder: 'name@example.com',
    sendCode: 'أرسل رمز الدخول',
    sending: 'جارٍ الإرسال…',
    verifyTitle: 'أدخل رمز الدخول',
    verifySubtitle: 'أرسلنا رمزًا من 6 أرقام إلى',
    otpLabel: 'رمز الدخول المكوّن من 6 أرقام',
    verify: 'تأكيد الرمز',
    verifying: 'جارٍ التحقّق…',
    resend: 'إعادة الإرسال',
    resendIn: (seconds: number) => `إعادة الإرسال بعد ${seconds} ث`,
    resent: 'أرسلنا رمزًا جديدًا.',
    changeEmail: 'تغيير البريد',
    signOut: 'تسجيل الخروج',
    /** Display text for each AuthErrorCode a sign-in Server Action returns. */
    errors: {
      INVALID_EMAIL: 'اكتب بريدًا إلكترونيًا صحيحًا.',
      UNKNOWN_EMAIL: 'هذا البريد غير مسجَّل لدينا. تواصل مع المشرف.',
      SEND_FAILED: 'تعذّر إرسال الرمز. تحقّق من اتصالك وحاول مرة أخرى.',
      INVALID_CODE: 'الرمز غير صحيح أو انتهت صلاحيته. حاول مرة أخرى.',
      VERIFY_FAILED: 'تعذّر التحقّق من الرمز. تحقّق من اتصالك وحاول مرة أخرى.',
    },
  },
  dayState,
  overview: {
    title: 'نظرة عامة',
    groupFilter: 'المجموعة',
    allGroups: 'الكل',
    periodLabel: 'الفترة: آخر 14 يومًا',
    /** «16 جمادى الأولى – 29 جمادى الأولى 1448 · 13–26 نوفمبر 2026» under the period label. */
    range: (hijri: string, gregorian: string) => `${hijri} · ${gregorian}`,
    kpis: {
      loggedThisWeek: 'سجّلوا هذا الأسبوع',
      inactive: 'منقطعون ≥3 أيام',
      openSupport: 'طلبات دعم مفتوحة',
    },
    /** One line under each KPI value. */
    kpiCaptions: {
      loggedThisWeek: (shown: number) => `المعروضون: ${isolate(String(shown))}`,
      inactive: 'لم يسجّلوا اليوم ولا في الأيام الثلاثة قبله',
      openSupport: 'تنتظر المعالجة',
    },
    /** The ⚠ on an alert KPI card. */
    alertMark: 'تنبيه',
    gridTitle: 'الطلاب في آخر 14 يومًا',
    columns: { student: 'الطالب', streak: 'السلسلة', completion: 'الإنجاز' },
    /** The ⚠ beside a row's streak. */
    inactiveMark: 'منقطع 3 أيام أو أكثر',
    today: 'اليوم',
    pct: (n: number) => isolate(`${n}%`),
    none: '—',
    empty: {
      title: 'لا طلاب بعد',
      body: 'تظهر هنا أيام كل طالب مُتابَع في آخر 14 يومًا.',
      inviteHint: 'ادعُ طلابك من صفحة الطلاب ليبدؤوا التسجيل.',
      invite: 'دعوة طالب',
    },
    loadFailed: 'تعذّر تحميل النظرة العامة. تحقّق من الاتصال وأعد تحميل الصفحة.',
  },
  dates: {
    gregorianMonths,
    weekdays: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
    /** One-letter weekday names indexed 0 = Sunday (as the mobile calendar). */
    weekdayShort: ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'],
    /** «26 نوفمبر 2026» */
    gregorian: (y: number, m: number, d: number) => `${d} ${gregorianMonths[m - 1] ?? ''} ${y}`,
    /** «نوفمبر 2026» */
    monthYear: (y: number, m: number) => `${gregorianMonths[m - 1] ?? ''} ${y}`,
  },
  students: {
    title: 'الطلاب',
    invite: 'دعوة طالب',
    searchLabel: 'ابحث بالاسم',
    searchPlaceholder: 'ابحث بالاسم',
    groupFilter: 'المجموعة',
    statusFilter: 'الحالة',
    allGroups: 'كل المجموعات',
    allStatuses: 'كل الحالات',
    noGroup: 'بلا مجموعة',
    status: { active: 'نشط', inactive: 'معطَّل' },
    roles: { student: 'طالب', supervisor: 'مشرف', admin: 'مدير' },
    columns: { name: 'الاسم', group: 'المجموعة', status: 'الحالة', joinedAt: 'تاريخ الانضمام', tracked: 'مُتابَع' },
    tracked: { yes: 'نعم', no: 'لا' },
    /** Rows shown after the filters out of all loaded, as a bidi-isolated counter. */
    count: (shown: number, total: number) => `المعروض: ${isolate(`${shown}/${total}`)}`,
    empty: { title: 'لا طلاب بعد', body: 'يظهر هنا من تدعوهم إلى البرنامج.' },
    emptyFiltered: 'لا أحد بهذا الاسم.',
    emptyForFilters: 'لا أحد يطابق هذه التصفية.',
    loadFailed: 'تعذّر تحميل القائمة. تحقّق من الاتصال وأعد تحميل الصفحة.',
    inviteForm: {
      title: 'دعوة طالب',
      subtitle: 'ينشئ حساب الطالب ويرسل إليه بريدًا بخطوات الدخول.',
      fullName: 'الاسم الكامل',
      email: 'البريد الإلكتروني',
      emailPlaceholder: 'name@example.com',
      group: 'المجموعة',
      groupPlaceholder: 'اختر المجموعة',
      joinedAt: 'تاريخ الانضمام إلى البرنامج',
      joinedAtHint: 'افتراضيًا اليوم؛ تبدأ منه السلاسل والنسب.',
      tracked: 'مُتابَع (يسجّل أوراده ويظهر في المتابعة)',
      cancel: 'إلغاء',
      submit: 'أرسل الدعوة',
      submitting: 'جارٍ الإرسال…',
      noGroups: 'أنشئ مجموعة أولًا من الإعدادات.',
    },
    detail: {
      back: 'الطلاب',
      group: 'المجموعة',
      joinedAt: 'انضمّ',
      role: 'الدور',
      summaryTitle: 'الملخّص',
      stats: {
        daysLogged: 'أيام مسجَّلة',
        completion: 'نسبة الإنجاز',
        attendance: 'نسبة الحضور',
        longestStreak: 'أطول سلسلة',
        currentStreak: 'السلسلة الحالية',
      },
      summaryFailed: 'تعذّر تحميل الملخّص.',
      calendarTitle: 'هذا الشهر',
      calendarFailed: 'تعذّر تحميل التقويم.',
      state: dayState,
      /** «26 نوفمبر: مُنجَز» */
      cellLabel: (day: string, state: string) => `${day}: ${state}`,
      todaySuffix: (state: string) => `${state}، اليوم`,
      logsTitle: 'آخر السجلّات',
      logsEmpty: 'لم يسجّل بعد.',
      logsFailed: 'تعذّر تحميل السجلّات.',
      logColumns: { date: 'التاريخ', kind: 'النوع', state: 'الحالة', text: 'الملاحظة أو المراجعة', support: 'دعم' },
      period: { daily: 'يومي', weekly: 'أسبوعي' },
      weeklyLogged: 'مسجَّل',
      supportFlag: { none: '', open: 'طلب دعم مفتوح', handled: 'طلب دعم معالَج' },
      attendanceTitle: 'الحضور',
      attendanceEmpty: 'لا مجالس مسجَّلة له بعد.',
      attendanceFailed: 'تعذّر تحميل الحضور.',
      attendanceColumns: { date: 'التاريخ', title: 'المجلس', status: 'الحالة' },
      attendanceStatus: { present: 'حاضر', absent: 'غائب', excused: 'معذور' },
      untitledSession: 'مجلس',
      pct: (n: number) => isolate(`${n}%`),
      none: '—',
      notFound: 'هذا الحساب غير موجود أو لا تملك صلاحية عرضه.',
    },
    edit: {
      title: 'تعديل البيانات',
      fullName: 'الاسم الكامل',
      group: 'المجموعة',
      joinedAt: 'تاريخ الانضمام',
      tracked: 'مُتابَع',
      save: 'حفظ التغييرات',
      saving: 'جارٍ الحفظ…',
      saved: 'حُفظت التغييرات.',
      deactivate: 'تعطيل الحساب',
      activate: 'تفعيل الحساب',
      dangerTitle: 'حذف الحساب',
      dangerBody: 'يحذف الحساب وكل سجلّاته وحضوره نهائيًا، ولا يمكن التراجع.',
      delete: 'حذف الحساب نهائيًا',
      confirmTitle: 'حذف الحساب نهائيًا؟',
      confirmBody: (name: string) => `سيُحذف حساب «${name}» وكل سجلّاته وحضوره، ولا يمكن استرجاعها.`,
      confirm: 'احذف نهائيًا',
      deleting: 'جارٍ الحذف…',
      cancel: 'إلغاء',
    },
    /** Display text for each code a students Server Action returns. */
    errors: {
      FORBIDDEN: 'هذا الإجراء للمدير وحده.',
      SELF_FORBIDDEN: 'لا يمكنك تعطيل حسابك أو حذفه بنفسك.',
      EMAIL_EXISTS: 'هذا البريد مسجَّل لحساب آخر.',
      INVALID_INPUT: 'راجع الحقول المعلَّمة.',
      INVITE_FAILED: 'تعذّرت الدعوة. تحقّق من الاتصال وحاول مرة أخرى.',
      SAVE_FAILED: 'تعذّر حفظ التغييرات. حاول مرة أخرى.',
      DELETE_FAILED: 'تعذّر حذف الحساب. حاول مرة أخرى.',
    },
    fieldErrors: {
      email: 'اكتب بريدًا إلكترونيًا صحيحًا.',
      full_name: 'اكتب الاسم.',
      group_id: 'اختر مجموعة.',
      joined_at: 'اختر تاريخًا لا يتجاوز اليوم.',
    },
  },
  attendance: {
    title: 'الحضور',
    newSession: 'مجلس جديد',
    /** A session without a title. */
    untitled: 'بلا عنوان',
    /** A shared session (group_id null). */
    allGroups: 'كل المجموعات',
    /** A list row's marked out of listed, the counter bidi-isolated with no spaces (DESIGN.md §7 rule 4). */
    markedLabel: (marked: number, total: number) => `المسجَّل ${isolate(`${marked}/${total}`)}`,
    empty: { title: 'لا مجالس بعد', body: 'أنشئ مجلسًا بعد كل درس لتسجيل حضوره.' },
    loadFailed: 'تعذّر تحميل المجالس. تحقّق من الاتصال وأعد تحميل الصفحة.',
    form: {
      title: 'مجلس جديد',
      subtitle: 'اختر التاريخ والمجموعة، ثم سجّل الحضور في الصفحة التالية.',
      date: 'التاريخ',
      sessionTitle: 'العنوان (اختياري)',
      titlePlaceholder: 'مثال: درس الفقه',
      group: 'المجموعة',
      groupPlaceholder: 'اختر المجموعة',
      cancel: 'إلغاء',
      submit: 'إنشاء المجلس',
      submitting: 'جارٍ الإنشاء…',
    },
    fieldErrors: {
      group_id: 'اختر المجموعة.',
      session_date: 'اختر تاريخًا صحيحًا.',
      title: 'العنوان طويل؛ اختصره إلى 200 حرف.',
    },
    detail: {
      back: 'الحضور',
      date: 'التاريخ',
      group: 'المجموعة',
      notFound: 'هذا المجلس غير موجود أو لا تملك صلاحية عرضه.',
      noSections: 'لا أحد مُتابَع في هذا المجلس ضمن مجموعاتك.',
      noMembers: 'لا أحد مُتابَع في هذه المجموعة.',
    },
    /** AttendanceSegment's four states (DESIGN.md §6). */
    status: { unmarked: 'لم يُسجَّل', present: 'حاضر', absent: 'غائب', excused: 'معذور' },
    allPresent: 'الكل حاضر',
    /** Under «الكل حاضر» (Ruling ATT-1). */
    allPresentHint: 'يعلّم «حاضر» من لا حالة له فقط، ولا يغيّر ما عُلِّم.',
    save: 'حفظ',
    saving: 'جارٍ الحفظ…',
    saved: 'حُفظ الحضور.',
    /** «المسجَّل 3/4 · حاضر 2 · غائب 1 · معذور 0» under the grid. */
    counts: (c: { marked: number; total: number; present: number; absent: number; excused: number }) =>
      `المسجَّل ${isolate(`${c.marked}/${c.total}`)} · حاضر ${c.present} · غائب ${c.absent} · معذور ${c.excused}`,
    /** «آخر حفظ: 27 نوفمبر 2026، 13:05» */
    lastSaved: (date: string, time: string) => `آخر حفظ: ${date}، ${isolate(time)}`,
    deleteSession: 'حذف المجلس',
    confirmTitle: 'حذف المجلس؟',
    confirmBody: 'يُحذف المجلس وكل ما سُجّل فيه من حضور، ولا يمكن التراجع.',
    confirm: 'احذف المجلس',
    deleting: 'جارٍ الحذف…',
    cancel: 'إلغاء',
    /** Display text for each code an attendance Server Action returns. */
    errors: {
      FORBIDDEN: 'لا تملك صلاحية هذا الإجراء على هذا المجلس.',
      INVALID_INPUT: 'راجع الحقول المعلَّمة.',
      INVALID_ITEM: 'في القائمة من لا يُسجَّل حضوره في هذا المجلس. أعد تحميل الصفحة وحاول مرة أخرى.',
      CREATE_FAILED: 'تعذّر إنشاء المجلس. حاول مرة أخرى.',
      SAVE_FAILED: 'تعذّر حفظ الحضور. تحقّق من الاتصال وحاول مرة أخرى.',
      DELETE_FAILED: 'تعذّر حذف المجلس. حاول مرة أخرى.',
    },
  },
  unauthorized: {
    /** a30: a student (or an account without a profile) opened the dashboard. */
    staffOnlyTitle: 'هذه اللوحة للمشرفين',
    staffOnlyBody: 'إن كنت طالبًا فسجّل أورادك من تطبيق أوراد على جوالك.',
    /** a30: a deactivated staff or student account. */
    inactiveTitle: 'حسابك غير مفعَّل، تواصل بالمدير',
    inactiveBody: 'لا يمكنك استخدام اللوحة حتى يُفعَّل حسابك.',
  },
} as const;
