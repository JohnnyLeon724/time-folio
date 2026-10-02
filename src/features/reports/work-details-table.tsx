import { Fragment, useMemo, useState, useEffect } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table';
import { ArrowUpDown, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { EmptyState } from '@/components/empty-state';
import { duration, localDate, time } from '@/lib/format';
import type { Report } from '@/services/types';

type Day = { date: string; periods: Report['rows']; durationMs: number };
const columns: ColumnDef<Day>[] = [
  {
    accessorKey: 'date',
    header: '日期',
    cell: ({ row }) => (
      <Button
        variant="ghost"
        size="sm"
        aria-label={`${row.getIsExpanded() ? '收起' : '展开'} ${row.original.date}`}
        aria-expanded={row.getIsExpanded()}
        onClick={row.getToggleExpandedHandler()}
      >
        {row.getIsExpanded() ? (
          <ChevronDown data-icon="inline-start" />
        ) : (
          <ChevronRight data-icon="inline-start" />
        )}
        {row.original.date}
      </Button>
    ),
  },
  {
    id: 'tasks',
    header: '任务',
    cell: ({ row }) => `${new Set(row.original.periods.map((p) => p.entryId)).size} 个任务`,
  },
  { id: 'periods', header: '工作时段', cell: ({ row }) => `${row.original.periods.length} 个时段` },
  {
    accessorKey: 'durationMs',
    header: '时长',
    cell: ({ row }) => (
      <span className="font-medium tabular-nums">{duration(row.original.durationMs, true)}</span>
    ),
  },
];

export function WorkDetailsTable({
  rows,
  zone,
  onEdit,
  selectedDate = '',
  onClearDate,
}: {
  rows: Report['rows'];
  zone: string;
  onEdit: (id: string) => void;
  selectedDate?: string;
  onClearDate?: () => void;
}) {
  const [search, setSearch] = useState('');
  const data = useMemo(() => {
    const groups = new Map<string, Day>();
    for (const period of rows) {
      if (selectedDate && period.workDate !== selectedDate) continue;
      if (!period.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())) continue;
      const day = groups.get(period.workDate) ?? {
        date: period.workDate,
        periods: [],
        durationMs: 0,
      };
      day.periods.push(period);
      day.durationMs += period.durationMs;
      groups.set(day.date, day);
    }
    return [...groups.values()].map((day) => ({
      ...day,
      periods: day.periods.sort((a, b) => a.startAt - b.startAt),
    }));
  }, [rows, search, selectedDate]);
  const table = useReactTable({
    data,
    columns,
    getRowId: (day) => day.date,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowCanExpand: () => true,
    initialState: {
      sorting: [{ id: 'date', desc: true }],
      pagination: { pageIndex: 0, pageSize: 10 },
    },
  });
  useEffect(() => {
    table.setPageIndex(0);
    table.setExpanded(selectedDate ? { [selectedDate]: true } : {});
  }, [selectedDate, search, table]);
  return (
    <section className="report-table">
      <div className="section-toolbar flex-wrap gap-3">
        <div>
          <h2>工作明细</h2>
          <p className="text-xs text-muted-foreground">
            按日汇总 · 展开查看独立时段 · 仅已确认记录
          </p>
        </div>
        <Input
          aria-label="搜索任务"
          placeholder="搜索任务…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:max-w-60"
        />
      </div>
      {selectedDate && (
        <div className="flex items-center gap-3 px-4 pb-3 text-sm" role="status">
          <span>当前日期：{selectedDate}</span>
          <Button variant="outline" size="sm" onClick={onClearDate}>
            清除日期筛选
          </Button>
        </div>
      )}
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => (
                <TableHead
                  key={header.id}
                  aria-sort={
                    header.column.getIsSorted() === 'asc'
                      ? 'ascending'
                      : header.column.getIsSorted() === 'desc'
                        ? 'descending'
                        : undefined
                  }
                >
                  {header.column.getCanSort() ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      <ArrowUpDown data-icon="inline-end" />
                    </Button>
                  ) : (
                    flexRender(header.column.columnDef.header, header.getContext())
                  )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <Fragment key={row.id}>
              <TableRow className="bg-muted/30">
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
              {row.getIsExpanded() &&
                row.original.periods.map((period, i) => (
                  <TableRow key={`${period.entryId}-${period.startAt}-${i}`}>
                    <TableCell className="pl-7 text-xs text-muted-foreground">
                      时段 {i + 1}
                    </TableCell>
                    <TableCell className="max-w-72">
                      <Button
                        variant="link"
                        className="h-auto justify-start p-0 text-left whitespace-normal break-words"
                        onClick={() => onEdit(period.entryId)}
                      >
                        {period.title}
                      </Button>
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {time(period.startAt, zone)} –{' '}
                      {localDate(period.endAt, zone) !== period.workDate ? '次日 ' : ''}
                      {time(period.endAt, zone)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {duration(period.durationMs, true)}
                    </TableCell>
                  </TableRow>
                ))}
            </Fragment>
          ))}
        </TableBody>
      </Table>
      {!data.length && (
        <EmptyState
          title={search || selectedDate ? '没有匹配的记录' : '这个月还没有已确认工时'}
          description={
            search || selectedDate
              ? '当前日期和任务条件下没有已确认时段，请调整搜索或清除日期筛选。'
              : '结束计时并完成核对后，记录会出现在这里。'
          }
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-xs text-muted-foreground">
        <span>
          {search ? '匹配 ' : '共 '}
          {data.length} 天 · {data.reduce((sum, day) => sum + day.periods.length, 0)} 个时段
        </span>
        <div className="flex items-center gap-3">
          <span>
            第 {table.getState().pagination.pageIndex + 1} / {Math.max(1, table.getPageCount())} 页
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
          >
            上一页
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
          >
            下一页
          </Button>
        </div>
      </div>
    </section>
  );
}
