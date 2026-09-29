export function duration(ms: number, seconds = false) {
  const s = Math.max(0, Math.floor(ms / 1000)),
    h = Math.floor(s / 3600),
    m = Math.floor(s / 60) % 60;
  return seconds
    ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
    : `${h} 小时 ${m} 分钟`;
}
export function localDate(ms: number, zone: string) {
  const p = new Intl.DateTimeFormat('sv-SE', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ms);
  return p;
}
export function localInput(ms: number, zone: string) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
    .format(ms)
    .replace(' ', 'T');
}
export function time(ms: number, zone: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(ms);
}
export const statusText = {
  running: '计时中',
  paused: '已暂停',
  needs_review: '待核对',
  completed: '已完成',
};
