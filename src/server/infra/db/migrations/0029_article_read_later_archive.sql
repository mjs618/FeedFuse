alter table articles
  add column if not exists is_read_later boolean not null default false,
  add column if not exists read_later_at timestamptz null,
  add column if not exists is_archived boolean not null default false,
  add column if not exists archived_at timestamptz null;

create index if not exists articles_read_later_published_idx
  on articles (is_read_later, published_at desc, id desc);

create index if not exists articles_archived_published_idx
  on articles (is_archived, published_at desc, id desc);
