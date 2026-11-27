import AsyncStorage from '@react-native-async-storage/async-storage';

import { clearDrafts, draftKey, isNewerDraft } from '../src/lib/drafts';

// Final review mobile I3: drafts were keyed by date alone and survived sign-out, so the next student on a shared phone
// inherited the previous one's unsaved statuses, note and support request. They are keyed by user now and leave with
// the user; drafts from before the change (no user in the key) cannot be attributed and are dropped.

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('draftKey', () => {
  test('carries the user, the period and the date', () => {
    expect(draftKey('u-1', 'daily', '2026-11-26')).toBe('draft:u-1:daily:2026-11-26');
    expect(draftKey('u-1', 'weekly', '2026-11-22')).toBe('draft:u-1:weekly:2026-11-22');
  });
});

describe('clearDrafts', () => {
  test("removes the user's drafts and the old unkeyed ones, and nothing else", async () => {
    await AsyncStorage.multiSet([
      ['draft:u-1:daily:2026-11-26', '{}'],
      ['draft:u-1:weekly:2026-11-22', '{}'],
      ['draft:u-2:daily:2026-11-26', '{}'],
      ['draft:daily:2026-11-25', '{}'],
      ['draft:weekly:2026-11-15', '{}'],
      ['awrad.lastHandledNotification', 'n-1'],
    ]);
    await clearDrafts('u-1');
    expect((await AsyncStorage.getAllKeys()).slice().sort()).toEqual([
      'awrad.lastHandledNotification',
      'draft:u-2:daily:2026-11-26',
    ]);
  });

  test('without a user it still drops the unattributable old drafts', async () => {
    await AsyncStorage.multiSet([
      ['draft:daily:2026-11-25', '{}'],
      ['draft:u-2:daily:2026-11-26', '{}'],
    ]);
    await clearDrafts(null);
    expect(await AsyncStorage.getAllKeys()).toEqual(['draft:u-2:daily:2026-11-26']);
  });
});

describe('isNewerDraft (mobile I4)', () => {
  test('a draft edited after the server log was saved is newer', () => {
    expect(isNewerDraft('2026-11-26T08:00:00Z', '2026-11-26T07:59:59Z')).toBe(true);
    expect(isNewerDraft('2026-11-26T07:00:00Z', '2026-11-26T07:59:59Z')).toBe(false);
  });

  test('a draft without a time (or a log without one) never beats the log', () => {
    expect(isNewerDraft(undefined, '2026-11-26T07:59:59Z')).toBe(false);
    expect(isNewerDraft('2026-11-26T08:00:00Z', null)).toBe(false);
    expect(isNewerDraft('nonsense', '2026-11-26T07:59:59Z')).toBe(false);
  });
});
