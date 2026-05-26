import { beforeEach, describe, expect, it, vi } from 'vitest';

const listTagsWithVisibleArticleCountsMock = vi.fn();
const updateArticleTagMock = vi.fn();
const deleteArticleTagMock = vi.fn();
const writeUserOperationSucceededLogMock = vi.fn();
const writeUserOperationFailedLogMock = vi.fn();
const pool = {};

vi.mock('@/server/domains/auth/services/session', () => ({
  requireApiSession: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/server/infra/db/pool', () => ({
  getPool: () => pool,
}));

vi.mock('@/server/domains/articles/repositories/articleTagsRepo', () => ({
  deleteArticleTag: (...args: unknown[]) => deleteArticleTagMock(...args),
  listTagsWithVisibleArticleCounts: (...args: unknown[]) =>
    listTagsWithVisibleArticleCountsMock(...args),
  TAG_NAME_MAX_LENGTH: 64,
  updateArticleTag: (...args: unknown[]) => updateArticleTagMock(...args),
}));

vi.mock('@/server/infra/logging/userOperationLogger', () => ({
  writeUserOperationFailedLog: (...args: unknown[]) => writeUserOperationFailedLogMock(...args),
  writeUserOperationSucceededLog: (...args: unknown[]) =>
    writeUserOperationSucceededLogMock(...args),
}));

describe('/api/tags', () => {
  beforeEach(() => {
    vi.resetModules();
    listTagsWithVisibleArticleCountsMock.mockReset();
    updateArticleTagMock.mockReset();
    deleteArticleTagMock.mockReset();
    writeUserOperationSucceededLogMock.mockReset();
    writeUserOperationFailedLogMock.mockReset();
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

  it('PATCH /api/tags/[tagId] updates a tag with normalized whitespace', async () => {
    const tagId = '00000000-0000-4000-8000-000000000001';
    updateArticleTagMock.mockResolvedValue({
      id: tagId,
      name: 'AI Research',
      slug: 'ai-research',
      color: 'blue',
    });
    const mod = await import('@/app/api/tags/[tagId]/route');

    const res = await mod.PATCH(
      new Request('http://localhost/api/tags/' + tagId, {
        method: 'PATCH',
        body: JSON.stringify({ name: '  AI   Research  ', color: 'blue' }),
      }),
      { params: Promise.resolve({ tagId }) },
    );
    const json = await res.json();

    expect(json).toEqual({
      ok: true,
      data: {
        tag: {
          id: tagId,
          name: 'AI Research',
          slug: 'ai-research',
          color: 'blue',
        },
      },
    });
    expect(updateArticleTagMock).toHaveBeenCalledWith(pool, tagId, {
      name: 'AI Research',
      color: 'blue',
    });
  });

  it('PATCH /api/tags/[tagId] validates max length after collapsing whitespace', async () => {
    const tagId = '00000000-0000-4000-8000-000000000001';
    updateArticleTagMock.mockResolvedValue({
      id: tagId,
      name: 'AI Research',
      slug: 'ai-research',
      color: null,
    });
    const mod = await import('@/app/api/tags/[tagId]/route');

    const res = await mod.PATCH(
      new Request('http://localhost/api/tags/' + tagId, {
        method: 'PATCH',
        body: JSON.stringify({ name: `AI${' '.repeat(80)}Research` }),
      }),
      { params: Promise.resolve({ tagId }) },
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(updateArticleTagMock).toHaveBeenCalledWith(pool, tagId, {
      name: 'AI Research',
    });
  });

  it('PATCH /api/tags/[tagId] rejects invalid color before repository call', async () => {
    const tagId = '00000000-0000-4000-8000-000000000001';
    const mod = await import('@/app/api/tags/[tagId]/route');

    const res = await mod.PATCH(
      new Request('http://localhost/api/tags/' + tagId, {
        method: 'PATCH',
        body: JSON.stringify({ color: 'purple' }),
      }),
      { params: Promise.resolve({ tagId }) },
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('validation_error');
    expect(updateArticleTagMock).not.toHaveBeenCalled();
  });

  it('DELETE /api/tags/[tagId] deletes a tag', async () => {
    const tagId = '00000000-0000-4000-8000-000000000001';
    deleteArticleTagMock.mockResolvedValue({ removed: true, affectedArticleCount: 2 });
    const mod = await import('@/app/api/tags/[tagId]/route');

    const res = await mod.DELETE(new Request('http://localhost/api/tags/' + tagId), {
      params: Promise.resolve({ tagId }),
    });
    const json = await res.json();

    expect(json).toEqual({
      ok: true,
      data: { removed: true, affectedArticleCount: 2 },
    });
    expect(deleteArticleTagMock).toHaveBeenCalledWith(pool, tagId);
    expect(writeUserOperationSucceededLogMock).toHaveBeenCalledWith(pool, {
      actionKey: 'tag.delete',
      source: 'app/api/tags/[tagId]',
      context: { tagId, affectedArticleCount: 2 },
    });
  });
});
