import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

import {
  setArticleArchived,
  setArticleReadLater,
} from '@/server/domains/articles/repositories/articlesRepo';

describe('articlesRepo (read later and archive)', () => {
  it('sets read-later state and timestamp without replacing an existing timestamp', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1 });
    const pool = { query } as unknown as Pool;

    await setArticleReadLater(pool, '3001', true);

    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('is_read_later = $2');
    expect(query.mock.calls[0]?.[1]).toEqual(['3001', true]);
    expect(sql).toContain(
      'read_later_at = case when $2 then coalesce(read_later_at, now()) else null end',
    );
  });

  it('sets archive state and timestamp without marking the article read', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1 });
    const pool = { query } as unknown as Pool;

    await setArticleArchived(pool, '3001', true);

    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('is_archived = $2');
    expect(sql).toContain(
      'archived_at = case when $2 then coalesce(archived_at, now()) else null end',
    );
    expect(sql).not.toContain('is_read = true');
  });
});
