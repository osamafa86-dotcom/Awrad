import { useRef, useState, type ComponentRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useTheme } from '../lib/theme';
import { ar } from '../messages/ar';

export interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Called once when the last digit is entered (typed or pasted). */
  onComplete?: (value: string) => void;
  length?: number;
  error?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
}

const BOX_W = 48;
const BOX_H = 56;

/**
 * DESIGN.md §6 OtpInput: empty · partial · complete · error. One real (invisible) input owns the
 * text, so paste, SMS autofill and backspace work natively; the boxes only display it. The row
 * is `direction: ltr` — the one place besides email where the RTL UI reads left to right.
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  error = false,
  disabled = false,
  autoFocus = false,
}: OtpInputProps) {
  const { colors, radius, space, type } = useTheme();
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const [focused, setFocused] = useState(false);
  const activeIndex = Math.min(value.length, length - 1);

  const handleChange = (raw: string) => {
    const next = raw.replace(/\D/g, '').slice(0, length);
    if (next === value) return;
    onChange(next);
    if (next.length === length) onComplete?.(next);
  };

  return (
    <View>
      <View testID="otp-row" style={{ direction: 'ltr', flexDirection: 'row', justifyContent: 'center', gap: space.s8 }}>
        {Array.from({ length }, (_, i) => {
          const digit = value[i] ?? '';
          const isActive = focused && !disabled && i === activeIndex;
          const borderColor = error ? colors.statusNotdone : isActive ? colors.borderFocus : colors.borderInput;
          return (
            <Pressable
              key={i}
              accessible={false}
              importantForAccessibility="no-hide-descendants"
              onPress={() => input.current?.focus()}
              testID={`otp-box-${i}`}
              style={{
                width: BOX_W,
                height: BOX_H,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: radius.md,
                borderWidth: isActive || error ? 2 : 1,
                borderColor,
                backgroundColor: colors.bgSurface,
              }}
            >
              <Text style={[type.numberLg, { color: colors.textPrimary }]}>{digit}</Text>
            </Pressable>
          );
        })}
      </View>
      <TextInput
        ref={input}
        value={value}
        onChangeText={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        editable={!disabled}
        autoFocus={autoFocus}
        maxLength={length}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        caretHidden
        accessibilityLabel={ar.auth.otpLabel}
        aria-invalid={error ? true : undefined}
        // Invisible but full-size, so taps, long-press paste and autofill hit the real input.
        style={[StyleSheet.absoluteFill, { opacity: 0, writingDirection: 'ltr' }]}
      />
    </View>
  );
}
