// F5 — liberidalavoro.it "OddsScasser" feed normalization (pure, no network).
// Due shape reali, entrambe confermate contro l'API autenticata (2026-09-10):
//  - GET /events    -> RawLdlEvent[] (metadati completi; `sites` puo' essere null)
//  - GET /coverodds -> RawLdlCoverOddsItem[] ({event(solo id/squadre), odds[], rating});
//                     qui site.name/datetime/league/status sono NULL: il nome book
//                     si risolve via GET /sites (id->name) e i metadati via /events.
// normalizeCoverOdds gestisce la shape events+sites; normalizeCoverOddsItems la
// shape coverodds con indici esterni. Parsing difensivo ovunque.

export interface RawLdlLeague {
  id?: number | null;
  ref?: string | null;
  country?: string | null;
  name?: string | null;
  oddsscasser?: boolean | null;
  top?: boolean | null;
  sport?: { id?: number | null; name?: string | null } | null;
}

export interface RawLdlTeam {
  id: number;
  name: string;
  code?: string | null;
  score?: number | null;
}

export interface RawLdlSiteOdds {
  site: string; // nome bookmaker (da GET sites)
  under?: number | string | null;
  over?: number | string | null;
  line?: number | string | null;
}

export interface RawLdlEvent {
  id: number | string;
  datetime?: string | null; // es. "2026-09-07T14:00:00"; null nel feed coverodds
  league?: RawLdlLeague | null;
  home: RawLdlTeam;
  away: RawLdlTeam;
  status?: string | null; // "Prematch" | "Finale" | "1 Tempo" | "Posticipato" | ...
  sites?: RawLdlSiteOdds[] | null;
  urls?: unknown;
}

export type LdlMatchStatus = 'scheduled' | 'live' | 'finished' | 'postponed' | 'other';

const STATUS_MAP: Record<string, LdlMatchStatus> = {
  prematch: 'scheduled',
  finale: 'finished',
  posticipato: 'postponed',
  'vittoria per ritiro': 'finished',
};

export function normalizeLdlStatus(raw: string | undefined | null): LdlMatchStatus {
  const s = (raw ?? '').trim().toLowerCase();
  if (!s) return 'scheduled';
  if (s in STATUS_MAP) return STATUS_MAP[s];
  if (/tempo|recupero|intervallo/.test(s)) return 'live';
  return 'other';
}

const toNum = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) && n > 1 ? n : null;
};

export interface CoverOddsBook {
  book: string;
  under: number | null;
  over: number | null;
}

export type LineStatus = 'safe' | 'warning' | 'over';

export interface CoverOddsRow {
  eventId: string;
  home: string;
  away: string;
  kickoff: string;
  league: string;
  status: LdlMatchStatus;
  line: number;
  books: CoverOddsBook[];
  homeScore: number | null;
  awayScore: number | null;
  totalGoals: number | null;
  lineStatus: LineStatus | null;
  rating?: number | null; // da /bestevents e /puntapunta (qualita' copertura)
}

function computeLineStatus(totalGoals: number | null, line: number): LineStatus | null {
  if (totalGoals === null) return null;
  if (totalGoals > line) return 'over';
  if (totalGoals === Math.floor(line)) return 'warning';
  return 'safe';
}

export function normalizeCoverOdds(raw: RawLdlEvent[], line = 3.5): CoverOddsRow[] {
  return raw.map((ev) => {
    const books: CoverOddsBook[] = (ev.sites ?? [])
      .filter((s) => s.line === undefined || s.line === null || Math.abs(Number(s.line) - line) < 0.001)
      .map((s) => ({ book: s.site, under: toNum(s.under), over: toNum(s.over) }))
      .filter((b) => b.under !== null || b.over !== null);
    return buildRow(ev, books, line);
  });
}

function buildRow(ev: RawLdlEvent, books: CoverOddsBook[], line: number): CoverOddsRow {
  const homeScore = ev.home?.score ?? null;
  const awayScore = ev.away?.score ?? null;
  const totalGoals = homeScore !== null && awayScore !== null ? homeScore + awayScore : null;
  return {
    eventId: String(ev.id),
    home: ev.home?.name ?? '',
    away: ev.away?.name ?? '',
    kickoff: ev.datetime ?? '',
    league: ev.league?.name ?? '',
    status: normalizeLdlStatus(ev.status),
    line,
    books,
    homeScore,
    awayScore,
    totalGoals,
    lineStatus: computeLineStatus(totalGoals, line),
  };
}

