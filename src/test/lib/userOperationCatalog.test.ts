import { describe, expect, it } from 'vitest';
import {
  getUserOperationCatalogEntry,
  renderUserOperationFailure,
  renderUserOperationSuccess,
  shouldEmitUserOperationToast,
} from '@/lib/userOperationCatalog';

describe('userOperationCatalog', () => {
  it('renders success without reason and error with short reason', () => {
    expect(renderUserOperationSuccess('feed.create')).toBe('已添加订阅源');
    expect(renderUserOperationFailure('feed.create', '  订阅源已存在  ')).toBe(
      '添加订阅源失败：订阅源已存在',
    );
  });

  it('exposes mode, category and start message for deferred actions', () => {
    expect(getUserOperationCatalogEntry('feed.refresh')).toMatchObject({
      mode: 'deferred',
      category: 'feed',
    });
  });

  it('allows low-signal actions to opt out of toast stages', () => {
    expect(shouldEmitUserOperationToast('feed.refresh', 'started')).toBe(true);
    expect(shouldEmitUserOperationToast('feed.articleListDisplayMode.update', 'success')).toBe(
      false,
    );
    expect(shouldEmitUserOperationToast('article.aiSummary.generate', 'started')).toBe(false);
    expect(shouldEmitUserOperationToast('article.aiSummary.generate', 'error')).toBe(false);
    expect(shouldEmitUserOperationToast('settings.save', 'error')).toBe(false);
  });

  it('renders distinct read-later operation messages for add and remove contexts', () => {
    expect(getUserOperationCatalogEntry('article.toggleReadLater')).toMatchObject({
      mode: 'immediate',
      category: 'article',
    });

    const added = renderUserOperationSuccess('article.toggleReadLater', { readLater: true });
    const removed = renderUserOperationSuccess('article.toggleReadLater', { readLater: false });
    const addError = renderUserOperationFailure('article.toggleReadLater', undefined, {
      readLater: true,
    });
    const removeError = renderUserOperationFailure('article.toggleReadLater', undefined, {
      readLater: false,
    });

    expect(added).not.toHaveLength(0);
    expect(removed).not.toHaveLength(0);
    expect(added).not.toBe(removed);
    expect(addError).not.toBe(removeError);
  });

  it('renders bulk article patch messages', () => {
    expect(renderUserOperationSuccess('article.bulkPatch', { count: 3 })).toBe('已批量更新 3 篇文章');
    expect(renderUserOperationFailure('article.bulkPatch', undefined, { message: 'boom' })).toContain(
      '批量更新文章失败',
    );
  });

  it('renders distinct archive operation messages for archive and unarchive contexts', () => {
    expect(getUserOperationCatalogEntry('article.archive')).toMatchObject({
      mode: 'immediate',
      category: 'article',
    });

    const archived = renderUserOperationSuccess('article.archive', { archived: true });
    const unarchived = renderUserOperationSuccess('article.archive', { archived: false });
    const archiveError = renderUserOperationFailure('article.archive', undefined, {
      archived: true,
    });
    const unarchiveError = renderUserOperationFailure('article.archive', undefined, {
      archived: false,
    });

    expect(archived).not.toHaveLength(0);
    expect(unarchived).not.toHaveLength(0);
    expect(archived).not.toBe(unarchived);
    expect(archiveError).not.toBe(unarchiveError);
  });
});
