# Reading Efficiency Phase 3 Tags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a basic article tag system with detail editing, list display, sidebar tag navigation, and `tag:<id>` reader views.

**Architecture:** Tags are persisted in `article_tags` and `article_taggings`, surfaced through focused tag repository/API helpers, and included in `readerSnapshot`. `ArticleView` owns the compact tag editor UI, while `appStore` owns optimistic add/remove updates across detail cache, visible articles, and sidebar tag counts.

**Tech Stack:** Next.js App Router, TypeScript, React 19, Zustand, PostgreSQL migrations, `pg`, Zod, Vitest, Testing Library, lucide-react.

---

## Scope

Included:

- Tag tables and constraints.
- Article tag repository helpers.
- `GET /api/tags`.
- `POST /api/articles/[id]/tags`.
- `DELETE /api/articles/[id]/tags/[tagId]`.
- Snapshot `tags` metadata and article item tags.
- `tag:<id>` reader filtering.
- API client tag helpers and DTO types.
- Store tag actions and optimistic cache/list/count updates.
- Sidebar tag group.
- Article list tag badges.
- Article detail tag editor.

Excluded:

- Bulk tag actions from selection mode.
- Tag rename, delete, merge, color editing, or management screen.
- Tag hierarchy.
- AI-generated tags.

## File Map

- Create `src/server/infra/db/migrations/0030_article_tags.sql`: tag schema.
- Create `src/test/server/db/migrations/articleTagsMigration.test.ts`: migration contract.
- Create `src/server/domains/articles/repositories/articleTagsRepo.ts`: focused tag persistence.
- Create `src/test/server/repositories/articleTagsRepo.test.ts`: SQL and transaction behavior.
- Create `src/app/api/tags/route.ts`: list tags API.
- Create `src/app/api/articles/[id]/tags/route.ts`: attach tag API.
- Create `src/app/api/articles/[id]/tags/[tagId]/route.ts`: detach tag API.
- Modify `src/test/app/api/articles/routes.test.ts`: article tag route tests.
- Create `src/test/app/api/tags/route.test.ts`: tag list route tests.
- Modify `src/lib/userOperationCatalog.ts`: add tag operation messages.
- Modify `src/test/lib/userOperationCatalog.test.ts`: tag operation message tests.
- Modify `src/server/domains/reader/services/readerSnapshotService.ts`: tag metadata, article tags, tag view filter.
- Modify `src/test/server/services/readerSnapshotService.test.ts`: filter/query contract tests.
- Modify `src/lib/api/apiClient.ts`: tag DTOs and request helpers, mappers.
- Modify `src/test/lib/apiClient.test.ts`: tag helper and mapper tests.
- Modify `src/types/index.ts`: `ArticleTag`, `ReaderTag`, and `Article.tags`.
- Modify `src/store/appStore.ts`: `tags`, add/remove tag actions, snapshot hydration.
- Modify `src/test/store/appStore.test.ts`: store optimistic tag behavior.
- Modify `src/features/feeds/components/FeedList.tsx`: sidebar tag group.
- Modify `src/test/features/feeds/FeedList.test.tsx`: sidebar tag navigation.
- Modify `src/features/articles/components/ArticleList.tsx`: list/card tag badges and tag view title.
- Modify `src/test/features/articles/ArticleList.test.tsx`: tag badge and empty tag view tests.
- Modify `src/features/articles/components/ArticleView.tsx`: compact tag editor.
- Modify `src/test/features/articles/ArticleView.tags.test.tsx`: detail tag editor tests.

---

### Task 1: Add Tag Schema Migration

**Files:**
- Create: `src/server/infra/db/migrations/0030_article_tags.sql`
- Create: `src/test/server/db/migrations/articleTagsMigration.test.ts`

- [ ] **Step 1: Write migration contract test**

Create `src/test/server/db/migrations/articleTagsMigration.test.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('article tags migration', () => {
  it('creates article tag and tagging tables with uniqueness and cascades', () => {
    const migrationPath = 'src/server/infra/db/migrations/0030_article_tags.sql';
    expect(existsSync(migrationPath)).toBe(true);

    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toContain('create table if not exists article_tags');
    expect(sql).toContain('id uuid primary key default gen_random_uuid()');
    expect(sql).toContain('name text not null');
    expect(sql).toContain('slug text not null');
    expect(sql).toContain('color text null');
    expect(sql).toContain('article_tags_name_lower_unique');
    expect(sql).toContain('on article_tags (lower(name))');
    expect(sql).toContain('article_tags_slug_unique');
    expect(sql).toContain('create table if not exists article_taggings');
    expect(sql).toContain('article_id bigint not null references articles(id) on delete cascade');
    expect(sql).toContain('tag_id uuid not null references article_tags(id) on delete cascade');
    expect(sql).toContain('primary key (article_id, tag_id)');
    expect(sql).toContain('article_taggings_tag_article_idx');
    expect(sql).toContain('on article_taggings (tag_id, article_id)');
  });
});
```

- [ ] **Step 2: Run the migration test and verify it fails**

Run:

```bash
pnpm test -- src/test/server/db/migrations/articleTagsMigration.test.ts
```

Expected: FAIL because `0030_article_tags.sql` does not exist.

- [ ] **Step 3: Create migration**

Create `src/server/infra/db/migrations/0030_article_tags.sql`:

```sql
create table if not exists article_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  color text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists article_tags_name_lower_unique
  on article_tags (lower(name));

create unique index if not exists article_tags_slug_unique
  on article_tags (slug);

create table if not exists article_taggings (
  article_id bigint not null references articles(id) on delete cascade,
  tag_id uuid not null references article_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (article_id, tag_id)
);

create index if not exists article_taggings_tag_article_idx
  on article_taggings (tag_id, article_id);

create index if not exists article_taggings_article_tag_idx
  on article_taggings (article_id, tag_id);
```

- [ ] **Step 4: Run migration test**

Run:

```bash
pnpm test -- src/test/server/db/migrations/articleTagsMigration.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/infra/db/migrations/0030_article_tags.sql src/test/server/db/migrations/articleTagsMigration.test.ts
git commit -m "feat(tags): add article tag schema"
```

---

### Task 2: Add Article Tag Repository

**Files:**
- Create: `src/server/domains/articles/repositories/articleTagsRepo.ts`
- Create: `src/test/server/repositories/articleTagsRepo.test.ts`

- [ ] **Step 1: Write repository tests**