export interface BestCoverSide {
  book: string;
  odds: number;
}

export function bestCoverSide(row: CoverOddsRow, side: 'under' | 'over'): BestCoverSide | null {
  let best: BestCoverSide | null = null;
  for (const b of row.books) {
    const q = b[side];
    if (q !== null && (!best || q > best.odds)) best = { book: b.book, odds: q };
  }
  return best;
}

// Nota: il matching book LDL -> Book gestionale riusa direttamente
// findRegistryBook (src/engine/oddsFeed.ts): stesso schema "nome esterno ->
// apiBookKey/nome", nessuna nuova logica di normalizzazione qui.

// ---- Shape reale di GET /coverodds (conferma 2026-09-10 su dump autenticato) ----

export interface RawLdlCoverSiteRef {
  id: number;
  name?: string | null;
  url?: string | null;
}

export interface RawLdlCoverOddsEntry {
  id: number;
  site: RawLdlCoverSiteRef;
  type: string; // "Under 3.5" | "Over 3.5" | ...
  typeId?: number | null; // 13 = Under, 14 = Over (osservato)
  bet?: boolean | null;
  odds: number | string | null;
  lastUpdate?: string | null;
  lastChange?: string | null;
  url?: string | null;
}

export interface RawLdlCoverOddsItem {
  mode?: string | null;
  event: RawLdlEvent; // nel feed reale qui dentro id/squadre sono veri, tutto il resto null
  odds: RawLdlCoverOddsEntry[] | null;
  rating?: number | null;
  avgRating?: number | null;
  avgWinnings?: number | null;
}

export interface RawLdlSite {
  id: number;
  name?: string | null;
  url?: string | null;
  type?: string | null; // "bookmaker"
}

const COVER_TYPE_RE = /^(under|over)\s+(\d+(?:[.,]\d+)?)$/i;

export function parseCoverType(type: string | undefined | null):
  { side: 'under' | 'over'; line: number } | null {
  const m = COVER_TYPE_RE.exec((type ?? '').trim());
  if (!m) return null;
  const line = Number(m[2].replace(',', '.'));
  if (!Number.isFinite(line)) return null;
  return { side: m[1].toLowerCase() as 'under' | 'over', line };
}

export function buildSitesIndex(sites: RawLdlSite[]): Record<string, string> {
  const idx: Record<string, string> = {};
  for (const s of sites) {
    if (s?.id !== undefined && s.name) idx[String(s.id)] = s.name;
  }
  return idx;
}

// I siti LDL hanno un flag type: "bookmaker" = attivo; "bookmaker_removed"/
// "bookmaker_hidden" = non più utilizzabile; "exchange" = exchange (Betfair/
// Betflag, usato solo per il lock, non come book di copertura).
export function collectInactiveSiteIds(sites: RawLdlSite[]): Set<string> {
  const out = new Set<string>();
  for (const s of sites) {
    if (s?.id !== undefined && s.type && s.type !== 'bookmaker') out.add(String(s.id));
  }
  return out;
}

function bookNameFromSite(site: RawLdlCoverSiteRef, sitesById: Record<string, string>): string {
  const byId = sitesById[String(site?.id)];
  if (byId) return byId;
  if (site?.name) return site.name;
  if (site?.url) {
    try {
      return new URL(site.url).hostname.replace(/^www\./, '');
    } catch { /* url malformata: fallback sotto */ }
  }
  return String(site?.id ?? 'unknown');
}

