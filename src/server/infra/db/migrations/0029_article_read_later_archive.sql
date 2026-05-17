alter table articles
  add column if not exists is_read_later boolean not null default false,
  add column if not exists read_later_at timestamptz null,
  add column if not exists is_archived boolean not null default false,
  add column if not exists archived_at timestamptz null;

create index if not exists articles_read_later_sort_published_id_idx
  on articles ((coalesce(published_at, 'epoch'::timestamptz)) desc, id desc)
  where is_read_later = true;

create index if not exists articles_archived_sort_published_id_idx
  on articles ((coalesce(published_at, 'epoch'::timestamptz)) desc, id desc)
  where is_archived = true;
