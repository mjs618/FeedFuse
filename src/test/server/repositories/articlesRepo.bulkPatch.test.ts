import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

describe('articlesRepo bulk patch', () => {
  it('updates only whitelisted article workflow fields', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 2 });
    const pool = { query } as unknown as Pool;
    const mod = await import('@/server/domains/articles/repositories/articlesRepo');

    const updatedCount = await mod.bulkPatchArticles(pool, ['3001', '3002'], {
      isRead: true,
      isStarred: true,
      isReadLater: true,
      isArchived: true,
    });

    expect(updatedCount).toBe(2);
    expect(query).toHaveBeenCalledTimes(1);
    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain('is_read = $2');
    expect(sql).toContain('read_at = case when $2 then coalesce(read_at, now()) else null end');
    expect(sql).toContain('is_starred = $3');
    expect(sql).toContain('starred_at = case when $3 then coalesce(starred_at, now()) else null end');
    expect(sql).toContain('is_read_later = $4');
    expect(sql).toContain('read_later_at = case when $4 then coalesce(read_later_at, now()) else null end');
    expect(sql).toContain('is_archived = $5');
    expect(sql).toContain('archived_at = case when $5 then coalesce(archived_at, now()) else null end');
    expect(sql).toContain('where id = any($1::bigint[])');
    expect(query.mock.calls[0][1]).toEqual([['3001', '3002'], true, true, true, true]);
  });

  it('throws before querying when the patch is empty', async () => {
    const query = vi.fn();
    const pool = { query } as unknown as Pool;
    const mod = await import('@/server/domains/articles/repositories/articlesRepo');

    await expect(mod.bulkPatchArticles(pool, ['3001'], {})).rejects.toThrow('No article patch fields provided');
    expect(query).not.toHaveBeenCalled();
  });
});
