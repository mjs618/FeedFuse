# FeedFuse Reading Efficiency Phase 3 Tags Design

## Context

Reading Efficiency Phase 1 added read-later, archive, smart views, article toolbar controls, and keyboard triage shortcuts. Phase 2 added current-list selection and bulk workflow actions. Phase 3 adds a basic tag system so users can manually organize articles and revisit tagged groups from the reader sidebar.

This phase intentionally keeps tag management small. It creates the first usable loop: add tags on an article, see tags in the list, navigate by tag, and remove tags from an article.

## Goals

- Add persistent article tags.
- Let users add and remove tags from article detail.
- Show article tags in the article list.
- Add a sidebar tag group with per-tag article counts.
- Support `tag:<id>` reader views that show non-archived articles for a tag.
- Keep tag operations consistent with the existing optimistic store and snapshot model.

## Non-Goals

- No bulk add or remove tag action in selection mode.
- No tag rename, delete, merge, color editor, or management screen.
- No tag hierarchy.
- No AI tag suggestions.
- No "select every article with tag" operation.
- No tag search page beyond the sidebar tag view.

## Approach

Use a database-backed tag model and extend the existing reader snapshot. Tags become first-class sidebar metadata, but article tag editing remains local to article detail. This matches the current architecture: server-side snapshot queries own the visible reader state, and `appStore` owns optimistic updates for article workflow actions.

## Database

Add migration `0030_article_tags.sql`.

Create `article_tags`:

