import { Stack } from 'expo-router';

import { AuthRouteGuard } from '../../src/components/SessionGate';
import { useAppSession } from '../../src/hooks/SessionProvider';

export default function AuthLayout() {
  const { session, profile, loading } = useAppSession();
  return (
    <AuthRouteGuard session={session} profile={profile} loading={loading}>
      <Stack screenOptions={{ headerShown: false }} />
    </AuthRouteGuard>
  );
}
