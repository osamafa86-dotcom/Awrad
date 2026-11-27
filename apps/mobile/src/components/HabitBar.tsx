import { Text, View } from 'react-native';

import { useTheme } from '../lib/theme';
import { ar } from '../messages/ar';

/** DESIGN.md §6 HabitBar: the habit's name and completion % over a bar filled to that width. */
export function HabitBar({ name, pct, testID }: { name: string; pct: number | null; testID?: string }) {
  const { colors, radius, space, type } = useTheme();
  const value = pct === null ? null : Math.min(100, Math.max(0, Math.round(pct)));
  const valueText = value === null ? ar.common.dash : ar.summary.pct(value);
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={name}
      accessibilityValue={
        value === null ? { text: ar.common.dash } : { min: 0, max: 100, now: value, text: `${value}%` }
      }
      testID={testID}
      style={{ gap: space.s8 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.s12 }}>
        <Text style={[type.bodyMd, { flex: 1, color: colors.textPrimary }]}>{name}</Text>
        <Text style={[type.labelMd, { color: colors.textSecondary }]}>{valueText}</Text>
      </View>
      <View style={{ height: 8, borderRadius: radius.full, overflow: 'hidden', backgroundColor: colors.bgSunken }}>
        <View
          testID="habit-bar-fill"
          style={{
            width: `${value ?? 0}%`,
            height: '100%',
            borderRadius: radius.full,
            backgroundColor: colors.statusDoneFill,
          }}
        />
      </View>
    </View>
  );
}
