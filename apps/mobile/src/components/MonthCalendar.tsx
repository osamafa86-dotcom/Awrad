import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import { Text, View } from 'react-native';

import type { CalendarDay } from '../hooks/useCalendar';
import type { WeekStart } from '../hooks/useSettings';
import { formatHijriSpan, formatMonthYear } from '../lib/format';
import { useTheme } from '../lib/theme';
import { ar } from '../messages/ar';
import { CalendarCell } from './CalendarCell';
import { NavButton } from './WeekHeader';

export interface MonthCalendarProps {
  /** `YYYY-MM` (Gregorian) */
  month: string;
  /** Every day of the month, in order; empty while loading. */
  days: CalendarDay[];
  weekStartsOn: WeekStart;
  hijriAdjustment: number;
  onPrevMonth(): void;
  onNextMonth(): void;
  /** False on the current month: nothing to show beyond today. */
  canNext: boolean;
  loading?: boolean;
}

function lastDay(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${String(new Date(Date.UTC(y ?? 0, m ?? 1, 0)).getUTCDate()).padStart(2, '0')}`;
}

/** F-31: the Gregorian month with its Hijri month(s) under the title; columns start at `weekStartsOn`. */
export function MonthCalendar({
  month,
  days,
  weekStartsOn,
  hijriAdjustment,
  onPrevMonth,
  onNextMonth,
  canNext,
  loading = false,
}: MonthCalendarProps) {
  const { colors, radius, space, type } = useTheme();

  const [y, m] = month.split('-').map(Number);
  const firstDow = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, 1)).getUTCDay(); // 0 = Sunday
  const lead = (firstDow - weekStartsOn + 7) % 7;
  const cells: Array<CalendarDay | null> = [...Array<null>(lead).fill(null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);
  const rows = Array.from({ length: cells.length / 7 }, (_, r) => cells.slice(r * 7, r * 7 + 7));

  return (
    <View
      style={{
        gap: space.s12,
        padding: space.s16,
        borderRadius: radius.xl,
        borderWidth: 1,
        borderColor: colors.borderSubtle,
        backgroundColor: colors.bgSurface,
      }}
    >
      <View style={{ alignItems: 'center', gap: space.s4 }}>
        <Text
          testID="calendar-title"
          accessibilityRole="header"
          style={[type.titleMd, { color: colors.textPrimary, textAlign: 'center' }]}
        >
          {formatMonthYear(month)}
        </Text>
        <Text testID="calendar-hijri" style={[type.bodySm, { color: colors.textSecondary, textAlign: 'center' }]}>
          {formatHijriSpan(`${month}-01`, lastDay(month), hijriAdjustment)}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s16 }}>
          {/* "previous" first (the start side in RTL) and pointing that way (§7 rule 3). */}
          <NavButton label={ar.summary.prevMonth} icon={ChevronRight} enabled onPress={onPrevMonth} />
          <NavButton label={ar.summary.nextMonth} icon={ChevronLeft} enabled={canNext} onPress={onNextMonth} />
        </View>
      </View>

      <View style={{ flexDirection: 'row' }}>
        {Array.from({ length: 7 }, (_, i) => {
          const dow = (weekStartsOn + i) % 7;
          return (
            <View key={i} style={{ flex: 1, alignItems: 'center' }}>
              <Text
                testID={`weekday-${i}`}
                accessibilityLabel={ar.today.weekdays[dow]}
                style={[type.labelSm, { color: colors.textSecondary }]}
              >
                {ar.summary.weekdayShort[dow]}
              </Text>
            </View>
          );
        })}
      </View>

      {loading ? (
        <View
          testID="calendar-skeleton"
          style={{ height: 6 * 44, borderRadius: radius.lg, backgroundColor: colors.bgSunken }}
        />
      ) : (
        <View style={{ gap: 0 }}>
          {rows.map((row, r) => (
            <View key={r} testID={`grid-row-${r}`} style={{ flexDirection: 'row' }}>
              {row.map((d, c) => (
                <View key={d?.date ?? `blank-${c}`} testID={d ? `grid-cell-${d.date}` : undefined} style={{ flex: 1 }}>
                  {d ? (
                    <CalendarCell
                      day={d.date}
                      state={d.state}
                      isToday={d.isToday}
                      isFuture={d.isFuture}
                      completionPct={d.completionPct}
                    />
                  ) : null}
                </View>
              ))}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