Create `src/test/server/repositories/articleTagsRepo.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

describe('articleTagsRepo', () => {
  it('normalizes tag names and slug values', async () => {
    const mod = await import('@/server/domains/articles/repositories/articleTagsRepo');

    expect(mod.normalizeTagName('  AI   Tools  ')).toBe('AI Tools');
    expect(mod.slugifyTagName('AI Tools')).toBe('ai-tools');
    expect(mod.slugifyTagName('中文 标签')).toBe('中文-标签');
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

  it('detaches tags idempotently', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 0 });
    const pool = { query } as never;
    const mod = await import('@/server/domains/articles/repositories/articleTagsRepo');

    await expect(mod.detachArticleTag(pool, '3001', '00000000-0000-4000-8000-000000000001')).resolves.toEqual({ removed: true });
    expect(String(query.mock.calls[0][0])).toContain('delete from article_taggings');
  });
});
```

- [ ] **Step 2: Run repository tests and verify they fail**

Run:

```bash
pnpm test -- src/test/server/repositories/articleTagsRepo.test.ts
```

Expected: FAIL because `articleTagsRepo.ts` does not exist.

- [ ] **Step 3: Implement repository**

Create `src/server/domains/articles/repositories/articleTagsRepo.ts`:

```ts
import type { Pool, PoolClient } from 'pg';

export const TAG_NAME_MAX_LENGTH = 64;

export interface ArticleTagRow {
  id: string;
  name: string;
  slug: string;
  color: string | null;
}

export interface ReaderTagRow extends ArticleTagRow {
  articleCount: number;
}

type DbClient = Pick<Pool, 'query'> | PoolClient;
type TransactionPool = Pick<Pool, 'connect'>;

export function normalizeTagName(input: string): string {
  return input.trim().replace(/\s+/g, ' ');
}

export function slugifyTagName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, TAG_NAME_MAX_LENGTH) || 'tag';
}

function assertValidTagName(name: string): void {
  if (!name) {
    throw new Error('Tag name is required');
  }
  if (name.length > TAG_NAME_MAX_LENGTH) {
    throw new Error('Tag name is too long');
  }
}

export async function listTagsWithVisibleArticleCounts(pool: DbClient): Promise<ReaderTagRow[]> {
  const { rows } = await pool.query<ReaderTagRow>(`
    select
      tags.id,
      tags.name,
      tags.slug,
      tags.color,
      count(articles.id)::int as "articleCount"
    from article_tags tags
    left join article_taggings taggings on taggings.tag_id = tags.id
    left join articles on articles.id = taggings.article_id
      and articles.is_archived = false
      and articles.filter_status = any('{passed,error}'::text[])
    group by tags.id
    having count(articles.id) > 0
    order by lower(tags.name), tags.name
  `);

  return rows;
}

export async function listTagsForArticle(
  pool: DbClient,
  articleId: string,
): Promise<ArticleTagRow[]> {
  const { rows } = await pool.query<ArticleTagRow>(
    `
      select tags.id, tags.name, tags.slug, tags.color
      from article_tags tags
      inner join article_taggings taggings on taggings.tag_id = tags.id
      where taggings.article_id = $1
      order by lower(tags.name), tags.name
    `,
    [articleId],
  );

  return rows;
}

export async function listTagsForArticles(
  pool: DbClient,
  articleIds: string[],
): Promise<Array<ArticleTagRow & { articleId: string }>> {
  if (articleIds.length === 0) return [];

  const { rows } = await pool.query<ArticleTagRow & { articleId: string }>(
    `
      select
        taggings.article_id as "articleId",
        tags.id,
        tags.name,
        tags.slug,
        tags.color
      from article_tags tags
      inner join article_taggings taggings on taggings.tag_id = tags.id
      where taggings.article_id = any($1::bigint[])
      order by lower(tags.name), tags.name
    `,
    [articleIds],
  );

  return rows;
}

export async function attachArticleTag(
  pool: TransactionPool,
  articleId: string,
  inputName: string,
): Promise<ArticleTagRow> {
  const name = normalizeTagName(inputName);
  assertValidTagName(name);
  const slug = slugifyTagName(name);
  const client = await pool.connect();

  try {
    await client.query('begin');
    const existing = await client.query<ArticleTagRow>(
      `
        select id, name, slug, color
        from article_tags
        where lower(name) = lower($1)
        limit 1
      `,
      [name],
    );

    let tag = existing.rows[0];
    if (!tag) {
      const inserted = await client.query<ArticleTagRow>(
        `
          insert into article_tags (name, slug)
          values ($1, $2)
          on conflict (slug) do update
          set updated_at = article_tags.updated_at
          returning id, name, slug, color
        `,
        [name, slug],
      );
      tag = inserted.rows[0];
    }

    if (!tag) {
      throw new Error('Tag could not be created');
    }

    await client.query(
      `
        insert into article_taggings (article_id, tag_id)
        values ($1, $2)
        on conflict (article_id, tag_id) do nothing
      `,
      [articleId, tag.id],
    );
    await client.query('commit');
    return tag;
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

export async function detachArticleTag(
  pool: DbClient,
  articleId: string,
  tagId: string,
): Promise<{ removed: true }> {
  await pool.query(
    `
      delete from article_taggings
      where article_id = $1 and tag_id = $2
    `,
    [articleId, tagId],
  );

  return { removed: true };
}
```

- [ ] **Step 4: Run repository tests**

Run:

```bash
pnpm test -- src/test/server/repositories/articleTagsRepo.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/domains/articles/repositories/articleTagsRepo.ts src/test/server/repositories/articleTagsRepo.test.ts
git commit -m "feat(tags): add article tag repository"
```

---

### Task 3: Add Tag API Routes And Operation Catalog Entries

**Files:**
- Create: `src/app/api/tags/route.ts`
- Create: `src/app/api/articles/[id]/tags/route.ts`
- Create: `src/app/api/articles/[id]/tags/[tagId]/route.ts`
- Modify: `src/test/app/api/articles/routes.test.ts`
- Create: `src/test/app/api/tags/route.test.ts`
- Modify: `src/lib/userOperationCatalog.ts`
- Modify: `src/test/lib/userOperationCatalog.test.ts`

- [ ] **Step 1: Add user operation catalog tests**

Append to `src/test/lib/userOperationCatalog.test.ts`:

```ts
it('renders article tag operation messages', () => {
  expect(renderUserOperationSuccess('articleTag.add', { name: 'AI' })).toBe('已添加标签 AI');
  expect(renderUserOperationSuccess('articleTag.remove', { name: 'AI' })).toBe('已移除标签 AI');
  expect(renderUserOperationFailure('articleTag.add', undefined, { message: 'boom' })).toContain('添加标签失败');
  expect(renderUserOperationFailure('articleTag.remove', undefined, { message: 'boom' })).toContain('移除标签失败');
});
```

