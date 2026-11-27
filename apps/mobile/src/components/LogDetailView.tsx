import { addDays, isWithinBackfill, isWithinWeeklyGrace, toHijri, todayIn, weekStartFor } from '@awrad/domain';
import { Stack } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSettings } from '../hooks/useSettings';
import { formatDayMonth } from '../lib/format';
import { useTheme } from '../lib/theme';
import { ar } from '../messages/ar';
import { TodayView } from './TodayView';
import { WeeklyView } from './WeeklyView';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(date: string): boolean {
  if (!DATE_RE.test(date)) return false;
  const [y, m, d] = date.split('-').map(Number);
  const probe = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1));
  return probe.toISOString().slice(0, 10) === date;
}

/**
 * A past day or week opened from the history list (F-40; DESIGN.md m23, m14): the Today / Weekly view
 * on a fixed date, editable only inside the BR-05 backfill window / BR-06 grace, else read-only.
 */
export function LogDetailView({ period, date }: { period: string; date: string }) {
  const settings = useSettings();
  const { colors, space, type } = useTheme();

  const shapeValid = (period === 'daily' || period === 'weekly') && isRealDate(date);
  const today = settings.loading ? null : todayIn(settings.timezone);
  // Deep links: no future dates, and a weekly log is addressed by its week start.
  const valid =
    shapeValid &&
    (today === null ||
      (date <= today && (period === 'daily' || date === weekStartFor(date, settings.weekStartsOn))));

  const title = !valid
    ? ar.history.detailTitle
    : period === 'daily'
      ? toHijri(date, settings.hijriAdjustment).formatted
      : ar.weekly.title(formatDayMonth(date), formatDayMonth(addDays(date, 6)));

  const header = (
    <Stack.Screen options={{ title, headerShown: true, headerBackTitle: ar.history.back }} />
  );

  if (!valid) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgCanvas }}>
        {header}
        <View style={{ padding: space.s24, alignItems: 'center' }}>
          <Text style={[type.bodyMd, { color: colors.textSecondary, textAlign: 'center' }]}>
            {ar.history.invalidLog}
          </Text>
        </View>
      </SafeAreaView>
    );
  }
  if (today === null) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgCanvas }}>
        {header}
        <View style={{ alignItems: 'center', gap: space.s12, paddingVertical: space.s48 }}>
          <ActivityIndicator color={colors.actionPrimary} />
          <Text style={[type.bodyMd, { color: colors.textSecondary }]}>{ar.history.loading}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (period === 'daily') {
    const editable = isWithinBackfill(date, today, settings.backfillDays);
    return (
      <>
        {header}
        <TodayView initialDate={date} readOnly={!editable} lockDate />
      </>
    );
  }
  const editable = isWithinWeeklyGrace(addDays(date, 6), today, settings.weeklyGraceDays);
  return (
    <>
      {header}
      <WeeklyView weekStart={date} readOnly={!editable} />
    </>
  );
}
