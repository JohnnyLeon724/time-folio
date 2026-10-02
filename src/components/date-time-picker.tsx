import { useState } from 'react';
import { zhCN } from 'date-fns/locale';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const pad = (n: number) => String(n).padStart(2, '0');

// Dates here carry calendar fields only. The backend resolves the wall clock in the reporting zone.
export function DateTimePicker({
  value,
  onChange,
  label,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [datePart, timePart = '00:00:00'] = value.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const selected = datePart ? new Date(year, month - 1, day, 12) : undefined;
  const parts = timePart.split(':');
  return (
    <div role="group" aria-label={label} className="flex min-w-0 flex-col gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            aria-label={`${label}日期`}
            className="w-full justify-start font-normal"
          >
            <CalendarDays data-icon="inline-start" />
            {datePart || '选择日期'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            locale={zhCN}
            weekStartsOn={1}
            captionLayout="dropdown"
            startMonth={new Date(1999, 0)}
            endMonth={new Date(2100, 11)}
            defaultMonth={selected}
            selected={selected}
            onSelect={(date) => {
              if (!date) return;
              onChange(
                `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${timePart}`,
              );
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
      <div className="grid grid-cols-3 gap-1">
        {['时', '分', '秒'].map((unit, index) => (
          <Select
            key={unit}
            value={value ? parts[index] || '00' : ''}
            disabled={disabled || !datePart}
            onValueChange={(next) => {
              const updated = [...parts];
              updated[index] = next;
              onChange(`${datePart}T${updated.join(':')}`);
            }}
          >
            <SelectTrigger
              aria-label={`${label}${unit}`}
              className="w-full gap-0 px-1.5 tabular-nums"
            >
              <SelectValue placeholder={unit} />
            </SelectTrigger>
            <SelectContent position="popper" className="max-h-56 min-w-20">
              {Array.from({ length: index === 0 ? 24 : 60 }, (_, n) => (
                <SelectItem key={n} value={pad(n)}>
                  {pad(n)}
                  {unit}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
      </div>
    </div>
  );
}

export function MonthPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(Number(value.slice(0, 4)) || new Date().getFullYear());
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setYear(Number(value.slice(0, 4)) || new Date().getFullYear());
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" aria-label={`报告月份 ${value}`}>
          <CalendarDays data-icon="inline-start" />
          {value.replace('-', ' 年 ')} 月
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start">
        <div className="flex items-center justify-between">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="上一年"
            disabled={year <= 1999}
            onClick={() => setYear(year - 1)}
          >
            <ChevronLeft />
          </Button>
          <span aria-live="polite" className="font-medium">
            {year} 年
          </span>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="下一年"
            disabled={year >= 2100}
            onClick={() => setYear(year + 1)}
          >
            <ChevronRight />
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {Array.from({ length: 12 }, (_, i) => {
            const month = `${year}-${pad(i + 1)}`;
            return (
              <Button
                key={month}
                type="button"
                variant={month === value ? 'default' : 'ghost'}
                aria-pressed={month === value}
                onClick={() => {
                  onChange(month);
                  setOpen(false);
                }}
              >
                {i + 1}月
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
