import { render, screen, fireEvent } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { DateTimePicker, MonthPicker } from './date-time-picker';

it('opens a Chinese calendar and preserves wall clock time when changing the date', () => {
  const onChange = vi.fn();
  render(<DateTimePicker label="开始" value="2026-10-03T09:12:34" onChange={onChange} />);
  fireEvent.click(screen.getByRole('button', { name: '开始日期' }));
  fireEvent.click(screen.getByRole('button', { name: /2026年10月4日/ }));
  expect(onChange).toHaveBeenCalledWith('2026-10-04T09:12:34');
});

it('keeps an active open end empty and disables all controls', () => {
  render(<DateTimePicker label="结束" value="" disabled onChange={vi.fn()} />);
  expect(screen.getByRole('button', { name: '结束日期' })).toBeDisabled();
  for (const control of screen.getAllByRole('combobox')) expect(control).toBeDisabled();
  expect(screen.getByText('选择日期')).toBeInTheDocument();
});

it('selects a report month without depending on native month inputs', () => {
  const onChange = vi.fn();
  render(<MonthPicker value="2026-10" onChange={onChange} />);
  fireEvent.click(screen.getByRole('button', { name: /报告月份/ }));
  fireEvent.click(screen.getByRole('button', { name: '11月' }));
  expect(onChange).toHaveBeenCalledWith('2026-11');
});
