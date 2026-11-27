import { addDays, dayOfWeek, toHijri, type EntryStatus } from '@awrad/domain';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import type { LucideIcon } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import { useTheme } from '../lib/theme';
import { ar } from '../messages/ar';
import { HabitMark } from './HabitMark';
import { StreakChip } from './StreakChip';

export interface DateHeaderProps {
  date: string;
  /** The student's today (BR-08), for «اليوم» / «أمس». */
  today: string;
  hijriAdjustment: number;
  onPrev(): void;
  onNext(): void;
  canPrev: boolean;
  canNext: boolean;
  /** One mark per active habit, in order. */
  marks: Array<{ id: string; status: EntryStatus | undefined }>;
  /** Current streak; the chip appears once it is known. */
  streak: number | null;
}

const NAV_SIZE = 40;
const NAV_SLOP = 2; // 40 + 2×2 = 44 (touch target)

function gregorianLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return ar.today.gregorianDate(d ?? 1, ar.today.gregorianMonths[(m ?? 1) - 1] ?? '', y ?? 0);
}

/** DESIGN.md §6 DateHeader: Hijri first and large (§2), Gregorian under it, habit marks, streak. */
export function DateHeader(props: DateHeaderProps) {
  const { date, today, hijriAdjustment, onPrev, onNext, canPrev, canNext, marks, streak } = props;
  const { colors, space, type } = useTheme();
  const relative =
    date === today ? ar.today.relToday : date === addDays(today, -1) ? ar.today.relYesterday : null;
  const weekday = ar.today.weekdays[dayOfWeek(date)] ?? '';
  const hijri = toHijri(date, hijriAdjustment);
  const done = marks.filter((m) => m.status === 'done').length;

  return (
    <View style={{ gap: space.s8, alignItems: 'center' }}>
      <View
        style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', gap: space.s8 }}
      >
        {/* Reading order: "previous" comes first (the start side in RTL) and points that way (§7 rule 3). */}
        <NavButton
          label={ar.today.prevDay}
          icon={ChevronRight}
          enabled={canPrev}
          onPress={onPrev}
        />
        <Text style={[type.labelMd, { flex: 1, textAlign: 'center', color: colors.textSecondary }]}>
          {ar.today.dayLabel(relative, weekday)}
        </Text>
        <NavButton label={ar.today.nextDay} icon={ChevronLeft} enabled={canNext} onPress={onNext} />
      </View>
      <Text
        accessibilityRole="header"
        style={[type.displayHijri, { color: colors.textPrimary, textAlign: 'center' }]}
      >
        {hijri.formatted}
      </Text>
      <Text style={[type.bodySm, { color: colors.textSecondary }]}>{gregorianLabel(date)}</Text>
      <View
        accessible
        accessibilityLabel={ar.today.marksLabel(done, marks.length)}
        style={{ flexDirection: 'row', gap: space.s8, paddingVertical: space.s4 }}
      >
        {marks.map((m) => (
          <HabitMark key={m.id} status={m.status} />
        ))}
      </View>
      {streak !== null ? <StreakChip days={streak} /> : null}
    </View>
  );
}

function NavButton({
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
      <Icon
        color={enabled ? colors.textPrimary : colors.textTertiary}
        size={20}
        strokeWidth={1.75}
      />
    </Pressable>
  );
}
