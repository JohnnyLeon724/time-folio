import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, CalendarDays, List, Columns3 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { localDate, time, duration, statusText } from '../../lib/format';
import { toCalendarEvents } from './calendar-adapter';
import type { Entry, Report } from '../../services/types';
const weekday = ['一', '二', '三', '四', '五', '六', '日'];
export function WorkCalendar({
  month,
  onMonth,
  entries,
  zone,
  onEdit,
  onCreate,
  report,
}: {
  month: string;
  onMonth: (v: string) => void;
  entries: Entry[];
  zone: string;
  onEdit: (id: string) => void;
  onCreate: (date: string) => void;
  report?: Report;
}) {
  const [view, setView] = useState<'month' | 'week' | 'agenda'>('month'),
    [week, setWeek] = useState(0);
  const events = useMemo(() => toCalendarEvents(entries, Date.now()), [entries]);
  const first = new Date(`${month}-01T12:00:00Z`);
  const offset = (first.getUTCDay() + 6) % 7;
  const start = new Date(first);
  start.setUTCDate(1 - offset);
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
  const today = localDate(Date.now(), zone);
  function move(n: number) {
    if (view === 'week') {
      const next = week + n;
      if (next >= 0 && next < 6) {
        setWeek(next);
        return;
      }
      setWeek(n > 0 ? 0 : 5);
    }
    const d = new Date(first);
    d.setUTCMonth(d.getUTCMonth() + n);
    onMonth(d.toISOString().slice(0, 7));
  }
  const visible = view === 'week' ? cells.slice(week * 7, week * 7 + 7) : cells;
  return (
    <section className="calendar-section">
      <div className="section-toolbar">
        <div className="month-heading">
          <h2>
            {month.slice(0, 4)} 年 {Number(month.slice(5))} 月
          </h2>
          <div className="calendar-nav">
            <button className="icon-button" aria-label="上一页" onClick={() => move(-1)}>
              <ChevronLeft size={18} />
            </button>
            <button className="icon-button" aria-label="下一页" onClick={() => move(1)}>
              <ChevronRight size={18} />
            </button>
            <button
              className="today-button"
              onClick={() => {
                onMonth(today.slice(0, 7));
                setWeek(0);
              }}
            >
              今天
            </button>
          </div>
        </div>
        <div className="toolbar-right">
          <div className="view-switch">
            {(
              [
                ['month', '月', CalendarDays],
                ['week', '周', Columns3],
                ['agenda', '列表', List],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                aria-pressed={view === key}
                className={view === key ? 'selected' : ''}
                onClick={() => setView(key)}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>
          <Button variant="secondary" size="small" onClick={() => onCreate(today)}>
            <Plus size={15} />
            补录
          </Button>
        </div>
      </div>
      {view === 'agenda' ? (
        <div className="agenda">
          {events
            .filter(
              (e) =>
                localDate(e.start, zone).slice(0, 7) <= month &&
                localDate(e.end, zone).slice(0, 7) >= month,
            )
            .map((e) => (
              <button className="agenda-row" key={e.id} onClick={() => onEdit(e.entryId)}>
                <span>{localDate(e.start, zone)}</span>
                <strong>{e.title}</strong>
                <span>
                  {time(e.start, zone)} – {time(e.end, zone)}
                </span>
                <span className={`badge ${e.status}`}>{statusText[e.status]}</span>
              </button>
            ))}
          {!events.length && <Empty />}
        </div>
      ) : (
        <>
          <div className="weekday-row">
            {weekday.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
          <div className={`calendar-grid ${view === 'week' ? 'week-grid' : ''}`}>
            {visible.map((date) => {
              const dayEvents = events.filter(
                (e) =>
                  localDate(e.start, zone) <= date &&
                  localDate(Math.max(e.start, e.end - 1), zone) >= date,
              );
              return (
                <div
                  className={`calendar-cell ${date.slice(0, 7) !== month ? 'outside' : ''}`}
                  key={date}
                >
                  <button
                    className={`day-number ${date === today ? 'is-today' : ''}`}
                    aria-label={`${date} 补录工作`}
                    onClick={() => onCreate(date)}
                  >
                    {Number(date.slice(8))}
                  </button>
                  <div className="day-events">
                    {dayEvents.slice(0, view === 'week' ? 20 : 3).map((e) => (
                      <button
                        key={e.id}
                        className={`calendar-event ${e.status}`}
                        onClick={() => onEdit(e.entryId)}
                        title={`${e.title} ${statusText[e.status]}`}
                      >
                        <span className="event-time">
                          {localDate(e.start, zone) === date ? time(e.start, zone) : '续'}
                        </span>
                        <span>{e.title}</span>
                        {e.status !== 'completed' && <small>{statusText[e.status]}</small>}
                      </button>
                    ))}
                    {view === 'month' && dayEvents.length > 3 && (
                      <button className="more-events" onClick={() => setView('agenda')}>
                        还有 {dayEvents.length - 3} 段
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
      <footer className="calendar-footer">
        <span>
          <i />
          已完成 <i className="legend-review" />
          待核对
        </span>
        <span>
          {report
            ? `${report.workedDayCount} 个工作日 · ${duration(report.durationMs)}`
            : '点击日期补录，点击时段查看详情'}{' '}
          <span className="zone-label">{zone}</span>
        </span>
      </footer>
    </section>
  );
}
function Empty() {
  return (
    <div className="empty-state">
      <CalendarDays size={32} />
      <h3>这一页，还等你写下</h3>
      <p>开始一次计时，或补录已经完成的工作。</p>
    </div>
  );
}