- [ ] **Step 2: Add API route tests**

Create `src/test/app/api/tags/route.test.ts`:

```ts
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
  listTagsWithVisibleArticleCounts: (...args: unknown[]) => listTagsWithVisibleArticleCountsMock(...args),
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
```

Add to `src/test/app/api/articles/routes.test.ts`:

```ts
const attachArticleTagMock = vi.fn();
const detachArticleTagMock = vi.fn();
```

Add the mocks to the existing mock section or create a new mock:

```ts
vi.mock('@/server/domains/articles/repositories/articleTagsRepo', () => ({
  attachArticleTag: (...args: unknown[]) => attachArticleTagMock(...args),
  detachArticleTag: (...args: unknown[]) => detachArticleTagMock(...args),
}));
```

Reset in `beforeEach`:

```ts
attachArticleTagMock.mockReset();
detachArticleTagMock.mockReset();
```

Add these tests:

```ts
it('POST /:id/tags attaches a normalized tag', async () => {
  attachArticleTagMock.mockResolvedValue({ id: '00000000-0000-4000-8000-000000000001', name: 'AI', slug: 'ai', color: null });
  const mod = await import('../../../../app/api/articles/[id]/tags/route');

  const res = await mod.POST(
    new Request('http://localhost/api/articles/3001/tags', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: ' AI ' }),
    }),
    { params: Promise.resolve({ id: '3001' }) },
  );
  const json = await res.json();

  expect(json.ok).toBe(true);
  expect(json.data.tag).toEqual({ id: '00000000-0000-4000-8000-000000000001', name: 'AI', slug: 'ai', color: null });
  expect(attachArticleTagMock).toHaveBeenCalledWith(pool, '3001', ' AI ');
});

it('POST /:id/tags rejects empty tag names', async () => {
  const mod = await import('../../../../app/api/articles/[id]/tags/route');
  const res = await mod.POST(
    new Request('http://localhost/api/articles/3001/tags', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '   ' }),
    }),
    { params: Promise.resolve({ id: '3001' }) },
  );
  const json = await res.json();

  expect(json.ok).toBe(false);
  expect(json.error.fields.name).toBeTruthy();
  expect(attachArticleTagMock).not.toHaveBeenCalled();
});

it('DELETE /:id/tags/:tagId detaches a tag idempotently', async () => {
  detachArticleTagMock.mockResolvedValue({ removed: true });
  const mod = await import('../../../../app/api/articles/[id]/tags/[tagId]/route');

  const res = await mod.DELETE(
    new Request('http://localhost/api/articles/3001/tags/00000000-0000-4000-8000-000000000001', {
      method: 'DELETE',
    }),
    { params: Promise.resolve({ id: '3001', tagId: '00000000-0000-4000-8000-000000000001' }) },
  );
  const json = await res.json();

  expect(json).toEqual({ ok: true, data: { removed: true } });
  expect(detachArticleTagMock).toHaveBeenCalledWith(pool, '3001', '00000000-0000-4000-8000-000000000001');
});
```

- [ ] **Step 3: Run API/catalog tests and verify they fail**

Run:

```bash
pnpm test -- src/test/app/api/tags/route.test.ts src/test/app/api/articles/routes.test.ts src/test/lib/userOperationCatalog.test.ts
```

Expected: FAIL because routes and operation keys are missing.

- [ ] **Step 4: Add operation catalog entries**

In `src/lib/userOperationCatalog.ts`, add keys to `UserOperationActionKey`:

```ts
| 'articleTag.add'
| 'articleTag.remove'
```

Add catalog entries near article operations:

```ts
'articleTag.add': {
  mode: 'immediate',
  category: 'article',
  successMessage: (context) => `已添加标签 ${typeof context?.name === 'string' ? context.name : ''}`.trim(),
  errorPrefix: () => '添加标签失败',
},
'articleTag.remove': {
  mode: 'immediate',
  category: 'article',
  successMessage: (context) => `已移除标签 ${typeof context?.name === 'string' ? context.name : ''}`.trim(),
  errorPrefix: () => '移除标签失败',
},
```

- [ ] **Step 5: Create API routes**

Create `src/app/api/tags/route.ts`:

```ts
import { requireApiSession } from '@/server/domains/auth/services/session';
import { listTagsWithVisibleArticleCounts } from '@/server/domains/articles/repositories/articleTagsRepo';
import { getPool } from '@/server/infra/db/pool';
import { fail, ok } from '@/server/infra/http/apiResponse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const authResponse = await requireApiSession();
  if (authResponse) return authResponse;

  try {
    const tags = await listTagsWithVisibleArticleCounts(getPool());
    return ok({ tags });
  } catch (err) {
    return fail(err);
  }
}
```

Create `src/app/api/articles/[id]/tags/route.ts`:

```ts
import { requireApiSession } from '@/server/domains/auth/services/session';
import { attachArticleTag, TAG_NAME_MAX_LENGTH } from '@/server/domains/articles/repositories/articleTagsRepo';
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

const paramsSchema = z.object({ id: numericIdSchema });
const bodySchema = z.object({
  name: z.string().transform((value) => value.trim().replace(/\s+/g, ' ')).pipe(
    z.string().min(1, 'Tag name is required').max(TAG_NAME_MAX_LENGTH, 'Tag name is too long'),
  ),
});

function zodIssuesToFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'body';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const authResponse = await requireApiSession();
  if (authResponse) return authResponse;

  const pool = getPool();

  try {
    const params = paramsSchema.safeParse(await context.params);
    if (!params.success) {
      return fail(new ValidationError('Invalid route params', zodIssuesToFields(params.error)));
    }

    const json = await request.json().catch(() => null);
    const body = bodySchema.safeParse(json);
    if (!body.success) {
      const error = new ValidationError('Invalid request body', zodIssuesToFields(body.error));
      await writeUserOperationFailedLog(pool, {
        actionKey: 'articleTag.add',
        source: 'app/api/articles/[id]/tags',
        err: error,
      });
      return fail(error);
    }

    const tag = await attachArticleTag(pool, params.data.id, body.data.name);
    await writeUserOperationSucceededLog(pool, {
      actionKey: 'articleTag.add',
      source: 'app/api/articles/[id]/tags',
      context: { articleId: params.data.id, tagId: tag.id, name: tag.name },
    });
    return ok({ tag });
  } catch (err) {
    await writeUserOperationFailedLog(pool, {
      actionKey: 'articleTag.add',
      source: 'app/api/articles/[id]/tags',
      err,
    });
    return fail(err);
  }
}
```

Create `src/app/api/articles/[id]/tags/[tagId]/route.ts`:

```ts
import { requireApiSession } from '@/server/domains/auth/services/session';
import { detachArticleTag } from '@/server/domains/articles/repositories/articleTagsRepo';
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

const paramsSchema = z.object({
  id: numericIdSchema,
  tagId: z.uuid(),
});

function zodIssuesToFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'params';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string; tagId: string }> }) {
  const authResponse = await requireApiSession();
  if (authResponse) return authResponse;

  const pool = getPool();

  try {
    const params = paramsSchema.safeParse(await context.params);
    if (!params.success) {
      return fail(new ValidationError('Invalid route params', zodIssuesToFields(params.error)));
    }

    const result = await detachArticleTag(pool, params.data.id, params.data.tagId);
    await writeUserOperationSucceededLog(pool, {
      actionKey: 'articleTag.remove',
      source: 'app/api/articles/[id]/tags/[tagId]',
      context: { articleId: params.data.id, tagId: params.data.tagId },
    });
    return ok(result);
  } catch (err) {
    await writeUserOperationFailedLog(pool, {
      actionKey: 'articleTag.remove',
      source: 'app/api/articles/[id]/tags/[tagId]',
      err,
    });
    return fail(err);
  }
}
```

- [ ] **Step 6: Run API/catalog tests**

Run:

```bash
pnpm test -- src/test/app/api/tags/route.test.ts src/test/app/api/articles/routes.test.ts src/test/lib/userOperationCatalog.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/tags/route.ts src/app/api/articles/[id]/tags/route.ts src/app/api/articles/[id]/tags/[tagId]/route.ts src/test/app/api/tags/route.test.ts src/test/app/api/articles/routes.test.ts src/lib/userOperationCatalog.ts src/test/lib/userOperationCatalog.test.ts
git commit -m "feat(tags): add article tag APIs"
```

---

### Task 4: Add Tags To Reader Snapshot And Tag Views

**Files:**
- Modify: `src/server/domains/reader/services/readerSnapshotService.ts`
- Modify: `src/test/server/services/readerSnapshotService.test.ts`

- [ ] **Step 1: Add snapshot service tests**

Append to `src/test/server/services/readerSnapshotService.test.ts`:

```ts
it('filters tag views through article_taggings and excludes archived articles', () => {
  const filter = buildArticleFilter({ view: 'tag:00000000-0000-4000-8000-000000000001' });

  expect(filter.whereSql).toContain('articles.id in (select article_id from article_taggings where tag_id = $1::uuid)');
  expect(filter.whereSql).toContain('is_archived = false');
  expect(filter.params[0]).toBe('00000000-0000-4000-8000-000000000001');
});

it('selects article tags and sidebar tags in reader snapshot', async () => {
  const queries: string[] = [];
  const pool = {
    query: async (sql: string) => {
      queries.push(sql);
      if (sql.includes('from categories')) return { rows: [] };
      if (sql.includes('from feeds')) return { rows: [] };
      if (sql.includes('select feed_id as "feedId"')) return { rows: [] };
      if (sql.includes('from article_tags tags') && sql.includes('"articleCount"')) {
        return { rows: [{ id: 'tag-1', name: 'AI', slug: 'ai', color: null, articleCount: 1 }] };
      }
      if (sql.includes('from article_tags tags') && sql.includes('taggings.article_id = any')) {
        return { rows: [{ articleId: '3001', id: 'tag-1', name: 'AI', slug: 'ai', color: null }] };
      }
      if (sql.includes('select count(*)::int as "totalCount"')) return { rows: [{ totalCount: 1 }] };
      if (sql.includes('order by "sortPublishedAt"')) {
        return {
          rows: [{
            id: '3001',
            feedId: 'feed-1',
            title: 'Article',
            titleOriginal: 'Article',
            titleZh: null,
            summary: null,
            previewImage: null,
            author: null,
            publishedAt: null,
            link: null,
            filterStatus: 'passed',
            isFiltered: false,
            filteredBy: [],
            sourceLanguage: null,
            contentHtml: null,
            contentFullHtml: null,
            isRead: false,
            isStarred: false,
            isReadLater: false,
            readLaterAt: null,
            isArchived: false,
            archivedAt: null,
            aiSummarySessionId: null,
            aiSummarySessionStatus: null,
            aiSummarySessionDraftText: null,
            aiSummarySessionFinalText: null,
            aiSummarySessionErrorCode: null,
            aiSummarySessionErrorMessage: null,
            aiSummarySessionRawErrorMessage: null,
            aiSummarySessionStartedAt: null,
            aiSummarySessionFinishedAt: null,
            aiSummarySessionUpdatedAt: null,
            sortPublishedAt: '1970-01-01T00:00:00.000Z',
          }],
        };
      }
      return { rows: [] };
    },
  };

  const snapshot = await getReaderSnapshot(pool as never, { view: 'all' });

  expect(snapshot.tags).toEqual([{ id: 'tag-1', name: 'AI', slug: 'ai', color: null, articleCount: 1 }]);
  expect(snapshot.articles.items[0]?.tags).toEqual([{ id: 'tag-1', name: 'AI', slug: 'ai', color: null }]);
  expect(queries.some((sql) => sql.includes('from article_tags tags') && sql.includes('"articleCount"'))).toBe(true);
});
```

- [ ] **Step 2: Run snapshot tests and verify they fail**

Run:

```bash
pnpm test -- src/test/server/services/readerSnapshotService.test.ts
```

Expected: FAIL because snapshot tags and tag view filter are missing.

- [ ] **Step 3: Implement tag view filtering and snapshot tags**

In `src/server/domains/reader/services/readerSnapshotService.ts`, import tag helpers:

```ts
import {
  listTagsForArticles,
  listTagsWithVisibleArticleCounts,
  type ArticleTagRow,
  type ReaderTagRow,
} from '@/server/domains/articles/repositories/articleTagsRepo';
```

Add tag view helpers near constants:

```ts
const TAG_VIEW_PREFIX = 'tag:';

function getTagViewId(view: string): string | null {
  return view.startsWith(TAG_VIEW_PREFIX) ? view.slice(TAG_VIEW_PREFIX.length) : null;
}
```

Update `buildArticleFilter` before feed-specific logic:

```ts
const tagViewId = getTagViewId(input.view);
if (tagViewId) {
  whereParts.push(`articles.id in (select article_id from article_taggings where tag_id = $${paramIndex++}::uuid)`);
  params.push(tagViewId);
} else if (input.view === AI_DIGEST_VIEW_ID) {
  whereParts.push("feed_id in (select id from feeds where kind = 'ai_digest')");
}
```

Update `isSpecificFeedView` to exclude tag views:

```ts
const isSpecificFeedView =
  !tagViewId &&
  input.view !== 'all' &&
  input.view !== 'unread' &&
  input.view !== 'starred' &&
  input.view !== AI_DIGEST_VIEW_ID &&
  input.view !== READ_LATER_VIEW_ID &&
  input.view !== ARCHIVED_VIEW_ID &&
  !isRssSmartView(input.view);
```

Add interfaces:

```ts
export type ReaderSnapshotTag = ReaderTagRow;
```

Add `tags: ReaderSnapshotTag[];` to `ReaderSnapshot`.

Add `tags: ArticleTagRow[];` to `ReaderSnapshotArticleItem`.

In `getReaderSnapshot`, load sidebar tags with categories and feeds:

```ts
const [categories, feeds, tags] = await Promise.all([
  listCategories(pool),
  listFeeds(pool),
  listTagsWithVisibleArticleCounts(pool),
]);
```

After `const rows = queriedRows.slice(0, limit);`, add:

```ts
const tagRows = await listTagsForArticles(pool, rows.map((row) => row.id));
const tagsByArticleId = new Map<string, ArticleTagRow[]>();
for (const tag of tagRows) {
  const list = tagsByArticleId.get(tag.articleId) ?? [];
  list.push({ id: tag.id, name: tag.name, slug: tag.slug, color: tag.color });
  tagsByArticleId.set(tag.articleId, list);
}
```

Return top-level `tags` and per-item `tags`:

```ts
return {
  categories,
  feeds: feedsWithUnread,
  tags,
  articles: {
    items: rows.map((item) => {
      // existing destructuring
      return {
        ...rest,
        tags: tagsByArticleId.get(rest.id) ?? [],
        previewImage: rewritePreviewImage(rest.previewImage),
        // existing fields
      };
    }),
    nextCursor,
    totalCount,
  },
};
```

- [ ] **Step 4: Run snapshot tests**

Run:

```bash
pnpm test -- src/test/server/services/readerSnapshotService.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/domains/reader/services/readerSnapshotService.ts src/test/server/services/readerSnapshotService.test.ts
git commit -m "feat(tags): include tags in reader snapshot"
```

---

### Task 5: Add Client Types And Store Tag Actions

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/lib/api/apiClient.ts`
- Modify: `src/test/lib/apiClient.test.ts`
- Modify: `src/store/appStore.ts`
- Modify: `src/test/store/appStore.test.ts`

- [ ] **Step 1: Add API client tests**

Append to `src/test/lib/apiClient.test.ts`:

```ts
it('maps snapshot and detail article tags', async () => {
  const { mapSnapshotArticleItem, mapArticleDto } = await import('@/lib/api/apiClient');
  const tags = [{ id: 'tag-1', name: 'AI', slug: 'ai', color: null }];

  expect(mapSnapshotArticleItem({
    id: '3001',
    feedId: 'feed-1',
    title: 'Article',
    titleOriginal: 'Article',
    titleZh: null,
    summary: null,
    previewImage: null,
    author: null,
    publishedAt: null,
    link: null,
    filterStatus: 'passed',
    isFiltered: false,
    filteredBy: [],
    isRead: false,
    isReadLater: false,
    readLaterAt: null,
    isArchived: false,
    archivedAt: null,
    isStarred: false,
    bodyTranslationEligible: true,
    bodyTranslationBlockedReason: null,
    aiSummarySession: null,
    tags,
  }).tags).toEqual(tags);

  expect(mapArticleDto({
    id: '3001',
    feedId: 'feed-1',
    dedupeKey: 'guid:3001',
    title: 'Article',
    titleOriginal: 'Article',
    titleZh: null,
    link: null,
    author: null,
    publishedAt: null,
    contentHtml: null,
    contentFullHtml: null,
    contentFullFetchedAt: null,
    contentFullError: null,
    contentFullSourceUrl: null,
    aiSummary: null,
    aiSummaryModel: null,
    aiSummarizedAt: null,
    aiTranslationBilingualHtml: null,
    aiTranslationZhHtml: null,
    aiTranslationModel: null,
    aiTranslatedAt: null,
    summary: null,
    filterStatus: 'passed',
    isFiltered: false,
    filteredBy: [],
    isRead: false,
    readAt: null,
    isReadLater: false,
    readLaterAt: null,
    isArchived: false,
    archivedAt: null,
    isStarred: false,
    starredAt: null,
    tags,
  }).tags).toEqual(tags);
});

it('sends article tag add and remove requests', async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: { tag: { id: 'tag-1', name: 'AI', slug: 'ai', color: null } } }), { headers: { 'content-type': 'application/json' } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: { removed: true } }), { headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchMock);
  const { addArticleTag, removeArticleTag } = await import('@/lib/api/apiClient');

  await expect(addArticleTag('3001', 'AI', { notifyOnError: false })).resolves.toEqual({ id: 'tag-1', name: 'AI', slug: 'ai', color: null });
  await expect(removeArticleTag('3001', 'tag-1', { notifyOnError: false })).resolves.toEqual({ removed: true });

  expect(fetchMock.mock.calls[0]?.[0]).toBeInstanceOf(Request);
  expect((fetchMock.mock.calls[0]?.[0] as Request).url).toContain('/api/articles/3001/tags');
  expect((fetchMock.mock.calls[0]?.[0] as Request).method).toBe('POST');
  expect((fetchMock.mock.calls[1]?.[0] as Request).url).toContain('/api/articles/3001/tags/tag-1');
  expect((fetchMock.mock.calls[1]?.[0] as Request).method).toBe('DELETE');
});
```

- [ ] **Step 2: Add store tests**

Append near existing workflow tests in `src/test/store/appStore.test.ts`:

```ts
it('adds an article tag into visible article, detail cache, and sidebar counts', async () => {
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = getFetchCallUrl(input);
    const method = getFetchCallMethod(input, init);
    if (url.includes('/api/articles/3001/tags') && method === 'POST') {
      return jsonResponse({ ok: true, data: { tag: { id: 'tag-1', name: 'AI', slug: 'ai', color: null } } });
    }
    throw new Error(`Unexpected fetch: ${method} ${url}`);
  });

  useAppStore.setState({
    articles: [createSnapshotArticle('3001', 'feed-1', 'Tagged Article')],
    articleDetailCache: {
      '3001': {
        ...createSnapshotArticle('3001', 'feed-1', 'Tagged Article'),
        content: '<p>content</p>',
        tags: [],
      },
    },
    tags: [],
  });

  useAppStore.getState().addArticleTag('3001', 'AI');
  await flushPromises();

  expect(useAppStore.getState().articles[0]?.tags).toEqual([{ id: 'tag-1', name: 'AI', slug: 'ai', color: null }]);
  expect(useAppStore.getState().articleDetailCache['3001']?.tags).toEqual([{ id: 'tag-1', name: 'AI', slug: 'ai', color: null }]);
  expect(useAppStore.getState().tags).toEqual([{ id: 'tag-1', name: 'AI', slug: 'ai', color: null, articleCount: 1 }]);
  expect(runImmediateSuccessMock).toHaveBeenCalledWith({ actionKey: 'articleTag.add', context: { name: 'AI' } });
});

