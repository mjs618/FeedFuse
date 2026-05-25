# Tag Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add sidebar-driven tag management: rename tags, choose preset colors, delete tags with confirmation, and render colors wherever tags appear.

**Architecture:** The existing tag model already has `article_tags.color`, sidebar tag metadata, and article-level tag arrays. This plan extends the focused tag repository and `/api/tags` API surface, then adds API client helpers, optimistic `appStore` actions, sidebar context-menu dialogs, and a shared color helper used by the sidebar, article list, and article detail.

**Tech Stack:** Next.js App Router route handlers, PostgreSQL via `pg`, Zustand store, Vitest, React Testing Library, Radix-style local UI primitives, Tailwind utility classes.

---

## File Map

- Create `src/lib/reader/tagColors.ts`
  - Owns allowed tag color presets and reusable class mapping.
  - Must stay framework-neutral enough for server validation imports.
- Modify `src/server/domains/articles/repositories/articleTagsRepo.ts`
  - Adds tag update and delete operations.
- Modify `src/test/server/repositories/articleTagsRepo.test.ts`
  - Adds repository tests for color validation, rename, conflict query behavior, and delete count.
- Create `src/app/api/tags/[tagId]/route.ts`
  - Adds `PATCH` and `DELETE` for tag management.
- Modify `src/test/app/api/tags/route.test.ts`
  - Adds tests for the new dynamic route exports.
- Modify `src/lib/userOperationCatalog.ts`
  - Adds `tag.update` and `tag.delete` operation messages.
- Modify `src/test/lib/userOperationCatalog.test.ts`
  - Adds catalog assertions for new operation keys.
- Modify `src/lib/api/apiClient.ts`
  - Adds `updateTag` and `deleteTag` helpers and exported input/result types.
- Modify `src/test/lib/apiClient.test.ts`
  - Adds helper request/response tests.
- Modify `src/store/appStore.ts`
  - Adds `updateReaderTag` and `deleteReaderTag` optimistic actions.
- Modify `src/test/store/appStore.test.ts`
  - Adds store action tests for rename, color update, delete, tag-view fallback, and failure reload.
- Modify `src/features/feeds/components/FeedList.tsx`
  - Adds tag row context menu, rename dialog, color dialog, delete confirmation.
- Modify `src/test/features/feeds/FeedList.test.tsx`
  - Adds sidebar UI tests for context menu and dialogs.
- Modify `src/features/articles/components/ArticleList.tsx`
  - Uses shared tag color classes for list badges.
- Modify `src/test/features/articles/ArticleList.test.tsx`
  - Adds color rendering assertion.
- Modify `src/features/articles/components/ArticleView.tsx`
  - Uses shared tag color classes for detail tag badges.
- Modify `src/test/features/articles/ArticleView.tags.test.tsx`
  - Adds color rendering assertion.

Use this temp directory for Vitest on this machine:

```powershell
$env:TEMP='E:\learn\FeedFuse\artifacts\vitest-temp'; $env:TMP=$env:TEMP
```

---

### Task 1: Add Tag Color Preset Model

**Files:**
- Create: `src/lib/reader/tagColors.ts`
- Test: `src/test/lib/tagColors.test.ts`

- [ ] **Step 1: Write color helper tests**

Create `src/test/lib/tagColors.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TAG_COLOR_CLASSES,
  TAG_COLOR_PRESETS,
  getTagColorClasses,
  isTagColorPreset,
} from '@/lib/reader/tagColors';

describe('tagColors', () => {
  it('accepts only known preset keys', () => {
    expect(TAG_COLOR_PRESETS).toContain('blue');
    expect(isTagColorPreset('blue')).toBe(true);
    expect(isTagColorPreset('not-a-color')).toBe(false);
    expect(isTagColorPreset(null)).toBe(false);
  });

  it('returns neutral classes for missing or unknown colors', () => {
    expect(getTagColorClasses(null)).toBe(DEFAULT_TAG_COLOR_CLASSES);
    expect(getTagColorClasses('not-a-color')).toBe(DEFAULT_TAG_COLOR_CLASSES);
  });

  it('returns stable classes for preset colors', () => {
    const classes = getTagColorClasses('blue');

    expect(classes.badge).toContain('border-blue');
    expect(classes.dot).toContain('bg-blue');
    expect(classes.text).toContain('text-blue');
  });
});
```

- [ ] **Step 2: Run color helper tests and verify they fail**

```powershell
$env:TEMP='E:\learn\FeedFuse\artifacts\vitest-temp'; $env:TMP=$env:TEMP; pnpm test -- src/test/lib/tagColors.test.ts
```

Expected: FAIL because `src/lib/reader/tagColors.ts` does not exist.

- [ ] **Step 3: Implement color helper**

Create `src/lib/reader/tagColors.ts`:

