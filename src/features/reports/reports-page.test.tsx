import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { ReportsPage } from './reports-page';
import { command } from '../../services/client';
vi.mock('../../services/client', () => ({ command: vi.fn() }));
vi.mock('./monthly-report-page', () => ({
  MonthlyReport: ({ report }: any) => <div>{report.weekStart ?? report.month}</div>,
}));
it('switches periods, navigates full weeks, retries failures and keeps month selection', async () => {
  const user = userEvent.setup();
  vi.mocked(command).mockImplementation(
    async (_op, input: any) => ({ weekStart: input.date }) as any,
  );
  const onMonthChange = vi.fn();
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ReportsPage
        month="2026-10"
        onMonthChange={onMonthChange}
        zone="Asia/Shanghai"
        weekStartsOn={1}
        revision="v"
        onEdit={vi.fn()}
        onReview={vi.fn()}
        onExport={vi.fn()}
      />
    </QueryClientProvider>,
  );
  await user.click(screen.getByRole('tab', { name: '周报' }));
  fireEvent.change(screen.getByLabelText('周内日期'), { target: { value: '2026-10-01' } });
  await waitFor(() =>
    expect(command).toHaveBeenCalledWith('get_week_report', { date: '2026-10-01' }),
  );
  await user.click(screen.getByRole('button', { name: '下一周' }));
  await waitFor(() =>
    expect(command).toHaveBeenCalledWith('get_week_report', { date: '2026-10-08' }),
  );
  vi.mocked(command).mockRejectedValueOnce({ message: '读取失败' });
  await user.click(screen.getByRole('button', { name: '上一周' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('读取失败');
  await user.click(screen.getByRole('button', { name: '重试周报' }));
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  await user.click(screen.getByRole('tab', { name: '月报' }));
  expect(onMonthChange).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: '下一周' })).not.toBeInTheDocument();
});
