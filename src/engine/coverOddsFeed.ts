// F5 — liberidalavoro.it "OddsScasser" feed normalization (pure, no network).
// Shape di RawLdlEvent confermata dall'export reale fornito dall'utente
// (events). Lo shape esatto di /coverodds e /odds va confermato contro
// l'API autenticata reale (richiede LDL_BEARER_TOKEN, vedi
// supabase/functions/ldl-odds) — questo normalizzatore accetta un array
// "sites" per evento (parsing difensivo, tollerante a null/campi mancanti)
// cosi' da poter essere aggiustato senza riscritture quando arrivano i primi
// dati veri autenticati.

export interface RawLdlLeague {
  id: number;
  ref?: string | null;
  country?: string | null;
  name?: string | null;
  oddsscasser?: boolean;
  top?: boolean;
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
  datetime: string; // es. "2026-09-07T14:00:00"
  league: RawLdlLeague;
  home: RawLdlTeam;
  away: RawLdlTeam;
  status: string; // "Prematch" | "Finale" | "1 Tempo" | "Posticipato" | ...
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

export interface CoverOddsRow {
  eventId: string;
  home: string;
  away: string;
  kickoff: string;
  league: string;
  status: LdlMatchStatus;
  line: number;
  books: CoverOddsBook[];
}

export function normalizeCoverOdds(raw: RawLdlEvent[], line = 3.5): CoverOddsRow[] {
  return raw.map((ev) => {
    const books: CoverOddsBook[] = (ev.sites ?? [])
      .filter((s) => s.line === undefined || s.line === null || Math.abs(Number(s.line) - line) < 0.001)
      .map((s) => ({ book: s.site, under: toNum(s.under), over: toNum(s.over) }))
      .filter((b) => b.under !== null || b.over !== null);
    return {
      eventId: String(ev.id),
      home: ev.home?.name ?? '',
      away: ev.away?.name ?? '',
      kickoff: ev.datetime ?? '',
      league: ev.league?.name ?? '',
      status: normalizeLdlStatus(ev.status),
      line,
      books,
    };
  });
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