```ts
export const TAG_COLOR_PRESETS = [
  'slate',
  'red',
  'orange',
  'amber',
  'green',
  'teal',
  'cyan',
  'blue',
  'violet',
  'pink',
] as const;

export type TagColorPreset = (typeof TAG_COLOR_PRESETS)[number];

export interface TagColorClasses {
  dot: string;
  badge: string;
  text: string;
  icon: string;
}

export const DEFAULT_TAG_COLOR_CLASSES: TagColorClasses = {
  dot: 'bg-muted-foreground/45',
  badge: 'border-border/70 bg-muted/50 text-muted-foreground',
  text: 'text-muted-foreground',
  icon: 'text-muted-foreground',
};

const TAG_COLOR_CLASS_BY_PRESET: Record<TagColorPreset, TagColorClasses> = {
  slate: {
    dot: 'bg-slate-500',
    badge: 'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-500/40 dark:bg-slate-500/12 dark:text-slate-200',
    text: 'text-slate-700 dark:text-slate-200',
    icon: 'text-slate-500 dark:text-slate-300',
  },
  red: {
    dot: 'bg-red-500',
    badge: 'border-red-300 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/12 dark:text-red-200',
    text: 'text-red-700 dark:text-red-200',
    icon: 'text-red-500 dark:text-red-300',
  },
  orange: {
    dot: 'bg-orange-500',
    badge: 'border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-500/40 dark:bg-orange-500/12 dark:text-orange-200',
    text: 'text-orange-700 dark:text-orange-200',
    icon: 'text-orange-500 dark:text-orange-300',
  },
  amber: {
    dot: 'bg-amber-500',
    badge: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/12 dark:text-amber-200',
    text: 'text-amber-800 dark:text-amber-200',
    icon: 'text-amber-500 dark:text-amber-300',
  },
  green: {
    dot: 'bg-green-500',
    badge: 'border-green-300 bg-green-50 text-green-700 dark:border-green-500/40 dark:bg-green-500/12 dark:text-green-200',
    text: 'text-green-700 dark:text-green-200',
    icon: 'text-green-500 dark:text-green-300',
  },
  teal: {
    dot: 'bg-teal-500',
    badge: 'border-teal-300 bg-teal-50 text-teal-700 dark:border-teal-500/40 dark:bg-teal-500/12 dark:text-teal-200',
    text: 'text-teal-700 dark:text-teal-200',
    icon: 'text-teal-500 dark:text-teal-300',
  },
  cyan: {
    dot: 'bg-cyan-500',
    badge: 'border-cyan-300 bg-cyan-50 text-cyan-700 dark:border-cyan-500/40 dark:bg-cyan-500/12 dark:text-cyan-200',
    text: 'text-cyan-700 dark:text-cyan-200',
    icon: 'text-cyan-500 dark:text-cyan-300',
  },
  blue: {
    dot: 'bg-blue-500',
    badge: 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/12 dark:text-blue-200',
    text: 'text-blue-700 dark:text-blue-200',
    icon: 'text-blue-500 dark:text-blue-300',
  },
  violet: {
    dot: 'bg-violet-500',
    badge: 'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-500/40 dark:bg-violet-500/12 dark:text-violet-200',
    text: 'text-violet-700 dark:text-violet-200',
    icon: 'text-violet-500 dark:text-violet-300',
  },
  pink: {
    dot: 'bg-pink-500',
    badge: 'border-pink-300 bg-pink-50 text-pink-700 dark:border-pink-500/40 dark:bg-pink-500/12 dark:text-pink-200',
    text: 'text-pink-700 dark:text-pink-200',
    icon: 'text-pink-500 dark:text-pink-300',
  },
};

export function isTagColorPreset(value: unknown): value is TagColorPreset {
  return typeof value === 'string' && TAG_COLOR_PRESETS.includes(value as TagColorPreset);
}

export function getTagColorClasses(color: string | null | undefined): TagColorClasses {
  return isTagColorPreset(color) ? TAG_COLOR_CLASS_BY_PRESET[color] : DEFAULT_TAG_COLOR_CLASSES;
}
```

Keep `ArticleTag.color` and `ReaderTag.color` in `src/types/index.ts` as `string | null`. Narrow only update inputs and validation paths to `TagColorPreset | null`.

- [ ] **Step 4: Run color helper tests**

```powershell
$env:TEMP='E:\learn\FeedFuse\artifacts\vitest-temp'; $env:TMP=$env:TEMP; pnpm test -- src/test/lib/tagColors.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/reader/tagColors.ts src/test/lib/tagColors.test.ts
git commit -m "feat(tags): add tag color presets"
```

---

### Task 2: Add Repository Tag Update And Delete

**Files:**
- Modify: `src/server/domains/articles/repositories/articleTagsRepo.ts`
- Modify: `src/test/server/repositories/articleTagsRepo.test.ts`

- [ ] **Step 1: Write failing repository tests**

Append to `src/test/server/repositories/articleTagsRepo.test.ts`:

```ts
  it('updates a tag name and color', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ id: 'tag-1', name: 'AI Research', slug: 'ai-research', color: 'blue' }],
    });
    const pool = { query } as never;
    const mod = await import('@/server/domains/articles/repositories/articleTagsRepo');

    const tag = await mod.updateArticleTag(pool, '00000000-0000-4000-8000-000000000001', {
      name: '  AI   Research  ',
      color: 'blue',
    });

    expect(tag).toEqual({ id: 'tag-1', name: 'AI Research', slug: 'ai-research', color: 'blue' });
    expect(String(query.mock.calls[0][0])).toContain('update article_tags');
    expect(query.mock.calls[0][1]).toEqual([
      'AI Research',
      'ai-research',
      'blue',
      '00000000-0000-4000-8000-000000000001',
    ]);
  });

  it('rejects invalid tag color before querying', async () => {
    const query = vi.fn();
    const pool = { query } as never;
    const mod = await import('@/server/domains/articles/repositories/articleTagsRepo');

    await expect(
      mod.updateArticleTag(pool, '00000000-0000-4000-8000-000000000001', { color: 'chartreuse' }),
    ).rejects.toThrow('Tag color is invalid');
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects empty tag update patches before querying', async () => {
    const query = vi.fn();
    const pool = { query } as never;
    const mod = await import('@/server/domains/articles/repositories/articleTagsRepo');

    await expect(
      mod.updateArticleTag(pool, '00000000-0000-4000-8000-000000000001', {}),
    ).rejects.toThrow('At least one tag field is required');
    expect(query).not.toHaveBeenCalled();
  });

  it('deletes a tag and returns the affected article count', async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '12' }] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rows: [] }),
      release: vi.fn(),
    };
    const pool = { connect: vi.fn().mockResolvedValue(client) };
    const mod = await import('@/server/domains/articles/repositories/articleTagsRepo');

    const result = await mod.deleteArticleTag(pool as never, '00000000-0000-4000-8000-000000000001');

    expect(result).toEqual({ removed: true, affectedArticleCount: 12 });
    expect(client.query).toHaveBeenNthCalledWith(1, 'begin');
    expect(String(client.query.mock.calls[1][0])).toContain('count(*)::int as count');
    expect(String(client.query.mock.calls[2][0])).toContain('delete from article_tags');
    expect(client.query).toHaveBeenLastCalledWith('commit');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('returns removed false when deleting a missing tag', async () => {
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

    await expect(
      mod.deleteArticleTag(pool as never, '00000000-0000-4000-8000-000000000001'),
    ).resolves.toEqual({ removed: false, affectedArticleCount: 0 });
  });
```

- [ ] **Step 2: Run repository tests and verify they fail**

```powershell
$env:TEMP='E:\learn\FeedFuse\artifacts\vitest-temp'; $env:TMP=$env:TEMP; pnpm test -- src/test/server/repositories/articleTagsRepo.test.ts
```

Expected: FAIL because `updateArticleTag` and `deleteArticleTag` are not exported.

- [ ] **Step 3: Implement repository functions**

Modify `src/server/domains/articles/repositories/articleTagsRepo.ts`:

```ts
import { isTagColorPreset } from '@/lib/reader/tagColors';
```

Add near `type TransactionPool`:

```ts
export interface UpdateArticleTagPatch {
  name?: string;
  color?: string | null;
}

export interface DeleteArticleTagResult {
  removed: boolean;
  affectedArticleCount: number;
}
```

Add after `attachArticleTag`:

