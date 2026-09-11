-- F10: Saved slips (workbench snapshots).
-- Snapshot nominato della configurazione LiveSlipTracker: partite (UserMatch[])
-- + parametri di Dutching (ModelParameters). Ricaricabile quando serve.
-- Locale-first: la tabella e' il mirror cloud (RLS owner-scoped come cycles).

create table public.saved_slips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete cascade,
  name text not null,
  matches jsonb not null default '[]'::jsonb,
  params jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index saved_slips_owner_idx on public.saved_slips (owner_id);
create index saved_slips_created_idx on public.saved_slips (created_at desc);

create trigger saved_slips_updated_at
  before update on public.saved_slips
  for each row execute function public.set_updated_at();

-- RLS: own rows only (nessun record globale: le schedine sono per-utente)
alter table public.saved_slips enable row level security;

create policy saved_slips_select on public.saved_slips
  for select to authenticated
  using (owner_id = auth.uid());

create policy saved_slips_insert on public.saved_slips
  for insert to authenticated
  with check (owner_id = auth.uid());

create policy saved_slips_update on public.saved_slips
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy saved_slips_delete on public.saved_slips
  for delete to authenticated
  using (owner_id = auth.uid());
