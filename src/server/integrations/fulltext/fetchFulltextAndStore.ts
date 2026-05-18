import type { Pool } from 'pg';
import { getArticleById, setArticleFulltext, setArticleFulltextError } from '@/server/domains/articles/repositories/articlesRepo';
import { getAppSettings } from '@/server/domains/settings/repositories/settingsRepo';
import { fetchHtml } from '@/server/infra/http/externalHttpClient';
import { sanitizeContent } from '@/server/integrations/rss/sanitizeContent';
import { isSafeExternalUrl } from '@/server/integrations/rss/ssrfGuard';
import { extractFulltext } from '@/server/integrations/fulltext/extractFulltext';
import {
  FULLTEXT_VERIFICATION_REQUIRED_ERROR,
  getUsableFulltextHtml,
  isFulltextVerificationPage,
} from '@/server/integrations/fulltext/fulltextVerification';
import { resolveGoogleNewsArticleUrl } from '@/server/integrations/fulltext/googleNewsUrlResolver';

const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MIN_RSS_FULLTEXT_FALLBACK_CHARS = 2000;
const FULLTEXT_URL_SAFETY_OPTIONS = {
  allowProxyResolvedHostname: true,
  allowUnresolvedHostname: true,
} as const;

function isHtmlContentType(value: string | null): boolean {
  return typeof value === 'string' && value.toLowerCase().includes('text/html');
}

function toShortErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const name = typeof (err as { name?: unknown }).name === 'string' ? (err as { name: string }).name : '';
    if (name === 'AbortError') return 'timeout';
    const msg = err.message?.trim();
    return msg ? msg : 'Unknown error';
  }
  return 'Unknown error';
}

function assertNotVerificationPage(input: {
  html: string;
  sourceUrl: string | null;
}): void {
  if (isFulltextVerificationPage(input)) {
    throw new Error(FULLTEXT_VERIFICATION_REQUIRED_ERROR);
  }
}

async function storeRssFulltextFallback(input: {
  pool: Pool;
  articleId: string;
  rssHtml: string | null | undefined;
  sourceUrl: string | null;
  baseUrl: string;
}): Promise<boolean> {
  const rssFallbackHtml = input.rssHtml?.trim() ?? '';
  if (rssFallbackHtml.length < MIN_RSS_FULLTEXT_FALLBACK_CHARS) return false;

  const sanitized = sanitizeContent(rssFallbackHtml, { baseUrl: input.baseUrl });
  if (!sanitized) return false;

  assertNotVerificationPage({ html: sanitized, sourceUrl: input.sourceUrl });
  await setArticleFulltext(input.pool, input.articleId, {
    contentFullHtml: sanitized,
    sourceUrl: input.sourceUrl,
  });
  return true;
}

export async function fetchFulltextAndStore(pool: Pool, articleId: string): Promise<void> {
  const article = await getArticleById(pool, articleId);
  if (!article) return;

  if (getUsableFulltextHtml(article)) return;

  const link = article.link?.trim() ?? '';
  if (!link) {
    await setArticleFulltextError(pool, articleId, { error: 'Missing link', sourceUrl: null });
    return;
  }

  if (!(await isSafeExternalUrl(link, FULLTEXT_URL_SAFETY_OPTIONS))) {
    try {
      if (
        await storeRssFulltextFallback({
          pool,
          articleId,
          rssHtml: article.contentHtml,
          sourceUrl: link,
          baseUrl: link,
        })
      ) {
        return;
      }
    } catch {
      // Fall through to the original unsafe URL error when the RSS fallback is unusable.
    }
    await setArticleFulltextError(pool, articleId, { error: 'Unsafe URL', sourceUrl: link });
    return;
  }

  const settings = await getAppSettings(pool);

  let fetchUrl = link;
  let sourceUrl: string | null = link;

  try {
    let resolvedGoogleNewsUrl: string | null = null;
    try {
      resolvedGoogleNewsUrl = await resolveGoogleNewsArticleUrl({
        url: link,
        timeoutMs: settings.rssTimeoutMs,
        userAgent: settings.rssUserAgent,
      });
    } catch {
      resolvedGoogleNewsUrl = null;
    }

    if (resolvedGoogleNewsUrl) {
      if (!(await isSafeExternalUrl(resolvedGoogleNewsUrl, FULLTEXT_URL_SAFETY_OPTIONS))) {
        throw new Error('Unsafe URL');
      }
      fetchUrl = resolvedGoogleNewsUrl;
      sourceUrl = resolvedGoogleNewsUrl;
    }

    const res = await fetchHtml(fetchUrl, {
      timeoutMs: settings.rssTimeoutMs,
      userAgent: settings.rssUserAgent,
      maxBytes: MAX_HTML_BYTES,
      logging: {
        source: 'server/fulltext/fetchFulltextAndStore',
        requestLabel: 'Fulltext fetch',
        context: {
          articleId,
          articleLink: link,
          fetchUrl,
        },
      },
    });

    sourceUrl = res.finalUrl || sourceUrl;

    if (!(await isSafeExternalUrl(sourceUrl, FULLTEXT_URL_SAFETY_OPTIONS))) {
      throw new Error('Unsafe URL');
    }

    if (res.status < 200 || res.status >= 300) {
      throw new Error(`HTTP ${res.status}`);
    }

    if (!isHtmlContentType(res.contentType)) {
      throw new Error('Non-HTML response');
    }

    const html = res.html;
    assertNotVerificationPage({ html, sourceUrl });

    const extracted = extractFulltext({ html, url: sourceUrl });
    if (!extracted?.contentHtml) {
      throw new Error('Readability parse failed');
    }

    const sanitized = sanitizeContent(extracted.contentHtml, { baseUrl: sourceUrl });
    if (!sanitized) {
      throw new Error('Empty content');
    }
    assertNotVerificationPage({ html: sanitized, sourceUrl });

    await setArticleFulltext(pool, articleId, {
      contentFullHtml: sanitized,
      sourceUrl,
    });
  } catch (err) {
    try {
      if (
        await storeRssFulltextFallback({
          pool,
          articleId,
          rssHtml: article.contentHtml,
          sourceUrl,
          baseUrl: sourceUrl ?? link,
        })
      ) {
        return;
      }
    } catch {
      // Preserve the original fetch error when the RSS fallback is also unusable.
    }

    await setArticleFulltextError(pool, articleId, {
      error: toShortErrorMessage(err),
      sourceUrl,
    });
  }
}
