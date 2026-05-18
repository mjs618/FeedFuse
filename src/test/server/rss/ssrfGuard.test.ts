import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:dns/promises', () => {
  const lookup = vi.fn();
  return {
    lookup,
    default: { lookup },
  };
});

import { lookup } from 'node:dns/promises';
import { isSafeExternalUrl } from '@/server/integrations/rss/ssrfGuard';

describe('ssrfGuard', () => {
  const lookupMock = vi.mocked(lookup);

  beforeEach(() => {
    lookupMock.mockReset();
  });

  it('accepts localhost ip', async () => {
    await expect(isSafeExternalUrl('http://127.0.0.1/feed')).resolves.toBe(true);
  });

  it('accepts localhost hostname', async () => {
    await expect(isSafeExternalUrl('http://localhost/feed')).resolves.toBe(true);
  });

  it('accepts Docker host alias', async () => {
    lookupMock.mockResolvedValue([{ address: '192.168.65.254', family: 4 }]);
    await expect(isSafeExternalUrl('http://host.docker.internal/feed')).resolves.toBe(true);
  });

  it('rejects non-http protocols', async () => {
    await expect(isSafeExternalUrl('ftp://example.com/feed')).resolves.toBe(false);
  });

  it('rejects urls with credentials', async () => {
    await expect(isSafeExternalUrl('https://user:pass@example.com/feed')).resolves.toBe(false);
  });

  it('rejects domains resolving to loopback', async () => {
    lookupMock.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    await expect(isSafeExternalUrl('https://internal.test/feed')).resolves.toBe(false);
  });

  it('accepts domains resolving to public ip', async () => {
    lookupMock.mockResolvedValue([{ address: '1.1.1.1', family: 4 }]);
    await expect(isSafeExternalUrl('https://public.test/feed')).resolves.toBe(true);
  });

  it('keeps rejecting unresolved hostnames by default', async () => {
    lookupMock.mockRejectedValue(new Error('getaddrinfo ENOTFOUND public.example'));
    await expect(isSafeExternalUrl('https://public.example/feed')).resolves.toBe(false);
  });

  it('accepts unresolved public hostnames when explicitly allowed', async () => {
    lookupMock.mockRejectedValue(new Error('getaddrinfo ENOTFOUND feeds.ruanyifeng.com'));
    await expect(
      isSafeExternalUrl('https://feeds.ruanyifeng.com/feed', {
        allowUnresolvedHostname: true,
      }),
    ).resolves.toBe(true);
  });

  it('rejects proxy placeholder addresses by default', async () => {
    lookupMock.mockResolvedValue([{ address: '198.18.0.132', family: 4 }]);
    await expect(isSafeExternalUrl('https://openai.com/news/rss.xml')).resolves.toBe(false);
  });

  it('accepts public hostnames resolving to proxy placeholder addresses when explicitly allowed', async () => {
    lookupMock.mockResolvedValue([{ address: '198.18.0.132', family: 4 }]);
    await expect(
      isSafeExternalUrl('https://openai.com/news/rss.xml', {
        allowProxyResolvedHostname: true,
      }),
    ).resolves.toBe(true);
  });

  it('keeps rejecting direct proxy placeholder ip urls', async () => {
    await expect(
      isSafeExternalUrl('https://198.18.0.132/feed', {
        allowProxyResolvedHostname: true,
      }),
    ).resolves.toBe(false);
  });

  it('rejects domains with any unsafe ip', async () => {
    lookupMock.mockResolvedValue([
      { address: '1.1.1.1', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ]);
    await expect(isSafeExternalUrl('https://mixed.test/feed')).resolves.toBe(false);
  });
});
