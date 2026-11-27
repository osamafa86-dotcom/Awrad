import type { SummaryRange } from '../hooks/useSummary';
import { ar } from '../messages/ar';
import { SegmentedTabs } from './SegmentedTabs';

const OPTIONS: ReadonlyArray<{ value: SummaryRange; label: string }> = [
  { value: '30d', label: ar.summary.range.d30 },
  { value: '90d', label: ar.summary.range.d90 },
  { value: 'all', label: ar.summary.range.all },
];

/** DESIGN.md §6 RangeTabs: a segmented control «30 يومًا · 90 يومًا · الكل». */
export function RangeTabs({ value, onChange }: { value: SummaryRange; onChange(next: SummaryRange): void }) {
  return <SegmentedTabs options={OPTIONS} value={value} onChange={onChange} label={ar.summary.rangeLabel} />;
}