- `id uuid primary key default gen_random_uuid()`
- `name text not null`
- `slug text not null`
- `color text null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Indexes and constraints:

- Unique lowercased `name`, so `AI` and `ai` refer to the same tag.
- Unique `slug`, for stable normalized lookup.

Create `article_taggings`:

- `article_id bigint not null references articles(id) on delete cascade`
- `tag_id uuid not null references article_tags(id) on delete cascade`
- `created_at timestamptz not null default now()`
- Primary key or unique constraint on `(article_id, tag_id)`.

Indexes:

- `(tag_id, article_id)` for tag view filtering and counts.
- `(article_id, tag_id)` for loading article tags.

Tag names are normalized by trimming whitespace, collapsing internal whitespace, and limiting length. Slugs are generated from the normalized name using a deterministic lowercased token. If a slug collision occurs for distinct names, append a short suffix.

## Server Repositories And Services

Add an `articleTagsRepo` or equivalent focused module for tag persistence:

- `listArticleTags(pool)`
- `listTagsWithVisibleArticleCounts(pool)`
- `listTagsForArticle(pool, articleId)`
- `attachArticleTag(pool, articleId, name)`
- `detachArticleTag(pool, articleId, tagId)`

`attachArticleTag` runs in one transaction:

1. Normalize and validate the name.
2. Create or reuse the tag.
3. Insert the `(article_id, tag_id)` relation with conflict ignored.
4. Return the normalized tag.

`detachArticleTag` is idempotent. Deleting a missing relation returns success.

## API

Add `GET /api/tags`.

Response:

```json
{
  "ok": true,
  "data": {
    "tags": [
      {
        "id": "uuid",
        "name": "AI",
        "slug": "ai",
        "color": null,
        "articleCount": 12
      }
    ]
  }
}
```

Add `POST /api/articles/[id]/tags`.

Request:

```json
{ "name": "AI" }
```

Response:

```json
{
  "ok": true,
  "data": {
    "tag": {
      "id": "uuid",
      "name": "AI",
      "slug": "ai",
      "color": null
    }
  }
}
```

Add `DELETE /api/articles/[id]/tags/[tagId]`.

Response:

```json
{
  "ok": true,
  "data": {
    "removed": true
  }
}
```

Validation:

- Article ids use the existing numeric id schema.
- Tag ids use UUID validation.
- Tag names must be non-empty after trim and within the configured maximum length.
- Invalid input uses existing API validation response shape.

Operation logging:

- Add catalog entries for `articleTag.add` and `articleTag.remove`.
- Tag failures use operation-level notifications plus inline input feedback where useful.

## Reader Snapshot

Extend `readerSnapshotService` to include:

- `tags`: sidebar metadata with id, name, color, and visible non-archived article count.
- Per-article `tags` on list items.

Add reader view support for `tag:<tagId>`:

- Returns articles joined through `article_taggings`.
- Excludes archived articles.
- Preserves current sort behavior by `published_at desc, id desc`.
- Supports pagination the same way feed and smart views do.

Tag counts count non-archived articles. This keeps sidebar counts aligned with tag views.

## Client Types And API Client

Add shared DTO and client helpers:

- `ArticleTagDto`
- `ReaderTagDto`
- `getTags(options?)`
- `addArticleTag(articleId, name, options?)`
- `removeArticleTag(articleId, tagId, options?)`

Extend article DTOs and mapped `Article` objects with:

```ts
tags?: Array<{
  id: string;
  name: string;
  slug: string;
  color?: string | null;
}>;
```

Extend snapshot DTO with a `tags` array for sidebar data.

## Store

Add to `appStore`:

- `tags`
- `addArticleTag(articleId, name)`
- `removeArticleTag(articleId, tagId)`

On add success:

- Update the selected article detail cache.
- Update the visible article list item if present.
- Add the tag to `tags` if it is new.
- Increment the tag count only if the article did not already have that tag and is not archived.

On remove success:

- Remove the tag from the selected detail cache and visible list item.
- Decrement the tag count when appropriate.
- If the current view is `tag:<tagId>`, remove the article from the visible list. If the removed article was selected, move selection to the next visible article or clear it.

On failure:

- Keep or restore the previous local state.
- Show one failure notification.
- Refresh the current snapshot silently if rollback cannot be applied safely.

The snapshot remains the final source of truth after refreshes and view changes.

## UI

### Sidebar

Add a "Tags" group below existing smart views. Each tag row shows:

- Tag name.
- Non-archived article count.

If there are no tags, hide the group. Tag rows navigate to `tag:<id>`.

### Article List

Display up to two tag badges on each article card or list row. If an article has more than two tags, show a compact `+N` badge. Tags are display-only in the list.

For `tag:<id>` views:

- The middle column title is the tag name.
- Empty state says there are no visible articles for this tag.

### Article Detail

Add a compact tag editor near article metadata:

- Existing tags render as badges with remove buttons.
- Add field accepts a tag name.
- Pressing Enter or clicking add attaches the tag.
- Empty input is disabled.
- Duplicate add does not duplicate the UI.
- Inline error appears near the input for validation failures.

The editor should keep the article reading surface quiet. It should not become a large management panel.

## Error Handling

- Empty or whitespace-only tag names are blocked client-side and validated server-side.
- Overlong names return validation errors and show inline feedback.
- Add failures leave the input value intact.
- Remove failures leave the badge visible and show one failure notification.
- Missing remove relations are treated as success.
- Network or server errors do not produce multiple toasts for the same action.

## Testing Strategy

Database:

- Migration creates `article_tags` and `article_taggings`.
- Unique constraints prevent duplicate names and taggings.
- Cascades remove taggings when articles or tags are deleted.

Repositories and services:

- Create tag.
- Reuse existing tag by normalized name.
- Attach duplicate tag idempotently.
- Detach tag idempotently.
- Count only non-archived tagged articles.

API:

- `GET /api/tags` returns counts.
- `POST /api/articles/[id]/tags` creates and reuses tags.
- Duplicate add returns the existing tag without duplicate relation.
- Invalid name and invalid ids return validation failures.
- `DELETE /api/articles/[id]/tags/[tagId]` removes or succeeds idempotently.

Snapshot:

- Snapshot includes sidebar tags.
- Snapshot article items include tags.
- `tag:<id>` returns only matching non-archived articles.
- Pagination works in tag views.

Store:

- Add tag updates detail cache, visible article, and sidebar count.
- Remove tag updates detail cache, visible article, and sidebar count.
- Removing the current tag in a tag view removes the article and advances selection.
- Failures restore or refresh state and emit one failure notification.

UI:

- Sidebar tag rows navigate to tag views.
- Article list renders tag badges.
- Article detail adds and removes tags.
- Inline validation appears for invalid tag names.
- Empty tag view renders a focused empty state.

## Delivery Plan

Implement in slices:

1. Migration and repository tests.
2. Tag API routes and user operation catalog entries.
3. Snapshot tags and `tag:<id>` view support.
4. API client and store tag actions.
5. Sidebar tag group and tag view title.
6. Article list tag badges.
7. Article detail tag editor.
8. Focused tests, type-check, lint, and build.

Each slice should keep tests close to the behavior it introduces and preserve existing reader workflows.
