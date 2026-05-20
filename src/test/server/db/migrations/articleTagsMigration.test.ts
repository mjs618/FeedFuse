import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('article tags migration', () => {
  it('creates article tag and tagging tables with uniqueness and cascades', () => {
    const migrationPath = 'src/server/infra/db/migrations/0030_article_tags.sql';
    expect(existsSync(migrationPath)).toBe(true);

    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toContain('create table if not exists article_tags');
    expect(sql).toContain('id uuid primary key default gen_random_uuid()');
    expect(sql).toContain('name text not null');
    expect(sql).toContain('slug text not null');
    expect(sql).toContain('color text null');
    expect(sql).toContain('article_tags_name_lower_unique');
    expect(sql).toContain('on article_tags (lower(name))');
    expect(sql).toContain('article_tags_slug_unique');
    expect(sql).toContain('create table if not exists article_taggings');
    expect(sql).toContain('article_id bigint not null references articles(id) on delete cascade');
    expect(sql).toContain('tag_id uuid not null references article_tags(id) on delete cascade');
    expect(sql).toContain('primary key (article_id, tag_id)');
    expect(sql).toContain('article_taggings_tag_article_idx');
    expect(sql).toContain('on article_taggings (tag_id, article_id)');
  });
});
