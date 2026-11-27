import { useState } from 'react';
import { Modal, Text, View } from 'react-native';

import { useTheme } from '../lib/theme';
import { ar } from '../messages/ar';
import { Button } from './Button';
import { Toggle } from './Toggle';

export interface ConfirmDeleteSheetProps {
  visible: boolean;
  /** Sends the request; resolves true when it was recorded. */
  onConfirm: () => Promise<boolean>;
  onClose: () => void;
}

/** m25: the double confirmation for an account-deletion request (F-52): read, acknowledge, then confirm. */
export function ConfirmDeleteSheet({ visible, onConfirm, onClose }: ConfirmDeleteSheetProps) {
  const { colors, radius, space, type } = useTheme();
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [done, setDone] = useState(false);

  const close = () => {
    setAcknowledged(false);
    setFailed(false);
    setDone(false);
    onClose();
  };

  const confirm = async () => {
    if (!acknowledged || busy) return;
    setBusy(true);
    setFailed(false);
    const ok = await onConfirm().catch(() => false);
    setBusy(false);
    if (ok) setDone(true);
    else setFailed(true);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.bgScrim }}>
        <View
          accessibilityViewIsModal
          style={{
            gap: space.s16,
            padding: space.s24,
            borderTopStartRadius: radius.xxl,
            borderTopEndRadius: radius.xxl,
            backgroundColor: colors.bgSurface,
          }}
        >
          <Text accessibilityRole="header" style={[type.titleLg, { color: colors.textPrimary }]}>
            {ar.settings.deleteTitle}
          </Text>
          {done ? (
            <>
              <Text accessibilityLiveRegion="polite" style={[type.bodyMd, { color: colors.textPrimary }]}>
                {ar.settings.deleteDone}
              </Text>
              <Button label={ar.settings.close} variant="secondary" onPress={close} />
            </>
          ) : (
            <>
              <Text style={[type.bodyMd, { color: colors.textSecondary }]}>{ar.settings.deleteBody}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s12 }}>
                <Text style={[type.bodyMd, { color: colors.textPrimary, flex: 1 }]}>{ar.settings.deleteAck}</Text>
                <Toggle value={acknowledged} onValueChange={setAcknowledged} label={ar.settings.deleteAck} />
              </View>
              {failed ? (
                <Text accessibilityRole="alert" style={[type.bodySm, { color: colors.statusNotdone }]}>
                  {ar.settings.deleteFailed}
                </Text>
              ) : null}
              <Button label={ar.settings.deleteCancel} variant="secondary" onPress={close} />
              <Button
                label={ar.settings.deleteConfirm}
                variant="danger"
                disabled={!acknowledged}
                loading={busy}
                onPress={() => void confirm()}
              />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
