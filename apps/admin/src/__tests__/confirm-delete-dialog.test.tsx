import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const deleteStudent = vi.fn();
vi.mock('@/actions/students', () => ({ deleteStudent: (...a: unknown[]) => deleteStudent(...a) }));

import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { Button } from '@/components/ui/button';
import { ar } from '@/messages/ar';

const t = ar.deleteAccount;
// Fixture data only (AGENTS.md §3).
const NAME = 'أحمد بن محمد';
const ID = '99999999-9999-4999-8999-999999999991';

async function openDialog(from: 'student' | 'support' = 'support') {
  render(<ConfirmDeleteDialog studentId={ID} studentName={NAME} from={from} trigger={<Button>افتح</Button>} />);
  await userEvent.click(screen.getByRole('button', { name: 'افتح' }));
  return screen.getByRole('dialog', { name: t.title(NAME) });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('ConfirmDeleteDialog (double confirmation)', () => {
  it('names the student and lists everything that is removed', async () => {
    const dialog = await openDialog();
    const removed = within(dialog).getAllByRole('listitem').map((item) => item.textContent);
    expect(removed).toEqual(['الحساب', 'السجلّات', 'الحضور', 'طلبات الدعم']);
    expect(within(dialog).getByLabelText(t.typeName(NAME))).toBeInTheDocument();
  });

  it('keeps «حذف نهائي» disabled until the exact full name is typed', async () => {
    const dialog = await openDialog();
    const confirm = within(dialog).getByRole('button', { name: t.confirm });
    const field = within(dialog).getByLabelText(t.typeName(NAME));
    expect(confirm).toBeDisabled();

    await userEvent.type(field, 'أحمد');
    expect(confirm).toBeDisabled();

    await userEvent.clear(field);
    await userEvent.type(field, `  ${NAME} `);
    expect(confirm).toBeEnabled();
  });

  it('places «حذف نهائي» last, after «إلغاء»', async () => {
    const dialog = await openDialog();
    const buttons = within(dialog).getAllByRole('button').map((button) => button.textContent);
    expect(buttons.slice(-2)).toEqual([t.cancel, t.confirm]);
  });

  it('deletes once with the context it was given', async () => {
    deleteStudent.mockResolvedValue({ ok: true });
    const dialog = await openDialog('support');
    await userEvent.type(within(dialog).getByLabelText(t.typeName(NAME)), NAME);
    await userEvent.click(within(dialog).getByRole('button', { name: t.confirm }));
    expect(deleteStudent).toHaveBeenCalledTimes(1);
    expect(deleteStudent).toHaveBeenCalledWith(ID, 'support');
    // The support context returns instead of redirecting: the dialog closes.
    expect(await screen.findByRole('button', { name: 'افتح' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows a mapped FORBIDDEN inside the dialog and stays open', async () => {
    deleteStudent.mockResolvedValue({ ok: false, code: 'FORBIDDEN' });
    const dialog = await openDialog('student');
    await userEvent.type(within(dialog).getByLabelText(t.typeName(NAME)), NAME);
    await userEvent.click(within(dialog).getByRole('button', { name: t.confirm }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(ar.students.errors.FORBIDDEN);
    expect(deleteStudent).toHaveBeenCalledWith(ID, 'student');
  });

  it('Esc cancels without deleting and forgets the typed name', async () => {
    const dialog = await openDialog();
    await userEvent.type(within(dialog).getByLabelText(t.typeName(NAME)), NAME);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(deleteStudent).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'افتح' }));
    const reopened = screen.getByRole('dialog', { name: t.title(NAME) });
    expect(within(reopened).getByLabelText(t.typeName(NAME))).toHaveValue('');
    expect(within(reopened).getByRole('button', { name: t.confirm })).toBeDisabled();
  });

  it('ignores Esc while the delete is running', async () => {
    let finish: (value: unknown) => void = () => {};
    deleteStudent.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const dialog = await openDialog();
    await userEvent.type(within(dialog).getByLabelText(t.typeName(NAME)), NAME);
    await userEvent.click(within(dialog).getByRole('button', { name: t.confirm }));
    expect(await within(dialog).findByRole('button', { name: t.deleting })).toBeDisabled();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: t.title(NAME) })).toBeInTheDocument();
    finish({ ok: false, code: 'DELETE_FAILED' });
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(ar.students.errors.DELETE_FAILED);
  });

  it('with no name on record, asks for the phrase «حذف نهائي» instead', async () => {
    deleteStudent.mockResolvedValue({ ok: true });
    render(<ConfirmDeleteDialog studentId={ID} studentName={null} from="support" trigger={<Button>افتح</Button>} />);
    await userEvent.click(screen.getByRole('button', { name: 'افتح' }));
    const dialog = screen.getByRole('dialog', { name: t.titleUnnamed });
    const field = within(dialog).getByLabelText(t.typePhrase(t.confirmPhrase));
    const confirm = within(dialog).getByRole('button', { name: t.confirm });
    await userEvent.type(field, 'طالب');
    expect(confirm).toBeDisabled();
    await userEvent.clear(field);
    await userEvent.type(field, t.confirmPhrase);
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    expect(deleteStudent).toHaveBeenCalledWith(ID, 'support');
  });

  it('«إلغاء» closes the dialog', async () => {
    const dialog = await openDialog();
    await userEvent.click(within(dialog).getByRole('button', { name: t.cancel }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
