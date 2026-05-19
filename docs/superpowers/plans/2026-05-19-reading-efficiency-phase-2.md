# Reading Efficiency Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full current-list article selection mode and bulk read/star/read-later/archive operations.

**Architecture:** Article selection state stays local to `ArticleList`; persistent mutations flow through `appStore.bulkPatchArticles`, `apiClient.bulkPatchArticles`, and `POST /api/articles/bulk`. The backend validates a fixed patch schema and the repository builds SQL from a typed whitelist.

**Tech Stack:** Next.js App Router, TypeScript, React 19, Zustand, PostgreSQL, Vitest, Testing Library, Radix Alert Dialog, lucide-react.

---

## Scope

This plan implements Phase 2 from `docs/superpowers/specs/2026-05-19-reading-efficiency-phase-2-design.md`.

Included:

- Backend bulk article patch endpoint.
- Repository bulk patch helper.
- API client bulk patch helper.
- Store bulk mutation with optimistic updates and snapshot recovery.
- Article list selection mode and bulk toolbar.
- `X`, `Shift+X`, and `Esc` selection shortcuts.
- Confirmation for bulk archive over 20 selected articles.

Excluded:

- Tags and tag bulk assignment.
- Select every matching article in the database.
- Partial success UI.
- Bulk delete.

## File Map

- Create `src/app/api/articles/bulk/route.ts`: validates bulk patch requests and calls the repository.
- Modify `src/server/domains/articles/repositories/articlesRepo.ts`: add typed bulk patch helper.
- Create `src/test/server/repositories/articlesRepo.bulkPatch.test.ts`: SQL contract tests.
- Modify `src/test/app/api/articles/routes.test.ts`: route validation and success tests.
- Modify `src/lib/api/apiClient.ts`: add bulk patch request helper and shared patch type.
- Modify `src/test/lib/apiClient.test.ts`: client request mapping test.
- Modify `src/lib/userOperationCatalog.ts`: add bulk operation user messages.
- Modify `src/test/lib/userOperationCatalog.test.ts`: catalog tests for bulk messages.
- Modify `src/store/appStore.ts`: add `bulkPatchArticles` state action.
- Modify `src/test/store/appStore.test.ts`: optimistic update, count projection, archive selection, and failure recovery tests.
- Modify `src/features/articles/components/ArticleList.tsx`: selection mode, toolbar, checkboxes, and confirmation.
- Modify `src/test/features/articles/ArticleList.test.tsx`: selection mode, bulk toolbar, confirmation, and row behavior tests.
- Modify `src/features/reader/components/ReaderLayout.tsx`: wire selection shortcuts to the article list.
- Modify `src/test/features/reader/ReaderLayout.test.tsx`: keyboard shortcut tests.
- Modify `src/features/reader/components/ShortcutHelpDialog.tsx`: document `X` and `Shift+X`.

---

### Task 1: Add Repository Bulk Patch

**Files:**
- Modify: `src/server/domains/articles/repositories/articlesRepo.ts`
- Create: `src/test/server/repositories/articlesRepo.bulkPatch.test.ts`

- [ ] **Step 1: Write failing repository tests**

Create `src/test/server/repositories/articlesRepo.bulkPatch.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the repository tests and verify they fail**

Run:

```bash
pnpm test -- src/test/server/repositories/articlesRepo.bulkPatch.test.ts
```

Expected: FAIL because `bulkPatchArticles` is not exported.

- [ ] **Step 3: Add bulk patch types and implementation**

In `src/server/domains/articles/repositories/articlesRepo.ts`, add after `setArticleArchived`:

```ts
export type ArticleBulkPatch = {
  isRead?: boolean;
  isStarred?: boolean;
  isReadLater?: boolean;
  isArchived?: boolean;
};

type ArticleBulkPatchKey = keyof ArticleBulkPatch;

const articleBulkPatchAssignments: Record<
  ArticleBulkPatchKey,
  (paramIndex: number) => string[]
> = {
  isRead: (paramIndex) => [
    `is_read = $${paramIndex}`,
    `read_at = case when $${paramIndex} then coalesce(read_at, now()) else null end`,
  ],
  isStarred: (paramIndex) => [
    `is_starred = $${paramIndex}`,
    `starred_at = case when $${paramIndex} then coalesce(starred_at, now()) else null end`,
  ],
  isReadLater: (paramIndex) => [
    `is_read_later = $${paramIndex}`,
    `read_later_at = case when $${paramIndex} then coalesce(read_later_at, now()) else null end`,
  ],
  isArchived: (paramIndex) => [
    `is_archived = $${paramIndex}`,
    `archived_at = case when $${paramIndex} then coalesce(archived_at, now()) else null end`,
  ],
};

const articleBulkPatchKeys: ArticleBulkPatchKey[] = [
  'isRead',
  'isStarred',
  'isReadLater',
  'isArchived',
];

