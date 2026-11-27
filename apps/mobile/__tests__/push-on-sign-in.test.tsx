import { renderHook, waitFor } from '@testing-library/react-native';

import { usePushOnSignIn, type ReminderProfile } from '../src/hooks/usePushOnSignIn';

// Final review mobile I2: right after sign-in, a student whose reminders are on gets this device registered (the
// permission is asked once, in context; ensurePushOnSignIn holds the rules and is tested in notifications.test.ts).
const mockEnsure = jest.fn(async () => 'granted');
jest.mock('../src/lib/notifications', () => ({
  ensurePushOnSignIn: (...a: unknown[]) => mockEnsure(...(a as [])),
}));

beforeEach(() => mockEnsure.mockClear());

describe('usePushOnSignIn', () => {
  test('a signed-in student with the daily reminder on: registers once', async () => {
    const profile: ReminderProfile = { id: 'u-1', reminder_time: '21:00:00', weekly_reminder: false };
    const { rerender } = await renderHook(({ p }: { p: ReminderProfile }) => usePushOnSignIn(p), {
      initialProps: { p: profile },
    });
    await waitFor(() => expect(mockEnsure).toHaveBeenCalledWith('u-1', true));
    await rerender({ p: { ...profile } });
    expect(mockEnsure).toHaveBeenCalledTimes(1);
  });

  test('only the weekly reminder on still counts', async () => {
    await renderHook(() => usePushOnSignIn({ id: 'u-1', reminder_time: null, weekly_reminder: true }));
    await waitFor(() => expect(mockEnsure).toHaveBeenCalledWith('u-1', true));
  });

  test('both reminders off: told so (nothing is asked)', async () => {
    await renderHook(() => usePushOnSignIn({ id: 'u-1', reminder_time: null, weekly_reminder: false }));
    await waitFor(() => expect(mockEnsure).toHaveBeenCalledWith('u-1', false));
  });

  test('signed out: nothing', async () => {
    await renderHook(() => usePushOnSignIn(null));
    expect(mockEnsure).not.toHaveBeenCalled();
  });

  test('a failure (offline) is swallowed: the app keeps working', async () => {
    mockEnsure.mockRejectedValueOnce(new Error('offline'));
    await renderHook(() => usePushOnSignIn({ id: 'u-1', reminder_time: '21:00:00', weekly_reminder: true }));
    await waitFor(() => expect(mockEnsure).toHaveBeenCalled());
  });
});
