import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../lib/theme';
import { ar } from '../messages/ar';
import { RubMark } from './icons/RubMark';

export interface AuthScreenProps {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Show the brand mark above the title (login screens; not the full-page notices). */
  brand?: boolean;
}

/** Shared shell for the sign-in screens and the account notices (m01–m05, d01). */
export function AuthScreen({ title, subtitle, children, footer, brand = true }: AuthScreenProps) {
  const { colors, space, type } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.bgCanvas }}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          padding: space.s16,
          paddingTop: space.s16 + insets.top,
          paddingBottom: space.s16 + insets.bottom,
          gap: space.s24,
        }}
      >
        {brand ? (
          <View style={{ alignItems: 'center', gap: space.s8 }}>
            <RubMark size={48} color={colors.actionPrimary} />
            <Text style={[type.displayBrand, { color: colors.textPrimary }]}>{ar.app.name}</Text>
            <Text style={[type.bodyMd, { color: colors.textSecondary, textAlign: 'center' }]}>{ar.app.tagline}</Text>
          </View>
        ) : null}
        <View style={{ gap: space.s8 }}>
          <Text accessibilityRole="header" style={[type.displayTitle, { color: colors.textPrimary }]}>
            {title}
          </Text>
          {subtitle ? <Text style={[type.bodyMd, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
        </View>
        <View style={{ gap: space.s16 }}>{children}</View>
        {footer ? (
          <View style={{ alignItems: 'center', gap: space.s8 }}>{footer}</View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
