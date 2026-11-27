import { ActivityIndicator, Pressable, Text } from 'react-native';

import { useTheme } from '../lib/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  /** Stretch to the container's width (default true for md/lg). */
  fullWidth?: boolean;
  accessibilityLabel?: string;
  /** `link` for buttons that leave the app (opens a URL). */
  role?: 'button' | 'link';
  testID?: string;
}

const HEIGHT = { sm: 36, md: 44, lg: 52 } as const;
const MIN_TOUCH = 44;

/** DESIGN.md §6 Button: primary · primary-disabled · secondary · quiet · danger, three sizes. */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  disabled = false,
  loading = false,
  fullWidth = size !== 'sm',
  accessibilityLabel,
  role = 'button',
  testID,
}: ButtonProps) {
  const { colors, radius, space, type } = useTheme();
  const inactive = disabled || loading;
  const height = HEIGHT[size];
  // Small buttons are visually 36 tall; hitSlop brings the touch target to 44.
  const slop = Math.max(0, (MIN_TOUCH - height) / 2);

  const palette = (pressed: boolean) => {
    if (inactive && variant === 'primary') {
      return { bg: colors.bgSunken, fg: colors.textTertiary, border: colors.bgSunken };
    }
    switch (variant) {
      case 'primary':
        return {
          bg: pressed ? colors.actionPrimaryPressed : colors.actionPrimary,
          fg: colors.textOnPrimary,
          border: pressed ? colors.actionPrimaryPressed : colors.actionPrimary,
        };
      case 'secondary':
        return {
          bg: pressed ? colors.actionPrimaryTint : colors.bgSurface,
          fg: colors.textLink,
          border: colors.borderInput,
        };
      case 'quiet':
        return { bg: pressed ? colors.actionPrimaryTint : 'transparent', fg: colors.textLink, border: 'transparent' };
      case 'danger':
        return {
          bg: pressed ? colors.statusNotdoneTint : colors.bgSurface,
          fg: colors.statusNotdone,
          border: colors.statusNotdone,
        };
    }
  };

  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel ?? label}
      aria-disabled={inactive}
      aria-busy={loading}
      disabled={inactive}
      onPress={onPress}
      hitSlop={slop}
      testID={testID}
      style={({ pressed }) => {
        const p = palette(pressed);
        return {
          minHeight: height,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: space.s8,
          paddingHorizontal: size === 'sm' ? space.s12 : space.s20,
          paddingVertical: space.s8,
          borderRadius: radius.md,
          borderWidth: 1,
          backgroundColor: p.bg,
          borderColor: p.border,
          opacity: inactive && variant !== 'primary' ? 0.5 : 1,
        };
      }}
    >
      {({ pressed }) => (
        <>
          {loading ? <ActivityIndicator size="small" color={palette(pressed).fg} /> : null}
          <Text
            style={[size === 'sm' ? type.labelSm : type.labelMd, { color: palette(pressed).fg, textAlign: 'center' }]}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}
