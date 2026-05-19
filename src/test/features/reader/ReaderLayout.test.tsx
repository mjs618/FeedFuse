import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { vi } from 'vitest';

vi.mock('../../../features/articles/components/ArticleList', () => ({
  default: function MockArticleList() {
    return <div data-testid="mock-article-list" />;
  },
}));

vi.mock('../../../features/articles/components/ArticleView', () => ({
  default: function MockArticleView({
    onOpenSettings,
    reserveTopSpace = true,
  }: {
    onOpenSettings?: () => void;
    reserveTopSpace?: boolean;
  }) {
    return (
      <>
        {reserveTopSpace ? (
          <button type="button" aria-label="打开设置" onClick={onOpenSettings}>
            mock settings
          </button>
        ) : null}
        <div
          data-testid="article-scroll-container"
          data-reserve-top-space={reserveTopSpace ? 'true' : 'false'}
        />
      </>
    );
  },
}));

import ReaderLayout from '../../../features/reader/components/ReaderLayout';
import { ToastHost } from '../../../features/toast/components/ToastHost';
import {
  READER_RESIZE_DESKTOP_MIN_WIDTH,
  READER_TABLET_MIN_WIDTH,
} from '../../../features/reader/utils/readerLayoutSizing';
import { defaultPersistedSettings } from '../../../features/settings/settingsSchema';
import { useSettingsStore } from '../../../store/settingsStore';
import { useAppStore } from '../../../store/appStore';
import type { Article } from '../../../types';

function createReaderArticle(overrides: Partial<Article> = {}): Article {
  return {
    id: 'article-1',
    feedId: 'feed-1',
    title: 'Article 1',
    content: '<p>content</p>',
    summary: 'summary',
    publishedAt: '2026-01-01T00:00:00.000Z',
    link: 'https://example.com/article-1',
    isRead: false,
    isStarred: false,
    ...overrides,
  };
}

const initialAppStoreActions = {
  toggleStar: useAppStore.getState().toggleStar,
  toggleReadLater: useAppStore.getState().toggleReadLater,
  archiveArticle: useAppStore.getState().archiveArticle,
  markAsRead: useAppStore.getState().markAsRead,
  toggleReadState: useAppStore.getState().toggleReadState,
};

function resetSettingsStore() {
  useSettingsStore.setState((state) => ({
    ...state,
    persistedSettings: structuredClone(defaultPersistedSettings),
    sessionSettings: { ai: { apiKey: '', hasApiKey: false, clearApiKey: false }, rssValidation: {} },
    draft: null,
    validationErrors: {},
    settings: structuredClone(defaultPersistedSettings.appearance),
  }));
  window.localStorage.clear();

  useAppStore.setState({
    feeds: [],
    categories: [{ id: 'cat-uncategorized', name: '未分类', expanded: true }],
    articles: [],
    selectedView: 'all',
    selectedArticleId: null,
    sidebarCollapsed: false,
    snapshotLoading: false,
    ...initialAppStoreActions,
  });
}

function renderWithNotifications() {
  return render(
    <>
      <ReaderLayout />
      <ToastHost />
    </>,
  );
}

async function flushReaderLayoutUpdates() {
  await act(async () => {
    await Promise.resolve();
  });
}

async function renderWithNotificationsSettled() {
  let rendered: ReturnType<typeof renderWithNotifications> | undefined;
  await act(async () => {
    rendered = renderWithNotifications();
    await Promise.resolve();
  });
  await flushReaderLayoutUpdates();
  return rendered as ReturnType<typeof renderWithNotifications>;
}

function renderOnServer(ui: React.ReactElement) {
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: undefined,
  });

  try {
    return renderToString(ui);
  } finally {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    });
  }
}

