import { render, screen, fireEvent } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { DateTimePicker, MonthPicker } from './date-time-picker';
import { useState } from 'react';

it('accepts typed minutes while preserving seconds and blocks invalid input', () => {
  function Form() {
    const [value, setValue] = useState('2026-10-03T09:12:34');
    return (
      <form>
        <DateTimePicker label="开始" value={value} onChange={setValue} />
        <output>{value}</output>
      </form>
    );
  }
  render(<Form />);
  const input = screen.getByRole('textbox', { name: '开始时间输入' });
  fireEvent.change(input, { target: { value: '10:30' } });
  fireEvent.blur(input);
  expect(screen.getByText('2026-10-03T10:30:34')).toBeInTheDocument();
  fireEvent.change(input, { target: { value: '25:90' } });
  fireEvent.blur(input);
  expect(input).toBeInvalid();
  expect(screen.getByRole('alert')).toHaveTextContent('HH:mm');
  expect(screen.getByText('2026-10-03T10:30:34')).toBeInTheDocument();
});

it('adjusts minutes across midnight without losing seconds', () => {
  function Form() {
    const [value, setValue] = useState('2026-10-03T23:58:34');
    return <DateTimePicker label="开始" value={value} onChange={setValue} />;
  }
  render(<Form />);
  fireEvent.click(screen.getByRole('button', { name: '开始增加 5 分钟' }));
  expect(screen.getByRole('button', { name: '开始日期' })).toHaveTextContent('2026-10-04');
  expect(screen.getByRole('textbox', { name: '开始时间输入' })).toHaveValue('00:03:34');
  fireEvent.click(screen.getByRole('button', { name: '开始减少 15 分钟' }));
  expect(screen.getByRole('button', { name: '开始日期' })).toHaveTextContent('2026-10-03');
  expect(screen.getByRole('textbox', { name: '开始时间输入' })).toHaveValue('23:48:34');
});

it('changes minutes inside a form without resetting the selected time', () => {
  Element.prototype.scrollIntoView = vi.fn();
  function Form() {
    const [value, setValue] = useState('2026-10-03T09:12:34');
    return (
      <form>
        <DateTimePicker label="开始" value={value} onChange={setValue} />
        <output>{value}</output>
      </form>
    );
  }
  render(<Form />);
  fireEvent.keyDown(screen.getByRole('combobox', { name: '开始分' }), { key: 'ArrowDown' });
  fireEvent.click(screen.getByRole('option', { name: '30分' }));
  expect(screen.getByText('2026-10-03T09:30:34')).toBeInTheDocument();
});

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
