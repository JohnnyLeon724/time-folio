import type { Entry } from '../../services/types';

export type RecentEntry = Pick<Entry, 'title' | 'createdAt' | 'deletedAt'>;

export function recentTitles(entries: readonly RecentEntry[], query: string): string[] {
  const search = query.trim().toLocaleLowerCase();
  const titles = entries
    .filter((entry) => entry.deletedAt === null)
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((entry) => entry.title.trim())
    .filter((title) => title && title.toLocaleLowerCase().includes(search));
  return [...new Set(titles)].slice(0, 8);
}
