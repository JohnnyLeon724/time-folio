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
    expect(screen.getByRole('button', { name: '开始计时' })).toBeDisabled();
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
    fireEvent.click(screen.getByRole('button', { name: '开始计时' }));
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

const idle = {
  activeEntry: null,
  closedDurationMs: 0,
  serverNow: 0,
  workspaceRevision: 'v',
  storageError: null,
};
const history = [{ id: 'old', title: '阅读', createdAt: 1, deletedAt: null }];
describe('recent task reuse', () => {
  it('selects with keyboard before starting a fresh editable title', async () => {
    const onAction = vi.fn().mockResolvedValue({});
    render(<TimerCard state={idle} enabled onAction={onAction} recentEntries={history} />);
    const input = screen.getByRole('combobox', { name: '任务标题' });
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input).toHaveValue('阅读');
    expect(onAction).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '阅读第二章' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() =>
      expect(onAction).toHaveBeenCalledWith('start_timer', { title: '阅读第二章' }),
    );
    expect(history[0].title).toBe('阅读');
  });
  it('supports pointer selection, escape and IME without starting', () => {
    const onAction = vi.fn();
    render(<TimerCard state={idle} enabled onAction={onAction} recentEntries={history} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(input).toHaveValue('');
    fireEvent.compositionEnd(input);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    fireEvent.focus(input);
    fireEvent.click(screen.getByRole('option', { name: '阅读' }));
    expect(input).toHaveValue('阅读');
    expect(onAction).not.toHaveBeenCalled();
  });
  it.each(['running', 'paused'] as const)('does not offer new tasks while %s', (status) => {
    const entry = {
      ...history[0],
      status,
      segments: [],
      note: null,
      source: 'timer' as const,
      version: 1,
      updatedAt: 1,
      reviewItems: [],
    };
    render(
      <TimerCard
        state={{ ...idle, activeEntry: entry }}
        enabled
        onAction={vi.fn()}
        recentEntries={history}
      />,
    );
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '开始计时' })).not.toBeInTheDocument();
  });
});
