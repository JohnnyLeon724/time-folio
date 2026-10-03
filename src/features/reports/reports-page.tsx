import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { MonthPicker } from '@/components/date-time-picker';
import { command } from '../../services/client';
import type { Report, WeekReport, AppError } from '../../services/types';
import { localDate } from '../../lib/format';
import { MonthlyReport } from './monthly-report-page';

interface Props {
  month: string;
  onMonthChange: (month: string) => void;
  monthReport?: Report;
  zone: string;
  weekStartsOn: number;
  revision: string;
  onExport: () => void;
  onEdit: (id: string) => void;
  onReview: () => void;
}

function shiftWeek(date: string, direction: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + direction * 7);
  return value.toISOString().slice(0, 10);
}

export function ReportsPage(props: Props) {
  const [mode, setMode] = useState('month');
  const [date, setDate] = useState(() => localDate(Date.now(), props.zone));
  const week = useQuery({
    queryKey: ['report', 'week', date, props.zone, props.weekStartsOn, props.revision],
    queryFn: () => command<WeekReport>('get_week_report', { date }),
    enabled: mode === 'week',
  });
  const previous = shiftWeek(date, -1);
  const next = shiftWeek(date, 1);
  return (
    <Tabs value={mode} onValueChange={setMode}>
      <TabsList aria-label="报告周期">
        <TabsTrigger value="month">月报</TabsTrigger>
        <TabsTrigger value="week">周报</TabsTrigger>
      </TabsList>
      <TabsContent value="month">
        <div className="month-picker">
          报告月份 <MonthPicker value={props.month} onChange={props.onMonthChange} />
        </div>
        {props.monthReport ? (
          <MonthlyReport
            report={props.monthReport}
            onExport={props.onExport}
            onEdit={props.onEdit}
            onReview={props.onReview}
          />
        ) : (
          <Skeleton className="h-[480px] w-full" />
        )}
      </TabsContent>
      <TabsContent value="week">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Button
            variant="outline"
            disabled={previous < '1999-01-01'}
            onClick={() => setDate(previous)}
          >
            上一周
          </Button>
          <label htmlFor="report-week-date">周内日期</label>
          <Input
            id="report-week-date"
            type="date"
            className="w-auto"
            min="1999-01-01"
            max="2100-12-31"
            value={date}
            onChange={(e) => {
              const value = e.target.value;
              if (value && value >= '1999-01-01' && value <= '2100-12-31') setDate(value);
            }}
          />
          <Button variant="outline" disabled={next > '2100-12-31'} onClick={() => setDate(next)}>
            下一周
          </Button>
          <Button variant="ghost" onClick={() => setDate(localDate(Date.now(), props.zone))}>
            本周
          </Button>
          <span className="text-sm text-muted-foreground">
            每周从星期{'日一二三四五六'[props.weekStartsOn]}开始
          </span>
        </div>
        {week.error ? (
          <Alert variant="destructive">
            <AlertDescription>
              {(week.error as unknown as AppError).message}
              <Button variant="outline" onClick={() => void week.refetch()}>
                重试周报
              </Button>
            </AlertDescription>
          </Alert>
        ) : week.data ? (
          <MonthlyReport report={week.data} onEdit={props.onEdit} onReview={props.onReview} />
        ) : (
          <Skeleton aria-label="正在加载周报" className="h-[480px] w-full" />
        )}
      </TabsContent>
    </Tabs>
  );
}
