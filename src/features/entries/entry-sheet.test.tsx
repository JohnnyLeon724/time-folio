import { render, screen, fireEvent, within } from '@testing-library/react';
import { it, expect, vi } from 'vitest';
import { EntrySheet } from './entry-sheet';
import type { Entry } from '../../services/types';
import { command } from '../../services/client';
vi.mock('../../services/client', () => ({ command: vi.fn().mockResolvedValue(0) }));
it('removes the automatically included interval when exclusion is selected', () => {
  const e: Entry = {
    id: 'e',
    title: 'test',
    note: null,
    source: 'timer',
    status: 'needs_review',
    version: 1,
    createdAt: 1800000000000,
    updatedAt: 1800000000000,
    deletedAt: null,
    segments: [],
    reviewItems: [
      {
        id: 'r',
        entryId: 'e',
        reason: 'sleep',
        candidateStartAt: 1800000000000,
        candidateEndAt: 1800000060000,
        boundaryQuality: 'observed',
        resolution: 'unresolved',
        resolvedAt: null,
      },
    ],
  };
  render(
    <EntrySheet
      entry={e}
      date="2027-01-15"
      zone="Etc/UTC"
      revision="v"
      onClose={vi.fn()}
      onSaved={vi.fn()}
      hasActive={false}
    />,
  );
  const select = screen.getByLabelText('中断时间处理');
  fireEvent.change(select, { target: { value: 'included' } });
  expect(screen.getByLabelText('时段 1 开始')).toBeInTheDocument();
  fireEvent.change(select, { target: { value: 'excluded' } });
  expect(screen.queryByLabelText('时段 1 开始')).not.toBeInTheDocument();
});

it('shows deletion failure inside the confirmation without closing the record', async () => {
  const onSaved = vi.fn();
  const entry: Entry = {
    id: 'delete-test',
    title: '保留记录',
    note: null,
    source: 'manual',
    status: 'completed',
    version: 1,
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    segments: [],
    reviewItems: [],
  };
  vi.mocked(command).mockRejectedValueOnce({ code: 'STORAGE', message: '保存失败，请重试。' });
  render(
    <EntrySheet
      entry={entry}
      date="2026-10-03"
      zone="Etc/UTC"
      revision="v"
      onClose={vi.fn()}
      onSaved={onSaved}
      hasActive={false}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: '删除' }));
  const dialog = screen.getByRole('alertdialog');
  expect(within(dialog).getByRole('button', { name: '取消' })).toHaveFocus();
  fireEvent.click(within(dialog).getByRole('button', { name: '确认删除' }));
  expect(await within(dialog).findByText('保存失败，请重试。')).toBeInTheDocument();
  expect(onSaved).not.toHaveBeenCalled();
});
