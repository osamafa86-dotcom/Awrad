import { router } from 'expo-router';
import History from 'lucide-react-native/icons/history';
import { useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  useLogList,
  type DailyLogRow,
  type LogListRow,
  type WeeklyLogRow,
} from '../hooks/useLogList';
import { useTheme } from '../lib/theme';
import { ar } from '../messages/ar';
import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { HistoryRow } from './HistoryRow';
import { SegmentedTabs } from './SegmentedTabs';
import { StatusChip } from './StatusChip';

type Period = 'daily' | 'weekly';

const TABS: ReadonlyArray<{ value: Period; label: string }> = [
  { value: 'daily', label: ar.history.tabs.daily },
  { value: 'weekly', label: ar.history.tabs.weekly },
];

/** The history tab (F-40; DESIGN.md m22): daily/weekly switch, a paged list of HistoryRows. */
export function HistoryView() {
  const [period, setPeriod] = useState<Period>('daily');
  const list = useLogList(period);
  const { colors, radius, space, type } = useTheme();
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await list.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const rows = list.rows as LogListRow[];
  const showEmpty = !list.loading && !list.error && rows.length === 0;

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={{ flex: 1, backgroundColor: colors.bgCanvas }}
    >
      <FlatList
        testID="history-list"
        data={rows}
        keyExtractor={(r) => (r.period === 'daily' ? r.date : r.weekStart)}
        contentContainerStyle={{ padding: space.s16, gap: space.s12, paddingBottom: space.s32 }}
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.5}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
        ListHeaderComponent={
          <View style={{ gap: space.s12 }}>
            <Text accessibilityRole="header" style={[type.titleLg, { color: colors.textPrimary }]}>
              {ar.tabs.history}
            </Text>
            <SegmentedTabs<Period>
              options={TABS}
              value={period}
              onChange={setPeriod}
              label={ar.history.tabsLabel}
            />
            {list.error ? (
              <View
                accessibilityRole="alert"
                style={{
                  gap: space.s12,
                  alignItems: 'center',
                  padding: space.s16,
                  borderRadius: radius.lg,
                  backgroundColor: colors.statusNotdoneTint,
                }}
              >
                <Text style={[type.bodyMd, { color: colors.statusNotdone, textAlign: 'center' }]}>
                  {ar.history.loadFailed}
                </Text>
                <Button
                  label={ar.history.retry}
                  variant="secondary"
                  size="md"
                  fullWidth={false}
                  onPress={() => void list.refetch()}
                />
              </View>
            ) : null}
            {list.loading ? (
              <View style={{ alignItems: 'center', gap: space.s12, paddingVertical: space.s32 }}>
                <ActivityIndicator color={colors.actionPrimary} />
                <Text style={[type.bodyMd, { color: colors.textSecondary }]}>
                  {ar.history.loading}
                </Text>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          showEmpty ? (
            <EmptyState
              icon={History}
              title={ar.history.empty.title}
              body={ar.history.empty.body}
            />
          ) : undefined
        }
        ListFooterComponent={
          list.loadingMore ? (
            <View style={{ alignItems: 'center', paddingVertical: space.s16 }}>
              <ActivityIndicator color={colors.actionPrimary} />
            </View>
          ) : undefined
        }
        renderItem={({ item }) =>
          item.period === 'daily' ? <DailyRow row={item} /> : <WeeklyRow row={item} />
        }
      />
    </SafeAreaView>
  );
}

function DailyRow({ row }: { row: DailyLogRow }) {
  return (
    <HistoryRow
      testID={`history-row-${row.date}`}
      lockTestID={`history-lock-${row.date}`}
      primary={row.hijri}
      secondary={row.gregorian}
      chip={row.state === 'unknown' ? undefined : <StatusChip state={row.state} />}
      editable={row.editable}
      showEditableBadge={row.editable && !row.isToday}
      onPress={() => router.push(`/log/daily/${row.date}`)}
    />
  );
}

function WeeklyRow({ row }: { row: WeeklyLogRow }) {
  const { colors, type } = useTheme();
  return (
    <HistoryRow
      testID={`history-row-${row.weekStart}`}
      lockTestID={`history-lock-${row.weekStart}`}
      primary={row.label}
      secondary={row.hijriRange}
      chip={<Text style={[type.labelSm, { color: colors.textSecondary }]}>{ar.history.weeklyLogged}</Text>}
      editable={row.editable}
      showEditableBadge={row.editable}
      onPress={() => router.push(`/log/weekly/${row.weekStart}`)}
    />
  );
}
