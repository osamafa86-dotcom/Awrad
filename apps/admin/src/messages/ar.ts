// كل نصوص واجهة لوحة الشيخ والمشرف. لا نصّ عربيّ داخل المكوّنات.
// نصوص الدخول منقولة حرفيًا من تطبيق الطالب (apps/mobile/src/messages/ar.ts) ليتطابق التطبيقان.

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
  unauthorized: {
    /** a30: a student (or an account without a profile) opened the dashboard. */
    staffOnlyTitle: 'هذه اللوحة للمشرفين',
    staffOnlyBody: 'إن كنت طالبًا فسجّل أورادك من تطبيق أوراد على جوالك.',
    /** a30: a deactivated staff or student account. */
    inactiveTitle: 'حسابك غير مفعَّل، تواصل بالمدير',
    inactiveBody: 'لا يمكنك استخدام اللوحة حتى يُفعَّل حسابك.',
  },
} as const;
