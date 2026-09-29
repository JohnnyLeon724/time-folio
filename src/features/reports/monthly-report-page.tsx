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
        <div>
          <Clock3 size={20} />
          <span>已确认工时</span>
          <strong>{duration(report.durationMs)}</strong>
        </div>
        <div>
          <CalendarCheck size={20} />
          <span>工作天数</span>
          <strong>
            {report.workedDayCount} <small>天</small>
          </strong>
        </div>
        <div>
          <ClipboardCheck size={20} />
          <span>尚未计入</span>
          <strong>
            {report.pendingCount} <small>条待核对</small>
          </strong>
          <p>{report.activeCount} 条活动记录</p>
        </div>
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
        <table>
          <thead>
            <tr>
              <th>日期</th>
              <th>任务</th>
              <th>工作时段</th>
              <th>时长</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((r, i) => (
              <tr key={`${r.entryId}-${i}`}>
                <td>{r.workDate}</td>
                <td>
                  <button className="text-link" onClick={() => onEdit(r.entryId)}>
                    {r.title}
                  </button>
                </td>
                <td>
                  {time(r.startAt, report.reportingTimeZone)} –{' '}
                  {time(r.endAt, report.reportingTimeZone)}
                </td>
                <td>{duration(r.durationMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!report.rows.length && (
          <div className="empty-state">
            <Clock3 size={30} />
            <h3>这个月还没有已确认工时</h3>
            <p>结束计时并完成核对后，记录会出现在这里。</p>
          </div>
        )}
      </section>
    </>
  );
}
