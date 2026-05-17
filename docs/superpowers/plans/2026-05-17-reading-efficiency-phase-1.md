# Reading Efficiency Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add read-later, archive, and keyboard triage basics so FeedFuse users can process articles faster without changing the existing three-pane reader model.

**Architecture:** Phase 1 adds two article workflow states to the database, exposes them through the existing article patch and reader snapshot paths, and wires optimistic frontend actions into the current Zustand store and notification system. It also adds sidebar smart views, article toolbar controls, an undoable archive toast, and fixed reader-level shortcuts.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Zustand, PostgreSQL migrations, Vitest, Testing Library, Radix Toast, lucide-react.

---

## Scope

This plan implements only Phase 1 from `docs/superpowers/specs/2026-05-17-reading-efficiency-design.md`:

- Read Later smart state and view.
- Archive smart state and view.
- Single-article patch support for read-later and archive.
- Default archived filtering in normal reader views.
- Detail toolbar buttons for read later and archive.
- Undo action for archive.
- Fixed keyboard shortcuts for current article triage and navigation.
- Shortcut help dialog.

It does not implement bulk selection or tags. Those require separate plans after this phase is complete.

## File Map

- Create `src/server/infra/db/migrations/0029_article_read_later_archive.sql`: database fields and indexes.
- Create `src/test/server/db/migrations/articleReadLaterArchiveMigration.test.ts`: migration contract test.
- Modify `src/server/domains/articles/repositories/articlesRepo.ts`: row mapping, setters for read-later/archive, search archived flag.
- Modify `src/app/api/articles/[id]/route.ts`: patch schema, GET response, operation logging for new states.
- Modify `src/lib/api/apiClient.ts`: DTO fields, patch client input, mapping into `Article`.
- Modify `src/types/index.ts`: article fields.
- Modify `src/lib/reader/view.ts`: `read-later` and `archived` constants plus aggregate helpers.
- Modify `src/server/domains/reader/services/readerSnapshotService.ts`: filter rules and snapshot fields.
- Modify `src/store/appStore.ts`: optimistic read-later/archive actions, next-article selection, URL/view handling.
- Modify `src/lib/userOperationCatalog.ts`: operation messages for read-later/archive.
- Modify `src/features/toast/toastStore.ts`, `src/features/toast/toast.ts`, `src/features/toast/components/ToastHost.tsx`: optional toast action support for undo.
- Modify `src/features/feeds/components/FeedList.tsx`: sidebar smart views.
- Modify `src/features/articles/components/ArticleView.tsx`: toolbar actions.
- Modify `src/features/reader/components/ReaderLayout.tsx`: keyboard shortcuts and shortcut help.
- Add or modify tests under `src/test/server/repositories`, `src/test/server/services`, `src/test/app/api`, `src/test/lib`, `src/test/store`, `src/test/features/feeds`, `src/test/features/articles`, and `src/test/features/reader`.

---

### Task 1: Add Read-Later and Archive Columns

**Files:**
- Create: `src/server/infra/db/migrations/0029_article_read_later_archive.sql`
- Create: `src/test/server/db/migrations/articleReadLaterArchiveMigration.test.ts`

- [ ] **Step 1: Write the migration contract test**

Create `src/test/server/db/migrations/articleReadLaterArchiveMigration.test.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('db migrations', () => {
  it('adds read-later and archive workflow fields to articles', () => {
    const migrationPath = 'src/server/infra/db/migrations/0029_article_read_later_archive.sql';
    expect(existsSync(migrationPath)).toBe(true);

    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toContain('add column if not exists is_read_later boolean not null default false');
    expect(sql).toContain('add column if not exists read_later_at timestamptz null');
    expect(sql).toContain('add column if not exists is_archived boolean not null default false');
    expect(sql).toContain('add column if not exists archived_at timestamptz null');
    expect(sql).toContain('articles_read_later_published_idx');
    expect(sql).toContain('articles_archived_published_idx');
  });
});
```

- [ ] **Step 2: Run the migration test and verify it fails**

Run:

```bash
pnpm test -- src/test/server/db/migrations/articleReadLaterArchiveMigration.test.ts
```

Expected: FAIL because `0029_article_read_later_archive.sql` does not exist.

- [ ] **Step 3: Add the migration**

Create `src/server/infra/db/migrations/0029_article_read_later_archive.sql`:

```sql
alter table articles
  add column if not exists is_read_later boolean not null default false,
  add column if not exists read_later_at timestamptz null,
  add column if not exists is_archived boolean not null default false,
  add column if not exists archived_at timestamptz null;

create index if not exists articles_read_later_published_idx
  on articles (is_read_later, published_at desc, id desc);

create index if not exists articles_archived_published_idx
  on articles (is_archived, published_at desc, id desc);
```

- [ ] **Step 4: Run the migration test and verify it passes**

Run:

```bash
pnpm test -- src/test/server/db/migrations/articleReadLaterArchiveMigration.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/infra/db/migrations/0029_article_read_later_archive.sql src/test/server/db/migrations/articleReadLaterArchiveMigration.test.ts
git commit -m "feat(db): add article read later and archive fields"
```

---

### Task 2: Add Backend Article State Setters

**Files:**
- Modify: `src/server/domains/articles/repositories/articlesRepo.ts`
- Create: `src/test/server/repositories/articlesRepo.readLaterArchive.test.ts`

- [ ] **Step 1: Write repository tests**

