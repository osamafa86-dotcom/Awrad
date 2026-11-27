import { describe, expect, it } from 'vitest';

import { parseInviteForm, parseStudentUpdate } from '@/lib/students';

const GROUP = '22222222-2222-4222-8222-222222222222';
const TODAY = '2026-11-26';

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

describe('parseInviteForm', () => {
  it('normalises the email, fixes the role to student and keeps the chosen values', () => {
    const result = parseInviteForm(
      form({ email: ' New@Example.COM ', full_name: ' طالب جديد ', group_id: GROUP, joined_at: '2026-11-01', is_tracked: 'false' }),
      TODAY,
    );
    expect(result).toEqual({
      ok: true,
      value: {
        email: 'new@example.com',
        full_name: 'طالب جديد',
        role: 'student',
        group_id: GROUP,
        joined_at: '2026-11-01',
        is_tracked: false,
      },
    });
  });

  it('defaults joined_at to today and is_tracked to true', () => {
    const result = parseInviteForm(form({ email: 'a@b.co', full_name: 'أحمد', group_id: GROUP, joined_at: '' }), TODAY);
    expect(result.ok && result.value).toMatchObject({ joined_at: TODAY, is_tracked: true, role: 'student' });
  });

  it('ignores a role sent with the form: this form only invites students', () => {
    const result = parseInviteForm(form({ email: 'a@b.co', full_name: 'أحمد', group_id: GROUP, role: 'admin' }), TODAY);
    expect(result.ok && result.value.role).toBe('student');
  });

  it('names every invalid field', () => {
    const result = parseInviteForm(
      form({ email: 'nope', full_name: '  ', group_id: 'g1', joined_at: '2026-02-30' }),
      TODAY,
    );
    expect(result).toEqual({ ok: false, fields: ['email', 'full_name', 'group_id', 'joined_at'] });
  });

  it('rejects a joined_at after today', () => {
    const result = parseInviteForm(
      form({ email: 'a@b.co', full_name: 'أحمد', group_id: GROUP, joined_at: '2026-11-27' }),
      TODAY,
    );
    expect(result).toEqual({ ok: false, fields: ['joined_at'] });
  });
});

describe('parseStudentUpdate', () => {
  it('accepts the editable profile fields', () => {
    const value = { full_name: ' خالد ', group_id: GROUP, is_active: false, is_tracked: true, joined_at: '2026-10-01' };
    expect(parseStudentUpdate(value)).toEqual({ ok: true, value: { ...value, full_name: 'خالد' } });
  });

  it('allows no group and rejects a bad one', () => {
    const base = { full_name: 'خالد', is_active: true, is_tracked: true, joined_at: '2026-10-01' };
    expect(parseStudentUpdate({ ...base, group_id: null }).ok).toBe(true);
    expect(parseStudentUpdate({ ...base, group_id: 'x' })).toEqual({ ok: false, fields: ['group_id'] });
  });
});
