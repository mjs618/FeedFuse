# FeedFuse Tag Management Design

## Context

FeedFuse already supports article tags as a basic reading workflow: users can add and remove tags from article detail, see tags in article lists, and navigate `tag:<id>` views from the sidebar. The current system deliberately skipped tag management. Once tags accumulate, users need a small way to correct names, visually distinguish tags, and remove tags they no longer use.

This design completes the first tag management loop without adding a full tag administration screen or bulk tagging workflow.

## Goals

- Let users rename an existing tag from the sidebar tag list.
- Let users assign a color from a fixed preset palette.
- Let users delete a tag after confirming the affected article count.
- Show tag colors consistently in the sidebar, article list badges, and article detail tag editor.
- Keep tag updates consistent with the existing optimistic `appStore` and reader snapshot model.

## Non-Goals

- No global tag management modal.
- No bulk add or remove tag action in article selection mode.
- No tag merge flow.
- No tag hierarchy.
- No AI tag suggestions.
- No custom hex color input.
- No automatic color assignment for new tags in this phase.

## Recommended Approach

Use sidebar tag rows as the management entry point. Each tag row gets a context menu with single-tag actions: rename, change color, and delete. This matches the way feed rows already expose focused management actions and avoids introducing a separate management surface.

The server remains the source of truth for tag names, colors, and deletion. The client applies narrow optimistic updates to visible articles, detail cache, and sidebar metadata, then relies on snapshot refreshes to correct any drift.

## User Experience

### Sidebar Context Menu

Each row in the sidebar "Tags" group supports right-click. The localized menu contains:

- Rename
- Change color
- Delete tag

The menu is scoped to one tag. There is no multi-select or global management mode.

### Rename Dialog

Choosing Rename opens a small dialog with the current tag name prefilled.

Behavior:

- Empty or whitespace-only names are rejected inline.
- Names are normalized by trimming and collapsing internal whitespace.
- Names that conflict with another tag are rejected instead of merging tags.
- Saving updates every visible occurrence of that tag name.

### Color Dialog

Choosing Change color opens a fixed swatch palette. The palette includes one default option plus a small set of named colors.

Store the selected value as a preset key rather than arbitrary CSS. The initial preset list is:

- `null` for default
- `slate`
- `red`
- `orange`
- `amber`
- `green`
- `teal`
- `cyan`
- `blue`
- `violet`
- `pink`

The UI maps preset keys to controlled class names. This prevents arbitrary CSS input and keeps contrast predictable.

### Delete Confirmation

Choosing Delete tag opens a confirmation dialog. The localized copy must say that the tag will be removed from the affected number of articles and that no articles will be deleted.

Example meaning: Delete tag "AI"? This removes the tag from 12 articles. It will not delete any articles.

Confirming deletes the tag and all taggings. Articles remain intact. If the user is currently viewing `tag:<id>` for the deleted tag, the reader switches to `all`.

## Color Rendering

Tag colors appear wherever article tags already appear:

- Sidebar tag rows: a small colored tag icon or dot plus the existing count badge.
- Article list badges: subtle tinted background, border, and text color.
- Article detail tag editor: colored tag badge with the existing remove button.

The styling should remain quiet. Use soft background tints and borders instead of saturated blocks. Tags without a color keep the existing neutral badge treatment.

## Backend

Extend `articleTagsRepo` with:

- `updateArticleTag(pool, tagId, patch)`
- `deleteArticleTag(pool, tagId)`

`updateArticleTag`:

- Accepts `name` and `color`, with at least one field required.
- Normalizes and validates `name` using the existing tag name rules.
- Rejects names that conflict with an existing tag by lowercased name.
- Regenerates the slug when the name changes.
- Rejects color values outside the fixed preset list.
- Returns the updated tag row.

`deleteArticleTag`:

- Runs in a transaction.
- Counts associated articles before deletion.
- Deletes the tag row, allowing `article_taggings` cascade to remove associations.
- Returns `{ removed: true, affectedArticleCount }`.
- Treats a missing tag as `{ removed: false, affectedArticleCount: 0 }` so API behavior is explicit.

The affected count is the total number of associated articles, including archived articles, because deletion removes the tag from all articles.

## API

Add `PATCH /api/tags/[tagId]`.

Request examples:

```json
{ "name": "Research" }
```

```json
{ "color": "blue" }
```

```json
{ "name": "AI Research", "color": "violet" }
```

Response:

```json
{
  "ok": true,
  "data": {
    "tag": {
      "id": "uuid",
      "name": "AI Research",
      "slug": "ai-research",
      "color": "violet"
    }
  }
}
```

Add `DELETE /api/tags/[tagId]`.

