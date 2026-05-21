import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Article } from '../../../types';
import type { ArticleTasksDto } from '@/lib/api/apiClient';
import ArticleView from '../../../features/articles/components/ArticleView';
import { defaultPersistedSettings } from '../../../features/settings/settingsSchema';
import { useAppStore } from '../../../store/appStore';
import { useSettingsStore } from '../../../store/settingsStore';

type ApiClientModule = typeof import('@/lib/api/apiClient');

vi.mock('@/lib/api/apiClient', async () => {
  const actual = await vi.importActual<ApiClientModule>('@/lib/api/apiClient');
  return {
    ...actual,
    enqueueArticleFulltext: vi.fn(),
    getArticleTasks: vi.fn(),
  };
});

vi.mock('../../../features/toast/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function createArticle(): Article {
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
  beforeEach(async () => {
    const apiClient = await import('@/lib/api/apiClient');
    vi.mocked(apiClient.enqueueArticleFulltext).mockReset();
    vi.mocked(apiClient.getArticleTasks).mockReset();
    vi.mocked(apiClient.getArticleTasks).mockImplementation(
      () => new Promise<ArticleTasksDto>(() => undefined),
    );

    useSettingsStore.setState({
      persistedSettings: {
        ...structuredClone(defaultPersistedSettings),
        general: {
          ...defaultPersistedSettings.general,
          autoMarkReadEnabled: false,
          autoMarkReadDelayMs: 0,
        },
      },
    });

    useAppStore.setState({
      feeds: [
        {
          id: 'feed-1',
          title: 'Feed 1',
          url: 'https://example.com/rss.xml',
          unreadCount: 1,
          enabled: true,
          fullTextOnOpenEnabled: false,
          aiSummaryOnOpenEnabled: false,
          bodyTranslateOnOpenEnabled: false,
          articleListDisplayMode: 'card',
          categoryId: null,
          category: null,
        },
      ],
      categories: [{ id: 'cat-uncategorized', name: '未分类', expanded: true }],
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
