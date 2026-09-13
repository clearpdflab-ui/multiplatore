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
  if (!s) {
    return 'scheduled';
  }
  if (s in STATUS_MAP) {
    return STATUS_MAP[s];
  }
  if (/tempo|recupero|intervallo/.test(s)) {
    return 'live';
  }
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
  country: string; // nazione lega (es. Italia vs Brasile: "Serie A" da sola e' ambigua)
  status: LdlMatchStatus;
  line: number;
  books: CoverOddsBook[];
  homeScore: number | null;
  awayScore: number | null;
  totalGoals: number | null;
  lineStatus: LineStatus | null;
  rating?: number | null; // da /bestevents e /puntapunta (qualita' copertura)
}

// F25 — l'API LDL manda wall-time UTC SENZA timezone ("2026-09-13T16:00:00"
// oppure "09/13/2026 16:00:00" MM/DD/YYYY): vanno letti come UTC, altrimenti
// in Italia (UTC+2) risultano 2 ore INDIETRO su display, hideStarted e alert.
// Stringhe con timezone esplicita (Z / offset) passano invariate.
const ISO_NAIVE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;
const US_NAIVE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/;
const TZ_AWARE_RE = /(?:[zZ]|[+-]\d{2}:?\d{2})$/;

export function parseLdlDateTime(v: string | null | undefined): number {
  if (v === null || v === undefined) {
    return NaN;
  }
  const s = String(v).trim();
  if (!s) {
    return NaN;
  }
  if (TZ_AWARE_RE.test(s)) {
    return new Date(s).getTime();
  }
  if (ISO_NAIVE_RE.test(s)) {
    return new Date(`${s}Z`).getTime();
  }
  const m = US_NAIVE_RE.exec(s);
  if (m) {
    return Date.UTC(+m[3], +m[1] - 1, +m[2], +m[4], +m[5], +(m[6] ?? 0));
  }
  return new Date(s).getTime(); // fallback: formati non previsti
}

// F16 — ordine di proposta del Calendario/Trova Partite: data e orario di
// kickoff CRESCENTI (il relay e' sequenziale nel tempo). Righe senza kickoff
// valido (metadati /events mancanti -> '') finiscono in fondo; sort stabile
// per pari data (l'ordine di arrivo del feed resta dentro la stessa fascia).
export function byKickoffAsc(a: CoverOddsRow, b: CoverOddsRow): number {
  const ta = parseLdlDateTime(a.kickoff);
  const tb = parseLdlDateTime(b.kickoff);
  const aOk = Number.isFinite(ta);
  const bOk = Number.isFinite(tb);
  if (aOk && bOk) {
    return ta - tb;
  }
  if (aOk) {
    return -1;
  }
  if (bOk) {
    return 1;
  }
  return 0;
}

// F16b — una partita il cui kickoff e' gia' passato (ora attuale >= kickoff)
// e' GIA' INIZIATA: non va proposta per una nuova multipla. Righe senza
// kickoff valido non sono marcate come iniziate (non si puo' dire; restano
// visibili e ordinate in fondo da byKickoffAsc).
export function hasKickoffPassed(row: CoverOddsRow, now: number): boolean {
  const t = parseLdlDateTime(row.kickoff);
  return Number.isFinite(t) && t <= now;
}

// F17 — partita TROPPO VICINA: kickoff futuro ma a meno di `hours` dall'ora
// attuale (default regola relay: 2 ore). Selezionarla per errore va segnalato:
// resta poco tempo per piazzare madre e copertura prima dell'avvio.
export function isKickoffTooSoon(row: CoverOddsRow, now: number, hours = 2): boolean {
  const t = parseLdlDateTime(row.kickoff);
  return Number.isFinite(t) && t > now && t - now <= hours * 3600_000;
}

// F22 — vincoli scala del finder:
// - MIN_GAP_MS: gap minimo tra due kickoff consecutivi della STESSA scala
//   (regola relay: servono ~2 ore tra un match e il successivo per piazzare
//   la copertura dopo l'esito).
// - dedupKey: stessa partita (squadre normalizzate + kickoff) anche se
//   arriva da leghe/feed diversi o con eventId diverso -> una sola volta.
export const MIN_GAP_MS = 2 * 3600_000;