Response:

```json
{
  "ok": true,
  "data": {
    "removed": true,
    "affectedArticleCount": 12
  }
}
```

Validation:

- `tagId` must be a UUID.
- `name` must be non-empty after normalization and at most the existing tag name max length.
- `color` must be `null` or a known preset key.
- Empty patch bodies are rejected.
- Conflicting names use the existing API error response shape with a clear user-facing message.

Operation logging:

- Add catalog entries for `tag.update` and `tag.delete`.
- Use operation-level failure notifications for server or network failures.

## API Client

Add helpers to `src/lib/api/apiClient.ts`:

- `updateTag(tagId, patch, options?)`
- `deleteTag(tagId, options?)`

Types:

```ts
export type TagColorPreset =
  | 'slate'
  | 'red'
  | 'orange'
  | 'amber'
  | 'green'
  | 'teal'
  | 'cyan'
  | 'blue'
  | 'violet'
  | 'pink';

export interface UpdateTagInput {
  name?: string;
  color?: TagColorPreset | null;
}
```

`ArticleTagDto` and `ReaderTagDto` continue to expose `color: string | null` unless a broader type cleanup is included in the implementation plan.

## Store

Add to `appStore`:

- `updateReaderTag(tagId, patch)`
- `deleteReaderTag(tag)`

Rename and color updates:

- Optimistically update `tags`.
- Update matching tags inside visible `articles`.
- Update matching tags inside `articleDetailCache`.
- Preserve the current selected view and selected article.
- On failure, notify and reload the current snapshot.

Delete:

- Optimistically remove the tag from `tags`.
- Remove matching tags from visible `articles`.
- Remove matching tags from `articleDetailCache`.
- If `selectedView` is `tag:<id>`, switch to `all` and clear current selection.
- On failure, notify and reload the current snapshot.

The store does not need a separate global tag cache beyond the existing `tags` array. Snapshot remains the final correction mechanism.

## Frontend Components

### FeedList

`FeedList` owns the tag management UI because the sidebar tag row is the entry point.

Changes:

- Add a context menu to tag rows.
- Add rename dialog state for the selected tag.
- Add color dialog state for the selected tag.
- Add delete confirmation state for the selected tag.
- Use `tag.articleCount` in the delete confirmation copy.
- Call store actions rather than API client helpers directly.

### ArticleList

Use a shared tag color rendering helper to style badges. Continue showing up to two tag badges and a `+N` overflow badge.

### ArticleView

Use the same tag color rendering helper for detail tag badges. Keep the editor compact and avoid turning the article detail header into a management panel.

### Shared Color Helper

Add a small shared helper for tag color classes, for example under `src/features/articles/utils` or `src/lib/reader`.

The helper maps preset keys to class names for:

- icon/dot color
- badge background
- badge border
- badge text

Unknown values fall back to neutral styling.

## Error Handling

- Rename dialog keeps the current input on validation failure.
- Color dialog keeps the selected color visible on failure and shows one failure notification.
- Delete failure restores state by reloading the current snapshot.
- Deleting a missing tag returns a graceful response and the client removes stale local references.
- If a tag is deleted while its context menu or dialog is open, closing the dialog is enough; no extra recovery UI is needed.

## Testing

Repository tests:

- Rename updates name and slug.
- Rename rejects case-insensitive conflicts.
- Color update accepts preset values and `null`.
- Color update rejects unknown values.
- Delete returns affected article count.
- Delete removes taggings without deleting articles.

API route tests:

- `PATCH /api/tags/[tagId]` succeeds for name, color, and combined patches.
- Invalid UUID is rejected.
- Empty name is rejected.
- Unknown color is rejected.
- Conflicting name is rejected.
- `DELETE /api/tags/[tagId]` returns affected count.

API client tests:

- `updateTag` uses the correct path, method, body, and response mapping.
- `deleteTag` uses the correct path and method.

Store tests:

- Rename updates sidebar tags, visible article tags, and detail cache tags.
- Color update updates the same local surfaces.
- Delete removes all local references.
- Deleting the currently selected tag view switches to `all`.
- Failure reloads the current snapshot.

UI tests:

- Sidebar tag row opens a context menu.
- Rename dialog saves a normalized name.
- Color dialog saves a selected preset.
- Delete dialog shows the affected article count and does not imply article deletion.
- Article list badges render color styling.
- Article detail tag badges render color styling.

## Rollout

This feature does not require a new migration because `article_tags.color` already exists. The implementation should be split into small commits:

1. Repository and API route support.
2. API client and store actions.
3. Sidebar context menu and dialogs.
4. Shared color rendering across list and detail.
5. Final verification.
