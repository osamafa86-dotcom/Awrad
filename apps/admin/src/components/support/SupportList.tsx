'use client';

import { useState } from 'react';

import { Tabs, TabsContent, TabsCount, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { DeletionRequest, SupportRequest, SupportTab } from '@/lib/support';
import { ar } from '@/messages/ar';

import { DeletionCard } from './DeletionCard';
import { SupportCard } from './SupportCard';

const t = ar.support;

export interface SupportListProps {
  /** support_status 'open', newest week first (RLS already scoped them to the viewer). */
  open: SupportRequest[];
  /** Handled in the last 90 days, most recent first. */
  handled: SupportRequest[];
  /** Open deletion requests for an admin; null for a supervisor (no deletion tab). */
  deletions: DeletionRequest[] | null;
  /** `YYYY-MM-DD` in the viewer's zone. */
  today: string;
  timezone: string;
  hijriAdjustment: number;
  /** The tab to open (the page's `?tab=`), so a reload or a shared link keeps it. */
  initialTab?: SupportTab;
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-8 rounded-xl border border-line-subtle bg-surface px-24 py-48 text-center">
      <p className="t-title-md text-fg-primary">{title}</p>
      <p className="t-body-md text-fg-secondary">{body}</p>
    </div>
  );
}

/** a04 — F-64: «المفتوحة» · «المعالَجة» · (admins) «طلبات حذف الحساب», each with its count. */
export function SupportList({
  open,
  handled,
  deletions,
  today,
  timezone,
  hijriAdjustment,
  initialTab = 'open',
}: SupportListProps) {
  const tabs: SupportTab[] = deletions ? ['open', 'handled', 'deletion'] : ['open', 'handled'];
  const [tab, setTabState] = useState<SupportTab>(tabs.includes(initialTab) ? initialTab : 'open');
  function setTab(next: SupportTab) {
    setTabState(next);
    // Keep `?tab=` in the address without a server round trip.
    const url = new URL(window.location.href);
    url.searchParams.set('tab', next);
    window.history.replaceState(window.history.state, '', url);
  }
  const counts: Record<SupportTab, number> = { open: open.length, handled: handled.length, deletion: deletions?.length ?? 0 };

  return (
    <div className="flex flex-col gap-24">
      <div className="flex flex-col gap-8">
        <h1 className="t-display-title text-fg-primary">{t.title}</h1>
        <p className="t-body-md text-fg-secondary">{t.subtitle}</p>
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as SupportTab)} className="flex flex-col gap-24">
        <TabsList aria-label={t.tabsLabel}>
          {tabs.map((value) => (
            <TabsTrigger key={value} value={value}>
              {t.tabs[value]}
              <TabsCount>{t.count(counts[value])}</TabsCount>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="open" className="outline-none">
          {open.length === 0 ? (
            <Empty {...t.empty.open} />
          ) : (
            <div className="flex flex-col gap-16">
              {open.map((request) => (
                <SupportCard key={request.id} request={request} hijriAdjustment={hijriAdjustment} timezone={timezone} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="handled" className="flex flex-col gap-16 outline-none">
          {handled.length === 0 ? (
            <Empty {...t.empty.handled} />
          ) : (
            <>
              <p className="t-body-sm text-fg-secondary">{t.handledWindow}</p>
              {handled.map((request) => (
                <SupportCard key={request.id} request={request} hijriAdjustment={hijriAdjustment} timezone={timezone} />
              ))}
            </>
          )}
        </TabsContent>

        {deletions ? (
          <TabsContent value="deletion" className="outline-none">
            {deletions.length === 0 ? (
              <Empty {...t.empty.deletion} />
            ) : (
              <div className="flex flex-col gap-16">
                {deletions.map((request) => (
                  <DeletionCard
                    key={request.id}
                    request={request}
                    today={today}
                    timezone={timezone}
                    hijriAdjustment={hijriAdjustment}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
