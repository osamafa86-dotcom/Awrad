import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { Redirect } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useTheme } from '../lib/theme';
import { ar } from '../messages/ar';
import { AuthScreen } from './AuthScreen';
import { Button } from './Button';

/** The profile fields the guard decides on. */
export interface GateProfile {
  is_active: boolean;
  is_tracked: boolean;
}

export interface SessionGateProps {
  session: Session | null;
  profile: GateProfile | null;
  loading: boolean;
  /** Set when the profile row could not be loaded for a signed-in user. */
  error?: unknown;
  onRetry?: () => void;
  onSignOut?: () => void;
  children: ReactNode;
}

export function AccountInactiveScreen({ onSignOut }: { onSignOut: () => void }) {
  return (
    <AuthScreen brand={false} title={ar.auth.inactiveTitle} subtitle={ar.auth.inactiveBody}>
      <Button variant="secondary" label={ar.auth.signOut} onPress={onSignOut} />
    </AuthScreen>
  );
}

export function StaffOnWebScreen({ onSignOut }: { onSignOut: () => void }) {
  // Read literally so Expo inlines it at build time.
  const adminUrl = process.env.EXPO_PUBLIC_ADMIN_URL;
  return (
    <AuthScreen brand={false} title={ar.auth.staffTitle} subtitle={ar.auth.staffBody}>
      {adminUrl ? (
        <Button role="link" label={ar.auth.openDashboard} onPress={() => void Linking.openURL(adminUrl)} />
      ) : null}
      <Button variant="secondary" label={ar.auth.signOut} onPress={onSignOut} />
    </AuthScreen>
  );
}

function ProfileErrorScreen({ onRetry, onSignOut }: { onRetry: () => void; onSignOut: () => void }) {
  return (
    <AuthScreen brand={false} title={ar.auth.profileLoadFailed}>
      <Button label={ar.auth.retry} onPress={onRetry} />
      <Button variant="secondary" label={ar.auth.signOut} onPress={onSignOut} />
    </AuthScreen>
  );
}

export function Splash() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgBrand }}>
      <ActivityIndicator accessible accessibilityRole="progressbar" accessibilityLabel={ar.auth.loading} size="large" color={colors.textOnBrand} />
    </View>
  );
}

const noop = () => {};

/** Wraps the `(auth)` routes: a signed-in visitor has no business on the login screens. */
export function AuthRouteGuard({
  session,
  profile,
  loading,
  children,
}: Pick<SessionGateProps, 'session' | 'profile' | 'loading' | 'children'>) {
  if (loading) return <Splash />;
  if (session && profile) return <Redirect href="/(tabs)/today" />;
  return <>{children}</>;
}

/**
 * Guards the signed-in app (`(tabs)`); mount it inside a navigator so its Redirect can fire.
 * Decides what a signed-in/out visitor may see. Nothing from the app renders until the profile is
 * known: signed in without a profile (and no error) is still "loading", so tabs never flash.
 */
export function SessionGate({ session, profile, loading, error, onRetry, onSignOut, children }: SessionGateProps) {
  const signOut = onSignOut ?? noop;
  if (loading) return <Splash />;
  if (!session) return <Redirect href="/(auth)/login" />;
  if (!profile) {
    return error ? <ProfileErrorScreen onRetry={onRetry ?? noop} onSignOut={signOut} /> : <Splash />;
  }
  if (!profile.is_active) return <AccountInactiveScreen onSignOut={signOut} />;
  if (!profile.is_tracked) return <StaffOnWebScreen onSignOut={signOut} />;
  return <>{children}</>;
}
