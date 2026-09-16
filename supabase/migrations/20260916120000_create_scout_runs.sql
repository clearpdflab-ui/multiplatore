-- Scout Radar: run di caccia scale mai-perdita (solo lettura in UI).
-- Ogni run sostituisce la precedente come "lista da giocare": si tiene lo
-- storico breve (ultime 10 per utente). Locale-first come saved_slips.

create table public.scout_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete cascade,
  ran_at timestamptz not null default now(),
  pool_size integer not null default 0,
  picks jsonb not null default '[]'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index scout_runs_owner_idx on public.scout_runs (owner_id);
create index scout_runs_ran_idx on public.scout_runs (ran_at desc);

alter table public.scout_runs enable row level security;

create policy scout_runs_select on public.scout_runs
  for select to authenticated
  using (owner_id = auth.uid());

create policy scout_runs_insert on public.scout_runs
  for insert to authenticated
  with check (owner_id = auth.uid());

create policy scout_runs_delete on public.scout_runs
  for delete to authenticated
  using (owner_id = auth.uid());
