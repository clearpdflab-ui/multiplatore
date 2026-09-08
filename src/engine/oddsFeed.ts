import type { Book } from '../types';

// F4a — odds-api.io feed normalization (pure, no network here).
// Raw shape follows https://docs.odds-api.io/guides/fetching-odds:
// bookmakers map -> markets array -> "Totals" entries { max, over, under }.

export interface RawMarket {
  name: string;
  odds?: Record<string, unknown>[];
}

export interface RawEventOdds {
  id: number | string;
  home: string;
  away: string;
  date?: string;
  status?: string;
  bookmakers?: Record<string, RawMarket[]>;
}

export interface BookTotals {
  book: string; // bookmaker name as reported by the API (es. "Snai IT")
  under: number | null; // quota Under @line
  over: number | null; // quota Over @line
}

export interface MatchOdds {
  eventId: string;
  home: string;
  away: string;
  kickoff: string; // ISO o ''
  status: string;
  line: number; // linea Totals selezionata (3.5)
  books: BookTotals[];
}

const toNum = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) && n > 1 ? n : null;
};

const lineOf = (entry: Record<string, unknown>): number | null => {
  for (const k of ['max', 'line', 'total', 'goalLine']) {
    const n = Number(entry[k]);
    if (Number.isFinite(n)) return n;
  }
  return null;
};

export function extractTotalsLine(markets: RawMarket[] | undefined, line: number): { under: number | null; over: number | null } | null {
  if (!markets) return null;
  const totals = markets.find((m) => m.name?.trim().toLowerCase() === 'totals');
  if (!totals?.odds) return null;
  for (const entry of totals.odds) {
    const l = lineOf(entry);
    if (l !== null && Math.abs(l - line) < 0.001) {
      return { under: toNum(entry.under), over: toNum(entry.over) };
    }
  }
  return null;
}

export function normalizeOddsEvents(raw: RawEventOdds[], line = 3.5): MatchOdds[] {
  const out: MatchOdds[] = [];
  for (const ev of raw) {
    const books: BookTotals[] = [];
    for (const [book, markets] of Object.entries(ev.bookmakers ?? {})) {
      const t = extractTotalsLine(markets, line);
      if (t && (t.under !== null || t.over !== null)) books.push({ book, under: t.under, over: t.over });
    }
    out.push({
      eventId: String(ev.id),
      home: ev.home ?? '',
      away: ev.away ?? '',
      kickoff: ev.date ?? '',
      status: ev.status ?? 'pending',
      line,
      books,
    });
  }
  return out;
}

export interface BestSide {
  book: string;
  odds: number;
}

export function bestTotalsSide(m: MatchOdds, side: 'under' | 'over'): BestSide | null {
  let best: BestSide | null = null;
  for (const b of m.books) {
    const q = b[side];
    if (q !== null && (!best || q > best.odds)) best = { book: b.book, odds: q };
  }
  return best;
}

// Row per dashboard comparatore: best under/over + spread sui book observed.
export interface CompareRow {
  eventId: string;
  match: string;
  kickoff: string;
  bestUnder: BestSide | null;
  bestOver: BestSide | null;
  booksWithUnder: number;
}

export function compareMatches(matches: MatchOdds[]): CompareRow[] {
  return matches.map((m) => ({
    eventId: m.eventId,
    match: `${m.home} - ${m.away}`,
    kickoff: m.kickoff,
    bestUnder: bestTotalsSide(m, 'under'),
    bestOver: bestTotalsSide(m, 'over'),
    booksWithUnder: m.books.filter((b) => b.under !== null).length,
  }));
}

// Collega il nome bookmaker dell'API ai Book gestionali (apiBookKey o nome,
// match case-insensitive, tollerante ai suffissi IT/UK).
export function findRegistryBook(books: Book[], apiName: string): Book | null {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+(it|uk|es|se|dk|fr|be|au|ca|nj)$/,'').replace(/[^a-z0-9]/g, '');
  const target = norm(apiName);
  let best: { book: Book; len: number } | null = null;
  for (const b of books) {
    const cands = [b.apiBookKey ?? '', b.name];
    for (const c of cands) {
      const n = norm(c);
      if (!n) continue;
      if (n === target || n.startsWith(target) || target.startsWith(n)) {
        const len = n.length;
        if (!best || len > best.len) best = { book: b, len };
      }
    }
  }
  return best?.book ?? null;
}

// Budget planner (pure): /odds/multi conta 1 chiamata fino a 10 eventi.
// Ogni account vede solo i suoi book selezionati: serve una chiamata-per-key.
export interface SweepPlan {
  eventCount: number;
  keyCount: number;
  chunksPerKey: number;
  callsPerSweep: number;
  sweepsPerDayPerKey: number;
  ok: boolean;
}

export function planSweep(eventCount: number, keyCount: number, perDayPerKey = 500, eventsPerCall = 10): SweepPlan {
  const n = Math.max(0, Math.floor(eventCount));
  const k = Math.max(0, Math.floor(keyCount));
  const chunksPerKey = n === 0 ? 0 : Math.ceil(n / Math.max(1, eventsPerCall));
  const callsPerSweep = chunksPerKey * k;
  const sweepsPerDayPerKey = k === 0 || chunksPerKey === 0 ? 0 : Math.floor(perDayPerKey / chunksPerKey);
  return { eventCount: n, keyCount: k, chunksPerKey, callsPerSweep, sweepsPerDayPerKey, ok: k > 0 && sweepsPerDayPerKey >= 1 };
}
