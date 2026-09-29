import { render, screen, fireEvent } from '@testing-library/react';
import { it, expect, vi } from 'vitest';
import { EntrySheet } from './entry-sheet';
import type { Entry } from '../../services/types';
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
