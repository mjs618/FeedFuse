import { beforeEach, describe, expect, it, vi } from 'vitest';

const getArticleByIdMock = vi.fn();
const setArticleFulltextMock = vi.fn();
const setArticleFulltextErrorMock = vi.fn();
const getAppSettingsMock = vi.fn();
const isSafeExternalUrlMock = vi.fn();
const sanitizeContentMock = vi.fn();
const extractFulltextMock = vi.fn();
const fetchHtmlMock = vi.fn();
const resolveGoogleNewsArticleUrlMock = vi.fn();

vi.mock('@/server/domains/articles/repositories/articlesRepo', () => ({
  getArticleById: (...args: unknown[]) => getArticleByIdMock(...args),
  setArticleFulltext: (...args: unknown[]) => setArticleFulltextMock(...args),
  setArticleFulltextError: (...args: unknown[]) => setArticleFulltextErrorMock(...args),
}));

vi.mock('@/server/domains/settings/repositories/settingsRepo', () => ({
  getAppSettings: (...args: unknown[]) => getAppSettingsMock(...args),
}));

vi.mock('@/server/integrations/rss/ssrfGuard', () => ({
  isSafeExternalUrl: (...args: unknown[]) => isSafeExternalUrlMock(...args),
}));

vi.mock('@/server/integrations/rss/sanitizeContent', () => ({
  sanitizeContent: (...args: unknown[]) => sanitizeContentMock(...args),
}));

vi.mock('@/server/integrations/fulltext/extractFulltext', () => ({
  extractFulltext: (...args: unknown[]) => extractFulltextMock(...args),
}));

vi.mock('@/server/infra/http/externalHttpClient', () => ({
  fetchHtml: (...args: unknown[]) => fetchHtmlMock(...args),
}));

vi.mock('@/server/integrations/fulltext/googleNewsUrlResolver', () => ({
  resolveGoogleNewsArticleUrl: (...args: unknown[]) => resolveGoogleNewsArticleUrlMock(...args),
}));

const challengeUrl =
  'https://mp.weixin.qq.com/mp/wappoc_appmsgcaptcha?poc_token=test&target_url=https%3A%2F%2Fmp.weixin.qq.com%2Fs%2Fabc';
const challengeHtml = `
  <div class="weui-msg">
    <div class="weui-msg__text-area">
      <h2 class="weui-msg__title">环境异常</h2>
      <p class="weui-msg__desc">当前环境异常，完成验证后即可继续访问。</p>
    </div>
  </div>
`;
const cloudflareChallengeHtml = `
  <html>
    <head>
      <title>Just a moment...</title>
    </head>
    <body>
      <main>
        <h1>Verify you are human</h1>
        <p>Complete the security check to access example.com</p>
        <div>Cloudflare Ray ID: 1234567890abcdef</div>
      </main>
    </body>
  </html>
`;

