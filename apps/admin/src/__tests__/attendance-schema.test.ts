import { describe, expect, it } from 'vitest';

import {
  attendanceErrorText,
  buildSections,
  countMarks,
  parseNewSession,
  parseSaveAttendance,
  type Member,
} from '@/lib/attendance';

const G1 = { id: '11111111-1111-4111-8111-111111111111', name: 'المجموعة الأولى' };
const G2 = { id: '22222222-2222-4222-8222-222222222222', name: 'المجموعة الثانية' };
const G3 = { id: '33333333-3333-4333-8333-333333333333', name: 'مجموعة بلا أحد' };
const SESSION = '44444444-4444-4444-8444-444444444444';
const U1 = '55555555-5555-4555-8555-555555555555';
const U2 = '66666666-6666-4666-8666-666666666666';

const members: Member[] = [
  { id: 'a', fullName: 'أحمد', groupId: G1.id },
  { id: 'b', fullName: 'بلال', groupId: G2.id },
  { id: 'c', fullName: 'خالد', groupId: G1.id },
];

describe('parseNewSession (createSession)', () => {
  it('accepts a group session and trims the title', () => {
    expect(parseNewSession({ group_id: G1.id, session_date: '2026-11-27', title: '  درس الفقه ' })).toEqual({
      ok: true,
      value: { group_id: G1.id, session_date: '2026-11-27', title: 'درس الفقه' },
    });
  });

  it('accepts a shared session (group_id null) and stores an empty title as null', () => {
    expect(parseNewSession({ group_id: null, session_date: '2026-11-27', title: '   ' })).toEqual({
      ok: true,
      value: { group_id: null, session_date: '2026-11-27', title: null },
    });
  });

  it('names the invalid fields: no group picked, a malformed date, an overlong title', () => {
    expect(parseNewSession({ group_id: '', session_date: '27/11/2026', title: 'x'.repeat(201) })).toEqual({
      ok: false,
      fields: ['group_id', 'session_date', 'title'],
    });
  });
});

describe('parseSaveAttendance (saveAttendance)', () => {
  it('accepts marked rows', () => {
    const rows = [
      { userId: U1, status: 'present' as const },
      { userId: U2, status: 'excused' as const },
    ];
    expect(parseSaveAttendance(SESSION, rows)).toEqual({ ok: true, value: { sessionId: SESSION, rows } });
  });

  it('refuses no rows, an unknown status, a bad id or a repeated person', () => {
    expect(parseSaveAttendance(SESSION, []).ok).toBe(false);
    // why: the unmarked state is never sent; anything outside the three statuses is invalid input.
    expect(parseSaveAttendance(SESSION, [{ userId: U1, status: 'unmarked' as never }]).ok).toBe(false);
    expect(parseSaveAttendance('nope', [{ userId: U1, status: 'present' }]).ok).toBe(false);
    expect(parseSaveAttendance(SESSION, [{ userId: 'x', status: 'present' }]).ok).toBe(false);
    expect(
      parseSaveAttendance(SESSION, [
        { userId: U1, status: 'present' },
        { userId: U1, status: 'absent' },
      ]).ok,
    ).toBe(false);
  });
});

describe('buildSections', () => {
  it('a group session has the one section of its group, even when the viewer sees more', () => {
    const sections = buildSections(G1.id, [G1, G2], members);
    expect(sections.map((s) => s.group.name)).toEqual([G1.name]);
    expect(sections[0]!.members.map((m) => m.id)).toEqual(['a', 'c']);
  });

  it('a shared session has one section per viewer group with members, in the given order', () => {
    expect(buildSections(null, [G1, G2, G3], members).map((s) => s.group.id)).toEqual([G1.id, G2.id]);
  });

  it('a supervisor sees no section outside their groups, in a shared or a group session', () => {
    expect(buildSections(null, [G2], members).map((s) => s.group.id)).toEqual([G2.id]);
    expect(buildSections(G1.id, [G2], members)).toEqual([]);
  });
});

describe('countMarks', () => {
  it('counts the shown people with a saved mark, by status', () => {
    const sections = buildSections(null, [G1, G2], members);
    const marks = [
      { userId: 'a', status: 'present' as const, recordedAt: '2026-11-27T10:00:00Z' },
      { userId: 'b', status: 'absent' as const, recordedAt: '2026-11-27T11:30:00Z' },
      // Someone no longer shown (left the group) is not counted.
      { userId: 'z', status: 'present' as const, recordedAt: '2026-11-27T12:00:00Z' },
    ];
    expect(countMarks(sections, marks)).toEqual({
      marked: 2,
      total: 3,
      present: 1,
      absent: 1,
      excused: 0,
      lastSavedAt: '2026-11-27T11:30:00Z',
    });
  });

  it('has no last save without marks', () => {
    expect(countMarks(buildSections(G1.id, [G1], members), []).lastSavedAt).toBeNull();
  });
});

describe('attendanceErrorText', () => {
  it('maps every code to a message and success to nothing', () => {
    expect(attendanceErrorText({ ok: false, code: 'FORBIDDEN' })).toBeTruthy();
    expect(attendanceErrorText({ ok: false, code: 'INVALID_ITEM' })).toBeTruthy();
    expect(attendanceErrorText({ ok: true })).toBeNull();
    expect(attendanceErrorText(null)).toBeNull();
  });
});
