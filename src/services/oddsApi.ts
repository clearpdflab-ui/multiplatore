import { getSupabase, isSupabaseConfigured } from './supabaseClient';
import { normalizeOddsEvents, type MatchOdds, type RawEventOdds } from '../engine/oddsFeed';
import { mockOddsForEventIds } from '../data/mockOdds';

// F4a client: Edge Function proxy (chiavi server-side) -> raw merge ->
// normalizzazione Totals 3.5. Senza sessione/configura la UI cade sul mock.

const FN_PATH = '/functions/v1/odds';

export interface OddsFetchResult {
  matches: MatchOdds[];
  source: 'edge' | 'mock';
  errors: string[];
}

async function fetchEdge(eventIds: number[], timeoutMs = 15000): Promise<OddsFetchResult> {
  const sb = getSupabase();
  if (!sb || !isSupabaseConfigured) throw new Error('supabase non configurato');
  const url = (import.meta.env.VITE_SUPABASE_URL as string) + FN_PATH;
  const { data: s } = await sb.auth.getSession();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${s.session?.access_token ?? (import.meta.env.VITE_SUPABASE_ANON_KEY as string)}`,
      },
      body: JSON.stringify({ eventIds }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`edge HTTP ${res.status}`);
    const body = await res.json();
    const raw = Array.isArray(body.data) ? (body.data as RawEventOdds[]) : [];
    return {
      matches: normalizeOddsEvents(raw, 3.5),
      source: 'edge',
      errors: Array.isArray(body.errors) ? (body.errors as string[]) : [],
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchMatchOdds(eventIds: number[] = []): Promise<OddsFetchResult> {
  try {
    return await fetchEdge(eventIds);
  } catch {
    return {
      matches: normalizeOddsEvents(mockOddsForEventIds(eventIds), 3.5),
      source: 'mock',
      errors: ['Edge Function non raggiungibile: uso dati mock'],
    };
  }
}
