create table if not exists article_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  color text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists article_tags_name_lower_unique
  on article_tags (lower(name));

create unique index if not exists article_tags_slug_unique
  on article_tags (slug);

create table if not exists article_taggings (
  article_id bigint not null references articles(id) on delete cascade,
  tag_id uuid not null references article_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (article_id, tag_id)
);

create index if not exists article_taggings_tag_article_idx
  on article_taggings (tag_id, article_id);

create index if not exists article_taggings_article_tag_idx
  on article_taggings (article_id, tag_id);
