import Lock from 'lucide-react-native/icons/lock';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useTheme } from '../lib/theme';
import { ar } from '../messages/ar';

export interface HistoryRowProps {
  /** Hijri date (or the week label). */
  primary: string;
  /** Gregorian date (or the Hijri range of a week). */
  secondary: string;
  /** Trailing state (a StatusChip for days, plain text for weeks). */
  chip?: ReactNode;
  /** The chip's text, so the row's accessible name carries the state too. */
  stateLabel?: string;
  /** Still open for editing (BR-05/BR-06): false shows the lock. */
  editable: boolean;
  /** Show the «قابل للتعديل» badge (editable rows other than today). */
  showEditableBadge?: boolean;
  onPress(): void;
  testID?: string;
  lockTestID?: string;
}

/** DESIGN.md §6 HistoryRow: «قابل للتعديل» · «مقفل» (lock). ≥ 44 tall, text wraps (never truncated). */
export function HistoryRow({
  primary,
  secondary,
  chip,
  stateLabel,
  editable,
  showEditableBadge = false,
  onPress,
  testID,
  lockTestID,
}: HistoryRowProps) {
  const { colors, radius, space, type } = useTheme();
  // The label replaces the row's children for screen readers, so it repeats everything visible.
  const label = [primary, secondary, stateLabel, showEditableBadge ? ar.history.editable : null]
    .filter(Boolean)
    .join('، ');
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={editable ? undefined : ar.history.readOnlyHint}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.s12,
        minHeight: 56,
        paddingHorizontal: space.s16,
        paddingVertical: space.s12,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.borderSubtle,
        backgroundColor: pressed ? colors.actionPrimaryTint : colors.bgSurface,
      })}
    >
      <View style={{ flex: 1, gap: space.s4 }}>
        <Text style={[type.titleMd, { color: colors.textPrimary }]}>{primary}</Text>
        <Text style={[type.bodySm, { color: colors.textSecondary }]}>{secondary}</Text>
        {showEditableBadge ? (
          <View
            style={{
              alignSelf: 'flex-start',
              paddingHorizontal: space.s8,
              borderRadius: radius.full,
              backgroundColor: colors.actionPrimaryTint,
            }}
          >
            <Text style={[type.labelSm, { color: colors.textLink }]}>{ar.history.editable}</Text>
          </View>
        ) : null}
      </View>
      {chip}
      {editable ? null : (
        <View testID={lockTestID} accessible accessibilityLabel={ar.history.locked}>
          <Lock color={colors.textTertiary} size={18} strokeWidth={1.75} />
        </View>
      )}
    </Pressable>
  );
}
