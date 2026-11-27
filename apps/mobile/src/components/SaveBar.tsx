import { Text, View } from 'react-native';

import { useTheme } from '../lib/theme';
import { ar } from '../messages/ar';
import { Button } from './Button';

export interface SaveBarProps {
  canSave: boolean;
  saving: boolean;
  onSave(): void;
  onMarkAllDone(): void;
  /** The single reason line (disabled: the first habit without a status). */
  reason: string;
  /** Extra bottom padding when no tab bar sits below (the tab bar already covers the safe area). */
  bottomInset?: number;
}

/**
 * DESIGN.md §6 SaveBar: empty · incomplete · ready. Sticky above the tab bar: «تعليم الكل تم» then
 * «حفظ اليوم» — the primary action last in the row (§7 rule 3), with one reason line above (rule 6).
 */
export function SaveBar({
  canSave,
  saving,
  onSave,
  onMarkAllDone,
  reason,
  bottomInset = 0,
}: SaveBarProps) {
  const { colors, space, type } = useTheme();
  return (
    <View
      style={{
        gap: space.s8,
        paddingHorizontal: space.s16,
        paddingTop: space.s12,
        paddingBottom: space.s12 + bottomInset,
        borderTopWidth: 1,
        borderTopColor: colors.borderSubtle,
        backgroundColor: colors.bgSurface,
      }}
    >
      <Text
        accessibilityLiveRegion="polite"
        style={[type.caption, { color: colors.textSecondary }]}
      >
        {reason}
      </Text>
      <View style={{ flexDirection: 'row', gap: space.s12 }}>
        <View style={{ flex: 1 }}>
          <Button
            label={ar.today.markAllDone}
            variant="secondary"
            size="lg"
            onPress={onMarkAllDone}
            disabled={saving}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            label={ar.today.save}
            size="lg"
            onPress={onSave}
            disabled={!canSave}
            loading={saving}
          />
        </View>
      </View>
    </View>
  );
}
