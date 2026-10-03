import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useState, useEffect, useRef, useMemo } from 'react';
import { recentTitles, type RecentEntry } from './recent-titles';
import { Play, Pause, Square, Clock3 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { duration } from '../../lib/format';
import type { TimerState, AppError } from '../../services/types';
export function TimerCard({
  state,
  enabled,
  onAction,
  onConfigure,
  draftTitle,
  onDraftTitleChange,
  recentEntries = [],
}: {
  state: TimerState;
  enabled: boolean;
  onAction: (op: string, input?: object) => Promise<unknown>;
  onConfigure?: () => void;
  draftTitle?: string;
  onDraftTitleChange?: (title: string) => void;
  recentEntries?: readonly RecentEntry[];
}) {
  const [localTitle, setLocalTitle] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [now, setNow] = useState(Date.now());
  const title = draftTitle ?? localTitle;
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [selectedTitle, setSelectedTitle] = useState<string | null>(null);
  const suggestions = useMemo(() => recentTitles(recentEntries, title), [recentEntries, title]);
  const showSuggestions = suggestionsOpen && !busy && suggestions.length > 0;
  const selectedIndex = selectedTitle === null ? -1 : suggestions.indexOf(selectedTitle);
  function chooseTitle(value: string) {
    setTitle(value);
    setSuggestionsOpen(false);
    setSelectedTitle(null);
  }
  function setTitle(value: string) {
    setLocalTitle(value);
    onDraftTitleChange?.(value);
  }
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
            : enabled
              ? '输入任务即可开始'
              : '等待确认统计时区'}
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
              role="combobox"
              autoComplete="off"
              aria-autocomplete="list"
              aria-expanded={showSuggestions}
              aria-controls={showSuggestions ? 'recent-task-titles' : undefined}
              aria-activedescendant={
                showSuggestions && selectedIndex >= 0 ? `recent-task-${selectedIndex}` : undefined
              }
              disabled={busy}
              onFocus={() => setSuggestionsOpen(true)}
              onBlur={() => {
                setSuggestionsOpen(false);
                setSelectedTitle(null);
              }}
              onChange={(e) => {
                setTitle(e.target.value);
                setSuggestionsOpen(true);
                setSelectedTitle(null);
              }}
              onCompositionStart={() => {
                composing.current = true;
              }}
              onCompositionEnd={() => {
                composing.current = false;
              }}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing || composing.current || busy) return;
                if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && suggestions.length) {
                  e.preventDefault();
                  setSuggestionsOpen(true);
                  const next =
                    e.key === 'ArrowDown'
                      ? (selectedIndex + 1) % suggestions.length
                      : selectedIndex <= 0
                        ? suggestions.length - 1
                        : selectedIndex - 1;
                  setSelectedTitle(suggestions[next]);
                  return;
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setSuggestionsOpen(false);
                  setSelectedTitle(null);
                  return;
                }
                if (e.key === 'Enter' && showSuggestions && selectedIndex >= 0) {
                  e.preventDefault();
                  chooseTitle(suggestions[selectedIndex]);
                  return;
                }
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
            {showSuggestions && (
              <div>
                <p className="text-sm text-muted-foreground">最近任务 · 选择后可编辑标题</p>
                <div
                  id="recent-task-titles"
                  role="listbox"
                  aria-label="最近任务"
                  className="flex flex-col gap-1"
                >
                  {suggestions.map((suggestion, index) => (
                    <Button
                      key={suggestion}
                      id={`recent-task-${index}`}
                      type="button"
                      role="option"
                      aria-selected={selectedIndex === index}
                      variant={selectedIndex === index ? 'secondary' : 'ghost'}
                      className="justify-start"
                      tabIndex={-1}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => chooseTitle(suggestion)}
                    >
                      <span className="truncate">{suggestion}</span>
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </Field>
        )}
        <p className="timer-hint">
          <Clock3 data-icon="inline-start" />
          {entry
            ? '关闭窗口后仍会继续计时，休息时记得暂停。'
            : enabled
              ? '按 Enter 开始，结束后核对实际工作时段。'
              : '确认时区后即可开始，已填写的任务名会保留。'}
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
              aria-describedby={!enabled ? 'timer-setup-description' : undefined}
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
      {!enabled && !entry && (
        <Alert className="basis-full">
          <AlertTitle>首次使用，请先确认统计时区</AlertTitle>
          <AlertDescription id="timer-setup-description">
            <p>统计时区决定工作日期和月度报告的归属。请在设置中预览并确认保存，再开始计时。</p>
            {onConfigure && (
              <Button variant="outline" size="sm" onClick={onConfigure}>
                前往确认时区
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}
      {(error || state.storageError) && (
        <Alert variant="destructive" className="timer-error">
          <AlertDescription>{error || state.storageError}</AlertDescription>
        </Alert>
      )}
    </section>
  );
}
