import type { EntryStatus } from '@awrad/domain';

import { useTheme } from '../lib/theme';
import { RubMark } from './icons/RubMark';

/** RubMark in its four states (DESIGN.md §6): not logged · done (gold) · not done · not required. */
export function HabitMark({
  status,
  size = 24,
}: {
  status: EntryStatus | undefined;
  size?: number;
}) {
  const { colors } = useTheme();
  const color =
    status === 'not_done'
      ? colors.statusNotdone
      : status === 'not_required'
        ? colors.borderDefault
        : colors.borderStrong;
  return <RubMark size={size} filled={status === 'done'} color={color} />;
}
