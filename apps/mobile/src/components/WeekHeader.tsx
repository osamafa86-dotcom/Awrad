import { toHijri } from '@awrad/domain';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import type { LucideIcon } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import { formatDayMonth } from '../lib/format';
import { useTheme } from '../lib/theme';
import { ar } from '../messages/ar';

export interface WeekHeaderProps {
  weekStart: string;
  weekEnd: string;
  hijriAdjustment?: number;
  onPrev(): void;
  onNext(): void;
  canPrev: boolean;
  canNext: boolean;
}

const NAV_SIZE = 40;
const NAV_SLOP = 2; // 40 + 2×2 = 44 (touch target)

function hijriRange(start: string, end: string, adjustment: number): string {
  const a = toHijri(start, adjustment);
  const b = toHijri(end, adjustment);
  if (a.year === b.year) return `${ar.weekly.hijriRange(a.monthName, b.monthName)} ${b.year}`;
  return `${a.monthName} ${a.year} – ${b.monthName} ${b.year}`;
}

/** DESIGN.md §3/§6 WeekHeader: the title on its own row (wraps, never clipped), Hijri under it, arrows below. */
export function WeekHeader({
  weekStart,
  weekEnd,
  hijriAdjustment = 0,
  onPrev,
  onNext,
  canPrev,
  canNext,
}: WeekHeaderProps) {
  const { colors, space, type } = useTheme();
  return (
    <View style={{ gap: space.s8, alignItems: 'center' }}>
      <Text
        accessibilityRole="header"
        style={[type.titleLg, { color: colors.textPrimary, textAlign: 'center' }]}
      >
        {ar.weekly.title(formatDayMonth(weekStart), formatDayMonth(weekEnd))}
      </Text>
      <Text style={[type.bodySm, { color: colors.textSecondary, textAlign: 'center' }]}>
        {hijriRange(weekStart, weekEnd, hijriAdjustment)}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s16 }}>
        {/* "previous" first (the start side in RTL) and pointing that way (§7 rule 3). */}
        <NavButton label={ar.weekly.prevWeek} icon={ChevronRight} enabled={canPrev} onPress={onPrev} />
        <NavButton label={ar.weekly.nextWeek} icon={ChevronLeft} enabled={canNext} onPress={onNext} />
      </View>
    </View>
  );
}

export function NavButton({
  label,
  icon: Icon,
  enabled,
  onPress,
}: {
  label: string;
  icon: LucideIcon;
  enabled: boolean;
  onPress(): void;
}) {
  const { colors, radius } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={onPress}
      hitSlop={NAV_SLOP}
      style={({ pressed }) => ({
        width: NAV_SIZE,
        height: NAV_SIZE,
        borderRadius: radius.full,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: colors.borderSubtle,
        backgroundColor: pressed ? colors.actionPrimaryTint : colors.bgSurface,
        opacity: enabled ? 1 : 0.4,
      })}
    >
      <Icon color={enabled ? colors.textPrimary : colors.textTertiary} size={20} strokeWidth={1.75} />
    </Pressable>
  );
}
