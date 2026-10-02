import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
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

export function DailyDurationChart({ days }: { days: Report['days'] }) {
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
      <ChartContainer
        config={config}
        className="h-64 w-full"
        aria-label="每日已确认工时柱状图，使用左右方向键查看每日时长"
      >
        <BarChart
          accessibilityLayer
          data={days}
          margin={{ top: 12, right: 12, left: 0, bottom: 0 }}
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
            tickFormatter={(value) => `${Number(value) / 3600000}`}
            domain={[0, ticks[4]]}
            ticks={ticks}
            tickLine={false}
            axisLine={false}
            width={36}
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
          />
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
