import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import type { Report } from '../../services/types';
import { summarizeTitles, TitleSummary } from './title-summary';

function row(
  entryId: string,
  title: string,
  date = '2026-10-01',
  durationMs = 1800000,
): Report['rows'][number] {
  const startAt = Date.parse(`${date}T09:00:00+08:00`);
  return {
    entryId,
    title,
    workDate: date,
    startAt,
    endAt: startAt + durationMs,
    durationMs,
    note: null,
  };
}

it('aggregates exact trimmed titles, counts original records once, and preserves total milliseconds', () => {
  const rows = [
    row('a', ' 阅读 '),
    row('a', ' 阅读 ', '2026-10-02', 1800123),
    row('b', '阅读'),
    row('c', 'Read'),
    row('d', 'read'),
  ];
  const groups = summarizeTitles(rows);
  expect(groups.map((group) => group.title)).toContain('Read');
  expect(groups.map((group) => group.title)).toContain('read');
  expect(groups).toHaveLength(3);
  expect(groups[0].title).toBe('阅读');
  expect(groups[0].durationMs).toBe(5400123);
  expect(groups[0].records).toHaveLength(2);
  expect(groups[0].records.find((record) => record.entryId === 'a')?.durationMs).toBe(3600123);
  expect(groups.reduce((total, group) => total + group.durationMs, 0)).toBe(
    rows.reduce((total, row) => total + row.durationMs, 0),
  );
  expect(rows[0].title).toBe(' 阅读 ');
});

it('supports keyboard expansion and opens original records separately', async () => {
  const user = userEvent.setup();
  const onEdit = vi.fn();
  render(
    <TitleSummary
      rows={[row('a', '阅读'), row('a', '阅读', '2026-10-02'), row('b', '阅读')]}
      zone="Asia/Shanghai"
      onEdit={onEdit}
    />,
  );
  const toggle = screen.getByRole('button', { name: '展开标题汇总 阅读' });
  toggle.focus();
  await user.keyboard(' ');
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByText('2 条记录')).toBeInTheDocument();
  const records = screen.getAllByRole('button', { name: /查看原记录/ });
  expect(records).toHaveLength(2);
  await user.click(records[0]);
  expect(onEdit).toHaveBeenCalledWith('a');
  expect(screen.getByText('01:30:00')).toBeInTheDocument();
});

it('limits visible titles, searches all groups, resets pagination, and handles no matches', () => {
  const rows = Array.from({ length: 12 }, (_, i) =>
    row(String(i), `标题${String(i).padStart(2, '0')}`),
  );
  render(<TitleSummary rows={rows} zone="Asia/Shanghai" onEdit={vi.fn()} />);
  expect(screen.getAllByRole('button', { name: /展开标题汇总/ })).toHaveLength(8);
  fireEvent.click(screen.getByRole('button', { name: '下一页标题' }));
  expect(screen.getAllByRole('button', { name: /展开标题汇总/ })).toHaveLength(4);
  fireEvent.change(screen.getByRole('textbox', { name: '搜索汇总标题' }), {
    target: { value: '标题00' },
  });
  expect(screen.getByRole('button', { name: '展开标题汇总 标题00' })).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: '搜索汇总标题' }), {
    target: { value: '不存在' },
  });
  expect(screen.getByText('没有匹配的标题')).toBeInTheDocument();
});

it('shows a truthful empty state for periods without confirmed records', () => {
  render(<TitleSummary rows={[]} zone="Asia/Shanghai" onEdit={vi.fn()} />);
  expect(screen.getByText('所选期间还没有已确认记录')).toBeInTheDocument();
});

it('paginates original records and reflects updated report totals', () => {
  const rows = Array.from({ length: 10 }, (_, i) => row(String(i), '阅读'));
  const props = { zone: 'Asia/Shanghai', onEdit: vi.fn() };
  const { rerender } = render(<TitleSummary rows={rows} {...props} />);
  fireEvent.click(screen.getByRole('button', { name: '展开标题汇总 阅读' }));
  expect(screen.getAllByRole('button', { name: /查看原记录/ })).toHaveLength(8);
  fireEvent.click(screen.getByRole('button', { name: '下一页原记录' }));
  expect(screen.getAllByRole('button', { name: /查看原记录/ })).toHaveLength(2);
  rerender(<TitleSummary rows={rows.slice(0, 1)} {...props} />);
  expect(screen.getAllByRole('button', { name: /查看原记录/ })).toHaveLength(1);
  expect(screen.getByText('1 条记录')).toBeInTheDocument();
});
