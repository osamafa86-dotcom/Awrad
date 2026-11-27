import { useState } from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '../lib/theme';

export interface TextFieldProps
  extends Pick<
    TextInputProps,
    | 'value'
    | 'onChangeText'
    | 'placeholder'
    | 'keyboardType'
    | 'autoCapitalize'
    | 'autoComplete'
    | 'autoCorrect'
    | 'textContentType'
    | 'returnKeyType'
    | 'onSubmitEditing'
    | 'editable'
    | 'autoFocus'
    | 'testID'
  > {
  label: string;
  helper?: string;
  /** Error message; its presence puts the field in the error state. */
  error?: string;
  multiline?: boolean;
  /** Email-like content: typed left-to-right inside the RTL UI (design rule 5). */
  ltr?: boolean;
}

/** DESIGN.md §6 TextField: default · focused · error · multiline. */
export function TextField({ label, helper, error, multiline = false, ltr = false, ...input }: TextFieldProps) {
  const { colors, radius, space, type } = useTheme();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.statusNotdone : focused ? colors.borderFocus : colors.borderInput;

  return (
    <View style={{ gap: space.s8 }}>
      <Text style={[type.labelMd, { color: colors.textPrimary }]}>{label}</Text>
      <TextInput
        {...input}
        multiline={multiline}
        accessibilityLabel={label}
        aria-invalid={error ? true : undefined}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholderTextColor={colors.textTertiary}
        style={[
          type.bodyMd,
          {
            minHeight: multiline ? 112 : 52,
            paddingHorizontal: space.s16,
            paddingVertical: space.s12,
            borderRadius: radius.md,
            borderWidth: focused || error ? 2 : 1,
            borderColor,
            backgroundColor: colors.bgSurface,
            color: colors.textPrimary,
            textAlignVertical: multiline ? 'top' : 'center',
          },
          ltr && {
            writingDirection: 'ltr',
            // eslint-disable-next-line no-restricted-syntax -- why: design rule 5 (LTR email/OTP)
            textAlign: 'left',
          },
        ]}
      />
      {error ? (
        <Text accessibilityLiveRegion="polite" accessibilityRole="alert" style={[type.bodySm, { color: colors.statusNotdone }]}>
          {error}
        </Text>
      ) : helper ? (
        <Text style={[type.bodySm, { color: colors.textTertiary }]}>{helper}</Text>
      ) : null}
    </View>
  );
}
