import { getSupabase, isSupabaseConfigured } from './supabaseClient';
import {
  buildSitesIndex,
  collectInactiveSiteIds,
  normalizeCoverOddsItems,
  normalizeEventsFeed,
  type CoverOddsRow,
  type RawLdlCoverOddsEntry,
  type RawLdlCoverOddsItem,
  type RawLdlEvent,
  type RawLdlSite,
} from '../engine/coverOddsFeed';
import {
  MOCK_LDL_COVERODDS,
  MOCK_LDL_COVER_EVENTS,
  MOCK_LDL_SITES,
} from '../data/mockCoverOdds';

// F5 client: Edge Function proxy (token LDL server-side).
// Shape REALI confermate sull'API autenticata (2026-09-10):
//  - /events -> metadati (datetime/lega/stato/punteggi), sites:null
//  - /sites  -> mappa id->nome bookmaker (nel feed odds site.name e' null)
//  - /odds?eventId=X -> offerte piatte di tutti i mercati x quel singolo evento
//  - /coverodds?eventId=X&selection=... -> alternative di copertura (per lato)
// Il calendario ha bisogno di U/O 3.5 per molti eventi: niente endpoint batch
// disponibile, quindi si interrogano /odds per i primi N eventi prossimi
// (concurrency limitata) e gli altri restano senza/books (non selezionabili).

const FN_PATH = '/functions/v1/ldl-odds';
const ODDS_FETCH_LIMIT = 24;
const ODDS_CONCURRENCY = 4;

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

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

function pickUpcoming(events: RawLdlEvent[], limit: number): RawLdlEvent[] {
  const now = Date.now();
  const isFuture = (e: RawLdlEvent) => {
    const t = e.datetime ? new Date(e.datetime).getTime() : NaN;
    return Number.isFinite(t) && t > now - 6 * 3600_000; // esclude solo i conclusi da tempo
  };
  const sorted = [...events].sort((a, b) => {
    const ta = a.datetime ? new Date(a.datetime).getTime() : Infinity;
    const tb = b.datetime ? new Date(b.datetime).getTime() : Infinity;
    return ta - tb;
  });
  const upcoming = sorted.filter(isFuture);
  return (upcoming.length > 0 ? upcoming : sorted).slice(0, limit);
}

async function fetchEdge(timeoutMs: number): Promise<CoverOddsFetchResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const [events, sites] = await Promise.all([
      fetchResource<RawLdlEvent[]>('events', ctrl.signal),
      fetchResource<RawLdlSite[]>('sites', ctrl.signal),
    ]);
    const sitesById = buildSitesIndex(sites);
    const targets = pickUpcoming(events, ODDS_FETCH_LIMIT);
    const errors: string[] = [];
    const oddsByEventId = new Map<string, RawLdlCoverOddsEntry[]>();
    // Budget morbido: se scade, si tornano comunque le righe con le quote
    // gia' caricate (parziali) invece di collassare sul mock.
    const softDeadline = Date.now() + Math.max(5000, timeoutMs - 7000);
    let skipped = 0;
    await mapWithConcurrency(targets, ODDS_CONCURRENCY, async (ev) => {
      if (Date.now() > softDeadline) {
        skipped++;
        return;
      }
      try {
        let entries: RawLdlCoverOddsEntry[];
        try {
          entries = await fetchResource<RawLdlCoverOddsEntry[]>('odds', ctrl.signal, { eventId: String(ev.id) });
        } catch {
          // instabilita' transitoria LDL su singoli eventi: un retry
          entries = await fetchResource<RawLdlCoverOddsEntry[]>('odds', ctrl.signal, { eventId: String(ev.id) });
        }
        oddsByEventId.set(String(ev.id), entries.filter((x) => x && x.type));
      } catch (e) {
        errors.push(`odds ${ev.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
    if (skipped > 0) errors.push(`quote solo per ${oddsByEventId.size}/${targets.length} eventi (budget tempo)`);
    return {
      matches: normalizeEventsFeed(events, {
        line: 3.5,
        sitesById,
        inactiveSiteIds: collectInactiveSiteIds(sites),
        oddsByEventId,
      }),
      source: 'edge',
      errors,
    };
  } finally {
    clearTimeout(timer);
  }
}

function mockResult(): CoverOddsFetchResult {
  const eventsById = new Map(MOCK_LDL_COVER_EVENTS.map((e) => [String(e.id), e]));
  return {
    matches: normalizeCoverOddsItems(MOCK_LDL_COVERODDS, {
      line: 3.5,
      sitesById: buildSitesIndex(MOCK_LDL_SITES),
      eventsById,
    }),
    source: 'mock',
    errors: ['Edge LDL non raggiungibile: uso dati mock'],
  };
}

export async function fetchCoverOdds(
  _eventIds: Array<number | string> = [],
  timeoutMs = 30000,
): Promise<CoverOddsFetchResult> {
  try {
    return await fetchEdge(timeoutMs);
  } catch {
    return mockResult();
  }
}

// ---- /puntapunta: ricerca coperti gia' ordinata per rating (1 sola chiamata) ----
// Parametri replicati dalla chiamata reale del sito (confirm 2026-09-10):
// sites1 = book della madre (Under 3.5), sites2PuntaPunta = book delle coperture
// (Over 3.5), oddsMin/oddsMax = filtro quota madre, dateTo = finestra eventi.

export interface CoverSuggestionParams {
  sites1: number[];
  sites2PuntaPunta: number[];
  oddsMin?: number;
  oddsMax?: number;
  dateTo?: string; // ISO toISOString()
  selections?: string;
  bet?: number;
}

export async function fetchCoverSuggestions(
  p: CoverSuggestionParams,
  timeoutMs = 30000,
): Promise<CoverOddsFetchResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
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
    };
    if (p.oddsMin !== undefined) query.oddsMin = String(p.oddsMin);
    if (p.oddsMax !== undefined) query.oddsMax = String(p.oddsMax);
    if (p.dateTo !== undefined) query.dateTo = p.dateTo;
    const [covers, sites, events] = await Promise.all([
      fetchResource<RawLdlCoverOddsItem[]>('puntapunta', ctrl.signal, query),
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
