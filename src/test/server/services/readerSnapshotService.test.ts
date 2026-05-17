import { describe, expect, it } from 'vitest';
import { buildArticleFilter, decodeCursor, encodeCursor, getReaderSnapshot } from '@/server/domains/reader/services/readerSnapshotService';
import { AI_DIGEST_VIEW_ID, ARCHIVED_VIEW_ID, READ_LATER_VIEW_ID } from '@/lib/reader/view';

const RSS_ONLY = "feed_id in (select id from feeds where kind = 'rss')";
const AI_DIGEST_ONLY = "feed_id in (select id from feeds where kind = 'ai_digest')";

describe('readerSnapshotService', () => {
  it('filters unread view and excludes ai_digest', () => {
    const filter = buildArticleFilter({ view: 'unread' });
    expect(filter.whereSql).toMatch(/is_read = false/);
    expect(filter.whereSql).toContain(RSS_ONLY);
  });

  it('filters starred view and excludes ai_digest', () => {
    const filter = buildArticleFilter({ view: 'starred' });
    expect(filter.whereSql).toMatch(/is_starred = true/);
    expect(filter.whereSql).toContain(RSS_ONLY);
  });

  it('filters all view and excludes ai_digest', () => {
    const filter = buildArticleFilter({ view: 'all' });
    expect(filter.whereSql).toContain(RSS_ONLY);
    expect(filter.whereSql).toContain('is_archived = false');
    expect(filter.whereSql).toContain('filter_status = any');
    expect(filter.params[0]).toEqual(['passed', 'error']);
  });

  it('filters read-later view and excludes archived articles', () => {
    const filter = buildArticleFilter({ view: READ_LATER_VIEW_ID });
    expect(filter.whereSql).toContain('is_read_later = true');
    expect(filter.whereSql).toContain('is_archived = false');
    expect(filter.whereSql).not.toContain(RSS_ONLY);
  });

  it('filters archived view without adding non-archived filter', () => {
    const filter = buildArticleFilter({ view: ARCHIVED_VIEW_ID });
    expect(filter.whereSql).toContain('is_archived = true');
    expect(filter.whereSql).not.toContain('is_archived = false');
    expect(filter.whereSql).not.toContain(RSS_ONLY);
  });

  it('adds unreadOnly filter on top of aggregate view', () => {
    const filter = buildArticleFilter({ view: 'all', unreadOnly: true });
    expect(filter.whereSql).toContain('is_read = false');
    expect(filter.params[0]).toEqual(['passed', 'error']);
  });

  it('adds unreadOnly filter on top of feed view', () => {
    const filter = buildArticleFilter({ view: 'feed-id-1', unreadOnly: true });
    expect(filter.whereSql).toContain('is_read = false');
    expect(filter.params[1]).toEqual(['passed', 'error']);
  });

  it('does not add unreadOnly filter on top of read-later view', () => {
    const filter = buildArticleFilter({ view: READ_LATER_VIEW_ID, unreadOnly: true });
    expect(filter.whereSql).not.toContain('is_read = false');
  });

  it('filters ai-digest smart view and only returns ai_digest feeds', () => {
    const filter = buildArticleFilter({ view: AI_DIGEST_VIEW_ID });
    expect(filter.whereSql).toContain(AI_DIGEST_ONLY);
    expect(filter.whereSql).not.toContain(RSS_ONLY);
  });

  it('does not force rss-only when viewing a specific feedId', () => {
    const filter = buildArticleFilter({ view: 'feed-id-1' });
    expect(filter.whereSql).toMatch(/feed_id/);
    expect(filter.whereSql).not.toContain(RSS_ONLY);
    expect(filter.whereSql).not.toContain(AI_DIGEST_ONLY);
  });

  it('allows filtered articles only for a single feed when includeFiltered=true', () => {
    const filter = buildArticleFilter({ view: 'feed-id-1', includeFiltered: true });
    expect(filter.params[1]).toEqual(['passed', 'error', 'filtered']);

    const aggregate = buildArticleFilter({ view: 'all', includeFiltered: true });
    expect(aggregate.params[0]).toEqual(['passed', 'error']);
  });

  it('keeps duplicate filtered articles visible when includeFiltered is enabled for a feed', () => {
    const filter = buildArticleFilter({ view: 'feed-id-1', includeFiltered: true });
    expect(filter.params[1]).toEqual(['passed', 'error', 'filtered']);
  });

  it('roundtrips cursor', () => {
    const cursor = encodeCursor({ publishedAt: '2026-01-01T00:00:00.000Z', id: 'id-1' });
    expect(decodeCursor(cursor)).toEqual({
      publishedAt: '2026-01-01T00:00:00.000Z',
      id: 'id-1',
    });
  });

  it('selects workflow fields in reader snapshot article query', async () => {
    const queries: string[] = [];
    const pool = {
      query: async (sql: string) => {
        queries.push(sql);
        if (sql.includes('from categories')) return { rows: [] };
        if (sql.includes('from feeds')) return { rows: [] };
        if (sql.includes('select feed_id as "feedId"')) return { rows: [] };
        if (sql.includes('select count(*)::int as "totalCount"')) return { rows: [{ totalCount: 0 }] };
        return { rows: [] };
      },
    };

    await getReaderSnapshot(pool as never, { view: 'all' });

    const articleQuery = queries.find((sql) => sql.includes('from articles') && sql.includes('order by "sortPublishedAt"'));
    expect(articleQuery).toContain('articles.is_read_later as "isReadLater"');
    expect(articleQuery).toContain('articles.read_later_at as "readLaterAt"');
    expect(articleQuery).toContain('articles.is_archived as "isArchived"');
    expect(articleQuery).toContain('articles.archived_at as "archivedAt"');
  });

  it('excludes archived articles from feed unread counts', async () => {
    const queries: string[] = [];
    const pool = {
      query: async (sql: string) => {
        queries.push(sql);
        if (sql.includes('from categories')) return { rows: [] };
        if (sql.includes('from feeds')) return { rows: [] };
        if (sql.includes('select count(*)::int as "totalCount"')) return { rows: [{ totalCount: 0 }] };
        return { rows: [] };
      },
    };

    await getReaderSnapshot(pool as never, { view: 'all' });

    const unreadCountQuery = queries.find((sql) => sql.includes('select feed_id as "feedId"'));
    expect(unreadCountQuery).toContain('is_archived = false');
  });
});
