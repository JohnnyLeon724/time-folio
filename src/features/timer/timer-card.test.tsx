import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TimerCard } from './timer-card';
describe('TimerCard', () => {
  it('explains the unconfirmed timezone and provides a setup action', () => {
    const onConfigure = vi.fn();
    const onAction = vi.fn();
    render(
      <TimerCard
        state={{
          activeEntry: null,
          closedDurationMs: 0,
          serverNow: 0,
          workspaceRevision: 'v',
          storageError: null,
        }}
        enabled={false}
        onAction={onAction}
        onConfigure={onConfigure}
      />,
    );
    fireEvent.change(screen.getByLabelText('任务标题'), { target: { value: '开发登录页' } });
    expect(screen.getByRole('button', { name: '开始工作' })).toBeDisabled();
    expect(screen.getByText('首次使用，请先确认统计时区')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '前往确认时区' }));
    expect(onConfigure).toHaveBeenCalledOnce();
    expect(onAction).not.toHaveBeenCalled();
  });
  it('retains a title after a failed start', async () => {
    const onAction = vi.fn().mockRejectedValue({ message: '磁盘不可写' });
    render(
      <TimerCard
        state={{
          activeEntry: null,
          closedDurationMs: 0,
          serverNow: 0,
          workspaceRevision: 'v',
          storageError: null,
        }}
        enabled
        onAction={onAction}
      />,
    );
    fireEvent.change(screen.getByLabelText('任务标题'), { target: { value: '开发登录页' } });
    fireEvent.click(screen.getByRole('button', { name: '开始工作' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('磁盘不可写'));
    expect(screen.getByLabelText('任务标题')).toHaveValue('开发登录页');
  });
  it('does not submit on IME composition enter', () => {
    const onAction = vi.fn();
    render(
      <TimerCard
        state={{
          activeEntry: null,
          closedDurationMs: 0,
          serverNow: 0,
          workspaceRevision: 'v',
          storageError: null,
        }}
        enabled
        onAction={onAction}
      />,
    );
    const input = screen.getByLabelText('任务标题');
    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(onAction).not.toHaveBeenCalled();
  });
});
