import got from 'got';
import { fetchHtml } from '@/server/infra/http/externalHttpClient';

const GOOGLE_NEWS_HOSTNAME = 'news.google.com';
const GOOGLE_NEWS_RPC_URL = 'https://news.google.com/_/DotsSplashUi/data/batchexecute?rpcids=Fbv4je';
const GOOGLE_NEWS_MAX_HTML_BYTES = 1024 * 1024;

export function getGoogleNewsArticleId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.hostname !== GOOGLE_NEWS_HOSTNAME) return null;

  const match = parsed.pathname.match(/^\/(?:(?:rss\/)?articles|read)\/([^/?#]+)$/);
  const id = match?.[1]?.trim();
  return id ? id : null;
}

function extractSignedParams(html: string): { signature: string; timestamp: number } | null {
  const signature = html.match(/data-n-a-sg="([^"]+)"/)?.[1]?.trim();
  const timestampRaw = html.match(/data-n-a-ts="([^"]+)"/)?.[1]?.trim();
  const timestamp = timestampRaw ? Number(timestampRaw) : NaN;

  if (!signature || !Number.isFinite(timestamp)) return null;
  return { signature, timestamp };
}

export function parseGoogleNewsBatchExecuteResponse(body: string): string | null {
  const jsonText = body.replace(/^\)\]\}'\s*/, '').trim();

  try {
    const rows = JSON.parse(jsonText) as unknown;
    if (!Array.isArray(rows)) return null;

    for (const row of rows) {
      if (!Array.isArray(row) || row[0] !== 'wrb.fr' || typeof row[2] !== 'string') continue;
      const payload = JSON.parse(row[2]) as unknown;
      if (!Array.isArray(payload) || payload[0] !== 'garturlres' || typeof payload[1] !== 'string') continue;
      return payload[1];
    }
  } catch {
    return null;
  }

  return null;
}

function buildDecodeRequest(articleId: string, input: { signature: string; timestamp: number }): string {
  const request = [
    'garturlreq',
    [
      ['en-US', 'US', ['FINANCE_TOP_INDICES', 'WEB_TEST_1_0_0'], null, null, 1, 1, 'US:en', null, 1, null, null, null, null, null, 0, 1],
      'en-US',
      'US',
      1,
      [1, 1, 1],
      1,
      1,
      null,
      0,
      0,
      null,
      0,
    ],
    articleId,
    input.timestamp,
    input.signature,
  ];

  return JSON.stringify([[['Fbv4je', JSON.stringify(request), null, 'generic']]]);
}

export async function resolveGoogleNewsArticleUrl(input: {
  url: string;
  timeoutMs: number;
  userAgent: string;
}): Promise<string | null> {
  const articleId = getGoogleNewsArticleId(input.url);
  if (!articleId) return null;

  const page = await fetchHtml(input.url, {
    timeoutMs: input.timeoutMs,
    userAgent: input.userAgent,
    maxBytes: GOOGLE_NEWS_MAX_HTML_BYTES,
    headers: {
      referer: 'https://news.google.com/',
    },
  });

  if (page.status < 200 || page.status >= 300) return null;

  const params = extractSignedParams(page.html);
  if (!params) return null;

  const response = await got.post(GOOGLE_NEWS_RPC_URL, {
    body: new URLSearchParams({
      'f.req': buildDecodeRequest(articleId, params),
    }).toString(),
    headers: {
      'content-type': 'application/x-www-form-urlencoded;charset=utf-8',
      referer: 'https://news.google.com/',
      'user-agent': input.userAgent,
    },
    retry: { limit: 0 },
    throwHttpErrors: false,
    timeout: { request: input.timeoutMs },
  });

  if (response.statusCode < 200 || response.statusCode >= 300) return null;

  const decoded = parseGoogleNewsBatchExecuteResponse(response.body);
  if (!decoded) return null;

  try {
    const parsed = new URL(decoded);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}
