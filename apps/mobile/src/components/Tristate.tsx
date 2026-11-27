import type { EntryStatus } from '@awrad/domain';
import type { LucideIcon } from 'lucide-react-native';
import Check from 'lucide-react-native/icons/check';
import Minus from 'lucide-react-native/icons/minus';
import X from 'lucide-react-native/icons/x';
import { Pressable, Text, View } from 'react-native';

import { useTheme } from '../lib/theme';
import { ar } from '../messages/ar';

export interface TristateProps {
  /** Unset until the student picks one. */
  value: EntryStatus | undefined;
  onChange(value: EntryStatus): void;
  /** The habit's name: the radiogroup's accessible label. */
  label: string;
  disabled?: boolean;
}

const OPTIONS: readonly { value: EntryStatus; label: string; icon: LucideIcon }[] = [
  { value: 'done', label: ar.today.tristate.done, icon: Check },
  { value: 'not_done', label: ar.today.tristate.notDone, icon: X },
  { value: 'not_required', label: ar.today.tristate.notRequired, icon: Minus },
];

const MIN_TOUCH = 44;
const ICON_SIZE = 16;
const ICON_STROKE = 2;

/** DESIGN.md §6 Tristate: empty · done · not done · not required — three segments, one choice. */
export function Tristate({ value, onChange, label, disabled = false }: TristateProps) {
  const { colors, radius, space, type } = useTheme();

  const palette = (option: EntryStatus) => {
    // Unselected segments blend into the sunken track (no background of their own).
    if (value !== option)
      return { bg: undefined, fg: colors.textSecondary, border: colors.bgSunken };
    switch (option) {
      case 'done':
        return {
          bg: colors.statusDoneFill,
          fg: colors.textOnPrimary,
          border: colors.statusDoneFill,
        };
      case 'not_done':
        return {
          bg: colors.statusNotdoneTint,
          fg: colors.statusNotdone,
          border: colors.statusNotdone,
        };
      case 'not_required':
        return { bg: colors.bgSurface, fg: colors.textPrimary, border: colors.borderStrong };
    }
  };

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        gap: space.s4,
        padding: space.s4,
        borderRadius: radius.md,
        backgroundColor: colors.bgSunken,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {OPTIONS.map(({ value: option, label: optionLabel, icon: Icon }) => {
        const p = palette(option);
        const selected = value === option;
        return (
          <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityLabel={optionLabel}
            aria-checked={selected}
            aria-disabled={disabled}
            disabled={disabled}
            onPress={() => onChange(option)}
            style={{
              flex: 1,
              minHeight: MIN_TOUCH,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: space.s4,
              paddingHorizontal: space.s8,
              borderRadius: radius.sm,
              borderWidth: 1.5,
              borderColor: p.border,
              backgroundColor: p.bg,
            }}
          >
            {selected ? <Icon color={p.fg} size={ICON_SIZE} strokeWidth={ICON_STROKE} /> : null}
            <Text
              style={[selected ? type.labelMd : type.bodySm, { color: p.fg, textAlign: 'center' }]}
            >
              {optionLabel}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
