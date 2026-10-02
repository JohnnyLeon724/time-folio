import { render, screen, fireEvent, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { WorkDetailsTable } from './work-details-table';
import type { Report } from '@/services/types';

const start = Date.parse('2026-10-03T01:00:00Z');
const rows: Report['rows'] = [
  {
    entryId: 'a',
    title: '开发',
    workDate: '2026-10-03',
    startAt: start,
    endAt: start + 3600000,
    durationMs: 3600000,
    note: null,
  },
  {
    entryId: 'a',
    title: '开发',
    workDate: '2026-10-03',
    startAt: start + 7200000,
    endAt: start + 10800000,
    durationMs: 3600000,
    note: null,
  },
  {
    entryId: 'b',
    title: '文档',
    workDate: '2026-10-04',
    startAt: start + 86400000,
    endAt: start + 90000000,
    durationMs: 3600000,
    note: null,
  },
];

it('summarizes a day without counting breaks and expands each interval for editing', () => {
  const edit = vi.fn();
  render(<WorkDetailsTable rows={rows} zone="Asia/Shanghai" onEdit={edit} />);
  expect(screen.queryByRole('button', { name: '开发' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '展开 2026-10-03' }));
  const periods = screen.getAllByRole('button', { name: '开发' });
  expect(periods).toHaveLength(2);
  expect(screen.getByText('02:00:00')).toBeInTheDocument();
  fireEvent.click(periods[1]);
  expect(edit).toHaveBeenCalledWith('a');
});

it('filters tasks and recalculates the visible daily total', () => {
  render(
    <WorkDetailsTable
      rows={[...rows, { ...rows[2], workDate: '2026-10-03' }]}
      zone="Asia/Shanghai"
      onEdit={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByRole('textbox', { name: '搜索任务' }), {
    target: { value: '开发' },
  });
  expect(screen.queryByRole('button', { name: '展开 2026-10-04' })).not.toBeInTheDocument();
  expect(screen.getByText('02:00:00')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: '搜索任务' }), {
    target: { value: '不存在' },
  });
  expect(screen.getByText('没有匹配的记录')).toBeInTheDocument();
});

it('paginates days, keeping all expanded intervals on the same page', () => {
  const many = Array.from({ length: 12 }, (_, i) => ({
    ...rows[0],
    workDate: `2026-10-${String(i + 1).padStart(2, '0')}`,
  }));
  render(<WorkDetailsTable rows={many} zone="Asia/Shanghai" onEdit={vi.fn()} />);
  expect(screen.getByText('第 1 / 2 页')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '下一页' }));
  expect(screen.getByText('第 2 / 2 页')).toBeInTheDocument();
  expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(3);
});
