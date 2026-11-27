import { describe, expect, it } from 'vitest';

import {
  deletionDeadline,
  NOTE_MAX,
  parseHandleSupport,
  parseRequestId,
  supportErrorText,
} from '@/lib/support';

const LOG = '11111111-1111-4111-8111-111111111111';

describe('parseHandleSupport (handleSupportRequest)', () => {
  it('accepts a log id and trims the note', () => {
    expect(parseHandleSupport(LOG, '  تواصلتُ معه ')).toEqual({ ok: true, value: { logId: LOG, note: 'تواصلتُ معه' } });
  });

  it('the note is optional: empty, blank or null all become null', () => {
    for (const note of ['', '   ', null]) {
      expect(parseHandleSupport(LOG, note)).toEqual({ ok: true, value: { logId: LOG, note: null } });
    }
  });

  it('refuses a malformed id and an overlong note', () => {
    expect(parseHandleSupport('not-a-uuid', null)).toEqual({ ok: false });
    expect(parseHandleSupport(LOG, 'x'.repeat(NOTE_MAX + 1))).toEqual({ ok: false });
    expect(parseHandleSupport(LOG, 'x'.repeat(NOTE_MAX)).ok).toBe(true);
  });
});

describe('parseRequestId (dismissDeletionRequest)', () => {
  it('accepts a uuid only', () => {
    expect(parseRequestId(LOG)).toEqual({ ok: true, value: LOG });
    expect(parseRequestId('42')).toEqual({ ok: false });
  });
});

describe('deletionDeadline (spec §13: within 30 days)', () => {
  it('is 30 days after the day of the request in the viewer zone', () => {
    // 22:30 UTC on 1 Nov is already 2 Nov in Riyadh.
    expect(deletionDeadline('2026-11-01T22:30:00Z', 'Asia/Riyadh', '2026-11-27')).toEqual({
      date: '2026-12-02',
      overdue: false,
    });
  });

  it('is overdue only after the deadline day', () => {
    expect(deletionDeadline('2026-10-28T09:00:00Z', 'Asia/Riyadh', '2026-11-27')).toEqual({
      date: '2026-11-27',
      overdue: false,
    });
    expect(deletionDeadline('2026-10-27T09:00:00Z', 'Asia/Riyadh', '2026-11-27')).toEqual({
      date: '2026-11-26',
      overdue: true,
    });
  });
});

describe('supportErrorText', () => {
  it('has a message for every code and nothing for success', () => {
    for (const code of ['FORBIDDEN', 'INVALID_INPUT', 'INVALID_ITEM', 'SAVE_FAILED'] as const) {
      expect(supportErrorText({ ok: false, code })).toEqual(expect.any(String));
    }
    expect(supportErrorText({ ok: true })).toBeNull();
    expect(supportErrorText(null)).toBeNull();
  });
});
