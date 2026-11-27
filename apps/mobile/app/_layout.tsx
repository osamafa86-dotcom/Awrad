import '../global.css';

import { useFonts } from 'expo-font';
import { Stack, ThemeProvider, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';

import { SessionProvider } from '../src/hooks/SessionProvider';
import { fontMap } from '../src/lib/fonts';
import { handleColdStartNotification, setupNotificationResponseHandler } from '../src/lib/notifications';
import { ensureRTL } from '../src/lib/rtl';
import { toNavigationTheme, useTheme } from '../src/lib/theme';
import { ar } from '../src/messages/ar';

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
  const router = useRouter();
  const navigationTheme = useMemo(() => toNavigationTheme(theme), [theme]);
  const ready = loaded || error !== null;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  // Reminder taps open Today; installs once (the helper ignores repeats and web).
  useEffect(() => {
    setupNotificationResponseHandler(router);
    void handleColdStartNotification(router);
  }, [router]);

  // A font error falls back to the system font rather than blocking the app.
  if (!ready) return null;

  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      {/* One auth subscription; (tabs) is guarded by SessionGate, (auth) by AuthRouteGuard. */}
      <SessionProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="(auth)" />
          {/* A past day/week from the history list (F-40); the screen sets its own title. */}
          <Stack.Screen
            name="log/[period]/[date]"
            options={{ presentation: 'card', headerShown: true, headerBackTitle: ar.history.back }}
          />
        </Stack>
      </SessionProvider>
    </ThemeProvider>
  );
}
