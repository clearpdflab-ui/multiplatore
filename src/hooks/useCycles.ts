import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabase } from '../services/supabaseClient';
import { recomputeAfterVoid } from '../engine/harmony';
import { refillToThirty } from '../engine/cycles';
import { DEFAULT_BOOK } from '../engine/books';
import type {
  Book,
  Cycle,
  CycleMotherEvent,
  CycleTicket,
  CycleTicketKind,
  CycleTicketStatus,
  TicketLeg,
} from '../types';

const STORAGE_KEY = 'multiplatore:cycles:v1';

function uid(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    /* fallback sotto */
  }
  return `c-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

const nowIso = () => new Date().toISOString();

interface Persisted {
  cycles: Cycle[];
  tickets: CycleTicket[];
}

function loadLocal(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { cycles: [], tickets: [] };
    }
    const p = JSON.parse(raw) as Persisted;
    if (!Array.isArray(p.cycles) || !Array.isArray(p.tickets)) {
      return { cycles: [], tickets: [] };
    }
    return p;
  } catch {
    return { cycles: [], tickets: [] };
  }
}

function saveLocal(cycles: Cycle[], tickets: CycleTicket[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ cycles, tickets }));
  } catch {
    /* storage pieno/non disponibile: la UI resta in memoria */
  }
}

// --- mapping DB ---------------------------------------------------------------
interface DbCycleRow {
  id: string;
  owner_id: string | null;
  name: string;
  bankroll_start: number;
  s0: number;
  target_base: number;
  status: string;
  mother_events: CycleMotherEvent[];
  created_at: string;
  closed_at: string | null;
}

interface DbTicketRow {
  id: string;
  cycle_id: string;
  owner_id: string | null;
  kind: string;
  idx: number;
  legs: TicketLeg[];
  book_id: string | null;
  book_name: string;
  bonus_version_id: string | null;
  stake: number;
  finale: number;
  target: number;
  status: string;
  placed_at: string;
  settled_at: string | null;
}

function rowToCycle(r: DbCycleRow): Cycle {
  return {
    id: r.id,
    name: r.name,
    bankrollStart: Number(r.bankroll_start),
    s0: Number(r.s0),
    targetBase: Number(r.target_base),
    status: r.status === 'closed' ? 'closed' : 'active',
    motherEvents: Array.isArray(r.mother_events) ? r.mother_events : [],
    createdAt: r.created_at,
    closedAt: r.closed_at,
  };
}

function rowToTicket(r: DbTicketRow): CycleTicket {
  return {
    id: r.id,
    cycleId: r.cycle_id,
    kind: (r.kind as CycleTicket['kind']) ?? 'COVERAGE',
    idx: r.idx,
    legs: Array.isArray(r.legs) ? r.legs : [],
    bookId: r.book_id,
    bookName: r.book_name ?? 'Main',
    bonusVersionId: r.bonus_version_id,
    stake: Number(r.stake),
    finale: Number(r.finale),
    target: Number(r.target),
    status: (r.status as CycleTicket['status']) ?? 'pending',
    placedAt: r.placed_at,
    settledAt: r.settled_at,
  };
}

// Spent del ciclo = stake piazzati non rimborsati (i void sono esclusi:
// rimborso passivo, mai nelle formule).
export function spentByCycle(tickets: CycleTicket[], cycleId: string): number {
  let s = 0;
  for (const t of tickets) {
    if (t.cycleId !== cycleId) {
      continue;
    }
    if (t.status === 'void') {
      continue;
    }
    s += t.stake;
  }
  return Number(s.toFixed(2));
}

// Chiavi delle gambe pending (per shared-leg guard). Solo label non vuote.
export function pendingLegKeys(tickets: CycleTicket[], cycleId: string): string[] {
  const out: string[] = [];
  for (const t of tickets) {
    if (t.cycleId !== cycleId || t.status !== 'pending') {
      continue;
    }
    for (const l of t.legs) {
      if (l.label && l.label.trim()) {
        out.push(l.label);
      }
    }
  }
  return out;
}

export interface CreateCycleInput {
  name: string;
  bankrollStart?: number;
  s0?: number;
  targetBase?: number;
  motherEvents?: CycleMotherEvent[];
}

export interface AddTicketInput {
  kind: CycleTicketKind;
  legs: TicketLeg[];
  stake: number;
  finale: number;
  target: number;
  book?: Book | null;
  bonusVersionId?: string | null;
}

export interface UseCyclesState {
  cycles: Cycle[];
  tickets: CycleTicket[];
  loading: boolean;
  error: string | null;
  usingFallback: boolean; // true = solo locale (nessuna sessione Supabase)
  refresh: () => Promise<void>;
  createCycle: (input: CreateCycleInput) => Promise<Cycle>;
  closeCycle: (id: string) => Promise<void>;
  deleteCycle: (id: string) => Promise<void>;
  topUpCycle: (id: string, amount: number) => Promise<void>;
  refillMother: (id: string, pool: CycleMotherEvent[]) => Promise<number>;
  addTicket: (cycleId: string, input: AddTicketInput) => Promise<CycleTicket>;
  settleTicket: (id: string, status: CycleTicketStatus) => Promise<void>;
  voidTicketLeg: (id: string, legIndex: number, book?: Book) => Promise<void>;
  ticketsByCycle: (cycleId: string) => CycleTicket[];
  spentOf: (cycleId: string) => number;
}

export function useCycles(): UseCyclesState {
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [tickets, setTickets] = useState<CycleTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usingFallback, setUsingFallback] = useState(true);

  const persist = useCallback((c: Cycle[], t: CycleTicket[]) => {
    setCycles(c);
    setTickets(t);
    saveLocal(c, t);
  }, []);

  const refresh = useCallback(async () => {
    const initial = loadLocal();
    const sb = getSupabase();
    if (!sb) {
      persist(initial.cycles, initial.tickets);
      setUsingFallback(true);
      setLoading(false);
      return;
    }
    try {
      const { data: sessionData } = await sb.auth.getSession();
      if (!sessionData.session) {
        persist(initial.cycles, initial.tickets);
        setUsingFallback(true);
        setLoading(false);
        return;
      }
      const [{ data: cRows, error: cErr }, { data: tRows, error: tErr }] = await Promise.all([
        sb.from('cycles').select('*').order('created_at'),
        sb.from('tickets').select('*').order('idx'),
      ]);
      if (cErr) {
        throw new Error(cErr.message);
      }
      if (tErr) {
        throw new Error(tErr.message);
      }
      const c = ((cRows ?? []) as DbCycleRow[]).map(rowToCycle);
      const t = ((tRows ?? []) as DbTicketRow[]).map(rowToTicket);
      persist(c, t);
      setUsingFallback(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore caricamento cicli');
      persist(initial.cycles, initial.tickets);
      setUsingFallback(true);
    } finally {
      setLoading(false);
    }
  }, [persist]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Write-through best-effort: il locale vince sempre, il cloud segue.
  const cloud = useCallback(
    async (
      fn: (
        sb: NonNullable<ReturnType<typeof getSupabase>>,
      ) => Promise<{ error?: { message: string } | null } | void>,
    ) => {
      const sb = getSupabase();
      if (!sb) {
        return;
      }
      try {
        const { data: sessionData } = await sb.auth.getSession();
        if (!sessionData.session) {
          return;
        }
        const res = await fn(sb);
        if (res && res.error) {
          throw new Error(res.error.message);
        }
      } catch (e) {
        setError(
          e instanceof Error
            ? `Sync cloud non riuscita (dati locali salvi): ${e.message}`
            : 'Sync cloud non riuscita',
        );
      }
    },
    [],
  );

  const createCycle = useCallback(
    async (input: CreateCycleInput): Promise<Cycle> => {
      const name = input.name.trim();
      if (!name) {
        throw new Error('Nome ciclo obbligatorio');
      }
      const c: Cycle = {
        id: uid(),
        name,
        bankrollStart: input.bankrollStart ?? 3000,
        s0: input.s0 ?? 2,
        targetBase: input.targetBase ?? 45,
        status: 'active',
        motherEvents: input.motherEvents ?? [],
        createdAt: nowIso(),
        closedAt: null,
      };
      const nc = [...cycles, c];
      persist(nc, tickets);
      await cloud(async (sb) => {
        const { data: s } = await sb.auth.getSession();
        const { error: insErr } = await sb.from('cycles').insert({
          id: c.id,
          owner_id: s.session?.user.id ?? null,
          name: c.name,
          bankroll_start: c.bankrollStart,
          s0: c.s0,
          target_base: c.targetBase,
          status: c.status,
          mother_events: c.motherEvents,
        });
        return { error: insErr };
      });
      return c;
    },
    [cycles, tickets, persist, cloud],
  );

  const closeCycle = useCallback(
    async (id: string) => {
      const nc = cycles.map((c) =>
        c.id === id ? { ...c, status: 'closed' as const, closedAt: nowIso() } : c,
      );
      persist(nc, tickets);
      await cloud(async (sb) => {
        const { error: upErr } = await sb
          .from('cycles')
          .update({ status: 'closed', closed_at: nowIso() })
          .eq('id', id);
        return { error: upErr };
      });
    },
    [cycles, tickets, persist, cloud],
  );

  const deleteCycle = useCallback(
    async (id: string) => {
      persist(
        cycles.filter((c) => c.id !== id),
        tickets.filter((t) => t.cycleId !== id),
      );
      await cloud(async (sb) => {
        const { error: delErr } = await sb.from('cycles').delete().eq('id', id);
        return { error: delErr };
      });
    },
    [cycles, tickets, persist, cloud],
  );

  // Top-up: ricarica del bankroll di riferimento del ciclo (mai nelle formule
  // di sizing del singolo ticket: aggiorna solo i tetti bankroll/T/U).
  const topUpCycle = useCallback(
    async (id: string, amount: number) => {
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error('Importo top-up non valido');
      }
      const nc = cycles.map((c) =>
        c.id === id ? { ...c, bankrollStart: Number((c.bankrollStart + amount).toFixed(2)) } : c,
      );
      persist(nc, tickets);
      const next = nc.find((c) => c.id === id);
      await cloud(async (sb) => {
        const { error: upErr } = await sb
          .from('cycles')
          .update({ bankroll_start: next?.bankrollStart })
          .eq('id', id);
        return { error: upErr };
      });
    },
    [cycles, tickets, persist, cloud],
  );

  // Refill-30: riuso + pool per tornare a 30 eventi madre. Ritorna il totale.
  const refillMother = useCallback(
    async (id: string, pool: CycleMotherEvent[]): Promise<number> => {
      const c = cycles.find((x) => x.id === id);
      if (!c) {
        throw new Error('Ciclo non trovato');
      }
      const refilled = refillToThirty(c.motherEvents, pool, 30);
      const nc = cycles.map((x) => (x.id === id ? { ...x, motherEvents: refilled } : x));
      persist(nc, tickets);
      await cloud(async (sb) => {
        const { error: upErr } = await sb
          .from('cycles')
          .update({ mother_events: refilled })
          .eq('id', id);
        return { error: upErr };
      });
      return refilled.length;
    },
    [cycles, tickets, persist, cloud],
  );

  const addTicket = useCallback(
    async (cycleId: string, input: AddTicketInput): Promise<CycleTicket> => {
      const c = cycles.find((x) => x.id === cycleId);
      if (!c) {
        throw new Error('Ciclo non trovato');
      }
      if (c.status !== 'active') {
        throw new Error('Ciclo chiuso: nessun ticket piazzabile');
      }
      if (input.legs.length < 1 || input.legs.length > 30) {
        throw new Error('N gambe 1–30');
      }
      if (!(input.stake > 0) || !(input.finale > 1)) {
        throw new Error('Stake/finale non validi');
      }
      const existing = tickets.filter((t) => t.cycleId === cycleId);
      // 1 ticket attivo per path decisionale: un solo pending alla volta.
      if (existing.some((t) => t.status === 'pending')) {
        throw new Error('Ciclo ha già un ticket attivo: salda o voida prima di piazzare');
      }
      const t: CycleTicket = {
        id: uid(),
        cycleId,
        kind: input.kind,
        idx: existing.length,
        legs: input.legs,
        bookId: input.book?.id ?? null,
        bookName: input.book?.name ?? 'Main',
        bonusVersionId: input.bonusVersionId ?? null,
        stake: input.stake,
        finale: input.finale,
        target: input.target,
        status: 'pending',
        placedAt: nowIso(),
        settledAt: null,
      };
      const nt = [...tickets, t];
      persist(cycles, nt);
      await cloud(async (sb) => {
        const { data: s } = await sb.auth.getSession();
        const { error: insErr } = await sb.from('tickets').insert({
          id: t.id,
          cycle_id: t.cycleId,
          owner_id: s.session?.user.id ?? null,
          kind: t.kind,
          idx: t.idx,
          legs: t.legs,
          book_id: null, // id locali non-uuid: si conserva book_name
          book_name: t.bookName,
          bonus_version_id: t.bonusVersionId,
          stake: t.stake,
          finale: t.finale,
          target: t.target,
          status: t.status,
        });
        return { error: insErr };
      });
      return t;
    },
    [cycles, tickets, persist, cloud],
  );

  const settleTicket = useCallback(
    async (id: string, status: CycleTicketStatus) => {
      const nt = tickets.map((t) =>
        t.id === id ? { ...t, status, settledAt: status === 'pending' ? null : nowIso() } : t,
      );
      persist(cycles, nt);
      const row = nt.find((t) => t.id === id);
      await cloud(async (sb) => {
        const { error: upErr } = await sb
          .from('tickets')
          .update({ status, settled_at: row?.settledAt ?? null })
          .eq('id', id);
        return { error: upErr };
      });
    },
    [cycles, tickets, persist, cloud],
  );

  // Void di UNA gamba: drop + ricalcolo su N-1 (il bonus può scendere).
  // Lo stake piazzato resta; la UI mostra il nuovo finale/lordo atteso.
  const voidTicketLeg = useCallback(
    async (id: string, legIndex: number, book: Book = DEFAULT_BOOK) => {
      const t = tickets.find((x) => x.id === id);
      if (!t) {
        throw new Error('Ticket non trovato');
      }
      if (t.status !== 'pending') {
        throw new Error('Solo i ticket pending ammettono void di gamba');
      }
      if (legIndex < 0 || legIndex >= t.legs.length) {
        throw new Error('Indice gamba non valido');
      }
      if (t.legs.length === 1) {
        // Ultima gamba void => ticket void (rimborso, fuori dal computo).
        await settleTicket(id, 'void');
        return;
      }
      const r = recomputeAfterVoid(t.legs, legIndex, book);
      const nt = tickets.map((x) => (x.id === id ? { ...x, legs: r.legs, finale: r.finale } : x));
      persist(cycles, nt);
      await cloud(async (sb) => {
        const { error: upErr } = await sb
          .from('tickets')
          .update({ legs: r.legs, finale: r.finale })
          .eq('id', id);
        return { error: upErr };
      });
    },
    [cycles, tickets, persist, cloud, settleTicket],
  );

  const ticketsByCycle = useCallback(
    (cycleId: string) => tickets.filter((t) => t.cycleId === cycleId).sort((a, b) => a.idx - b.idx),
    [tickets],
  );

  const spentOf = useCallback((cycleId: string) => spentByCycle(tickets, cycleId), [tickets]);

  const state = useMemo<UseCyclesState>(
    () => ({
      cycles,
      tickets,
      loading,
      error,
      usingFallback,
      refresh,
      createCycle,
      closeCycle,
      deleteCycle,
      topUpCycle,
      refillMother,
      addTicket,
      settleTicket,
      voidTicketLeg,
      ticketsByCycle,
      spentOf,
    }),
    [
      cycles,
      tickets,
      loading,
      error,
      usingFallback,
      refresh,
      createCycle,
      closeCycle,
      deleteCycle,
      topUpCycle,
      refillMother,
      addTicket,
      settleTicket,
      voidTicketLeg,
      ticketsByCycle,
      spentOf,
    ],
  );
  return state;
}
