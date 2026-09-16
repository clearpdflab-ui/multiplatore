import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabase } from '../services/supabaseClient';
import type { ScoutRun } from '../types';
import type { ScoutResult } from '../engine/scout';

// Scout Radar: storico run (ultime 10). Stesso pattern di useSavedSlips: il
// locale vince sempre, il cloud segue in write-through best-effort.
// La UI legge solo l'ultima run come "lista da giocare" (sola lettura).

const STORAGE_KEY = 'multiplatore:scout_runs:v1';
const KEEP = 10;

function uid(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    /* fallback sotto */
  }
  return `r-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

interface DbScoutRunRow {
  id: string;
  owner_id: string | null;
  ran_at: string;
  pool_size: number;
  picks: ScoutRun['picks'];
  meta: {
    perLine?: Record<number, number>;
    evaluatedWindows?: number;
    exactSolves?: number;
    rejectedBy?: Record<string, number>;
    msElapsed?: number;
    budgetHit?: boolean;
    grid?: ScoutRun['grid'];
  };
  created_at: string;
}

function rowToRun(r: DbScoutRunRow): ScoutRun {
  const m = r.meta && typeof r.meta === 'object' ? r.meta : {};
  return {
    id: r.id,
    picks: Array.isArray(r.picks) ? r.picks : [],
    poolSize: Number(r.pool_size) || 0,
    perLine: m.perLine ?? {},
    evaluatedWindows: m.evaluatedWindows ?? 0,
    exactSolves: m.exactSolves ?? 0,
    rejectedBy: m.rejectedBy ?? {},
    ranAt: r.ran_at,
    msElapsed: m.msElapsed ?? 0,
    budgetHit: Boolean(m.budgetHit),
    grid: (m.grid ?? {}) as ScoutRun['grid'],
  };
}

function loadLocal(): ScoutRun[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as ScoutRun[]) : [];
  } catch {
    return [];
  }
}

function saveLocal(runs: ScoutRun[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
  } catch {
    /* storage pieno/non disponibile: la UI resta in memoria */
  }
}

export interface UseScoutRunsState {
  runs: ScoutRun[];
  latest: ScoutRun | null;
  loading: boolean;
  error: string | null;
  usingFallback: boolean;
  refresh: () => Promise<void>;
  saveRun: (result: ScoutResult) => Promise<ScoutRun>;
  clearRuns: () => Promise<void>;
}

export function useScoutRuns(): UseScoutRunsState {
  const [runs, setRuns] = useState<ScoutRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usingFallback, setUsingFallback] = useState(true);

  const persist = useCallback((list: ScoutRun[]) => {
    setRuns(list);
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
        .from('scout_runs')
        .select('*')
        .order('ran_at', { ascending: false })
        .limit(KEEP);
      if (selErr) {
        throw new Error(selErr.message);
      }
      persist(((data ?? []) as DbScoutRunRow[]).map(rowToRun));
      setUsingFallback(false);
    } catch (e) {
      setError(
        e instanceof Error
          ? `Sync cloud non riuscita (dati locali salvi): ${e.message}`
          : 'Errore caricamento run Scout',
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

  const saveRun = useCallback(
    async (result: ScoutResult): Promise<ScoutRun> => {
      const run: ScoutRun = {
        id: uid(),
        picks: result.picks,
        poolSize: result.poolSize,
        perLine: result.perLine,
        evaluatedWindows: result.evaluatedWindows,
        exactSolves: result.exactSolves,
        rejectedBy: result.rejectedBy,
        ranAt: result.ranAt,
        msElapsed: result.msElapsed,
        budgetHit: result.budgetHit,
        grid: (result.grid ?? {}) as ScoutRun['grid'],
      };
      const next = [run, ...runs].slice(0, KEEP);
      persist(next);
      await cloud(async (sb) => {
        const { data: s } = await sb.auth.getSession();
        const { error: insErr } = await sb.from('scout_runs').insert({
          id: run.id,
          owner_id: s.session?.user.id ?? null,
          ran_at: run.ranAt,
          pool_size: run.poolSize,
          picks: run.picks,
          meta: {
            perLine: run.perLine,
            evaluatedWindows: run.evaluatedWindows,
            exactSolves: run.exactSolves,
            rejectedBy: run.rejectedBy,
            msElapsed: run.msElapsed,
            budgetHit: run.budgetHit,
            grid: run.grid,
          },
        });
        if (insErr) {
          return { error: insErr };
        }
        // Potatura cloud oltre le ultime KEEP.
        const { data: old } = await sb
          .from('scout_runs')
          .select('id')
          .order('ran_at', { ascending: false })
          .range(KEEP, KEEP + 20);
        const ids = ((old ?? []) as { id: string }[]).map((r) => r.id);
        if (ids.length > 0) {
          await sb.from('scout_runs').delete().in('id', ids);
        }
        return {};
      });
      return run;
    },
    [runs, persist, cloud],
  );

  const clearRuns = useCallback(async () => {
    persist([]);
    await cloud(async (sb) => {
      const { error: delErr } = await sb
        .from('scout_runs')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      return { error: delErr };
    });
  }, [persist, cloud]);

  const state = useMemo<UseScoutRunsState>(
    () => ({
      runs,
      latest: runs.length > 0 ? runs[0] : null,
      loading,
      error,
      usingFallback,
      refresh,
      saveRun,
      clearRuns,
    }),
    [runs, loading, error, usingFallback, refresh, saveRun, clearRuns],
  );
  return state;
}
