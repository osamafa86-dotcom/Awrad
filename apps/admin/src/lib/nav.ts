import {
  BarChart3,
  CalendarCheck,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';

import { ar } from '@/messages/ar';

import type { Role } from './access';

export interface NavSection {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Sections a supervisor may not open (spec §5); proxy.ts redirects them, the sidebar hides them. */
  adminOnly?: boolean;
}

/** The sidebar sections in spec §11.2 order. */
export const NAV_SECTIONS: readonly NavSection[] = [
  { href: '/', label: ar.nav.overview, icon: LayoutDashboard },
  { href: '/students', label: ar.nav.students, icon: Users },
  { href: '/attendance', label: ar.nav.attendance, icon: CalendarCheck },
  { href: '/support', label: ar.nav.support, icon: LifeBuoy },
  { href: '/habits', label: ar.nav.habits, icon: ListChecks, adminOnly: true },
  { href: '/reports', label: ar.nav.reports, icon: BarChart3 },
  { href: '/settings', label: ar.nav.settings, icon: Settings, adminOnly: true },
];

export function sectionsFor(role: Exclude<Role, 'student'>): NavSection[] {
  return NAV_SECTIONS.filter((section) => role === 'admin' || !section.adminOnly);
}

/** The overview is current only on "/", every other section on itself and its nested routes. */
export function isCurrent(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}
