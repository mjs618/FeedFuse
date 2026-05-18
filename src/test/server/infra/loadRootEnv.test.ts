import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { loadRootEnvFileIfPresent } from '@/server/infra/loadRootEnv';

const touchedEnvKeys: string[] = [];
const tempDirs: string[] = [];

async function writeTempEnv(content: string) {
  const dir = await mkdtemp(path.join(tmpdir(), 'feedfuse-runtime-env-'));
  tempDirs.push(dir);
  const file = path.join(dir, '.env');
  await writeFile(file, content, 'utf8');
  return file;
}

describe('loadRootEnvFileIfPresent', () => {
  afterEach(async () => {
    for (const key of touchedEnvKeys.splice(0)) {
      delete process.env[key];
    }
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('loads root env values without replacing existing process values', async () => {
    const envFile = await writeTempEnv([
      'FEEDFUSE_RUNTIME_DATABASE_URL=postgresql://from-file',
      'FEEDFUSE_RUNTIME_EXISTING=from-file',
      'export FEEDFUSE_RUNTIME_QUOTED="quoted value"',
      'FEEDFUSE_RUNTIME_COMMENT=value # comment',
    ].join('\n'));
    touchedEnvKeys.push(
      'FEEDFUSE_RUNTIME_DATABASE_URL',
      'FEEDFUSE_RUNTIME_EXISTING',
      'FEEDFUSE_RUNTIME_QUOTED',
      'FEEDFUSE_RUNTIME_COMMENT',
    );
    process.env.FEEDFUSE_RUNTIME_EXISTING = 'from-process';

    loadRootEnvFileIfPresent(envFile);

    expect(process.env.FEEDFUSE_RUNTIME_DATABASE_URL).toBe('postgresql://from-file');
    expect(process.env.FEEDFUSE_RUNTIME_EXISTING).toBe('from-process');
    expect(process.env.FEEDFUSE_RUNTIME_QUOTED).toBe('quoted value');
    expect(process.env.FEEDFUSE_RUNTIME_COMMENT).toBe('value');
  });
});