```ts
export async function updateArticleTag(
  pool: DbClient,
  tagId: string,
  patch: UpdateArticleTagPatch,
): Promise<ArticleTagRow | null> {
  const hasName = Object.prototype.hasOwnProperty.call(patch, 'name');
  const hasColor = Object.prototype.hasOwnProperty.call(patch, 'color');
  if (!hasName && !hasColor) {
    throw new Error('At least one tag field is required');
  }

  const name = hasName ? normalizeTagName(patch.name ?? '') : undefined;
  if (hasName) assertValidTagName(name ?? '');

  const color = hasColor ? patch.color ?? null : undefined;
  if (color !== undefined && color !== null && !isTagColorPreset(color)) {
    throw new Error('Tag color is invalid');
  }

  if (hasName && hasColor) {
    const { rows } = await pool.query<ArticleTagRow>(
      `
        update article_tags
        set name = $1, slug = $2, color = $3, updated_at = now()
        where id = $4::uuid
        returning id, name, slug, color
      `,
      [name, name ? slugifyTagName(name) : null, color, tagId],
    );
    return rows[0] ?? null;
  }

  if (hasName) {
    const { rows } = await pool.query<ArticleTagRow>(
      `
        update article_tags
        set name = $1, slug = $2, updated_at = now()
        where id = $3::uuid
        returning id, name, slug, color
      `,
      [name, name ? slugifyTagName(name) : null, tagId],
    );
    return rows[0] ?? null;
  }

  const { rows } = await pool.query<ArticleTagRow>(
    `
      update article_tags
      set color = $1, updated_at = now()
      where id = $2::uuid
      returning id, name, slug, color
    `,
    [color, tagId],
  );

  return rows[0] ?? null;
}

export async function deleteArticleTag(
  pool: TransactionPool,
  tagId: string,
): Promise<DeleteArticleTagResult> {
  const client = await pool.connect();

  try {
    await client.query('begin');
    const countResult = await client.query<{ count: number | string }>(
      `
        select count(*)::int as count
        from article_taggings
        where tag_id = $1::uuid
      `,
      [tagId],
    );
    const affectedArticleCount = Number(countResult.rows[0]?.count ?? 0);

    const deleteResult = await client.query(
      `
        delete from article_tags
        where id = $1::uuid
      `,
      [tagId],
    );
    await client.query('commit');

    return {
      removed: (deleteResult.rowCount ?? 0) > 0,
      affectedArticleCount,
    };
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 4: Run repository tests**

```powershell
$env:TEMP='E:\learn\FeedFuse\artifacts\vitest-temp'; $env:TMP=$env:TEMP; pnpm test -- src/test/server/repositories/articleTagsRepo.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/server/domains/articles/repositories/articleTagsRepo.ts src/test/server/repositories/articleTagsRepo.test.ts
git commit -m "feat(tags): add tag management repository"
```

---

### Task 3: Add Tag Management API Routes And Client Helpers

**Files:**
- Create: `src/app/api/tags/[tagId]/route.ts`
- Modify: `src/test/app/api/tags/route.test.ts`
- Modify: `src/lib/userOperationCatalog.ts`
- Modify: `src/test/lib/userOperationCatalog.test.ts`
- Modify: `src/lib/api/apiClient.ts`
- Modify: `src/test/lib/apiClient.test.ts`

- [ ] **Step 1: Write route tests**

Modify the existing repository mock in `src/test/app/api/tags/route.test.ts` so the file has one `vi.mock('@/server/domains/articles/repositories/articleTagsRepo', ...)` block:

```ts
const updateArticleTagMock = vi.fn();
const deleteArticleTagMock = vi.fn();

vi.mock('@/server/domains/articles/repositories/articleTagsRepo', () => ({
  listTagsWithVisibleArticleCounts: (...args: unknown[]) =>
    listTagsWithVisibleArticleCountsMock(...args),
  updateArticleTag: (...args: unknown[]) => updateArticleTagMock(...args),
  deleteArticleTag: (...args: unknown[]) => deleteArticleTagMock(...args),
}));
```

Then append these tests:

```ts

it('PATCH updates a tag', async () => {
  updateArticleTagMock.mockResolvedValue({
    id: '00000000-0000-4000-8000-000000000001',
    name: 'AI Research',
    slug: 'ai-research',
    color: 'blue',
  });
  const mod = await import('@/app/api/tags/[tagId]/route');

  const res = await mod.PATCH(
    new Request('http://test.local/api/tags/00000000-0000-4000-8000-000000000001', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'AI Research', color: 'blue' }),
    }),
    { params: Promise.resolve({ tagId: '00000000-0000-4000-8000-000000000001' }) },
  );

  const json = await res.json();
  expect(json).toEqual({
    ok: true,
    data: {
      tag: {
        id: '00000000-0000-4000-8000-000000000001',
        name: 'AI Research',
        slug: 'ai-research',
        color: 'blue',
      },
    },
  });
  expect(updateArticleTagMock).toHaveBeenCalledWith(pool, '00000000-0000-4000-8000-000000000001', {
    name: 'AI Research',
    color: 'blue',
  });
});

it('PATCH rejects invalid color', async () => {
  const mod = await import('@/app/api/tags/[tagId]/route');

  const res = await mod.PATCH(
    new Request('http://test.local/api/tags/00000000-0000-4000-8000-000000000001', {
      method: 'PATCH',
      body: JSON.stringify({ color: 'chartreuse' }),
    }),
    { params: Promise.resolve({ tagId: '00000000-0000-4000-8000-000000000001' }) },
  );

  const json = await res.json();
  expect(json.ok).toBe(false);
  expect(json.error.code).toBe('validation_error');
  expect(updateArticleTagMock).not.toHaveBeenCalled();
});

it('DELETE removes a tag and returns affected article count', async () => {
  deleteArticleTagMock.mockResolvedValue({ removed: true, affectedArticleCount: 12 });
  const mod = await import('@/app/api/tags/[tagId]/route');

  const res = await mod.DELETE(
    new Request('http://test.local/api/tags/00000000-0000-4000-8000-000000000001', {
      method: 'DELETE',
    }),
    { params: Promise.resolve({ tagId: '00000000-0000-4000-8000-000000000001' }) },
  );

  await expect(res.json()).resolves.toEqual({
    ok: true,
    data: { removed: true, affectedArticleCount: 12 },
  });
  expect(deleteArticleTagMock).toHaveBeenCalledWith(pool, '00000000-0000-4000-8000-000000000001');
});
```

Also update the `beforeEach` in the same file:

```ts
updateArticleTagMock.mockReset();
deleteArticleTagMock.mockReset();
```

- [ ] **Step 2: Write API client tests**

Append to `src/test/lib/apiClient.test.ts`:

```ts
async function getFetchCallBodyText(input: unknown, init: unknown): Promise<string | undefined> {
  if (typeof Request !== 'undefined' && input instanceof Request) {
    try {
      return await input.text();
    } catch {
      return undefined;
    }
  }

  if (init && typeof init === 'object' && 'body' in init) {
    const body = (init as { body?: unknown }).body;
    return typeof body === 'string' ? body : undefined;
  }

  return undefined;
}

