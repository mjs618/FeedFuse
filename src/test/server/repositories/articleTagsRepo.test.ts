import { describe, expect, it, vi } from 'vitest';

describe('articleTagsRepo', () => {
  it('normalizes tag names and slug values', async () => {
    const mod = await import('@/server/domains/articles/repositories/articleTagsRepo');

    expect(mod.normalizeTagName('  AI   Tools  ')).toBe('AI Tools');
    expect(mod.slugifyTagName('AI Tools')).toBe('ai-tools');
    expect(mod.slugifyTagName('中文 标签')).toBe('中文-标签');
    expect(mod.slugifyTagName('AI / Tools!!')).toBe('ai-tools');
  });

  it('rejects empty and overlong tag names before querying', async () => {
    const query = vi.fn();
    const pool = { query } as never;
    const mod = await import('@/server/domains/articles/repositories/articleTagsRepo');

    await expect(mod.attachArticleTag(pool, '3001', '   ')).rejects.toThrow('Tag name is required');
    await expect(mod.attachArticleTag(pool, '3001', 'a'.repeat(65))).rejects.toThrow('Tag name is too long');
    expect(query).not.toHaveBeenCalled();
  });

  it('attaches a tag in one transaction and returns the normalized tag', async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ id: 'tag-1', name: 'AI Tools', slug: 'ai-tools', color: null }],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }),
      release: vi.fn(),
    };
    const pool = {
      connect: vi.fn().mockResolvedValue(client),
    };
    const mod = await import('@/server/domains/articles/repositories/articleTagsRepo');

    const tag = await mod.attachArticleTag(pool as never, '3001', '  AI   Tools  ');

    expect(tag).toEqual({ id: 'tag-1', name: 'AI Tools', slug: 'ai-tools', color: null });
    expect(client.query).toHaveBeenNthCalledWith(1, 'begin');
    expect(String(client.query.mock.calls[1][0])).toContain('select id, name, slug, color');
    expect(String(client.query.mock.calls[2][0])).toContain('insert into article_tags');
    expect(String(client.query.mock.calls[3][0])).toContain('insert into article_taggings');
    expect(client.query).toHaveBeenLastCalledWith('commit');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('rolls back and releases when attach fails', async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce({ rows: [] }),
      release: vi.fn(),
    };
    const pool = { connect: vi.fn().mockResolvedValue(client) };
    const mod = await import('@/server/domains/articles/repositories/articleTagsRepo');

    await expect(mod.attachArticleTag(pool as never, '3001', 'AI')).rejects.toThrow('boom');

    expect(client.query).toHaveBeenNthCalledWith(1, 'begin');
    expect(client.query).toHaveBeenLastCalledWith('rollback');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('lists visible tag counts for non-archived articles', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ id: 'tag-1', name: 'AI', slug: 'ai', color: null, articleCount: 2 }],
    });
    const pool = { query } as never;
    const mod = await import('@/server/domains/articles/repositories/articleTagsRepo');

    const tags = await mod.listTagsWithVisibleArticleCounts(pool);

    expect(tags).toEqual([{ id: 'tag-1', name: 'AI', slug: 'ai', color: null, articleCount: 2 }]);
    expect(String(query.mock.calls[0][0])).toContain('articles.is_archived = false');
    expect(String(query.mock.calls[0][0])).toContain('group by tags.id');
  });

  it('lists tags for one article', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ id: 'tag-1', name: 'AI', slug: 'ai', color: null }],
    });
    const pool = { query } as never;
    const mod = await import('@/server/domains/articles/repositories/articleTagsRepo');

    const tags = await mod.listTagsForArticle(pool, '3001');

    expect(tags).toEqual([{ id: 'tag-1', name: 'AI', slug: 'ai', color: null }]);
    expect(String(query.mock.calls[0][0])).toContain('inner join article_taggings');
    expect(query.mock.calls[0][1]).toEqual(['3001']);
  });

  it('lists tags for a batch of articles', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ articleId: '3001', id: 'tag-1', name: 'AI', slug: 'ai', color: null }],
    });
    const pool = { query } as never;
    const mod = await import('@/server/domains/articles/repositories/articleTagsRepo');

    const tags = await mod.listTagsForArticles(pool, ['3001', '3002']);

    expect(tags).toEqual([{ articleId: '3001', id: 'tag-1', name: 'AI', slug: 'ai', color: null }]);
    expect(String(query.mock.calls[0][0])).toContain('taggings.article_id = any($1::bigint[])');
    expect(query.mock.calls[0][1]).toEqual([['3001', '3002']]);
  });

  it('skips batch tag lookup when no article ids are provided', async () => {
    const query = vi.fn();
    const pool = { query } as never;
    const mod = await import('@/server/domains/articles/repositories/articleTagsRepo');

    await expect(mod.listTagsForArticles(pool, [])).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('detaches tags idempotently', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 0 });
    const pool = { query } as never;
    const mod = await import('@/server/domains/articles/repositories/articleTagsRepo');

    await expect(
      mod.detachArticleTag(pool, '3001', '00000000-0000-4000-8000-000000000001'),
    ).resolves.toEqual({ removed: true });
    expect(String(query.mock.calls[0][0])).toContain('delete from article_taggings');
  });

  it('updates a tag name and color', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ id: 'tag-1', name: 'AI Research', slug: 'ai-research', color: 'blue' }],
    });
    const pool = { query } as never;
    const mod = await import('@/server/domains/articles/repositories/articleTagsRepo');

    const tag = await mod.updateArticleTag(pool, 'tag-1', {
      name: '  AI   Research  ',
      color: 'blue',
    });

    expect(tag).toEqual({ id: 'tag-1', name: 'AI Research', slug: 'ai-research', color: 'blue' });
    expect(String(query.mock.calls[0][0]).toLowerCase()).toContain('update article_tags');
    expect(query.mock.calls[0][1]).toEqual(['AI Research', 'ai-research', 'blue', 'tag-1']);
  });

  it('rejects invalid tag update colors before querying', async () => {
    const query = vi.fn();
    const pool = { query } as never;
    const mod = await import('@/server/domains/articles/repositories/articleTagsRepo');

    await expect(mod.updateArticleTag(pool, 'tag-1', { color: 'purple' })).rejects.toThrow(
      'Tag color is invalid',
    );
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects empty tag update patches before querying', async () => {
    const query = vi.fn();
    const pool = { query } as never;
    const mod = await import('@/server/domains/articles/repositories/articleTagsRepo');

    await expect(mod.updateArticleTag(pool, 'tag-1', {})).rejects.toThrow(
      'At least one tag field is required',
    );
    expect(query).not.toHaveBeenCalled();
  });

  it('deletes a tag in a transaction and returns affected article count', async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: 12 }] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rows: [] }),
      release: vi.fn(),
    };
    const pool = { connect: vi.fn().mockResolvedValue(client) };
    const mod = await import('@/server/domains/articles/repositories/articleTagsRepo');

    const result = await mod.deleteArticleTag(pool as never, 'tag-1');

    expect(result).toEqual({ removed: true, affectedArticleCount: 12 });
    expect(client.query).toHaveBeenCalledWith('begin');
    const countCall = client.query.mock.calls.find(([sql]) =>
      String(sql).toLowerCase().includes('count(*)::int as count'),
    );
    expect(countCall?.[1]).toEqual(['tag-1']);
    const deleteCall = client.query.mock.calls.find(([sql]) =>
      String(sql).toLowerCase().includes('delete from article_tags'),
    );
    expect(deleteCall?.[1]).toEqual(['tag-1']);
    expect(client.query).toHaveBeenCalledWith('commit');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('returns not removed when deleting a missing tag', async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rows: [] }),
      release: vi.fn(),
    };
    const pool = { connect: vi.fn().mockResolvedValue(client) };
    const mod = await import('@/server/domains/articles/repositories/articleTagsRepo');

    await expect(mod.deleteArticleTag(pool as never, 'tag-1')).resolves.toEqual({
      removed: false,
      affectedArticleCount: 0,
    });
    expect(client.query).toHaveBeenCalledWith('commit');
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
