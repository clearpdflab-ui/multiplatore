import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabase } from '../services/supabaseClient';
import type { SavedSlipParams, SavedSlip, UserMatch } from '../types';

// F10: libreria schedine salvate. Stesso pattern di useCycles: il locale vince
// sempre (localStorage, funziona anche da logged-out), il cloud segue in
// write-through best-effort quando c'e' sessione Supabase.

const STORAGE_KEY = 'multiplatore:saved_slips:v1';

function uid(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    /* fallback sotto */
  }
  return `s-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

const nowIso = () => new Date().toISOString();

interface DbSavedSlipRow {
  id: string;
  owner_id: string | null;
  name: string;
  matches: UserMatch[];
  params: SavedSlipParams;
  created_at: string;
  updated_at: string;
}

function rowToSlip(r: DbSavedSlipRow): SavedSlip {
  return {
    id: r.id,
    name: r.name,
    matches: Array.isArray(r.matches) ? r.matches : [],
    params: (r.params && typeof r.params === 'object'
      ? r.params
      : {
          baseStake: 20,
          targetProfit: 45,
          asymmetricMode: 'flat',
          enableBooster: false,
          boosterOdds: 1.1,
        }) as SavedSlipParams,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function loadLocal(): SavedSlip[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as SavedSlip[]) : [];
  } catch {
    return [];
  }
}

function saveLocal(slips: SavedSlip[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slips));
  } catch {
    /* storage pieno/non disponibile: la UI resta in memoria */
  }
}

export interface CreateSlipInput {
  name: string;
  matches: UserMatch[];
  params: SavedSlipParams;
}

export interface UseSavedSlipsState {
  slips: SavedSlip[];
  loading: boolean;
  error: string | null;
  usingFallback: boolean; // true = solo locale (nessuna sessione Supabase)
  refresh: () => Promise<void>;
  saveSlip: (input: CreateSlipInput) => Promise<SavedSlip>;
  overwriteSlip: (id: string, input: CreateSlipInput) => Promise<void>;
  renameSlip: (id: string, name: string) => Promise<void>;
  deleteSlip: (id: string) => Promise<void>;
}

export function useSavedSlips(): UseSavedSlipsState {
  const [slips, setSlips] = useState<SavedSlip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usingFallback, setUsingFallback] = useState(true);

  const persist = useCallback((list: SavedSlip[]) => {
    setSlips(list);
    saveLocal(list);
  }, []);

  const refresh = useCallback(async () => {
    const initial = loadLocal();
    const sb = getSupabase();
    if (!sb) {
      persist(initial);
      setUsingFallback(true);
      setLoading(false);
      return;
    }
    try {
      const { data: sessionData } = await sb.auth.getSession();
      if (!sessionData.session) {
        persist(initial);
        setUsingFallback(true);
        setLoading(false);
        return;
      }
      const { data, error: selErr } = await sb
        .from('saved_slips')
        .select('*')
        .order('created_at', { ascending: false });
      if (selErr) {
        throw new Error(selErr.message);
      }
      persist(((data ?? []) as DbSavedSlipRow[]).map(rowToSlip));
      setUsingFallback(false);
    } catch (e) {
      setError(
        e instanceof Error
          ? `Sync cloud non riuscita (dati locali salvi): ${e.message}`
          : 'Errore caricamento schedine',
      );
      persist(initial);
      setUsingFallback(true);
    } finally {
      setLoading(false);
    }
  }, [persist]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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

  const saveSlip = useCallback(
    async (input: CreateSlipInput): Promise<SavedSlip> => {
      const name = input.name.trim();
      if (!name) {
        throw new Error('Nome schedina obbligatorio');
      }
      if (!input.matches.length) {
        throw new Error('Nessuna partita da salvare');
      }
      const slip: SavedSlip = {
        id: uid(),
        name,
        matches: input.matches,
        params: input.params,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      persist([slip, ...slips]);
      await cloud(async (sb) => {
        const { data: s } = await sb.auth.getSession();
        const { error: insErr } = await sb.from('saved_slips').insert({
          id: slip.id,
          owner_id: s.session?.user.id ?? null,
          name: slip.name,
          matches: slip.matches,
          params: slip.params,
        });
        return { error: insErr };
      });
      return slip;
    },
    [slips, persist, cloud],
  );

  const overwriteSlip = useCallback(
    async (id: string, input: CreateSlipInput): Promise<void> => {
      const target = slips.find((s) => s.id === id);
      if (!target) {
        throw new Error('Schedina non trovata');
      }
      const updated: SavedSlip = {
        ...target,
        name: input.name.trim() || target.name,
        matches: input.matches,
        params: input.params,
        updatedAt: nowIso(),
      };
      persist(slips.map((s) => (s.id === id ? updated : s)));
      await cloud(async (sb) => {
        const { error: upErr } = await sb
          .from('saved_slips')
          .update({ name: updated.name, matches: updated.matches, params: updated.params })
          .eq('id', id);
        return { error: upErr };
      });
    },
    [slips, persist, cloud],
  );

  const renameSlip = useCallback(
    async (id: string, name: string): Promise<void> => {
      const clean = name.trim();
      if (!clean) {
        throw new Error('Nome schedina obbligatorio');
      }
      persist(slips.map((s) => (s.id === id ? { ...s, name: clean, updatedAt: nowIso() } : s)));
      await cloud(async (sb) => {
        const { error: upErr } = await sb.from('saved_slips').update({ name: clean }).eq('id', id);
        return { error: upErr };
      });
    },
    [slips, persist, cloud],
  );

  const deleteSlip = useCallback(
    async (id: string): Promise<void> => {
      persist(slips.filter((s) => s.id !== id));
      await cloud(async (sb) => {
        const { error: delErr } = await sb.from('saved_slips').delete().eq('id', id);
        return { error: delErr };
      });
    },
    [slips, persist, cloud],
  );

  const state = useMemo<UseSavedSlipsState>(
    () => ({
      slips,
      loading,
      error,
      usingFallback,
      refresh,
      saveSlip,
      overwriteSlip,
      renameSlip,
      deleteSlip,
    }),
    [
      slips,
      loading,
      error,
      usingFallback,
      refresh,
      saveSlip,
      overwriteSlip,
      renameSlip,
      deleteSlip,
    ],
  );
  return state;
}
