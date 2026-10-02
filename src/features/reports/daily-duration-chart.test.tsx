import { render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DailyDurationChart, formatHourTick } from './daily-duration-chart';

afterEach(() => vi.restoreAllMocks());

it('formats fractional hours without leaking repeating decimals into labels', () => {
  expect(formatHourTick(0)).toBe('0');
  expect(formatHourTick(8.5 * 3600000)).toBe('8.5');
  expect(formatHourTick((8.5 * 3600000) / 3)).toBe('2.8');
  expect(formatHourTick((8.5 * 3600000 * 2) / 3)).toBe('5.7');
});

it('uses whole-hour ticks that contain an 8.5-hour day', () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const width = this.tagName === 'SPAN' ? 16 : 640;
    const height = this.tagName === 'SPAN' ? 12 : 256;
    return {
      width,
      height,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    };
  });
  const { container } = render(
    <DailyDurationChart days={[{ date: '2026-10-02', durationMs: 8.5 * 3600000 }]} />,
  );
  const ticks = Array.from(
    container.querySelectorAll('.recharts-yAxis-tick-labels text'),
    (node) => node.textContent,
  );
  expect(ticks).toEqual(['0', '3', '6', '9', '12']);
});
