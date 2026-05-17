# FeedFuse Reading Efficiency Design

## Context

FeedFuse already provides the core reading workspace: RSS subscriptions, categories, article list and detail panes, full-text fetching, AI summaries, translation, AI digest feeds, global search, operation notifications, and responsive layouts.

The next product priority is heavy-reader efficiency. The goal is to let users process many articles quickly with fewer mouse interactions, clearer reading queues, and lightweight organization primitives.

Comparable products point to the same direction:

- Readwise Reader emphasizes keyboard-driven reading, saving, tagging, highlighting, and annotation workflows.
- Inoreader emphasizes bulk actions, tags, read-later lists, rules, filters, and custom views.
- Feedly uses boards, notes, highlights, mute filters, and AI feeds to help readers separate scanning from deeper follow-up.

This design focuses on FeedFuse's first efficiency layer, not a full knowledge-management or automation system.

## Goals

- Make fast triage possible from the keyboard.
- Add recoverable article workflow states: read later and archived.
- Allow batch processing of visible articles.
- Add basic article tags for manual organization and tag-based views.
- Keep the existing three-pane reader model intact.
- Reuse the current notification, snapshot, and article patch patterns where possible.

## Non-Goals

- No automatic rules engine in this iteration.
- No AI tag suggestions.
- No highlight, annotation, or note-taking library.
- No cross-database "select every matching article" bulk action.
- No tag hierarchy, merge, or rename management screen.
- No custom keyboard shortcut editor.

## User Experience

### Keyboard Flow

Reader-level shortcuts are fixed for the first version:

- `J`: select next article.
- `K`: select previous article.
- `Enter`: open the selected article when focus is in the list.
- `Esc`: return from article to list on mobile, close selection mode, or clear transient UI.
- `S`: toggle starred.
- `L`: toggle read-later.
- `E`: archive current article.
- `M`: toggle read/unread.
- `X`: toggle selection for the current article.
- `Shift+X`: enter or exit selection mode.
- `?`: open keyboard shortcut help.
- Existing `Ctrl+F` / `Cmd+F` global search remains unchanged.

Shortcuts only fire in the reader shell. They must not fire while focus is inside inputs, textareas, selects, contenteditable regions, dialogs, popovers, or menus.

### Article List

The article list keeps its current card and compact list modes. A new selection-mode button appears in the article list toolbar.

In selection mode:

- The header becomes a bulk action toolbar.
- It shows selected count, "select current page", mark read/unread, star/unstar, read later, archive, and cancel.
- Article rows show checkboxes.
- Clicking a row toggles selection instead of opening the article.
- `Enter` or double click opens the row if needed.

Bulk operations apply only to explicitly selected articles in the current loaded list. This keeps the behavior predictable and avoids hidden large-scale changes.

### Article Detail

The article toolbar adds:

- Read later.
- Archive.
- Tags.

Archive is recoverable and should not block with a confirmation for a single article. It does not change read/unread state. After archiving the current article, the reader selects the next non-archived article in the current list when available. A toast offers undo.

The article detail page also displays current tags near the article metadata. Users can add or remove tags from there.

### Sidebar Views

The left sidebar adds:

- Read Later smart view.
- Archived smart view.
- Tags group with tag counts.

Regular views hide archived articles by default. Archived articles remain reachable from the archived view and global search.

Read Later shows articles where `isReadLater` is true and `isArchived` is false.

Tag views show non-archived articles with the selected tag.

### Discoverability

Add a shortcut help dialog opened from `?` and from a small toolbar/menu entry. Empty states for Read Later, Archived, and tag views should explain the next useful action without lengthy product education.

## Data Model

### Articles

Add fields to `articles`:

- `is_read_later boolean not null default false`
- `read_later_at timestamptz null`
- `is_archived boolean not null default false`
- `archived_at timestamptz null`

These mirror the existing `is_read` and `is_starred` style and are simple to expose through snapshots and article patching.

### Tags

Add:

- `article_tags`
  - `id uuid primary key`
  - `name text not null unique`
  - `color text null`
  - `created_at timestamptz not null default now()`
  - `updated_at timestamptz not null default now()`
- `article_taggings`
  - `article_id uuid not null references articles(id) on delete cascade`
  - `tag_id uuid not null references article_tags(id) on delete cascade`
  - `created_at timestamptz not null default now()`
  - unique `(article_id, tag_id)`

Tag names are normalized by trimming whitespace. Empty names and overly long names are rejected. Tag uniqueness is case-insensitive by storing a normalized key or adding a unique index on `lower(name)`, whichever best matches the repository's migration style.