export async function bulkPatchArticles(
  pool: DbClient,
  articleIds: string[],
  patch: ArticleBulkPatch,
): Promise<number> {
  const assignments: string[] = [];
  const values: Array<string[] | boolean> = [articleIds];

  for (const key of articleBulkPatchKeys) {
    const value = patch[key];
    if (typeof value === 'undefined') continue;

    values.push(value);
    assignments.push(...articleBulkPatchAssignments[key](values.length));
  }

  if (assignments.length === 0) {
    throw new Error('No article patch fields provided');
  }

  const { rowCount } = await pool.query(
    `
      update articles
      set
        ${assignments.join(',\n        ')}
      where id = any($1::bigint[])
    `,
    values,
  );

  return rowCount ?? 0;
}
```

- [ ] **Step 4: Run the repository tests and verify they pass**

Run:

```bash
pnpm test -- src/test/server/repositories/articlesRepo.bulkPatch.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/domains/articles/repositories/articlesRepo.ts src/test/server/repositories/articlesRepo.bulkPatch.test.ts
git commit -m "feat(article): add bulk patch repository helper"
```

---

### Task 2: Add Bulk Article API Route

**Files:**
- Create: `src/app/api/articles/bulk/route.ts`
- Modify: `src/test/app/api/articles/routes.test.ts`

- [ ] **Step 1: Add route tests**

In `src/test/app/api/articles/routes.test.ts`, add a mock:

```ts
const bulkPatchArticlesMock = vi.fn();
```

Add it to every existing `vi.mock('@/server/domains/articles/repositories/articlesRepo', ...)` object in the file:

```ts
bulkPatchArticles: (...args: unknown[]) => bulkPatchArticlesMock(...args),
```

Add this reset in `beforeEach`:

```ts
bulkPatchArticlesMock.mockReset();
```

Add these tests inside `describe('/api/articles', () => { ... })`:

```ts
it('POST /bulk applies a valid bulk patch with de-duplicated ids', async () => {
  bulkPatchArticlesMock.mockResolvedValue(2);
  const mod = await import('../../../../app/api/articles/bulk/route');

  const res = await mod.POST(
    new Request('http://localhost/api/articles/bulk', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        articleIds: ['3001', '3001', '3002'],
        patch: { isRead: true, isArchived: true },
      }),
    }),
  );
  const json = await res.json();

  expect(json.ok).toBe(true);
  expect(json.data).toEqual({
    articleIds: ['3001', '3002'],
    patch: { isRead: true, isArchived: true },
    updatedCount: 2,
  });
  expect(bulkPatchArticlesMock).toHaveBeenCalledWith(pool, ['3001', '3002'], {
    isRead: true,
    isArchived: true,
  });
  expect(writeUserOperationSucceededLogMock).toHaveBeenCalledWith(
    pool,
    expect.objectContaining({
      actionKey: 'article.bulkPatch',
      source: 'app/api/articles/bulk',
    }),
  );
});

it('POST /bulk rejects an empty article id list', async () => {
  const mod = await import('../../../../app/api/articles/bulk/route');
  const res = await mod.POST(
    new Request('http://localhost/api/articles/bulk', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ articleIds: [], patch: { isRead: true } }),
    }),
  );
  const json = await res.json();

  expect(json.ok).toBe(false);
  expect(json.error.fields.articleIds).toBeTruthy();
  expect(bulkPatchArticlesMock).not.toHaveBeenCalled();
});

it('POST /bulk rejects an empty patch', async () => {
  const mod = await import('../../../../app/api/articles/bulk/route');
  const res = await mod.POST(
    new Request('http://localhost/api/articles/bulk', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ articleIds: ['3001'], patch: {} }),
    }),
  );
  const json = await res.json();

  expect(json.ok).toBe(false);
  expect(json.error.fields['patch.body']).toBeTruthy();
  expect(bulkPatchArticlesMock).not.toHaveBeenCalled();
});

it('POST /bulk rejects unknown patch fields', async () => {
  const mod = await import('../../../../app/api/articles/bulk/route');
  const res = await mod.POST(
    new Request('http://localhost/api/articles/bulk', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ articleIds: ['3001'], patch: { isDeleted: true } }),
    }),
  );
  const json = await res.json();

  expect(json.ok).toBe(false);
  expect(json.error.fields.patch).toBeTruthy();
  expect(bulkPatchArticlesMock).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the route tests and verify they fail**

Run:

```bash
pnpm test -- src/test/app/api/articles/routes.test.ts
```

Expected: FAIL because `src/app/api/articles/bulk/route.ts` does not exist and `article.bulkPatch` is not a known operation key.

- [ ] **Step 3: Add operation catalog key**

In `src/lib/userOperationCatalog.ts`, add `'article.bulkPatch'` to `UserOperationActionKey` and add this catalog entry near other article operations:

```ts
  'article.bulkPatch': {
    mode: 'immediate',
    category: 'article',
    successMessage: (context) => {
      const count = typeof context?.count === 'number' ? context.count : 0;
      return `已批量更新 ${count} 篇文章`;
    },
    errorPrefix: () => '批量更新文章失败',
  },
```

Add `src/test/lib/userOperationCatalog.test.ts` coverage:

```ts
it('renders bulk article patch messages', async () => {
  const { renderUserOperationSuccess, renderUserOperationFailure } = await import('@/lib/userOperationCatalog');

  expect(renderUserOperationSuccess('article.bulkPatch', { count: 3 })).toBe('已批量更新 3 篇文章');
  expect(renderUserOperationFailure('article.bulkPatch', undefined, { message: 'boom' })).toContain('批量更新文章失败');
});
```

