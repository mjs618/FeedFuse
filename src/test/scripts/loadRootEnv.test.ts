import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { loadEnvFileIfPresent } from '../../../scripts/db/loadEnvFile.mjs';

const touchedEnvKeys: string[] = [];
const tempDirs: string[] = [];

async function writeTempEnv(content: string) {
  const dir = await mkdtemp(path.join(tmpdir(), 'feedfuse-env-'));
  tempDirs.push(dir);
  const file = path.join(dir, '.env');
  await writeFile(file, content, 'utf8');
  return file;
}

describe('loadEnvFileIfPresent', () => {
  afterEach(async () => {
    for (const key of touchedEnvKeys.splice(0)) {
      delete process.env[key];
    }
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('loads key-value pairs from an env file without overwriting existing process env', async () => {
    const envFile = await writeTempEnv([
      'FEEDFUSE_TEST_DATABASE_URL=postgresql://from-file',
      'FEEDFUSE_TEST_EXISTING=from-file',
    ].join('\n'));
    touchedEnvKeys.push('FEEDFUSE_TEST_DATABASE_URL', 'FEEDFUSE_TEST_EXISTING');
    process.env.FEEDFUSE_TEST_EXISTING = 'from-process';

    loadEnvFileIfPresent(envFile);

    expect(process.env.FEEDFUSE_TEST_DATABASE_URL).toBe('postgresql://from-file');
    expect(process.env.FEEDFUSE_TEST_EXISTING).toBe('from-process');
  });
});