export function normalizeCoverOddsItems(
  items: RawLdlCoverOddsItem[],
  opts: {
    line?: number;
    sitesById?: Record<string, string>;
    inactiveSiteIds?: Set<string>;
    eventsById?: Map<string, RawLdlEvent> | Record<string, RawLdlEvent>;
  } = {},
): CoverOddsRow[] {
  const line = opts.line ?? 3.5;
  const sitesById = opts.sitesById ?? {};
  const eventsById = opts.eventsById instanceof Map
    ? opts.eventsById
    : new Map(Object.entries(opts.eventsById ?? {}));

  const rows: CoverOddsRow[] = [];
  for (const item of items) {
    const ev = item?.event;
    if (!ev || ev.id === undefined || ev.id === null) continue;
    const idKey = String(ev.id);

    // Metadati (datetime/league/status/score) arrivano da /events: il feed
    // coverodds li ha null. Fallback prudente sull'evento incorporato.
    const meta = eventsById.get(idKey);
    const enriched: RawLdlEvent = meta
      ? { ...meta, home: { ...meta.home, name: ev.home?.name ?? meta.home?.name }, away: { ...meta.away, name: ev.away?.name ?? meta.away?.name } }
      : { ...ev, sites: null };
    rows.push({
      ...buildRow(
        enriched,
        buildBooksFromEntries(item.odds ?? [], line, sitesById, opts.inactiveSiteIds),
        line,
      ),
      rating: typeof item.rating === 'number' ? item.rating : null,
    });
  }
  return rows;
}

// ---- Shape reale di GET /odds?eventId=<id> (conferma 2026-09-10) ----
// Lista piatta di offerte (tutti i mercati x ~45 siti) per UN evento:
// {id, site{id,name:null,url}, type:"Under 3.5", odds, bet, ...}.

export function buildBooksFromEntries(
  entries: RawLdlCoverOddsEntry[],
  line: number,
  sitesById: Record<string, string>,
  inactiveSiteIds?: Set<string>,
): CoverOddsBook[] {
  const byBook = new Map<string, CoverOddsBook>();
  for (const entry of entries) {
    const parsed = parseCoverType(entry?.type);
    if (!parsed || Math.abs(parsed.line - line) > 0.001) continue;
    if (inactiveSiteIds?.has(String(entry?.site?.id))) continue;
    const q = toNum(entry.odds);
    if (q === null) continue;
    const name = bookNameFromSite(entry.site, sitesById);
    const cur = byBook.get(name) ?? { book: name, under: null, over: null };
    if (parsed.side === 'under') cur.under = cur.under === null ? q : Math.max(cur.under, q);
    else cur.over = cur.over === null ? q : Math.max(cur.over, q);
    byBook.set(name, cur);
  }
  return Array.from(byBook.values());
}

// Feed principale del Calendario: lista eventi da /events (metadati veri,
// `sites` sempre null nell'API reale) + quote /odds?eventId aggregate per id.
export function normalizeEventsFeed(
  events: RawLdlEvent[],
  opts: {
    line?: number;
    sitesById?: Record<string, string>;
    inactiveSiteIds?: Set<string>;
    oddsByEventId?: Map<string, RawLdlCoverOddsEntry[]> | Record<string, RawLdlCoverOddsEntry[]>;
  } = {},
): CoverOddsRow[] {
  const line = opts.line ?? 3.5;
  const sitesById = opts.sitesById ?? {};
  const oddsByEventId = opts.oddsByEventId instanceof Map
    ? opts.oddsByEventId
    : new Map(Object.entries(opts.oddsByEventId ?? {}));
  return events
    .filter((ev) => ev && ev.id !== undefined && ev.id !== null)
    .map((ev) => {
      const entries = oddsByEventId.get(String(ev.id)) ?? (ev.sites ? sitesToEntries(ev.sites) : []);
      return buildRow(
        { ...ev, sites: null },
        buildBooksFromEntries(entries, line, sitesById, opts.inactiveSiteIds),
        line,
      );
    });
}

function sitesToEntries(sites: RawLdlSiteOdds[]): RawLdlCoverOddsEntry[] {
  const out: RawLdlCoverOddsEntry[] = [];
  for (const s of sites) {
    const line = s.line ?? 3.5;
    if (s.under !== undefined && s.under !== null) {
      out.push({ id: 0, site: { id: 0, name: s.site }, type: `Under ${line}`, odds: s.under });
    }
    if (s.over !== undefined && s.over !== null) {
      out.push({ id: 0, site: { id: 0, name: s.site }, type: `Over ${line}`, odds: s.over });
    }
  }
  return out;
}
