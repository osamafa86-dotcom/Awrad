// PREVIEW-2 (dev-only): each student screen on its own route, without the tab bar, rendered from the
// fake data client. Metro blocks this folder unless EXPO_PUBLIC_PREVIEW=1, so production has none of it.
import { Stack } from 'expo-router';

import { SessionGate } from '../../src/components/SessionGate';
import { useAppSession } from '../../src/hooks/SessionProvider';

export default function PreviewLayout() {
  const { session, profile, loading, error, signOut, refreshProfile } = useAppSession();
  return (
    <SessionGate
      session={session}
      profile={profile}
      loading={loading}
      error={error}
      onRetry={() => void refreshProfile()}
      onSignOut={() => void signOut()}
    >
      <Stack screenOptions={{ headerShown: false }} />
    </SessionGate>
  );
}
