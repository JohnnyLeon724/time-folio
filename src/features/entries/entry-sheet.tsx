import { DateTimePicker } from '@/components/date-time-picker';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field, FieldLabel } from '@/components/ui/field';
import { NativeSelect } from '@/components/ui/native-select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertDialogCancel } from '@/components/ui/alert-dialog';
import { useState, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2, Clock3, AlertCircle } from 'lucide-react';
import { Modal } from '../../components/modal';
import { Button } from '../../components/ui/button';
import { command } from '../../services/client';
import type { Entry, Context, AppError, Mutation } from '../../services/types';
import { duration, localInput, statusText } from '../../lib/format';
const schema = z.object({
  title: z
    .string()
    .trim()
    .min(1, '请填写任务标题')
    .refine((s) => [...s].length <= 200, '标题最多 200 个字符'),
  note: z.string().refine((s) => [...s].length <= 10000, '备注最多 10,000 个字符'),
});
interface Row {
  reviewId?: string;
  id: string;
  start: string;
  end: string;
  originalStart?: number;
  originalEnd?: number | null;
  startOffset?: number;
  endOffset?: number;
}
export function EntrySheet({
  entry,
  date,
  zone,
  revision,
  onClose,
  onSaved,
  hasActive,
}: {
  entry?: Entry;
  date: string;
  zone: string;
  revision: string;
  onClose: () => void;
  onSaved: (entry: Entry) => void;
  hasActive: boolean;
}) {
  const eid = useRef(entry?.id ?? crypto.randomUUID()).current;
  const createdNow = useRef(Date.now()).current;
  const context = useRef<Context>({
    requestId: crypto.randomUUID(),
    workspaceRevision: revision,
    expectedEntryVersion: entry?.version ?? null,
  });
  const lastPayload = useRef('');
  const [rows, setRows] = useState<Row[]>(
    entry
      ? entry.segments.map((s) => ({
          id: s.id,
          start: localInput(s.startAt, zone),
          end: s.endAt === null ? '' : localInput(s.endAt, zone),
          originalStart: s.startAt,
          originalEnd: s.endAt,
        }))
      : [{ id: crypto.randomUUID(), start: `${date}T09:00:00`, end: `${date}T10:00:00` }],
  );
  const [reviews, setReviews] = useState(entry?.reviewItems ?? []);
  const initialPeriods = useRef(JSON.stringify({ rows, reviews })).current;
  const saving = useRef(false);
  const [previewMs, setPreviewMs] = useState<number | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [deleteConfirm, setDeleteConfirm] = useState(false),
    [discardConfirm, setDiscardConfirm] = useState(false),
    [ambiguity, setAmbiguity] = useState<{
      id: string;
      field: 'start' | 'end';
      offsets: number[];
    } | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
    getValues,
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { title: entry?.title ?? '', note: entry?.note ?? '' },
  });
  const active = entry?.status === 'running' || entry?.status === 'paused';
  const review = entry?.status === 'needs_review';
  function requestClose() {
    if (saving.current || deleteConfirm || discardConfirm) return;
    const form = getValues();
    const changed =
      form.title !== (entry?.title ?? '') ||
      form.note !== (entry?.note ?? '') ||
      JSON.stringify({ rows, reviews }) !== initialPeriods;
    if (changed) setDiscardConfirm(true);
    else onClose();
  }
  function change(id: string, field: 'start' | 'end', value: string) {
    setRows((old) =>
      old.map((r) => (r.id === id ? { ...r, [field]: value, [`${field}Offset`]: undefined } : r)),
    );
    setAmbiguity(null);
  }
  async function parse(row: Row, field: 'start' | 'end'): Promise<number> {
    const value = row[field],
      original = field === 'start' ? row.originalStart : row.originalEnd;
    if (original != null && value === localInput(original, zone)) return original;
    try {
      return await command<number>('parse_local', { value, zone, offset: row[`${field}Offset`] });
    } catch (e) {
      const err = e as AppError;
      if (err.code === 'AMBIGUOUS_TIME' && err.details?.offsets)
        setAmbiguity({ id: row.id, field, offsets: err.details.offsets });
      throw e;
    }
  }
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void Promise.all(
        rows.map(async (r) => {
          const a =
            r.originalStart != null && r.start === localInput(r.originalStart, zone)
              ? r.originalStart
              : await command<number>('parse_local', {
                  value: r.start,
                  zone,
                  offset: r.startOffset,
                });
          const b =
            r.originalEnd != null && r.end === localInput(r.originalEnd, zone)
              ? r.originalEnd
              : await command<number>('parse_local', { value: r.end, zone, offset: r.endOffset });
          if (b <= a) throw new Error();
          return b - a;
        }),
      )
        .then((values) => {
          if (!cancelled) setPreviewMs(values.reduce((a, b) => a + b, 0));
        })
        .catch(() => {
          if (!cancelled) setPreviewMs(null);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [rows, zone]);
  async function save(continueTimer = false) {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      const form = getValues();
      const segments = active
        ? entry!.segments
        : await Promise.all(
            rows.map(async (row) => ({
              id: row.id,
              entryId: eid,
              startAt: await parse(row, 'start'),
              endAt: await parse(row, 'end'),
            })),
          );
      const now = createdNow;
      const value: Entry = {
        id: eid,
        title: form.title.trim(),
        note: form.note || null,
        source: entry?.source ?? 'manual',
        status: entry?.status ?? 'completed',
        version: entry?.version ?? 1,
        createdAt: entry?.createdAt ?? now,
        updatedAt: now,
        deletedAt: null,
        segments,
        reviewItems: reviews,
      };
      const payload = JSON.stringify({ entry: { ...value, updatedAt: 0 }, continueTimer });
      if (lastPayload.current && lastPayload.current !== payload)
        context.current.requestId = crypto.randomUUID();
      lastPayload.current = payload;
      const result = await command<Mutation<Entry>>(review ? 'resolve_entry' : 'save_entry', {
        context: context.current,
        entry: value,
        continueTimer,
      });
      onSaved(result.value);
    } catch (e) {
      setError((e as AppError).message);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  function choose(reviewId: string, resolution: string) {
    const item = reviews.find((r) => r.id === reviewId)!;
    setReviews((old) => old.map((r) => (r.id === reviewId ? { ...r, resolution } : r)));
    if (
      resolution === 'included' &&
      item.candidateStartAt != null &&
      item.candidateEndAt != null &&
      item.candidateEndAt > item.candidateStartAt
    ) {
      const start = localInput(item.candidateStartAt, zone),
        end = localInput(item.candidateEndAt, zone);
      setRows((old) =>
        old.some((r) => r.reviewId === reviewId)
          ? old
          : [
              ...old,
              {
                id: crypto.randomUUID(),
                reviewId,
                start,
                end,
                originalStart: item.candidateStartAt!,
                originalEnd: item.candidateEndAt,
              },
            ],
      );
    } else if (resolution === 'excluded' || resolution === 'unresolved') {
      setRows((old) => old.filter((r) => r.reviewId !== reviewId));
    }
  }
  async function remove() {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    try {
      await command('delete_entry', {
        context: { ...context.current, requestId: crypto.randomUUID() },
        entryId: eid,
      });
      onSaved(entry!);
    } catch (e) {
      setError((e as AppError).message);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal
      side
      title={entry ? (review ? '核对这段工作' : '工作记录') : '补录工作'}
      description={`所有时间均使用 ${zone}。${entry ? statusText[entry.status] : '保存后计入正式报表。'}`}
      onClose={requestClose}
    >
      <form onSubmit={handleSubmit(() => save())} className="entry-form">
        <Field>
          <FieldLabel htmlFor="entry-title">任务标题</FieldLabel>
          <Input
            id="entry-title"
            aria-invalid={!!errors.title}
            autoFocus
            {...register('title')}
            placeholder="例如：完成登录页面"
          />
        </Field>
        {errors.title && <p className="error">{errors.title.message}</p>}
        <div className="field-heading">
          <span>实际工作时段</span>
          {!active && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                setRows((old) => [
                  ...old,
                  { id: crypto.randomUUID(), start: `${date}T09:00:00`, end: `${date}T10:00:00` },
                ])
              }
            >
              <Plus size={14} />
              添加时段
            </Button>
          )}
        </div>
        {!rows.length && <p className="muted">尚无有效时段，请补充时间，或删除这条记录。</p>}
        {rows.map((row, i) => (
          <div className="segment-row" key={row.id}>
            <span className="segment-index">{i + 1}</span>
            <div className="segment-field">
              <span>开始</span>
              <DateTimePicker
                label={`时段 ${i + 1} 开始`}
                value={row.start}
                disabled={active}
                onChange={(value) => change(row.id, 'start', value)}
              />
            </div>
            <span className="segment-separator">至</span>
            <div className="segment-field">
              <span>结束</span>
              <DateTimePicker
                label={`时段 ${i + 1} 结束`}
                value={row.end}
                disabled={active}
                onChange={(value) => change(row.id, 'end', value)}
              />
            </div>
            {!active && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`移除时段 ${i + 1}`}
                onClick={() => setRows((old) => old.filter((r) => r.id !== row.id))}
              >
                <Trash2 size={16} />
              </Button>
            )}
          </div>
        ))}
        {ambiguity && (
          <label className="review-notice">
            该时间出现两次，请选择偏移
            <NativeSelect
              value=""
              onChange={(e) => {
                setRows((old) =>
                  old.map((r) =>
                    r.id === ambiguity.id
                      ? { ...r, [`${ambiguity.field}Offset`]: Number(e.target.value) }
                      : r,
                  ),
                );
                setAmbiguity(null);
                setError('偏移已选择，请再次保存。');
              }}
            >
              <option value="">选择 UTC 偏移</option>
              {ambiguity.offsets.map((o) => (
                <option value={o} key={o}>
                  UTC{o >= 0 ? '+' : ''}
                  {o / 3600}
                </option>
              ))}
            </NativeSelect>
          </label>
        )}
        <div className="duration-preview">
          <Clock3 size={16} />
          时长预览：{previewMs === null ? '请填写有效的起止时间' : duration(previewMs, true)}
          <small>保存时会再次校验时间冲突。</small>
        </div>
        {reviews.map((r) => (
          <div className="review-notice" key={r.id}>
            <div>
              <AlertCircle size={17} />
              <strong>
                {{
                  sleep: '休眠中断',
                  recovery: '异常退出恢复',
                  interruption: '运行中断',
                  clock_change: '系统时间变化',
                }[r.reason] ?? r.reason}
              </strong>
              <span>{r.boundaryQuality === 'estimated' ? '估计边界，可修改' : '检测边界'}</span>
            </div>
            <p>
              {r.candidateStartAt
                ? localInput(r.candidateStartAt, zone).replace('T', ' ')
                : '未知起点'}{' '}
              至{' '}
              {r.candidateEndAt ? localInput(r.candidateEndAt, zone).replace('T', ' ') : '未知终点'}
            </p>
            <NativeSelect
              aria-label="中断时间处理"
              value={r.resolution}
              onChange={(e) => choose(r.id, e.target.value)}
            >
              <option value="unresolved">选择处理方式</option>
              <option value="included">计入，并添加候选时段</option>
              <option value="excluded">排除（请检查上方时段）</option>
              <option value="adjusted">已在上方手动修正</option>
            </NativeSelect>
          </div>
        ))}
        <Field>
          <FieldLabel htmlFor="entry-note">
            备注 <span className="muted">可选</span>
          </FieldLabel>
          <Textarea
            id="entry-note"
            aria-invalid={!!errors.note}
            {...register('note')}
            rows={3}
            placeholder="记录完成了什么，方便月底回顾。"
          />
        </Field>
        {errors.note && <p className="error">{errors.note.message}</p>}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <footer className="modal-footer">
          {entry && !active && (
            <Button type="button" variant="ghost" onClick={() => setDeleteConfirm(true)}>
              <Trash2 size={15} />
              删除
            </Button>
          )}
          <div className="spacer" />
          <Button type="button" variant="secondary" disabled={busy} onClick={requestClose}>
            {review ? '稍后核对' : '取消'}
          </Button>
          {review && !hasActive && (
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => void handleSubmit(() => save(true))()}
            >
              核对并继续
            </Button>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? '保存中…' : review ? '确认保存' : '保存记录'}
          </Button>
        </footer>
      </form>
      {discardConfirm && (
        <Modal
          confirmation
          title="放弃未保存的修改？"
          description="修改尚未保存。继续编辑可保留当前标题、时段和核对选项。"
          onClose={() => setDiscardConfirm(false)}
        >
          <div className="modal-footer">
            <AlertDialogCancel onClick={() => setDiscardConfirm(false)}>继续编辑</AlertDialogCancel>
            <Button variant="destructive" onClick={onClose}>
              放弃修改
            </Button>
          </div>
        </Modal>
      )}
      {deleteConfirm && (
        <Modal
          confirmation
          title="删除这条记录？"
          description="记录会移入回收站，不再计入正式工时。"
          onClose={() => {
            if (!busy) setDeleteConfirm(false);
          }}
        >
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="modal-footer">
            <AlertDialogCancel disabled={busy} onClick={() => setDeleteConfirm(false)}>
              取消
            </AlertDialogCancel>
            <Button variant="destructive" onClick={() => void remove()} disabled={busy}>
              确认删除
            </Button>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
