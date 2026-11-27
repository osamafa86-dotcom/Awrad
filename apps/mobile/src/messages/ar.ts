// كل نصوص واجهة تطبيق الطالب. لا نصّ عربيّ داخل المكوّنات.
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
  errors: {
    missingEnv:
      'إعدادات الاتصال ناقصة: عيّن EXPO_PUBLIC_SUPABASE_URL وEXPO_PUBLIC_SUPABASE_ANON_KEY في ملف ‎.env',
  },
} as const;

export const messages = { ar } as const;
export type Messages = typeof ar;
