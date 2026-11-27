import '../global.css';

import { useFonts } from 'expo-font';
import { Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';

import { fontMap } from '../src/lib/fonts';
import { ensureRTL } from '../src/lib/rtl';
import { toNavigationTheme, useTheme } from '../src/lib/theme';

// RTL before anything renders; keep the splash up until the Arabic fonts are ready.
ensureRTL();
void SplashScreen.preventAutoHideAsync();

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const [loaded, error] = useFonts(fontMap);
  const theme = useTheme();
  const navigationTheme = useMemo(() => toNavigationTheme(theme), [theme]);
  const ready = loaded || error !== null;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  // A font error falls back to the system font rather than blocking the app.
  if (!ready) return null;

  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
    </ThemeProvider>
  );
}