- [ ] **Step 4: Create the API route**

Create `src/app/api/articles/bulk/route.ts`:

```ts
import { requireApiSession } from '@/server/domains/auth/services/session';
import { bulkPatchArticles } from '@/server/domains/articles/repositories/articlesRepo';
import { getPool } from '@/server/infra/db/pool';
import { fail, ok } from '@/server/infra/http/apiResponse';
import { ValidationError } from '@/server/infra/http/errors';
import { numericIdSchema } from '@/server/infra/http/idSchemas';
import {
  writeUserOperationFailedLog,
  writeUserOperationSucceededLog,
} from '@/server/infra/logging/userOperationLogger';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const patchSchema = z
  .object({
    isRead: z.boolean().optional(),
    isStarred: z.boolean().optional(),
    isReadLater: z.boolean().optional(),
    isArchived: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one patch field must be provided',
    path: ['body'],
  });

const bodySchema = z.object({
  articleIds: z.array(numericIdSchema).min(1, 'At least one article id is required'),
  patch: patchSchema,
});

function zodIssuesToFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'body';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export async function POST(request: Request) {
  const authResponse = await requireApiSession();
  if (authResponse) return authResponse;

  const pool = getPool();

  try {
    const json = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      const error = new ValidationError('Invalid request body', zodIssuesToFields(parsed.error));
      await writeUserOperationFailedLog(pool, {
        actionKey: 'article.bulkPatch',
        source: 'app/api/articles/bulk',
        err: error,
      });
      return fail(error);
    }

    const articleIds = Array.from(new Set(parsed.data.articleIds));
    const updatedCount = await bulkPatchArticles(pool, articleIds, parsed.data.patch);

    await writeUserOperationSucceededLog(pool, {
      actionKey: 'article.bulkPatch',
      source: 'app/api/articles/bulk',
      context: { count: articleIds.length, updatedCount, patch: parsed.data.patch },
    });

    return ok({
      articleIds,
      patch: parsed.data.patch,
      updatedCount,
    });
  } catch (err) {
    await writeUserOperationFailedLog(pool, {
      actionKey: 'article.bulkPatch',
      source: 'app/api/articles/bulk',
      err,
    });
    return fail(err);
  }
}
```

- [ ] **Step 5: Run the route and catalog tests**

Run:

```bash
pnpm test -- src/test/app/api/articles/routes.test.ts src/test/lib/userOperationCatalog.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/articles/bulk/route.ts src/test/app/api/articles/routes.test.ts src/lib/userOperationCatalog.ts src/test/lib/userOperationCatalog.test.ts
git commit -m "feat(article): add bulk patch API"
```

---

### Task 3: Add API Client Bulk Helper

**Files:**
- Modify: `src/lib/api/apiClient.ts`
- Modify: `src/test/lib/apiClient.test.ts`

- [ ] **Step 1: Write client mapping test**

In `src/test/lib/apiClient.test.ts`, add:

```ts
it('sends bulk article patch requests', async () => {
  const { bulkPatchArticles } = await import('@/lib/api/apiClient');
  fetchMock.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        ok: true,
        data: {
          articleIds: ['3001', '3002'],
          patch: { isRead: true },
          updatedCount: 2,
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ),
  );

  const result = await bulkPatchArticles(['3001', '3002'], { isRead: true }, { notifyOnError: false });

  expect(result).toEqual({
    articleIds: ['3001', '3002'],
    patch: { isRead: true },
    updatedCount: 2,
  });
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining('/api/articles/bulk'),
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        articleIds: ['3001', '3002'],
        patch: { isRead: true },
      }),
    }),
  );
});
```

Use the local fetch mock variable name already present in this file. If the file names it differently, keep the assertion shape and use the existing variable.

- [ ] **Step 2: Run the client test and verify it fails**

Run:

```bash
pnpm test -- src/test/lib/apiClient.test.ts
```

Expected: FAIL because `bulkPatchArticles` is not exported.

- [ ] **Step 3: Add shared client types and helper**

In `src/lib/api/apiClient.ts`, replace the inline `patchArticle` input type with an exported type:

```ts
export type ArticlePatchInput = {
  isRead?: boolean;
  isReadLater?: boolean;
  isArchived?: boolean;
  isStarred?: boolean;
};
```

Update `patchArticle`:

```ts
export async function patchArticle(
  articleId: string,
  input: ArticlePatchInput,
  options?: RequestApiOptions,
): Promise<{ updated: true }> {
  return requestApi(
    `/api/articles/${encodeURIComponent(articleId)}`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    },
    options,
  );
}
```

Add after `patchArticle`:

```ts
export async function bulkPatchArticles(
  articleIds: string[],
  patch: ArticlePatchInput,
  options?: RequestApiOptions,
): Promise<{ articleIds: string[]; patch: ArticlePatchInput; updatedCount: number }> {
  return requestApi(
    '/api/articles/bulk',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ articleIds, patch }),
    },
    options,
  );
}
```

