import Flame from 'lucide-react-native/icons/flame';
import { Text, View } from 'react-native';

import { useTheme } from '../lib/theme';
import { ar } from '../messages/ar';

export interface StatCardProps {
  label: string;
  /** Display text («86», «91%»); null → «—». */
  value: string | null;
  /** Plain stat, or a streak (flame icon; gold number only while the streak stands). */
  kind?: 'plain' | 'streak';
  /** Whether a streak is standing (> 0): gold is for completion only. */
  standing?: boolean;
  /** Plain text for assistive tech (the visual value may carry bidi marks). */
  spokenValue?: string;
  testID?: string;
}

/** DESIGN.md §6 StatCard: big number (displayNumber) and a label that wraps instead of truncating. */
export function StatCard({
  label,
  value,
  kind = 'plain',
  standing = false,
  spokenValue,
  testID,
}: StatCardProps) {
  const { colors, radius, space, type } = useTheme();
  const gold = kind === 'streak' && standing;
  const color = gold ? colors.goldText : colors.textPrimary;
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${spokenValue ?? value ?? ar.common.dash}`}
      testID={testID}
      style={{
        flexGrow: 1,
        flexBasis: '45%',
        gap: space.s4,
        padding: space.s16,
        borderRadius: radius.xl,
        borderWidth: 1,
        borderColor: colors.borderSubtle,
        backgroundColor: colors.bgSurface,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s8 }}>
        {kind === 'streak' ? (
          <View testID="streak-flame">
            <Flame color={gold ? colors.goldText : colors.textTertiary} size={22} strokeWidth={1.75} />
          </View>
        ) : null}
        <Text
          testID={testID ? `${testID}-value` : undefined}
          style={[type.displayNumber, { color }]}
        >
          {value ?? ar.common.dash}
        </Text>
      </View>
      <Text style={[type.bodySm, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}
