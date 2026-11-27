'use client';

import { Menu, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ar } from '@/messages/ar';

import { Sidebar, type SidebarProps } from './Sidebar';

export interface DashShellProps extends Omit<SidebarProps, 'onNavigate'> {
  children: ReactNode;
}

/**
 * Dashboard frame (a01 / a20): from 1024px the sidebar is a fixed column on the right (first in DOM
 * order under RTL); below that a header button opens it as a drawer from the left edge.
 */
export function DashShell({ children, ...sidebar }: DashShellProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-dvh">
      <div className="sticky top-0 hidden h-dvh w-272 shrink-0 lg:block">
        <Sidebar {...sidebar} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-8 border-b border-line-subtle bg-surface px-8 py-4 lg:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              aria-label={ar.nav.openMenu}
              className="flex size-44 items-center justify-center rounded-md text-fg-primary outline-none hover:bg-sunken focus-visible:ring-2 focus-visible:ring-line-focus"
            >
              <Menu aria-hidden="true" className="size-24" />
            </SheetTrigger>
            {/* why: `side` is the drawer's physical edge (a Radix/Sheet prop, not a CSS property): the
                sidebar sits on the right under RTL, so its drawer opens from the left (DESIGN.md §7 rule 3). */}
            <SheetContent side="left" aria-describedby={undefined}>
              <SheetTitle className="sr-only">{ar.nav.label}</SheetTitle>
              <Sidebar {...sidebar} onNavigate={() => setOpen(false)} />
              <SheetClose
                aria-label={ar.nav.closeMenu}
                className="absolute top-12 end-12 flex size-44 items-center justify-center rounded-md text-on-brand outline-none hover:bg-brand-raised focus-visible:ring-2 focus-visible:ring-on-brand"
              >
                <X aria-hidden="true" className="size-24" />
              </SheetClose>
            </SheetContent>
          </Sheet>
          <span className="t-display-section text-fg-primary">{ar.app.name}</span>
        </header>

        <main className="flex-1 px-16 py-24 lg:px-32 lg:py-32">{children}</main>
      </div>
    </div>
  );
}
