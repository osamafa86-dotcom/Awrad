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
  errors: {
    missingEnv:
      'إعدادات الاتصال ناقصة: عيّن EXPO_PUBLIC_SUPABASE_URL وEXPO_PUBLIC_SUPABASE_ANON_KEY في ملف ‎.env',
  },
} as const;

export const messages = { ar } as const;
export type Messages = typeof ar;
