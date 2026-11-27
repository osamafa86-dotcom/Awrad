import Flame from 'lucide-react-native/icons/flame';
import { Text, View } from 'react-native';

import { useTheme } from '../lib/theme';
import { ar } from '../messages/ar';

/** DESIGN.md §6 StreakChip: «السلسلة الحالية 13 يومًا» with a flame; gold only for a standing streak. */
export function StreakChip({ days }: { days: number }) {
  const { colors, radius, space, type } = useTheme();
  const standing = days > 0;
  const fg = standing ? colors.goldText : colors.textSecondary;
  return (
    <View
      accessible
      accessibilityLabel={ar.today.streak(days)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'center',
        gap: space.s4,
        paddingHorizontal: space.s12,
        paddingVertical: space.s4,
        borderRadius: radius.full,
        backgroundColor: standing ? colors.goldTint : colors.bgSunken,
      }}
    >
      <Flame color={fg} size={16} strokeWidth={1.75} />
      <Text style={[type.labelSm, { color: fg }]}>{ar.today.streak(days)}</Text>
    </View>
  );
}
