import { describe, expect, it } from 'vitest';

import { resolveAccess, safeNext, type AccessProfile } from '@/lib/access';

const admin: AccessProfile = { role: 'admin', isActive: true };
const supervisor: AccessProfile = { role: 'supervisor', isActive: true };
const student: AccessProfile = { role: 'student', isActive: true };
const inactiveAdmin: AccessProfile = { role: 'admin', isActive: false };
const inactiveSupervisor: AccessProfile = { role: 'supervisor', isActive: false };

const allow = { kind: 'allow' } as const;
const to = (path: string) => ({ kind: 'redirect', to: path }) as const;

type Row = [string, string, boolean, AccessProfile | null, ReturnType<typeof resolveAccess>];

const rows: Row[] = [
  // Signed out: every dashboard route and /unauthorized go to the login page, remembering where.
  ['signed out on the overview goes to login', '/', false, null, to('/login?next=%2F')],
  ['signed out on a section goes to login with next', '/students', false, null, to('/login?next=%2Fstudents')],
  ['signed out on a nested route keeps the full path', '/students/abc', false, null, to('/login?next=%2Fstudents%2Fabc')],
  ['signed out on /unauthorized goes to login', '/unauthorized', false, null, to('/login?next=%2Funauthorized')],
  ['signed out may open the login page', '/login', false, null, allow],
  ['signed out may open the verify page', '/verify', false, null, allow],

  // Signed in but not allowed into the dashboard.
  ['a student is sent to /unauthorized', '/', true, student, to('/unauthorized')],
  ['a student on a section is sent to /unauthorized', '/attendance', true, student, to('/unauthorized')],
  ['a student on the login page is sent to /unauthorized', '/login', true, student, to('/unauthorized')],
  ['a student may stay on /unauthorized', '/unauthorized', true, student, allow],
  ['an inactive admin is sent to /unauthorized', '/', true, inactiveAdmin, to('/unauthorized')],
  ['an inactive supervisor is sent to /unauthorized', '/students', true, inactiveSupervisor, to('/unauthorized')],
  ['an inactive account may stay on /unauthorized', '/unauthorized', true, inactiveAdmin, allow],
  ['a signed-in user without a profile row is sent to /unauthorized', '/', true, null, to('/unauthorized')],
  ['no profile row may stay on /unauthorized', '/unauthorized', true, null, allow],

  // Supervisors do not manage habits or system settings (spec §5).
  ['a supervisor on /habits goes to the overview', '/habits', true, supervisor, to('/')],
  ['a supervisor on a nested habits route goes to the overview', '/habits/archive', true, supervisor, to('/')],
  ['a supervisor on /settings goes to the overview', '/settings', true, supervisor, to('/')],
  ['a supervisor may open students', '/students', true, supervisor, allow],
  ['a supervisor may open attendance', '/attendance', true, supervisor, allow],
  ['a supervisor may open support requests', '/support', true, supervisor, allow],
  ['a supervisor may open reports', '/reports', true, supervisor, allow],
  ['a supervisor may open the overview', '/', true, supervisor, allow],
  ['a path that only starts with "habits" is not the habits section', '/habitsx', true, supervisor, allow],

  // Staff never see the sign-in pages or the refusal page.
  ['signed-in admin on /login goes to the overview', '/login', true, admin, to('/')],
  ['signed-in supervisor on /verify goes to the overview', '/verify', true, supervisor, to('/')],
  ['signed-in admin on /unauthorized goes to the overview', '/unauthorized', true, admin, to('/')],

  // Admins see everything.
  ['an admin may open /habits', '/habits', true, admin, allow],
  ['an admin may open /settings', '/settings', true, admin, allow],
  ['an admin may open the overview', '/', true, admin, allow],

  // Route handlers answer for themselves with a JSON status (EXP-1), never a redirect to an HTML page.
  ['signed out on an API route is left to the route (401)', '/api/export', false, null, allow],
  ['a student on an API route is left to the route (403)', '/api/export', true, student, allow],
  ['a path that only starts with "api" is a page', '/apix', false, null, to('/login?next=%2Fapix')],
];

describe('resolveAccess (GUARD-1)', () => {
  it.each(rows)('%s', (_name, pathname, signedIn, profile, expected) => {
    expect(resolveAccess({ pathname, signedIn, profile })).toEqual(expected);
  });

  it('keeps the query string in next when sending a signed-out user to login', () => {
    expect(resolveAccess({ pathname: '/students', search: '?group=1&q=a', signedIn: false, profile: null })).toEqual(
      to('/login?next=%2Fstudents%3Fgroup%3D1%26q%3Da'),
    );
  });
});

describe('safeNext', () => {
  it.each([
    ['/students', '/students'],
    ['/students?group=1', '/students?group=1'],
    [null, '/'],
    [undefined, '/'],
    ['', '/'],
    ['https://evil.example', '/'],
    ['//evil.example', '/'],
    ['/\\evil.example', '/'],
    ['/\t/evil.example', '/'],
    ['/\n/evil.example', '/'],
    ['/\r/evil.example', '/'],
    ['/%09/evil.example', '/%09/evil.example'],
    ['/\\/evil.example', '/'],
    ['/students\\..\\..\\/evil.example', '/'],
    ['https:/evil.example', '/'],
    ['/students#row-3', '/students#row-3'],
    ['students', '/'],
    ['/login', '/'],
    ['/verify?email=a@b.c', '/'],
  ])('%s → %s', (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });
});
