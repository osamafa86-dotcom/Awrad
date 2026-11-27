// GUARD-1: who may open which route of the dashboard. Pure so it is unit-tested and shared by proxy.ts.
// RLS remains the security boundary; this only keeps people out of screens that would be empty for them.

export type Role = 'student' | 'supervisor' | 'admin';

export interface AccessProfile {
  role: Role;
  isActive: boolean;
}

export type Access = { kind: 'allow' } | { kind: 'redirect'; to: string };

export interface AccessInput {
  pathname: string;
  signedIn: boolean;
  /** The signed-in user's profile row; null when signed out or when the row is missing. */
  profile: AccessProfile | null;
}

export const LOGIN_PATH = '/login';
export const UNAUTHORIZED_PATH = '/unauthorized';
const AUTH_PATHS = [LOGIN_PATH, '/verify'];
/** Sections a supervisor may not manage (spec §5): habits and system settings. */
const ADMIN_ONLY_SECTIONS = ['/habits', '/settings'];

/** `/habits` matches `/habits` and `/habits/…`, not `/habitsx`. */
function inSection(pathname: string, section: string): boolean {
  return pathname === section || pathname.startsWith(`${section}/`);
}

const allow: Access = { kind: 'allow' };
const redirect = (to: string): Access => ({ kind: 'redirect', to });

export function isStaff(profile: AccessProfile | null): profile is AccessProfile {
  return profile !== null && profile.isActive && profile.role !== 'student';
}

export function resolveAccess({ pathname, signedIn, profile }: AccessInput): Access {
  const onAuthPage = AUTH_PATHS.some((path) => inSection(pathname, path));

  if (!signedIn) {
    return onAuthPage ? allow : redirect(`${LOGIN_PATH}?next=${encodeURIComponent(pathname)}`);
  }

  if (!isStaff(profile)) {
    return pathname === UNAUTHORIZED_PATH ? allow : redirect(UNAUTHORIZED_PATH);
  }

  if (onAuthPage || pathname === UNAUTHORIZED_PATH) return redirect('/');

  if (profile.role === 'supervisor' && ADMIN_ONLY_SECTIONS.some((section) => inSection(pathname, section))) {
    return redirect('/');
  }

  return allow;
}

/**
 * Where to go after signing in: a same-origin dashboard path from `?next=`, else the overview.
 * Rejects absolute and protocol-relative URLs (open redirects) and the sign-in pages themselves.
 */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/';
  const pathname = next.split(/[?#]/)[0] ?? '';
  if (AUTH_PATHS.some((path) => inSection(pathname, path))) return '/';
  return next;
}
