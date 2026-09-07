-- F3: Cycles ledger + tickets (multi-ciclo parallelo, un ticket attivo per path decisionale)
-- Ogni ticket referenzia book_id + bonus_version_id così la storia resta riproducibile.
-- Coperture CONDIZIONALI: piazzate DOPO l'esito (stato pending -> won/lost/void).
-- Assicurazione FUORI dal computo (nessuna colonna: solo rimborso passivo separato).

-- Cycles ----------------------------------------------------------------------
create table public.cycles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete cascade,
  name text not null default 'Ciclo 1',
  bankroll_start numeric not null default 3000,
  s0 numeric not null default 2,
  target_base numeric not null default 45,
  status text not null default 'active'
    check (status in ('active', 'closed')),
  mother_events jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);

create index cycles_owner_idx on public.cycles (owner_id);
create index cycles_status_idx on public.cycles (status) where status = 'active';

create trigger cycles_updated_at
  before update on public.cycles
  for each row execute function public.set_updated_at();

-- Tickets (un ticket = un solo book) -------------------------------------------
create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.cycles (id) on delete cascade,
  owner_id uuid references auth.users (id) on delete cascade,
  kind text not null
    check (kind in ('MOTHER', 'COVERAGE', 'LOCK', 'TERMINATION')),
  idx int not null default 0,
  legs jsonb not null default '[]'::jsonb,
  book_id uuid references public.books (id) on delete set null,
  book_name text not null default 'Main',
  bonus_version_id uuid references public.book_bonus_versions (id) on delete set null,
  stake numeric not null default 0,
  finale numeric not null default 0,
  target numeric not null default 45,
  status text not null default 'pending'
    check (status in ('pending', 'won', 'lost', 'void')),
  placed_at timestamptz not null default now(),
  settled_at timestamptz,
  created_at timestamptz not null default now()
);

create index tickets_cycle_idx on public.tickets (cycle_id, idx);
create index tickets_owner_idx on public.tickets (owner_id);
create index tickets_status_idx on public.tickets (status) where status = 'pending';

-- RLS ---------------------------------------------------------------------------
alter table public.cycles enable row level security;
alter table public.tickets enable row level security;

-- cycles: own rows only (nessun ciclo globale: il ledger è per-utente)
create policy cycles_select on public.cycles
  for select to authenticated
  using (owner_id = auth.uid());

create policy cycles_insert on public.cycles
  for insert to authenticated
  with check (owner_id = auth.uid());

create policy cycles_update on public.cycles
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy cycles_delete on public.cycles
  for delete to authenticated
  using (owner_id = auth.uid());

-- tickets: visibility/ownership ereditate dal ciclo
create policy tickets_select on public.tickets
  for select to authenticated
  using (exists (
    select 1 from public.cycles c
    where c.id = tickets.cycle_id
      and c.owner_id = auth.uid()
  ));

create policy tickets_insert on public.tickets
  for insert to authenticated
  with check (
    owner_id = auth.uid() and exists (
      select 1 from public.cycles c
      where c.id = tickets.cycle_id
        and c.owner_id = auth.uid()
    )
  );

create policy tickets_update on public.tickets
  for update to authenticated
  using (exists (
    select 1 from public.cycles c
    where c.id = tickets.cycle_id
      and c.owner_id = auth.uid()
  ))
  with check (
    owner_id = auth.uid() and exists (
      select 1 from public.cycles c
      where c.id = tickets.cycle_id
        and c.owner_id = auth.uid()
    )
  );

create policy tickets_delete on public.tickets
  for delete to authenticated
  using (exists (
    select 1 from public.cycles c
    where c.id = tickets.cycle_id
      and c.owner_id = auth.uid()
  ));
