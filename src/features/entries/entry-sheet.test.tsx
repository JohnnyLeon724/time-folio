import { render, screen, fireEvent, within } from '@testing-library/react';
import { beforeEach, it, expect, vi } from 'vitest';
import { EntrySheet } from './entry-sheet';
import type { Entry } from '../../services/types';
import { command } from '../../services/client';
vi.mock('../../services/client', () => ({ command: vi.fn().mockResolvedValue(0) }));
beforeEach(() => vi.mocked(command).mockReset().mockResolvedValue(0));

const example: Entry = {
  id: 'draft',
  title: '开发',
  note: null,
  source: 'manual',
  status: 'completed',
  version: 1,
  createdAt: 0,
  updatedAt: 0,
  deletedAt: null,
  reviewItems: [],
  segments: [
    {
      id: 's1',
      entryId: 'draft',
      startAt: Date.parse('2026-10-03T01:00:00Z'),
      endAt: Date.parse('2026-10-03T02:00:00Z'),
    },
  ],
};
function openEditor(overrides: Partial<React.ComponentProps<typeof EntrySheet>> = {}) {
  const props = {
    entry: example,
    date: '2026-10-03',
    zone: 'Asia/Shanghai',
    revision: 'v',
    hasActive: false,
    onClose: vi.fn(),
    onSaved: vi.fn(),
    ...overrides,
  };
  render(<EntrySheet {...props} />);
  return props;
}

it('closes an unchanged editor without a confirmation', () => {
  const { onClose } = openEditor();
  fireEvent.click(screen.getByRole('button', { name: '取消' }));
  expect(onClose).toHaveBeenCalledOnce();
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
});

it('does not prompt after reverting a title edit', () => {
  const { onClose } = openEditor();
  fireEvent.change(screen.getByLabelText('任务标题'), { target: { value: '临时修改' } });
  fireEvent.change(screen.getByLabelText('任务标题'), { target: { value: example.title } });
  fireEvent.click(screen.getByRole('button', { name: '取消' }));
  expect(onClose).toHaveBeenCalledOnce();
});

it('protects a changed review choice without adding a period', () => {
  const { onClose } = openEditor({
    entry: {
      ...example,
      status: 'needs_review',
      reviewItems: [
        {
          id: 'r',
          entryId: example.id,
          reason: 'sleep',
          candidateStartAt: null,
          candidateEndAt: null,
          boundaryQuality: 'estimated',
          resolution: 'unresolved',
          resolvedAt: null,
        },
      ],
    },
  });
  fireEvent.change(screen.getByLabelText('中断时间处理'), { target: { value: 'excluded' } });
  fireEvent.click(screen.getByRole('button', { name: '稍后核对' }));
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '继续编辑' }));
  expect(screen.getByLabelText('中断时间处理')).toHaveValue('excluded');
});

it('keeps title changes after cancelling discard and closes only after explicit discard', () => {
  const { onClose } = openEditor();
  fireEvent.change(screen.getByLabelText('任务标题'), { target: { value: '尚未保存的标题' } });
  fireEvent.click(screen.getByRole('button', { name: '关闭' }));
  expect(onClose).not.toHaveBeenCalled();
  const dialog = screen.getByRole('alertdialog');
  expect(within(dialog).getByRole('button', { name: '继续编辑' })).toHaveFocus();
  fireEvent.click(within(dialog).getByRole('button', { name: '继续编辑' }));
  expect(screen.getByLabelText('任务标题')).toHaveValue('尚未保存的标题');
  fireEvent.click(screen.getByRole('button', { name: '取消' }));
  fireEvent.click(screen.getByRole('button', { name: '放弃修改' }));
  expect(onClose).toHaveBeenCalledOnce();
});

it('protects added periods when Escape closes the sheet', () => {
  const { onClose } = openEditor();
  fireEvent.click(screen.getByRole('button', { name: '添加时段' }));
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '继续编辑' }));
  expect(screen.getByLabelText('时段 2 开始')).toBeInTheDocument();
});

it('retains a failed save and prevents closing while a retry is pending', async () => {
  const { onClose, onSaved } = openEditor();
  vi.mocked(command).mockRejectedValueOnce({ code: 'STORAGE', message: '写入失败' });
  fireEvent.change(screen.getByLabelText('任务标题'), { target: { value: '重试草稿' } });
  fireEvent.click(screen.getByRole('button', { name: '保存记录' }));
  expect(await screen.findByText('写入失败')).toBeInTheDocument();
  expect(screen.getByLabelText('任务标题')).toHaveValue('重试草稿');
  let finish!: (value: unknown) => void;
  vi.mocked(command).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  fireEvent.click(screen.getByRole('button', { name: '保存记录' }));
  await screen.findByRole('button', { name: '保存中…' });
  fireEvent.click(screen.getByRole('button', { name: '关闭' }));
  expect(onClose).not.toHaveBeenCalled();
  finish({ value: { ...example, title: '重试草稿' }, workspaceRevision: 'next' });
  await screen.findByRole('button', { name: '保存记录' });
  expect(onSaved).toHaveBeenCalledOnce();
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
});
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
