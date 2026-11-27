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

/** «بند واحد · بندان · 3 بنود · 13 بندًا» (Arabic number agreement). */
function itemCount(n: number): string {
  if (n === 1) return 'بند واحد';
  if (n === 2) return 'بندان';
  if (n >= 3 && n <= 10) return `${n} بنود`;
  return `${n} بندًا`;
}

export const ar = {
  app: {
    name: 'أوراد',
    /** The system name under the app name on the sign-in screens (spec §11.1 m01). */
    tagline: 'نظام متابعة الأوراد',
    /** Browser tab title. */
    title: 'أوراد — لوحة الإشراف',
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
  /** The double confirmation before a permanent account deletion (student page and deletion requests). */
  deleteAccount: {
    title: (name: string) => `حذف حساب «${name}» نهائيًا؟`,
    body: 'يُحذف ما يلي نهائيًا، ولا يمكن التراجع:',
    removed: ['الحساب', 'السجلّات', 'الحضور', 'طلبات الدعم'],
    typeName: (name: string) => `للتأكيد اكتب الاسم الكامل: ${name}`,
    confirm: 'حذف نهائي',
    deleting: 'جارٍ الحذف…',
    cancel: 'إلغاء',
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
  habits: {
    title: 'العادات',
    subtitle: 'يقرأ التطبيق العادات من هنا. تغيير الاسم أو الاستبدال لا يمسّ سجلّات الطلاب القديمة.',
    newHabit: 'عادة جديدة',
    tabs: { daily: 'اليومية', weekly: 'الأسبوعية' },
    /** Accessible name of each table. */
    tableLabel: { daily: 'العادات اليومية', weekly: 'العادات الأسبوعية' },
    columns: { reorder: 'الترتيب', name: 'الاسم', target: 'الهدف', kind: 'النوع', period: 'نشطة منذ', actions: 'الإجراءات' },
    archivedColumns: { name: 'الاسم', target: 'الهدف', kind: 'النوع', period: 'الفترة', actions: 'الإجراءات' },
    kind: { tristate: 'ثلاثية', checklist: 'قائمة' },
    /** «قائمة · 13 بندًا» */
    checklistCount: (n: number) => `قائمة · ${itemCount(n)}`,
    /** «تبدأ 1 ديسمبر 2026» for a replacement that has not started yet. */
    startsOn: (date: string) => `تبدأ ${date}`,
    /** The archived period: «1 مارس 2026 – 30 نوفمبر 2026». */
    period: (from: string, to: string) => `${from} – ${to}`,
    noTarget: '—',
    empty: { title: 'لا عادات بعد', body: 'أضف عادة لتظهر للطلاب في هذا الجدول.' },
    archived: (n: number) => `المؤرشفة (${n})`,
    deleteNote: 'الحذف متاحٌ لعادةٍ بلا سجلّات فقط؛ ما له سجلّات يُؤرشف ويُستبدل.',
    loadFailed: 'تعذّر تحميل العادات. تحقّق من الاتصال وأعد تحميل الصفحة.',
    /** The inline editors: the name and target are buttons that turn into a field (Enter saves, Esc cancels). */
    inline: {
      name: 'اسم العادة',
      target: 'هدف العادة',
      itemName: 'اسم البند',
      editHint: 'اضغط للتعديل، ثم Enter للحفظ أو Esc للإلغاء.',
      saving: 'جارٍ الحفظ…',
    },
    actions: {
      edit: 'تعديل',
      replace: 'أرشفة واستبدال',
      more: (name: string) => `إجراءات أخرى لـ«${name}»`,
      archive: 'أرشفة',
      delete: 'حذف',
    },
    /** Drag-to-reorder (dnd-kit), announced in Arabic. */
    reorder: {
      handle: (name: string) => `إعادة ترتيب «${name}»`,
      roleDescription: 'عنصر قابل للترتيب',
      instructions:
        'لإعادة الترتيب اضغط المسافة أو Enter لالتقاط العنصر، ثم الأسهم لتحريكه، ثم المسافة أو Enter لإفلاته، أو Esc للإلغاء.',
      picked: (name: string, position: number, total: number) => `التُقط «${name}»، الموضع ${position} من ${total}.`,
      moved: (name: string, position: number, total: number) => `«${name}» الآن في الموضع ${position} من ${total}.`,
      dropped: (name: string, position: number, total: number) => `أُفلت «${name}» في الموضع ${position} من ${total}.`,
      cancelled: (name: string) => `أُلغي نقل «${name}».`,
      saved: 'حُفظ الترتيب.',
    },
    items: {
      title: 'بنود القائمة — تُسحب لإعادة الترتيب',
      add: 'إضافة بند',
      addLabel: 'اسم البند الجديد',
      addSubmit: 'أضف',
      cancel: 'إلغاء',
      archived: (n: number) => `البنود المؤرشفة (${n})`,
      until: (date: string) => `حتى ${date}`,
      label: (name: string) => `بند «${name}»`,
    },
    form: {
      title: 'عادة جديدة',
      subtitle: 'تظهر للطلاب من تاريخ البدء، في جدول تكرارها.',
      editTitle: 'تعديل العادة',
      editSubtitle: 'تصحيح الاسم أو الهدف يظهر على السجلّات القديمة أيضًا. لتغيير المحتوى استعمل «أرشفة واستبدال».',
      name: 'اسم العادة',
      description: 'الوصف (اختياري)',
      target: 'الهدف (اختياري)',
      targetPlaceholder: 'مثال: ست صفحات يوميًا',
      frequency: 'التكرار',
      frequencies: { daily: 'يومية', weekly: 'أسبوعية' },
      kind: 'النوع',
      kinds: { tristate: 'ثلاثية (تم · لم يتم · غير مطلوب)', checklist: 'قائمة بنود' },
      activeFrom: 'تاريخ البدء',
      items: 'البنود (بند في كل سطر)',
      cancel: 'إلغاء',
      submit: 'إضافة العادة',
      save: 'حفظ',
      submitting: 'جارٍ الحفظ…',
    },
    archive: {
      title: (name: string) => `أرشفة «${name}»؟`,
      body: 'لا تظهر للطلاب بعد آخر يوم تختاره، وتبقى سجلّاتها كما هي.',
      itemTitle: (name: string) => `أرشفة البند «${name}»؟`,
      date: 'آخر يوم نشاط',
      confirm: 'أرشفة',
      submitting: 'جارٍ الأرشفة…',
      cancel: 'إلغاء',
    },
    remove: {
      title: (name: string) => `حذف «${name}» نهائيًا؟`,
      body: 'لا سجلّات لها، فتُحذف مع بنودها ولا يمكن التراجع.',
      itemBody: 'لم يعلّمه أحد بعد، فيُحذف ولا يمكن التراجع.',
      confirm: 'احذف',
      submitting: 'جارٍ الحذف…',
      cancel: 'إلغاء',
    },
    replace: {
      title: (name: string) => `أرشفة «${name}» واستبدالها`,
      body: 'تنتهي العادة الحالية في اليوم السابق لتاريخ البدء وتبقى سجلّاتها كما هي، وتظهر الجديدة للطلاب من تاريخ البدء.',
      name: 'اسم العادة الجديدة',
      namePlaceholder: 'مثال: الكتاب التالي في المقرّر',
      target: 'الهدف',
      description: 'الوصف (اختياري)',
      startDate: 'تاريخ البدء',
      items: 'بنود القائمة الجديدة (بند في كل سطر)',
      /** «تبدأ الجديدة 1 ديسمبر 2026 — 21 جمادى الآخرة 1448هـ» under the start date (a07). */
      startsOn: (gregorian: string, hijri: string) => `تبدأ الجديدة ${gregorian} — ${hijri}`,
      /** «تنتهي «X» في 30 نوفمبر 2026.» under the start date. */
      endsOn: (name: string, date: string) => `تنتهي «${name}» في ${date}.`,
      cancel: 'إلغاء',
      submit: 'أرشفة واستبدال',
      submitting: 'جارٍ الاستبدال…',
    },
    fieldErrors: {
      name: 'اكتب الاسم.',
      description: 'الوصف طويل؛ اختصره.',
      target_text: 'الهدف طويل؛ اختصره.',
      frequency: 'اختر التكرار.',
      kind: 'اختر النوع.',
      active_from: 'اختر تاريخًا من اليوم فصاعدًا.',
      items: 'اكتب بندًا واحدًا على الأقل.',
      date: 'اختر تاريخًا صحيحًا.',
    },
    /** Display text for each code a habits Server Action returns. */
    errors: {
      FORBIDDEN: 'إدارة العادات للمدير وحده.',
      INVALID_INPUT: 'راجع الحقول المعلَّمة.',
      HABIT_HAS_LOGS: 'لهذه العادة أو البند سجلّات، فلا يُحذف. أرشِفه بدلًا من ذلك.',
      DATE_OUT_OF_WINDOW: 'تاريخ البدء يجب أن يأتي بعد بداية العادة الحالية وبعد آخر يوم سُجّلت فيه.',
      INACTIVE_HABIT: 'هذه العادة مؤرشفة بالفعل. أعد تحميل الصفحة.',
      INVALID_ITEM: 'بيانات العادة الجديدة غير صالحة: تحقّق من الاسم والبنود.',
      SAVE_FAILED: 'تعذّر الحفظ. تحقّق من الاتصال وحاول مرة أخرى.',
    },
  },
  support: {
    title: 'طلبات الدعم',
    subtitle: 'ما يطلبه الطلاب في مراجعاتهم الأسبوعية، وطلبات حذف الحساب.',
    tabsLabel: 'أقسام طلبات الدعم',
    tabs: { open: 'المفتوحة', handled: 'المعالَجة', deletion: 'طلبات حذف الحساب' },
    /** The count beside a tab's name, bidi-isolated (DESIGN.md §7 rule 4). */
    count: (n: number) => isolate(String(n)),
    /** A request on a daily log (they come from weekly logs; shown if one ever does). */
    frequency: { daily: 'يومي', weekly: 'أسبوعي' },
    /** «أسبوع 12 جمادى الآخرة 1448هـ · 22 نوفمبر 2026» (the week's first day). */
    week: (hijri: string, gregorian: string) => `أسبوع ${hijri} · ${gregorian}`,
    /** A daily log's day. */
    day: (hijri: string, gregorian: string) => `${hijri} · ${gregorian}`,
    noGroup: 'بلا مجموعة',
    unknownStudent: 'طالب',
    review: 'المراجعة',
    noReview: 'لم يكتب مراجعة.',
    request: 'طلب الدعم',
    handledNote: 'الملاحظة الداخلية',
    noNote: 'بلا ملاحظة.',
    /** «عالجه مشرف المجموعة في 26 نوفمبر 2026» */
    handledBy: (name: string, date: string) => `عالجه ${name} في ${date}`,
    /** When the viewer may not read the handler's profile. */
    handledOn: (date: string) => `عولج في ${date}`,
    handledWindow: 'تظهر هنا الطلبات المعالَجة في آخر 90 يومًا.',
    empty: {
      open: { title: 'لا طلبات مفتوحة', body: 'تظهر هنا طلبات الدعم التي يكتبها الطلاب في مراجعاتهم الأسبوعية.' },
      handled: { title: 'لا طلبات معالَجة', body: 'تظهر هنا الطلبات التي عولجت في آخر 90 يومًا.' },
      deletion: {
        title: 'لا طلبات حذف',
        body: 'يطلب الطالب حذف حسابه من إعدادات التطبيق، ويُنفَّذ الطلب من هنا خلال 30 يومًا.',
      },
    },
    /** a05 */
    handle: {
      open: 'تمّت المعالجة',
      title: 'معالجة طلب الدعم',
      student: 'الطالب',
      week: 'الأسبوع',
      note: 'ملاحظة داخلية (اختياري)',
      noteHint: 'لا يراها الطالب؛ تظهر للمدير ولمشرف المجموعة.',
      cancel: 'إلغاء',
      submit: 'تمّت المعالجة',
      submitting: 'جارٍ الحفظ…',
    },
    deletion: {
      /** «طُلب في 27 نوفمبر 2026» */
      requestedOn: (date: string) => `طُلب في ${date}`,
      /** «آخر موعد للتنفيذ: 27 ديسمبر 2026» */
      deadline: (date: string) => `آخر موعد للتنفيذ: ${date}`,
      overdue: 'متأخّر',
      delete: 'حذف نهائي',
      dismiss: 'رفض الطلب',
      dismissing: 'جارٍ الرفض…',
    },
    loadFailed: 'تعذّر تحميل طلبات الدعم. تحقّق من الاتصال وأعد تحميل الصفحة.',
    /** Display text for each code a support Server Action returns. */
    errors: {
      FORBIDDEN: 'لا تملك صلاحية معالجة هذا الطلب.',
      INVALID_INPUT: 'الملاحظة طويلة؛ اختصرها إلى 2000 حرف.',
      INVALID_ITEM: 'لم يعد هذا الطلب قائمًا. أعد تحميل الصفحة.',
      SAVE_FAILED: 'تعذّر الحفظ. تحقّق من الاتصال وحاول مرة أخرى.',
    },
  },
  reports: {
    title: 'التقارير',
    subtitle: 'نزّل سجلّات فترة كملف CSV: صفّ لكل طالب في كل يوم أو أسبوع أو مجلس.',
    kind: 'نوع التقرير',
    kinds: { daily: 'السجلّ اليومي', weekly: 'السجلّ الأسبوعي', attendance: 'الحضور' },
    period: 'الفترة',
    presetsLabel: 'فترات جاهزة',
    presets: { thisMonth: 'هذا الشهر', lastMonth: 'الشهر الماضي', last30: 'آخر 30 يومًا' },
    from: 'من',
    to: 'إلى',
    group: 'المجموعة',
    allGroups: 'الكل',
    download: 'تنزيل CSV',
    excelNote: 'الملف بترميز UTF-8 مع علامة BOM، فيفتحه Excel بالعربية مباشرةً.',
    /** Under a disabled «تنزيل CSV» (DESIGN.md §7 rule 6: one reason). */
    invalid: {
      dates: 'اختر تاريخين صحيحين.',
      order: 'تاريخ البداية بعد تاريخ النهاية.',
      range: 'الفترة أطول من 366 يومًا؛ قسّمها إلى ملفّين.',
    },
    noGroups: 'لا مجموعات تشرف عليها بعد؛ سيخرج الملف بلا صفوف.',
    loadFailed: 'تعذّر تحميل صفحة التقارير. تحقّق من الاتصال وأعد تحميل الصفحة.',
    /** The file's text (src/lib/export-rows.ts). */
    csv: {
      headers: {
        student: 'الطالب',
        group: 'المجموعة',
        date: 'التاريخ',
        hijri: 'التاريخ الهجري',
        dayPct: 'نسبة اليوم',
        state: 'الحالة',
        note: 'الملاحظة',
        weekStart: 'بداية الأسبوع',
        hijriShort: 'الهجري',
        pct: 'النسبة',
        review: 'المراجعة',
        request: 'طلب الدعم',
        requestStatus: 'حالة الطلب',
        sessionDate: 'تاريخ المجلس',
        sessionTitle: 'عنوان المجلس',
        recordedBy: 'سجّله',
      },
      entry: { done: 'تم', not_done: 'لم يتم', not_required: 'غير مطلوب' },
      support: { none: '—', open: 'مفتوح', handled: 'معالَج' },
      attendance: { present: 'حاضر', absent: 'غائب', excused: 'معذور' },
      /** A second habit column with the same name: «الفجر (2)». */
      duplicate: (name: string, n: number) => `${name} (${n})`,
    },
  },
  settings: {
    title: 'الإعدادات',
    subtitle: 'ما يُضبط هنا يغيّر سلوك التطبيق واللوحة لكل الطلاب والمشرفين.',
    app: {
      title: 'إعدادات النظام',
      fields: {
        streak_threshold_pct: {
          label: 'عتبة اليوم المُنجَز (%)',
          hint: 'نسبة الإنجاز التي يُعدّ بها اليوم مُنجَزًا ويدخل في السلسلة، من 50 إلى 100.',
        },
        backfill_days: {
          label: 'نافذة التعديل (أيام)',
          hint: 'كم يومًا سابقًا يستطيع الطالب أن يسجّله أو يعدّله، من 0 إلى 14.',
        },
        weekly_grace_days: {
          label: 'مهلة المراجعة الأسبوعية (أيام)',
          hint: 'أيام بعد نهاية الأسبوع يُقبل فيها حفظ مراجعته، من 0 إلى 7.',
        },
        hijri_adjustment_days: {
          label: 'تعديل التاريخ الهجري (أيام)',
          hint: 'يُضاف إلى تقويم أم القرى في التطبيق واللوحة إن خالف رؤية الهلال، من −2 إلى 2.',
        },
        excused_counts_as_absent: {
          label: 'احتساب المعذور غيابًا',
          hint: 'إن فُعِّل دخل المعذور في نسبة الحضور غائبًا، وإلا استُثني منها.',
        },
        default_reminder_time: {
          label: 'وقت التذكير الافتراضي',
          hint: 'وقت التذكير اليومي لكل حساب جديد، ويغيّره الطالب من إعداداته.',
        },
      },
      save: 'حفظ',
      saving: 'جارٍ الحفظ…',
      saved: 'حُفظت الإعدادات.',
    },
    fieldErrors: {
      streak_threshold_pct: 'أدخل عددًا صحيحًا من 50 إلى 100.',
      backfill_days: 'أدخل عددًا صحيحًا من 0 إلى 14.',
      weekly_grace_days: 'أدخل عددًا صحيحًا من 0 إلى 7.',
      hijri_adjustment_days: 'أدخل عددًا صحيحًا من −2 إلى 2.',
      excused_counts_as_absent: 'اختر تشغيل الإعداد أو إيقافه.',
      default_reminder_time: 'اختر وقتًا صحيحًا.',
    },
    groups: {
      title: 'المجموعات',
      subtitle: 'المنطقة الزمنية تحدّد «اليوم» لطلاب المجموعة، وبداية الأسبوع تحدّد أسبوعهم ومراجعتهم.',
      newGroup: 'مجموعة جديدة',
      /** Accessible name of the table. */
      tableLabel: 'المجموعات',
      columns: {
        name: 'الاسم',
        timezone: 'المنطقة الزمنية',
        weekStart: 'بداية الأسبوع',
        supervisors: 'المشرفون',
        members: 'الأعضاء',
        actions: 'الإجراءات',
      },
      noSupervisors: 'بلا مشرف',
      /** The row's «تعديل» button, named with its group. */
      edit: (name: string) => `تعديل «${name}»`,
      editText: 'تعديل',
      empty: { title: 'لا مجموعات بعد', body: 'أنشئ مجموعة لتدعو إليها الطلاب وتعيّن مشرفيها.' },
    },
    groupForm: {
      title: 'مجموعة جديدة',
      editTitle: 'تعديل المجموعة',
      subtitle: 'تغيير المنطقة أو بداية الأسبوع يغيّر «اليوم» والأسبوع لكل طلاب المجموعة.',
      name: 'اسم المجموعة',
      timezone: 'المنطقة الزمنية',
      timezoneSearch: 'ابحث في المناطق الزمنية',
      timezoneHint: 'مناطق المنطقة العربية أولًا، ثم البقية أبجديًا.',
      weekStart: 'بداية الأسبوع',
      supervisors: 'المشرفون',
      supervisorsHint: 'يرى المشرف طلاب المجموعة ويسجّل حضورهم.',
      noCandidates: 'لا مشرفين مفعَّلين بعد.',
      cancel: 'إلغاء',
      submit: 'إضافة المجموعة',
      save: 'حفظ',
      submitting: 'جارٍ الحفظ…',
    },
    groupFieldErrors: {
      name: 'اكتب اسم المجموعة.',
      name_taken: 'هذا الاسم لمجموعة أخرى؛ اختر اسمًا غيره.',
      timezone: 'اختر منطقة زمنية من القائمة.',
      week_starts_on: 'اختر يوم بداية الأسبوع.',
      supervisor_ids: 'أحد المشرفين المختارين لم يعد متاحًا. أعد تحميل الصفحة.',
    },
    loadFailed: 'تعذّر تحميل الإعدادات. تحقّق من الاتصال وأعد تحميل الصفحة.',
    /** Display text for each code a settings Server Action returns. */
    errors: {
      app: {
        FORBIDDEN: 'لا تملك صلاحية تعديل الإعدادات.',
        INVALID_INPUT: 'بعض القيم خارج مداها؛ صحّحها ثم احفظ.',
        INVALID_ITEM: 'رُفضت إحدى القيم. أعد تحميل الصفحة وحاول مرة أخرى.',
        SAVE_FAILED: 'تعذّر الحفظ. تحقّق من الاتصال وحاول مرة أخرى.',
      },
      group: {
        FORBIDDEN: 'لا تملك صلاحية تعديل المجموعات.',
        INVALID_INPUT: 'صحّح الحقول المعلَّمة ثم احفظ.',
        INVALID_ITEM:
          'تعذّر حفظ المجموعة: قد يكون الاسم لمجموعة أخرى، أو المنطقة الزمنية غير مدعومة، أو أحد المشرفين غير مفعَّل.',
        SAVE_FAILED: 'تعذّر الحفظ. تحقّق من الاتصال وحاول مرة أخرى.',
      },
    },
  },
  /** The public pages' shell (app/(public)): the privacy policy (F-80). */
  publicPage: {
    /** The programme under the app name in the header. */
    program: 'مفاتيح العلوم',
    backToLogin: 'الدخول إلى لوحة الإشراف',
    privacyTitle: 'سياسة الخصوصية — أوراد',
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
