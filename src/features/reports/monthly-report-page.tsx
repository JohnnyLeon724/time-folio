import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { EmptyState } from '@/components/empty-state';
import { Download, CalendarCheck, Clock3, ClipboardCheck } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { duration, time } from '../../lib/format';
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
      <section className="report-table">
        <div className="section-toolbar">
          <h2>工作明细</h2>
          <span className="muted">仅包含已确认记录</span>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>日期</TableHead>
              <TableHead>任务</TableHead>
              <TableHead>工作时段</TableHead>
              <TableHead>时长</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.rows.map((r, i) => (
              <TableRow key={`${r.entryId}-${i}`}>
                <TableCell>{r.workDate}</TableCell>
                <TableCell>
                  <Button
                    variant="link"
                    className="h-auto p-0 text-left whitespace-normal"
                    onClick={() => onEdit(r.entryId)}
                  >
                    {r.title}
                  </Button>
                </TableCell>
                <TableCell>
                  {time(r.startAt, report.reportingTimeZone)} –{' '}
                  {time(r.endAt, report.reportingTimeZone)}
                </TableCell>
                <TableCell>{duration(r.durationMs)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!report.rows.length && (
          <EmptyState
            title="这个月还没有已确认工时"
            description="结束计时并完成核对后，记录会出现在这里。"
          />
        )}
      </section>
    </>
  );
}
