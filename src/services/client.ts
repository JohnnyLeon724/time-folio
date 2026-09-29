import { invoke, isTauri } from '@tauri-apps/api/core';
import type { AppError } from './types';
export const desktop = isTauri();
export async function command<T>(op: string, input: unknown = {}): Promise<T> {
  try {
    return await invoke<T>('command', { op, input });
  } catch (error) {
    if (error && typeof error === 'object' && 'message' in error) throw error;
    throw {
      code: 'CONNECTION',
      message: desktop
        ? '操作未返回结果，请刷新状态后使用相同请求重试。'
        : '请在 HourTrail 桌面应用中使用记录功能。',
    } satisfies AppError;
  }
}
