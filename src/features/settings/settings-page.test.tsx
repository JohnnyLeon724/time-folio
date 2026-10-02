import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { SettingsPage } from './settings-page';
import { command } from '@/services/client';
import { save } from '@tauri-apps/plugin-dialog';
import type { Workspace } from '@/services/types';
vi.mock('@/services/client', () => ({ command: vi.fn() }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: vi.fn(), open: vi.fn() }));
const workspace: Workspace = {
  entries: [],
  settings: { confirmed: true, reportingTimeZone: 'Asia/Shanghai', weekStartsOn: 1 },
  timer: {
    activeEntry: null,
    closedDurationMs: 0,
    serverNow: 0,
    workspaceRevision: 'v',
    storageError: null,
  },
};
const snapshot = { id: 's1', path: 'snapshot.db', kind: 'automatic', createdAt: 1790960400000 };
beforeEach(() => {
  vi.mocked(command).mockReset();
  vi.mocked(save).mockReset();
});
function openSettings() {
  const props = { workspace, onChanged: vi.fn(), notify: vi.fn() };
  render(<SettingsPage {...props} />);
  fireEvent.mouseDown(screen.getByRole('tab', { name: '备份与数据' }), {
    button: 0,
    ctrlKey: false,
  });
  return props;
}

it('distinguishes pending, failed and empty snapshots and supports retry', async () => {
  let reject!: (error: unknown) => void;
  vi.mocked(command).mockReturnValueOnce(
    new Promise((_, no) => {
      reject = no;
    }),
  );
  openSettings();
  expect(screen.getByText('正在读取快照…')).toBeInTheDocument();
  reject({ message: '目录无法读取' });
  expect(await screen.findByText('目录无法读取')).toBeInTheDocument();
  expect(screen.queryByText('暂无本地快照')).not.toBeInTheDocument();
  vi.mocked(command).mockResolvedValue([]);
  fireEvent.click(screen.getByRole('button', { name: '重试读取快照' }));
  expect(await screen.findByText('暂无本地快照')).toBeInTheDocument();
});

it('refreshes after creating and deleting a snapshot', async () => {
  let list: (typeof snapshot)[] = [];
  vi.mocked(command).mockImplementation(async (op) => {
    if (op === 'create_local_snapshot') {
      list = [snapshot];
      return snapshot;
    }
    if (op === 'delete_local_snapshot') {
      list = [];
      return null;
    }
    return list;
  });
  openSettings();
  await screen.findByText('暂无本地快照');
  fireEvent.click(screen.getByRole('button', { name: '立即创建' }));
  expect(await screen.findByText(/最近本地快照：/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '删除快照' }));
  const buttons = screen.getAllByRole('button', { name: '删除快照' });
  fireEvent.click(buttons.at(-1)!);
  expect(await screen.findByText('暂无本地快照')).toBeInTheDocument();
});

it('only updates the last successful external export after the backend succeeds', async () => {
  vi.mocked(command).mockImplementation(async (op) =>
    op === 'export_backup' ? { exportedAt: snapshot.createdAt } : [],
  );
  vi.mocked(save).mockResolvedValue('backup.timefolio.json');
  const props = openSettings();
  fireEvent.click(screen.getByRole('button', { name: '选择保存位置' }));
  await waitFor(() => expect(props.notify).toHaveBeenCalledOnce());
  const successText = screen.getByText(/最近成功导出：/).textContent;
  vi.mocked(command).mockImplementation(async (op) => {
    if (op === 'export_backup') throw { message: '写入失败' };
    return [];
  });
  fireEvent.click(screen.getByRole('button', { name: '选择保存位置' }));
  expect(await screen.findByText('写入失败')).toBeInTheDocument();
  expect(screen.getByText(/最近成功导出：/).textContent).toBe(successText);
  expect(props.notify).toHaveBeenCalledOnce();
});

it('reports a successful creation separately from a failed list refresh', async () => {
  let created = false;
  vi.mocked(command).mockImplementation(async (op) => {
    if (op === 'create_local_snapshot') {
      created = true;
      return snapshot;
    }
    if (created) throw { message: '刷新列表失败' };
    return [];
  });
  const props = openSettings();
  await screen.findByText('暂无本地快照');
  fireEvent.click(screen.getByRole('button', { name: '立即创建' }));
  expect(await screen.findByText('刷新列表失败')).toBeInTheDocument();
  expect(props.notify).toHaveBeenCalledWith('本地快照已创建');
  expect(screen.queryByText('暂无本地快照')).not.toBeInTheDocument();
});
