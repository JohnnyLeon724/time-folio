import { useState, useEffect, useRef } from 'react';
import { Play, Pause, Square, ArrowUpRight, Clock3 } from 'lucide-react';
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
    <section
      className={`timer-card ${entry?.status === 'running' ? 'is-running' : ''}`}
      aria-label="工作计时"
    >
      <div className="timer-main">
        <div className="timer-label">
          <span className={`status-dot ${entry?.status === 'running' ? 'live' : ''}`} />
          {entry
            ? entry.status === 'running'
              ? '正在专注'
              : '休息一下，随时继续'
            : '从一段专注开始'}
        </div>
        {entry ? (
          <h2 className="active-title">{entry.title}</h2>
        ) : (
          <input
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
        )}
        <p className="timer-hint">
          <Clock3 size={14} />
          {entry
            ? '关闭窗口后仍会继续计时，休息时记得暂停。'
            : '给这一段工作起个名字，剩下的交给计时器。'}
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
              <Play size={17} fill="currentColor" />
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
                {entry.status === 'running' ? <Pause size={16} /> : <Play size={16} />}{' '}
                {entry.status === 'running' ? '暂停' : '继续'}
              </Button>
              <Button disabled={busy} onClick={() => void act('stop_timer')}>
                <Square size={14} />
                结束并核对
              </Button>
            </>
          )}
        </div>
      </div>
      {(error || state.storageError) && (
        <p role="alert" className="error timer-error">
          {error || state.storageError}
        </p>
      )}
      <ArrowUpRight className="timer-decoration" size={20} />
    </section>
  );
}
