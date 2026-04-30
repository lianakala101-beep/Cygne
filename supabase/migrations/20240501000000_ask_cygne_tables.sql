-- Ask Cygne: cache and daily usage tables

create table if not exists ask_cygne_cache (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  question   text not null,
  response   text not null,
  created_at timestamptz not null default now()
);

create index if not exists ask_cygne_cache_lookup
  on ask_cygne_cache (user_id, question, created_at desc);

create table if not exists ask_cygne_usage (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists ask_cygne_usage_daily
  on ask_cygne_usage (user_id, created_at desc);

-- RLS: users can read their own rows (write handled by service role in Edge Function)
alter table ask_cygne_cache  enable row level security;
alter table ask_cygne_usage  enable row level security;

create policy "Users read own cache"
  on ask_cygne_cache for select
  using (auth.uid() = user_id);

create policy "Users read own usage"
  on ask_cygne_usage for select
  using (auth.uid() = user_id);
