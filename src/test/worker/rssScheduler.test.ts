import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:dns/promises', () => {
  const lookup = vi.fn();
  return {
    lookup,
    default: { lookup },
  };
});

import { lookup } from 'node:dns/promises';
import { isFeedDue, isFeedUrlSafeForFetch } from '../../worker/rssScheduler';

describe('isFeedDue', () => {
  it('returns true when fetchIntervalMinutes is non-positive', () => {
    const now = new Date('2026-03-01T01:00:00.000Z');
    expect(isFeedDue({ lastFetchedAt: null, fetchIntervalMinutes: 0 }, now)).toBe(true);
    expect(isFeedDue({ lastFetchedAt: null, fetchIntervalMinutes: -1 }, now)).toBe(true);
  });

  it('returns true when lastFetchedAt is missing or invalid', () => {
    const now = new Date('2026-03-01T01:00:00.000Z');
    expect(isFeedDue({ lastFetchedAt: null, fetchIntervalMinutes: 60 }, now)).toBe(true);
    expect(isFeedDue({ lastFetchedAt: 'not-a-date', fetchIntervalMinutes: 60 }, now)).toBe(true);
  });

  it('returns false when feed is not due yet', () => {
    const now = new Date('2026-03-01T01:00:00.000Z');
    const lastFetchedAt = new Date('2026-03-01T00:30:00.000Z').toISOString();
    expect(isFeedDue({ lastFetchedAt, fetchIntervalMinutes: 60 }, now)).toBe(false);
  });

  it('returns true when feed is due', () => {
    const now = new Date('2026-03-01T01:00:00.000Z');
    const lastFetchedAt = new Date('2026-03-01T00:00:00.000Z').toISOString();
    expect(isFeedDue({ lastFetchedAt, fetchIntervalMinutes: 60 }, now)).toBe(true);
  });
});

describe('isFeedUrlSafeForFetch', () => {
  const lookupMock = vi.mocked(lookup);

  beforeEach(() => {
    lookupMock.mockReset();
  });

  it('allows public-looking feed hostnames when local DNS lookup fails', async () => {
    lookupMock.mockRejectedValue(new Error('getaddrinfo ENOTFOUND openai.com'));

    await expect(isFeedUrlSafeForFetch('https://openai.com/news/rss.xml')).resolves.toBe(true);
  });

  it('allows public feed hostnames that resolve to proxy placeholder addresses', async () => {
    lookupMock.mockResolvedValue([{ address: '198.18.0.132', family: 4 }]);

    await expect(isFeedUrlSafeForFetch('https://openai.com/news/rss.xml')).resolves.toBe(true);
  });

  it('still rejects reserved hostnames when local DNS lookup fails', async () => {
    lookupMock.mockRejectedValue(new Error('getaddrinfo ENOTFOUND internal.test'));

    await expect(isFeedUrlSafeForFetch('https://internal.test/feed')).resolves.toBe(false);
  });
});

