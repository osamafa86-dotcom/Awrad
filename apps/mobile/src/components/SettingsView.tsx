import { requestAccountDeletion } from '@awrad/supabase-client';
import DateTimePicker from '@react-native-community/datetimepicker';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppSession } from '../hooks/SessionProvider';
import { useProfileSettings, type ProfileSettingsPatch } from '../hooks/useProfileSettings';
import { useSettings } from '../hooks/useSettings';
import {
  devicePushStatus,
  registerForPushDetailed,
  unregisterThisDevice,
  type DevicePushStatus,
} from '../lib/notifications';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/theme';
import { ar } from '../messages/ar';
import { Button } from './Button';
import { ConfirmDeleteSheet } from './ConfirmDeleteSheet';
import { ListRow } from './ListRow';
import { TextField } from './TextField';
import { TimezonePicker } from './TimezonePicker';
import { Toggle } from './Toggle';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const pad = (n: number) => String(n).padStart(2, '0');

function Section({ title, children }: { title?: string; children: ReactNode }) {
  const { colors, radius, space, type } = useTheme();
  return (
    <View style={{ gap: space.s8 }}>
      {title ? (
        <Text accessibilityRole="header" style={[type.labelMd, { color: colors.textSecondary, paddingHorizontal: space.s4 }]}>
          {title}
        </Text>
      ) : null}
      <View
        style={{
          overflow: 'hidden',
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.borderSubtle,
          backgroundColor: colors.bgSurface,
        }}
      >
        {children}
      </View>
    </View>
  );
}

/** Web has no native picker: a typed `HH:MM` field that commits only a valid 24h time. */
function WebTimeField({ value, onCommit }: { value: string; onCommit: (t: string) => void }) {
  const { space } = useTheme();
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const invalid = !TIME_RE.test(text);
  return (
    <View style={{ padding: space.s16 }}>
      <TextField
        label={ar.settings.reminderTime}
        helper={ar.settings.reminderTimeHint}
        error={invalid ? ar.settings.reminderTimeInvalid : undefined}
        value={text}
        ltr
        onChangeText={(t) => {
          setText(t);
          if (TIME_RE.test(t) && t !== value) onCommit(t);
        }}
      />
    </View>
  );
}

