import type { HabitDef } from '@awrad/domain';
import type { LucideIcon } from 'lucide-react-native';
import CheckCheck from 'lucide-react-native/icons/check-check';
import Minus from 'lucide-react-native/icons/minus';
import { Pressable, Text, View } from 'react-native';

import { useTheme } from '../lib/theme';
import { markStatus } from '../lib/today';
import { ar } from '../messages/ar';
import { ChecklistChip } from './ChecklistChip';
import { HabitTitle } from './HabitRow';

export interface HabitChecklistProps {
  habit: HabitDef;
  checkedIds: string[];
  notRequired: boolean;
  onChange(next: { checkedItemIds: string[]; notRequired: boolean }): void;
  disabled?: boolean;
}

const BAR_WIDTH = 64;
const BAR_HEIGHT = 6;

/**
 * DESIGN.md §6 HabitChecklist: open · complete · not required. Counter «10/13» without spaces
 * (§7 rule 4); partial lists stay incomplete (rule 7); gold only once every item is checked (rule 1).
 */
export function HabitChecklist({
  habit,
  checkedIds,
  notRequired,
  onChange,
  disabled = false,
}: HabitChecklistProps) {
  const { colors, radius, space, type } = useTheme();
  const checked = new Set(checkedIds);
  const total = habit.items.length;
  const done = notRequired ? 0 : habit.items.filter((i) => checked.has(i.id)).length;
  const complete = !notRequired && total > 0 && done === total;
  const status = markStatus(habit, { checkedItemIds: checkedIds, notRequired });

  const toggle = (itemId: string) => {
    const next = checked.has(itemId)
      ? checkedIds.filter((id) => id !== itemId)
      : [...checkedIds, itemId];
    onChange({ checkedItemIds: next, notRequired: false });
  };

  return (
    <View style={{ gap: space.s12, paddingVertical: space.s16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.s12 }}>
        <HabitTitle habit={habit} status={status} />
        <View
          accessibilityRole="progressbar"
          accessibilityLabel={ar.today.progressLabel(done, total)}
          accessibilityValue={{ min: 0, max: total, now: done }}
          style={{ alignItems: 'flex-end', gap: space.s4 }}
        >
          {/* LTR keeps «10/13» in reading order inside the RTL layout. */}
          <Text
            style={[
              type.numberMd,
              {
                writingDirection: 'ltr',
                color: complete
                  ? colors.goldText
                  : notRequired
                    ? colors.textTertiary
                    : colors.textPrimary,
              },
            ]}
          >
            {ar.today.counter(done, total)}
          </Text>
          <View
            style={{
              width: BAR_WIDTH,
              height: BAR_HEIGHT,
              borderRadius: radius.full,
              backgroundColor: colors.bgSunken,
            }}
          >
            <View
              style={{
                width: total > 0 ? (BAR_WIDTH * done) / total : 0,
                height: BAR_HEIGHT,
                borderRadius: radius.full,
                backgroundColor: complete ? colors.goldGilt : colors.actionPrimary,
              }}
            />
          </View>
        </View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s8 }}>
        {habit.items.map((item) => (
          <ChecklistChip
            key={item.id}
            label={item.name}
            checked={!notRequired && checked.has(item.id)}
            disabled={disabled || notRequired}
            onToggle={() => toggle(item.id)}
          />
        ))}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s24 }}>
        <ChecklistAction
          label={ar.today.checkAll}
          icon={CheckCheck}
          disabled={disabled}
          onPress={() =>
            onChange({ checkedItemIds: habit.items.map((i) => i.id), notRequired: false })
          }
        />
        <ChecklistAction
          label={ar.today.notRequiredToday}
          icon={Minus}
          selected={notRequired}
          disabled={disabled}
          onPress={() => onChange({ checkedItemIds: [], notRequired: !notRequired })}
        />
      </View>
    </View>
  );
}

function ChecklistAction({
  label,
  icon: Icon,
  onPress,
  selected,
  disabled,
}: {
  label: string;
  icon: LucideIcon;
  onPress(): void;
  selected?: boolean;
  disabled?: boolean;
}) {
  const { colors, radius, space, type } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={{ top: 6, bottom: 6 }}
      style={({ pressed }) => ({
        minHeight: 32,
        minWidth: 44,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.s4,
        paddingHorizontal: space.s8,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: selected ? colors.borderStrong : 'transparent',
        backgroundColor: pressed ? colors.actionPrimaryTint : 'transparent',
        opacity: disabled ? 0.5 : 1,
      })}
    >
      <Icon color={colors.textLink} size={16} strokeWidth={1.75} />
      <Text style={[type.labelSm, { color: colors.textLink }]}>{label}</Text>
    </Pressable>
  );
}
