import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { AlertDialogCancel } from '@/components/ui/alert-dialog';
import { useState, useEffect } from 'react';
import { save, open } from '@tauri-apps/plugin-dialog';
import { Download, Upload, Database, Globe, ShieldCheck, Trash2, RotateCcw } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Modal } from '../../components/modal';
import { command } from '../../services/client';
import type { Workspace, Preview, AppError, Context } from '../../services/types';
import { duration } from '../../lib/format';
interface Snapshot {
  id: string;
  path: string;
  kind: string;
  createdAt: number;
}
interface ZonePreview {
  token: string;
  zone: string;
  changes: { month: string; beforeMs: number; afterMs: number }[];
}
export function SettingsPage({
  workspace,
  onChanged,
  notify,
}: {
  workspace: Workspace;
  onChanged: () => void;
  notify: (message: string) => void;
}) {
  const [zone, setZone] = useState(
    workspace.settings.confirmed
      ? workspace.settings.reportingTimeZone
      : Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [preview, setPreview] = useState<Preview | null>(null),
    [zonePreview, setZonePreview] = useState<ZonePreview | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [snapshots, setSnapshots] = useState<Snapshot[]>([]),
    [deleting, setDeleting] = useState<Snapshot | null>(null);
  const context = (): Context => ({
    requestId: crypto.randomUUID(),
    workspaceRevision: workspace.timer.workspaceRevision,
    expectedEntryVersion: null,
  });
  async function refreshSnapshots() {
    setSnapshots(await command<Snapshot[]>('list_local_snapshots'));
  }
  useEffect(() => {
    void refreshSnapshots().catch(() => {});
  }, []);
  async function task(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError((e as AppError).message);
    } finally {
      setBusy(false);
    }
  }
  async function exportBackup() {
    const path = await save({
      defaultPath: `hourtrail-backup-${new Date().toISOString().replace(/[-:.]/g, '')}.hourtrail.json`,
      filters: [{ name: 'HourTrail 备份', extensions: ['json'] }],
    });
    if (!path) return;
    await command('export_backup', { destination: path });
    notify(`完整备份已保存：${path}`);
  }
  async function importBackup() {
    const path = await open({
      multiple: false,
      filters: [{ name: 'HourTrail 备份', extensions: ['json'] }],
    });
    if (!path || Array.isArray(path)) return;
    setPreview(await command<Preview>('inspect_backup', { source: path }));
    setConfirmed(false);
  }
  return (
    <>
      <div className="page-heading">
        <h1>设置与数据</h1>
        <p>数据保存在这台电脑，备份由你掌握。</p>
      </div>
      {!workspace.settings.confirmed && (
        <Alert className="mb-5">
          <Globe />
          <AlertTitle>先确认工时的统计时区</AlertTitle>
          <AlertDescription>
            我们已填入系统时区。以后更换电脑，统计时区也会随备份保留。
          </AlertDescription>
        </Alert>
      )}
      <Tabs defaultValue="general">
        <TabsList aria-label="设置分类">
          <TabsTrigger value="general">常规</TabsTrigger>
          <TabsTrigger value="data">备份与数据</TabsTrigger>
        </TabsList>
        <TabsContent value="general">
          <Card className="settings-section">
            <CardContent className="flex flex-col gap-5">
              <div className="settings-heading">
                <Globe size={22} />
                <div>
                  <h2>统计时区</h2>
                  <p>日期归属、日历和月度报告都使用这个时区。</p>
                </div>
              </div>
              <div className="settings-control">
                <Input
                  aria-label="统计时区"
                  list="timezones"
                  value={zone}
                  onChange={(e) => setZone(e.target.value)}
                />
                <datalist id="timezones">
                  {[
                    'Asia/Shanghai',
                    'Asia/Tokyo',
                    'Asia/Singapore',
                    'Europe/London',
                    'Europe/Berlin',
                    'America/New_York',
                    'America/Los_Angeles',
                    'Etc/UTC',
                  ].map((z) => (
                    <option key={z} value={z} />
                  ))}
                </datalist>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    void task(async () => {
                      setZonePreview(await command('preview_reporting_zone', { zone }));
                    })
                  }
                >
                  预览并保存
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="data">
          <Card className="settings-section">
            <CardContent className="flex flex-col gap-5">
              <div className="settings-heading">
                <Database size={22} />
                <div>
                  <h2>完整备份与迁移</h2>
                  <p>包含工作记录、待核对记录和回收站。Windows 与 macOS 通用。</p>
                </div>
              </div>
              <div className="data-actions">
                <div>
                  <Download size={23} />
                  <h3>导出完整备份</h3>
                  <p>
                    {workspace.entries.length} 条记录 ·{' '}
                    {workspace.entries.reduce((n, e) => n + e.segments.length, 0)} 个时段
                  </p>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void task(exportBackup)}
                  >
                    选择保存位置
                  </Button>
                </div>
                <div>
                  <Upload size={23} />
                  <h3>导入备份</h3>
                  <p>先验证和预览，确认后替换本地记录。</p>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void task(importBackup)}
                  >
                    选择备份文件
                  </Button>
                </div>
              </div>
              <p className="privacy-note">
                <ShieldCheck size={15} />
                备份是明文文件，请妥善保存。换机前先结束正在计时的任务。
              </p>
            </CardContent>
          </Card>
          <Card className="settings-section">
            <CardContent className="flex flex-col gap-5">
              <div className="settings-heading">
                <RotateCcw size={22} />
                <div>
                  <h2>本地安全快照</h2>
                  <p>自动保留最近 7 份。恢复前的安全快照会单独保留。</p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void task(async () => {
                      await command('create_local_snapshot');
                      await refreshSnapshots();
                      notify('本地快照已创建');
                    })
                  }
                >
                  立即创建
                </Button>
              </div>
              <div className="snapshot-list">
                {snapshots.map((s) => (
                  <div className="snapshot-row" key={s.id}>
                    <div>
                      <strong>{s.kind === 'pre-restore' ? '恢复前安全快照' : '本地快照'}</strong>
                      <span>{new Date(s.createdAt).toLocaleString('zh-CN')}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        void task(async () => {
                          setPreview(await command('inspect_local_snapshot', { id: s.id }));
                          setConfirmed(false);
                        })
                      }
                    >
                      预览恢复
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={busy}
                      aria-label="删除快照"
                      onClick={() => setDeleting(s)}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                ))}
                {!snapshots.length && <p className="muted">有工作记录后，会自动创建安全快照。</p>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {zonePreview && (
        <Modal
          title="确认统计时区"
          description={`改为 ${zonePreview.zone}。工作区间和实际总时长保持不变，日期归属会重新计算。`}
          onClose={() => setZonePreview(null)}
        >
          {zonePreview.changes.length ? (
            <ul className="change-list">
              {zonePreview.changes.map((c) => (
                <li key={c.month}>
                  {c.month}：{duration(c.beforeMs)} → {duration(c.afterMs)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="dialog-note">没有月度总时长变化。日历仍会按新时区展示。</p>
          )}
          <div className="modal-footer">
            <Button variant="secondary" onClick={() => setZonePreview(null)}>
              取消
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                void task(async () => {
                  await command('set_reporting_zone', {
                    context: context(),
                    token: zonePreview.token,
                  });
                  setZonePreview(null);
                  onChanged();
                  notify('统计时区已保存');
                })
              }
            >
              确认保存
            </Button>
          </div>
        </Modal>
      )}
      {preview && (
        <Modal
          wide
          title="恢复备份预览"
          description="仅预览不会修改任何记录。确认恢复后，当前工作区将被完整替换。"
          onClose={() => {
            if (!busy) setPreview(null);
          }}
        >
          <div className="preview-grid">
            <div>
              <span>记录</span>
              <strong>{preview.entryCount}</strong>
            </div>
            <div>
              <span>时段</span>
              <strong>{preview.segmentCount}</strong>
            </div>
            <div>
              <span>待核对</span>
              <strong>{preview.reviewCount}</strong>
            </div>
            <div>
              <span>回收站</span>
              <strong>{preview.deletedCount}</strong>
            </div>
          </div>
          <div className="dialog-note">
            <p>已确认工时：{duration(preview.durationMs)}</p>
            <p>统计时区：{preview.reportingTimeZone}</p>
            <p>
              源版本：{preview.sourceVersion} · 导出于{' '}
              {new Date(preview.exportedAt).toLocaleString('zh-CN')}
            </p>
            {preview.reportComparison.map((c, i) => (
              <p className="warning" key={i}>
                {String(c)}
              </p>
            ))}
            {preview.replacesLocal && (
              <label className="check-line">
                <Checkbox
                  checked={confirmed}
                  onCheckedChange={(checked) => setConfirmed(checked === true)}
                />
                我确认替换当前本地记录。恢复前将自动保存安全快照。
              </label>
            )}
          </div>
          {error && <p className="error">{error}</p>}
          <div className="modal-footer">
            <Button variant="secondary" onClick={() => setPreview(null)} disabled={busy}>
              取消
            </Button>
            <Button
              disabled={busy || (preview.replacesLocal && !confirmed)}
              onClick={() =>
                void task(async () => {
                  const result = await command<{ value: { safetySnapshot: string } }>(
                    'restore_backup',
                    { context: context(), token: preview.token, confirmed },
                  );
                  setPreview(null);
                  onChanged();
                  await refreshSnapshots();
                  notify(`恢复完成。安全快照：${result.value.safetySnapshot}`);
                })
              }
            >
              {busy ? '恢复中…' : '确认恢复'}
            </Button>
          </div>
        </Modal>
      )}
      {deleting && (
        <Modal
          confirmation
          title="删除这份快照？"
          description="仅删除所选快照，不影响当前工作记录。"
          onClose={() => {
            if (!busy) setDeleting(null);
          }}
        >
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="modal-footer">
            <AlertDialogCancel disabled={busy} onClick={() => setDeleting(null)}>
              取消
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() =>
                void task(async () => {
                  await command('delete_local_snapshot', { id: deleting.id });
                  setDeleting(null);
                  await refreshSnapshots();
                })
              }
            >
              删除快照
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