- [ ] **Step 4: Run the client test**

Run:

```bash
pnpm test -- src/test/lib/apiClient.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/apiClient.ts src/test/lib/apiClient.test.ts
git commit -m "feat(api): add bulk article patch client"
```

---

### Task 4: Add Store Bulk Mutation

**Files:**
- Modify: `src/store/appStore.ts`
- Modify: `src/test/store/appStore.test.ts`

- [ ] **Step 1: Write store tests**

In `src/test/store/appStore.test.ts`, add tests near existing read-later/archive store tests:

```ts
it('bulk patches visible articles optimistically and persists once', async () => {
  const api = await import('@/lib/api/apiClient');
  vi.mocked(api.bulkPatchArticles).mockResolvedValue({
    articleIds: ['3001', '3002'],
    patch: { isReadLater: true },
    updatedCount: 2,
  });
  const { useAppStore } = await import('../../store/appStore');

  useAppStore.setState({
    articles: [
      createArticle({ id: '3001', feedId: '2001', isReadLater: false }),
      createArticle({ id: '3002', feedId: '2001', isReadLater: false }),
    ],
    articleDetailCache: {},
  });

  useAppStore.getState().bulkPatchArticles(['3001', '3002', '3002'], { isReadLater: true });

  expect(useAppStore.getState().articles.map((article) => article.isReadLater)).toEqual([true, true]);
  await vi.waitFor(() => {
    expect(api.bulkPatchArticles).toHaveBeenCalledWith(
      ['3001', '3002'],
      { isReadLater: true },
      { notifyOnError: false },
    );
  });
});

it('bulk read patch updates feed unread counts from previous state', async () => {
  const api = await import('@/lib/api/apiClient');
  vi.mocked(api.bulkPatchArticles).mockResolvedValue({
    articleIds: ['3001', '3002'],
    patch: { isRead: true },
    updatedCount: 2,
  });
  const { useAppStore } = await import('../../store/appStore');

  useAppStore.setState({
    feeds: [{ id: '2001', title: 'Feed', url: '', unreadCount: 2 }],
    articles: [
      createArticle({ id: '3001', feedId: '2001', isRead: false }),
      createArticle({ id: '3002', feedId: '2001', isRead: false }),
    ],
    articleDetailCache: {},
  });

  useAppStore.getState().bulkPatchArticles(['3001', '3002'], { isRead: true });

  expect(useAppStore.getState().feeds[0].unreadCount).toBe(0);
});

it('bulk archive advances selected article when the selected article is archived', async () => {
  const api = await import('@/lib/api/apiClient');
  vi.mocked(api.bulkPatchArticles).mockResolvedValue({
    articleIds: ['3001'],
    patch: { isArchived: true },
    updatedCount: 1,
  });
  const { useAppStore } = await import('../../store/appStore');

  useAppStore.setState({
    selectedArticleId: '3001',
    articles: [
      createArticle({ id: '3001', feedId: '2001', isArchived: false }),
      createArticle({ id: '3002', feedId: '2001', isArchived: false }),
    ],
    articleDetailCache: {},
  });

  useAppStore.getState().bulkPatchArticles(['3001'], { isArchived: true });

  expect(useAppStore.getState().selectedArticleId).toBe('3002');
});

it('bulk patch failure reloads current snapshot', async () => {
  const api = await import('@/lib/api/apiClient');
  vi.mocked(api.bulkPatchArticles).mockRejectedValue(new Error('boom'));
  const { useAppStore } = await import('../../store/appStore');
  const loadSnapshot = vi.fn().mockResolvedValue(undefined);

  useAppStore.setState({
    selectedView: 'all',
    loadSnapshot,
    articles: [createArticle({ id: '3001', feedId: '2001', isReadLater: false })],
    articleDetailCache: {},
  });

  useAppStore.getState().bulkPatchArticles(['3001'], { isReadLater: true });

  await vi.waitFor(() => {
    expect(loadSnapshot).toHaveBeenCalledWith({ view: 'all' });
  });
});
```

If `createArticle` is not already available in the file, add this local helper near the other test fixtures:

```ts
function createArticle(overrides: Partial<Article> = {}): Article {
  return {
    id: '3001',
    feedId: '2001',
    title: 'Article',
    content: '',
    summary: '',
    publishedAt: '2026-05-19T00:00:00.000Z',
    link: '',
    isRead: false,
    isStarred: false,
    isReadLater: false,
    isArchived: false,
    ...overrides,
  };
}
```

- [ ] **Step 2: Run store tests and verify they fail**

Run:

```bash
pnpm test -- src/test/store/appStore.test.ts
```

Expected: FAIL because `bulkPatchArticles` is not in `appStore`.

- [ ] **Step 3: Add store import and type**

In `src/store/appStore.ts`, update imports:

```ts
  bulkPatchArticles as bulkPatchArticlesRequest,
  type ArticlePatchInput,
```

Add to `AppState`:

```ts
  bulkPatchArticles: (articleIds: string[], patch: ArticlePatchInput) => void;
```

- [ ] **Step 4: Add helper functions**

Add near `updateArticleInVisibleCollections`:

```ts
function dedupeArticleIds(articleIds: string[]): string[] {
  return Array.from(new Set(articleIds));
}

function applyArticlePatch(article: Article, patch: ArticlePatchInput, nowIso: string): Article {
  return {
    ...article,
    ...(typeof patch.isRead !== 'undefined' ? { isRead: patch.isRead } : {}),
    ...(typeof patch.isStarred !== 'undefined' ? { isStarred: patch.isStarred } : {}),
    ...(typeof patch.isReadLater !== 'undefined'
      ? {
          isReadLater: patch.isReadLater,
          readLaterAt: patch.isReadLater ? (article.readLaterAt ?? nowIso) : null,
        }
      : {}),
    ...(typeof patch.isArchived !== 'undefined'
      ? {
          isArchived: patch.isArchived,
          archivedAt: patch.isArchived ? (article.archivedAt ?? nowIso) : null,
        }
      : {}),
  };
}

function getBulkUnreadDeltas(articles: Article[], ids: Set<string>, patch: ArticlePatchInput) {
  const deltas = new Map<string, number>();
  if (typeof patch.isRead === 'undefined') return deltas;

  for (const article of articles) {
    if (!ids.has(article.id) || article.isRead === patch.isRead) continue;
    const delta = patch.isRead ? -1 : 1;
    deltas.set(article.feedId, (deltas.get(article.feedId) ?? 0) + delta);
  }

  return deltas;
}
```

- [ ] **Step 5: Add the store action**

Add inside `create<AppState>()((set, get) => ({ ... }))`, near single-article workflow actions:

```ts
  bulkPatchArticles: (articleIds, patch) => {
    const uniqueIds = dedupeArticleIds(articleIds);
    if (uniqueIds.length === 0) return;

    const ids = new Set(uniqueIds);
    const nowIso = new Date().toISOString();
    const stateBeforePatch = get();
    const unreadDeltas = getBulkUnreadDeltas(stateBeforePatch.articles, ids, patch);

    set((state) => {
      const nextArticles = state.articles.map((article) =>
        ids.has(article.id) ? applyArticlePatch(article, patch, nowIso) : article,
      );

      return {
        articles: nextArticles,
        articleDetailCache: Object.fromEntries(
          Object.entries(state.articleDetailCache).map(([id, article]) => [
            id,
            ids.has(id) ? applyArticlePatch(article, patch, nowIso) : article,
          ]),
        ),
        feeds: state.feeds.map((feed) => {
          const delta = unreadDeltas.get(feed.id) ?? 0;
          return delta === 0 ? feed : { ...feed, unreadCount: Math.max(0, feed.unreadCount + delta) };
        }),
        selectedArticleId:
          patch.isArchived === true && state.selectedArticleId && ids.has(state.selectedArticleId)
            ? findNextVisibleArticleId(nextArticles, state.selectedArticleId)
            : state.selectedArticleId,
      };
    });

    void bulkPatchArticlesRequest(uniqueIds, patch, { notifyOnError: false })
      .then(() => {
        runImmediateSuccess({
          actionKey: 'article.bulkPatch',
          context: { count: uniqueIds.length, patch },
        });
      })
      .catch((err) => {
        runImmediateFailure({
          actionKey: 'article.bulkPatch',
          context: { count: uniqueIds.length, patch },
          err,
        });
        void get().loadSnapshot({ view: get().selectedView });
      });
  },
```

- [ ] **Step 6: Run store tests**

Run:

```bash
pnpm test -- src/test/store/appStore.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/store/appStore.ts src/test/store/appStore.test.ts
git commit -m "feat(reader): add bulk article store mutation"
```

---

### Task 5: Add Article List Selection Mode and Bulk Toolbar

**Files:**
- Modify: `src/features/articles/components/ArticleList.tsx`
- Modify: `src/test/features/articles/ArticleList.test.tsx`

- [ ] **Step 1: Write selection mode tests**

In `src/test/features/articles/ArticleList.test.tsx`, add tests:

```tsx
it('enters selection mode and toggles selected rows', async () => {
  useAppStore.setState({
    articles: [
      createArticle({ id: '3001', title: 'One' }),
      createArticle({ id: '3002', title: 'Two' }),
    ],
  });

  render(<ArticleList />);

  fireEvent.click(screen.getByRole('button', { name: '选择文章' }));
  expect(screen.getByText('已选 0 篇')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('checkbox', { name: '选择 One' }));
  expect(screen.getByText('已选 1 篇')).toBeInTheDocument();
});

it('selects the current loaded list and runs a bulk read action', async () => {
  const bulkPatchArticles = vi.fn();
  useAppStore.setState({
    articles: [
      createArticle({ id: '3001', title: 'One' }),
      createArticle({ id: '3002', title: 'Two' }),
    ],
    bulkPatchArticles,
  });

  render(<ArticleList />);

  fireEvent.click(screen.getByRole('button', { name: '选择文章' }));
  fireEvent.click(screen.getByRole('button', { name: '选择当前列表' }));
  fireEvent.click(screen.getByRole('button', { name: '标为已读' }));

  expect(bulkPatchArticles).toHaveBeenCalledWith(['3001', '3002'], { isRead: true });
  expect(screen.queryByText(/已选/)).not.toBeInTheDocument();
});

it('row click toggles selection instead of opening in selection mode', async () => {
  const setSelectedArticle = vi.fn();
  useAppStore.setState({
    articles: [createArticle({ id: '3001', title: 'One' })],
    setSelectedArticle,
  });

  render(<ArticleList />);

  fireEvent.click(screen.getByRole('button', { name: '选择文章' }));
  fireEvent.click(screen.getByRole('button', { name: /One/ }));

  expect(screen.getByText('已选 1 篇')).toBeInTheDocument();
  expect(setSelectedArticle).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run ArticleList tests and verify they fail**

Run:

```bash
pnpm test -- src/test/features/articles/ArticleList.test.tsx
```

Expected: FAIL because selection mode UI does not exist.

- [ ] **Step 3: Add local state and store action**

In `ArticleList.tsx`, update lucide imports:

```ts
import { Archive, CheckCheck, CircleDot, LayoutGrid, List, RefreshCw, Star, X, CheckSquare, Clock3 } from "lucide-react";
```

Add after existing store selectors:

```ts
const bulkPatchArticles = useAppStore((state) => state.bulkPatchArticles);
```

Add local state:

```ts
const [selectionMode, setSelectionMode] = useState(false);
const [selectedArticleIds, setSelectedArticleIds] = useState<Set<string>>(() => new Set());
```

Add helpers after `articleCount`:

```ts
const filteredArticleIds = useMemo(
  () => filteredArticles.map((article) => article.id),
  [filteredArticles],
);
const selectedCount = selectedArticleIds.size;

const clearSelectionMode = () => {
  setSelectionMode(false);
  setSelectedArticleIds(new Set());
};

const toggleSelectedArticle = (articleId: string) => {
  setSelectionMode(true);
  setSelectedArticleIds((previous) => {
    const next = new Set(previous);
    if (next.has(articleId)) {
      next.delete(articleId);
    } else {
      next.add(articleId);
    }
    return next;
  });
};

const selectCurrentLoadedArticles = () => {
  setSelectionMode(true);
  setSelectedArticleIds(new Set(filteredArticleIds));
};

const runBulkPatch = (patch: Parameters<typeof bulkPatchArticles>[1]) => {
  const ids = Array.from(selectedArticleIds);
  if (ids.length === 0) return;
  bulkPatchArticles(ids, patch);
  clearSelectionMode();
};
```

Add cleanup effect:

```ts
useEffect(() => {
  const visibleIds = new Set(filteredArticleIds);
  setSelectedArticleIds((previous) => {
    const next = new Set(Array.from(previous).filter((id) => visibleIds.has(id)));
    return areSetsEqual(previous, next) ? previous : next;
  });
}, [filteredArticleIds]);
```

- [ ] **Step 4: Render the selection toolbar**

Add a helper before `renderLoadMoreFooter`:

```tsx
const renderSelectionToolbar = () => (
  <div className="flex h-12 min-w-0 items-center justify-between gap-3 border-b border-transparent px-4 dark:border-white/[0.04]">
    <span className="min-w-0 truncate text-[0.9rem] font-semibold">已选 {selectedCount} 篇</span>
    <div className="shrink-0 flex items-center gap-2">
      <ReaderToolbarIconButton
        icon={CheckSquare}
        label="选择当前列表"
        disabled={filteredArticleIds.length === 0}
        onClick={selectCurrentLoadedArticles}
      />
      <ReaderToolbarIconButton
        icon={CheckCheck}
        label="标为已读"
        disabled={selectedCount === 0}
        onClick={() => runBulkPatch({ isRead: true })}
      />
      <ReaderToolbarIconButton
        icon={CircleDot}
        label="标为未读"
        disabled={selectedCount === 0}
        onClick={() => runBulkPatch({ isRead: false })}
      />
      <ReaderToolbarIconButton
        icon={Star}
        label="加星标"
        disabled={selectedCount === 0}
        onClick={() => runBulkPatch({ isStarred: true })}
      />
      <ReaderToolbarIconButton
        icon={Clock3}
        label="稍后读"
        disabled={selectedCount === 0}
        onClick={() => runBulkPatch({ isReadLater: true })}
      />
      <ReaderToolbarIconButton
        icon={Archive}
        label="归档"
        disabled={selectedCount === 0}
        onClick={() => runBulkPatch({ isArchived: true })}
      />
      <ReaderToolbarIconButton icon={X} label="取消选择" onClick={clearSelectionMode} />
    </div>
  </div>
);
```

In the return header area, render selection toolbar first:

```tsx
{selectionMode ? renderSelectionToolbar() : (
  <div className="flex h-12 min-w-0 items-center justify-between gap-3 border-b border-transparent px-4 dark:border-white/[0.04]">
    ...
  </div>
)}
```

In the normal toolbar, add:

```tsx
<ReaderToolbarIconButton
  icon={CheckSquare}
  label="选择文章"
  pressed={selectionMode}
  onClick={() => setSelectionMode(true)}
