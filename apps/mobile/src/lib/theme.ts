import { darkColors, lightColors, radius, space, type } from '@awrad/design-tokens';
import { DarkTheme, DefaultTheme } from 'expo-router';
import { useColorScheme } from 'react-native';

export type ColorScheme = 'light' | 'dark';
export type ThemeColors = typeof lightColors | typeof darkColors;

export interface Theme {
  colors: ThemeColors;
  space: typeof space;
  radius: typeof radius;
  type: typeof type;
  scheme: ColorScheme;
}

/** Design tokens for the current system colour scheme (light unless the system says dark). */
export function useTheme(): Theme {
  const scheme: ColorScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return {
    colors: scheme === 'dark' ? darkColors : lightColors,
    space,
    radius,
    type,
    scheme,
  };
}

type NavigationTheme = typeof DefaultTheme;

/** React Navigation theme (headers, tab bar, screen background) built from the same tokens. */
export function toNavigationTheme(theme: Theme): NavigationTheme {
  const base = theme.scheme === 'dark' ? DarkTheme : DefaultTheme;
  const { colors, type: t } = theme;
  // Each weight is its own font file, so the weight stays 'normal' and the family carries it.
  const font = (fontFamily: string) => ({ fontFamily, fontWeight: 'normal' as const });
  return {
    ...base,
    dark: theme.scheme === 'dark',
    colors: {
      ...base.colors,
      primary: colors.actionPrimary,
      background: colors.bgCanvas,
      card: colors.bgSurface,
      text: colors.textPrimary,
      border: colors.borderSubtle,
      notification: colors.statusNotdone,
    },
    fonts: {
      regular: font(t.bodyMd.fontFamily),
      medium: font(t.bodyStrong.fontFamily),
      bold: font(t.titleMd.fontFamily),
      heavy: font(t.titleLg.fontFamily),
    },
  };
}
