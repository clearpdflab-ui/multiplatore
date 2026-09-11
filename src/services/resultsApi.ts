import { getSupabase, isSupabaseConfigured } from './supabaseClient';
import {
  normalizeMatchDetail,
  type NormalizedMatch,
  type RawMatchDetail,
} from '../engine/resultsFeed';
import { mockMatchDetailsForIds } from '../data/mockResults';

// F5 client: Edge Function proxy (scoretrend.net) -> normalizzazione match.
// Nessun token richiesto lato utente (API pubblica); se la Edge Function non
// e' raggiungibile la UI cade sui dati mock.

const FN_PATH = '/functions/v1/results';

export interface ResultsFetchResult {
  matches: NormalizedMatch[];
  source: 'edge' | 'mock';
  errors: string[];
}

async function fetchEdge(eventIds: string[], timeoutMs = 15000): Promise<ResultsFetchResult> {
  const sb = getSupabase();
  if (!sb || !isSupabaseConfigured) {
    throw new Error('supabase non configurato');
  }
  const url = new URL((import.meta.env.VITE_SUPABASE_URL as string) + FN_PATH);
  if (eventIds.length > 0) {
    url.searchParams.set('eventIds', eventIds.join(','));
  }
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
    if (!res.ok) {
      throw new Error(`edge HTTP ${res.status}`);
    }
    const body = await res.json();
    const raw = Array.isArray(body.data) ? (body.data as RawMatchDetail[]) : [];
    return {
      matches: raw.map(normalizeMatchDetail),
      source: 'edge',
      errors: body.error ? [String(body.error)] : [],
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchResults(eventIds: string[] = []): Promise<ResultsFetchResult> {
  try {
    return await fetchEdge(eventIds);
  } catch {
    return {
      matches: mockMatchDetailsForIds(eventIds).map(normalizeMatchDetail),
      source: 'mock',
      errors: ['Edge Function non raggiungibile: uso dati mock'],
    };
  }
}
