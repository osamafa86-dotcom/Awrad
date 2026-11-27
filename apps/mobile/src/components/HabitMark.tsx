import type { EntryStatus } from '@awrad/domain';
import { View } from 'react-native';

import { useTheme } from '../lib/theme';
import { ar } from '../messages/ar';
import { RubMark } from './icons/RubMark';

export type MarkState = EntryStatus | 'unset';

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
  const color =
    state === 'not_done'
      ? colors.statusNotdone
      : state === 'not_required'
        ? colors.borderDefault
        : colors.borderStrong;
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
