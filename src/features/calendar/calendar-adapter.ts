import type { Entry } from '../../services/types';
export interface CalendarEvent {
  id: string;
  entryId: string;
  title: string;
  start: number;
  end: number;
  status: Entry['status'];
}
export function toCalendarEvents(entries: Entry[], now: number): CalendarEvent[] {
  return entries
    .filter((e) => e.deletedAt === null)
    .flatMap((e) =>
      e.segments.map((s) => ({
        id: s.id,
        entryId: e.id,
        title: e.title,
        start: s.startAt,
        end: s.endAt ?? (e.status === 'running' ? now : s.startAt),
        status: e.status,
      })),
    );
}