/>
```

- [ ] **Step 5: Render checkboxes and selection row behavior**

In both list and card row button render paths:

Replace `onClick={() => setSelectedArticle(article.id)}` with:

```tsx
onClick={() => {
  if (selectionMode) {
    toggleSelectedArticle(article.id);
    return;
  }
  setSelectedArticle(article.id);
}}
onDoubleClick={() => setSelectedArticle(article.id)}
```

Inside each row, before title content, render:

```tsx
{selectionMode ? (
  <input
    type="checkbox"
    aria-label={`选择 ${displayTitle}`}
    checked={selectedArticleIds.has(article.id)}
    onChange={() => toggleSelectedArticle(article.id)}
    onClick={(event) => event.stopPropagation()}
    className="mt-1 h-4 w-4 shrink-0 rounded border-border accent-primary"
  />
) : null}
```

For card layout, wrap existing row content in a flex container that can place the checkbox at the start:

```tsx
<div className="flex h-full items-stretch gap-3">
  {selectionMode ? (...checkbox...) : null}
  <div className="flex h-full min-w-0 flex-1 items-stretch gap-3">
    ...existing card content...
  </div>
</div>
```

Keep `handleArticleKeyDown` so `Enter` still opens rows.

- [ ] **Step 6: Run ArticleList tests**

Run:

```bash
pnpm test -- src/test/features/articles/ArticleList.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/articles/components/ArticleList.tsx src/test/features/articles/ArticleList.test.tsx
git commit -m "feat(reader): add article selection mode"
```

---

### Task 6: Add Bulk Archive Confirmation

**Files:**
- Modify: `src/features/articles/components/ArticleList.tsx`
- Modify: `src/test/features/articles/ArticleList.test.tsx`

- [ ] **Step 1: Write archive confirmation test**

In `src/test/features/articles/ArticleList.test.tsx`, add:

```tsx
it('confirms bulk archive when more than 20 articles are selected', async () => {
  const bulkPatchArticles = vi.fn();
  useAppStore.setState({
    articles: Array.from({ length: 21 }, (_, index) =>
      createArticle({ id: String(3001 + index), title: `Article ${index + 1}` }),
    ),
    bulkPatchArticles,
  });

  render(<ArticleList />);

  fireEvent.click(screen.getByRole('button', { name: '选择文章' }));
  fireEvent.click(screen.getByRole('button', { name: '选择当前列表' }));
  fireEvent.click(screen.getByRole('button', { name: '归档' }));

  expect(screen.getByRole('alertdialog', { name: '确认批量归档' })).toBeInTheDocument();
  expect(bulkPatchArticles).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: '确认归档' }));
  expect(bulkPatchArticles).toHaveBeenCalledWith(expect.arrayContaining(['3001', '3021']), {
    isArchived: true,
  });
});
```

- [ ] **Step 2: Run ArticleList tests and verify they fail**

Run:

```bash
pnpm test -- src/test/features/articles/ArticleList.test.tsx
```

Expected: FAIL because archive confirmation is not implemented.

- [ ] **Step 3: Add confirmation state and dialog imports**

In `ArticleList.tsx`, import alert dialog components:

```ts
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
```

Add state:

```ts
const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
```

Add helpers:

```ts
const runBulkArchive = () => {
  if (selectedCount > 20) {
    setArchiveConfirmOpen(true);
    return;
  }
  runBulkPatch({ isArchived: true });
};

const confirmBulkArchive = () => {
  setArchiveConfirmOpen(false);
  runBulkPatch({ isArchived: true });
};
```

Change archive toolbar action:

```tsx
onClick={runBulkArchive}
```

- [ ] **Step 4: Render confirmation dialog**

Near the end of `ArticleList` return, before closing the root div:

```tsx
<AlertDialog open={archiveConfirmOpen} onOpenChange={setArchiveConfirmOpen}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>确认批量归档</AlertDialogTitle>
      <AlertDialogDescription>
        将归档当前选中的 {selectedCount} 篇文章。这个操作只影响已选文章，之后仍可从归档视图恢复。
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>取消</AlertDialogCancel>
      <AlertDialogAction onClick={confirmBulkArchive}>确认归档</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

- [ ] **Step 5: Run ArticleList tests**

Run:

```bash
pnpm test -- src/test/features/articles/ArticleList.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/articles/components/ArticleList.tsx src/test/features/articles/ArticleList.test.tsx
git commit -m "feat(reader): confirm large bulk archive"
```

---

### Task 7: Add Selection Keyboard Shortcuts

**Files:**
- Modify: `src/features/articles/components/ArticleList.tsx`
- Modify: `src/features/reader/components/ReaderLayout.tsx`
- Modify: `src/features/reader/components/ShortcutHelpDialog.tsx`
- Modify: `src/test/features/articles/ArticleList.test.tsx`
- Modify: `src/test/features/reader/ReaderLayout.test.tsx`

- [ ] **Step 1: Write shortcut tests**

In `src/test/features/articles/ArticleList.test.tsx`, add:

