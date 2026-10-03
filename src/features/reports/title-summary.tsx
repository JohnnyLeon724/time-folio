import { Fragment, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/empty-state';
import { duration, localDate, time } from '../../lib/format';
import type { Report } from '../../services/types';

type RecordTotal = { entryId: string; startAt: number; endAt: number; durationMs: number };
type TitleTotal = { title: string; durationMs: number; records: RecordTotal[] };
const PAGE_SIZE = 8;

export function summarizeTitles(rows: Report['rows']): TitleTotal[] {
  const groups = new Map<string, Map<string, RecordTotal>>();
  for (const row of rows) {
    const title = row.title.trim();
    const records = groups.get(title) ?? new Map<string, RecordTotal>();
    const record = records.get(row.entryId);
    if (record) {
      record.durationMs += row.durationMs;
      record.startAt = Math.min(record.startAt, row.startAt);
      record.endAt = Math.max(record.endAt, row.endAt);
    } else {
      records.set(row.entryId, {
        entryId: row.entryId,
        startAt: row.startAt,
        endAt: row.endAt,
        durationMs: row.durationMs,
      });
    }
    groups.set(title, records);
  }
  return [...groups]
    .map(([title, records]) => ({
      title,
      durationMs: [...records.values()].reduce((total, record) => total + record.durationMs, 0),
      records: [...records.values()].sort(
        (a, b) => a.startAt - b.startAt || a.entryId.localeCompare(b.entryId),
      ),
    }))
    .sort((a, b) => b.durationMs - a.durationMs || a.title.localeCompare(b.title));
}

function Pagination({
  page,
  pages,
  label,
  onPage,
}: {
  page: number;
  pages: number;
  label: string;
  onPage: (page: number) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      <span className="text-sm text-muted-foreground">
        {label}第 {page + 1} / {pages} 页
      </span>
      <Button
        variant="outline"
        size="sm"
        aria-label={`上一页${label}`}
        disabled={page === 0}
        onClick={() => onPage(page - 1)}
      >
        上一页
      </Button>
      <Button
        variant="outline"
        size="sm"
        aria-label={`下一页${label}`}
        disabled={page >= pages - 1}
        onClick={() => onPage(page + 1)}
      >
        下一页
      </Button>
    </div>
  );
}

function OriginalRecords({
  records,
  zone,
  onEdit,
}: {
  records: RecordTotal[];
  zone: string;
  onEdit: (id: string) => void;
}) {
  const [requestedPage, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(records.length / PAGE_SIZE));
  const page = Math.min(requestedPage, pages - 1);
  return (
    <div className="flex flex-col gap-3 p-2">
      <p className="text-sm text-muted-foreground">
        以下为各原记录在当前周期内的累计时长；日期范围可能包含休息间隔，点击可查看完整记录。
      </p>
      <ul className="flex flex-col gap-2">
        {records.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((record) => (
          <li key={record.entryId} className="flex flex-wrap items-center justify-between gap-2">
            <Button
              variant="link"
              className="h-auto whitespace-normal text-left"
              onClick={() => onEdit(record.entryId)}
            >
              查看原记录 · {localDate(record.startAt, zone)} {time(record.startAt, zone)} 至{' '}
              {localDate(record.endAt, zone)} {time(record.endAt, zone)}
            </Button>
            <span className="tabular-nums">{duration(record.durationMs, true)}</span>
          </li>
        ))}
      </ul>
      {pages > 1 && <Pagination page={page} pages={pages} label="原记录" onPage={setPage} />}
    </div>
  );
}

export function TitleSummary({
  rows,
  zone,
  onEdit,
}: {
  rows: Report['rows'];
  zone: string;
  onEdit: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [requestedPage, setPage] = useState(0);
  const groups = useMemo(() => summarizeTitles(rows), [rows]);
  const filtered = groups.filter((group) =>
    group.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(requestedPage, pages - 1);
  return (
    <section aria-label="按标题汇总" className="flex flex-col gap-3 my-6">
      <h2>按标题汇总</h2>
      <p className="text-sm text-muted-foreground">
        统计完整的当前周或月，不受明细搜索和日期筛选影响。去除首尾空格后完全同名的记录归为一组，区分大小写；仅合计已确认时长，不合并原记录。
      </p>
      <Input
        aria-label="搜索汇总标题"
        placeholder="搜索汇总标题"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(0);
          setExpanded(null);
        }}
      />
      {!filtered.length ? (
        <EmptyState
          title={groups.length ? '没有匹配的标题' : '所选期间还没有已确认记录'}
          description={
            groups.length ? '请调整搜索关键词。' : '完成记录核对后，可在这里查看累计投入。'
          }
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>标题</TableHead>
                <TableHead>原始记录</TableHead>
                <TableHead>累计时长</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((group) => (
                <Fragment key={group.title}>
                  <TableRow>
                    <TableCell>
                      <Button
                        variant="ghost"
                        className="h-auto whitespace-normal text-left"
                        aria-label={`${expanded === group.title ? '收起' : '展开'}标题汇总 ${group.title}`}
                        aria-expanded={expanded === group.title}
                        onClick={() => setExpanded(expanded === group.title ? null : group.title)}
                      >
                        {expanded === group.title ? (
                          <ChevronDown data-icon="inline-start" />
                        ) : (
                          <ChevronRight data-icon="inline-start" />
                        )}
                        {group.title}
                      </Button>
                    </TableCell>
                    <TableCell>{group.records.length} 条记录</TableCell>
                    <TableCell className="tabular-nums">
                      {duration(group.durationMs, true)}
                    </TableCell>
                  </TableRow>
                  {expanded === group.title && (
                    <TableRow>
                      <TableCell colSpan={3}>
                        <OriginalRecords records={group.records} zone={zone} onEdit={onEdit} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
          {pages > 1 && (
            <Pagination
              page={page}
              pages={pages}
              label="标题"
              onPage={(value) => {
                setPage(value);
                setExpanded(null);
              }}
            />
          )}
        </>
      )}
    </section>
  );
}
