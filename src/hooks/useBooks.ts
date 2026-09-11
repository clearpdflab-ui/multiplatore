import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabase, isSupabaseConfigured } from '../services/supabaseClient';
import { DEFAULT_BOOK } from '../engine/books';
import type { Book, BookBonusVersion } from '../types';

interface DbBookRow {
  id: string;
  owner_id: string | null;
  name: string;
  is_global: boolean;
  is_active: boolean;
  bonus_cap: number;
  min_stake: number;
  max_payout: number | null;
  max_legs: number;
  multi_days_limit: number | null;
  over_eligible: boolean;
  competitions: string[];
  api_book_key: string | null;
}

interface DbVersionRow {
  id: string;
  book_id: string;
  valid_from: string;
  table_data: Record<string, number>;
  superseded_by: string | null;
  created_at: string;
}

function rowToBook(r: DbBookRow, table: Record<number, number>): Book {
  return {
    id: r.id,
    name: r.name,
    bonusTable: table,
    bonusCap: Number(r.bonus_cap),
    minStake: Number(r.min_stake),
    maxPayout: r.max_payout === null ? null : Number(r.max_payout),
    maxLegs: r.max_legs,
    multiDaysLimit: r.multi_days_limit ?? null,
    overEligible: r.over_eligible,
    competitions: r.competitions,
    apiBookKey: r.api_book_key ?? undefined,
    isActive: r.is_active,
  };
}

function normalizeTable(data: Record<string, number>): Record<number, number> {
  const out: Record<number, number> = {};
  for (const [k, v] of Object.entries(data)) {
    out[Number(k)] = Number(v);
  }
  return out;
}

export interface UseBooksState {
  books: Book[];
  versionsByBook: Record<string, BookBonusVersion[]>;
  loading: boolean;
  error: string | null;
  usingFallback: boolean; // true when Supabase/session unavailable -> DEFAULT_BOOK only
  activeVersion: (bookId: string) => BookBonusVersion | null;
  refresh: () => Promise<void>;
  createBook: (
    input: Omit<Book, 'id' | 'bonusTable'> & { bonusTable: Record<number, number> },
  ) => Promise<Book>;
  updateBook: (id: string, patch: Partial<Book>) => Promise<void>;
  saveBonusVersion: (bookId: string, table: Record<number, number>) => Promise<void>;
  rollbackToVersion: (bookId: string, versionId: string) => Promise<void>;
  setBookActive: (id: string, active: boolean) => Promise<void>;
}

export function parseBonusCsv(text: string): { table?: Record<number, number>; error?: string } {
  const table: Record<number, number> = {};
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const [nStr, pStr] = line.split(/[;,]/).map((s) => s.trim());
    const n = Number(nStr);
    const p = Number(pStr);
    if (!Number.isInteger(n) || n < 5 || n > 30 || !Number.isFinite(p) || p < 0 || p > 1000) {
      return { error: `Riga non valida: "${rawLine}" (atteso N 5-30, % 0-1000)` };
    }
    table[n] = p;
  }
  const missing: number[] = [];
  for (let n = 5; n <= 30; n++) {
    if (!(n in table)) {
      missing.push(n);
    }
  }
  if (missing.length > 0) {
    return { error: `Mancano N: ${missing.join(', ')}` };
  }
  return { table };
}

export function bonusTableToCsv(table: Record<number, number>): string {
  return Object.keys(table)
    .map(Number)
    .sort((a, b) => a - b)
    .map((n) => `${n},${table[n]}`)
    .join('\n');
}

