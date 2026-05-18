import fs from 'node:fs';
import path from 'node:path';

function parseEnvValue(rawValue: string): string {
  const trimmed = rawValue.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  const hashIndex = trimmed.indexOf('#');
  return (hashIndex >= 0 ? trimmed.slice(0, hashIndex) : trimmed).trim();
}

export function loadRootEnvFileIfPresent(
  envFilePath = path.join(process.cwd(), '.env'),
): void {
  if (!fs.existsSync(envFilePath)) return;

  const content = fs.readFileSync(envFilePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const assignment = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed;
    const separatorIndex = assignment.indexOf('=');
    if (separatorIndex <= 0) continue;

    const key = assignment.slice(0, separatorIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || process.env[key] !== undefined) continue;

    process.env[key] = parseEnvValue(assignment.slice(separatorIndex + 1));
  }
}
