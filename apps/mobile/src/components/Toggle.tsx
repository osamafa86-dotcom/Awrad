import { Switch } from 'react-native';

import { useTheme } from '../lib/theme';

export interface ToggleProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  /** Spoken name of the switch (the row title). */
  label: string;
  disabled?: boolean;
}

/** DESIGN.md §6 Toggle: RN `Switch` in token colours; the on-state uses the primary action colour, never gold. */
export function Toggle({ value, onValueChange, label, disabled = false }: ToggleProps) {
  const { colors } = useTheme();
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={label}
      // Native screen readers read accessibilityState; react-native-web only maps the aria-* props.
      accessibilityState={{ checked: value, disabled }}
      aria-checked={value}
      aria-disabled={disabled}
      trackColor={{ false: colors.borderInput, true: colors.actionPrimary }}
      thumbColor={colors.bgSurface}
      ios_backgroundColor={colors.borderInput}
      style={{ minHeight: 44, minWidth: 52 }}
    />
  );
}