```tsx
it('uses x to toggle current article selection and shift+x to exit selection mode', async () => {
  useAppStore.setState({
    selectedArticleId: '3001',
    articles: [createArticle({ id: '3001', title: 'One' })],
  });

  render(<ArticleList />);

  fireEvent.keyDown(window, { key: 'x' });
  expect(screen.getByText('已选 1 篇')).toBeInTheDocument();

  fireEvent.keyDown(window, { key: 'X', shiftKey: true });
  expect(screen.queryByText(/已选/)).not.toBeInTheDocument();
});

it('uses escape to leave selection mode', async () => {
  useAppStore.setState({
    selectedArticleId: '3001',
    articles: [createArticle({ id: '3001', title: 'One' })],
  });

  render(<ArticleList />);

  fireEvent.click(screen.getByRole('button', { name: '选择文章' }));
  fireEvent.keyDown(window, { key: 'Escape' });

  expect(screen.queryByText(/已选/)).not.toBeInTheDocument();
});
```

In `src/test/features/reader/ReaderLayout.test.tsx`, add:

```tsx
it('does not block x and shift+x selection shortcuts', async () => {
  resetSettingsStore();
  useAppStore.setState({
    selectedArticleId: 'article-1',
    articles: [
      { id: 'article-1', feedId: 'feed-1', title: 'One', content: '', summary: '', publishedAt: '2026-05-19T00:00:00.000Z', link: '', isRead: false, isStarred: false, isReadLater: false, isArchived: false },
    ],
  });

  await renderWithNotificationsSettled();
  fireEvent.keyDown(window, { key: 'x' });

  expect(screen.getByText('已选 1 篇')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run shortcut tests and verify they fail**

Run:

```bash
pnpm test -- src/test/features/articles/ArticleList.test.tsx src/test/features/reader/ReaderLayout.test.tsx
```

Expected: FAIL because selection shortcuts are not wired.

- [ ] **Step 3: Let ReaderLayout ignore X selection shortcuts**

In `src/features/reader/components/ReaderLayout.tsx`, change the early shift guard:

```ts
if (event.defaultPrevented || event.altKey || (event.shiftKey && event.key !== '?' && event.key.toLowerCase() !== 'x')) {
  return;
}
```

Before other selected-article shortcuts, let `x` fall through to `ArticleList`:

```ts
if (key === 'x') {
  return;
}
```

- [ ] **Step 4: Add ArticleList keydown handling**

In `ArticleList.tsx`, add:

```ts
useEffect(() => {
  const handleSelectionShortcuts = (event: globalThis.KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target as HTMLElement | null;
    if (
      target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [data-radix-popper-content-wrapper]')
    ) {
      return;
    }

    const key = event.key.toLowerCase();
    if (key === 'x' && event.shiftKey) {
      event.preventDefault();
      if (selectionMode) {
        clearSelectionMode();
      } else {
        setSelectionMode(true);
      }
      return;
    }

    if (key === 'x') {
      if (!selectedArticleId) return;
      event.preventDefault();
      toggleSelectedArticle(selectedArticleId);
      return;
    }

    if (event.key === 'Escape' && selectionMode) {
      event.preventDefault();
      clearSelectionMode();
    }
  };

  window.addEventListener('keydown', handleSelectionShortcuts);
  return () => window.removeEventListener('keydown', handleSelectionShortcuts);
}, [clearSelectionMode, selectedArticleId, selectionMode, toggleSelectedArticle]);
```

If dependency warnings appear because helpers are recreated, wrap `clearSelectionMode` and `toggleSelectedArticle` in `useCallback`.

- [ ] **Step 5: Update shortcut help**

In `src/features/reader/components/ShortcutHelpDialog.tsx`, add:

```ts
['X', '选择当前文章'],
['Shift + X', '进入 / 退出选择模式'],
```

- [ ] **Step 6: Run shortcut tests**

Run:

```bash
pnpm test -- src/test/features/articles/ArticleList.test.tsx src/test/features/reader/ReaderLayout.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/articles/components/ArticleList.tsx src/features/reader/components/ReaderLayout.tsx src/features/reader/components/ShortcutHelpDialog.tsx src/test/features/articles/ArticleList.test.tsx src/test/features/reader/ReaderLayout.test.tsx
git commit -m "feat(reader): add article selection shortcuts"
```

---

### Task 8: Final Verification

**Files:**
- No planned file edits.

- [ ] **Step 1: Run focused tests**

Run:

```bash
pnpm test -- src/test/server/repositories/articlesRepo.bulkPatch.test.ts src/test/app/api/articles/routes.test.ts src/test/lib/apiClient.test.ts src/test/lib/userOperationCatalog.test.ts src/test/store/appStore.test.ts src/test/features/articles/ArticleList.test.tsx src/test/features/reader/ReaderLayout.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run type-check**

Run:

```bash
pnpm type-check
```

Expected: PASS.

- [ ] **Step 3: Run lint**

Run:

```bash
pnpm lint
```

Expected: PASS.

- [ ] **Step 4: Run production build**

Run:

```bash
pnpm build
```

Expected: PASS.

- [ ] **Step 5: Commit verification fixes only if needed**

If a verification command fails, return to the task that introduced the failing behavior, add or adjust the narrowest failing test, implement the fix, rerun the focused command, then rerun this final verification task. If every command passes, do not create an extra commit.
