import type { Pool, PoolClient } from 'pg';

import { isTagColorPreset } from '@/lib/reader/tagColors';

export const TAG_NAME_MAX_LENGTH = 64;

export interface ArticleTagRow {
  id: string;
  name: string;
  slug: string;
  color: string | null;
}

export interface ReaderTagRow extends ArticleTagRow {
  articleCount: number;
}

export interface UpdateArticleTagPatch {
  name?: string;
  color?: string | null;
}

export interface DeleteArticleTagResult {
  removed: boolean;
  affectedArticleCount: number;
}

type DbClient = Pick<Pool, 'query'> | PoolClient;
type TransactionPool = Pick<Pool, 'connect'>;

export function normalizeTagName(input: string): string {
  return input.trim().replace(/\s+/g, ' ');
}

export function slugifyTagName(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, TAG_NAME_MAX_LENGTH) || 'tag'
  );
}

function assertValidTagName(name: string): void {
  if (!name) {
    throw new Error('Tag name is required');
  }

  if (name.length > TAG_NAME_MAX_LENGTH) {
    throw new Error('Tag name is too long');
  }
}

export async function listTagsWithVisibleArticleCounts(pool: DbClient): Promise<ReaderTagRow[]> {
  const { rows } = await pool.query<ReaderTagRow>(`
    select
      tags.id,
      tags.name,
      tags.slug,
      tags.color,
      count(articles.id)::int as "articleCount"
    from article_tags tags
    left join article_taggings taggings on taggings.tag_id = tags.id
    left join articles on articles.id = taggings.article_id
      and articles.is_archived = false
      and articles.filter_status = any('{passed,error}'::text[])
    group by tags.id
    having count(articles.id) > 0
    order by lower(tags.name), tags.name
  `);

  return rows;
}

export async function listTagsForArticle(pool: DbClient, articleId: string): Promise<ArticleTagRow[]> {
  const { rows } = await pool.query<ArticleTagRow>(
    `
      select tags.id, tags.name, tags.slug, tags.color
      from article_tags tags
      inner join article_taggings taggings on taggings.tag_id = tags.id
      where taggings.article_id = $1::bigint
      order by lower(tags.name), tags.name
    `,
    [articleId],
  );

  return rows;
}

export async function listTagsForArticles(
  pool: DbClient,
  articleIds: string[],
): Promise<Array<ArticleTagRow & { articleId: string }>> {
  if (articleIds.length === 0) return [];

  const { rows } = await pool.query<ArticleTagRow & { articleId: string }>(
    `
      select
        taggings.article_id::text as "articleId",
        tags.id,
        tags.name,
        tags.slug,
        tags.color
      from article_tags tags
      inner join article_taggings taggings on taggings.tag_id = tags.id
      where taggings.article_id = any($1::bigint[])
      order by lower(tags.name), tags.name
    `,
    [articleIds],
  );

  return rows;
}

export async function attachArticleTag(
  pool: TransactionPool,
  articleId: string,
  inputName: string,
): Promise<ArticleTagRow> {
  const name = normalizeTagName(inputName);
  assertValidTagName(name);

  const slug = slugifyTagName(name);
  const client = await pool.connect();

  try {
    await client.query('begin');
    const existing = await client.query<ArticleTagRow>(
      `
        select id, name, slug, color
        from article_tags
        where lower(name) = lower($1)
        limit 1
      `,
      [name],
    );

    let tag = existing.rows[0];
    if (!tag) {
      const inserted = await client.query<ArticleTagRow>(
        `
          insert into article_tags (name, slug)
          values ($1, $2)
          on conflict (slug) do update
          set updated_at = article_tags.updated_at
          returning id, name, slug, color
        `,
        [name, slug],
      );
      tag = inserted.rows[0];
    }

    if (!tag) {
      throw new Error('Tag could not be created');
    }

    await client.query(
      `
        insert into article_taggings (article_id, tag_id)
        values ($1::bigint, $2::uuid)
        on conflict (article_id, tag_id) do nothing
      `,
      [articleId, tag.id],
    );
    await client.query('commit');

    return tag;
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

export async function detachArticleTag(
  pool: DbClient,
  articleId: string,
  tagId: string,
): Promise<{ removed: true }> {
  await pool.query(
    `
      delete from article_taggings
      where article_id = $1::bigint and tag_id = $2::uuid
    `,
    [articleId, tagId],
  );

  return { removed: true };
}

export async function updateArticleTag(
  pool: DbClient,
  tagId: string,
  patch: UpdateArticleTagPatch,
): Promise<ArticleTagRow | null> {
  const hasName = Object.prototype.hasOwnProperty.call(patch, 'name');
  const hasColor = Object.prototype.hasOwnProperty.call(patch, 'color');

  if (!hasName && !hasColor) {
    throw new Error('At least one tag field is required');
  }

  const setParts: string[] = [];
  const params: unknown[] = [];

  if (hasName) {
    const name = normalizeTagName(patch.name ?? '');
    assertValidTagName(name);
    const slug = slugifyTagName(name);

    params.push(name);
    setParts.push(`name = $${params.length}`);
    params.push(slug);
    setParts.push(`slug = $${params.length}`);
  }

  if (hasColor) {
    const color = patch.color ?? null;
    if (color !== null && !isTagColorPreset(color)) {
      throw new Error('Tag color is invalid');
    }

    params.push(color);
    setParts.push(`color = $${params.length}`);
  }

  params.push(tagId);
  const tagIdParam = params.length;
  const { rows } = await pool.query<ArticleTagRow>(
    `
      update article_tags
      set ${setParts.join(', ')}, updated_at = now()
      where id = $${tagIdParam}::uuid
      returning id, name, slug, color
    `,
    params,
  );

  return rows[0] ?? null;
}

export async function deleteArticleTag(
  pool: TransactionPool,
  tagId: string,
): Promise<DeleteArticleTagResult> {
  const client = await pool.connect();

  try {
    await client.query('begin');
    const countResult = await client.query<{ count: number }>(
      `
        select count(*)::int as count
        from article_taggings
        where tag_id = $1::uuid
      `,
      [tagId],
    );
    const deleteResult = await client.query(
      `
        delete from article_tags
        where id = $1::uuid
      `,
      [tagId],
    );
    await client.query('commit');

    return {
      removed: (deleteResult.rowCount ?? 0) > 0,
      affectedArticleCount: countResult.rows[0]?.count ?? 0,
    };
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}
