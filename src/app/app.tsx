import { WorkspaceLayout } from './workspace-layout';
import { Skeleton } from '@/components/ui/skeleton';
import { MonthPicker } from '@/components/date-time-picker';
import { EmptyState } from '@/components/empty-state';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertDialogCancel } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listen } from '@tauri-apps/api/event';
import { save } from '@tauri-apps/plugin-dialog';
import { CheckCheck, Trash2, Check, Clock3, RotateCcw, AlertTriangle } from 'lucide-react';
import { Providers } from './providers';
import { Button } from '../components/ui/button';
import { Modal } from '../components/modal';
import { TimerCard } from '../features/timer/timer-card';
import { WorkCalendar } from '../features/calendar/work-calendar';
import { EntrySheet } from '../features/entries/entry-sheet';
import { SettingsPage } from '../features/settings/settings-page';
import { command, desktop } from '../services/client';
import type { Workspace, Entry, Report, Context, Mutation, AppError } from '../services/types';
import { duration, localDate, statusText } from '../lib/format';
import '../styles.css';
const MonthlyReport = lazy(() =>
  import('../features/reports/monthly-report-page').then((module) => ({
    default: module.MonthlyReport,
  })),
);
export default function App() {
  return (
    <Providers>
      <WorkspaceApp />
    </Providers>
  );
}
function WorkspaceApp() {
  const cache = useQueryClient();
  const [page, setPage] = useState('workspace'),
    [timerDraftTitle, setTimerDraftTitle] = useState(''),
    [month, setMonth] = useState(''),
    [notice, setNotice] = useState(''),
    [editor, setEditor] = useState<{ entry?: Entry; date: string; revision: string } | null>(null),
    [quit, setQuit] = useState(false),
    [quitAfterReview, setQuitAfterReview] = useState(false),
    [repairConfirm, setRepairConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [refreshNotice, setRefreshNotice] = useState('');
  const lastRequest = useRef<{ key: string; context: Context } | null>(null);
  const query = useQuery({
    queryKey: ['workspace'],
    queryFn: () => command<Workspace>('get_workspace'),
    enabled: desktop,
  });
  const workspace = query.data;
  const zone = workspace?.settings.reportingTimeZone ?? 'Asia/Shanghai';
  useEffect(() => {
    if (workspace && !month) setMonth(localDate(Date.now(), zone).slice(0, 7));
  }, [workspace, month, zone]);
  useEffect(() => {
    if (notice) {
      toast(notice);
      setNotice('');
    }
  }, [notice]);
  const report = useQuery({
    queryKey: ['report', month, workspace?.timer.workspaceRevision],
    queryFn: () => command<Report>('get_month_report', { month }),
    enabled: !!workspace && !!month,
  });
  function refresh() {
    void cache.invalidateQueries({ queryKey: ['workspace'] });
    void cache.invalidateQueries({ queryKey: ['report'] });
  }
  function edit(id: string) {
    const entry = workspace?.entries.find((e) => e.id === id);
    if (entry && workspace)
      setEditor({
        entry,
        date: localDate(entry.segments[0]?.startAt ?? entry.createdAt, zone),
        revision: workspace.timer.workspaceRevision,
      });
  }
  const latest = useRef({ workspace, edit, refresh });
  latest.current = { workspace, edit, refresh };
  useEffect(() => {
    if (!desktop) return;
    const subscriptions = [
      listen('worklog-changed', () => latest.current.refresh()),
      listen<string>('platform-warning', (e) => setNotice(e.payload)),
      listen('quit-requested', () => setQuit(true)),
      listen<string>('review-entry', (e) => {
        void command<Workspace>('get_workspace').then((w) => {
          cache.setQueryData(['workspace'], w);
          const entry = w.entries.find((x) => x.id === e.payload);
          if (entry)
            setEditor({
              entry,
              date: localDate(entry.createdAt, w.settings.reportingTimeZone),
              revision: w.timer.workspaceRevision,
            });
        });
      }),
    ];
    const focus = () => latest.current.refresh();
    window.addEventListener('focus', focus);
    return () => {
      subscriptions.forEach((p) => void p.then((fn) => fn()));
      window.removeEventListener('focus', focus);
    };
  }, [cache]);
  useEffect(() => {
    if (workspace && !workspace.settings.confirmed) setPage('settings');
  }, [workspace?.settings.confirmed]);
  async function act(op: string, input: object = {}) {
    if (!workspace) throw { message: '数据尚未就绪' };
    const active = workspace.timer.activeEntry;
    const key = JSON.stringify([op, input]);
    const context =
      lastRequest.current?.key === key
        ? lastRequest.current.context
        : {
            requestId: crypto.randomUUID(),
            workspaceRevision: workspace.timer.workspaceRevision,
            expectedEntryVersion: active?.version ?? null,
          };
    lastRequest.current = { key, context };
    try {
      const result = await command<Mutation<Entry>>(op, { ...input, context });
      lastRequest.current = null;
      refresh();
      if (op === 'stop_timer')
        setEditor({
          entry: result.value,
          date: localDate(result.value.createdAt, zone),
          revision: result.workspaceRevision,
        });
      return result;
    } catch (e) {
      if ((e as AppError).code === 'STALE_REVISION') lastRequest.current = null;
      refresh();
      throw e;
    }
  }
  async function exportCsv() {
    try {
      const destination = await save({
        defaultPath: `timefolio-timesheet-${month}.csv`,
        filters: [{ name: 'CSV 工时表', extensions: ['csv'] }],
      });
      if (!destination) return;
      await command('export_month_csv', { month, destination });
      setNotice(`工时表已保存：${destination}`);
    } catch (e) {
      setNotice((e as AppError).message);
    }
  }
  const pending =
    workspace?.entries.filter((e) => e.status === 'needs_review' && !e.deletedAt) ?? [];
  const deleted = workspace?.entries.filter((e) => e.deletedAt) ?? [];
  const today = localDate(Date.now(), zone);
  const formalMs = report.data?.durationMs ?? 0;
  return (
    <WorkspaceLayout page={page} onPage={setPage} pendingCount={pending.length} zone={zone}>
      <div className="page-content">
        {!desktop ? (
          <div className="browser-note">
            <Clock3 size={40} />
            <h1>Timefolio 桌面工作台</h1>
            <p>请启动桌面应用，使用本地计时、日历和备份功能。</p>
          </div>
        ) : query.isPending ? (
          <div aria-label="正在加载工作区" className="flex flex-col gap-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-[540px] w-full" />
          </div>
        ) : query.error ? (
          <div className="error-panel">
            <AlertTriangle />
            <h2>无法读取工作区</h2>
            <p>{(query.error as unknown as AppError).message}</p>
            <Button onClick={() => void query.refetch()}>重试读取</Button>
            <p>原数据库和快照将保留。也可以先创建空白工作区，再从设置页恢复快照或备份。</p>
            <Button variant="secondary" onClick={() => setRepairConfirm(true)}>
              保留损坏副本并重新创建
            </Button>
          </div>
        ) : (
          workspace && (
            <>
              {page === 'workspace' && (
                <>
                  <div className="page-heading workspace-title">
                    <div>
                      <p className="eyebrow">工作空间</p>
                      <h1>记录每一段工作</h1>
                    </div>
                    <span className="muted">
                      {new Intl.DateTimeFormat('zh-CN', {
                        timeZone: zone,
                        month: 'long',
                        day: 'numeric',
                        weekday: 'long',
                      }).format(Date.now())}
                    </span>
                  </div>
                  <TimerCard
                    state={workspace.timer}
                    enabled={workspace.settings.confirmed}
                    onAction={act}
                    draftTitle={timerDraftTitle}
                    onDraftTitleChange={setTimerDraftTitle}
                    onConfigure={() => setPage('settings')}
                  />
                  <div className="month-strip">
                    <span>
                      已确认工时 <small>{month}</small>
                    </span>
                    <strong>{duration(formalMs)}</strong>
                    <span>{report.data?.workedDayCount ?? 0} 个工作日</span>
                    <Button variant="ghost" size="sm" onClick={() => setPage('review')}>
                      {pending.length ? `${pending.length} 条记录待核对` : '记录已核对'}
                      <Check size={14} />
                    </Button>
                  </div>
                  {month && (
                    <WorkCalendar
                      month={month}
                      onMonth={setMonth}
                      entries={workspace.entries}
                      zone={zone}
                      onEdit={edit}
                      onCreate={(date) =>
                        setEditor({ date, revision: workspace.timer.workspaceRevision })
                      }
                      report={report.data}
                    />
                  )}
                </>
              )}
              {page === 'report' && (
                <>
                  <div className="month-picker">
                    报告月份
                    <MonthPicker value={month} onChange={setMonth} />
                  </div>
                  {report.data ? (
                    <Suspense fallback={<Skeleton className="h-[480px] w-full" />}>
                      <MonthlyReport
                        report={report.data}
                        onExport={() => void exportCsv()}
                        onEdit={edit}
                        onReview={() => setPage('review')}
                      />
                    </Suspense>
                  ) : (
                    <Skeleton className="h-[480px] w-full" />
                  )}
                </>
              )}
              {(page === 'review' || page === 'trash') && (
                <>
                  <div className="page-heading">
                    <h1>{page === 'review' ? '待核对的工作' : '回收站'}</h1>
                    <p>
                      {page === 'review'
                        ? '确认实际工作的时间，完成后才计入正式工时。'
                        : '删除的记录保留在这里，可以随时找回。'}
                    </p>
                  </div>
                  <div className="entry-list">
                    {(page === 'review' ? pending : deleted).map((e) => (
                      <div className="entry-list-row" key={e.id}>
                        <span className="entry-list-icon">
                          {page === 'review' ? <CheckCheck size={22} /> : <Trash2 size={22} />}
                        </span>
                        <div>
                          <h3>{e.title}</h3>
                          <p>
                            {localDate(e.createdAt, zone)} · {e.segments.length} 个时段 ·{' '}
                            {statusText[e.status]}
                          </p>
                        </div>
                        <strong>
                          {duration(
                            e.segments.reduce((n, s) => n + (s.endAt ? s.endAt - s.startAt : 0), 0),
                          )}
                        </strong>
                        {page === 'review' ? (
                          <Button variant="secondary" size="sm" onClick={() => edit(e.id)}>
                            核对记录
                          </Button>
                        ) : (
                          <>
                            <Button
                              disabled={busy}
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setBusy(true);
                                void command('restore_entry', {
                                  entryId: e.id,
                                  context: {
                                    requestId: crypto.randomUUID(),
                                    workspaceRevision: workspace.timer.workspaceRevision,
                                    expectedEntryVersion: e.version,
                                  },
                                  asReview: false,
                                })
                                  .then(() => refresh())
                                  .catch((err) => setRefreshNotice((err as AppError).message))
                                  .finally(() => setBusy(false));
                              }}
                            >
                              找回
                            </Button>
                            <Button
                              disabled={busy}
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setBusy(true);
                                void command('restore_entry', {
                                  entryId: e.id,
                                  context: {
                                    requestId: crypto.randomUUID(),
                                    workspaceRevision: workspace.timer.workspaceRevision,
                                    expectedEntryVersion: e.version,
                                  },
                                  asReview: true,
                                })
                                  .then(() => {
                                    refresh();
                                    setRefreshNotice('已找回到待核对列表');
                                  })
                                  .catch((err) => setRefreshNotice((err as AppError).message))
                                  .finally(() => setBusy(false));
                              }}
                            >
                              作为待核对找回
                            </Button>
                          </>
                        )}
                      </div>
                    ))}
                    {!(page === 'review' ? pending : deleted).length && (
                      <EmptyState
                        title={page === 'review' ? '目前没有待核对记录' : '回收站是空的'}
                        description={
                          page === 'review'
                            ? '安心投入下一段工作吧。'
                            : '删除的工作记录会出现在这里。'
                        }
                      />
                    )}
                    {refreshNotice && (
                      <p role="status" className="dialog-note">
                        {refreshNotice}
                      </p>
                    )}
                  </div>
                </>
              )}
              {page === 'settings' && (
                <SettingsPage
                  workspace={workspace}
                  onChanged={() => {
                    setEditor(null);
                    refresh();
                    if (!workspace.settings.confirmed) setPage('workspace');
                  }}
                  notify={setNotice}
                />
              )}
            </>
          )
        )}
        {report.error && (
          <Alert variant="destructive">
            <AlertDescription>{(report.error as unknown as AppError).message}</AlertDescription>
          </Alert>
        )}
      </div>

      {editor && workspace && (
        <EntrySheet
          key={`${editor.entry?.id ?? editor.date}-${editor.revision}`}
          entry={editor.entry}
          date={editor.date}
          revision={editor.revision}
          zone={zone}
          hasActive={!!workspace.timer.activeEntry}
          onClose={() => {
            setEditor(null);
            if (quitAfterReview) {
              setQuitAfterReview(false);
              void command('cancel_quit');
            }
          }}
          onSaved={() => {
            setEditor(null);
            refresh();
            setNotice('工作记录已保存');
            if (quitAfterReview) {
              setQuitAfterReview(false);
              void command('prepare_quit').catch((e) => setNotice((e as AppError).message));
            }
          }}
        />
      )}
      {repairConfirm && (
        <Modal
          confirmation
          title="保留损坏副本并重新创建？"
          description="应用会先保存当前数据库及关联文件的副本，再创建空白工作区。随后可在设置页恢复本地快照或导入备份。"
          onClose={() => {
            if (!busy) setRepairConfirm(false);
          }}
        >
          <div className="modal-footer">
            <AlertDialogCancel disabled={busy} onClick={() => setRepairConfirm(false)}>
              取消
            </AlertDialogCancel>
            <Button
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void command<{ preservedAt: string }>('repair_database', { confirmed: true })
                  .then((r) => {
                    setRepairConfirm(false);
                    setNotice(`原数据已保留：${r.preservedAt}`);
                    refresh();
                  })
                  .catch((e) => setNotice((e as AppError).message))
                  .finally(() => setBusy(false));
              }}
            >
              保存副本并创建
            </Button>
          </div>
        </Modal>
      )}
      {quit && (
        <Modal
          title="退出前处理当前任务"
          description="关闭窗口可以继续后台计时。彻底退出时，需要先处理活动记录。"
          onClose={() => {
            setQuit(false);
            void command('cancel_quit');
          }}
        >
          <div className="modal-footer">
            <Button
              variant="secondary"
              onClick={() => {
                setQuit(false);
                void command('cancel_quit');
              }}
            >
              取消退出
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                void act('stop_timer')
                  .then(() => {
                    setQuit(false);
                    setQuitAfterReview(true);
                  })
                  .catch((e) => setNotice((e as AppError).message));
              }}
            >
              结束并核对
            </Button>
            <Button
              onClick={() => {
                void command('prepare_quit').catch((e) => setNotice((e as AppError).message));
              }}
            >
              保留待核对并退出
            </Button>
          </div>
        </Modal>
      )}
    </WorkspaceLayout>
  );
}