export function useBooks(): UseBooksState {
  const [books, setBooks] = useState<Book[]>([DEFAULT_BOOK]);
  const [versionsByBook, setVersionsByBook] = useState<Record<string, BookBonusVersion[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usingFallback, setUsingFallback] = useState(true);

  const refresh = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) {
      setBooks([DEFAULT_BOOK]);
      setVersionsByBook({});
      setUsingFallback(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data: sessionData } = await sb.auth.getSession();
      if (!sessionData.session) {
        setBooks([DEFAULT_BOOK]);
        setVersionsByBook({});
        setUsingFallback(true);
        setLoading(false);
        return;
      }
      const { data: bookRows, error: bErr } = await sb.from('books').select('*').order('name');
      if (bErr) {
        throw new Error(bErr.message);
      }
      const { data: verRows, error: vErr } = await sb
        .from('book_bonus_versions')
        .select('*')
        .order('valid_from', { ascending: false });
      if (vErr) {
        throw new Error(vErr.message);
      }

      const verMap: Record<string, BookBonusVersion[]> = {};
      for (const v of (verRows ?? []) as DbVersionRow[]) {
        const ver: BookBonusVersion = {
          id: v.id,
          bookId: v.book_id,
          validFrom: v.valid_from,
          tableData: normalizeTable(v.table_data),
          supersededBy: v.superseded_by,
        };
        (verMap[v.book_id] ??= []).push(ver);
      }
      const mapped: Book[] = ((bookRows ?? []) as DbBookRow[]).map((r) => {
        const active = (verMap[r.id] ?? [])[0];
        return rowToBook(r, active ? active.tableData : { ...DEFAULT_BOOK.bonusTable });
      });
      setBooks(mapped.length > 0 ? mapped : [DEFAULT_BOOK]);
      setVersionsByBook(verMap);
      setUsingFallback(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore caricamento book');
      setBooks([DEFAULT_BOOK]);
      setVersionsByBook({});
      setUsingFallback(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const activeVersion = useCallback(
    (bookId: string): BookBonusVersion | null => {
      const list = versionsByBook[bookId];
      return list && list.length > 0 ? list[0] : null;
    },
    [versionsByBook],
  );

  const requireClient = () => {
    const sb = getSupabase();
    if (!sb) {
      throw new Error('Supabase non configurato');
    }
    return sb;
  };

  const createBook = useCallback(
    async (input: Omit<Book, 'id' | 'bonusTable'> & { bonusTable: Record<number, number> }) => {
      const sb = requireClient();
      const { data: session } = await sb.auth.getSession();
      const owner = session.session?.user.id;
      if (!owner) {
        throw new Error('Login richiesto per creare un book');
      }
      const { data, error: insErr } = await sb
        .from('books')
        .insert({
          owner_id: owner,
          name: input.name,
          is_active: input.isActive,
          bonus_cap: input.bonusCap,
          min_stake: input.minStake,
          max_payout: input.maxPayout,
          max_legs: input.maxLegs,
          multi_days_limit: input.multiDaysLimit ?? null,
          over_eligible: input.overEligible,
          competitions: input.competitions,
          api_book_key: input.apiBookKey ?? null,
        })
        .select('*')
        .single();
      if (insErr) {
        throw new Error(insErr.message);
      }
      const row = data as DbBookRow;
      const { error: vErr } = await sb.from('book_bonus_versions').insert({
        book_id: row.id,
        table_data: input.bonusTable,
      });
      if (vErr) {
        throw new Error(vErr.message);
      }
      await refresh();
      return rowToBook(row, input.bonusTable);
    },
    [refresh],
  );

  const updateBook = useCallback(
    async (id: string, patch: Partial<Book>) => {
      const sb = requireClient();
      const payload: Record<string, unknown> = {};
      if (patch.name !== undefined) {
        payload.name = patch.name;
      }
      if (patch.isActive !== undefined) {
        payload.is_active = patch.isActive;
      }
      if (patch.bonusCap !== undefined) {
        payload.bonus_cap = patch.bonusCap;
      }
      if (patch.minStake !== undefined) {
        payload.min_stake = patch.minStake;
      }
      if (patch.maxPayout !== undefined) {
        payload.max_payout = patch.maxPayout;
      }
      if (patch.maxLegs !== undefined) {
        payload.max_legs = patch.maxLegs;
      }
      if (patch.multiDaysLimit !== undefined) {
        payload.multi_days_limit = patch.multiDaysLimit ?? null;
      }
      if (patch.overEligible !== undefined) {
        payload.over_eligible = patch.overEligible;
      }
      if (patch.competitions !== undefined) {
        payload.competitions = patch.competitions;
      }
      if (patch.apiBookKey !== undefined) {
        payload.api_book_key = patch.apiBookKey ?? null;
      }
      const { error: upErr } = await sb.from('books').update(payload).eq('id', id);
      if (upErr) {
        throw new Error(upErr.message);
      }
      await refresh();
    },
    [refresh],
  );

  const saveBonusVersion = useCallback(
    async (bookId: string, table: Record<number, number>) => {
      const sb = requireClient();
      const prev = activeVersion(bookId);
      const { data, error: insErr } = await sb
        .from('book_bonus_versions')
        .insert({ book_id: bookId, table_data: table })
        .select('id')
        .single();
      if (insErr) {
        throw new Error(insErr.message);
      }
      // Link previous version as superseded (best effort, history stays append-only).
      if (prev) {
        await sb
          .from('book_bonus_versions')
          .update({ superseded_by: (data as { id: string }).id })
          .eq('id', prev.id);
      }
      await refresh();
    },
    [refresh, activeVersion],
  );

  const rollbackToVersion = useCallback(
    async (bookId: string, versionId: string) => {
      const list = versionsByBook[bookId] ?? [];
      const target = list.find((v) => v.id === versionId);
      if (!target) {
        throw new Error('Versione non trovata');
      }
      // Rollback = new version copying old data (history never rewritten).
      await saveBonusVersion(bookId, { ...target.tableData });
    },
    [versionsByBook, saveBonusVersion],
  );

  const setBookActive = useCallback(
    async (id: string, active: boolean) => {
      await updateBook(id, { isActive: active });
    },
    [updateBook],
  );

  const state = useMemo<UseBooksState>(
    () => ({
      books,
      versionsByBook,
      loading,
      error,
      usingFallback,
      activeVersion,
      refresh,
      createBook,
      updateBook,
      saveBonusVersion,
      rollbackToVersion,
      setBookActive,
    }),
    [
      books,
      versionsByBook,
      loading,
      error,
      usingFallback,
      activeVersion,
      refresh,
      createBook,
      updateBook,
      saveBonusVersion,
      rollbackToVersion,
      setBookActive,
    ],
  );
  return state;
}
