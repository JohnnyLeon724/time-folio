import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Cell } from 'recharts';
import { NativeSelect } from '@/components/ui/native-select';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { duration } from '@/lib/format';
import type { Report } from '@/services/types';

const config = {
  durationMs: { label: '已确认工时', color: 'var(--work-completed)' },
} satisfies ChartConfig;

export function formatHourTick(value: number) {
  return Number((Number(value) / 3600000).toFixed(1)).toString();
}

export function DailyDurationChart({
  days,
  selectedDate = '',
  onSelectDate,
}: {
  days: Report['days'];
  selectedDate?: string;
  onSelectDate?: (date: string) => void;
}) {
  const stepHours = Math.ceil(Math.max(8, ...days.map((day) => day.durationMs / 3600000)) / 4);
  const ticks = Array.from({ length: 5 }, (_, i) => i * stepHours * 3600000);
  return (
    <section className="report-chart">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <h2>每天的投入</h2>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="size-2 rounded-full bg-[var(--work-completed)]" />
          已确认工时 · 小时
        </span>
      </div>
      {onSelectDate && (
        <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
          <span>点击柱形或选择日期查看明细</span>
          <NativeSelect
            aria-label="筛选明细日期"
            value={selectedDate}
            onChange={(e) => onSelectDate(e.target.value)}
          >
            <option value="">全部日期</option>
            {days.map((day) => (
              <option key={day.date} value={day.date}>
                {day.date} · {duration(day.durationMs, true)}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}
      <ChartContainer
        config={config}
        className="h-64 w-full"
        aria-label="每日已确认工时柱状图，使用左右方向键查看每日时长"
      >
        <BarChart
          accessibilityLayer
          data={days}
          margin={{ top: 12, right: 12, left: 8, bottom: 0 }}
        >
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tickFormatter={(value) => `${Number(String(value).slice(8))}`}
            tickLine={false}
            axisLine={false}
            tickMargin={10}
            minTickGap={8}
          />
          <YAxis
            tickFormatter={formatHourTick}
            domain={[0, ticks[4]]}
            ticks={ticks}
            tickLine={false}
            axisLine={false}
            width={44}
          />
          <ChartTooltip
            cursor={{ fill: 'var(--muted)', opacity: 0.6 }}
            content={
              <ChartTooltipContent
                labelFormatter={(label) => `${label}`}
                formatter={(value) => (
                  <div className="flex min-w-36 items-center justify-between gap-5">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <span className="size-2 rounded-sm bg-[var(--work-completed)]" />
                      已确认工时
                    </span>
                    <strong className="tabular-nums">{duration(Number(value), true)}</strong>
                  </div>
                )}
              />
            }
          />
          <Bar
            dataKey="durationMs"
            fill="var(--color-durationMs)"
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
            isAnimationActive={false}
            onClick={(bar) => onSelectDate?.(bar.payload.date)}
            cursor={onSelectDate ? 'pointer' : undefined}
          >
            {days.map((day) => (
              <Cell
                key={day.date}
                fillOpacity={!selectedDate || day.date === selectedDate ? 1 : 0.3}
              />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
      {!days.some((day) => day.durationMs > 0) && (
        <p className="mt-3 text-center text-sm text-muted-foreground">
          暂无已确认工时，完成记录后即可查看每日趋势。
        </p>
      )}
    </section>
  );
}
