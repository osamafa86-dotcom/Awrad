import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { AuthScreen } from '../../src/components/AuthScreen';
import { Button } from '../../src/components/Button';
import { OtpInput } from '../../src/components/OtpInput';
import { supabase } from '../../src/lib/supabase';
import { useTheme } from '../../src/lib/theme';
import { ar } from '../../src/messages/ar';

const RESEND_SECONDS = 60;

/** GoTrue reports a bad/stale code as otp_expired / invalid_otp-style errors; anything else is a failure. */
export function isInvalidCodeError(error: { code?: string; message?: string }): boolean {
  if (error.code) return /invalid|expired/i.test(error.code);
  return /invalid|expired/i.test(error.message ?? '');
}

export default function Verify() {
  const { colors, type } = useTheme();
  const params = useLocalSearchParams<{ email?: string | string[] }>();
  const email = (Array.isArray(params.email) ? params.email[0] : params.email) ?? '';

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const [cooldown, setCooldown] = useState(0);
  const verifying = useRef(false);

  // One interval per cooldown (restarted by `cooldown`), so a long timer jump still counts down fully.
  useEffect(() => {
    const timer = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const verify = async (token: string) => {
    if (verifying.current) return;
    verifying.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { error: failure } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
      if (failure) {
        setError(isInvalidCodeError(failure) ? ar.auth.invalidCode : ar.auth.verifyFailed);
        setCode('');
      }
      // On success onAuthStateChange fires and the (auth) layout's AuthRouteGuard moves us into the app.
    } catch {
      setError(ar.auth.verifyFailed);
      setCode('');
    } finally {
      verifying.current = false;
      setBusy(false);
    }
  };

  const resend = async () => {
    if (secondsLeft > 0) return;
    setSecondsLeft(RESEND_SECONDS);
    setCooldown((c) => c + 1);
    setError(null);
    try {
      const { error: failure } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      });
      if (failure) setError(ar.auth.sendFailed);
      else setNotice(ar.auth.resent);
    } catch {
      setError(ar.auth.sendFailed);
    }
  };

  if (!email) return <Redirect href="/(auth)/login" />;

  return (
    <AuthScreen
      title={ar.auth.verifyTitle}
      subtitle={
        <>
          {ar.auth.verifySubtitle}
          {'\n'}
          {/* The address is LTR text inside RTL prose; isolate it so it is not reordered. */}
          {`⁦${email}⁩`}
        </>
      }
    >
      <OtpInput value={code} onChange={setCode} onComplete={(token) => void verify(token)} error={error !== null} disabled={busy} autoFocus />
      {error ? (
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[type.bodySm, { color: colors.statusNotdone }]}>
          {error}
        </Text>
      ) : notice ? (
        <Text accessibilityLiveRegion="polite" style={[type.bodySm, { color: colors.textSecondary }]}>
          {notice}
        </Text>
      ) : null}
      <View style={{ alignItems: 'center' }}>
        <Button
          variant="secondary"
          label={secondsLeft > 0 ? ar.auth.resendIn(secondsLeft) : ar.auth.resend}
          accessibilityLabel={secondsLeft > 0 ? ar.auth.resendIn(secondsLeft) : ar.auth.resend}
          disabled={secondsLeft > 0}
          onPress={() => void resend()}
        />
        <Button variant="quiet" size="md" label={ar.auth.changeEmail} onPress={() => router.replace('/(auth)/login')} />
      </View>
    </AuthScreen>
  );
}
