// Calendar arithmetic only; the backend resolves the result in the reporting time zone.
export function shiftWallMinutes(value: string, minutes: number): string {
  const date = new Date(`${value}Z`);
  if (!Number.isFinite(date.getTime())) return value;
  date.setUTCMinutes(date.getUTCMinutes() + minutes);
  return date.toISOString().slice(0, 19);
}
