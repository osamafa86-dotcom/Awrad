import { useLocalSearchParams } from 'expo-router';

import { LogDetailView } from '../../../src/components/LogDetailView';

export default function LogDetailScreen() {
  const { period, date } = useLocalSearchParams<{ period: string; date: string }>();
  return <LogDetailView period={String(period)} date={String(date)} />;
}
