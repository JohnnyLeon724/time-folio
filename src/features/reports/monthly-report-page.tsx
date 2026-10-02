import { DailyDurationChart } from './daily-duration-chart';
import { Card, CardContent } from '@/components/ui/card';
import { WorkDetailsTable } from './work-details-table';

import { Download, CalendarCheck, Clock3, ClipboardCheck } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { duration } from '../../lib/format';
import type { Report } from '../../services/types';
import { useState } from 'react';
interface Props {
  report: Report;
  onExport: () => void;
  onEdit: (id: string) => void;
  onReview: () => void;
}
export function MonthlyReport(props: Props) {
  return (
    <ReportContent key={`${props.report.month}-${props.report.reportingTimeZone}`} {...props} />
  );
}
function ReportContent({ report, onExport, onEdit, onReview }: Props) {
  const [selectedDate, setSelectedDate] = useState('');
  return (
    <>
      <div className="report-heading">
        <div>
          <h1>月度报告</h1>
          <p>
            {report.month} · {report.reportingTimeZone}
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <Button onClick={onExport} disabled={!report.rows.length}>
            <Download size={17} />
            导出整月
          </Button>
          <p className="text-xs text-muted-foreground">
            导出范围：{report.month} 整月 · {report.rows.length} 个时段
          </p>
          <p className="text-xs text-muted-foreground">
            搜索和日期筛选仅影响明细，不影响整月导出。
          </p>
        </div>
      </div>
      <div className="report-stats">
        <Card>
          <CardContent className="flex flex-col gap-3">
            <Clock3 size={20} />
            <span>已确认工时</span>
            <strong className="stat-value">{duration(report.durationMs)}</strong>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-3">
            <CalendarCheck size={20} />
            <span>工作天数</span>
            <strong className="stat-value">
              {report.workedDayCount} <small>天</small>
            </strong>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-3">
            <ClipboardCheck size={20} />
            <span>尚未计入</span>
            <strong className="stat-value">
              {report.pendingCount} <small>条待核对</small>
            </strong>
            <p>{report.activeCount} 条活动记录</p>
            <Button variant="link" onClick={onReview}>
              查看待核对记录
            </Button>
          </CardContent>
        </Card>
      </div>
      <DailyDurationChart
        days={report.days}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
      />
      <WorkDetailsTable
        key={report.month}
        rows={report.rows}
        zone={report.reportingTimeZone}
        onEdit={onEdit}
        selectedDate={selectedDate}
        onClearDate={() => setSelectedDate('')}
      />
    </>
  );
}
