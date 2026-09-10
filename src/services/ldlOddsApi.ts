import { getSupabase, isSupabaseConfigured } from './supabaseClient';
import {
  buildSitesIndex,
  collectInactiveSiteIds,
  normalizeCoverOddsItems,
  type CoverOddsRow,
  type RawLdlCoverOddsItem,
  type RawLdlEvent,
  type RawLdlSite,
} from '../engine/coverOddsFeed';
import {
  MOCK_LDL_COVERODDS,
  MOCK_LDL_COVER_EVENTS,
  MOCK_LDL_SITES,
} from '../data/mockCoverOdds';

// F5 client: Edge Function proxy (token Cognito server-side, auto-refresh).
// Shape REALI confermate sull'API autenticata (2026-09-10):
//  - /events     -> metadati (datetime/lega/stato/punteggi), sites:null
//  - /sites      -> mappa id->nome bookmaker + flag type (attivi/rimossi/exchange)
//  - /puntapunta -> ricerca coperture: 1 sola chiamata, eventi con U+O appaiati
//                   e rating server-side, ordinabili. E' il feed del Calendario.
// Nel feed /puntapunta i metadati sono null: si merge con /events, i nomi book
// con /sites (site.name e' null nelle risposte odds).

const FN_PATH = '/functions/v1/ldl-odds';

export interface CoverOddsFetchResult {
  matches: CoverOddsRow[];
  source: 'edge' | 'mock';
  errors: string[];
}

async function fetchResource<T>(resource: string, signal: AbortSignal, extraParams?: Record<string, string>): Promise<T> {
  const sb = getSupabase();
  if (!sb || !isSupabaseConfigured) throw new Error('supabase non configurato');
  const url = new URL((import.meta.env.VITE_SUPABASE_URL as string) + FN_PATH);
  url.searchParams.set('resource', resource);
  for (const [k, v] of Object.entries(extraParams ?? {})) url.searchParams.set(k, v);
  const { data: s } = await sb.auth.getSession();
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${s.session?.access_token ?? (import.meta.env.VITE_SUPABASE_ANON_KEY as string)}`,
    },
    signal,
  });
  if (!res.ok) throw new Error(`edge HTTP ${res.status} su ${resource}`);
  const body = await res.json();
  if (body.error) throw new Error(`${resource}: ${body.error}`);
  return (Array.isArray(body.data) ? body.data : []) as T;
}

// Parametri replicati dalla chiamata reale del sito (dump utente 2026-09-10):
// sites1 = book madre (Under 3.5), sites2PuntaPunta = book coperture (Over 3.5),
// oddsMin/oddsMax = filtro quota madre, dateTo = finestra eventi (ISO).
export interface CoverSuggestionParams {
  sites1: number[];
  sites2PuntaPunta: number[];
  oddsMin?: number;
  oddsMax?: number;
  dateTo?: string; // ISO toISOString()
  dateFrom?: string; // ISO toISOString()
  selections?: string;
  bet?: number;
  size?: number; // pagine da N risultati (default 100, verificato sull'API)
  page?: number;
}

function buildPuntaPuntaQuery(p: CoverSuggestionParams): Record<string, string> {
  const query: Record<string, string> = {
    bet: String(p.bet ?? 100),
    bonus: '0',
    refund: '0',
    isFreebet: 'false',
    sports: '1,2,3',
    sites1: p.sites1.join(','),
    sites2PuntaPunta: p.sites2PuntaPunta.join(','),
    sites2: p.sites2PuntaPunta.join(','),
    selections: p.selections ?? 'Under 3.5,Over 3.5',
    blacklist: '',
    order: 'rating',
    twoOutcomes: 'true',
    threeOutcomes: 'true',
    feesBetfair: '4.5',
    feesBetflag: '5',
    feesBroker: '2.75',
    available: '0',
    leaguesIds: '',
    eventsIds: '',
    size: String(p.size ?? 100),
    page: String(p.page ?? 0),
  };
  if (p.oddsMin !== undefined) query.oddsMin = String(p.oddsMin);
  if (p.oddsMax !== undefined) query.oddsMax = String(p.oddsMax);
  if (p.dateTo !== undefined) query.dateTo = p.dateTo;
  if (p.dateFrom !== undefined) query.dateFrom = p.dateFrom;
  return query;
}

// Lancia in caso di errore edge: per chi vuole gestire il fallimento (CyclesDashboard).
export async function fetchCoverSuggestions(
  p: CoverSuggestionParams,
  timeoutMs = 30000,
): Promise<CoverOddsFetchResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const [covers, sites, events] = await Promise.all([
      fetchResource<RawLdlCoverOddsItem[]>('puntapunta', ctrl.signal, buildPuntaPuntaQuery(p)),
      fetchResource<RawLdlSite[]>('sites', ctrl.signal),
      fetchResource<RawLdlEvent[]>('events', ctrl.signal),
    ]);
    const sitesById = buildSitesIndex(sites);
    const eventsById = new Map(events.map((e) => [String(e.id), e]));
    const matches = normalizeCoverOddsItems(covers, {
      line: 3.5,
      sitesById,
      inactiveSiteIds: collectInactiveSiteIds(sites),
      eventsById,
    }).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    return { matches, source: 'edge', errors: [] };
  } finally {
    clearTimeout(timer);
  }
}

// Feed principale del Calendario: come fetchCoverSuggestions ma con caduta
// su mock invece di throw, cosi' la UI mostra sempre qualcosa + badge fonte.
export async function fetchCoverFeed(
  p: CoverSuggestionParams,
  timeoutMs = 30000,
): Promise<CoverOddsFetchResult> {
  try {
    return await fetchCoverSuggestions(p, timeoutMs);
  } catch (e) {
    const eventsById = new Map(MOCK_LDL_COVER_EVENTS.map((ev) => [String(ev.id), ev]));
    return {
      matches: normalizeCoverOddsItems(MOCK_LDL_COVERODDS, {
        line: 3.5,
        sitesById: buildSitesIndex(MOCK_LDL_SITES),
        eventsById,
      }),
      source: 'mock',
      errors: [e instanceof Error ? e.message : String(e)],
    };
  }
}

// Bookmaker attivi LDL (type=bookmaker) per i selettori coppia book.
export async function fetchLdlBookmakers(timeoutMs = 15000): Promise<Array<{ id: number; name: string }>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const sites = await fetchResource<RawLdlSite[]>('sites', ctrl.signal);
    return sites
      .filter((s) => s.type === 'bookmaker' && s.name)
      .map((s) => ({ id: s.id, name: String(s.name) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } finally {
    clearTimeout(timer);
  }
}
