import { todayIn } from '@awrad/domain';
import { router } from 'expo-router';
import NotebookPen from 'lucide-react-native/icons/notebook-pen';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { shiftMonth, useCalendar } from '../hooks/useCalendar';
import { useSettings } from '../hooks/useSettings';
import { useSummary, useSummaryRange } from '../hooks/useSummary';
import { useTheme } from '../lib/theme';
import { ar } from '../messages/ar';
import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { HabitBar } from './HabitBar';
import { MonthCalendar } from './MonthCalendar';
import { RangeTabs } from './RangeTabs';
import { StatCard } from './StatCard';

const pct = (n: number | null) => (n === null ? null : ar.summary.pct(Math.round(n)));

function Skeleton({ height }: { height: number }) {
  const { colors, radius } = useTheme();
  return <View style={{ height, borderRadius: radius.xl, backgroundColor: colors.bgSunken }} />;
}

/** ملخّصي (F-30…F-33; DESIGN.md m21, d21). Composition only — data lives in useSummary / useCalendar. */
export function SummaryView() {
  const { colors, radius, space, type } = useTheme();
  const settings = useSettings();
  const { range, loaded, setRange } = useSummaryRange();
  const summary = useSummary(range, loaded);
  const today = settings.loading ? null : todayIn(settings.timezone);
  const currentMonth = today ? today.slice(0, 7) : null;
  const [picked, setPicked] = useState<string | null>(null);
  const month = picked ?? currentMonth;
  const calendar = useCalendar(month ?? '1970-01');
  const [refreshing, setRefreshing] = useState(false);

  const { refetch: refetchSummary } = summary;
  const { refetch: refetchCalendar } = calendar;
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetchSummary(), refetchCalendar()]);
    } finally {
      setRefreshing(false);
    }
  }, [refetchSummary, refetchCalendar]);

  const data = summary.data;
  const empty = data !== null && data.daysLogged === 0 && data.weekly === null;

  const body = (() => {
    if (summary.error) {
      return (
        <View
          accessibilityRole="alert"
          style={{
            gap: space.s12,
            padding: space.s16,
            borderRadius: radius.lg,
            backgroundColor: colors.statusNotdoneTint,
          }}
        >
          <Text style={[type.bodyMd, { color: colors.statusNotdone }]}>{ar.summary.loadFailed}</Text>
          <Button
            label={ar.common.retry}
            variant="secondary"
            size="md"
            fullWidth={false}
            onPress={() => void summary.refetch()}
          />
        </View>
      );
    }
    if (!data) {
      return (
        <View accessibilityLabel={ar.summary.loading} style={{ gap: space.s12 }}>
          <Skeleton height={88} />
          <Skeleton height={88} />
          <Skeleton height={220} />
        </View>
      );
    }
    if (empty) {
      return (
        <EmptyState
          icon={NotebookPen}
          title={ar.summary.empty.title}
          body={ar.summary.empty.body}
          actionLabel={ar.summary.empty.action}
          onAction={() => router.navigate('/(tabs)/today')}
        />
      );
    }
    return (
      <>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s12 }}>
          <StatCard testID="stat-days" label={ar.summary.stats.daysLogged} value={String(data.daysLogged)} />
          <StatCard
            testID="stat-completion"
            label={ar.summary.stats.completion}
            value={pct(data.completionPct)}
            spokenValue={data.completionPct === null ? undefined : `${Math.round(data.completionPct)}%`}
          />
          <StatCard
            testID="stat-attendance"
            label={ar.summary.stats.attendance}
            value={pct(data.attendancePct)}
            spokenValue={data.attendancePct === null ? undefined : `${Math.round(data.attendancePct)}%`}
          />
          <StatCard
            testID="stat-longest-streak"
            kind="streak"
            standing={data.longestStreak > 0}
            label={ar.summary.stats.longestStreak}
            value={String(data.longestStreak)}
          />
          <StatCard
            testID="stat-current-streak"
            kind="streak"
            standing={data.currentStreak > 0}
            label={ar.summary.stats.currentStreak}
            value={String(data.currentStreak)}
          />
        </View>
        {data.perHabit.length > 0 ? (
          <View
            style={{
              gap: space.s16,
              padding: space.s16,
              borderRadius: radius.xl,
              borderWidth: 1,
              borderColor: colors.borderSubtle,
              backgroundColor: colors.bgSurface,
            }}
          >
            <Text accessibilityRole="header" style={[type.titleMd, { color: colors.textPrimary }]}>
              {ar.summary.habitsTitle}
            </Text>
            {data.perHabit.map((h) => (
              <HabitBar key={h.habitId} testID={`habit-bar-${h.slug}`} name={h.name} pct={h.completionPct} />
            ))}
          </View>
        ) : null}
        {data.weekly ? (
          <Text style={[type.bodyMd, { color: colors.textSecondary }]}>
            {ar.summary.weekly(data.weekly.weeksLogged, data.weekly.completionPct)}
          </Text>
        ) : null}
      </>
    );
  })();

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.bgCanvas }}>
      <ScrollView
        contentContainerStyle={{ padding: space.s16, gap: space.s16, paddingBottom: space.s32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
      >
        <RangeTabs value={range} onChange={setRange} />
        {body}
        {!empty && !summary.error && month && currentMonth ? (
          <>
            <MonthCalendar
              month={month}
              days={calendar.days}
              loading={calendar.loading && calendar.days.length === 0}
              weekStartsOn={settings.weekStartsOn}
              hijriAdjustment={settings.hijriAdjustment}
              canNext={month < currentMonth}
              onPrevMonth={() => setPicked(shiftMonth(month, -1))}
              onNextMonth={() => month < currentMonth && setPicked(shiftMonth(month, 1))}
            />
            {calendar.error ? (
              <View style={{ gap: space.s8, alignItems: 'center' }}>
                <Text style={[type.bodyMd, { color: colors.statusNotdone }]}>{ar.summary.calendarFailed}</Text>
                <Button
                  label={ar.common.retry}
                  variant="secondary"
                  size="md"
                  fullWidth={false}
                  onPress={() => void calendar.refetch()}
                />
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