## API Design

### Existing Article Patch

Extend `PATCH /api/articles/[id]` to accept:

- `isRead`
- `isStarred`
- `isReadLater`
- `isArchived`

When `isReadLater` becomes true, set `read_later_at = now()`. When it becomes false, clear `read_later_at`. When `isArchived` becomes true, set `archived_at = now()`. When false, clear `archived_at`.

### Bulk Articles

Add `POST /api/articles/bulk`.

Request:

```json
{
  "articleIds": ["article-id"],
  "patch": {
    "isRead": true,
    "isStarred": true,
    "isReadLater": true,
    "isArchived": false
  }
}
```

Only known patch fields are allowed. Empty article lists and empty patches are rejected. The endpoint returns updated article ids and enough state for the frontend to reconcile or triggers a current-view snapshot reload.

### Tags

Add:

- `GET /api/tags`
- `POST /api/articles/[id]/tags`
- `DELETE /api/articles/[id]/tags/[tagId]`

`POST /api/articles/[id]/tags` accepts a tag name. It creates or reuses the tag, creates the tagging relation, and returns the normalized tag.

## Snapshot and Filtering

`readerSnapshotService` should return the new article fields and tags for list items. It should also return tag sidebar metadata, including tag id, name, color, and visible article count.

View filtering rules:

- `all`: RSS articles where `is_archived = false`.
- `unread`: unread RSS articles where `is_archived = false`.
- `starred`: starred articles where `is_archived = false`.
- `ai-digest`: AI digest articles where `is_archived = false`.
- `read-later`: `is_read_later = true and is_archived = false`.
- `archived`: `is_archived = true`.
- `tag:<id>`: articles tagged with the id and `is_archived = false`.

Global search includes archived articles by default. Archived results must show an archived indicator so users understand why the item is not in normal views.

## Frontend State

Extend `Article` with:

- `isReadLater`
- `isArchived`
- `readLaterAt`
- `archivedAt`
- `tags`

Add store actions:

- `toggleReadLater(articleId)`
- `archiveArticle(articleId)`
- `unarchiveArticle(articleId)`
- `bulkPatchArticles(articleIds, patch)`
- `addArticleTag(articleId, name)`
- `removeArticleTag(articleId, tagId)`

Single-article actions use optimistic updates. On failure, roll back if local state is still trustworthy; otherwise reload the current snapshot.

Bulk actions use optimistic updates for visible articles. On failure, show one error and reload the current snapshot.

Selection mode state should stay local to `ArticleList` unless later requirements need cross-pane coordination.

## Error Handling

- Single archive, read-later, read, and star operations show concise success or failure toasts through the existing operation notifier.
- Archive success provides undo.
- Bulk archive over 20 articles asks for confirmation.
- Bulk operation failure shows one failure notification and reloads the current view.
- Tag add rejects empty and too-long names before sending the request.
- Tag API errors show inline feedback near the tag input when possible.
- Deleting a tag relation failure leaves the tag visible and shows a toast.

## Testing Strategy

### Backend

- Migration tests for new article fields, tag tables, unique constraints, and cascading taggings.
- Repository/service tests for single article state updates.
- Repository/service tests for bulk updates.
- Repository/service tests for tag create/reuse, attach, detach, and tag counts.
- Snapshot tests for default archived filtering, read-later view, archived view, and tag view.
- API tests for valid and invalid article patch, bulk patch, and tag routes.

### Frontend

- `appStore` tests for optimistic read-later/archive updates, failed operation recovery, and bulk patch refresh behavior.
- `ArticleList` tests for selection mode, selected count, select current page, and bulk toolbar actions.
- `ArticleView` tests for read-later/archive buttons and auto-selecting the next visible article after archive.
- `ReaderLayout` tests for keyboard shortcuts and shortcut suppression inside editable targets and dialogs.
- `FeedList` tests for Read Later, Archived, and Tags sidebar entries.
- `GlobalSearchDialog` tests for archived result indication and opening archived articles.

## Delivery Plan

### Phase 1: Read Later, Archive, and Keyboard Basics

Add article fields, patch support, snapshot filtering, sidebar views, detail toolbar buttons, and core shortcuts. This phase gives the largest immediate efficiency gain with the smallest schema surface.

### Phase 2: Selection Mode and Bulk Operations

Add list selection mode, bulk API, bulk toolbar, and confirmation for large archive operations. This builds on Phase 1 states.

### Phase 3: Basic Tags

Add tag tables, tag APIs, tag sidebar group, article detail tag editing, list tag display, and tag view filtering.
