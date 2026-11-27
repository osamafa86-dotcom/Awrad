import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let pathname = '/';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

import { Sidebar } from '@/components/Sidebar';

const ALL = ['نظرة عامة', 'الطلاب', 'الحضور', 'طلبات الدعم', 'العادات', 'التقارير', 'الإعدادات'];

function renderSidebar(role: 'admin' | 'supervisor') {
  render(<Sidebar role={role} fullName="عبد الله المدير" signOut={vi.fn()} />);
  return within(screen.getByRole('navigation'));
}

describe('Sidebar', () => {
  beforeEach(() => {
    pathname = '/';
  });

  it('shows the seven sections in order to an admin', () => {
    const nav = renderSidebar('admin');
    expect(nav.getAllByRole('link').map((link) => link.textContent)).toEqual(ALL);
  });

  it('hides habits and settings from a supervisor (five sections)', () => {
    const nav = renderSidebar('supervisor');
    const names = nav.getAllByRole('link').map((link) => link.textContent);
    expect(names).toEqual(['نظرة عامة', 'الطلاب', 'الحضور', 'طلبات الدعم', 'التقارير']);
    expect(names).not.toContain('العادات');
    expect(names).not.toContain('الإعدادات');
  });

  it('links every section to its route', () => {
    const nav = renderSidebar('admin');
    expect(nav.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '/',
      '/students',
      '/attendance',
      '/support',
      '/habits',
      '/reports',
      '/settings',
    ]);
  });

  it('marks only the current section with aria-current="page"', () => {
    pathname = '/students';
    const nav = renderSidebar('admin');
    expect(nav.getByRole('link', { name: 'الطلاب' })).toHaveAttribute('aria-current', 'page');
    const current = nav.getAllByRole('link').filter((link) => link.getAttribute('aria-current') === 'page');
    expect(current).toHaveLength(1);
  });

  it('keeps a section current on its nested routes, and the overview only on "/"', () => {
    pathname = '/students/123';
    const nav = renderSidebar('admin');
    expect(nav.getByRole('link', { name: 'الطلاب' })).toHaveAttribute('aria-current', 'page');
    expect(nav.getByRole('link', { name: 'نظرة عامة' })).not.toHaveAttribute('aria-current');
  });

  it('marks the overview on "/"', () => {
    const nav = renderSidebar('supervisor');
    expect(nav.getByRole('link', { name: 'نظرة عامة' })).toHaveAttribute('aria-current', 'page');
  });

  it('shows the user name and a sign-out button', () => {
    renderSidebar('admin');
    expect(screen.getByText('عبد الله المدير')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تسجيل الخروج' })).toBeInTheDocument();
  });
});
