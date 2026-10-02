import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useState, useEffect, useRef } from 'react';
import { Play, Pause, Square, Clock3 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { duration } from '../../lib/format';
import type { TimerState, AppError } from '../../services/types';
export function TimerCard({
  state,
  enabled,
  onAction,
}: {
  state: TimerState;
  enabled: boolean;
  onAction: (op: string, input?: object) => Promise<unknown>;
}) {
  const [title, setTitle] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [now, setNow] = useState(Date.now());
  const composing = useRef(false);
  const anchor = useRef({ server: state.serverNow, local: Date.now() });
  useEffect(() => {
    anchor.current = { server: state.serverNow, local: Date.now() };
  }, [state.serverNow]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const entry = state.activeEntry,
    open = entry?.segments.find((s) => s.endAt === null);
  const elapsed =
    state.closedDurationMs +
    (open ? Math.max(0, anchor.current.server + now - anchor.current.local - open.startAt) : 0);
  async function act(op: string) {
    setBusy(true);
    setError('');
    try {
      await onAction(op, entry ? { entryId: entry.id } : { title: title.trim() });
      if (op === 'start_timer') setTitle('');
    } catch (e) {
      setError((e as AppError).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="timer-card" aria-label="工作计时">
      <div className="timer-main">
        <div className="timer-label">
          <Badge variant={entry?.status === 'running' ? 'default' : 'secondary'}>
            {entry?.status === 'running' ? '计时中' : entry ? '已暂停' : '准备开始'}
          </Badge>
          {entry
            ? entry.status === 'running'
              ? '当前任务'
              : '休息结束后可继续'
            : '输入任务即可开始'}
        </div>
        {entry ? (
          <h2 className="active-title">{entry.title}</h2>
        ) : (
          <Field>
            <FieldLabel htmlFor="timer-title" className="sr-only">
              任务标题
            </FieldLabel>
            <Input
              id="timer-title"
              className="task-input"
              aria-label="任务标题"
              placeholder="现在准备做什么？"
              value={title}
              maxLength={400}
              onChange={(e) => setTitle(e.target.value)}
              onCompositionStart={() => {
                composing.current = true;
              }}
              onCompositionEnd={() => {
                composing.current = false;
              }}
              onKeyDown={(e) => {
                if (
                  e.key === 'Enter' &&
                  !e.nativeEvent.isComposing &&
                  !composing.current &&
                  title.trim() &&
                  enabled &&
                  !busy
                ) {
                  e.preventDefault();
                  void act('start_timer');
                }
              }}
            />
          </Field>
        )}
        <p className="timer-hint">
          <Clock3 data-icon="inline-start" />
          {entry
            ? '关闭窗口后仍会继续计时，休息时记得暂停。'
            : '按 Enter 开始，结束后核对实际工作时段。'}
        </p>
      </div>
      <div className="timer-controls">
        <div className="timer-digits" aria-label="本次累计时长">
          {duration(elapsed, true)}
        </div>
        <div className="timer-actions">
          {!entry ? (
            <Button
              disabled={busy || !enabled || !title.trim()}
              onClick={() => void act('start_timer')}
            >
              <Play data-icon="inline-start" fill="currentColor" />
              开始工作
            </Button>
          ) : (
            <>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  void act(entry.status === 'running' ? 'pause_timer' : 'resume_timer')
                }
              >
                {entry.status === 'running' ? (
                  <Pause data-icon="inline-start" />
                ) : (
                  <Play data-icon="inline-start" />
                )}{' '}
                {entry.status === 'running' ? '暂停' : '继续'}
              </Button>
              <Button disabled={busy} onClick={() => void act('stop_timer')}>
                <Square data-icon="inline-start" />
                结束并核对
              </Button>
            </>
          )}
        </div>
      </div>
      {(error || state.storageError) && (
        <Alert variant="destructive" className="timer-error">
          <AlertDescription>{error || state.storageError}</AlertDescription>
        </Alert>
      )}
    </section>
  );
}
