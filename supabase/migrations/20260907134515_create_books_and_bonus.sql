-- F1: Books registry + versioned bonus tables (source of truth for engine + app UI)
-- Every ticket references book_id + bonus_version_id so history stays reproducible.

-- Books ---------------------------------------------------------------------
create table public.books (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete cascade,
  name text not null,
  is_global boolean not null default false,
  is_active boolean not null default true,
  bonus_cap numeric not null default 500,
  min_stake numeric not null default 1,
  max_payout numeric, -- null = unlimited
  max_legs int not null default 30,
  over_eligible boolean not null default true, -- default pending T&C verification
  competitions text[] not null default array['all'],
  api_book_key text, -- mapping key for odds-api.net bookmaker names
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index books_owner_idx on public.books (owner_id);
create index books_active_idx on public.books (is_active) where is_active;

-- Bonus versions (append-only; never update in place) -------------------------
create table public.book_bonus_versions (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  valid_from timestamptz not null default now(),
  table_data jsonb not null, -- {"5":6.0,...,"30":354.9}
  superseded_by uuid references public.book_bonus_versions (id),
  created_at timestamptz not null default now()
);

create index bonus_versions_book_idx on public.book_bonus_versions (book_id, valid_from desc);

-- updated_at trigger ----------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger books_updated_at
  before update on public.books
  for each row execute function public.set_updated_at();

-- RLS --------------------------------------------------------------------------
alter table public.books enable row level security;
alter table public.book_bonus_versions enable row level security;

-- read: global rows + own rows (authenticated)
create policy books_select on public.books
  for select to authenticated
  using (is_global or owner_id = auth.uid());

-- write: own rows only (global rows are read-only for users; service_role bypasses)
create policy books_insert on public.books
  for insert to authenticated
  with check (owner_id = auth.uid() and not is_global);

create policy books_update on public.books
  for update to authenticated
  using (owner_id = auth.uid() and not is_global)
  with check (owner_id = auth.uid() and not is_global);

create policy books_delete on public.books
  for delete to authenticated
  using (owner_id = auth.uid() and not is_global);

-- versions inherit visibility from their book
create policy bonus_versions_select on public.book_bonus_versions
  for select to authenticated
  using (exists (
    select 1 from public.books b
    where b.id = book_bonus_versions.book_id
      and (b.is_global or b.owner_id = auth.uid())
  ));

create policy bonus_versions_insert on public.book_bonus_versions
  for insert to authenticated
  with check (exists (
    select 1 from public.books b
    where b.id = book_bonus_versions.book_id
      and b.owner_id = auth.uid() and not b.is_global
  ));

create policy bonus_versions_update on public.book_bonus_versions
  for update to authenticated
  using (exists (
    select 1 from public.books b
    where b.id = book_bonus_versions.book_id
      and b.owner_id = auth.uid() and not b.is_global
  ))
  with check (exists (
    select 1 from public.books b
    where b.id = book_bonus_versions.book_id
      and b.owner_id = auth.uid() and not b.is_global
  ));

-- Seed: Main book (global default, cap 500, validated table 5-30) ---------------
do $$
declare
  main_id uuid;
begin
  insert into public.books
    (name, is_global, bonus_cap, min_stake, max_legs, over_eligible, competitions)
  values
    ('Main', true, 500, 1, 30, true, array['all'])
  returning id into main_id;

  insert into public.book_bonus_versions (book_id, table_data)
  values (main_id, '{
    "5": 6.0, "6": 12.4, "7": 19.1, "8": 26.2, "9": 33.8,
    "10": 41.9, "11": 50.4, "12": 59.4, "13": 68.9, "14": 79.1,
    "15": 89.8, "16": 101.2, "17": 113.3, "18": 126.1, "19": 139.7,
    "20": 154.0, "21": 169.3, "22": 185.4, "23": 202.6, "24": 220.7,
    "25": 240.0, "26": 260.4, "27": 282.0, "28": 304.9, "29": 329.2,
    "30": 354.9
  }'::jsonb);
end $$;
