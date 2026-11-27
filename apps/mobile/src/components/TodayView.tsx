import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTodayScreen } from '../hooks/useTodayScreen';
import { useTheme } from '../lib/theme';
import { entryFor, markStatus } from '../lib/today';
import { ar } from '../messages/ar';
import { Button } from './Button';
import { DateHeader } from './DateHeader';
import { DayStatusBanner } from './DayStatusBanner';
import { HabitChecklist } from './HabitChecklist';
import { HabitRow } from './HabitRow';
import { SaveBar } from './SaveBar';
import { TextField } from './TextField';

export interface TodayViewProps {
  /** Defaults to the student's today (BR-08). */
  initialDate?: string;
  /** For days outside the edit window (Task 2.6, m23): no SaveBar, disabled controls, «للقراءة فقط». */
  readOnly?: boolean;
  /** Opened from the history list: no previous/next arrows, the date stays fixed. */
  lockDate?: boolean;
}

/** The daily log (F-10…F-16; DESIGN.md m10–m15, d10–d12). Composition only — state lives in useTodayScreen. */
export function TodayView({ initialDate, readOnly = false, lockDate = false }: TodayViewProps) {
  const s = useTodayScreen({ initialDate, readOnly });
  const { colors, radius, space, type } = useTheme();

  const body = (() => {
    if (s.loading) {
      return (
        <View style={{ alignItems: 'center', gap: space.s12, paddingVertical: space.s48 }}>
          <ActivityIndicator color={colors.actionPrimary} />
          <Text style={[type.bodyMd, { color: colors.textSecondary }]}>{ar.today.loading}</Text>
        </View>
      );
    }
    if (s.loadError) {
      return (
        <View style={{ alignItems: 'center', gap: space.s12, paddingVertical: space.s32 }}>
          <Text style={[type.bodyMd, { color: colors.statusNotdone, textAlign: 'center' }]}>
            {ar.today.loadFailed}
          </Text>
          <Button
            label={ar.today.retry}
            variant="secondary"
            size="md"
            fullWidth={false}
            onPress={s.retryLoad}
          />
        </View>
      );
    }
    if (s.habits.length === 0) {
      return (
        <Text style={[type.bodyMd, { color: colors.textSecondary, textAlign: 'center' }]}>
          {ar.today.empty}
        </Text>
      );
    }
    return (
      <>
        <View
          style={{
            paddingHorizontal: space.s16,
            borderRadius: radius.xl,
            borderWidth: 1,
            borderColor: colors.borderSubtle,
            backgroundColor: colors.bgSurface,
          }}
        >
          {s.habits.map((habit, i) => {
            const entry = entryFor(s.entries, habit.id);
            return (
              <View
                key={habit.id}
                style={
                  i > 0 ? { borderTopWidth: 1, borderTopColor: colors.borderSubtle } : undefined
                }
              >
                {habit.kind === 'checklist' ? (
                  <HabitChecklist
                    habit={habit}
                    checkedIds={entry.checkedItemIds}
                    notRequired={entry.notRequired === true}
                    disabled={readOnly}
                    onChange={(next) => s.setEntry(habit.id, { ...entry, ...next })}
                  />
                ) : (
                  <HabitRow
                    habit={habit}
                    entry={entry}
                    disabled={readOnly}
                    onChange={(next) => s.setEntry(habit.id, next)}
                  />
                )}
              </View>
            );
          })}
        </View>
        <TextField
          label={ar.today.noteLabel}
          helper={ar.today.noteHelper}
          multiline
          value={s.note}
          onChangeText={s.setNote}
          editable={!readOnly}
        />
      </>
    );
  })();

  const banner = readOnly ? (
    <DayStatusBanner state="readOnly" />
  ) : s.banner?.kind === 'error' ? (
    <DayStatusBanner
      state="error"
      message={
        s.banner.draftKept
          ? `${ar.errors[s.banner.code]} ${ar.today.banner.draftKept}`
          : ar.errors[s.banner.code]
      }
      offline={s.banner.code === 'UNKNOWN'}
      onRetry={s.canSave ? () => void s.save() : undefined}
    />
  ) : s.banner ? (
    <DayStatusBanner
      state={s.banner.kind}
      completionPct={s.banner.completionPct}
      remaining={s.banner.remaining}
    />
  ) : null;

  const showSaveBar = !readOnly && !s.loading && !s.loadError && s.habits.length > 0;

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={{ flex: 1, backgroundColor: colors.bgCanvas }}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: space.s16, gap: space.s16, paddingBottom: space.s32 }}
      >
        {s.date && s.today ? (
          <DateHeader
            date={s.date}
            today={s.today}
            hijriAdjustment={s.settings.hijriAdjustment}
            canPrev={s.canPrev}
            canNext={s.canNext}
            hideNav={lockDate}
            onPrev={s.goPrev}
            onNext={s.goNext}
            marks={s.habits.map((h) => ({
              id: h.id,
              status: markStatus(h, entryFor(s.entries, h.id)),
            }))}
            streak={s.streak}
          />
        ) : null}
        {banner}
        {body}
      </ScrollView>
      {showSaveBar ? (
        <SaveBar
          canSave={s.canSave}
          saving={s.saving}
          onSave={() => void s.save()}
          onMarkAllDone={s.markAllDone}
          reason={
            s.missingHabit ? ar.today.missingStatus(s.missingHabit.name) : ar.today.allSpecified
          }
        />
      ) : null}
    </SafeAreaView>
  );
}
