import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import Verify from '../app/(auth)/verify';
import { ar } from '../src/messages/ar';

const mockSignInWithOtp = jest.fn();
const mockVerifyOtp = jest.fn();
jest.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOtp: (...a: unknown[]) => mockSignInWithOtp(...a),
      verifyOtp: (...a: unknown[]) => mockVerifyOtp(...a),
    },
  },
}));
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: jest.fn(), replace: (...a: unknown[]) => mockReplace(...a), back: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({ email: 'student@example.com' }),
}));

const otp = () => screen.getByLabelText(ar.auth.otpLabel);
const resendButton = () => screen.getByRole('button', { name: /إعادة الإرسال/ });

describe('verify screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });
  afterEach(() => jest.useRealTimers());

  it('verifies as soon as six digits are entered', async () => {
    mockVerifyOtp.mockResolvedValue({ data: {}, error: null });
    await render(<Verify />);
    await fireEvent.changeText(otp(), '12345');
    expect(mockVerifyOtp).not.toHaveBeenCalled();
    await fireEvent.changeText(otp(), '123456');
    await waitFor(() => expect(mockVerifyOtp).toHaveBeenCalledTimes(1));
    expect(mockVerifyOtp).toHaveBeenCalledWith({ email: 'student@example.com', token: '123456', type: 'email' });
  });

  it('shows the invalid-code message and clears the boxes on a wrong code', async () => {
    mockVerifyOtp.mockResolvedValue({ data: {}, error: { code: 'otp_expired', message: 'Token has expired' } });
    await render(<Verify />);
    await fireEvent.changeText(otp(), '000000');
    expect(await screen.findByText(ar.auth.invalidCode)).toBeTruthy();
    expect(otp().props.value).toBe('');
  });

  it('keeps the resend button disabled for 60 seconds with a countdown, then re-enables it', async () => {
    mockSignInWithOtp.mockResolvedValue({ data: {}, error: null });
    await render(<Verify />);

    expect(resendButton()).toBeDisabled();
    expect(screen.getByText(ar.auth.resendIn(60))).toBeTruthy();
    await act(() => void jest.advanceTimersByTime(1000));
    expect(screen.getByText(ar.auth.resendIn(59))).toBeTruthy();
    await fireEvent.press(resendButton());
    expect(mockSignInWithOtp).not.toHaveBeenCalled();

    await act(() => void jest.advanceTimersByTime(59_000));
    expect(resendButton()).toBeEnabled();
    expect(screen.getByText(ar.auth.resend)).toBeTruthy();

    await fireEvent.press(resendButton());
    await waitFor(() => expect(mockSignInWithOtp).toHaveBeenCalledTimes(1));
    expect(mockSignInWithOtp).toHaveBeenCalledWith({
      email: 'student@example.com',
      options: { shouldCreateUser: false },
    });
    // the cooldown restarts after a resend
    await waitFor(() => expect(resendButton()).toBeDisabled());
    expect(screen.getByText(ar.auth.resendIn(60))).toBeTruthy();
  });

  it('goes back to the login screen from «تغيير البريد»', async () => {
    await render(<Verify />);
    await fireEvent.press(screen.getByRole('button', { name: ar.auth.changeEmail }));
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
  });
});
