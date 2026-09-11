-- F8a: limite temporale sulle multiple per bookmaker.
-- Alcuni book richiedono che tutte le gambe di una multipla chiudano entro N
-- giorni (es. 7); altri non pongono vincolo. null = nessun limite.
-- Usato dal Calendario per la finestra di ricerca auto e il controllo spread.

alter table public.books
  add column if not exists multi_days_limit int;

comment on column public.books.multi_days_limit is
  'Max days allowed between first and last kickoff of a multi ticket (NULL = no limit)';
