import { getSupabase, isSupabaseConfigured } from './supabaseClient';
import { normalizeCoverOdds, type CoverOddsRow, type RawLdlEvent } from '../engine/coverOddsFeed';
import { mockCoverOddsForEventIds } from '../data/mockCoverOdds';

// F5 client: Edge Function proxy (token LDL server-side) -> normalizzazione
// coverodds. Senza sessione/token la UI cade sui dati mock.

const FN_PATH = '/functions/v1/ldl-odds';

export interface CoverOddsFetchResult {
  matches: CoverOddsRow[];
  source: 'edge' | 'mock';
  errors: string[];
}

async function fetchEdge(eventIds: Array<number | string>, timeoutMs = 15000): Promise<CoverOddsFetchResult> {
  const sb = getSupabase();
  if (!sb || !isSupabaseConfigured) throw new Error('supabase non configurato');
  const url = new URL((import.meta.env.VITE_SUPABASE_URL as string) + FN_PATH);
  url.searchParams.set('resource', 'coverodds');
  if (eventIds.length > 0) url.searchParams.set('eventIds', eventIds.join(','));
  const { data: s } = await sb.auth.getSession();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${s.session?.access_token ?? (import.meta.env.VITE_SUPABASE_ANON_KEY as string)}`,
      },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`edge HTTP ${res.status}`);
    const body = await res.json();
    const raw = Array.isArray(body.data) ? (body.data as RawLdlEvent[]) : [];
    return {
      matches: normalizeCoverOdds(raw, 3.5),
      source: 'edge',
      errors: body.error ? [String(body.error)] : [],
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchCoverOdds(eventIds: Array<number | string> = []): Promise<CoverOddsFetchResult> {
  try {
    return await fetchEdge(eventIds);
  } catch {
    return {
      matches: normalizeCoverOdds(mockCoverOddsForEventIds(eventIds), 3.5),
      source: 'mock',
      errors: ['Edge Function non raggiungibile: uso dati mock'],
    };
  }
}
