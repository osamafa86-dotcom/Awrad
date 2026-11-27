import type { EntryStatus, HabitDef } from '@awrad/domain';
import { Text, View } from 'react-native';

import { useTheme } from '../lib/theme';
import type { HabitEntryState } from '../lib/today';
import { HabitMark } from './HabitMark';
import { Tristate } from './Tristate';

export interface HabitRowProps {
  habit: HabitDef;
  entry: HabitEntryState;
  onChange(entry: HabitEntryState): void;
  disabled?: boolean;
}

/** Name and target sit beside the habit's mark; names wrap, never truncate (DESIGN.md §7 rule 9). */
export function HabitTitle({
  habit,
  status,
}: {
  habit: HabitDef;
  status: EntryStatus | undefined;
}) {
  const { colors, space, type } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.s12, flex: 1 }}>
      <View style={{ paddingTop: space.s2 }}>
        <HabitMark status={status} />
      </View>
      <View style={{ flex: 1, gap: space.s2 }}>
        <Text accessibilityRole="header" style={[type.titleMd, { color: colors.textPrimary }]}>
          {habit.name}
        </Text>
        {habit.targetText ? (
          <Text style={[type.bodySm, { color: colors.textSecondary }]}>{habit.targetText}</Text>
        ) : null}
      </View>
    </View>
  );
}

/** DESIGN.md §6 HabitRow: mark, name, target, then the Tristate. */
export function HabitRow({ habit, entry, onChange, disabled = false }: HabitRowProps) {
  const { space } = useTheme();
  return (
    <View style={{ gap: space.s12, paddingVertical: space.s16 }}>
      <HabitTitle habit={habit} status={entry.status} />
      <Tristate
        label={habit.name}
        value={entry.status}
        disabled={disabled}
        onChange={(status) => onChange({ ...entry, status })}
      />
    </View>
  );
}
