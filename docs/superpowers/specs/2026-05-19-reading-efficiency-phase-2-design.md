# FeedFuse Reading Efficiency Phase 2 Design

## Context

FeedFuse Reading Efficiency Phase 1 added read-later, archive, sidebar smart views, article toolbar controls, and keyboard triage shortcuts. The next step is batch processing for heavy readers who need to triage many visible articles without repeating single-article actions.

Phase 2 builds on the existing three-pane reader, optimistic store updates, article patch semantics, and operation notification system. It does not change feed ingestion, article search, tags, or AI digest behavior.

## Goals

- Add article list selection mode for the currently loaded list.
- Add bulk actions for read/unread, star, read-later, and archive.
- Add a backend bulk patch endpoint so batch operations are one request.
- Keep selected article behavior predictable when selected items are archived.
- Support keyboard selection shortcuts.
- Recover cleanly from bulk API failures.

## Non-Goals

- No "select every matching article in the database" action.
- No tags, tag filters, tag editing, or tag bulk assignment.
- No custom keyboard shortcut editor.
- No cross-view persistent selection.
- No partial-success UI in this phase.
- No bulk delete.

## Recommended Approach

Use local article-list selection state plus a backend bulk patch endpoint.

`ArticleList` owns `selectionMode` and `selectedArticleIds` because selection is only meaningful for the currently rendered list. The global store owns the mutation through `bulkPatchArticles(articleIds, patch)` because the mutation affects articles, feed unread counts, detail cache, selection, and snapshot recovery.

This keeps UI selection state isolated while preserving a single data mutation path.

## Backend API

Add `POST /api/articles/bulk`.

Request:

```json
{
  "articleIds": ["article-id"],
  "patch": {
    "isRead": true,
    "isStarred": true,
    "isReadLater": true,
    "isArchived": true
  }
}
```

Rules:

- `articleIds` must be a non-empty array of article ids.
- Duplicate article ids are de-duplicated before repository calls.
- `patch` must contain at least one allowed field.
- Allowed fields are exactly `isRead`, `isStarred`, `isReadLater`, and `isArchived`.
- Unknown fields are rejected.
- Archive does not imply read.
- The response returns the ids requested after de-duplication and the patch that was applied.

Response:

```json
{
  "ok": true,
  "data": {
    "articleIds": ["article-id"],
    "patch": {
      "isArchived": true
    },
    "updatedCount": 1
  }
}
```

## Repository Design

Add a bulk patch repository helper in `articlesRepo`.

The helper accepts a database client, de-duplicated article ids, and a typed patch. It builds SQL from a fixed field-to-assignment map instead of interpolating arbitrary request keys.

Patch semantics:

- `is_read` updates only `is_read`.
- `is_starred` updates `starred_at` the same way the single-article setter does.
- `is_read_later` updates `read_later_at` the same way the single-article setter does.
- `is_archived` updates `archived_at` the same way the single-article setter does.

The helper returns the number of updated rows.

## API Client

Add `bulkPatchArticles(articleIds, patch, options?)` to `src/lib/api/apiClient.ts`.

The client mirrors `patchArticle` error handling and notification options. Store code will call it with `notifyOnError: false` and use the existing user operation notifier for one bulk-level toast.

## Store Data Flow

Add `bulkPatchArticles(articleIds, patch)` to `appStore`.

Behavior:

- Ignore empty article id input.
- De-duplicate ids before applying local updates.
- Optimistically update `articles` and `articleDetailCache`.
- If `isRead` is present, update affected feed `unreadCount` using the previous visible and cached article state.
- If `isArchived: true` includes the current selected article, select the next visible non-archived article; if none exists, clear selection.
- On API success, show one success notification.
- On API failure, show one failure notification and reload the current snapshot.

The store does not track which articles are selected in the UI.

## Article List UX

Add local state in `ArticleList`:

- `selectionMode: boolean`
- `selectedArticleIds: Set<string>`

Normal mode:

- The existing toolbar remains.
- Add a select-mode icon button.

Selection mode:

- The header becomes a bulk action toolbar.
- It shows selected count, select current loaded list, mark read, mark unread, star, read later, archive, and cancel.
- Article rows show checkboxes.
- Clicking a row toggles selection instead of opening it.
- Double click opens the row.
- `Enter` opens the focused row.
- Successful bulk action exits selection mode and clears selection.
- When the loaded article list changes, selected ids that no longer exist are removed.

Bulk actions apply only to the currently loaded list and explicitly selected article ids.

## Keyboard Behavior

Extend existing reader-level shortcuts:

- `X`: toggle the current article in the current article-list selection and enter selection mode.
- `Shift+X`: enter or exit selection mode.
- `Esc`: if selection mode is active, exit selection mode and clear selected ids. If selection mode is not active, preserve existing behavior.

Shortcut guards remain unchanged: no selection shortcuts fire while focus is inside inputs, textareas, selects, contenteditable regions, dialogs, popovers, or menus.

## Archive Confirmation

Bulk archive requires confirmation when more than 20 articles are selected.

The confirmation explains:

- It affects only the selected articles.
- Archived articles remain recoverable from the Archived view.

Bulk archive for 20 or fewer articles runs without confirmation.

## Error Handling

- Empty selection disables bulk action buttons.
- API validation errors show one failure notification.
- Network or server errors show one failure notification and reload the current snapshot.
- No per-article error toasts are shown.
- Partial database updates are treated as a bulk failure from the user's perspective if the request fails.
- Successful bulk archive does not provide per-article undo in Phase 2. Recovery is through the Archived view.

## Testing Strategy

Backend:

- Repository tests for generated SQL and timestamp semantics.
- API route tests for empty ids, duplicate ids, empty patch, unknown fields, valid patch, and repository call shape.

Client and store:

- API client test for request mapping.
- Store tests for optimistic article updates.
- Store tests for feed unread count correction when marking read or unread.
- Store tests for selected article advancement after bulk archive.
- Store tests for failure notification and snapshot reload.

Frontend:

- `ArticleList` tests for entering and exiting selection mode.
- Checkbox and row-click selection tests.
- Select current loaded list test.
- Bulk toolbar action tests.
- `X`, `Shift+X`, and `Esc` shortcut tests.
- Archive confirmation test for more than 20 selected articles.
- Test that successful bulk actions clear selection mode.

## Delivery Plan

Implement Phase 2 in these slices:

1. Add repository and API route for bulk article patch.
2. Add API client and store bulk mutation.
3. Add article-list selection mode and bulk toolbar.
4. Add keyboard selection shortcuts.
5. Add archive confirmation and final verification.

Each slice should include focused tests before implementation and targeted verification after implementation.
