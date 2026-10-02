import { Card, CardContent } from '@/components/ui/card';
import { WorkDetailsTable } from './work-details-table';

import { Download, CalendarCheck, Clock3, ClipboardCheck } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { duration } from '../../lib/format';
import type { Report } from '../../services/types';
export function MonthlyReport({
  report,
  onExport,
  onEdit,
}: {
  report: Report;
  onExport: () => void;
  onEdit: (id: string) => void;
}) {
  const max = Math.max(8 * 3600000, ...report.days.map((d) => d.durationMs));
  return (
    <>
      <div className="report-heading">
        <div>
          <h1>月度报告</h1>
          <p>
            {report.month} · {report.reportingTimeZone}
          </p>
        </div>
        <Button onClick={onExport}>
          <Download size={17} />
          导出工时表
        </Button>
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
          </CardContent>
        </Card>
      </div>
      <section className="report-chart">
        <h2>每天的投入</h2>
        <div className="bar-chart">
          {report.days.map((d) => (
            <div className="bar-column" key={d.date} title={`${d.date}：${duration(d.durationMs)}`}>
              <div className="bar-track">
                <div className="bar" style={{ height: `${(100 * d.durationMs) / max}%` }} />
              </div>
              <span>{Number(d.date.slice(8))}</span>
            </div>
          ))}
        </div>
      </section>
      <WorkDetailsTable
        key={report.month}
        rows={report.rows}
        zone={report.reportingTimeZone}
        onEdit={onEdit}
      />
    </>
  );
}
