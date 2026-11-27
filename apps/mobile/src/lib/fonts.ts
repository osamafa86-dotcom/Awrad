import { IBMPlexSansArabic_400Regular } from '@expo-google-fonts/ibm-plex-sans-arabic/400Regular';
import { IBMPlexSansArabic_500Medium } from '@expo-google-fonts/ibm-plex-sans-arabic/500Medium';
import { IBMPlexSansArabic_600SemiBold } from '@expo-google-fonts/ibm-plex-sans-arabic/600SemiBold';
import { MarkaziText_600SemiBold } from '@expo-google-fonts/markazi-text/600SemiBold';
import { MarkaziText_700Bold } from '@expo-google-fonts/markazi-text/700Bold';

/** Font files registered with expo-font under the exact family names used by `type` in theme.ts. */
export const fontMap = {
  'IBMPlexSansArabic-Regular': IBMPlexSansArabic_400Regular,
  'IBMPlexSansArabic-Medium': IBMPlexSansArabic_500Medium,
  'IBMPlexSansArabic-SemiBold': IBMPlexSansArabic_600SemiBold,
  'MarkaziText-SemiBold': MarkaziText_600SemiBold,
  'MarkaziText-Bold': MarkaziText_700Bold,
} as const;
