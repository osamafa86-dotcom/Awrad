import type { LucideIcon } from 'lucide-react-native';
import Check from 'lucide-react-native/icons/check';
import CircleDashed from 'lucide-react-native/icons/circle-dashed';
import Minus from 'lucide-react-native/icons/minus';
import Slash from 'lucide-react-native/icons/slash';
import { Text, View } from 'react-native';

import { useTheme } from '../lib/theme';
import { ar } from '../messages/ar';

export type ChipState = 'achieved' | 'failed' | 'neutral' | 'missing';

const ICONS: Record<ChipState, LucideIcon> = {
  achieved: Check,
  failed: Slash,
  neutral: Minus,
  missing: CircleDashed,
};

/**
 * DESIGN.md §6 StatusChip — the day states differ by SHAPE, never colour alone (§7 rule 2):
 * achieved = filled + check · failed = solid outline + slash · neutral = grey outline + dash ·
 * missing = dotted outline. Gold is for completion marks only, so «مُنجَز» uses the done tokens.
 */
export function StatusChip({ state }: { state: ChipState }) {
  const { colors, radius, space, type } = useTheme();
  const Icon = ICONS[state];
  const label = ar.history.chip[state];

  const look = {
    achieved: { bg: colors.statusDoneFill, fg: colors.textOnPrimary, border: colors.statusDoneFill, style: 'solid' },
    // The failed chip's border mirrors the calendar's partial-state hatch colour (CalendarCell).
    failed: { bg: 'transparent', fg: colors.textPrimary, border: colors.statusDoneHatch, style: 'solid' },
    neutral: { bg: 'transparent', fg: colors.textSecondary, border: colors.statusNeutral, style: 'solid' },
    missing: { bg: 'transparent', fg: colors.textSecondary, border: colors.statusMissing, style: 'dotted' },
  }[state] as { bg: string; fg: string; border: string; style: 'solid' | 'dotted' };

  return (
    <View
      testID={`status-chip-${state}`}
      accessible
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.s4,
        paddingHorizontal: space.s8,
        paddingVertical: space.s4,
        borderRadius: radius.full,
        borderWidth: 1.5,
        borderStyle: look.style,
        borderColor: look.border,
        backgroundColor: look.bg,
      }}
    >
      <Icon color={look.fg} size={14} strokeWidth={2} />
      <Text style={[type.labelSm, { color: look.fg }]}>{label}</Text>
    </View>
  );
}
