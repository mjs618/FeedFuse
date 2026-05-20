import { beforeEach, describe, expect, it, vi } from 'vitest';

const listTagsWithVisibleArticleCountsMock = vi.fn();
const pool = {};

vi.mock('@/server/domains/auth/services/session', () => ({
  requireApiSession: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/server/infra/db/pool', () => ({
  getPool: () => pool,
}));

vi.mock('@/server/domains/articles/repositories/articleTagsRepo', () => ({
  listTagsWithVisibleArticleCounts: (...args: unknown[]) =>
    listTagsWithVisibleArticleCountsMock(...args),
}));

describe('/api/tags', () => {
  beforeEach(() => {
    vi.resetModules();
    listTagsWithVisibleArticleCountsMock.mockReset();
  });

  it('GET returns visible tag counts', async () => {
    listTagsWithVisibleArticleCountsMock.mockResolvedValue([
      { id: 'tag-1', name: 'AI', slug: 'ai', color: null, articleCount: 2 },
    ]);
    const mod = await import('@/app/api/tags/route');

    const res = await mod.GET();
    const json = await res.json();

    expect(json).toEqual({
      ok: true,
      data: {
        tags: [{ id: 'tag-1', name: 'AI', slug: 'ai', color: null, articleCount: 2 }],
      },
    });
    expect(listTagsWithVisibleArticleCountsMock).toHaveBeenCalledWith(pool);
  });
});
