import { I18nManager, Platform } from 'react-native';

/**
 * The app is Arabic-only and always right-to-left. Call once at module load, before rendering.
 * Native: allow + force RTL (the expo-localization plugin also sets forcesRTL at build time, so the
 * first launch is already RTL). Web: the direction comes from the document's `dir`.
 */
export function ensureRTL(): void {
  if (Platform.OS === 'web') {
    if (typeof document !== 'undefined') {
      document.documentElement.dir = 'rtl';
      document.documentElement.lang = 'ar';
    }
    return;
  }
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);
}
