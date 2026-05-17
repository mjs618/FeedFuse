import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('db migrations', () => {
  it('adds read later and archive workflow state to articles', () => {
    const migrationPath = 'src/server/infra/db/migrations/0029_article_read_later_archive.sql';
    expect(existsSync(migrationPath)).toBe(true);

    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toContain('add column if not exists is_read_later boolean not null default false');
    expect(sql).toContain('add column if not exists read_later_at timestamptz null');
    expect(sql).toContain('add column if not exists is_archived boolean not null default false');
    expect(sql).toContain('add column if not exists archived_at timestamptz null');
    expect(sql).toContain('articles_read_later_sort_published_id_idx');
    expect(sql).toContain("on articles ((coalesce(published_at, 'epoch'::timestamptz)) desc, id desc)");
    expect(sql).toContain('where is_read_later = true');
    expect(sql).toContain('articles_archived_sort_published_id_idx');
    expect(sql).toContain('where is_archived = true');
    expect(sql).not.toContain('articles_read_later_published_idx');
    expect(sql).not.toContain('articles_archived_published_idx');
  });
});