it('PATCHes /api/tags/:tagId through updateTag', async () => {
  const fetchMock = vi.fn(async () => {
    return new Response(
      JSON.stringify({
        ok: true,
        data: { tag: { id: 'tag-1', name: 'AI', slug: 'ai', color: 'blue' } },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  });
  vi.stubGlobal('fetch', fetchMock);

  const { updateTag } = await import('@/lib/api/apiClient');
  const tag = await updateTag('tag-1', { name: 'AI', color: 'blue' });

  const call = fetchMock.mock.calls[0] ?? [];
  expect(getFetchCallUrl(call[0])).toContain('/api/tags/tag-1');
  expect(getFetchCallMethod(call)).toBe('PATCH');
  await expect(getFetchCallBodyText(call[0], call[1])).resolves.toBe(JSON.stringify({ name: 'AI', color: 'blue' }));
  expect(tag).toEqual({ id: 'tag-1', name: 'AI', slug: 'ai', color: 'blue' });
});

it('DELETEs /api/tags/:tagId through deleteTag', async () => {
  const fetchMock = vi.fn(async () => {
    return new Response(
      JSON.stringify({ ok: true, data: { removed: true, affectedArticleCount: 2 } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  });
  vi.stubGlobal('fetch', fetchMock);

  const { deleteTag } = await import('@/lib/api/apiClient');
  await expect(deleteTag('tag-1')).resolves.toEqual({ removed: true, affectedArticleCount: 2 });

  const call = fetchMock.mock.calls[0] ?? [];
  expect(getFetchCallUrl(call[0])).toContain('/api/tags/tag-1');
  expect(getFetchCallMethod(call)).toBe('DELETE');
});
```

- [ ] **Step 3: Write user operation catalog tests**

Add to `src/test/lib/userOperationCatalog.test.ts`:

```ts
expect(renderUserOperationSuccess('tag.update', { name: 'AI' })).toBe('已更新标签 AI');
expect(renderUserOperationSuccess('tag.delete', { name: 'AI' })).toBe('已删除标签 AI');
expect(renderUserOperationFailure('tag.update', undefined, { message: 'boom' })).toContain('更新标签失败');
expect(renderUserOperationFailure('tag.delete', undefined, { message: 'boom' })).toContain('删除标签失败');
```

- [ ] **Step 4: Run route, client, and catalog tests and verify they fail**

```powershell
$env:TEMP='E:\learn\FeedFuse\artifacts\vitest-temp'; $env:TMP=$env:TEMP; pnpm test -- src/test/app/api/tags/route.test.ts src/test/lib/apiClient.test.ts src/test/lib/userOperationCatalog.test.ts
```

Expected: FAIL because route, client helpers, and catalog entries are missing.

- [ ] **Step 5: Implement dynamic tag route**

Create `src/app/api/tags/[tagId]/route.ts`:

```ts
import { TAG_COLOR_PRESETS } from '@/lib/reader/tagColors';
import { deleteArticleTag, updateArticleTag, TAG_NAME_MAX_LENGTH } from '@/server/domains/articles/repositories/articleTagsRepo';
import { requireApiSession } from '@/server/domains/auth/services/session';
import { getPool } from '@/server/infra/db/pool';
import { fail, ok } from '@/server/infra/http/apiResponse';
import { ConflictError, NotFoundError, ValidationError } from '@/server/infra/http/errors';
import {
  writeUserOperationFailedLog,
  writeUserOperationSucceededLog,
} from '@/server/infra/logging/userOperationLogger';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ tagId: z.string().uuid() });
const bodySchema = z
  .object({
    name: z.string().trim().min(1).max(TAG_NAME_MAX_LENGTH).optional(),
    color: z.enum(TAG_COLOR_PRESETS).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
    path: ['body'],
  });

function zodIssuesToFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'body';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

function isUniqueViolation(err: unknown): err is { code: string } {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: unknown }).code === '23505';
}

export async function PATCH(request: Request, context: { params: Promise<{ tagId: string }> }) {
  const authResponse = await requireApiSession();
  if (authResponse) return authResponse;

  const pool = getPool();
  try {
    const params = paramsSchema.safeParse(await context.params);
    if (!params.success) {
      const error = new ValidationError('Invalid route params', zodIssuesToFields(params.error));
      return fail(error);
    }

    const json = await request.json().catch(() => null);
    const body = bodySchema.safeParse(json);
    if (!body.success) {
      const error = new ValidationError('Invalid request body', zodIssuesToFields(body.error));
      return fail(error);
    }

    const tag = await updateArticleTag(pool, params.data.tagId, body.data);
    if (!tag) return fail(new NotFoundError('Tag not found'));

    await writeUserOperationSucceededLog(pool, {
      actionKey: 'tag.update',
      source: 'app/api/tags/[tagId]',
      context: { tagId: tag.id, name: tag.name },
    });
    return ok({ tag });
  } catch (err) {
    const mappedError = isUniqueViolation(err)
      ? new ConflictError('Tag already exists', { name: 'duplicate' })
      : err;
    await writeUserOperationFailedLog(pool, {
      actionKey: 'tag.update',
      source: 'app/api/tags/[tagId]',
      err: mappedError,
    });
    return fail(mappedError);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ tagId: string }> }) {
  const authResponse = await requireApiSession();
  if (authResponse) return authResponse;

  const pool = getPool();
  try {
    const params = paramsSchema.safeParse(await context.params);
    if (!params.success) {
      const error = new ValidationError('Invalid route params', zodIssuesToFields(params.error));
      return fail(error);
    }

    const result = await deleteArticleTag(pool, params.data.tagId);
    await writeUserOperationSucceededLog(pool, {
      actionKey: 'tag.delete',
      source: 'app/api/tags/[tagId]',
      context: { tagId: params.data.tagId, affectedArticleCount: result.affectedArticleCount },
    });
    return ok(result);
  } catch (err) {
    await writeUserOperationFailedLog(pool, {
      actionKey: 'tag.delete',
      source: 'app/api/tags/[tagId]',
      err,
    });
    return fail(err);
  }
}
```

- [ ] **Step 6: Implement catalog entries**

Add to `src/lib/userOperationCatalog.ts`:

```ts
  'tag.update': {
    loadingMessage: () => '正在更新标签',
    successMessage: (context) => {
      const name = typeof context?.name === 'string' ? context.name : '';
      return name ? `已更新标签 ${name}` : '已更新标签';
    },
    errorPrefix: () => '更新标签失败',
  },
  'tag.delete': {
    loadingMessage: () => '正在删除标签',
    successMessage: (context) => {
      const name = typeof context?.name === 'string' ? context.name : '';
      return name ? `已删除标签 ${name}` : '已删除标签';
    },
    errorPrefix: () => '删除标签失败',
  },
```

- [ ] **Step 7: Implement API client helpers**

Add to `src/lib/api/apiClient.ts` near the existing tag helpers:

```ts
import type { TagColorPreset } from '@/lib/reader/tagColors';

export interface UpdateTagInput {
  name?: string;
  color?: TagColorPreset | null;
}

export interface DeleteTagResult {
  removed: boolean;
  affectedArticleCount: number;
}

export async function updateTag(
  tagId: string,
  patch: UpdateTagInput,
  options?: RequestApiOptions,
): Promise<ArticleTagDto> {
  const result = await requestApi<{ tag: ArticleTagDto }>(
    `/api/tags/${encodeURIComponent(tagId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(patch),
    },
    options,
  );
  return result.tag;
}

export async function deleteTag(
  tagId: string,
  options?: RequestApiOptions,
): Promise<DeleteTagResult> {
  return requestApi<DeleteTagResult>(
    `/api/tags/${encodeURIComponent(tagId)}`,
    { method: 'DELETE' },
    options,
  );
}
```

- [ ] **Step 8: Run route, client, and catalog tests**

```powershell
$env:TEMP='E:\learn\FeedFuse\artifacts\vitest-temp'; $env:TMP=$env:TEMP; pnpm test -- src/test/app/api/tags/route.test.ts src/test/lib/apiClient.test.ts src/test/lib/userOperationCatalog.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```powershell
git add src/app/api/tags/[tagId]/route.ts src/test/app/api/tags/route.test.ts src/lib/userOperationCatalog.ts src/test/lib/userOperationCatalog.test.ts src/lib/api/apiClient.ts src/test/lib/apiClient.test.ts
git commit -m "feat(tags): add tag management APIs"
```

---

### Task 4: Add Store Actions For Tag Update And Delete

**Files:**
- Modify: `src/store/appStore.ts`
- Modify: `src/test/store/appStore.test.ts`

- [ ] **Step 1: Write store tests**

Append focused tests to `src/test/store/appStore.test.ts` in the appStore API integration describe block:

```ts
it('updateReaderTag updates sidebar tags, visible articles, and detail cache', async () => {
  useAppStore.setState({
    tags: [{ id: 'tag-1', name: 'AI', slug: 'ai', color: null, articleCount: 1 }],
    articles: [
      {
        ...createSnapshotArticle('3001', 'feed-1', 'Tagged Article'),
        tags: [{ id: 'tag-1', name: 'AI', slug: 'ai', color: null }],
      },
    ],
    articleDetailCache: {
      '3001': {
        ...createSnapshotArticle('3001', 'feed-1', 'Tagged Article'),
        content: '<p>content</p>',
        tags: [{ id: 'tag-1', name: 'AI', slug: 'ai', color: null }],
      },
    },
  });
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = getFetchCallUrl(input);
    const method = getFetchCallMethod(input, init);
    if (url.includes('/api/tags/tag-1') && method === 'PATCH') {
      return jsonResponse({
        ok: true,
        data: { tag: { id: 'tag-1', name: 'AI Research', slug: 'ai-research', color: 'blue' } },
      });
    }
    throw new Error(`Unexpected fetch: ${method} ${url}`);
  });

  useAppStore.getState().updateReaderTag('tag-1', { name: 'AI Research', color: 'blue' });

  await flushPromises();

  expect(useAppStore.getState().tags[0]).toMatchObject({
    name: 'AI Research',
    slug: 'ai-research',
    color: 'blue',
  });
  expect(useAppStore.getState().articles[0]?.tags?.[0]?.name).toBe('AI Research');
  expect(useAppStore.getState().articleDetailCache['3001']?.tags?.[0]?.color).toBe('blue');
});

it('deleteReaderTag removes tag references and leaves deleted tag view', async () => {
  useAppStore.setState({
    selectedView: 'tag:tag-1',
    selectedArticleId: '3001',
    tags: [{ id: 'tag-1', name: 'AI', slug: 'ai', color: 'blue', articleCount: 1 }],
    articles: [
      {
        ...createSnapshotArticle('3001', 'feed-1', 'Tagged Article'),
        tags: [{ id: 'tag-1', name: 'AI', slug: 'ai', color: 'blue' }],
      },
    ],
    articleDetailCache: {
      '3001': {
        ...createSnapshotArticle('3001', 'feed-1', 'Tagged Article'),
        content: '<p>content</p>',
        tags: [{ id: 'tag-1', name: 'AI', slug: 'ai', color: 'blue' }],
      },
    },
  });
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = getFetchCallUrl(input);
    const method = getFetchCallMethod(input, init);
    if (url.includes('/api/tags/tag-1') && method === 'DELETE') {
      return jsonResponse({ ok: true, data: { removed: true, affectedArticleCount: 1 } });
    }
    throw new Error(`Unexpected fetch: ${method} ${url}`);
  });

  useAppStore.getState().deleteReaderTag({ id: 'tag-1', name: 'AI', slug: 'ai', color: 'blue' });

  await flushPromises();

  expect(useAppStore.getState().tags).toEqual([]);
  expect(useAppStore.getState().articles[0]?.tags).toEqual([]);
  expect(useAppStore.getState().articleDetailCache['3001']?.tags).toEqual([]);
  expect(useAppStore.getState().selectedView).toBe('all');
  expect(useAppStore.getState().selectedArticleId).toBeNull();
});
```

- [ ] **Step 2: Run store tests and verify they fail**

```powershell
$env:TEMP='E:\learn\FeedFuse\artifacts\vitest-temp'; $env:TMP=$env:TEMP; pnpm test -- src/test/store/appStore.test.ts
```

Expected: FAIL because `updateReaderTag` and `deleteReaderTag` are missing.

- [ ] **Step 3: Implement appStore action types and imports**

Modify imports in `src/store/appStore.ts`:

```ts
  deleteTag as deleteTagRequest,
  updateTag as updateTagRequest,
  type UpdateTagInput,
