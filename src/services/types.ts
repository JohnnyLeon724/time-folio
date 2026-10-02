export type Status = 'running' | 'paused' | 'needs_review' | 'completed';
export interface Segment {
  id: string;
  entryId: string;
  startAt: number;
  endAt: number | null;
}
export interface ReviewItem {
  id: string;
  entryId: string;
  reason: string;
  candidateStartAt: number | null;
  candidateEndAt: number | null;
  boundaryQuality: string;
  resolution: string;
  resolvedAt: number | null;
}
export interface Entry {
  id: string;
  title: string;
  note: string | null;
  source: 'manual' | 'timer';
  status: Status;
  version: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  segments: Segment[];
  reviewItems: ReviewItem[];
}
export interface Settings {
  reportingTimeZone: string;
  weekStartsOn: number;
  confirmed: boolean;
}
export interface TimerState {
  activeEntry: Entry | null;
  closedDurationMs: number;
  serverNow: number;
  workspaceRevision: string;
  storageError: string | null;
}
export interface Workspace {
  lastExportAt?: number | null;
  entries: Entry[];
  settings: Settings;
  timer: TimerState;
}
export interface Context {
  requestId: string;
  workspaceRevision: string;
  expectedEntryVersion: number | null;
}
export interface Mutation<T> {
  value: T;
  workspaceRevision: string;
}
export interface AppError {
  code: string;
  message: string;
  details?: {
    offsets?: number[];
    entryId?: string;
    segmentId?: string;
    conflictingSegmentId?: string;
    title?: string;
    startAt?: number;
    endAt?: number | null;
  };
  retryable?: boolean;
}
export interface Report {
  month: string;
  reportingTimeZone: string;
  durationMs: number;
  workedDayCount: number;
  days: { date: string; durationMs: number }[];
  rows: {
    entryId: string;
    title: string;
    startAt: number;
    endAt: number;
    durationMs: number;
    workDate: string;
    note: string | null;
  }[];
  pendingCount: number;
  activeCount: number;
}
export interface Preview {
  token: string;
  entryCount: number;
  segmentCount: number;
  reviewCount: number;
  deletedCount: number;
  durationMs: number;
  reportingTimeZone: string;
  exportedAt: string;
  replacesLocal: boolean;
  expiresAt: number;
  sourceVersion: string;
  coverageStart: number | null;
  coverageEnd: number | null;
  reportComparison: unknown[];
}
