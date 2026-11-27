import type { DayState } from '@awrad/domain';
import { Text, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { formatDayMonth } from '../lib/format';
import { useTheme } from '../lib/theme';
import { ar } from '../messages/ar';

export interface CalendarCellProps {
  /** `YYYY-MM-DD` */
  day: string;
  state: DayState;
  isToday: boolean;
  isFuture: boolean;
  completionPct: number | null;
}

const RING = 40;
const BOX = 32;
const HATCH_STEP = 8;

/**
 * DESIGN.md §6/§7 rule 2: the day states differ by SHAPE, never colour alone —
 * achieved = filled square · failed = outlined square with diagonal hatch · neutral = grey outline ·
 * missing = number with a dot · future = dimmed number. Today = a ring around any of them.
 */
export function CalendarCell({ day, state, isToday, isFuture, completionPct }: CalendarCellProps) {
  const { colors, radius, type } = useTheme();
  const number = Number(day.slice(8, 10));
  const shown: DayState | 'future' = isFuture ? 'future' : state;
  const stateLabel = ar.summary.state[shown];
  const label = ar.summary.cellLabel(formatDayMonth(day), isToday ? ar.summary.todaySuffix(stateLabel) : stateLabel);

  const box = {
    width: BOX,
    height: BOX,
    borderRadius: radius.sm,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };
  const numberText = (color: string) => (
    <Text style={[type.labelMd, { color, textAlign: 'center' }]}>{number}</Text>
  );

  let marker;
  switch (shown) {
    case 'achieved':
      marker = (
        <View testID="cell-achieved" style={[box, { backgroundColor: colors.statusDoneFill }]}>
          {numberText(colors.textOnPrimary)}
        </View>
      );
      break;
    case 'failed':
      marker = (
        <View
          testID="cell-failed-hatch"
          style={[box, { borderWidth: 1, borderColor: colors.statusDoneHatch, overflow: 'hidden' }]}
        >
          <Svg width={BOX} height={BOX} viewBox={`0 0 ${BOX} ${BOX}`} style={{ position: 'absolute' }}>
            {Array.from({ length: Math.ceil((BOX * 2) / HATCH_STEP) }, (_, i) => {
              const o = i * HATCH_STEP;
              return (
                <Line
                  key={o}
                  x1={o}
                  y1={0}
                  x2={o - BOX}
                  y2={BOX}
                  stroke={colors.statusDoneHatch}
                  strokeWidth={1.25}
                />
              );
            })}
          </Svg>
          {numberText(colors.textPrimary)}
        </View>
      );
      break;
    case 'neutral':
      marker = (
        <View testID="cell-neutral" style={[box, { borderWidth: 1.5, borderColor: colors.statusNeutral }]}>
          {numberText(colors.textSecondary)}
        </View>
      );
      break;
    case 'missing':
      marker = (
        <View style={[box, { gap: 2 }]}>
          {numberText(colors.textPrimary)}
          <View
            testID="cell-missing-dot"
            style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.statusMissing }}
          />
        </View>
      );
      break;
    default:
      marker = (
        <View testID="cell-future" style={box}>
          {numberText(colors.textTertiary)}
        </View>
      );
  }

  return (
    <View
      accessible
      accessibilityLabel={label}
      accessibilityValue={completionPct === null ? undefined : { text: `${completionPct}%` }}
      style={{ alignItems: 'center', justifyContent: 'center', height: RING + 4 }}
    >
      <View
        testID={isToday ? 'cell-today' : undefined}
        style={{
          width: RING,
          height: RING,
          borderRadius: radius.md,
          borderWidth: 2,
          borderColor: isToday ? colors.borderFocus : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {marker}
      </View>
    </View>
  );
}