describe('fetchFulltextAndStore', () => {
  beforeEach(() => {
    getArticleByIdMock.mockReset();
    setArticleFulltextMock.mockReset();
    setArticleFulltextErrorMock.mockReset();
    getAppSettingsMock.mockReset();
    isSafeExternalUrlMock.mockReset();
    sanitizeContentMock.mockReset();
    extractFulltextMock.mockReset();
    fetchHtmlMock.mockReset();
    resolveGoogleNewsArticleUrlMock.mockReset();
    resolveGoogleNewsArticleUrlMock.mockResolvedValue(null);
    vi.unstubAllGlobals();
  });

  it('fetches html and stores sanitized content', async () => {
    const pool = {};

    getArticleByIdMock.mockResolvedValue({
      id: 'article-1',
      link: 'https://example.com/a',
      contentFullHtml: null,
    });
    getAppSettingsMock.mockResolvedValue({ rssTimeoutMs: 1000, rssUserAgent: 'test-agent' });
    isSafeExternalUrlMock.mockResolvedValue(true);
    extractFulltextMock.mockReturnValue({ contentHtml: '<main><p>World</p></main>', title: null });
    sanitizeContentMock.mockReturnValue('<p>World</p>');

    fetchHtmlMock.mockResolvedValue({
      status: 200,
      finalUrl: 'https://example.com/a',
      contentType: 'text/html; charset=utf-8',
      html: '<html><body><main><p>World</p></main></body></html>',
    });

    const mod = (await import('@/server/integrations/fulltext/fetchFulltextAndStore')) as typeof import('@/server/integrations/fulltext/fetchFulltextAndStore');
    await mod.fetchFulltextAndStore(pool as never, 'article-1');

    expect(fetchHtmlMock).toHaveBeenCalledWith(
      'https://example.com/a',
      expect.objectContaining({
        timeoutMs: 1000,
        userAgent: 'test-agent',
        maxBytes: 2 * 1024 * 1024,
        logging: {
          source: 'server/fulltext/fetchFulltextAndStore',
          requestLabel: 'Fulltext fetch',
          context: {
            articleId: 'article-1',
            articleLink: 'https://example.com/a',
            fetchUrl: 'https://example.com/a',
          },
        },
      }),
    );
    expect(isSafeExternalUrlMock).toHaveBeenCalledWith('https://example.com/a', {
      allowProxyResolvedHostname: true,
      allowUnresolvedHostname: true,
    });
    expect(setArticleFulltextMock).toHaveBeenCalledWith(pool, 'article-1', {
      contentFullHtml: '<p>World</p>',
      sourceUrl: 'https://example.com/a',
    });
    expect(setArticleFulltextErrorMock).not.toHaveBeenCalled();
  });

  it('fetches the original article when a Google News link resolves', async () => {
    const pool = {};

    getArticleByIdMock.mockResolvedValue({
      id: 'article-1',
      link: 'https://news.google.com/rss/articles/CBMi-example?oc=5',
      contentFullHtml: null,
    });
    getAppSettingsMock.mockResolvedValue({ rssTimeoutMs: 1000, rssUserAgent: 'test-agent' });
    isSafeExternalUrlMock.mockResolvedValue(true);
    resolveGoogleNewsArticleUrlMock.mockResolvedValue('https://example.com/original');
    extractFulltextMock.mockReturnValue({ contentHtml: '<main><p>Resolved</p></main>', title: null });
    sanitizeContentMock.mockReturnValue('<p>Resolved</p>');

    fetchHtmlMock.mockResolvedValue({
      status: 200,
      finalUrl: 'https://example.com/original',
      contentType: 'text/html; charset=utf-8',
      html: '<html><body><main><p>Resolved</p></main></body></html>',
    });

    const mod = (await import('@/server/integrations/fulltext/fetchFulltextAndStore')) as typeof import('@/server/integrations/fulltext/fetchFulltextAndStore');
    await mod.fetchFulltextAndStore(pool as never, 'article-1');

    expect(resolveGoogleNewsArticleUrlMock).toHaveBeenCalledWith({
      url: 'https://news.google.com/rss/articles/CBMi-example?oc=5',
      timeoutMs: 1000,
      userAgent: 'test-agent',
    });
    expect(isSafeExternalUrlMock).toHaveBeenCalledWith('https://example.com/original', {
      allowProxyResolvedHostname: true,
      allowUnresolvedHostname: true,
    });
    expect(fetchHtmlMock).toHaveBeenCalledWith(
      'https://example.com/original',
      expect.objectContaining({
        logging: expect.objectContaining({
          context: {
            articleId: 'article-1',
            articleLink: 'https://news.google.com/rss/articles/CBMi-example?oc=5',
            fetchUrl: 'https://example.com/original',
          },
        }),
      }),
    );
    expect(setArticleFulltextMock).toHaveBeenCalledWith(pool, 'article-1', {
      contentFullHtml: '<p>Resolved</p>',
      sourceUrl: 'https://example.com/original',
    });
    expect(setArticleFulltextErrorMock).not.toHaveBeenCalled();
  });

  it('stores error instead of saving upstream verification pages as fulltext', async () => {
    const pool = {};

    getArticleByIdMock.mockResolvedValue({
      id: 'article-1',
      link: 'https://mp.weixin.qq.com/s/abc',
      contentFullHtml: null,
      contentFullSourceUrl: null,
    });
    getAppSettingsMock.mockResolvedValue({ rssTimeoutMs: 1000, rssUserAgent: 'test-agent' });
    isSafeExternalUrlMock.mockResolvedValue(true);
    fetchHtmlMock.mockResolvedValue({
      status: 200,
      finalUrl: challengeUrl,
      contentType: 'text/html; charset=utf-8',
      html: challengeHtml,
    });

    const mod = (await import('@/server/integrations/fulltext/fetchFulltextAndStore')) as typeof import('@/server/integrations/fulltext/fetchFulltextAndStore');
    await mod.fetchFulltextAndStore(pool as never, 'article-1');

    expect(extractFulltextMock).not.toHaveBeenCalled();
    expect(setArticleFulltextMock).not.toHaveBeenCalled();
    expect(setArticleFulltextErrorMock).toHaveBeenCalledWith(pool, 'article-1', {
      error: 'Verification required',
      sourceUrl: challengeUrl,
    });
  });

  it('stores verification error for generic anti-bot challenge pages', async () => {
    const pool = {};

    getArticleByIdMock.mockResolvedValue({
      id: 'article-1',
      link: 'https://example.com/protected',
      contentFullHtml: null,
      contentFullSourceUrl: null,
    });
    getAppSettingsMock.mockResolvedValue({ rssTimeoutMs: 1000, rssUserAgent: 'test-agent' });
    isSafeExternalUrlMock.mockResolvedValue(true);
    fetchHtmlMock.mockResolvedValue({
      status: 200,
      finalUrl: 'https://example.com/protected',
      contentType: 'text/html; charset=utf-8',
      html: cloudflareChallengeHtml,
    });

    const mod = (await import('@/server/integrations/fulltext/fetchFulltextAndStore')) as typeof import('@/server/integrations/fulltext/fetchFulltextAndStore');
    await mod.fetchFulltextAndStore(pool as never, 'article-1');

    expect(extractFulltextMock).not.toHaveBeenCalled();
    expect(setArticleFulltextMock).not.toHaveBeenCalled();
    expect(setArticleFulltextErrorMock).toHaveBeenCalledWith(pool, 'article-1', {
      error: 'Verification required',
      sourceUrl: 'https://example.com/protected',
    });
  });

  it('stores long RSS content as a fallback when fulltext fetching fails', async () => {
    const pool = {};
    const longRssContent = `<article>${'<p>RSS paragraph with useful article text.</p>'.repeat(80)}</article>`;

    getArticleByIdMock.mockResolvedValue({
      id: 'article-1',
      link: 'https://example.com/protected',
      contentHtml: longRssContent,
      contentFullHtml: null,
      contentFullSourceUrl: null,
    });
    getAppSettingsMock.mockResolvedValue({ rssTimeoutMs: 1000, rssUserAgent: 'test-agent' });
    isSafeExternalUrlMock.mockResolvedValue(true);
    fetchHtmlMock.mockResolvedValue({
      status: 403,
      finalUrl: 'https://example.com/protected',
      contentType: 'text/html; charset=utf-8',
      html: '<html><body>Forbidden</body></html>',
    });
    sanitizeContentMock.mockReturnValue('<p>RSS fallback article</p>');

    const mod = (await import('@/server/integrations/fulltext/fetchFulltextAndStore')) as typeof import('@/server/integrations/fulltext/fetchFulltextAndStore');
    await mod.fetchFulltextAndStore(pool as never, 'article-1');

    expect(sanitizeContentMock).toHaveBeenCalledWith(longRssContent, {
      baseUrl: 'https://example.com/protected',
    });
    expect(setArticleFulltextMock).toHaveBeenCalledWith(pool, 'article-1', {
      contentFullHtml: '<p>RSS fallback article</p>',
      sourceUrl: 'https://example.com/protected',
    });
    expect(setArticleFulltextErrorMock).not.toHaveBeenCalled();
  });

  it('stores long RSS content as a fallback when the article URL is unsafe', async () => {
    const pool = {};
    const longRssContent = `<article>${'<p>RSS paragraph with useful article text.</p>'.repeat(80)}</article>`;

    getArticleByIdMock.mockResolvedValue({
      id: 'article-1',
      link: 'https://localhost/protected',
      contentHtml: longRssContent,
      contentFullHtml: null,
      contentFullSourceUrl: null,
    });
    isSafeExternalUrlMock.mockResolvedValue(false);
    sanitizeContentMock.mockReturnValue('<p>RSS fallback article</p>');

    const mod = (await import('@/server/integrations/fulltext/fetchFulltextAndStore')) as typeof import('@/server/integrations/fulltext/fetchFulltextAndStore');
    await mod.fetchFulltextAndStore(pool as never, 'article-1');

    expect(fetchHtmlMock).not.toHaveBeenCalled();
    expect(setArticleFulltextMock).toHaveBeenCalledWith(pool, 'article-1', {
      contentFullHtml: '<p>RSS fallback article</p>',
      sourceUrl: 'https://localhost/protected',
    });
    expect(setArticleFulltextErrorMock).not.toHaveBeenCalled();
  });

  it('refetches when the stored fulltext is only a verification page', async () => {
    const pool = {};

    getArticleByIdMock.mockResolvedValue({
      id: 'article-1',
      link: 'https://mp.weixin.qq.com/s/abc',
      contentFullHtml: '<h2>环境异常</h2><p>当前环境异常，完成验证后即可继续访问。</p>',
      contentFullSourceUrl: challengeUrl,
    });
    getAppSettingsMock.mockResolvedValue({ rssTimeoutMs: 1000, rssUserAgent: 'test-agent' });
    isSafeExternalUrlMock.mockResolvedValue(true);
    fetchHtmlMock.mockResolvedValue({
      status: 200,
      finalUrl: 'https://example.com/a',
      contentType: 'text/html; charset=utf-8',
      html: '<html><body><main><p>Recovered</p></main></body></html>',
    });
    extractFulltextMock.mockReturnValue({
      contentHtml: '<main><p>Recovered</p></main>',
      title: null,
    });
    sanitizeContentMock.mockReturnValue('<p>Recovered</p>');

    const mod = (await import('@/server/integrations/fulltext/fetchFulltextAndStore')) as typeof import('@/server/integrations/fulltext/fetchFulltextAndStore');
    await mod.fetchFulltextAndStore(pool as never, 'article-1');

    expect(fetchHtmlMock).toHaveBeenCalledTimes(1);
    expect(setArticleFulltextMock).toHaveBeenCalledWith(pool, 'article-1', {
      contentFullHtml: '<p>Recovered</p>',
      sourceUrl: 'https://example.com/a',
    });
  });
});
