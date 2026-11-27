import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useTheme } from '../lib/theme';

export interface ListRowProps {
  title: string;
  subtitle?: string;
  value?: string;
  /** chevron: opens something · value: shows a value (still tappable with onPress) · toggle: `right` holds the Toggle · delete: destructive. */
  kind: 'chevron' | 'value' | 'toggle' | 'delete';
  /** Trailing control (the Toggle for `kind="toggle"`). */
  right?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  testID?: string;
}

/** DESIGN.md §6 ListRow: title (+ subtitle) at the start, value / chevron / switch at the end, ≥ 44 tall. */
export function ListRow(props: ListRowProps) {
  const { title, subtitle, value, kind, onPress, disabled = false, testID } = props;
  const { colors, space, type } = useTheme();
  const destructive = kind === 'delete';
  const titleColor = destructive ? colors.statusNotdone : colors.textPrimary;

  const content = (
    <>
      <View style={{ flex: 1, gap: space.s4 }}>
        <Text style={[type.bodyMd, { color: titleColor }]}>{title}</Text>
        {subtitle ? <Text style={[type.bodySm, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
      </View>
      {value ? <Text style={[type.bodyMd, { color: colors.textSecondary }]}>{value}</Text> : null}
      {kind === 'chevron' ? <ChevronLeft color={colors.textTertiary} size={20} strokeWidth={1.75} /> : null}
      {kind === 'toggle' ? props.right : null}
    </>
  );
  const layout = {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s12,
    paddingHorizontal: space.s16,
    paddingVertical: space.s8,
  } as const;

  // A toggle row is not itself pressable: the switch is the control.
  if (kind === 'toggle' || !onPress) {
    return (
      <View testID={testID} style={layout}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={value ? `${title}، ${value}` : title}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        layout,
        { backgroundColor: pressed ? colors.actionPrimaryTint : 'transparent', opacity: disabled ? 0.6 : 1 },
      ]}
    >
      {content}
    </Pressable>
  );
}
