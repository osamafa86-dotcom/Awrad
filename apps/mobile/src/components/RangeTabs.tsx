import { Pressable, Text, View } from 'react-native';

import type { SummaryRange } from '../hooks/useSummary';
import { useTheme } from '../lib/theme';
import { ar } from '../messages/ar';

const OPTIONS: ReadonlyArray<{ value: SummaryRange; label: string }> = [
  { value: '30d', label: ar.summary.range.d30 },
  { value: '90d', label: ar.summary.range.d90 },
  { value: 'all', label: ar.summary.range.all },
];

/** DESIGN.md §6 RangeTabs: a segmented control «30 يومًا · 90 يومًا · الكل». */
export function RangeTabs({ value, onChange }: { value: SummaryRange; onChange(next: SummaryRange): void }) {
  const { colors, radius, space, type } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={ar.summary.rangeLabel}
      style={{
        flexDirection: 'row',
        padding: space.s4,
        gap: space.s4,
        borderRadius: radius.lg,
        backgroundColor: colors.bgSunken,
      }}
    >
      {OPTIONS.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityLabel={o.label}
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={{
              flex: 1,
              minHeight: 44,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.md,
              backgroundColor: selected ? colors.bgSurface : 'transparent',
              borderWidth: 1,
              borderColor: selected ? colors.borderSubtle : 'transparent',
            }}
          >
            <Text
              style={[
                selected ? type.labelMd : type.bodyMd,
                { color: selected ? colors.textPrimary : colors.textSecondary, textAlign: 'center' },
              ]}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
