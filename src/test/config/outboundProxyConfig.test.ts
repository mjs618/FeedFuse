import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('outbound proxy config examples', () => {
  it('documents FEEDFUSE_OUTBOUND_PROXY in local and deploy env examples', () => {
    expect(readFileSync('.env.example', 'utf8')).toContain('FEEDFUSE_OUTBOUND_PROXY=');
    expect(readFileSync('deploy/.env.example', 'utf8')).toContain('FEEDFUSE_OUTBOUND_PROXY=');
  });

  it('passes FEEDFUSE_OUTBOUND_PROXY to web and worker compose services', () => {
    const localCompose = readFileSync('docker-compose.yml', 'utf8');
    const deployCompose = readFileSync('deploy/compose.yaml', 'utf8');

    expect(localCompose.match(/FEEDFUSE_OUTBOUND_PROXY:\s*\$\{FEEDFUSE_OUTBOUND_PROXY:-\}/g)).toHaveLength(2);
    expect(deployCompose.match(/FEEDFUSE_OUTBOUND_PROXY:\s*\$\{FEEDFUSE_OUTBOUND_PROXY:-\}/g)).toHaveLength(2);
  });
});
