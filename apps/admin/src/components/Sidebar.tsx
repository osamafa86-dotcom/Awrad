'use client';

import { LogOut } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { isCurrent, sectionsFor } from '@/lib/nav';
import { cn } from '@/lib/utils';
import { ar } from '@/messages/ar';

import { RubMark } from './RubMark';

export interface SidebarProps {
  role: 'admin' | 'supervisor';
  fullName: string;
  /** Server Action that ends the session. */
  signOut: () => Promise<void>;
  /** Called when a section link is followed (the phone drawer closes itself). */
  onNavigate?: () => void;
}

/** DESIGN.md §6 `Sidebar`: brand, the sections the role may open, the user and sign-out (a01). */
export function Sidebar({ role, fullName, signOut, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  return (
    <aside className="flex h-full flex-col gap-24 bg-brand px-16 py-24 text-on-brand">
      <div className="flex items-center gap-12 px-8">
        <RubMark size={32} />
        <div className="flex flex-col">
          <span className="t-display-section">{ar.app.name}</span>
          <span className="t-caption">{ar.app.tagline}</span>
        </div>
      </div>

      <nav aria-label={ar.nav.label} className="flex-1">
        <ul className="flex flex-col gap-4">
          {sectionsFor(role).map(({ href, label, icon: Icon }) => {
            const current = isCurrent(href, pathname);
            return (
              <li key={href}>
                <Link
                  href={href}
                  onClick={onNavigate}
                  aria-current={current ? 'page' : undefined}
                  className={cn(
                    'flex min-h-44 items-center gap-12 rounded-md px-12 t-label-md outline-none',
                    'hover:bg-brand-raised focus-visible:ring-2 focus-visible:ring-on-brand',
                    current && 'bg-brand-active',
                  )}
                >
                  <Icon aria-hidden="true" className="size-20 shrink-0" />
                  <span>{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex flex-col gap-8 border-t border-brand-active px-8 pt-16">
        <span className="t-body-strong">{fullName}</span>
        <form action={signOut}>
          <button
            type="submit"
            className={cn(
              'flex min-h-44 w-full items-center gap-8 rounded-md px-4 t-label-sm outline-none',
              'hover:bg-brand-raised focus-visible:ring-2 focus-visible:ring-on-brand',
            )}
          >
            <LogOut aria-hidden="true" className="size-20 shrink-0 rtl:-scale-x-100" />
            <span>{ar.auth.signOut}</span>
          </button>
        </form>
      </div>
    </aside>
  );
}