```

Add to `AppState`:

```ts
  updateReaderTag: (tagId: string, patch: UpdateTagInput) => void;
  deleteReaderTag: (tag: ArticleTagDto) => void;
```

- [ ] **Step 4: Implement collection helpers**

Add near existing tag helpers:

```ts
function replaceArticleTag(article: Article, tag: ArticleTagDto): Article {
  return {
    ...article,
    tags: (article.tags ?? []).map((item) => (item.id === tag.id ? tag : item)),
  };
}

function replaceTagInCache(
  cache: Record<string, Article>,
  tag: ArticleTagDto,
): Record<string, Article> {
  return Object.fromEntries(
    Object.entries(cache).map(([id, article]) => [id, replaceArticleTag(article, tag)]),
  );
}

function removeTagFromCache(cache: Record<string, Article>, tagId: string): Record<string, Article> {
  return Object.fromEntries(
    Object.entries(cache).map(([id, article]) => [id, removeTagFromArticle(article, tagId)]),
  );
}
```

- [ ] **Step 5: Implement store actions**

Add actions near existing `addArticleTag` / `removeArticleTag`:

```ts
  updateReaderTag: (tagId, patch) => {
    void updateTagRequest(tagId, patch, { notifyOnError: false })
      .then((tag) => {
        set((state) => ({
          tags: state.tags.map((item) =>
            item.id === tag.id ? { ...item, ...tag, articleCount: item.articleCount } : item,
          ),
          articles: state.articles.map((article) => replaceArticleTag(article, tag)),
          articleDetailCache: replaceTagInCache(state.articleDetailCache, tag),
        }));
        runImmediateSuccess({ actionKey: 'tag.update', context: { name: tag.name } });
      })
      .catch((err) => {
        runImmediateFailure({ actionKey: 'tag.update', context: { name: patch.name }, err });
        void loadCurrentSnapshotSilently(get);
      });
  },

  deleteReaderTag: (tag) => {
    void deleteTagRequest(tag.id, { notifyOnError: false })
      .then(() => {
        set((state) => {
          const deletingCurrentTagView = state.selectedView === `tag:${tag.id}`;

          return {
            tags: state.tags.filter((item) => item.id !== tag.id),
            articles: state.articles.map((article) => removeTagFromArticle(article, tag.id)),
            articleDetailCache: removeTagFromCache(state.articleDetailCache, tag.id),
            selectedView: deletingCurrentTagView ? 'all' : state.selectedView,
            selectedArticleId: deletingCurrentTagView ? null : state.selectedArticleId,
          };
        });
        runImmediateSuccess({ actionKey: 'tag.delete', context: { name: tag.name } });
      })
      .catch((err) => {
        runImmediateFailure({ actionKey: 'tag.delete', context: { name: tag.name }, err });
        void loadCurrentSnapshotSilently(get);
      });
  },
