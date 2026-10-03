import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { WorkCalendar } from './work-calendar';
import type { Entry } from '../../services/types';
import { useState } from 'react';

const entry: Entry = {
  id: 'entry',
  title: '设计核对',
  note: null,
  source: 'timer',
  status: 'completed',
  version: 1,
  createdAt: Date.parse('2026-09-15T01:00:00Z'),
  updatedAt: Date.parse('2026-09-15T09:00:00Z'),
  deletedAt: null,
  segments: [
    {
      id: 'morning',
      entryId: 'entry',
      startAt: Date.parse('2026-09-15T01:00:00Z'),
      endAt: Date.parse('2026-09-15T04:00:00Z'),
    },
  ],
  reviewItems: [],
};
const props = {
  month: '2026-10',
  onMonth: vi.fn(),
  entries: [entry],
  zone: 'Asia/Shanghai',
  onEdit: vi.fn(),
  onCreate: vi.fn(),
};
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

it('shows an empty agenda when records exist only in another month', () => {
  render(<WorkCalendar {...props} />);
  fireEvent.click(screen.getByRole('radio', { name: '列表' }));
  expect(screen.getByText('这个时间范围没有时间记录')).toBeInTheDocument();
});

it('today in week view selects the current week rather than the first week', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-21T02:00:00Z'));
  render(<WorkCalendar {...props} entries={[]} />);
  fireEvent.click(screen.getByRole('radio', { name: '周' }));
  fireEvent.click(screen.getByRole('button', { name: '今天' }));
  expect(screen.getByText(/10月19日.*10月25日/)).toBeInTheDocument();
});

it('keeps continuous weeks when navigating across a month boundary', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-28T02:00:00Z'));
  function Controlled() {
    const [month, onMonth] = useState('2026-10');
    return <WorkCalendar {...props} month={month} onMonth={onMonth} entries={[]} />;
  }
  render(<Controlled />);
  fireEvent.click(screen.getByRole('radio', { name: '周' }));
  fireEvent.click(screen.getByRole('button', { name: '下一页' }));
  expect(screen.getByText(/11月2日.*11月8日/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '上一页' }));
  expect(screen.getByText(/10月26日.*11月1日/)).toBeInTheDocument();
});

it('opens the owning entry from either separated work segment', () => {
  const split = {
    ...entry,
    segments: [
      ...entry.segments,
      {
        ...entry.segments[0],
        id: 'afternoon',
        startAt: Date.parse('2026-09-15T05:30:00Z'),
        endAt: Date.parse('2026-09-15T09:00:00Z'),
      },
    ],
  };
  render(<WorkCalendar {...props} month="2026-09" entries={[split]} />);
  const events = screen.getAllByRole('button', { name: /设计核对/ });
  expect(events).toHaveLength(2);
  fireEvent.click(events[1]);
  expect(props.onEdit).toHaveBeenCalledWith('entry');
  expect(props.onCreate).not.toHaveBeenCalled();
});

it('creates on the clicked calendar date in the reporting zone', () => {
  render(<WorkCalendar {...props} entries={[]} zone="America/Los_Angeles" />);
  fireEvent.click(screen.getByRole('gridcell', { name: '2026年10月15日 星期四' }));
  expect(props.onCreate).toHaveBeenCalledWith('2026-10-15');
});
