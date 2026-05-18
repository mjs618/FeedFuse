import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchHtmlMock = vi.hoisted(() => vi.fn());
const gotPostMock = vi.hoisted(() => vi.fn());

vi.mock('@/server/infra/http/externalHttpClient', () => ({
  fetchHtml: (...args: unknown[]) => fetchHtmlMock(...args),
}));

vi.mock('got', () => ({
  default: {
    post: (...args: unknown[]) => gotPostMock(...args),
  },
}));

import {
  getGoogleNewsArticleId,
  parseGoogleNewsBatchExecuteResponse,
  resolveGoogleNewsArticleUrl,
} from '@/server/integrations/fulltext/googleNewsUrlResolver';

describe('googleNewsUrlResolver', () => {
  beforeEach(() => {
    fetchHtmlMock.mockReset();
    gotPostMock.mockReset();
  });

  it('extracts ids from Google News RSS article and read URLs', () => {
    expect(getGoogleNewsArticleId('https://news.google.com/rss/articles/CBMi-example?oc=5')).toBe('CBMi-example');
    expect(getGoogleNewsArticleId('https://news.google.com/articles/CBMi-example?hl=en-US')).toBe('CBMi-example');
    expect(getGoogleNewsArticleId('https://news.google.com/read/CBMi-example')).toBe('CBMi-example');
    expect(getGoogleNewsArticleId('https://example.com/rss/articles/CBMi-example?oc=5')).toBeNull();
  });

  it('parses original article URL from Google News batchexecute response', () => {
    const body = `)]}'\n\n${JSON.stringify([
      [
        'wrb.fr',
        'Fbv4je',
        JSON.stringify(['garturlres', 'https://example.com/a?x=1&y=2', 1]),
        null,
        null,
        null,
        'generic',
      ],
    ])}`;

    expect(parseGoogleNewsBatchExecuteResponse(body)).toBe('https://example.com/a?x=1&y=2');
  });

  it('fetches the original Google News URL to extract signed decode params', async () => {
    const googleNewsUrl = 'https://news.google.com/rss/articles/CBMi-example?oc=5';
    fetchHtmlMock.mockResolvedValue({
      status: 200,
      finalUrl: googleNewsUrl,
      contentType: 'text/html',
      html: '<div data-n-a-id="CBMi-example" data-n-a-ts="1778911725" data-n-a-sg="signature"></div>',
    });
    gotPostMock.mockResolvedValue({
      statusCode: 200,
      body: `)]}'\n\n${JSON.stringify([
        [
          'wrb.fr',
          'Fbv4je',
          JSON.stringify(['garturlres', 'https://example.com/original', 1]),
          null,
          null,
          null,
          'generic',
        ],
      ])}`,
    });

    await expect(
      resolveGoogleNewsArticleUrl({
        url: googleNewsUrl,
        timeoutMs: 1000,
        userAgent: 'test-agent',
      }),
    ).resolves.toBe('https://example.com/original');

    expect(fetchHtmlMock).toHaveBeenCalledWith(
      googleNewsUrl,
      expect.objectContaining({
        timeoutMs: 1000,
        userAgent: 'test-agent',
        maxBytes: 1024 * 1024,
      }),
    );
  });
});
