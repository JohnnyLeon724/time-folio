import { useEffect, useMemo, useState } from 'react';
import { TZDate } from '@date-fns/tz';
import {
  addMonths,
  addWeeks,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  getDaysInMonth,
  format,
} from 'date-fns';
import { zhCN } from 'date-fns/locale';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  CalendarDays,
  List,
  Columns3,
  CircleCheck,
  CircleDashed,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { EventCalendar } from '@/components/reui/event-calendar/event-calendar';
import { EventCalendarContent } from '@/components/reui/event-calendar/event-calendar-content';
import { localDate, duration, statusText, time } from '@/lib/format';
import { toCalendarEvents } from './calendar-adapter';
import { calendarChinese } from './calendar-locale';
import type { Entry, Report, Status } from '@/services/types';

const statusColors: Record<Status, string> = {
  completed: 'var(--work-completed)',
  running: 'var(--work-running)',
  paused: 'var(--work-paused)',
  needs_review: 'var(--work-review)',
};

type View = 'month' | 'week' | 'agenda';
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
  onMonth: (value: string) => void;
  entries: Entry[];
  zone: string;
  onEdit: (id: string) => void;
  onCreate: (date: string) => void;
  report?: Report;
}) {
  const [view, setView] = useState<View>('month');
  const [date, setDate] = useState(() => new TZDate(Date.now(), zone));
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    setDate((date) => {
      if (month && localDate(date.getTime(), zone).slice(0, 7) !== month) {
        const [year, m] = month.split('-').map(Number);
        return new TZDate(year, m - 1, 1, 12, 0, 0, zone);
      }
      return new TZDate(date.getTime(), zone);
    });
  }, [month, zone]);
  const events = useMemo(
    () =>
      toCalendarEvents(entries, now).map((event) => ({
        id: event.id,
        title: `${event.title} · ${statusText[event.status]}`,
        start: new Date(event.start),
        end: new Date(event.end),
        color: statusColors[event.status],
        draggable: false,
        resizable: false,
        data: { entryId: event.entryId, status: event.status },
      })),
    [entries, now],
  );
  function navigate(next: Date) {
    const zoned = new TZDate(next.getTime(), zone);
    setDate(zoned);
    onMonth(localDate(zoned.getTime(), zone).slice(0, 7));
  }
  const title =
    view === 'week'
      ? `${format(startOfWeek(date, { weekStartsOn: 1 }), 'yyyy年 M月d日')} – ${format(endOfWeek(date, { weekStartsOn: 1 }), 'M月d日')}`
      : format(date, 'yyyy 年 M 月');
  return (
    <section className="calendar-section" aria-label="时间日历">
      <div className="calendar-toolbar">
        <div className="calendar-heading">
          <h2 aria-live="polite">{title}</h2>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="上一页"
              onClick={() => navigate(view === 'week' ? addWeeks(date, -1) : addMonths(date, -1))}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="下一页"
              onClick={() => navigate(view === 'week' ? addWeeks(date, 1) : addMonths(date, 1))}
            >
              <ChevronRight />
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate(new Date())}>
              今天
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={view}
            onValueChange={(value) => {
              if (value) setView(value as View);
            }}
            aria-label="日历视图"
          >
            <ToggleGroupItem value="month" aria-label="月">
              <CalendarDays />月
            </ToggleGroupItem>
            <ToggleGroupItem value="week" aria-label="周">
              <Columns3 />周
            </ToggleGroupItem>
            <ToggleGroupItem value="agenda" aria-label="列表">
              <List />
              列表
            </ToggleGroupItem>
          </ToggleGroup>
          <Button size="sm" onClick={() => onCreate(localDate(Date.now(), zone))}>
            <Plus data-icon="inline-start" />
            补录
          </Button>
        </div>
      </div>
      <EventCalendar
        className="calendar-canvas"
        events={events}
        date={view === 'agenda' ? startOfMonth(date) : date}
        view={view}
        timeZone={zone}
        locale={zhCN}
        i18n={calendarChinese}
        weekStartsOn={1}
        agendaDayCount={getDaysInMonth(date)}
        scrollToHour={8}
        interval={60}
        interactions={{ drag: false, resize: false, selectSlot: false }}
        onDateChange={navigate}
        onViewChange={(next) => {
          if (['month', 'week', 'agenda'].includes(next)) setView(next as View);
        }}
        onEventClick={(occurrence) => onEdit(occurrence.event.data!.entryId)}
        onSlotClick={(slot) => onCreate(localDate(slot.date.getTime(), zone))}
        enableShortcuts={false}
        renderEvent={({ occurrence }) => (
          <div className="calendar-event-content">
            {occurrence.event.data?.status === 'completed' ? <CircleCheck /> : <CircleDashed />}
            <span>{occurrence.event.title}</span>
            <small className="shrink-0 tabular-nums">
              {time(occurrence.start.getTime(), zone)}
            </small>
          </div>
        )}
      >
        <EventCalendarContent />
      </EventCalendar>
      <footer className="calendar-footer">
        <span className="calendar-legend">
          {(Object.keys(statusColors) as Status[]).map((status) => (
            <span key={status} className="inline-flex items-center gap-1.5">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: statusColors[status] }}
              />
              {statusText[status]}
            </span>
          ))}
        </span>
        <span>
          {report
            ? `${report.workedDayCount} 个记录日 · ${duration(report.durationMs)}`
            : '点击日期补录，点击时段查看详情'}{' '}
          · {zone}
        </span>
      </footer>
    </section>
  );
}
