import type { EntryStatus } from '@awrad/domain';
import { View } from 'react-native';

import { useTheme, type ThemeColors } from '../lib/theme';
import { ar } from '../messages/ar';
import { RubMark } from './icons/RubMark';

export type MarkState = EntryStatus | 'unset';

/**
 * The stroke colour of each state (done is the gold fill, drawn by RubMark itself). «غير مطلوب» carries meaning, so it
 * uses the neutral status token (≥ 3:1 on card and canvas in both themes, WCAG 1.4.11), not the decorative border.
 */
export function markColor(state: MarkState, colors: ThemeColors): string {
  return state === 'not_done'
    ? colors.statusNotdone
    : state === 'not_required'
      ? colors.statusNeutral
      : colors.borderStrong;
}

/**
 * RubMark in its four states (DESIGN.md §6), told apart by shape as well as colour (§7 rule 2):
 * not logged = plain outline · done = gold fill · not done = ✕ centre · not required = dash centre.
 */
export function HabitMark({
  status,
  size = 24,
}: {
  status: EntryStatus | undefined;
  size?: number;
}) {
  const { colors } = useTheme();
  const state: MarkState = status ?? 'unset';
  const color = markColor(state, colors);
  const inner = state === 'not_done' ? 'cross' : state === 'not_required' ? 'dash' : 'ring';
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={ar.today.markState[state]}>
      <RubMark
        size={size}
        filled={state === 'done'}
        color={color}
        inner={inner}
        testID={`habit-mark-${state}`}
      />
    </View>
  );
}
