import { it, expect } from 'vitest';
import { toCalendarEvents } from './calendar-adapter';
import type { Entry } from '../../services/types';
it('preserves lunch gap and parent IDs', () => {
  const e = {
    id: 'e',
    title: '登录',
    status: 'completed',
    deletedAt: null,
    segments: [
      { id: 'a', entryId: 'e', startAt: 9, endAt: 12 },
      { id: 'b', entryId: 'e', startAt: 13, endAt: 18 },
    ],
  } as Entry;
  const events = toCalendarEvents([e], 20);
  expect(events.map((e) => [e.start, e.end])).toEqual([
    [9, 12],
    [13, 18],
  ]);
  expect(events.every((e) => e.entryId === 'e')).toBe(true);
});
