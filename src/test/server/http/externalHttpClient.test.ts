import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer as createHttpServer } from 'node:http';
import { createConnection, createServer as createNetServer } from 'node:net';
import type { AddressInfo } from 'node:net';

const pool = {};
const writeSystemLogMock = vi.hoisted(() => vi.fn());

vi.mock('@/server/infra/db/pool', () => ({
  getPool: () => pool,
}));

vi.mock('@/server/infra/logging/systemLogger', () => ({
  writeSystemLog: (...args: unknown[]) => writeSystemLogMock(...args),
}));

describe('externalHttpClient', () => {
  let closeServer: (() => Promise<void>) | null = null;
  let baseUrl = '';

  beforeEach(async () => {
    vi.resetModules();
    writeSystemLogMock.mockReset();

    const server = createHttpServer((req, res) => {
      if (req.url === '/rss.xml') {
        res.statusCode = 200;
        res.setHeader('content-type', 'application/rss+xml; charset=utf-8');
        res.setHeader('etag', 'W/"1"');
        res.setHeader('last-modified', 'Mon, 01 Jan 2024 00:00:00 GMT');
        res.end('<?xml version="1.0"?><rss><channel><title>Feed</title></channel></rss>');
        return;
      }

      if (req.url === '/error.json') {
        res.statusCode = 429;
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.end('{"error":{"message":"Rate limit exceeded"}}');
        return;
      }

      res.statusCode = 200;
      res.setHeader('content-type', 'text/plain; charset=utf-8');
      res.end('ok');
    });

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;

    closeServer = async () => {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    };
  });

  afterEach(async () => {
    await closeServer?.();
    vi.unstubAllEnvs();
  });

  it('fetchRssXml returns status/xml/etag/lastModified and logs success metadata', async () => {
    const { fetchRssXml } = await import('@/server/infra/http/externalHttpClient');
    const xmlUrl = `${baseUrl}/rss.xml`;

    const res = await fetchRssXml(
      xmlUrl,
      {
        timeoutMs: 1000,
        userAgent: 'test-agent',
        etag: null,
        lastModified: null,
        logging: {
          source: 'server/rss/fetchFeedXml',
          requestLabel: 'RSS fetch',
          context: { feedUrl: xmlUrl },
        },
      } as Parameters<typeof fetchRssXml>[1],
    );

    expect(res.status).toBe(200);
    expect(res.xml).toContain('<rss');
    expect(res.etag).toBe('W/"1"');
    expect(res.lastModified).toBe('Mon, 01 Jan 2024 00:00:00 GMT');
    expect(writeSystemLogMock).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({
        level: 'info',
        category: 'external_api',
        source: 'server/rss/fetchFeedXml',
        message: 'RSS fetch completed',
        details: null,
        context: expect.objectContaining({
          url: xmlUrl,
          method: 'GET',
          status: 200,
          feedUrl: xmlUrl,
          durationMs: expect.any(Number),
        }),
      }),
    );
  });

  it('writes upstream JSON error payload as raw details text', async () => {
    const { fetchRssXml } = await import('@/server/infra/http/externalHttpClient');
    const errorUrl = `${baseUrl}/error.json`;

    const res = await fetchRssXml(
      errorUrl,
      {
        timeoutMs: 1000,
        userAgent: 'test-agent',
        etag: null,
        lastModified: null,
        logging: {
          source: 'server/rss/fetchFeedXml',
          requestLabel: 'RSS fetch',
          context: { feedUrl: errorUrl },
        },
      } as Parameters<typeof fetchRssXml>[1],
    );

    expect(res.status).toBe(429);
    expect(writeSystemLogMock).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({
        level: 'error',
        category: 'external_api',
        source: 'server/rss/fetchFeedXml',
        message: 'RSS fetch failed',
        details: '{"error":{"message":"Rate limit exceeded"}}',
        context: expect.objectContaining({
          url: errorUrl,
          method: 'GET',
          status: 429,
          feedUrl: errorUrl,
          durationMs: expect.any(Number),
        }),
      }),
    );
  });

  it('routes RSS requests through FEEDFUSE_OUTBOUND_PROXY when configured', async () => {
    const proxyRequests: string[] = [];
    const proxyServer = createNetServer((clientSocket) => {
      clientSocket.once('data', (greeting) => {
        expect([...greeting]).toEqual([0x05, 0x01, 0x00]);
        clientSocket.write(Buffer.from([0x05, 0x00]));

        clientSocket.once('data', (request) => {
          expect(request[0]).toBe(0x05);
          expect(request[1]).toBe(0x01);
          const addressType = request[3];
          let offset = 4;
          let host = '';
          if (addressType === 0x01) {
            host = [...request.subarray(offset, offset + 4)].join('.');
            offset += 4;
          } else if (addressType === 0x03) {
            const length = request[offset];
            offset += 1;
            host = request.subarray(offset, offset + length).toString('utf8');
            offset += length;
          }
          const port = request.readUInt16BE(offset);
          proxyRequests.push(`${host}:${port}`);

          const upstream = createConnection(port, host);
          upstream.once('connect', () => {
            clientSocket.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
            clientSocket.pipe(upstream);
            upstream.pipe(clientSocket);
          });
          upstream.once('error', () => {
            clientSocket.write(Buffer.from([0x05, 0x01, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
            clientSocket.destroy();
          });
        });
      });
    });

    await new Promise<void>((resolve) => proxyServer.listen(0, '127.0.0.1', resolve));
    const { port } = proxyServer.address() as AddressInfo;
    vi.stubEnv('FEEDFUSE_OUTBOUND_PROXY', `socks5://127.0.0.1:${port}`);

    try {
      const { fetchRssXml } = await import('@/server/infra/http/externalHttpClient');
      const res = await fetchRssXml(`${baseUrl}/rss.xml`, {
        timeoutMs: 1000,
        userAgent: 'test-agent',
      });

      expect(res.status).toBe(200);
      expect(res.xml).toContain('<rss');
      expect(proxyRequests).toEqual([new URL(baseUrl).host]);
    } finally {
      await new Promise<void>((resolve, reject) =>
        proxyServer.close((err) => (err ? reject(err) : resolve())),
      );
    }
  });

  it('ignores blank FEEDFUSE_OUTBOUND_PROXY values', async () => {
    vi.stubEnv('FEEDFUSE_OUTBOUND_PROXY', '   ');

    const { fetchRssXml } = await import('@/server/infra/http/externalHttpClient');
    const res = await fetchRssXml(`${baseUrl}/rss.xml`, {
      timeoutMs: 1000,
      userAgent: 'test-agent',
    });

    expect(res.status).toBe(200);
    expect(res.xml).toContain('<rss');
  });

  it('rejects invalid FEEDFUSE_OUTBOUND_PROXY values with a stable error', async () => {
    vi.stubEnv('FEEDFUSE_OUTBOUND_PROXY', 'not a url');

    await expect(import('@/server/infra/http/externalHttpClient')).rejects.toThrow(
      'FEEDFUSE_OUTBOUND_PROXY must be a valid SOCKS proxy URL',
    );
  });

  it('rejects non-SOCKS FEEDFUSE_OUTBOUND_PROXY protocols', async () => {
    vi.stubEnv('FEEDFUSE_OUTBOUND_PROXY', 'http://127.0.0.1:1080');

    await expect(import('@/server/infra/http/externalHttpClient')).rejects.toThrow(
      'FEEDFUSE_OUTBOUND_PROXY must be a SOCKS proxy URL',
    );
  });
});