/** الإعدادات (F-50…F-52; DESIGN.md m24, m25, d24, w02). Data lives in the hooks; this only composes rows. */
export function SettingsView() {
  const { colors, radius, space, type } = useTheme();
  const { session, signOut } = useAppSession();
  const uid = session?.user.id ?? null;
  const prefs = useProfileSettings();
  const app = useSettings();
  const isWeb = Platform.OS === 'web';

  // This device's registration (mobile I1): the switch shows it, not whether some other phone of the user has a token.
  const [push, setPush] = useState<DevicePushStatus | null>(isWeb ? 'unavailable' : null);
  const [pushAttempted, setPushAttempted] = useState(false);
  const [pushError, setPushError] = useState(false);
  const [draftTime, setDraftTime] = useState<Date | null>(null);
  const [deletionOpen, setDeletionOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [zonePicker, setZonePicker] = useState(false);
  const [timePicker, setTimePicker] = useState(false);

  // One read each: is this device registered for this user / is a deletion request open?
  useEffect(() => {
    if (!uid) return;
    let live = true;
    // Independent reads: one failing must not leave the other control stuck.
    const device: Promise<DevicePushStatus> = isWeb ? Promise.resolve('unavailable') : devicePushStatus(uid);
    const requests = Promise.resolve(
      supabase.from('deletion_requests').select('id').eq('user_id', uid).is('handled_at', null).limit(1),
    );
    void Promise.allSettled([device, requests]).then(([d, r]) => {
      if (!live) return;
      setPush(d.status === 'fulfilled' ? d.value : 'not-registered');
      setDeletionOpen(r.status === 'fulfilled' && !r.value.error && (r.value.data?.length ?? 0) > 0);
    });
    return () => {
      live = false;
    };
  }, [uid, isWeb]);

  const { update } = prefs;
  const save = useCallback((patch: ProfileSettingsPatch) => void update(patch), [update]);

  const enablePush = async () => {
    setPushAttempted(true);
    setPushError(false);
    try {
      const result = await registerForPushDetailed();
      if (result.status === 'no-user') setPushError(true);
      else setPush(result.status === 'granted' ? 'registered' : result.status);
    } catch {
      setPushError(true);
    }
  };

  const togglePush = async (next: boolean) => {
    if (next) return enablePush();
    setPushError(false);
    try {
      await unregisterThisDevice(uid);
      setPush('not-registered');
    } catch {
      setPushError(true);
    }
  };

  /** A reminder switched on (mobile I2): register this device in context if it is not yet, so the reminder can arrive. */
  const reminderSwitchedOn = () => {
    if (!isWeb && push !== 'registered' && push !== 'unavailable') void enablePush();
  };

  const requestDeletion = async (): Promise<boolean> => {
    await requestAccountDeletion(supabase);
    setDeletionOpen(true);
    return true;
  };

  const reminderOn = prefs.reminderTime !== null;
  // A reminder is on, so this device should be able to receive it (spec §12, F-50/F-51).
  const wantsReminders = reminderOn || prefs.weeklyReminder;
  const showDenied = !isWeb && push === 'denied' && (wantsReminders || pushAttempted);
  const showNeedPush = !isWeb && push === 'not-registered' && wantsReminders;
  const showUnavailable = !isWeb && push === 'unavailable' && (wantsReminders || pushAttempted);
  const privacyBase = process.env.EXPO_PUBLIC_ADMIN_URL; // read literally so Expo inlines it
  const effectiveZone = app.timezone;
  const [h, m] = (prefs.reminderTime ?? app.defaultReminderTime).split(':').map(Number);
  const commitTime = (d: Date) => {
    const t = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    if (t !== prefs.reminderTime) save({ reminder_time: t });
  };
  const pickerDate = new Date(2026, 0, 1, h, m);

  const banner = (text: string, tone: 'error' | 'info', action?: ReactNode) => (
    <View
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      style={{
        gap: space.s12,
        padding: space.s16,
        borderRadius: radius.lg,
        backgroundColor: tone === 'error' ? colors.statusNotdoneTint : colors.statusNeutralTint,
      }}
    >
      <Text style={[type.bodyMd, { color: tone === 'error' ? colors.statusNotdone : colors.textPrimary }]}>{text}</Text>
      {action}
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgCanvas }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: space.s16, gap: space.s24 }}>
        <Text accessibilityRole="header" style={[type.displayTitle, { color: colors.textPrimary }]}>
          {ar.tabs.settings}
        </Text>

        {prefs.error ? banner(ar.settings.saveFailed, 'error') : null}

        <Section title={ar.settings.reminders}>
          <ListRow
            kind="toggle"
            title={ar.settings.dailyReminder}
            right={
              <Toggle
                label={ar.settings.dailyReminder}
                value={reminderOn}
                onValueChange={(on) => {
                  save({ reminder_time: on ? app.defaultReminderTime : null });
                  if (on) reminderSwitchedOn();
                }}
              />
            }
          />
          {reminderOn && prefs.reminderTime ? (
            isWeb ? (
              <WebTimeField value={prefs.reminderTime} onCommit={(t) => save({ reminder_time: t })} />
            ) : (
              <ListRow
                kind="value"
                title={ar.settings.reminderTime}
                value={prefs.reminderTime}
                onPress={() => setTimePicker(true)}
              />
            )
          ) : null}
          {timePicker && !isWeb ? (
            <>
              <DateTimePicker
                mode="time"
                is24Hour
                locale="ar"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                value={draftTime ?? pickerDate}
                onChange={(event, date) => {
                  if (Platform.OS === 'android') {
                    // The dialog reports once: set or dismissed.
                    setTimePicker(false);
                    if (event.type === 'set' && date) commitTime(date);
                  } else if (date) {
                    setDraftTime(date); // iOS fires on every scroll tick; write once on «تم»
                  }
                }}
              />
              {Platform.OS === 'ios' ? (
                <View style={{ padding: space.s12 }}>
                  <Button
                    label={ar.settings.done}
                    size="md"
                    onPress={() => {
                      setTimePicker(false);
                      if (draftTime) commitTime(draftTime);
                      setDraftTime(null);
                    }}
                  />
                </View>
              ) : null}
            </>
          ) : null}
          <ListRow
            kind="toggle"
            title={ar.settings.weeklyReminder}
            right={
              <Toggle
                label={ar.settings.weeklyReminder}
                value={prefs.weeklyReminder}
                onValueChange={(on) => {
                  save({ weekly_reminder: on });
                  if (on) reminderSwitchedOn();
                }}
              />
            }
          />
          {isWeb ? null : (
            <ListRow
              kind="toggle"
              title={ar.settings.notifications}
              right={
                <Toggle
                  label={ar.settings.notifications}
                  value={push === 'registered'}
                  disabled={push === null}
                  onValueChange={(on) => void togglePush(on)}
                />
              }
            />
          )}
        </Section>
        {isWeb ? banner(ar.settings.webInstallBanner, 'info') : null}
        {showDenied
          ? banner(
              ar.settings.pushDenied,
              'error',
              <Button
                label={ar.settings.openSettings}
                variant="secondary"
                size="md"
                fullWidth={false}
                onPress={() => void Linking.openSettings()}
              />,
            )
          : null}
        {showNeedPush
          ? banner(
              ar.settings.remindersNeedPush,
              'info',
              <Button
                label={ar.settings.enablePush}
                variant="secondary"
                size="md"
                fullWidth={false}
                onPress={() => void enablePush()}
              />,
            )
          : null}
        {showUnavailable ? banner(ar.settings.pushUnavailable, 'info') : null}
        {pushError ? banner(ar.settings.saveFailed, 'error') : null}

        <Section title={ar.settings.timezoneSection}>
          <ListRow
            kind="chevron"
            title={ar.settings.timezone}
            value={prefs.timezone ?? ar.settings.groupDefault}
            subtitle={prefs.timezone === null ? effectiveZone : undefined}
            onPress={() => setZonePicker(true)}
          />
        </Section>

        <Section title={ar.settings.about}>
          <ListRow kind="value" title={ar.settings.version} value={Constants.expoConfig?.version ?? ar.common.dash} />
          {privacyBase ? (
            <ListRow
              kind="chevron"
              title={ar.settings.privacy}
              onPress={() => void Linking.openURL(`${privacyBase}/privacy`)}
            />
          ) : null}
          <ListRow kind="value" title={ar.settings.support} value={ar.settings.supportValue} />
        </Section>

        <Section>
          <ListRow
            kind="delete"
            title={deletionOpen ? ar.settings.deletionPending : ar.settings.requestDeletion}
            disabled={deletionOpen}
            onPress={() => setSheet(true)}
          />
        </Section>

        <Button label={ar.settings.signOut} variant="secondary" onPress={() => void signOut()} />
      </ScrollView>

      <TimezonePicker
        visible={zonePicker}
        selected={prefs.timezone}
        onClose={() => setZonePicker(false)}
        onSelect={(tz) => {
          setZonePicker(false);
          save({ timezone: tz });
        }}
      />
      <ConfirmDeleteSheet visible={sheet} onConfirm={requestDeletion} onClose={() => setSheet(false)} />
    </SafeAreaView>
  );
}
