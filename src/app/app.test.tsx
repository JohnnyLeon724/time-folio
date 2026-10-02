import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { Workspace } from '../services/types';
import App from './app';

const mock = vi.hoisted(() => ({ confirmed: false, command: vi.fn() }));
vi.mock('../services/client', () => ({ desktop: true, command: mock.command }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock('./workspace-layout', () => ({
  WorkspaceLayout: ({
    children,
    onPage,
  }: {
    children: ReactNode;
    onPage: (page: string) => void;
  }) => (
    <>
      <button onClick={() => onPage('workspace')}>工作日历</button>
      {children}
    </>
  ),
}));
vi.mock('../features/calendar/work-calendar', () => ({ WorkCalendar: () => null }));
vi.mock('../features/settings/settings-page', () => ({
  SettingsPage: ({ onChanged }: { onChanged: () => void }) => (
    <button
      onClick={() => {
        mock.confirmed = true;
        onChanged();
      }}
    >
      完成时区确认
    </button>
  ),
}));

it('preserves the task draft through first-use timezone setup and enables start afterward', async () => {
  mock.confirmed = false;
  mock.command.mockImplementation(async (op: string) => {
    if (op === 'get_workspace')
      return {
        settings: {
          confirmed: mock.confirmed,
          reportingTimeZone: 'Asia/Shanghai',
          weekStartsOn: 1,
        },
        entries: [],
        timer: {
          activeEntry: null,
          closedDurationMs: 0,
          serverNow: Date.now(),
          workspaceRevision: 'v',
          storageError: null,
        },
      } satisfies Workspace;
    if (op === 'get_month_report') return { durationMs: 0, workedDayCount: 0 };
    throw new Error(`Unexpected command: ${op}`);
  });
  render(<App />);
  await screen.findByRole('button', { name: '完成时区确认' });
  fireEvent.click(screen.getByRole('button', { name: '工作日历' }));
  fireEvent.change(screen.getByLabelText('任务标题'), { target: { value: '完成计时功能' } });
  expect(screen.getByRole('button', { name: '开始工作' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '前往确认时区' }));
  fireEvent.click(screen.getByRole('button', { name: '完成时区确认' }));
  await waitFor(() => expect(screen.getByRole('button', { name: '开始工作' })).toBeEnabled());
  expect(screen.getByLabelText('任务标题')).toHaveValue('完成计时功能');
});
