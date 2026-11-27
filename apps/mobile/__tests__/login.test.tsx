import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import Login from '../app/(auth)/login';
import { ar } from '../src/messages/ar';

const mockSignInWithOtp = jest.fn();
jest.mock('../src/lib/supabase', () => ({
  supabase: { auth: { signInWithOtp: (...a: unknown[]) => mockSignInWithOtp(...a) } },
}));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: (...a: unknown[]) => mockPush(...a), replace: jest.fn() },
}));

async function submit(email: string) {
  await render(<Login />);
  await fireEvent.changeText(screen.getByLabelText(ar.auth.emailLabel), email);
  await fireEvent.press(screen.getByRole('button', { name: ar.auth.sendCode }));
}

describe('login screen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows the app name with the system name under it (LOGIN-1, spec §11.1 m01)', async () => {
    await render(<Login />);
    expect(screen.getByText(ar.app.name)).toBeTruthy();
    expect(screen.getByText(ar.app.tagline)).toBeTruthy();
  });

  it('requests an OTP without creating users, then opens the verify screen with the email', async () => {
    mockSignInWithOtp.mockResolvedValue({ data: {}, error: null });
    await submit('student@example.com');
    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    expect(mockSignInWithOtp).toHaveBeenCalledWith({
      email: 'student@example.com',
      options: { shouldCreateUser: false },
    });
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(auth)/verify',
      params: { email: 'student@example.com' },
    });
  });

  it('trims and lower-cases the email', async () => {
    mockSignInWithOtp.mockResolvedValue({ data: {}, error: null });
    await submit('  Student@Example.COM ');
    await waitFor(() => expect(mockSignInWithOtp).toHaveBeenCalled());
    expect(mockSignInWithOtp.mock.calls[0]![0].email).toBe('student@example.com');
  });

  it('shows the unknown-email message for otp_disabled', async () => {
    mockSignInWithOtp.mockResolvedValue({
      data: {},
      error: { code: 'otp_disabled', message: 'Signups not allowed for otp' },
    });
    await submit('nobody@example.com');
    expect(await screen.findByText(ar.auth.unknownEmail)).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows the unknown-email message when only the message says signups are not allowed', async () => {
    mockSignInWithOtp.mockResolvedValue({ data: {}, error: { message: 'Signups not allowed for this instance' } });
    await submit('nobody@example.com');
    expect(await screen.findByText(ar.auth.unknownEmail)).toBeTruthy();
  });

  it('shows a generic failure for other errors, including thrown network errors', async () => {
    mockSignInWithOtp.mockResolvedValueOnce({ data: {}, error: { code: 'over_email_send_rate_limit', message: 'x' } });
    await submit('student@example.com');
    expect(await screen.findByText(ar.auth.sendFailed)).toBeTruthy();
    expect(screen.queryByText(ar.auth.unknownEmail)).toBeNull();

    mockSignInWithOtp.mockRejectedValueOnce(new Error('network'));
    await fireEvent.press(screen.getByRole('button', { name: ar.auth.sendCode }));
    await waitFor(() => expect(mockSignInWithOtp).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(ar.auth.sendFailed)).toBeTruthy();
  });

  it('rejects an obviously invalid email without calling the server', async () => {
    await render(<Login />);
    await fireEvent.changeText(screen.getByLabelText(ar.auth.emailLabel), 'not-an-email');
    await fireEvent.press(screen.getByRole('button', { name: ar.auth.sendCode }));
    expect(screen.getByText(ar.auth.invalidEmail)).toBeTruthy();
    expect(mockSignInWithOtp).not.toHaveBeenCalled();
  });

  it('shows the contact-the-supervisor footer', async () => {
    await render(<Login />);
    expect(screen.getByText(ar.auth.notRegistered)).toBeTruthy();
  });
});
