import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('package scripts', () => {
  it('keeps dev script portable across Windows and POSIX shells', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.dev).not.toMatch(/^[A-Z0-9_]+=.+\s/);
    expect(packageJson.scripts?.dev).toContain('next dev');
  });
});
