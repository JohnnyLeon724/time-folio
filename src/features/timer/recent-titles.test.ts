import { describe, expect, it } from 'vitest';
import { recentTitles } from './recent-titles';

describe('recentTitles', () => {
  it('sorts by creation, trims and deduplicates titles, and excludes deleted records', () => {
    const entries = [
      { title: ' 阅读 ', createdAt: 1, deletedAt: null },
      { title: '写作', createdAt: 2, deletedAt: null },
      { title: '阅读', createdAt: 3, deletedAt: null },
      { title: '删除', createdAt: 4, deletedAt: 5 },
      { title: ' ', createdAt: 5, deletedAt: null },
    ];
    expect(recentTitles(entries, '')).toEqual(['阅读', '写作']);
    expect(entries[0].title).toBe(' 阅读 ');
  });
  it('searches before limiting to eight suggestions', () => {
    const entries = Array.from({ length: 12 }, (_, i) => ({
      title: `Task ${i}`,
      createdAt: i,
      deletedAt: null,
    }));
    expect(recentTitles(entries, '')).toHaveLength(8);
    expect(recentTitles(entries, ' task 0 ')).toEqual(['Task 0']);
  });
});