it('removes an article from a tag view when removing that tag', async () => {
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = getFetchCallUrl(input);
    const method = getFetchCallMethod(input, init);
    if (url.includes('/api/articles/3001/tags/tag-1') && method === 'DELETE') {
      return jsonResponse({ ok: true, data: { removed: true } });
    }
    throw new Error(`Unexpected fetch: ${method} ${url}`);
  });

  useAppStore.setState({
    selectedView: 'tag:tag-1',
    selectedArticleId: '3001',
    articles: [
      { ...createSnapshotArticle('3001', 'feed-1', 'Tagged Article'), tags: [{ id: 'tag-1', name: 'AI', slug: 'ai', color: null }] },
      { ...createSnapshotArticle('3002', 'feed-1', 'Next Article'), tags: [{ id: 'tag-1', name: 'AI', slug: 'ai', color: null }] },
    ],
    tags: [{ id: 'tag-1', name: 'AI', slug: 'ai', color: null, articleCount: 2 }],
  });

  useAppStore.getState().removeArticleTag('3001', { id: 'tag-1', name: 'AI', slug: 'ai', color: null });
  await flushPromises();

  expect(useAppStore.getState().articles.map((article) => article.id)).toEqual(['3002']);
  expect(useAppStore.getState().selectedArticleId).toBe('3002');
  expect(useAppStore.getState().tags[0]?.articleCount).toBe(1);
});
```

- [ ] **Step 3: Run client/store tests and verify they fail**

Run:

```bash
pnpm test -- src/test/lib/apiClient.test.ts src/test/store/appStore.test.ts
```

Expected: FAIL because client/store tags are missing.

- [ ] **Step 4: Add types and API client helpers**

In `src/types/index.ts`, add:

```ts
export interface ArticleTag {
  id: string;
  name: string;
  slug: string;
  color?: string | null;
}

export interface ReaderTag extends ArticleTag {
  articleCount: number;
}
```

Add `tags?: ArticleTag[];` to `Article`.

In `src/lib/api/apiClient.ts`, import `ArticleTag` and `ReaderTag` from types if needed, or define DTOs:

```ts
export type ArticleTagDto = ArticleTag;
export type ReaderTagDto = ReaderTag;
```

Add `tags: ReaderTagDto[];` to `ReaderSnapshotDto`.

Add `tags?: ArticleTagDto[];` to snapshot article items and `ArticleDto`.

Add client helpers:

```ts
export async function getTags(options?: RequestApiOptions): Promise<{ tags: ReaderTagDto[] }> {
  return requestApi('/api/tags', undefined, options);
}

export async function addArticleTag(
  articleId: string,
  name: string,
  options?: RequestApiOptions,
): Promise<ArticleTagDto> {
  const result = await requestApi<{ tag: ArticleTagDto }>(
    `/api/articles/${encodeURIComponent(articleId)}/tags`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    },
    options,
  );
  return result.tag;
}

export async function removeArticleTag(
  articleId: string,
  tagId: string,
  options?: RequestApiOptions,
): Promise<{ removed: true }> {
  return requestApi(
    `/api/articles/${encodeURIComponent(articleId)}/tags/${encodeURIComponent(tagId)}`,
    { method: 'DELETE' },
    options,
  );
}
```

Map tags:

```ts
tags: dto.tags ?? [],
```

in both `mapSnapshotArticleItem` and `mapArticleDto`.

- [ ] **Step 5: Add store state and actions**

In `src/store/appStore.ts`, import API helpers and tag types:

```ts
addArticleTag as addArticleTagRequest,
removeArticleTag as removeArticleTagRequest,
type ArticleTagDto,
type ReaderTagDto,
```

Add to `AppState`:

```ts
tags: ReaderTagDto[];
addArticleTag: (articleId: string, name: string) => void;
removeArticleTag: (articleId: string, tag: ArticleTagDto) => void;
```

Initialize `tags: []`.

In `loadSnapshot`, set `tags: snapshot.tags ?? []`.

Add helpers:

```ts
function articleHasTag(article: Article | undefined, tagId: string): boolean {
  return Boolean(article?.tags?.some((tag) => tag.id === tagId));
}

function upsertArticleTag(article: Article, tag: ArticleTagDto): Article {
  if (articleHasTag(article, tag.id)) return article;
  return { ...article, tags: [...(article.tags ?? []), tag] };
}

function removeTagFromArticle(article: Article, tagId: string): Article {
  return { ...article, tags: (article.tags ?? []).filter((tag) => tag.id !== tagId) };
}

function incrementReaderTag(tags: ReaderTagDto[], tag: ArticleTagDto): ReaderTagDto[] {
  const existing = tags.find((item) => item.id === tag.id);
  if (!existing) return [...tags, { ...tag, articleCount: 1 }];
  return tags.map((item) => item.id === tag.id ? { ...item, articleCount: item.articleCount + 1 } : item);
}