describe('ReaderLayout', () => {
  it('keeps the existing 3-column reader interactions', async () => {
    resetSettingsStore();
    renderWithNotifications();
    expect(screen.getByLabelText('添加订阅')).toBeInTheDocument();
    expect(screen.getAllByLabelText('打开设置').length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByLabelText('打开设置').at(-1) as HTMLElement);
    expect(await screen.findByTestId('settings-center-modal', {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it('no longer renders a separate desktop floating title after reader scroll', () => {
    resetSettingsStore();
    useAppStore.setState({
      feeds: [
        {
          id: 'feed-1',
          title: 'Example Feed',
          url: 'https://example.com/rss.xml',
          unreadCount: 1,
          enabled: true,
          fullTextOnOpenEnabled: false,
          aiSummaryOnOpenEnabled: false,
          categoryId: 'cat-uncategorized',
          category: '未分类',
        },
      ],
      articles: [
        {
          id: 'article-1',
          feedId: 'feed-1',
          title: 'Selected Article',
          content: '<p>content</p>',
          summary: 'summary',
          publishedAt: new Date().toISOString(),
          link: 'https://example.com/article-1',
          isRead: false,
          isStarred: false,
        },
      ],
      selectedView: 'all',
      selectedArticleId: 'article-1',
    });

    renderWithNotifications();
    expect(screen.queryByTestId('reader-floating-title')).not.toBeInTheDocument();

    const readerScrollContainer = screen.getByTestId('article-scroll-container');
    readerScrollContainer.scrollTop = 120;
    fireEvent.scroll(readerScrollContainer);

    expect(screen.queryByTestId('reader-floating-title')).not.toBeInTheDocument();
  });

  it('opens settings from the desktop article toolbar callback instead of a floating layout button', async () => {
    resetSettingsStore();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });

    renderWithNotifications();

    const openSettingsButtons = screen.getAllByLabelText('打开设置');
    expect(openSettingsButtons).toHaveLength(1);

    fireEvent.click(openSettingsButtons[0]);
    expect(await screen.findByTestId('settings-center-modal', {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it('groups feeds by category with uncategorized fallback', () => {
    resetSettingsStore();
    useAppStore.setState({
      categories: [
        { id: 'cat-tech', name: '科技', expanded: true },
        { id: 'cat-uncategorized', name: '未分类', expanded: true },
      ],
      feeds: [
        {
          id: 'feed-1',
          title: 'Example 1',
          url: 'https://example.com/rss.xml',
          unreadCount: 1,
          categoryId: 'cat-tech',
          category: '科技',
        },
        {
          id: 'feed-2',
          title: 'Example 2',
          url: 'https://example.com/other.xml',
          unreadCount: 0,
          categoryId: null,
          category: null,
        },
      ],
      articles: [],
      selectedView: 'all',
      selectedArticleId: null,
    });
    renderWithNotifications();
    expect(screen.getByText('科技')).toBeInTheDocument();
    expect(screen.getByText('未分类')).toBeInTheDocument();
  });

  it('hides categories without feeds in sidebar', () => {
    resetSettingsStore();
    useAppStore.setState((state) => ({
      ...state,
      categories: [...state.categories, { id: 'cat-empty', name: '空分类', expanded: true }],
    }));

    renderWithNotifications();
    expect(screen.queryByText('空分类')).not.toBeInTheDocument();
  });

  it('renders persisted pane widths and restores left pane width after re-expanding sidebar', () => {
    resetSettingsStore();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });

    useSettingsStore.setState((state) => ({
      ...state,
      persistedSettings: {
        ...state.persistedSettings,
        general: {
          ...state.persistedSettings.general,
          leftPaneWidth: 280,
          middlePaneWidth: 460,
        },
      },
    }));

    renderWithNotifications();

    expect(screen.getByTestId('reader-feed-pane')).toHaveStyle({ width: '280px' });
    expect(screen.getByTestId('reader-article-pane')).toHaveStyle({ width: '460px' });
    expect(screen.getAllByRole('separator')).toHaveLength(2);

    act(() => {
      useAppStore.setState({ sidebarCollapsed: true });
    });
    expect(screen.getByTestId('reader-feed-pane')).toHaveStyle({ width: '0px' });

    act(() => {
      useAppStore.setState({ sidebarCollapsed: false });
    });
    expect(screen.getByTestId('reader-feed-pane')).toHaveStyle({ width: '280px' });
  });

  it('persists left pane width after dragging the left separator', () => {
    resetSettingsStore();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });

    renderWithNotifications();

    fireEvent.pointerDown(screen.getByTestId('reader-resize-handle-left'), { clientX: 240 });
    fireEvent.pointerMove(window, { clientX: 320 });
    fireEvent.pointerUp(window, { clientX: 320 });

    expect(screen.getByTestId('reader-feed-pane')).toHaveStyle({ width: '320px' });
    expect(useSettingsStore.getState().persistedSettings.general.leftPaneWidth).toBe(320);
    expect(document.body.style.cursor).toBe('');
    expect(document.body.style.userSelect).toBe('');

    fireEvent.pointerDown(screen.getByTestId('reader-resize-handle-left'), { clientX: 320 });
    fireEvent.pointerMove(window, { clientX: 20 });
    fireEvent.pointerUp(window, { clientX: 20 });

    expect(useSettingsStore.getState().persistedSettings.general.leftPaneWidth).toBe(200);
  });

  it('keeps left pane width stable during drag and only commits on release', () => {
    resetSettingsStore();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });

    renderWithNotifications();

    const layout = screen.getByTestId('reader-layout-root');
    const leftHandle = screen.getByTestId('reader-resize-handle-left');
    const feedPane = screen.getByTestId('reader-feed-pane');

    expect(feedPane).toHaveStyle({ width: '240px' });
    expect(feedPane.className).not.toContain('transition-[width]');

    fireEvent.pointerDown(leftHandle, { clientX: 240 });
    fireEvent.pointerMove(window, { clientX: 320 });

    expect(feedPane).toHaveStyle({ width: '240px' });
    expect(layout.style.getPropertyValue('--reader-left-resize-preview-offset')).toBe('80px');
    expect(leftHandle).toHaveAttribute('data-active', 'true');

    fireEvent.pointerUp(window, { clientX: 320 });

    expect(feedPane).toHaveStyle({ width: '320px' });
    expect(layout.style.getPropertyValue('--reader-left-resize-preview-offset')).toBe('0px');
    expect(leftHandle).toHaveAttribute('data-active', 'false');
  });

  it('clamps middle pane drag to preserve right pane minimum width', () => {
    resetSettingsStore();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });

    renderWithNotifications();
    const layout = screen.getByTestId('reader-layout-root');
    Object.defineProperty(layout, 'clientWidth', { configurable: true, value: 1100 });

    fireEvent.pointerDown(screen.getByTestId('reader-resize-handle-middle'), { clientX: 640 });
    fireEvent.pointerMove(window, { clientX: 900 });
    fireEvent.pointerUp(window, { clientX: 900 });

    expect(screen.getByTestId('reader-article-pane')).toHaveStyle({ width: '380px' });
    expect(useSettingsStore.getState().persistedSettings.general.middlePaneWidth).toBe(380);
  });

  it('keeps middle pane width stable during drag and previews the clamped offset', () => {
    resetSettingsStore();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });

    renderWithNotifications();
    const layout = screen.getByTestId('reader-layout-root');
    Object.defineProperty(layout, 'clientWidth', { configurable: true, value: 1100 });

    const middleHandle = screen.getByTestId('reader-resize-handle-middle');
    const articlePane = screen.getByTestId('reader-article-pane');

    expect(articlePane).toHaveStyle({ width: '400px' });

    fireEvent.pointerDown(middleHandle, { clientX: 640 });
    fireEvent.pointerMove(window, { clientX: 900 });

    expect(articlePane).toHaveStyle({ width: '400px' });
    expect(layout.style.getPropertyValue('--reader-middle-resize-preview-offset')).toBe('-20px');
    expect(middleHandle).toHaveAttribute('data-active', 'true');

    fireEvent.pointerUp(window, { clientX: 900 });

    expect(articlePane).toHaveStyle({ width: '380px' });
    expect(layout.style.getPropertyValue('--reader-middle-resize-preview-offset')).toBe('0px');
    expect(middleHandle).toHaveAttribute('data-active', 'false');
  });

  it('does not render resize handles below desktop breakpoint', () => {
    resetSettingsStore();
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: READER_TABLET_MIN_WIDTH,
    });

    renderWithNotifications();

    expect(screen.queryByTestId('reader-resize-handle-left')).not.toBeInTheDocument();
    expect(screen.queryByTestId('reader-resize-handle-middle')).not.toBeInTheDocument();
  });

  it('uses the lighter shared tablet article pane surface', () => {
    resetSettingsStore();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 900 });

    renderWithNotifications();

    const tabletPane = screen.getByTestId('reader-tablet-article-pane');
    expect(tabletPane.className).toContain('bg-background/72');
    expect(tabletPane.className).toContain('supports-[backdrop-filter]:bg-background/58');
    expect(tabletPane.className).toContain('border-border/70');
  });

  it('uses a feed drawer instead of an inline feed pane on mobile', () => {
    resetSettingsStore();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });

    renderWithNotifications();

    expect(screen.getByTestId('reader-non-desktop-topbar')).toBeInTheDocument();
    expect(screen.queryByTestId('reader-mobile-action-bar')).not.toBeInTheDocument();
    expect(screen.getByText('全部文章')).toBeInTheDocument();
    expect(screen.queryByTestId('reader-feed-pane')).not.toBeInTheDocument();
    expect(screen.getByLabelText('打开订阅源列表')).toBeInTheDocument();
    expect(screen.getByLabelText('打开设置')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('打开订阅源列表'));

    expect(screen.getByTestId('reader-feed-drawer')).toBeInTheDocument();
    expect(screen.getByTestId('feed-list-header')).toHaveClass('pr-16');
    const addSubscriptionButton = screen.getByLabelText('添加订阅');
    expect(addSubscriptionButton).toBeInTheDocument();

    fireEvent.click(addSubscriptionButton);

    expect(screen.getByRole('button', { name: '添加 RSS 源' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '添加智能报告' })).toBeInTheDocument();
  });

  it('renders mobile reading context and quick actions for selected articles', () => {
    resetSettingsStore();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });

    useAppStore.setState({
      feeds: [
        {
          id: 'feed-1',
          title: 'Example Feed',
          url: 'https://example.com/rss.xml',
          unreadCount: 1,
          enabled: true,
          fullTextOnOpenEnabled: false,
          aiSummaryOnOpenEnabled: false,
          categoryId: 'cat-uncategorized',
          category: '未分类',
        },
      ],
      articles: [
        {
          id: 'article-1',
          feedId: 'feed-1',
          title: 'Selected Article',
          content: '<p>content</p>',
          summary: 'summary',
          publishedAt: new Date().toISOString(),
          link: 'https://example.com/article-1',
          isRead: false,
          isStarred: false,
        },
      ],
      selectedView: 'all',
      selectedArticleId: 'article-1',
    });

    renderWithNotifications();

    expect(screen.queryByText('正在阅读')).not.toBeInTheDocument();
    expect(screen.getByText('Selected Article')).toBeInTheDocument();
    expect(screen.getByLabelText('打开全局搜索')).toBeInTheDocument();
    expect(screen.getByLabelText('打开设置')).toBeInTheDocument();
    expect(screen.getByLabelText('返回文章列表')).toBeInTheDocument();
  });

  it('opens global search with cmd+f and ctrl+f', async () => {
    resetSettingsStore();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });

    const { unmount } = renderWithNotifications();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const metaFindEvent = new KeyboardEvent('keydown', {
      key: 'f',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      window.dispatchEvent(metaFindEvent);
      await Promise.resolve();
    });
    expect(metaFindEvent.defaultPrevented).toBe(true);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('关闭全局搜索'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    unmount();
    renderWithNotifications();
    const ctrlFindEvent = new KeyboardEvent('keydown', {
      key: 'f',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      window.dispatchEvent(ctrlFindEvent);
      await Promise.resolve();
    });
    expect(ctrlFindEvent.defaultPrevented).toBe(true);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('does not hijack the search shortcut inside editable fields', () => {
    resetSettingsStore();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });

    renderWithNotifications();

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    try {
      fireEvent.keyDown(input, { key: 'f', metaKey: true });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      const editable = document.createElement('div');
      editable.contentEditable = 'true';
      document.body.appendChild(editable);
      editable.focus();

      fireEvent.keyDown(editable, { key: 'f', ctrlKey: true });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      editable.remove();
    } finally {
      input.remove();
    }
  });

  it('moves selection through visible articles with j and k', async () => {
    resetSettingsStore();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
    useAppStore.setState({
      articles: [
        createReaderArticle({ id: 'article-1', title: 'Article 1' }),
        createReaderArticle({ id: 'article-2', title: 'Article 2' }),
      ],
      selectedView: 'all',
      selectedArticleId: 'article-1',
    });

    await renderWithNotificationsSettled();

    await act(async () => {
      fireEvent.keyDown(window, { key: 'j' });
      await Promise.resolve();
    });
    expect(useAppStore.getState().selectedArticleId).toBe('article-2');

    await act(async () => {
      fireEvent.keyDown(window, { key: 'k' });
      await Promise.resolve();
    });
    expect(useAppStore.getState().selectedArticleId).toBe('article-1');
  });

  it('runs triage shortcuts for the selected article', async () => {
    resetSettingsStore();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
    const toggleStar = vi.fn();
    const toggleReadLater = vi.fn();
    const archiveArticle = vi.fn();
    const markAsRead = vi.fn();
    const toggleReadState = vi.fn();
    useAppStore.setState({
      articles: [createReaderArticle({ id: 'article-1' })],
      selectedView: 'all',
      selectedArticleId: 'article-1',
      toggleStar,
      toggleReadLater,
      archiveArticle,
      markAsRead,
      toggleReadState,
    });

    await renderWithNotificationsSettled();

    fireEvent.keyDown(window, { key: 's' });
    fireEvent.keyDown(window, { key: 'l' });
    fireEvent.keyDown(window, { key: 'e' });
    fireEvent.keyDown(window, { key: 'm' });

    expect(toggleStar).toHaveBeenCalledWith('article-1');
    expect(toggleReadLater).toHaveBeenCalledWith('article-1');
    expect(archiveArticle).toHaveBeenCalledWith('article-1');
    expect(toggleReadState).toHaveBeenCalledWith('article-1');
    expect(markAsRead).not.toHaveBeenCalled();
  });

  it('leaves x selection shortcuts available for the article list', async () => {
    resetSettingsStore();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
    const toggleStar = vi.fn();
    const toggleReadLater = vi.fn();
    const archiveArticle = vi.fn();
    const toggleReadState = vi.fn();
    useAppStore.setState({
      articles: [createReaderArticle({ id: 'article-1' })],
      selectedView: 'all',
      selectedArticleId: 'article-1',
      toggleStar,
      toggleReadLater,
      archiveArticle,
      toggleReadState,
    });

    await renderWithNotificationsSettled();

    const toggleCurrentEvent = new KeyboardEvent('keydown', {
      key: 'x',
      bubbles: true,
      cancelable: true,
    });
    const toggleModeEvent = new KeyboardEvent('keydown', {
      key: 'X',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });

    window.dispatchEvent(toggleCurrentEvent);
    window.dispatchEvent(toggleModeEvent);

    expect(toggleCurrentEvent.defaultPrevented).toBe(false);
    expect(toggleModeEvent.defaultPrevented).toBe(false);
    expect(toggleStar).not.toHaveBeenCalled();
    expect(toggleReadLater).not.toHaveBeenCalled();
    expect(archiveArticle).not.toHaveBeenCalled();
    expect(toggleReadState).not.toHaveBeenCalled();
  });

  it('opens and closes shortcut help with ? while preserving editable targets', async () => {
    resetSettingsStore();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });

    await renderWithNotificationsSettled();

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    try {
      fireEvent.keyDown(input, { key: '?' });
      expect(screen.queryByRole('dialog', { name: '快捷键' })).not.toBeInTheDocument();
    } finally {
      input.remove();
    }

    fireEvent.keyDown(window, { key: '?', shiftKey: true });
    expect(screen.getByRole('dialog', { name: '快捷键' })).toBeInTheDocument();
    expect(screen.getByText('X')).toBeInTheDocument();
    expect(screen.getByText('Shift + X')).toBeInTheDocument();
    expect(screen.getByText('选择当前文章')).toBeInTheDocument();
    expect(screen.getByText('进入 / 退出选择模式')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: '?', shiftKey: true });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '快捷键' })).not.toBeInTheDocument();
    });
  });

  it('suppresses reader action shortcuts while shortcut help is open', async () => {
    resetSettingsStore();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
    const toggleStar = vi.fn();
    useAppStore.setState({
      articles: [
        createReaderArticle({ id: 'article-1', title: 'Article 1' }),
        createReaderArticle({ id: 'article-2', title: 'Article 2' }),
      ],
      selectedView: 'all',
      selectedArticleId: 'article-1',
      toggleStar,
    });

    await renderWithNotificationsSettled();

    fireEvent.keyDown(window, { key: '?', shiftKey: true });
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await act(async () => {
      fireEvent.keyDown(window, { key: 'j' });
      fireEvent.keyDown(window, { key: 's' });
      await Promise.resolve();
    });

    expect(useAppStore.getState().selectedArticleId).toBe('article-1');
    expect(toggleStar).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: '?', shiftKey: true });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('suppresses reader action shortcuts while any dialog is open', async () => {
    resetSettingsStore();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
    const toggleStar = vi.fn();
    useAppStore.setState({
      articles: [
        createReaderArticle({ id: 'article-1', title: 'Article 1' }),
        createReaderArticle({ id: 'article-2', title: 'Article 2' }),
      ],
      selectedView: 'all',
      selectedArticleId: 'article-1',
      toggleStar,
    });

    await renderWithNotificationsSettled();

    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.appendChild(dialog);

    try {
      await act(async () => {
        fireEvent.keyDown(window, { key: 'j' });
        fireEvent.keyDown(window, { key: 's' });
        await Promise.resolve();
      });

      expect(useAppStore.getState().selectedArticleId).toBe('article-1');
      expect(toggleStar).not.toHaveBeenCalled();
    } finally {
      dialog.remove();
    }
  });

  it('suppresses reader shortcuts and search while any alertdialog is open', async () => {
    resetSettingsStore();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
    const toggleStar = vi.fn();
    useAppStore.setState({
      articles: [
        createReaderArticle({ id: 'article-1', title: 'Article 1' }),
        createReaderArticle({ id: 'article-2', title: 'Article 2' }),
      ],
      selectedView: 'all',
      selectedArticleId: 'article-1',
      toggleStar,
    });

    await renderWithNotificationsSettled();

    const alertDialog = document.createElement('div');
    alertDialog.setAttribute('role', 'alertdialog');
    document.body.appendChild(alertDialog);

    try {
      const ctrlFindEvent = new KeyboardEvent('keydown', {
        key: 'f',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });

      await act(async () => {
        window.dispatchEvent(ctrlFindEvent);
        fireEvent.keyDown(window, { key: 'j' });
        fireEvent.keyDown(window, { key: 's' });
        await Promise.resolve();
      });

      expect(ctrlFindEvent.defaultPrevented).toBe(false);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(useAppStore.getState().selectedArticleId).toBe('article-1');
      expect(toggleStar).not.toHaveBeenCalled();
    } finally {
      alertDialog.remove();
    }
  });

  it('hydrates responsive layout without rebuilding from a mismatched mobile first render', async () => {
    resetSettingsStore();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const container = document.createElement('div');
    let hydratedRoot: ReturnType<typeof hydrateRoot> | null = null;
    container.innerHTML = renderOnServer(<ReaderLayout />);
    document.body.appendChild(container);

    try {
      expect(container.querySelector('[data-testid="reader-feed-pane"]')).not.toBeNull();

      await act(async () => {
        hydratedRoot = hydrateRoot(container, <ReaderLayout />);
        await Promise.resolve();
      });

      expect(screen.getByTestId('reader-non-desktop-topbar')).toBeInTheDocument();

      const hydrationOutput = consoleErrorSpy.mock.calls
        .flatMap((call) => call.map((value) => String(value)))
        .join('\n');

      expect(hydrationOutput).not.toMatch(/hydration|server rendered html|didn't match|418/i);
    } finally {
      if (hydratedRoot) {
        await act(async () => {
          hydratedRoot?.unmount();
          await Promise.resolve();
        });
      }
      consoleErrorSpy.mockRestore();
      container.remove();
    }
  });

  it('hydrates URL-selected feed without leaving 全部文章 active', async () => {
    resetSettingsStore();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });

    const sidebarFixtureState = {
      feeds: [
        {
          id: 'feed-1',
          title: 'Example Feed',
          url: 'https://example.com/rss.xml',
          unreadCount: 1,
          enabled: true,
          fullTextOnOpenEnabled: false,
          aiSummaryOnOpenEnabled: false,
          categoryId: 'cat-uncategorized',
          category: '未分类',
        },
      ],
      categories: [{ id: 'cat-uncategorized', name: '未分类', expanded: true }],
      articles: [],
      selectedArticleId: null,
      sidebarCollapsed: false,
      snapshotLoading: false,
    };

    useAppStore.setState({
      ...sidebarFixtureState,
      selectedView: 'all',
    });

    const container = document.createElement('div');
    let hydratedRoot: ReturnType<typeof hydrateRoot> | null = null;
    container.innerHTML = renderOnServer(<ReaderLayout initialSelectedView="feed-1" />);
    document.body.appendChild(container);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      window.history.replaceState({}, '', '/?view=feed-1');
      vi.resetModules();

      const { default: HydrationReaderLayout } = await import('../../../features/reader/components/ReaderLayout');
      const { useAppStore: hydrationAppStore } = await import('../../../store/appStore');
      const { useSettingsStore: hydrationSettingsStore } = await import('../../../store/settingsStore');

      hydrationSettingsStore.setState((state) => ({
        ...state,
        persistedSettings: structuredClone(defaultPersistedSettings),
        sessionSettings: { ai: { apiKey: '', hasApiKey: false, clearApiKey: false }, rssValidation: {} },
        draft: null,
        validationErrors: {},
        settings: structuredClone(defaultPersistedSettings.appearance),
      }));
      hydrationAppStore.setState({
        ...sidebarFixtureState,
        selectedView: 'feed-1',
      });

      await act(async () => {
        hydratedRoot = hydrateRoot(container, <HydrationReaderLayout initialSelectedView="feed-1" />);
        await Promise.resolve();
      });
      await flushReaderLayoutUpdates();

      await waitFor(() => {
        const activeButtons = container.querySelectorAll('button[aria-current="true"]');
        expect(activeButtons).toHaveLength(1);
        expect(screen.getByRole('button', { name: /Example Feed.*1/ })).toHaveAttribute(
          'aria-current',
          'true',
        );
        expect(screen.getByRole('button', { name: '全部文章' })).not.toHaveAttribute('aria-current');
      });

      const hydrationOutput = consoleErrorSpy.mock.calls
        .flatMap((call) => call.map((value) => String(value)))
        .join('\n');
      expect(hydrationOutput).not.toMatch(/hydration|didn't match|won't be patched up/i);
    } finally {
      if (hydratedRoot) {
        await act(async () => {
          hydratedRoot?.unmount();
          await Promise.resolve();
        });
      }
      consoleErrorSpy.mockRestore();
      window.history.replaceState({}, '', '/');
      container.remove();
    }
  });

  it('shows a back action from article detail to article list on mobile', async () => {
    resetSettingsStore();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });

    useAppStore.setState({
      feeds: [
        {
          id: 'feed-1',
          title: 'Example Feed',
          url: 'https://example.com/rss.xml',
          unreadCount: 1,
          enabled: true,
          fullTextOnOpenEnabled: false,
          aiSummaryOnOpenEnabled: false,
          categoryId: 'cat-uncategorized',
          category: '未分类',
        },
      ],
      articles: [
        {
          id: 'article-1',
          feedId: 'feed-1',
          title: 'Selected Article',
          content: '<p>content</p>',
          summary: 'summary',
          publishedAt: new Date().toISOString(),
          link: 'https://example.com/article-1',
          isRead: false,
          isStarred: false,
        },
      ],
      selectedView: 'all',
      selectedArticleId: 'article-1',
    });

    await renderWithNotificationsSettled();

    expect(screen.getByLabelText('返回文章列表')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByLabelText('返回文章列表'));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(useAppStore.getState().selectedArticleId).toBeNull();
    });
  });

  it('removes the old article top spacer on non-desktop layouts', async () => {
    resetSettingsStore();
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: READER_RESIZE_DESKTOP_MIN_WIDTH - 204,
    });

    useAppStore.setState({
      feeds: [
        {
          id: 'feed-1',
          title: 'Example Feed',
          url: 'https://example.com/rss.xml',
          unreadCount: 1,
          enabled: true,
          fullTextOnOpenEnabled: false,
          aiSummaryOnOpenEnabled: false,
          categoryId: 'cat-uncategorized',
          category: '未分类',
        },
      ],
      articles: [
        {
          id: 'article-1',
          feedId: 'feed-1',
          title: 'Selected Article',
          content: '<p>content</p>',
          summary: 'summary',
          publishedAt: new Date().toISOString(),
          link: 'https://example.com/article-1',
          isRead: false,
          isStarred: false,
        },
      ],
      selectedView: 'all',
      selectedArticleId: 'article-1',
    });

    await renderWithNotificationsSettled();

    await waitFor(() => {
      expect(screen.getByTestId('reader-non-desktop-topbar')).toBeInTheDocument();
      expect(screen.getByTestId('article-scroll-container')).toHaveAttribute(
        'data-reserve-top-space',
        'false',
      );
    });
  });


  it('highlights only one existing separator at a time on hover', async () => {
    resetSettingsStore();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });

    await renderWithNotificationsSettled();

    const feedPane = screen.getByTestId('reader-feed-pane');
    const articlePane = screen.getByTestId('reader-article-pane');
    const leftHandle = screen.getByTestId('reader-resize-handle-left');
    const middleHandle = screen.getByTestId('reader-resize-handle-middle');

    expect(feedPane.className).toContain('border-border');
    expect(articlePane.className).toContain('border-border');
    expect(feedPane.className).toContain('bg-muted/55');
    expect(articlePane.className).toContain('bg-muted/15');
    expect(feedPane.className).not.toContain('border-primary/60');
    expect(articlePane.className).not.toContain('border-primary/60');
    expect(leftHandle).toHaveAttribute('data-active', 'false');
    expect(middleHandle).toHaveAttribute('data-active', 'false');

    await act(async () => {
      fireEvent.pointerEnter(leftHandle);
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(feedPane.className).toContain('border-primary/60');
      expect(articlePane.className).not.toContain('border-primary/60');
      expect(leftHandle).toHaveAttribute('data-active', 'true');
      expect(middleHandle).toHaveAttribute('data-active', 'false');
    });

    await act(async () => {
      fireEvent.pointerEnter(middleHandle);
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(feedPane.className).not.toContain('border-primary/60');
      expect(articlePane.className).toContain('border-primary/60');
      expect(leftHandle).toHaveAttribute('data-active', 'false');
      expect(middleHandle).toHaveAttribute('data-active', 'true');
    });

    await act(async () => {
      fireEvent.pointerLeave(middleHandle);
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(feedPane.className).not.toContain('border-primary/60');
      expect(articlePane.className).not.toContain('border-primary/60');
      expect(leftHandle).toHaveAttribute('data-active', 'false');
      expect(middleHandle).toHaveAttribute('data-active', 'false');
    });
  });

});