```

- [ ] **Step 6: Run store tests**

```powershell
$env:TEMP='E:\learn\FeedFuse\artifacts\vitest-temp'; $env:TMP=$env:TEMP; pnpm test -- src/test/store/appStore.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/store/appStore.ts src/test/store/appStore.test.ts
git commit -m "feat(tags): add tag management store actions"
```

---

### Task 5: Add Sidebar Tag Context Menu And Dialogs

**Files:**
- Modify: `src/features/feeds/components/FeedList.tsx`
- Modify: `src/test/features/feeds/FeedList.test.tsx`

- [ ] **Step 1: Write FeedList UI tests**

Add tests after `renders tag rows and navigates to a tag view` in `src/test/features/feeds/FeedList.test.tsx`:

```tsx
it('opens tag context menu and renames a tag', async () => {
  const updateReaderTag = vi.fn();
  useAppStore.setState({
    tags: [{ id: 'tag-1', name: 'AI', slug: 'ai', color: null, articleCount: 2 }],
    updateReaderTag,
  });

  render(<FeedList />);

  fireEvent.contextMenu(screen.getByRole('button', { name: /AI/ }));
  fireEvent.click(await screen.findByRole('menuitem', { name: '重命名' }));

  const input = screen.getByRole('textbox', { name: '标签名称' });
  fireEvent.change(input, { target: { value: 'AI Research' } });
  fireEvent.click(screen.getByRole('button', { name: '保存' }));

  expect(updateReaderTag).toHaveBeenCalledWith('tag-1', { name: 'AI Research' });
});

it('opens tag color dialog and saves a preset', async () => {
  const updateReaderTag = vi.fn();
  useAppStore.setState({
    tags: [{ id: 'tag-1', name: 'AI', slug: 'ai', color: null, articleCount: 2 }],
    updateReaderTag,
  });

  render(<FeedList />);

  fireEvent.contextMenu(screen.getByRole('button', { name: /AI/ }));
  fireEvent.click(await screen.findByRole('menuitem', { name: '更改颜色' }));
  fireEvent.click(screen.getByRole('button', { name: '蓝色' }));
  fireEvent.click(screen.getByRole('button', { name: '保存颜色' }));

  expect(updateReaderTag).toHaveBeenCalledWith('tag-1', { color: 'blue' });
});

it('confirms tag delete with affected article count', async () => {
  const deleteReaderTag = vi.fn();
  useAppStore.setState({
    tags: [{ id: 'tag-1', name: 'AI', slug: 'ai', color: 'blue', articleCount: 12 }],
    deleteReaderTag,
  });

  render(<FeedList />);

  fireEvent.contextMenu(screen.getByRole('button', { name: /AI/ }));
  fireEvent.click(await screen.findByRole('menuitem', { name: '删除标签' }));

  expect(screen.getByText(/12 篇文章/)).toBeInTheDocument();
  expect(screen.getByText(/不会删除文章/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '删除标签' }));

  expect(deleteReaderTag).toHaveBeenCalledWith({
    id: 'tag-1',
    name: 'AI',
    slug: 'ai',
    color: 'blue',
  });
});
```

- [ ] **Step 2: Run FeedList tests and verify they fail**

```powershell
$env:TEMP='E:\learn\FeedFuse\artifacts\vitest-temp'; $env:TMP=$env:TEMP; pnpm test -- src/test/features/feeds/FeedList.test.tsx
```

Expected: FAIL because tag context menu and dialogs are missing.

- [ ] **Step 3: Add store selectors and active tag state**

In `src/features/feeds/components/FeedList.tsx`, add icons:

```ts
Palette,
```

Select actions:

```ts
const updateReaderTag = useAppStore((state) => state.updateReaderTag);
const deleteReaderTag = useAppStore((state) => state.deleteReaderTag);
```

Add state:

```ts
const [renameTagId, setRenameTagId] = useState<string | null>(null);
const [renameTagName, setRenameTagName] = useState('');
const [renameTagError, setRenameTagError] = useState<string | null>(null);
const [colorTagId, setColorTagId] = useState<string | null>(null);
const [draftTagColor, setDraftTagColor] = useState<TagColorPreset | null>(null);
const [deleteTagId, setDeleteTagId] = useState<string | null>(null);
```

Add active memo values:

```ts
const activeRenameTag = useMemo(
  () => (renameTagId ? tags.find((tag) => tag.id === renameTagId) ?? null : null),
  [renameTagId, tags],
);
const activeColorTag = useMemo(
  () => (colorTagId ? tags.find((tag) => tag.id === colorTagId) ?? null : null),
  [colorTagId, tags],
);
const activeDeleteTag = useMemo(
  () => (deleteTagId ? tags.find((tag) => tag.id === deleteTagId) ?? null : null),
  [deleteTagId, tags],
);
```

- [ ] **Step 4: Wrap tag rows in context menu**

Replace the tag row button render with:

```tsx
const tagButton = (
  <button
    key={tag.id}
    type="button"
    onClick={() => setSelectedView(viewId)}
    aria-current={selected ? 'true' : undefined}
    className={cn(
      'flex w-full items-center justify-between gap-2 rounded-xl border border-transparent px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset dark:border-white/[0.03]',
      selected
        ? READER_PANE_ACTIVE_ITEM_CLASS_NAME
        : cn(
            'text-foreground hover:text-accent-foreground',
            READER_PANE_HOVER_BACKGROUND_CLASS_NAME,
          ),
    )}
  >
    <div className="flex min-w-0 items-center">
      <Tag aria-hidden="true" className="mr-2 inline-block h-4 w-4 shrink-0 align-[-2px]" />
      <span className="truncate">{tag.name}</span>
    </div>
    <Badge
      variant="secondary"
      aria-hidden="true"
      className={cn(
        'h-5 min-w-6 shrink-0 justify-center px-1.5 text-[10px] font-semibold tabular-nums',
        LEFT_RAIL_UNREAD_BADGE_CLASS_NAME,
      )}
    >
      {tag.articleCount}
    </Badge>
  </button>
);

