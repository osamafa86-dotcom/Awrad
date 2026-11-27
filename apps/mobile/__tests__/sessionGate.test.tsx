import type { Session } from '@supabase/supabase-js';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { Slot } from 'expo-router';
import { Linking, Text } from 'react-native';

import { AuthRouteGuard, SessionGate, type GateProfile } from '../src/components/SessionGate';
import { ar } from '../src/messages/ar';

const session = { user: { id: 'u1' } } as unknown as Session;
const profile = (over: Partial<GateProfile> = {}): GateProfile => ({ is_active: true, is_tracked: true, ...over });

type GateProps = Omit<React.ComponentProps<typeof SessionGate>, 'children'>;

async function renderGate(props: GateProps, initialUrl = '/today') {
  const onSignOut = jest.fn();
  const Gate = () => (
    <SessionGate onSignOut={onSignOut} {...props}>
      <Slot />
    </SessionGate>
  );
  const AuthGuard = () => (
    <AuthRouteGuard {...props}>
      <Slot />
    </AuthRouteGuard>
  );
  await renderRouter(
    {
      _layout: () => <Slot />,
      '(auth)/_layout': AuthGuard,
      '(auth)/login': () => <Text>LOGIN-SCREEN</Text>,
      '(tabs)/_layout': Gate,
      '(tabs)/today': () => <Text>TODAY-SCREEN</Text>,
    },
    { initialUrl },
  );
  return { onSignOut };
}

describe('SessionGate', () => {
  const savedUrl = process.env.EXPO_PUBLIC_ADMIN_URL;
  beforeEach(() => {
    process.env.EXPO_PUBLIC_ADMIN_URL = 'http://127.0.0.1:3000';
    jest.clearAllMocks();
    // expo-linking's openURL delegates to React Native's Linking.
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  });
  afterAll(() => {
    if (savedUrl === undefined) delete process.env.EXPO_PUBLIC_ADMIN_URL;
    else process.env.EXPO_PUBLIC_ADMIN_URL = savedUrl;
  });

  it('shows a loading indicator and no routes while the session is loading', async () => {
    await renderGate({ session: null, profile: null, loading: true });
    expect(screen.getByRole('progressbar')).toBeTruthy();
    expect(screen.queryByText('TODAY-SCREEN')).toBeNull();
    expect(screen.queryByText('LOGIN-SCREEN')).toBeNull();
  });

  it('never shows the tabs between sign-in and the profile arriving', async () => {
    await renderGate({ session, profile: null, loading: false });
    expect(screen.getByRole('progressbar')).toBeTruthy();
    expect(screen.queryByText('TODAY-SCREEN')).toBeNull();
  });

  it('keeps a signed-out visitor on the login screen instead of looping', async () => {
    await renderGate({ session: null, profile: null, loading: false }, '/login');
    expect(await screen.findByText('LOGIN-SCREEN')).toBeTruthy();
  });

  it('sends a signed-in visitor away from the login screen to the app', async () => {
    await renderGate({ session, profile: profile(), loading: false }, '/login');
    expect(await screen.findByText('TODAY-SCREEN')).toBeTruthy();
    expect(screen.queryByText('LOGIN-SCREEN')).toBeNull();
  });

  it('redirects to the login screen when there is no session', async () => {
    await renderGate({ session: null, profile: null, loading: false });
    expect(await screen.findByText('LOGIN-SCREEN')).toBeTruthy();
  });

  it('shows the inactive-account screen with a sign-out button', async () => {
    const { onSignOut } = await renderGate({ session, profile: profile({ is_active: false }), loading: false });
    expect(await screen.findByText(ar.auth.inactiveTitle)).toBeTruthy();
    expect(screen.queryByText('TODAY-SCREEN')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: ar.auth.signOut }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('shows the staff-on-web screen with the dashboard link for untracked accounts', async () => {
    const { onSignOut } = await renderGate({ session, profile: profile({ is_tracked: false }), loading: false });
    expect(await screen.findByText(ar.auth.staffTitle)).toBeTruthy();
    expect(screen.queryByText('TODAY-SCREEN')).toBeNull();
    await fireEvent.press(screen.getByRole('link', { name: ar.auth.openDashboard }));
    expect(Linking.openURL).toHaveBeenCalledWith('http://127.0.0.1:3000');
    await fireEvent.press(screen.getByRole('button', { name: ar.auth.signOut }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('inactive wins over untracked', async () => {
    await renderGate({ session, profile: profile({ is_active: false, is_tracked: false }), loading: false });
    expect(await screen.findByText(ar.auth.inactiveTitle)).toBeTruthy();
  });

  it('renders the routes for a tracked, active profile', async () => {
    await renderGate({ session, profile: profile(), loading: false });
    expect(await screen.findByText('TODAY-SCREEN')).toBeTruthy();
  });

  it('offers retry and sign-out when the profile could not be loaded', async () => {
    const onRetry = jest.fn();
    const { onSignOut } = await renderGate({ session, profile: null, loading: false, error: new Error('x'), onRetry });
    expect(await screen.findByText(ar.auth.profileLoadFailed)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: ar.auth.retry }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: ar.auth.signOut }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });
});