function decrementReaderTag(tags: ReaderTagDto[], tagId: string): ReaderTagDto[] {
  return tags
    .map((item) => item.id === tagId ? { ...item, articleCount: Math.max(0, item.articleCount - 1) } : item)
    .filter((item) => item.articleCount > 0);
}
```

Add actions near workflow actions:

```ts
addArticleTag: (articleId, name) => {
  const articleBefore = getArticleFromCollections(articleId, get().articles, get().articleDetailCache);
  void addArticleTagRequest(articleId, name, { notifyOnError: false })
    .then((tag) => {
      const alreadyTagged = articleHasTag(articleBefore, tag.id);
      set((state) => ({
        articles: state.articles.map((article) => article.id === articleId ? upsertArticleTag(article, tag) : article),
        articleDetailCache: updateCachedArticle(state.articleDetailCache, articleId, (article) => upsertArticleTag(article, tag)),
        tags: alreadyTagged || articleBefore?.isArchived ? state.tags : incrementReaderTag(state.tags, tag),
      }));
      runImmediateSuccess({ actionKey: 'articleTag.add', context: { name: tag.name } });
    })
    .catch((err) => {
      runImmediateFailure({ actionKey: 'articleTag.add', context: { name }, err });
    });
},
removeArticleTag: (articleId, tag) => {
  const stateBefore = get();
  const articleBefore = getArticleFromCollections(articleId, stateBefore.articles, stateBefore.articleDetailCache);
  const hadTag = articleHasTag(articleBefore, tag.id);
  void removeArticleTagRequest(articleId, tag.id, { notifyOnError: false })
    .then(() => {
      set((state) => {
        const articles = state.articles
          .map((article) => article.id === articleId ? removeTagFromArticle(article, tag.id) : article)
          .filter((article) => state.selectedView === `tag:${tag.id}` ? article.id !== articleId : true);
        return {
          articles,
          articleDetailCache: updateCachedArticle(state.articleDetailCache, articleId, (article) => removeTagFromArticle(article, tag.id)),
          tags: hadTag && !articleBefore?.isArchived ? decrementReaderTag(state.tags, tag.id) : state.tags,
          selectedArticleId:
            state.selectedView === `tag:${tag.id}` && state.selectedArticleId === articleId
              ? articles.find((article) => !article.isArchived)?.id ?? null
              : state.selectedArticleId,
        };
      });
      runImmediateSuccess({ actionKey: 'articleTag.remove', context: { name: tag.name } });
    })
    .catch((err) => {
      runImmediateFailure({ actionKey: 'articleTag.remove', context: { name: tag.name }, err });
    });
},
```

- [ ] **Step 6: Run client/store tests**

Run:

```bash
pnpm test -- src/test/lib/apiClient.test.ts src/test/store/appStore.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/lib/api/apiClient.ts src/test/lib/apiClient.test.ts src/store/appStore.ts src/test/store/appStore.test.ts
git commit -m "feat(tags): add client and store tag state"
```

---

### Task 6: Add Sidebar Tag Group And Article List Badges

**Files:**
- Modify: `src/features/feeds/components/FeedList.tsx`
- Modify: `src/test/features/feeds/FeedList.test.tsx`
- Modify: `src/features/articles/components/ArticleList.tsx`
- Modify: `src/test/features/articles/ArticleList.test.tsx`

- [ ] **Step 1: Add FeedList and ArticleList tests**

Add to `src/test/features/feeds/FeedList.test.tsx`:

```tsx
it('renders tag rows and navigates to a tag view', async () => {
  useAppStore.setState({
    tags: [{ id: 'tag-1', name: 'AI', slug: 'ai', color: null, articleCount: 2 }],
    selectedView: 'all',
  });

  render(<FeedList />);

  expect(screen.getByText('标签')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /AI/ }));

  expect(useAppStore.getState().selectedView).toBe('tag:tag-1');
});
```

Add to `src/test/features/articles/ArticleList.test.tsx`:

```tsx
it('renders article tag badges and tag view title', () => {
  useAppStore.setState({
    selectedView: 'tag:tag-1',
    showUnreadOnly: false,
    tags: [{ id: 'tag-1', name: 'AI', slug: 'ai', color: null, articleCount: 1 }],
    articles: [{
      id: '3001',
      feedId: 'feed-1',
      title: 'Tagged Article',
      content: '',
      summary: 'Summary',
      publishedAt: new Date('2026-02-25T00:00:00.000Z').toISOString(),
      link: 'https://example.com/1',
      isRead: false,
      isStarred: false,
      tags: [
        { id: 'tag-1', name: 'AI', slug: 'ai', color: null },
        { id: 'tag-2', name: 'Research', slug: 'research', color: null },
        { id: 'tag-3', name: 'Longform', slug: 'longform', color: null },
      ],
    }],
  });

  renderWithNotifications();

  expect(screen.getByRole('heading', { name: 'AI' })).toBeInTheDocument();
  expect(screen.getByText('AI')).toBeInTheDocument();
  expect(screen.getByText('Research')).toBeInTheDocument();
  expect(screen.getByText('+1')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run UI list tests and verify they fail**

Run:

```bash
pnpm test -- src/test/features/feeds/FeedList.test.tsx src/test/features/articles/ArticleList.test.tsx
```

Expected: FAIL because sidebar tag group and badges are missing.

- [ ] **Step 3: Implement FeedList tag group**

In `src/features/feeds/components/FeedList.tsx`, import `Tag` icon:

```ts
import { Tag } from 'lucide-react';
```

Add store selector:

```ts
const tags = useAppStore((state) => state.tags);
```

Render below smart views:

```tsx
{tags.length > 0 ? (
  <div className="mt-3">
    <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
      标签
    </div>
    <div className="space-y-0.5">
      {tags.map((tag) => {
        const viewId = `tag:${tag.id}`;
        const selected = renderedSelectedView === viewId;
        return (
          <button
            key={tag.id}
            type="button"
            onClick={() => setSelectedView(viewId)}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm transition-colors',
              selected ? READER_PANE_ACTIVE_ITEM_CLASS_NAME : READER_PANE_HOVER_BACKGROUND_CLASS_NAME,
            )}
            aria-current={selected ? 'page' : undefined}
          >
            <Tag className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{tag.name}</span>
            <Badge variant="secondary" className={LEFT_RAIL_UNREAD_BADGE_CLASS_NAME}>
              {tag.articleCount}
            </Badge>
          </button>
        );
      })}
    </div>
  </div>
) : null}
```

- [ ] **Step 4: Implement ArticleList tag title and badges**

In `src/features/articles/components/ArticleList.tsx`, select tags:

```ts
const tags = useAppStore((state) => state.tags);
```

Add helper:

```ts
const tagViewId = renderedSelectedView.startsWith('tag:') ? renderedSelectedView.slice(4) : null;
const selectedTag = tagViewId ? tags.find((tag) => tag.id === tagViewId) ?? null : null;
```

Update `headerTitle`:

```ts
const headerTitle =
  selectedTag ? selectedTag.name :
  renderedSelectedView === AI_DIGEST_VIEW_ID ? '智能报告' : (selectedFeed?.title ?? '文章');
```

Update empty state:

```ts
if (selectedTag) {
  return '这个标签下暂时没有可见文章';
}
```

Add `renderArticleTags` helper:

```tsx
const renderArticleTags = (article: (typeof filteredArticles)[number]) => {
  const articleTags = article.tags ?? [];
  if (articleTags.length === 0) return null;
  const visibleTags = articleTags.slice(0, 2);
  const overflowCount = articleTags.length - visibleTags.length;

  return (
    <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1">
      {visibleTags.map((tag) => (
        <Badge key={tag.id} variant="secondary" className="h-5 max-w-28 truncate px-1.5 text-[10px] font-medium">
          {tag.name}
        </Badge>
      ))}
      {overflowCount > 0 ? (
        <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-medium">
          +{overflowCount}
        </Badge>
      ) : null}
    </div>
  );
};
```

Render `{renderArticleTags(article)}` below title in list and card rows.

- [ ] **Step 5: Run UI list tests**

Run:

```bash
pnpm test -- src/test/features/feeds/FeedList.test.tsx src/test/features/articles/ArticleList.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/feeds/components/FeedList.tsx src/test/features/feeds/FeedList.test.tsx src/features/articles/components/ArticleList.tsx src/test/features/articles/ArticleList.test.tsx
git commit -m "feat(tags): show tags in reader navigation"
```

---

### Task 7: Add Article Detail Tag Editor

**Files:**
- Modify: `src/features/articles/components/ArticleView.tsx`
- Create: `src/test/features/articles/ArticleView.tags.test.tsx`

- [ ] **Step 1: Write ArticleView tag editor tests**

Create `src/test/features/articles/ArticleView.tags.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ArticleView from '../../../features/articles/components/ArticleView';
import { useAppStore } from '../../../store/appStore';

vi.mock('../../../features/toast/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function createArticle() {
  return {
    id: 'article-1',
    feedId: 'feed-1',
    title: 'Tagged Article',
    content: '<p>content</p>',
    summary: 'summary',
    publishedAt: '2026-01-01T00:00:00.000Z',
    link: 'https://example.com/article-1',
    isRead: false,
    isStarred: false,
    tags: [{ id: 'tag-1', name: 'AI', slug: 'ai', color: null }],
  };
}

describe('ArticleView tag editor', () => {
  beforeEach(() => {
    useAppStore.setState({
      selectedArticleId: 'article-1',
      articles: [createArticle()],
      articleDetailCache: { 'article-1': createArticle() },
      addArticleTag: vi.fn(),
      removeArticleTag: vi.fn(),
    });
  });

  it('renders existing tags and removes one', () => {
    render(<ArticleView />);

    expect(screen.getByText('AI')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '移除标签 AI' }));

    expect(useAppStore.getState().removeArticleTag).toHaveBeenCalledWith('article-1', {
      id: 'tag-1',
      name: 'AI',
      slug: 'ai',
      color: null,
    });
  });

  it('adds a tag with Enter and clears the input', () => {
    render(<ArticleView />);

    const input = screen.getByRole('textbox', { name: '添加标签' });
    fireEvent.change(input, { target: { value: 'Research' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(useAppStore.getState().addArticleTag).toHaveBeenCalledWith('article-1', 'Research');
    expect(input).toHaveValue('');
  });

  it('shows inline validation for an empty tag', () => {
    render(<ArticleView />);

    const input = screen.getByRole('textbox', { name: '添加标签' });
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.getByText('请输入标签名称')).toBeInTheDocument();
    expect(useAppStore.getState().addArticleTag).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run ArticleView tag tests and verify they fail**

Run:

```bash
pnpm test -- src/test/features/articles/ArticleView.tags.test.tsx
```

Expected: FAIL because the tag editor is missing.

- [ ] **Step 3: Implement compact tag editor**

In `src/features/articles/components/ArticleView.tsx`, import `Tag` and `X` icons if not present:

```ts
import { Plus, Tag, X } from 'lucide-react';
```

Select store actions:

```ts
const addArticleTag = useAppStore((state) => state.addArticleTag);
const removeArticleTag = useAppStore((state) => state.removeArticleTag);
```

Add local state:

```ts
const [tagInput, setTagInput] = useState('');
const [tagInputError, setTagInputError] = useState<string | null>(null);
```

Add handlers:

```ts
const submitTag = () => {
  if (!article) return;
  const name = tagInput.trim().replace(/\s+/g, ' ');
  if (!name) {
    setTagInputError('请输入标签名称');
    return;
  }
  if (article.tags?.some((tag) => tag.name.toLowerCase() === name.toLowerCase())) {
    setTagInput('');
    setTagInputError(null);
    return;
  }
  addArticleTag(article.id, name);
  setTagInput('');
  setTagInputError(null);
};
```

Add render helper before return:

```tsx
const renderTagEditor = () => {
  if (!article) return null;

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {(article.tags ?? []).map((tag) => (
          <span
            key={tag.id}
            className="inline-flex max-w-40 items-center gap-1 rounded-md border border-border/70 bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground"
          >
            <Tag className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{tag.name}</span>
            <button
              type="button"
              aria-label={`移除标签 ${tag.name}`}
              onClick={() => removeArticleTag(article.id, tag)}
              className="rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </span>
        ))}
        <div className="flex items-center gap-1">
          <input
            aria-label="添加标签"
            value={tagInput}
            onChange={(event) => {
              setTagInput(event.target.value);
              setTagInputError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submitTag();
              }
            }}
            className="h-7 w-28 rounded-md border border-border bg-background px-2 text-xs outline-none transition-colors focus:border-ring"
            placeholder="添加标签"
          />
          <button
            type="button"
            aria-label="添加标签"
            onClick={submitTag}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
      {tagInputError ? <p className="text-xs text-destructive">{tagInputError}</p> : null}
    </div>
  );
};
```

Render `{renderTagEditor()}` near the article title metadata block, before the body content.

- [ ] **Step 4: Run ArticleView tag tests**

Run:

```bash
pnpm test -- src/test/features/articles/ArticleView.tags.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Run nearby ArticleView tests**

Run:

```bash
pnpm test -- src/test/features/articles/ArticleView.export.test.tsx src/test/features/articles/ArticleView.titleLink.test.tsx src/test/features/articles/ArticleView.tags.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/articles/components/ArticleView.tsx src/test/features/articles/ArticleView.tags.test.tsx
git commit -m "feat(tags): add article detail tag editor"
```

---

### Task 8: Final Verification

**Files:**
- No planned file edits.

- [ ] **Step 1: Run focused Phase 3 tests**

Run:

```bash
pnpm test -- src/test/server/db/migrations/articleTagsMigration.test.ts src/test/server/repositories/articleTagsRepo.test.ts src/test/app/api/tags/route.test.ts src/test/app/api/articles/routes.test.ts src/test/lib/userOperationCatalog.test.ts src/test/server/services/readerSnapshotService.test.ts src/test/lib/apiClient.test.ts src/test/store/appStore.test.ts src/test/features/feeds/FeedList.test.tsx src/test/features/articles/ArticleList.test.tsx src/test/features/articles/ArticleView.tags.test.tsx
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

If a verification command fails, make the narrowest code or test fix for the failing behavior, rerun the failing command, then rerun this task from Step 1. When every command passes, do not create an extra verification-only commit.
