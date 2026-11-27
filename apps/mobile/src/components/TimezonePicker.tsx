import { Modal, ScrollView, Text, View } from 'react-native';

import { TIMEZONES } from '../lib/timezones';
import { useTheme } from '../lib/theme';
import { ar } from '../messages/ar';
import { Button } from './Button';
import { ListRow } from './ListRow';

export interface TimezonePickerProps {
  visible: boolean;
  /** The profile's own zone, null = the group's default. */
  selected: string | null;
  onSelect: (timezone: string | null) => void;
  onClose: () => void;
}

/** A simple sheet listing the common zones plus «افتراضي المجموعة» (null). */
export function TimezonePicker({ visible, selected, onSelect, onClose }: TimezonePickerProps) {
  const { colors, radius, space, type } = useTheme();
  const options: Array<{ id: string | null; label: string }> = [
    { id: null, label: ar.settings.groupDefault },
    ...TIMEZONES.map((z) => ({ id: z as string | null, label: z })),
  ];
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.bgScrim }}>
        <View
          accessibilityViewIsModal
          style={{
            maxHeight: '80%',
            gap: space.s8,
            paddingTop: space.s24,
            paddingBottom: space.s16,
            borderTopStartRadius: radius.xxl,
            borderTopEndRadius: radius.xxl,
            backgroundColor: colors.bgSurface,
          }}
        >
          <Text
            accessibilityRole="header"
            style={[type.titleLg, { color: colors.textPrimary, paddingHorizontal: space.s24 }]}
          >
            {ar.settings.timezonePickerTitle}
          </Text>
          <ScrollView>
            {options.map((o) => (
              <ListRow
                key={o.id ?? 'group-default'}
                kind="value"
                title={o.label}
                value={o.id === selected ? ar.settings.on : undefined}
                onPress={() => onSelect(o.id)}
              />
            ))}
          </ScrollView>
          <View style={{ paddingHorizontal: space.s16 }}>
            <Button label={ar.settings.close} variant="secondary" onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