Create `src/test/server/repositories/articlesRepo.readLaterArchive.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

describe('articlesRepo read-later and archive setters', () => {
  it('sets read later and preserves existing timestamp when enabling', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1 });
    const pool = { query } as unknown as Pool;
    const mod = await import('@/server/domains/articles/repositories/articlesRepo');

    await mod.setArticleReadLater(pool, '3001', true);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('is_read_later = $2'),
      ['3001', true],
    );
    expect(String(query.mock.calls[0][0])).toContain('read_later_at = case when $2 then coalesce(read_later_at, now()) else null end');
  });

  it('sets archive without changing read state', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1 });
    const pool = { query } as unknown as Pool;
    const mod = await import('@/server/domains/articles/repositories/articlesRepo');

    await mod.setArticleArchived(pool, '3001', true);

    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain('is_archived = $2');
    expect(sql).toContain('archived_at = case when $2 then coalesce(archived_at, now()) else null end');
    expect(sql).not.toContain('is_read = true');
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run:

```bash
pnpm test -- src/test/server/repositories/articlesRepo.readLaterArchive.test.ts
```

Expected: FAIL because `setArticleReadLater` and `setArticleArchived` are not exported.

- [ ] **Step 3: Extend article rows and setters**

In `src/server/domains/articles/repositories/articlesRepo.ts`, add these columns to `articleRowColumnsSql` after `starred_at`:

```ts
  is_read_later as "isReadLater",
  read_later_at as "readLaterAt",
  is_archived as "isArchived",
  archived_at as "archivedAt"
```

Add fields to `ArticleRow` after `starredAt`:

```ts
  isReadLater: boolean;
  readLaterAt: string | null;
  isArchived: boolean;
  archivedAt: string | null;
```

Add setters after `setArticleStarred`:

```ts
export async function setArticleReadLater(
  pool: DbClient,
  id: string,
  isReadLater: boolean,
): Promise<void> {
  await pool.query(
    `
      update articles
      set
        is_read_later = $2,
        read_later_at = case when $2 then coalesce(read_later_at, now()) else null end
      where id = $1
    `,
    [id, isReadLater],
  );
}

export async function setArticleArchived(
  pool: DbClient,
  id: string,
  isArchived: boolean,
): Promise<void> {
  await pool.query(
    `
      update articles
      set
        is_archived = $2,
        archived_at = case when $2 then coalesce(archived_at, now()) else null end
      where id = $1
    `,
    [id, isArchived],
  );
}
```

- [ ] **Step 4: Run the repository tests**

Run:

```bash
pnpm test -- src/test/server/repositories/articlesRepo.readLaterArchive.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/domains/articles/repositories/articlesRepo.ts src/test/server/repositories/articlesRepo.readLaterArchive.test.ts
git commit -m "feat(article): add read later and archive repository setters"
```

---

### Task 3: Extend Article API and Client Mapping

**Files:**
- Modify: `src/app/api/articles/[id]/route.ts`
- Modify: `src/lib/api/apiClient.ts`
- Modify: `src/types/index.ts`
- Modify: `src/test/app/api/articles/routes.test.ts`
- Modify: `src/test/lib/apiClient.test.ts`

- [ ] **Step 1: Add API route tests**

In `src/test/app/api/articles/routes.test.ts`, update the articles repo mock to expose the new setters:

```ts
const setArticleReadLaterMock = vi.fn();
const setArticleArchivedMock = vi.fn();