return (
  <ContextMenu key={tag.id}>
    <ContextMenuTrigger asChild>{tagButton}</ContextMenuTrigger>
    <ContextMenuContent className="w-44">
      <ContextMenuItem
        onSelect={() => {
          setRenameTagId(tag.id);
          setRenameTagName(tag.name);
          setRenameTagError(null);
        }}
      >
        <ContextMenuItemIcon aria-hidden="true">
          <PencilLine className="h-3.5 w-3.5" />
        </ContextMenuItemIcon>
        <ContextMenuItemLabel>重命名</ContextMenuItemLabel>
      </ContextMenuItem>
      <ContextMenuItem
        onSelect={() => {
          setColorTagId(tag.id);
          setDraftTagColor(tag.color);
        }}
      >
        <ContextMenuItemIcon aria-hidden="true">
          <Palette className="h-3.5 w-3.5" />
        </ContextMenuItemIcon>
        <ContextMenuItemLabel>更改颜色</ContextMenuItemLabel>
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem variant="destructive" onSelect={() => setDeleteTagId(tag.id)}>
        <ContextMenuItemIcon aria-hidden="true" className="text-current">
          <Trash2 className="h-3.5 w-3.5" />
        </ContextMenuItemIcon>
        <ContextMenuItemLabel>删除标签</ContextMenuItemLabel>
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
);
```

- [ ] **Step 5: Add rename dialog**

Add an `AlertDialog` after existing dialogs:

```tsx
<AlertDialog
  open={Boolean(activeRenameTag)}
  onOpenChange={(open) => {
    if (!open) {
      setRenameTagId(null);
      setRenameTagName('');
      setRenameTagError(null);
    }
  }}
>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>重命名标签</AlertDialogTitle>
      <AlertDialogDescription>更新标签名称后，所有文章上的这个标签都会同步更新。</AlertDialogDescription>
    </AlertDialogHeader>
    <div className="space-y-2">
      <label className="text-sm font-medium" htmlFor="rename-tag-name">标签名称</label>
      <input
        id="rename-tag-name"
        aria-label="标签名称"
        value={renameTagName}
        onChange={(event) => {
          setRenameTagName(event.target.value);
          setRenameTagError(null);
        }}
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20"
      />
      {renameTagError ? <p className="text-xs text-destructive">{renameTagError}</p> : null}
    </div>
    <AlertDialogFooter>
      <AlertDialogCancel>取消</AlertDialogCancel>
      <AlertDialogAction
        onClick={(event) => {
          event.preventDefault();
          const name = renameTagName.trim().replace(/\s+/g, ' ');
          if (!name) {
            setRenameTagError('请输入标签名称');
            return;
          }
          if (!activeRenameTag) return;
          updateReaderTag(activeRenameTag.id, { name });
          setRenameTagId(null);
          setRenameTagName('');
        }}
      >
        保存
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

- [ ] **Step 6: Add color dialog**

Import:

```ts
import { TAG_COLOR_PRESETS, type TagColorPreset, getTagColorClasses } from '@/lib/reader/tagColors';
```

Add local labels:

```ts
const TAG_COLOR_LABELS: Record<string, string> = {
  slate: '灰色',
  red: '红色',
  orange: '橙色',
  amber: '琥珀色',
  green: '绿色',
  teal: '青绿色',
  cyan: '青色',
  blue: '蓝色',
  violet: '紫色',
  pink: '粉色',
};
```

Add dialog:

```tsx
<AlertDialog
  open={Boolean(activeColorTag)}
  onOpenChange={(open) => {
    if (!open) {
      setColorTagId(null);
      setDraftTagColor(null);
    }
  }}
>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>更改标签颜色</AlertDialogTitle>
      <AlertDialogDescription>颜色会显示在侧栏、文章列表和文章详情中。</AlertDialogDescription>
    </AlertDialogHeader>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <button
        type="button"
        aria-pressed={draftTagColor === null}
        onClick={() => setDraftTagColor(null)}
        className="flex h-9 items-center gap-2 rounded-md border border-border px-2 text-sm"
      >
        <span className="h-3 w-3 rounded-full bg-muted-foreground/45" aria-hidden="true" />
        默认
      </button>
      {TAG_COLOR_PRESETS.map((color) => {
        const classes = getTagColorClasses(color);
        return (
          <button
            key={color}
            type="button"
            aria-pressed={draftTagColor === color}
            onClick={() => setDraftTagColor(color)}
            className="flex h-9 items-center gap-2 rounded-md border border-border px-2 text-sm"
          >
            <span className={cn('h-3 w-3 rounded-full', classes.dot)} aria-hidden="true" />
            {TAG_COLOR_LABELS[color]}
          </button>
        );
      })}
    </div>
    <AlertDialogFooter>
      <AlertDialogCancel>取消</AlertDialogCancel>
      <AlertDialogAction
        onClick={() => {
          if (!activeColorTag) return;
          updateReaderTag(activeColorTag.id, { color: draftTagColor });
          setColorTagId(null);
        }}
      >
        保存颜色
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

- [ ] **Step 7: Add delete confirmation**

Add dialog:

```tsx
<AlertDialog
  open={Boolean(activeDeleteTag)}
  onOpenChange={(open) => {
    if (!open) setDeleteTagId(null);
  }}