function normTeam(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

export function dedupKey(row: CoverOddsRow): string {
  // Squadre ordinate (un duplicato puo' invertirle) + kickoff al minuto
  // (stesso istante in formati diversi resta uguale).
  const teams = [normTeam(row.home), normTeam(row.away)].sort();
  const t = parseLdlDateTime(row.kickoff);
  const when = Number.isFinite(t) ? String(Math.floor(t / 60000)) : row.kickoff;
  return `${teams[0]}|${teams[1]}|${when}`;
}

// Gap in ms tra due kickoff; NaN se uno dei due non e' valido (non giudicabile).
export function kickoffGapMs(a: CoverOddsRow, b: CoverOddsRow): number {
  return parseLdlDateTime(b.kickoff) - parseLdlDateTime(a.kickoff);
}

// F23 — il feed LDL duplica partite reali (stesso match, eventId diversi:
// es. Flamengo-Bragantino 168702 + 168881, stesso kickoff). Senza dedup la
// stessa partita puo' finire 2 volte in lista e nella multipla, con quote
// diverse ("quote a caso"). Tiene una riga per chiave: piu' book vince,
// a pari book rating piu' alto, poi primo visto. Ordine stabile.
export function dedupeRows(rows: CoverOddsRow[]): CoverOddsRow[] {
  const best = new Map<string, CoverOddsRow>();
  const score = (r: CoverOddsRow): number => r.books.length * 1e6 + (r.rating ?? -1);
  for (const r of rows) {
    const k = dedupKey(r);
    const cur = best.get(k);
    if (!cur || score(r) > score(cur)) {
      best.set(k, r);
    }
  }
  return Array.from(best.values());
}

function computeLineStatus(totalGoals: number | null, line: number): LineStatus | null {
  if (totalGoals === null) {
    return null;
  }
  if (totalGoals > line) {
    return 'over';
  }
  if (totalGoals === Math.floor(line)) {
    return 'warning';
  }
  return 'safe';
}

export function normalizeCoverOdds(raw: RawLdlEvent[], line = 3.5): CoverOddsRow[] {
  return raw.map((ev) => {
    const books: CoverOddsBook[] = (ev.sites ?? [])
      .filter(
        (s) => s.line === undefined || s.line === null || Math.abs(Number(s.line) - line) < 0.001,
      )
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
    country: ev.league?.country ?? '',
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
    if (q !== null && (!best || q > best.odds)) {
      best = { book: b.book, odds: q };
    }
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

export function parseCoverType(
  type: string | undefined | null,
): { side: 'under' | 'over'; line: number } | null {
  const m = COVER_TYPE_RE.exec((type ?? '').trim());
  if (!m) {
    return null;
  }
  const line = Number(m[2].replace(',', '.'));
  if (!Number.isFinite(line)) {
    return null;
  }
  return { side: m[1].toLowerCase() as 'under' | 'over', line };
}

export function buildSitesIndex(sites: RawLdlSite[]): Record<string, string> {
  const idx: Record<string, string> = {};
  for (const s of sites) {
    if (s?.id !== undefined && s.name) {
      idx[String(s.id)] = s.name;
    }
  }
  return idx;
}

// I siti LDL hanno un flag type: "bookmaker" = attivo; "bookmaker_removed"/
// "bookmaker_hidden" = non più utilizzabile; "exchange" = exchange (Betfair/
// Betflag, usato solo per il lock, non come book di copertura).
export function collectInactiveSiteIds(sites: RawLdlSite[]): Set<string> {
  const out = new Set<string>();
  for (const s of sites) {
    if (s?.id !== undefined && s.type && s.type !== 'bookmaker') {
      out.add(String(s.id));
    }
  }
  return out;
}

function bookNameFromSite(site: RawLdlCoverSiteRef, sitesById: Record<string, string>): string {
  const byId = sitesById[String(site?.id)];
  if (byId) {
    return byId;
  }
  if (site?.name) {
    return site.name;
  }
  if (site?.url) {
    try {
      return new URL(site.url).hostname.replace(/^www\./, '');
    } catch {
      /* url malformata: fallback sotto */
    }
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
  const eventsById =
    opts.eventsById instanceof Map
      ? opts.eventsById
      : new Map(Object.entries(opts.eventsById ?? {}));

  const rows: CoverOddsRow[] = [];
  for (const item of items) {
    const ev = item?.event;
    if (!ev || ev.id === undefined || ev.id === null) {
      continue;
    }
    const idKey = String(ev.id);

    // Metadati (datetime/league/status/score) arrivano da /events: il feed
    // coverodds li ha null. Fallback prudente sull'evento incorporato.
    const meta = eventsById.get(idKey);
    const enriched: RawLdlEvent = meta
      ? {
          ...meta,
          home: { ...meta.home, name: ev.home?.name ?? meta.home?.name },
          away: { ...meta.away, name: ev.away?.name ?? meta.away?.name },
        }
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
  return dedupeRows(rows);
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
    if (!parsed || Math.abs(parsed.line - line) > 0.001) {
      continue;
    }
    if (inactiveSiteIds?.has(String(entry?.site?.id))) {
      continue;
    }
    const q = toNum(entry.odds);
    if (q === null) {
      continue;
    }
    const name = bookNameFromSite(entry.site, sitesById);
    const cur = byBook.get(name) ?? { book: name, under: null, over: null };
    if (parsed.side === 'under') {
      cur.under = cur.under === null ? q : Math.max(cur.under, q);
    } else {
      cur.over = cur.over === null ? q : Math.max(cur.over, q);
    }
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
  const oddsByEventId =
    opts.oddsByEventId instanceof Map
      ? opts.oddsByEventId
      : new Map(Object.entries(opts.oddsByEventId ?? {}));
  return dedupeRows(
    events
      .filter((ev) => ev && ev.id !== undefined && ev.id !== null)
      .map((ev) => {
        const entries =
          oddsByEventId.get(String(ev.id)) ?? (ev.sites ? sitesToEntries(ev.sites) : []);
        return buildRow(
          { ...ev, sites: null },
          buildBooksFromEntries(entries, line, sitesById, opts.inactiveSiteIds),
          line,
        );
      }),
  );
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
