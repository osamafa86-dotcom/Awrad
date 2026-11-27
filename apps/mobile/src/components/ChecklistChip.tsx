import Check from 'lucide-react-native/icons/check';
import { Pressable, Text, View } from 'react-native';

import { useTheme } from '../lib/theme';

export interface ChecklistChipProps {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onToggle(): void;
}

const BOX = 22;
const MIN_TOUCH = 44;

/** DESIGN.md §6 ChecklistChip: unchecked · checked · disabled. One item of a checklist habit. */
export function ChecklistChip({ label, checked, disabled = false, onToggle }: ChecklistChipProps) {
  const { colors, radius, space, type } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={onToggle}
      style={({ pressed }) => ({
        minHeight: MIN_TOUCH,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.s8,
        paddingHorizontal: space.s12,
        paddingVertical: space.s8,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: checked ? colors.statusDoneTint : colors.borderDefault,
        backgroundColor: checked || pressed ? colors.statusDoneTint : colors.bgSurface,
        opacity: disabled ? 0.5 : 1,
        flexShrink: 1,
      })}
    >
      <View
        style={{
          width: BOX,
          height: BOX,
          borderRadius: radius.sm / 2,
          borderWidth: 1.5,
          borderColor: checked ? colors.statusDoneFill : colors.borderInput,
          backgroundColor: checked ? colors.statusDoneFill : colors.bgSurface,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {checked ? <Check color={colors.textOnPrimary} size={16} strokeWidth={2.5} /> : null}
      </View>
      <Text style={[type.labelSm, { color: colors.textPrimary, flexShrink: 1 }]}>{label}</Text>
    </Pressable>
  );
}