>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>删除标签</AlertDialogTitle>
      <AlertDialogDescription className="break-words">
        {activeDeleteTag
          ? `删除标签 ${activeDeleteTag.name}？这会从 ${activeDeleteTag.articleCount} 篇文章中移除此标签，不会删除文章。`
          : ''}
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>取消</AlertDialogCancel>
      <AlertDialogAction
        onClick={() => {
          if (!activeDeleteTag) return;
          deleteReaderTag({
            id: activeDeleteTag.id,
            name: activeDeleteTag.name,
            slug: activeDeleteTag.slug,
            color: activeDeleteTag.color,
          });
          setDeleteTagId(null);
        }}
      >
        删除标签
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

- [ ] **Step 8: Run FeedList tests**

```powershell
$env:TEMP='E:\learn\FeedFuse\artifacts\vitest-temp'; $env:TMP=$env:TEMP; pnpm test -- src/test/features/feeds/FeedList.test.tsx
```

Expected: PASS.

- [ ] **Step 9: Commit**

```powershell
git add src/features/feeds/components/FeedList.tsx src/test/features/feeds/FeedList.test.tsx
git commit -m "feat(tags): add sidebar tag management"
```

---

### Task 6: Render Tag Colors In List And Detail

**Files:**
- Modify: `src/features/articles/components/ArticleList.tsx`
- Modify: `src/test/features/articles/ArticleList.test.tsx`
- Modify: `src/features/articles/components/ArticleView.tsx`
- Modify: `src/test/features/articles/ArticleView.tags.test.tsx`

- [ ] **Step 1: Write color rendering tests**

Add to `src/test/features/articles/ArticleList.test.tsx`:

```tsx
it('renders colored article tag badges', () => {
  useAppStore.setState({
    showUnreadOnly: false,
    articles: [
      {
        id: 'tag-color-article',
        feedId: 'feed-1',
        title: 'Colored Tag Article',
        content: '',
        summary: 'Summary',
        publishedAt: new Date('2026-02-25T00:00:00.000Z').toISOString(),
        link: 'https://example.com/colored',
        isRead: false,
        isStarred: false,
        tags: [{ id: 'tag-1', name: 'AI', slug: 'ai', color: 'blue' }],
      },
    ],
    selectedArticleId: 'tag-color-article',
  });

  renderWithNotifications();

  expect(screen.getByText('AI')).toHaveClass('border-blue-300');
});
```

Add to `src/test/features/articles/ArticleView.tags.test.tsx`:

```tsx
it('renders existing tags with color styling', () => {
  useAppStore.setState({
    selectedArticleId: 'article-1',
    articles: [
      {
        ...createArticle(),
        tags: [{ id: 'tag-1', name: 'AI', slug: 'ai', color: 'blue' }],
      },
    ],
    articleDetailCache: {
      'article-1': {
        ...createArticle(),
        tags: [{ id: 'tag-1', name: 'AI', slug: 'ai', color: 'blue' }],
      },
    },
  });

  render(<ArticleView />);

  expect(screen.getByText('AI').closest('span')).toHaveClass('border-blue-300');
});
```

- [ ] **Step 2: Run article color tests and verify they fail**

```powershell
$env:TEMP='E:\learn\FeedFuse\artifacts\vitest-temp'; $env:TMP=$env:TEMP; pnpm test -- src/test/features/articles/ArticleList.test.tsx src/test/features/articles/ArticleView.tags.test.tsx
```

Expected: FAIL because badges do not use shared color classes.

- [ ] **Step 3: Update ArticleList badge classes**

In `src/features/articles/components/ArticleList.tsx`, import:

```ts
import { getTagColorClasses } from '@/lib/reader/tagColors';
```

Change visible tag badge render:

```tsx
{visibleTags.map((tag) => {
  const colorClasses = getTagColorClasses(tag.color);
  return (
    <Badge
      key={tag.id}
      variant="secondary"
      className={cn(
        'h-5 max-w-28 truncate px-1.5 text-[10px] font-medium',
        colorClasses.badge,
      )}
    >
      {tag.name}
    </Badge>
  );
})}
```

- [ ] **Step 4: Update ArticleView tag classes**

In `src/features/articles/components/ArticleView.tsx`, import:

```ts
import { getTagColorClasses } from '@/lib/reader/tagColors';
```

Change tag badge render:

```tsx
{(article.tags ?? []).map((tag) => {
  const colorClasses = getTagColorClasses(tag.color);
  return (
    <span
      key={tag.id}
      className={cn(
        'inline-flex max-w-40 items-center gap-1 rounded-md border px-2 py-0.5 text-xs',
        colorClasses.badge,
      )}
    >
      <Tag className={cn('h-3 w-3 shrink-0', colorClasses.icon)} aria-hidden="true" />
      <span className="truncate">{tag.name}</span>
      <button
        type="button"
        aria-label={`移除标签 ${tag.name}`}
        onClick={() => removeArticleTag(article.id, tag)}
        className="rounded-sm text-current/70 transition-colors hover:text-current focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <X className="h-3 w-3" aria-hidden="true" />
      </button>
    </span>
  );
})}
```

- [ ] **Step 5: Run article color tests**

```powershell
$env:TEMP='E:\learn\FeedFuse\artifacts\vitest-temp'; $env:TMP=$env:TEMP; pnpm test -- src/test/features/articles/ArticleList.test.tsx src/test/features/articles/ArticleView.tags.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/features/articles/components/ArticleList.tsx src/test/features/articles/ArticleList.test.tsx src/features/articles/components/ArticleView.tsx src/test/features/articles/ArticleView.tags.test.tsx
git commit -m "feat(tags): render tag colors"
```

---

### Task 7: Final Verification

**Files:**
- No planned file edits.

- [ ] **Step 1: Run focused tag management tests**

```powershell
$env:TEMP='E:\learn\FeedFuse\artifacts\vitest-temp'; $env:TMP=$env:TEMP; pnpm test -- src/test/lib/tagColors.test.ts src/test/server/repositories/articleTagsRepo.test.ts src/test/app/api/tags/route.test.ts src/test/lib/userOperationCatalog.test.ts src/test/lib/apiClient.test.ts src/test/store/appStore.test.ts src/test/features/feeds/FeedList.test.tsx src/test/features/articles/ArticleList.test.tsx src/test/features/articles/ArticleView.tags.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run type-check**

```powershell
pnpm type-check
```

Expected: PASS.

- [ ] **Step 3: Run lint**

```powershell
pnpm lint
```

Expected: PASS.

- [ ] **Step 4: Run production build**

```powershell
pnpm build
```

Expected: PASS.

- [ ] **Step 5: Commit verification fixes only if needed**

If a command fails, make the narrowest fix for the failing behavior, rerun the failing command, then rerun Task 7 from Step 1. If all commands pass, do not create a verification-only commit.
