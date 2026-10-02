import { useEffect, useState } from 'react';
import { Modal } from '@/components/modal';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { command } from '@/services/client';
import type { AppError, Entry, Workspace } from '@/services/types';
import { localInput, statusText } from '@/lib/format';

export function ConflictRecordDialog({
  entryId,
  zone,
  onClose,
}: {
  entryId: string;
  zone: string;
  onClose: () => void;
}) {
  const [entry, setEntry] = useState<Entry | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    void command<Workspace>('get_workspace')
      .then((workspace) => {
        if (cancelled) return;
        const record = workspace.entries.find((item) => item.id === entryId && !item.deletedAt);
        setEntry(record ?? null);
        if (!record) setError('这条记录已不存在或已移入回收站。返回编辑后重新保存，检查最新冲突。');
      })
      .catch((error: AppError) => {
        if (!cancelled) setError(error.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entryId, attempt]);
  return (
    <Modal
      wide
      title="冲突记录"
      description={`仅查看，不会替换当前草稿。所有时间均使用 ${zone}。`}
      onClose={onClose}
    >
      {loading ? (
        <Skeleton className="h-32 w-full" aria-label="正在读取冲突记录" />
      ) : error ? (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-col items-start gap-2">
            {error}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAttempt((n) => n + 1)}
            >
              重试
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        entry && (
          <div className="flex flex-col gap-4">
            <div>
              <h3 className="font-medium break-words">{entry.title}</h3>
              <p className="text-sm text-muted-foreground">{statusText[entry.status]}</p>
            </div>
            <ol className="flex flex-col gap-2">
              {entry.segments.map((segment, i) => (
                <li key={segment.id} className="rounded-md border p-3 text-sm">
                  <span className="text-muted-foreground">时段 {i + 1}</span>
                  <p className="tabular-nums">
                    {localInput(segment.startAt, zone).replace('T', ' ')} 至{' '}
                    {segment.endAt === null
                      ? '尚未结束'
                      : localInput(segment.endAt, zone).replace('T', ' ')}
                  </p>
                </li>
              ))}
            </ol>
            {entry.note && <p className="text-sm whitespace-pre-wrap break-words">{entry.note}</p>}
          </div>
        )
      )}
      <div className="modal-footer">
        <Button type="button" variant="secondary" onClick={onClose}>
          返回编辑
        </Button>
      </div>
    </Modal>
  );
}
