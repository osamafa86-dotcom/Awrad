import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const saveAttendance = vi.fn();
vi.mock('@/actions/attendance', () => ({ saveAttendance: (...a: unknown[]) => saveAttendance(...a), deleteSession: vi.fn() }));

import { AttendanceGrid } from '@/components/attendance/AttendanceGrid';
import { AttendanceSegment } from '@/components/attendance/AttendanceSegment';
import type { Mark, Member, SessionDetail } from '@/lib/attendance';
import { ar } from '@/messages/ar';

const t = ar.attendance;
const G1 = { id: 'g1', name: 'المجموعة الأولى' };
const G2 = { id: 'g2', name: 'المجموعة الثانية' };

const members: Member[] = [
  { id: 'u1', fullName: 'أحمد', groupId: G1.id },
  { id: 'u2', fullName: 'خالد', groupId: G1.id },
  { id: 'u3', fullName: 'بلال', groupId: G2.id },
];

const shared: SessionDetail = { id: 's1', groupId: null, groupName: null, date: '2026-11-27', title: 'مجلس الجمعة' };

function renderGrid(props: { groups?: typeof G1[]; marks?: Mark[]; session?: SessionDetail } = {}) {
  return render(
    <AttendanceGrid
      session={props.session ?? shared}
      groups={props.groups ?? [G1, G2]}
      members={members}
      marks={props.marks ?? []}
      canDelete={false}
      timezone="Asia/Riyadh"
    />,
  );
}

const row = (name: string) => screen.getByRole('radiogroup', { name });
const option = (name: string, status: string) => within(row(name)).getByRole('radio', { name: status });

beforeEach(() => {
  vi.resetAllMocks();
  saveAttendance.mockResolvedValue({ ok: true, saved: 2 });
});

describe('AttendanceSegment', () => {
  it('is a radiogroup of four options, the first being the unmarked state', () => {
    render(<AttendanceSegment name="m" label="أحمد" value={null} onChange={() => {}} />);
    const group = screen.getByRole('radiogroup', { name: 'أحمد' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((r) => r.closest('label')?.textContent)).toEqual([
      t.status.unmarked,
      t.status.present,
      t.status.absent,
      t.status.excused,
    ]);
    expect(radios[0]).toBeChecked();
  });

  it('reports the picked status', async () => {
    const onChange = vi.fn();
    render(<AttendanceSegment name="m" label="أحمد" value={null} onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: t.status.excused }));
    expect(onChange).toHaveBeenCalledWith('excused');
  });

  it('cannot go back to unmarked once a mark is saved (removal is not offered)', () => {
    render(<AttendanceSegment name="m" label="أحمد" value="present" onChange={() => {}} locked />);
    expect(screen.getByRole('radio', { name: t.status.unmarked })).toBeDisabled();
    expect(screen.getByRole('radio', { name: t.status.present })).toBeChecked();
  });
});

describe('AttendanceGrid', () => {
  it('groups the members by section, one per group', () => {
    renderGrid();
    const first = screen.getByRole('region', { name: G1.name });
    const second = screen.getByRole('region', { name: G2.name });
    expect(within(first).getAllByRole('radiogroup').map((g) => g.getAttribute('aria-label'))).toEqual(['أحمد', 'خالد']);
    expect(within(second).getAllByRole('radiogroup').map((g) => g.getAttribute('aria-label'))).toEqual(['بلال']);
  });

  it('a supervisor sees no shared-session section outside their groups', () => {
    renderGrid({ groups: [G2] });
    expect(screen.queryByRole('region', { name: G1.name })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: G2.name })).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'أحمد' })).not.toBeInTheDocument();
  });

  it('«الكل حاضر» marks every member of its own section only', async () => {
    renderGrid();
    await userEvent.click(within(screen.getByRole('region', { name: G1.name })).getByRole('button', { name: t.allPresent }));
    expect(option('أحمد', t.status.present)).toBeChecked();
    expect(option('خالد', t.status.present)).toBeChecked();
    expect(option('بلال', t.status.unmarked)).toBeChecked();
  });

  it('submits only the rows that have a status, then shows the saved notice', async () => {
    renderGrid();
    await userEvent.click(within(screen.getByRole('region', { name: G1.name })).getByRole('button', { name: t.allPresent }));
    await userEvent.click(option('أحمد', t.status.absent));
    await userEvent.click(screen.getByRole('button', { name: t.save }));
    await waitFor(() =>
      expect(saveAttendance).toHaveBeenCalledWith('s1', [
        { userId: 'u1', status: 'absent' },
        { userId: 'u2', status: 'present' },
      ]),
    );
    expect(await screen.findByText(t.saved)).toBeInTheDocument();
  });

  it('pre-fills saved marks, locks them against removal and shows the last save', () => {
    renderGrid({ marks: [{ userId: 'u3', status: 'excused', recordedAt: '2026-11-27T10:05:00Z' }] });
    expect(option('بلال', t.status.excused)).toBeChecked();
    expect(option('بلال', t.status.unmarked)).toBeDisabled();
    expect(screen.getByText(t.lastSaved('27 نوفمبر 2026', '13:05'))).toBeInTheDocument();
  });

  it('shows the error of a refused save', async () => {
    saveAttendance.mockResolvedValue({ ok: false, code: 'FORBIDDEN' });
    renderGrid({ groups: [G2] });
    await userEvent.click(option('بلال', t.status.present));
    await userEvent.click(screen.getByRole('button', { name: t.save }));
    expect(await screen.findByRole('alert')).toHaveTextContent(t.errors.FORBIDDEN);
  });

  it('sends only new or changed rows: saved marks nobody touched are left as they were', async () => {
    renderGrid({
      marks: [
        { userId: 'u1', status: 'present', recordedAt: '2026-11-27T10:05:00Z' },
        { userId: 'u3', status: 'excused', recordedAt: '2026-11-27T10:05:00Z' },
      ],
    });
    // Nothing changed yet: nothing to save.
    expect(screen.getByRole('button', { name: t.save })).toBeDisabled();
    await userEvent.click(option('أحمد', t.status.absent));
    await userEvent.click(screen.getByRole('button', { name: t.save }));
    await waitFor(() => expect(saveAttendance).toHaveBeenCalledWith('s1', [{ userId: 'u1', status: 'absent' }]));
  });

  it('a mark changed back to its saved status is not sent', async () => {
    renderGrid({ marks: [{ userId: 'u1', status: 'present', recordedAt: '2026-11-27T10:05:00Z' }] });
    await userEvent.click(option('أحمد', t.status.absent));
    await userEvent.click(option('أحمد', t.status.present));
    expect(screen.getByRole('button', { name: t.save })).toBeDisabled();
  });

  it('«الكل حاضر» marks only the rows without a status, keeping saved and draft marks', async () => {
    renderGrid({ groups: [G1], marks: [{ userId: 'u1', status: 'absent', recordedAt: '2026-11-27T10:05:00Z' }] });
    const region = screen.getByRole('region', { name: G1.name });
    expect(within(region).getByText(t.allPresentHint)).toBeInTheDocument();
    await userEvent.click(within(region).getByRole('button', { name: t.allPresent }));
    expect(option('أحمد', t.status.absent)).toBeChecked();
    expect(option('خالد', t.status.present)).toBeChecked();
    await userEvent.click(option('خالد', t.status.excused));
    await userEvent.click(within(region).getByRole('button', { name: t.allPresent }));
    expect(option('خالد', t.status.excused)).toBeChecked();
  });

  it('disables «حفظ» while no row has a status', () => {
    renderGrid();
    expect(screen.getByRole('button', { name: t.save })).toBeDisabled();
  });
});