vi.mock('@/server/domains/articles/repositories/articlesRepo', () => ({
  getArticleById: (...args: unknown[]) => getArticleByIdMock(...args),
  setArticleRead: (...args: unknown[]) => setArticleReadMock(...args),
  setArticleStarred: (...args: unknown[]) => setArticleStarredMock(...args),
  setArticleReadLater: (...args: unknown[]) => setArticleReadLaterMock(...args),
  setArticleArchived: (...args: unknown[]) => setArticleArchivedMock(...args),
  markAllRead: (...args: unknown[]) => markAllReadMock(...args),
}));
```

Add reset calls in `beforeEach`:

```ts
setArticleReadLaterMock.mockReset();
setArticleArchivedMock.mockReset();
```

Add tests near the existing article `PATCH` tests:

```ts
it('PATCH updates read-later state', async () => {
  const mod = await import('../../../../app/api/articles/[id]/route');
  const res = await mod.PATCH(
    new Request(`http://localhost/api/articles/${articleId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ isReadLater: true }),
    }),
    { params: Promise.resolve({ id: articleId }) },
  );
  const json = await res.json();

  expect(json.ok).toBe(true);
  expect(setArticleReadLaterMock).toHaveBeenCalledWith(pool, articleId, true);
});

it('PATCH updates archive state without marking read', async () => {
  const mod = await import('../../../../app/api/articles/[id]/route');
  const res = await mod.PATCH(
    new Request(`http://localhost/api/articles/${articleId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ isArchived: true }),
    }),
    { params: Promise.resolve({ id: articleId }) },
  );
  const json = await res.json();

  expect(json.ok).toBe(true);
  expect(setArticleArchivedMock).toHaveBeenCalledWith(pool, articleId, true);
  expect(setArticleReadMock).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Add client mapping tests**

In `src/test/lib/apiClient.test.ts`, add or extend tests so `mapSnapshotArticleItem` and `mapArticleDto` preserve workflow fields:

```ts
it('maps article workflow state from snapshot items', async () => {
  const { mapSnapshotArticleItem } = await import('@/lib/api/apiClient');

  const article = mapSnapshotArticleItem({
    id: '3001',
    feedId: '2001',
    title: 'Title',
    titleOriginal: null,
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
    isStarred: false,
    isReadLater: true,
    readLaterAt: '2026-05-17T01:00:00.000Z',
    isArchived: true,
    archivedAt: '2026-05-17T02:00:00.000Z',
    bodyTranslationEligible: true,
    bodyTranslationBlockedReason: null,
    aiSummarySession: null,
  });

  expect(article.isReadLater).toBe(true);
  expect(article.readLaterAt).toBe('2026-05-17T01:00:00.000Z');
  expect(article.isArchived).toBe(true);
  expect(article.archivedAt).toBe('2026-05-17T02:00:00.000Z');
});
```

- [ ] **Step 3: Run API and client tests and verify they fail**

Run:

```bash
pnpm test -- src/test/app/api/articles/routes.test.ts src/test/lib/apiClient.test.ts
```

Expected: FAIL because schema and DTO mapping do not include `isReadLater` and `isArchived`.

- [ ] **Step 4: Implement API route support**

In `src/app/api/articles/[id]/route.ts`, import setters:

```ts
  setArticleArchived,
  setArticleReadLater,
```

Extend `patchBodySchema`:

```ts
const patchBodySchema = z
  .object({
    isRead: z.boolean().optional(),
    isStarred: z.boolean().optional(),
    isReadLater: z.boolean().optional(),
    isArchived: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field must be provided',
    path: ['body'],
  });
```

Update the local destructuring and setter calls:

```ts
const { isRead, isStarred, isReadLater, isArchived } = bodyParsed.data;

if (typeof isRead !== 'undefined') {
  await setArticleRead(pool, paramsParsed.data.id, isRead);
}
if (typeof isStarred !== 'undefined') {
  await setArticleStarred(pool, paramsParsed.data.id, isStarred);
}
if (typeof isReadLater !== 'undefined') {
  await setArticleReadLater(pool, paramsParsed.data.id, isReadLater);
}
if (typeof isArchived !== 'undefined') {
  await setArticleArchived(pool, paramsParsed.data.id, isArchived);
}
```

Do not make `isArchived` imply `isRead`.

- [ ] **Step 5: Implement client DTO and type support**

In `src/types/index.ts`, add fields to `Article`:

```ts
  isReadLater?: boolean;
  readLaterAt?: string | null;
  isArchived?: boolean;
  archivedAt?: string | null;
```

In `src/lib/api/apiClient.ts`, extend snapshot item DTO and `ArticleDto`:

```ts
      isReadLater: boolean;
      readLaterAt: string | null;
      isArchived: boolean;
      archivedAt: string | null;
```

Extend `patchArticle` input:

```ts
input: {
  isRead?: boolean;
  isStarred?: boolean;
  isReadLater?: boolean;
  isArchived?: boolean;
}
```

Add mapping in `mapSnapshotArticleItem` and `mapArticleDto`:

```ts
    isReadLater: dto.isReadLater,
    readLaterAt: dto.readLaterAt,
    isArchived: dto.isArchived,
    archivedAt: dto.archivedAt,
```

- [ ] **Step 6: Run tests**

Run:

```bash
pnpm test -- src/test/app/api/articles/routes.test.ts src/test/lib/apiClient.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/articles/[id]/route.ts src/lib/api/apiClient.ts src/types/index.ts src/test/app/api/articles/routes.test.ts src/test/lib/apiClient.test.ts
git commit -m "feat(article): expose read later and archive state"
```

---

### Task 4: Add Snapshot Views and Archived Filtering

**Files:**
- Modify: `src/lib/reader/view.ts`
- Modify: `src/server/domains/reader/services/readerSnapshotService.ts`
- Modify: `src/test/server/services/readerSnapshotService.test.ts`

- [ ] **Step 1: Write snapshot filter tests**

In `src/test/server/services/readerSnapshotService.test.ts`, add tests around `buildArticleFilter`:

```ts
it('hides archived articles from normal views', () => {
  const filter = buildArticleFilter({ view: 'all' });
  expect(filter.whereSql).toContain('is_archived = false');
});

it('builds read-later view filter', () => {
  const filter = buildArticleFilter({ view: 'read-later' });
  expect(filter.whereSql).toContain('is_read_later = true');
  expect(filter.whereSql).toContain('is_archived = false');
});

it('builds archived view filter without excluding archived articles', () => {
  const filter = buildArticleFilter({ view: 'archived' });
  expect(filter.whereSql).toContain('is_archived = true');
  expect(filter.whereSql).not.toContain('is_archived = false');
});
```

Add a row mapping test if this file already has snapshot mapping fixtures:

```ts
expect(snapshot.articles.items[0]).toMatchObject({
  isReadLater: true,
  readLaterAt: expect.any(String),
  isArchived: false,
  archivedAt: null,
});
```

- [ ] **Step 2: Run service tests and verify they fail**

Run:

```bash
pnpm test -- src/test/server/services/readerSnapshotService.test.ts
```

Expected: FAIL because the filters and returned fields are missing.

- [ ] **Step 3: Add reader view constants**

In `src/lib/reader/view.ts`, add:

```ts
export const READ_LATER_VIEW_ID = 'read-later';
export const ARCHIVED_VIEW_ID = 'archived';
```

Update `isAggregateView`:

```ts
export function isAggregateView(view: string): boolean {
  return (
    isRssSmartView(view) ||
    view === AI_DIGEST_VIEW_ID ||
    view === READ_LATER_VIEW_ID ||
    view === ARCHIVED_VIEW_ID
  );
}
```

Update `shouldUseDefaultUnreadOnly` so read-later and archived do not inherit default unread filtering:

```ts
export function shouldUseDefaultUnreadOnly(view: string): boolean {
  return view !== 'unread' && view !== 'starred' && view !== READ_LATER_VIEW_ID && view !== ARCHIVED_VIEW_ID;
}
```

- [ ] **Step 4: Update `buildArticleFilter`**

In `src/server/domains/reader/services/readerSnapshotService.ts`, import new constants:

```ts
import { AI_DIGEST_VIEW_ID, ARCHIVED_VIEW_ID, READ_LATER_VIEW_ID, isRssSmartView } from '@/lib/reader/view';
```

Add read-later and archived branches near the existing smart views:

```ts
  if (input.view === AI_DIGEST_VIEW_ID) {
    whereParts.push("feed_id in (select id from feeds where kind = 'ai_digest')");
  } else if (input.view === READ_LATER_VIEW_ID) {
    whereParts.push('is_read_later = true');
  } else if (input.view === ARCHIVED_VIEW_ID) {
    whereParts.push('is_archived = true');
  } else if (input.view === 'unread') {
    whereParts.push('is_read = false');
  } else if (input.view === 'starred') {
    whereParts.push('is_starred = true');
  } else if (input.view !== 'all') {
    whereParts.push(`feed_id = $${paramIndex++}`);
    params.push(input.view);
  }

  if (input.view !== ARCHIVED_VIEW_ID) {
    whereParts.push('is_archived = false');
  }
```

- [ ] **Step 5: Return workflow fields in snapshot rows**

In `ReaderSnapshotArticleItem`, add:

```ts
  isReadLater: boolean;
  readLaterAt: string | null;
  isArchived: boolean;
  archivedAt: string | null;
```

In `queryArticleRows`, select:

```sql
        articles.is_read_later as "isReadLater",
        articles.read_later_at as "readLaterAt",
        articles.is_archived as "isArchived",
        articles.archived_at as "archivedAt",
```

- [ ] **Step 6: Run tests**

Run:

```bash
pnpm test -- src/test/server/services/readerSnapshotService.test.ts src/test/lib/apiClient.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/reader/view.ts src/server/domains/reader/services/readerSnapshotService.ts src/test/server/services/readerSnapshotService.test.ts
git commit -m "feat(reader): add read later and archived snapshot views"
```

---

### Task 5: Add Store Actions and Operation Messages

**Files:**
- Modify: `src/store/appStore.ts`
- Modify: `src/lib/userOperationCatalog.ts`
- Modify: `src/test/store/appStore.test.ts`
- Modify: `src/test/lib/userOperationCatalog.test.ts`

- [ ] **Step 1: Write app store tests**

In `src/test/store/appStore.test.ts`, mock `patchArticle` if it is not already mocked, then add:

```ts
it('optimistically toggles read later and persists it', async () => {
  const api = await import('@/lib/api/apiClient');
  vi.mocked(api.patchArticle).mockResolvedValue({ updated: true });
  const { useAppStore } = await import('../../store/appStore');

  useAppStore.setState({
    articles: [{
      id: '3001',
      feedId: '2001',
      title: 'Title',
      content: '',
      summary: '',
      publishedAt: '2026-05-17T00:00:00.000Z',
      link: '',
      isRead: false,
      isStarred: false,
      isReadLater: false,
      isArchived: false,
    }],
    articleDetailCache: {},
  });

  useAppStore.getState().toggleReadLater('3001');

  expect(useAppStore.getState().articles[0].isReadLater).toBe(true);
  await vi.waitFor(() => {
    expect(api.patchArticle).toHaveBeenCalledWith('3001', { isReadLater: true }, { notifyOnError: false });
  });
});

it('archives current article and selects the next visible article', async () => {
  const api = await import('@/lib/api/apiClient');
  vi.mocked(api.patchArticle).mockResolvedValue({ updated: true });
  const { useAppStore } = await import('../../store/appStore');

  useAppStore.setState({
    selectedArticleId: '3001',
    articles: [
      { id: '3001', feedId: '2001', title: 'One', content: '', summary: '', publishedAt: '2026-05-17T00:00:00.000Z', link: '', isRead: false, isStarred: false, isReadLater: false, isArchived: false },
      { id: '3002', feedId: '2001', title: 'Two', content: '', summary: '', publishedAt: '2026-05-16T00:00:00.000Z', link: '', isRead: false, isStarred: false, isReadLater: false, isArchived: false },
    ],
    articleDetailCache: {},
  });

  useAppStore.getState().archiveArticle('3001');

  expect(useAppStore.getState().articles[0].isArchived).toBe(true);
  expect(useAppStore.getState().selectedArticleId).toBe('3002');
});
```

- [ ] **Step 2: Add operation catalog tests**

In `src/test/lib/userOperationCatalog.test.ts`, add:

```ts
it('defines messages for read-later and archive operations', () => {
  const { getUserOperationCatalogEntry } = require('@/lib/userOperationCatalog') as typeof import('@/lib/userOperationCatalog');
  expect(getUserOperationCatalogEntry('article.toggleReadLater').successMessage({ readLater: true })).toContain('稍后读');
  expect(getUserOperationCatalogEntry('article.archive').successMessage({ archived: true })).toContain('归档');
});
```

- [ ] **Step 3: Run tests and verify they fail**

Run:

```bash
pnpm test -- src/test/store/appStore.test.ts src/test/lib/userOperationCatalog.test.ts
```

Expected: FAIL because actions and catalog keys do not exist.

- [ ] **Step 4: Add app store types and actions**

In `src/store/appStore.ts`, import `patchArticle` is already present. Extend `AppState`:

```ts
  toggleReadLater: (articleId: string) => void;
  archiveArticle: (articleId: string) => void;
  unarchiveArticle: (articleId: string) => void;
```

Add helper near `updateCachedArticle`:

```ts
function updateArticleInVisibleCollections(
  state: Pick<AppState, 'articles' | 'articleDetailCache'>,
  articleId: string,
  updater: (article: Article) => Article,
) {
  return {
    articles: state.articles.map((item) => (item.id === articleId ? updater(item) : item)),
    articleDetailCache: updateCachedArticle(state.articleDetailCache, articleId, updater),
  };
}
```

Add helper near sorting:

```ts
function findNextVisibleArticleId(articles: Article[], archivedArticleId: string): string | null {
  const currentIndex = articles.findIndex((article) => article.id === archivedArticleId);
  if (currentIndex < 0) return null;

  const candidates = [
    ...articles.slice(currentIndex + 1),
    ...articles.slice(0, currentIndex),
  ];
  return candidates.find((article) => !article.isArchived)?.id ?? null;
}
```

Add actions inside `create<AppState>`:

```ts
  toggleReadLater: (articleId) => {
    const article = getArticleFromCollections(articleId, get().articles, get().articleDetailCache);
    if (!article) return;
    const nextValue = !Boolean(article.isReadLater);

    set((state) => updateArticleInVisibleCollections(state, articleId, (item) => ({
      ...item,
      isReadLater: nextValue,
      readLaterAt: nextValue ? (item.readLaterAt ?? new Date().toISOString()) : null,
    })));

    void patchArticle(articleId, { isReadLater: nextValue }, { notifyOnError: false })
      .then(() => runImmediateSuccess({ actionKey: 'article.toggleReadLater', context: { readLater: nextValue } }))
      .catch((err) => {
        runImmediateFailure({ actionKey: 'article.toggleReadLater', context: { readLater: nextValue }, err });
        void get().loadSnapshot({ view: get().selectedView });
      });
  },

  archiveArticle: (articleId) => {
    const article = getArticleFromCollections(articleId, get().articles, get().articleDetailCache);
    if (!article || article.isArchived) return;
    const nextSelectedArticleId =
      get().selectedArticleId === articleId ? findNextVisibleArticleId(get().articles, articleId) : get().selectedArticleId;

    set((state) => ({
      ...updateArticleInVisibleCollections(state, articleId, (item) => ({
        ...item,
        isArchived: true,
        archivedAt: item.archivedAt ?? new Date().toISOString(),
      })),
      selectedArticleId: nextSelectedArticleId,
    }));

    void patchArticle(articleId, { isArchived: true }, { notifyOnError: false })
      .then(() => runImmediateSuccess({ actionKey: 'article.archive', context: { archived: true } }))
      .catch((err) => {
        runImmediateFailure({ actionKey: 'article.archive', context: { archived: true }, err });
        void get().loadSnapshot({ view: get().selectedView });
      });
  },

  unarchiveArticle: (articleId) => {
    set((state) => updateArticleInVisibleCollections(state, articleId, (item) => ({
      ...item,
      isArchived: false,
      archivedAt: null,
    })));

    void patchArticle(articleId, { isArchived: false }, { notifyOnError: false })
      .then(() => runImmediateSuccess({ actionKey: 'article.archive', context: { archived: false } }))
      .catch((err) => {
        runImmediateFailure({ actionKey: 'article.archive', context: { archived: false }, err });
        void get().loadSnapshot({ view: get().selectedView });
      });
  },
```

- [ ] **Step 5: Add operation catalog entries**

In `src/lib/userOperationCatalog.ts`, add entries:

```ts
  'article.toggleReadLater': {
    successMessage: (context) => (context?.readLater ? '已加入稍后读' : '已移出稍后读'),
    errorPrefix: () => '更新稍后读状态失败',
    toastVisibility: { started: false },
  },
  'article.archive': {
    successMessage: (context) => (context?.archived === false ? '已恢复文章' : '已归档文章'),
    errorPrefix: () => '更新归档状态失败',
    toastVisibility: { started: false },
  },
```

Match the local catalog object shape exactly. If existing entries use functions for `startMessage`, `successMessage`, or `errorPrefix`, follow that style.

- [ ] **Step 6: Run tests**

Run:

```bash
pnpm test -- src/test/store/appStore.test.ts src/test/lib/userOperationCatalog.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/store/appStore.ts src/lib/userOperationCatalog.ts src/test/store/appStore.test.ts src/test/lib/userOperationCatalog.test.ts
git commit -m "feat(reader): add read later and archive store actions"
```

---

### Task 6: Add Undoable Toast Action Support

**Files:**
- Modify: `src/features/toast/toastStore.ts`
- Modify: `src/features/toast/toast.ts`
- Modify: `src/features/toast/components/ToastHost.tsx`
- Modify: `src/store/appStore.ts`
- Modify: `src/test/features/toast/ToastHost.test.tsx`
- Modify: `src/test/store/appStore.test.ts`

- [ ] **Step 1: Write toast action test**

In `src/test/features/toast/ToastHost.test.tsx`, add:

```tsx
it('renders and invokes a toast action', async () => {
  const action = vi.fn();
  const { toast } = await import('../../../features/toast/toast');
  const { ToastHost } = await import('../../../features/toast/components/ToastHost');

  render(<ToastHost />);
  toast.success('已归档文章', {
    action: {
      label: '撤销',
      onClick: action,
    },
  });

  fireEvent.click(await screen.findByRole('button', { name: '撤销' }));
  expect(action).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Write archive undo store test**

In `src/test/store/appStore.test.ts`, add:

```ts
it('archive success toast exposes undo action', async () => {
  const api = await import('@/lib/api/apiClient');
  const toastModule = await import('../../features/toast/toast');
  const toastSpy = vi.spyOn(toastModule.toast, 'success');
  vi.mocked(api.patchArticle).mockResolvedValue({ updated: true });
  const { useAppStore } = await import('../../store/appStore');

  useAppStore.setState({
    selectedArticleId: '3001',
    articles: [
      { id: '3001', feedId: '2001', title: 'One', content: '', summary: '', publishedAt: '2026-05-17T00:00:00.000Z', link: '', isRead: false, isStarred: false, isReadLater: false, isArchived: false },
    ],
    articleDetailCache: {},
  });

  useAppStore.getState().archiveArticle('3001');

  await vi.waitFor(() => {
    expect(toastSpy).toHaveBeenCalledWith(
      expect.stringContaining('归档'),
      expect.objectContaining({
        action: expect.objectContaining({ label: '撤销' }),
      }),
    );
  });
});
```

- [ ] **Step 3: Run tests and verify they fail**

Run:

```bash
pnpm test -- src/test/features/toast/ToastHost.test.tsx src/test/store/appStore.test.ts
```

Expected: FAIL because toast options do not support actions.

- [ ] **Step 4: Extend toast types and host**

In `src/features/toast/toastStore.ts`, add:

```ts
export interface ToastAction {
  label: string;
  onClick: () => void;
}
```

Add `action?: ToastAction` to `ToastItem` and `PushInput`. Set it in `nextItem`:

```ts
action: input.action,
```

In `src/features/toast/toast.ts`, extend `ToastOptions`:

```ts
import type { ToastAction, ToastTone } from './toastStore';

export type ToastOptions = {
  id?: string;
  dedupeKey?: string;
  durationMs?: number;
  action?: ToastAction;
};
```

Pass `action: options?.action` in `toastStore.getState().push`.

In `ToastHost.tsx`, render the action before close:

```tsx
{item.action ? (
  <button
    type="button"
    className="shrink-0 rounded-lg border border-current/20 px-2 py-1 text-xs font-semibold text-current/85 transition-colors hover:bg-foreground/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20"
    onClick={() => {
      item.action?.onClick();
      dismiss(item.id);
    }}
  >
    {item.action.label}
  </button>
) : null}
```

- [ ] **Step 5: Use toast action for archive undo**

In `src/store/appStore.ts`, import:

```ts
import { toast } from '../features/toast/toast';
```

After successful archive patch in `archiveArticle`, replace or supplement the generic success with an undoable toast:

```ts
toast.success('已归档文章', {
  action: {
    label: '撤销',
    onClick: () => {
      get().unarchiveArticle(articleId);
    },
  },
});
```

Keep `writeUserOperation` logging through the API route. In the `archiveArticle` success path, do not call `runImmediateSuccess`; call only the `toast.success` snippet above so users see exactly one undoable success toast. Keep `runImmediateSuccess` in `unarchiveArticle` and `toggleReadLater`.

- [ ] **Step 6: Run tests**

Run:

```bash
pnpm test -- src/test/features/toast/ToastHost.test.tsx src/test/store/appStore.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/toast/toastStore.ts src/features/toast/toast.ts src/features/toast/components/ToastHost.tsx src/store/appStore.ts src/test/features/toast/ToastHost.test.tsx src/test/store/appStore.test.ts
git commit -m "feat(toast): support undoable archive actions"
```

---

### Task 7: Add Sidebar Smart Views and Detail Toolbar Buttons

**Files:**
- Modify: `src/features/feeds/components/FeedList.tsx`
- Modify: `src/features/articles/components/ArticleView.tsx`
- Modify: `src/test/features/feeds/FeedList.test.tsx`
- Modify: `src/test/features/articles/ArticleView.export.test.tsx`

- [ ] **Step 1: Write sidebar tests**

In `src/test/features/feeds/FeedList.test.tsx`, add:

```tsx
it('shows read later and archived smart views', () => {
  useAppStore.setState({
    articles: [
      { id: 'a1', feedId: 'feed-1', title: 'Later', content: '', summary: '', publishedAt: '2026-05-17T00:00:00.000Z', link: '', isRead: false, isStarred: false, isReadLater: true, isArchived: false },
      { id: 'a2', feedId: 'feed-1', title: 'Archived', content: '', summary: '', publishedAt: '2026-05-16T00:00:00.000Z', link: '', isRead: true, isStarred: false, isReadLater: false, isArchived: true },
    ],
  });

  render(<FeedList />);

  expect(screen.getByRole('button', { name: /稍后读/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /归档/ })).toBeInTheDocument();
});
```

Add this test inside the existing `describe('FeedList manage')` block in `src/test/features/feeds/FeedList.test.tsx`. That block already resets `useAppStore` in `beforeEach`, so the test only needs the `useAppStore.setState` override shown above.

- [ ] **Step 2: Write article toolbar tests**

In `src/test/features/articles/ArticleView.export.test.tsx`, add:

```tsx
it('shows read-later and archive actions in the desktop toolbar', async () => {
  render(<ArticleView />);

  expect(await screen.findByRole('button', { name: '稍后读' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '归档文章' })).toBeInTheDocument();
});

it('archives the selected article from the toolbar', async () => {
  const archiveArticle = vi.fn();
  useAppStore.setState({ archiveArticle });

  render(<ArticleView />);

  fireEvent.click(await screen.findByRole('button', { name: '归档文章' }));
  expect(archiveArticle).toHaveBeenCalledWith('article-1');
});
```

- [ ] **Step 3: Run tests and verify they fail**

Run:

```bash
pnpm test -- src/test/features/feeds/FeedList.test.tsx src/test/features/articles/ArticleView.export.test.tsx
```

Expected: FAIL because views and buttons are missing.

- [ ] **Step 4: Add smart views**

In `src/features/feeds/components/FeedList.tsx`, import constants and icons:

```ts
import { Archive, Clock3 } from 'lucide-react';
import { ARCHIVED_VIEW_ID, READ_LATER_VIEW_ID } from '@/lib/reader/view';
```

Compute counts:

```ts
const readLaterCount = useMemo(
  () => articles.filter((article) => article.isReadLater && !article.isArchived).length,
  [articles],
);
const archivedCount = useMemo(
  () => articles.filter((article) => article.isArchived).length,
  [articles],
);
```

Add smart views:

```ts
{ id: READ_LATER_VIEW_ID, name: '稍后读', Icon: Clock3, unreadCount: readLaterCount },
{ id: ARCHIVED_VIEW_ID, name: '归档', Icon: Archive, unreadCount: archivedCount },
```

If `FeedList` currently only subscribes to `feeds`, also subscribe to `articles`:

```ts
const articles = useAppStore((state) => state.articles);
```

- [ ] **Step 5: Add toolbar buttons**

In `src/features/articles/components/ArticleView.tsx`, import icons:

```ts
import { Archive, Clock3 } from 'lucide-react';
```

Subscribe to store actions:

```ts
const toggleReadLater = useAppStore((state) => state.toggleReadLater);
const archiveArticle = useAppStore((state) => state.archiveArticle);
```

In `renderDesktopToolbar`, add buttons near star/export:

```tsx
<ReaderToolbarIconButton
  icon={Clock3}
  label={article?.isReadLater ? '移出稍后读' : '稍后读'}
  pressed={Boolean(article?.isReadLater)}
  onClick={() => {
    if (article?.id) toggleReadLater(article.id);
  }}
/>
<ReaderToolbarIconButton
  icon={Archive}
  label="归档文章"
  onClick={() => {
    if (article?.id) archiveArticle(article.id);
  }}
/>
```

In the non-desktop button group, add compact buttons using the same handlers and labels.

- [ ] **Step 6: Run tests**

Run:

```bash
pnpm test -- src/test/features/feeds/FeedList.test.tsx src/test/features/articles/ArticleView.export.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/feeds/components/FeedList.tsx src/features/articles/components/ArticleView.tsx src/test/features/feeds/FeedList.test.tsx src/test/features/articles/ArticleView.export.test.tsx
git commit -m "feat(reader): add read later and archive controls"
```

---

### Task 8: Add Keyboard Shortcuts and Help Dialog

**Files:**
- Modify: `src/features/reader/components/ReaderLayout.tsx`
- Create: `src/features/reader/components/ShortcutHelpDialog.tsx`
- Modify: `src/test/features/reader/ReaderLayout.test.tsx`

- [ ] **Step 1: Write keyboard shortcut tests**

In `src/test/features/reader/ReaderLayout.test.tsx`, add:

```tsx
it('uses J and K to move selection through visible articles', async () => {
  resetSettingsStore();
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
  useAppStore.setState({
    articles: [
      { id: 'article-1', feedId: 'feed-1', title: 'One', content: '', summary: '', publishedAt: '2026-05-17T00:00:00.000Z', link: '', isRead: false, isStarred: false, isReadLater: false, isArchived: false },
      { id: 'article-2', feedId: 'feed-1', title: 'Two', content: '', summary: '', publishedAt: '2026-05-16T00:00:00.000Z', link: '', isRead: false, isStarred: false, isReadLater: false, isArchived: false },
    ],
    selectedArticleId: 'article-1',
  });

  await renderWithNotificationsSettled();
  fireEvent.keyDown(window, { key: 'j' });

  expect(useAppStore.getState().selectedArticleId).toBe('article-2');

  fireEvent.keyDown(window, { key: 'k' });
  expect(useAppStore.getState().selectedArticleId).toBe('article-1');
});

it('uses S L E and M for article triage shortcuts', async () => {
  resetSettingsStore();
  const toggleStar = vi.fn();
  const toggleReadLater = vi.fn();
  const archiveArticle = vi.fn();
  const markAsRead = vi.fn();
  useAppStore.setState({
    selectedArticleId: 'article-1',
    articles: [{ id: 'article-1', feedId: 'feed-1', title: 'One', content: '', summary: '', publishedAt: '2026-05-17T00:00:00.000Z', link: '', isRead: false, isStarred: false, isReadLater: false, isArchived: false }],
    toggleStar,
    toggleReadLater,
    archiveArticle,
    markAsRead,
  });

  await renderWithNotificationsSettled();
  fireEvent.keyDown(window, { key: 's' });
  fireEvent.keyDown(window, { key: 'l' });
  fireEvent.keyDown(window, { key: 'e' });
  fireEvent.keyDown(window, { key: 'm' });

  expect(toggleStar).toHaveBeenCalledWith('article-1');
  expect(toggleReadLater).toHaveBeenCalledWith('article-1');
  expect(archiveArticle).toHaveBeenCalledWith('article-1');
  expect(markAsRead).toHaveBeenCalledWith('article-1');
});

it('opens shortcut help with question mark and suppresses shortcuts in inputs', async () => {
  resetSettingsStore();
  await renderWithNotificationsSettled();

  fireEvent.keyDown(window, { key: '?' });
  expect(screen.getByRole('dialog', { name: '快捷键' })).toBeInTheDocument();

  fireEvent.click(screen.getByLabelText('关闭快捷键'));
  const input = document.createElement('input');
  document.body.appendChild(input);
  input.focus();

  try {
    fireEvent.keyDown(input, { key: '?' });
    expect(screen.queryByRole('dialog', { name: '快捷键' })).not.toBeInTheDocument();
  } finally {
    input.remove();
  }
});
```

- [ ] **Step 2: Run reader tests and verify they fail**

Run:

```bash
pnpm test -- src/test/features/reader/ReaderLayout.test.tsx
```

Expected: FAIL because shortcuts and help dialog do not exist.

- [ ] **Step 3: Create shortcut help dialog**

Create `src/features/reader/components/ShortcutHelpDialog.tsx`:

```tsx
'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const shortcuts = [
  ['J / K', '下一篇 / 上一篇'],
  ['S', '收藏'],
  ['L', '稍后读'],
  ['E', '归档'],
  ['M', '标记已读 / 未读'],
  ['Ctrl / Cmd + F', '全局搜索'],
  ['Esc', '返回或关闭当前操作'],
];

