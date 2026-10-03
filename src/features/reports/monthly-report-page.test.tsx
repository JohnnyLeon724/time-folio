import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { expect, it, vi, beforeEach, afterEach } from 'vitest';
import { MonthlyReport } from './monthly-report-page';
import type { Report } from '@/services/types';
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 640,
    height: 256,
    top: 0,
    left: 0,
    right: 640,
    bottom: 256,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
});
afterEach(() => vi.restoreAllMocks());

it('makes the whole-month export scope explicit even when details are filtered', () => {
  const onExport = vi.fn();
  render(<MonthlyReport report={report} onExport={onExport} onEdit={vi.fn()} onReview={vi.fn()} />);
  fireEvent.change(screen.getByRole('textbox', { name: '搜索任务' }), {
    target: { value: '开发' },
  });
  expect(screen.getByText('导出范围：2026-10 整月 · 2 个时段')).toBeInTheDocument();
  expect(screen.getByText('搜索和日期筛选仅影响明细，不影响整月导出。')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '导出整月' }));
  expect(onExport).toHaveBeenCalledOnce();
});

const report: Report = {
  month: '2026-10',
  reportingTimeZone: 'Asia/Shanghai',
  durationMs: 7200000,
  workedDayCount: 2,
  pendingCount: 1,
  activeCount: 0,
  days: [
    { date: '2026-10-03', durationMs: 3600000 },
    { date: '2026-10-04', durationMs: 3600000 },
  ],
  rows: ['2026-10-03', '2026-10-04'].map((workDate, i) => ({
    entryId: String(i),
    title: i ? '文档' : '开发',
    workDate,
    startAt: Date.parse(`${workDate}T09:00:00+08:00`),
    endAt: Date.parse(`${workDate}T10:00:00+08:00`),
    durationMs: 3600000,
    note: null,
  })),
};

it('combines date and task filters, expands the day and clears dates when changing month', async () => {
  const props = { onExport: vi.fn(), onEdit: vi.fn(), onReview: vi.fn() };
  const { rerender } = render(<MonthlyReport report={report} {...props} />);
  fireEvent.change(screen.getByLabelText('筛选明细日期'), { target: { value: '2026-10-03' } });
  expect(await screen.findByRole('button', { name: '开发' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '展开 2026-10-04' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: '搜索任务' }), {
    target: { value: '文档' },
  });
  expect(screen.getByText('没有匹配的记录')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '清除日期筛选' }));
  expect(screen.getByRole('button', { name: '展开 2026-10-04' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '查看待核对记录' }));
  expect(props.onReview).toHaveBeenCalledOnce();
  rerender(
    <MonthlyReport report={{ ...report, month: '2026-11', rows: [], days: [] }} {...props} />,
  );
  await waitFor(() => expect(screen.getByLabelText('筛选明细日期')).toHaveValue(''));
  expect(screen.getByRole('textbox', { name: '搜索任务' })).toHaveValue('');
});

it('selects a day by clicking its bar and resets the table page', async () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({
    ...report.rows[0],
    workDate: `2026-10-${String(i + 1).padStart(2, '0')}`,
  }));
  const { container } = render(
    <MonthlyReport
      report={{
        ...report,
        rows,
        days: rows.map((row) => ({ date: row.workDate, durationMs: row.durationMs })),
      }}
      onExport={vi.fn()}
      onEdit={vi.fn()}
      onReview={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: '下一页' }));
  expect(screen.getByText('第 2 / 2 页')).toBeInTheDocument();
  const bar = container.querySelector('.recharts-bar-rectangle path');
  expect(bar).not.toBeNull();
  fireEvent.click(bar!);
  expect(await screen.findByRole('button', { name: '开发' })).toBeInTheDocument();
  expect(screen.getByText('第 1 / 1 页')).toBeInTheDocument();
  expect(screen.getByLabelText('筛选明细日期')).toHaveValue('2026-10-01');
});

it('shows a complete week with record drilldown and no monthly export', () => {
  const onEdit = vi.fn();
  const week = { ...report, weekStart: '2026-09-28', weekEnd: '2026-10-04' };
  render(<MonthlyReport report={week} onEdit={onEdit} onReview={vi.fn()} />);
  expect(screen.getByRole('heading', { name: '周度报告' })).toBeInTheDocument();
  expect(screen.getByText(/2026-09-28 至 2026-10-04/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '导出整月' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('筛选明细日期'), { target: { value: '2026-10-03' } });
  fireEvent.click(screen.getByRole('button', { name: '开发' }));
  expect(onEdit).toHaveBeenCalledWith('0');
});
