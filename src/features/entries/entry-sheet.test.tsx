import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { beforeEach, it, expect, vi } from 'vitest';
import { EntrySheet } from './entry-sheet';
import type { Entry } from '../../services/types';
import { command } from '../../services/client';
vi.mock('../../services/client', () => ({ command: vi.fn().mockResolvedValue(0) }));
beforeEach(() => {
  vi.mocked(command).mockReset().mockResolvedValue(0);
});

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

it('locates a conflict and lets the user inspect it without replacing the draft', async () => {
  openEditor();
  const other = { ...example, id: 'other', title: '同名任务', note: '已有记录备注' };
  vi.mocked(command).mockImplementation(async (op) => {
    if (op === 'save_entry')
      throw {
        code: 'OVERLAP',
        message: '时间重叠',
        details: {
          segmentId: 's1',
          entryId: 'other',
          title: '同名任务',
          startAt: example.segments[0].startAt,
          endAt: example.segments[0].endAt,
        },
      };
    if (op === 'get_workspace') return { entries: [other] };
    return 0;
  });
  fireEvent.change(screen.getByLabelText('任务标题'), { target: { value: '保留当前草稿' } });
  fireEvent.click(screen.getByRole('button', { name: '保存记录' }));
  const conflict = await screen.findByRole('alert', { name: '时段 1 时间冲突' });
  expect(conflict).toHaveTextContent('同名任务');
  expect(conflict).toHaveTextContent('2026-10-03 09:00:00');
  fireEvent.click(within(conflict).getByRole('button', { name: '查看冲突记录' }));
  const dialog = await screen.findByRole('dialog', { name: '冲突记录' });
  expect(await within(dialog).findByText('已有记录备注')).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: '返回编辑' }));
  expect(screen.getByLabelText('任务标题')).toHaveValue('保留当前草稿');
  fireEvent.click(screen.getByRole('button', { name: '移除时段 1' }));
  expect(screen.queryByRole('alert', { name: '时段 1 时间冲突' })).not.toBeInTheDocument();
});

it('keeps the draft when the conflicting record cannot be read and offers retry', async () => {
  openEditor();
  vi.mocked(command).mockImplementation(async (op) => {
    if (op === 'save_entry')
      throw {
        code: 'OVERLAP',
        message: '时间重叠',
        details: {
          segmentId: 's1',
          entryId: 'other',
          title: '已有任务',
          startAt: example.segments[0].startAt,
          endAt: null,
        },
      };
    throw { message: '读取失败' };
  });
  fireEvent.click(screen.getByRole('button', { name: '保存记录' }));
  fireEvent.click(await screen.findByRole('button', { name: '查看冲突记录' }));
  const dialog = screen.getByRole('dialog', { name: '冲突记录' });
  expect(await within(dialog).findByText('读取失败')).toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: '重试' })).toBeInTheDocument();
  vi.mocked(command).mockResolvedValue({
    entries: [{ ...example, id: 'other', title: '重试后读取的任务' }],
  });
  fireEvent.click(within(dialog).getByRole('button', { name: '重试' }));
  expect(await within(dialog).findByText('重试后读取的任务')).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: '返回编辑' }));
  expect(screen.getByLabelText('任务标题')).toHaveValue(example.title);
});

it('locates internal overlap and saves after removing the conflicting period', async () => {
  const entry = {
    ...example,
    segments: [...example.segments, { ...example.segments[0], id: 's2' }],
  };
  const { onSaved } = openEditor({ entry });
  vi.mocked(command).mockImplementation(async (op, input) => {
    if (op === 'save_entry') {
      const saved = (input as { entry: Entry }).entry;
      if (saved.segments.length > 1)
        throw {
          code: 'VALIDATION',
          message: '时段重叠',
          details: {
            segmentId: 's1',
            conflictingSegmentId: 's2',
            entryId: entry.id,
            title: entry.title,
            startAt: entry.segments[1].startAt,
            endAt: entry.segments[1].endAt,
          },
        };
      return { value: saved, workspaceRevision: 'next' };
    }
    return 0;
  });
  fireEvent.click(screen.getByRole('button', { name: '保存记录' }));
  const alert = await screen.findByRole('alert', { name: '时段 1 时间冲突' });
  expect(alert).toHaveTextContent('与本记录的时段 2 重叠');
  expect(screen.queryByRole('button', { name: '查看冲突记录' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '移除时段 2' }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '保存记录' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
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
