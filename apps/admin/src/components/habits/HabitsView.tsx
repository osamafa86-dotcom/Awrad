'use client';

import { useState } from 'react';

import { Tabs, TabsContent, TabsCount, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HABIT_FREQUENCIES, isArchived, type HabitFrequency, type HabitView } from '@/lib/habits';
import { ar } from '@/messages/ar';

import { HabitForm } from './HabitForm';
import { HabitTable } from './HabitTable';

const t = ar.habits;

export interface HabitsViewProps {
  habits: HabitView[];
  /** `YYYY-MM-DD` in the admin's zone. */
  today: string;
  hijriAdjustment: number;
  /** The tab to open (the page's `?tab=`), so a reload or a shared link keeps it. */
  initialTab: HabitFrequency;
}

/** a06 — F-63: «العادات» with «عادة جديدة» and a table per frequency (اليومية · الأسبوعية) as tabs. */
export function HabitsView({ habits, today, hijriAdjustment, initialTab }: HabitsViewProps) {
  const [tab, setTabState] = useState<HabitFrequency>(initialTab);
  function setTab(next: HabitFrequency) {
    setTabState(next);
    // Keep `?tab=` in the address without a server round trip.
    const url = new URL(window.location.href);
    url.searchParams.set('tab', next);
    window.history.replaceState(window.history.state, '', url);
  }
  const of = (frequency: HabitFrequency) => habits.filter((habit) => habit.frequency === frequency);

  return (
    <div className="flex flex-col gap-24">
      <div className="flex flex-wrap items-start justify-between gap-16">
        <div className="flex flex-col gap-8">
          <h1 className="t-display-title text-fg-primary">{t.title}</h1>
          <p className="t-body-md text-fg-secondary">{t.subtitle}</p>
        </div>
        <HabitForm mode="create" today={today} defaultFrequency={tab} onCreated={setTab} />
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as HabitFrequency)} className="flex flex-col gap-24">
        <TabsList aria-label={t.title}>
          {HABIT_FREQUENCIES.map((frequency) => (
            <TabsTrigger key={frequency} value={frequency}>
              {t.tabs[frequency]}
              <TabsCount>{of(frequency).filter((habit) => !isArchived(habit)).length}</TabsCount>
            </TabsTrigger>
          ))}
        </TabsList>
        {HABIT_FREQUENCIES.map((frequency) => (
          <TabsContent key={frequency} value={frequency} className="outline-none">
            <HabitTable frequency={frequency} habits={of(frequency)} today={today} hijriAdjustment={hijriAdjustment} />
          </TabsContent>
        ))}
      </Tabs>

      <p className="t-body-sm text-fg-secondary">{t.deleteNote}</p>
    </div>
  );
}
