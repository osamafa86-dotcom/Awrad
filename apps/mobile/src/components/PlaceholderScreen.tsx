import { Text, View } from 'react-native';

import { useTheme } from '../lib/theme';
import { ar } from '../messages/ar';

/** Temporary body for a tab until its screen is built (Tasks 2.3–2.7). */
export function PlaceholderScreen({ title }: { title: string }) {
  const { type, space } = useTheme();
  return (
    <View className="flex-1 items-center justify-center bg-canvas" style={{ padding: space.s16, gap: space.s8 }}>
      <Text accessibilityRole="header" className="text-primary" style={type.displayTitle}>
        {title}
      </Text>
      <Text className="text-secondary" style={type.bodyMd}>
        {ar.common.comingSoon}
      </Text>
    </View>
  );
}