export default function ShortcutHelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel="关闭快捷键" className="max-w-md">
        <DialogHeader>
          <DialogTitle>快捷键</DialogTitle>
        </DialogHeader>
        <dl className="space-y-2">
          {shortcuts.map(([key, label]) => (
            <div key={key} className="flex items-center justify-between gap-4 text-sm">
              <dt className="rounded-md border border-border/70 bg-muted px-2 py-1 font-mono text-xs">
                {key}
              </dt>
              <dd className="text-muted-foreground">{label}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Add shortcut handling to `ReaderLayout`**

In `src/features/reader/components/ReaderLayout.tsx`, dynamically or statically import the dialog:

```ts
const ShortcutHelpDialog = dynamic(() => import('./ShortcutHelpDialog'), {
  ssr: false,
  loading: () => null,
});
```

Add state:

```ts
const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
```

Add store actions:

```ts
const articles = useAppStore((state) => state.articles);
const toggleStar = useAppStore((state) => state.toggleStar);
const toggleReadLater = useAppStore((state) => state.toggleReadLater);
const archiveArticle = useAppStore((state) => state.archiveArticle);
const markAsRead = useAppStore((state) => state.markAsRead);
```

Inside the existing `handleGlobalShortcuts`, after the search shortcut guard, add:

```ts
const selectedIndex = articles.findIndex((article) => article.id === selectedArticleId);
const selectByOffset = (offset: number) => {
  if (articles.length === 0) return;
  const baseIndex = selectedIndex >= 0 ? selectedIndex : 0;
  const nextIndex = Math.min(articles.length - 1, Math.max(0, baseIndex + offset));
  const nextArticle = articles[nextIndex];
  if (nextArticle) setSelectedArticle(nextArticle.id);
};

const key = event.key.toLowerCase();
if (event.key === '?') {
  event.preventDefault();
  setShortcutHelpOpen(true);
  return;
}
if (!selectedArticleId && key !== 'j' && key !== 'k') return;
if (key === 'j') {
  event.preventDefault();
  selectByOffset(1);
  return;
}
if (key === 'k') {
  event.preventDefault();
  selectByOffset(-1);
  return;
}
if (key === 's' && selectedArticleId) {
  event.preventDefault();
  toggleStar(selectedArticleId);
  return;
}
if (key === 'l' && selectedArticleId) {
  event.preventDefault();
  toggleReadLater(selectedArticleId);
  return;
}
if (key === 'e' && selectedArticleId) {
  event.preventDefault();
  archiveArticle(selectedArticleId);
  return;
}
if (key === 'm' && selectedArticleId) {
  event.preventDefault();
  markAsRead(selectedArticleId);
}
```

Keep the existing editable-target guard before these shortcuts.

Render the dialog near `GlobalSearchDialog`:

```tsx
{shortcutHelpOpen && (
  <ShortcutHelpDialog open={shortcutHelpOpen} onOpenChange={setShortcutHelpOpen} />
)}
```

- [ ] **Step 5: Run reader tests**

Run:

```bash
pnpm test -- src/test/features/reader/ReaderLayout.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/reader/components/ReaderLayout.tsx src/features/reader/components/ShortcutHelpDialog.tsx src/test/features/reader/ReaderLayout.test.tsx
git commit -m "feat(reader): add keyboard triage shortcuts"
```

---

### Task 9: Final Verification

**Files:**
- No planned file edits.

- [ ] **Step 1: Run focused test suite**

Run:

```bash
pnpm test -- src/test/server/db/migrations/articleReadLaterArchiveMigration.test.ts src/test/server/repositories/articlesRepo.readLaterArchive.test.ts src/test/server/services/readerSnapshotService.test.ts src/test/app/api/articles/routes.test.ts src/test/lib/apiClient.test.ts src/test/lib/userOperationCatalog.test.ts src/test/store/appStore.test.ts src/test/features/toast/ToastHost.test.tsx src/test/features/feeds/FeedList.test.tsx src/test/features/articles/ArticleView.export.test.tsx src/test/features/reader/ReaderLayout.test.tsx
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

- [ ] **Step 4: Run build**

Run:

```bash
pnpm build
```

Expected: PASS.

- [ ] **Step 5: Handle verification failures**

If a command fails, return to the task that introduced the failing behavior, add or adjust the narrowest failing test there, implement the fix, rerun that task's tests, and amend that task's commit before repeating Task 9. If every command passes, make no extra commit.
