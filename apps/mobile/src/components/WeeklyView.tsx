import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useWeeklyScreen } from '../hooks/useWeeklyScreen';
import { useTheme } from '../lib/theme';
import { entryFor } from '../lib/today';
import { ar } from '../messages/ar';
import { Button } from './Button';
import { DayStatusBanner } from './DayStatusBanner';
import { HabitChecklist } from './HabitChecklist';
import { HabitRow } from './HabitRow';
import { SaveBar } from './SaveBar';
import { TextField } from './TextField';
import { WeekHeader } from './WeekHeader';

/** The weekly review (F-20…F-24; DESIGN.md m20, d20). Composition only — state lives in useWeeklyScreen. */
export function WeeklyView() {
  const s = useWeeklyScreen();
  const { colors, radius, space, type } = useTheme();

  const body = (() => {
    if (s.loading) {
      return (
        <View style={{ alignItems: 'center', gap: space.s12, paddingVertical: space.s48 }}>
          <ActivityIndicator color={colors.actionPrimary} />
          <Text style={[type.bodyMd, { color: colors.textSecondary }]}>{ar.weekly.loading}</Text>
        </View>
      );
    }
    if (s.loadError) {
      return (
        <View style={{ alignItems: 'center', gap: space.s12, paddingVertical: space.s32 }}>
          <Text style={[type.bodyMd, { color: colors.statusNotdone, textAlign: 'center' }]}>
            {ar.weekly.loadFailed}
          </Text>
          <Button
            label={ar.weekly.retry}
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
          {ar.weekly.empty}
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
                    onChange={(next) => s.setEntry(habit.id, { ...entry, ...next })}
                  />
                ) : (
                  <HabitRow
                    habit={habit}
                    entry={entry}
                    onChange={(next) => s.setEntry(habit.id, next)}
                  />
                )}
              </View>
            );
          })}
        </View>
        <TextField
          label={ar.weekly.reviewLabel}
          multiline
          value={s.reviewText}
          onChangeText={s.setReviewText}
        />
        <TextField
          label={ar.weekly.supportLabel}
          helper={ar.weekly.supportHelper}
          multiline
          value={s.supportRequestText}
          onChangeText={s.setSupportRequestText}
        />
      </>
    );
  })();

  const banner =
    s.banner?.kind === 'error' ? (
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
        period="weekly"
        state={s.banner.kind}
        completionPct={s.banner.completionPct}
        remaining={s.banner.remaining}
      />
    ) : null;

  const showSaveBar = !s.loading && !s.loadError && s.habits.length > 0;

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={{ flex: 1, backgroundColor: colors.bgCanvas }}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: space.s16, gap: space.s16, paddingBottom: space.s32 }}
      >
        {s.week ? (
          <WeekHeader
            weekStart={s.week.weekStart}
            weekEnd={s.week.weekEnd}
            hijriAdjustment={s.settings.hijriAdjustment}
            canPrev={s.canPrev}
            canNext={s.canNext}
            onPrev={s.goPrev}
            onNext={s.goNext}
          />
        ) : null}
        {s.showLastWeekBanner ? (
          <View
            style={{
              gap: space.s12,
              padding: space.s16,
              borderRadius: radius.lg,
              backgroundColor: colors.actionPrimaryTint,
            }}
          >
            <View style={{ gap: space.s4 }}>
              <Text style={[type.titleMd, { color: colors.textPrimary }]}>
                {ar.weekly.lastWeek.title}
              </Text>
              <Text style={[type.bodySm, { color: colors.textSecondary }]}>
                {ar.weekly.lastWeek.body}
              </Text>
            </View>
            <Button
              label={ar.weekly.lastWeek.action}
              variant="secondary"
              size="md"
              fullWidth={false}
              onPress={s.goPrev}
            />
          </View>
        ) : null}
        {banner}
        {body}
      </ScrollView>
      {showSaveBar ? (
        <SaveBar
          saveLabel={ar.weekly.save}
          canSave={s.canSave}
          saving={s.saving}
          onSave={() => void s.save()}
          onMarkAllDone={s.markAllDone}
          reason={
            s.missingHabit ? ar.weekly.missingStatus(s.missingHabit.name) : ar.weekly.allSpecified
          }
        />
      ) : null}
    </SafeAreaView>
  );
}
