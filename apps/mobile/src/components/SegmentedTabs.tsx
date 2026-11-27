import { Pressable, Text, View } from 'react-native';

import { useTheme } from '../lib/theme';

export interface SegmentedTabsProps<T extends string> {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange(next: T): void;
  /** Accessible name of the whole group. */
  label: string;
}

/** A segmented control (DESIGN.md §6 RangeTabs look): equal-width tabs, ≥ 44 tall, selected = raised surface. */
export function SegmentedTabs<T extends string>({ options, value, onChange, label }: SegmentedTabsProps<T>) {
  const { colors, radius, space, type } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        padding: space.s4,
        gap: space.s4,
        borderRadius: radius.lg,
        backgroundColor: colors.bgSunken,
      }}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityLabel={o.label}
            aria-selected={selected}
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
