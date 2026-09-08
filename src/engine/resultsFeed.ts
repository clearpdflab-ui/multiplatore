// F5 — scoretrend.net feed normalization (pure, no network).
// Raw shape confermata via richieste dirette a api.scoretrend.net:
// GET /live-event-filtered -> punteggi live di tutti gli eventi in corso.
// POST /search/matches (body: string[] di eventid) -> dettaglio partita,
// incl. time_status (0=non iniziata, 1=live, 3=terminata) e punteggio "ss"
// nel formato "H-A" (es. "2-1").

export interface RawLiveEvent {
  eventid: string;
  home?: string;
  away?: string;
  ss?: string;
  time_status?: number;
  league?: string;
}

export interface RawMatchDetail {
  id?: string;
  eventid: string;
  home?: string;
  away?: string;
  ss?: string;
  time_status?: number;
  league?: string;
}

export type ResultStatus = 'scheduled' | 'live' | 'finished' | 'unknown';

const TIME_STATUS_MAP: Record<number, ResultStatus> = {
  0: 'scheduled',
  1: 'live',
  3: 'finished',
};

// Codici osservati: 0/1/3. Un codice non mappato ricade su 'live' (default
// prudente: meglio ricontrollare troppo spesso che perdere l'esito di un
// leg realmente giocato). Solo l'assenza del campo e' 'unknown'.
export function normalizeMatchTimeStatus(timeStatus: number | undefined): ResultStatus {
  if (timeStatus === undefined) return 'unknown';
  return TIME_STATUS_MAP[timeStatus] ?? 'live';
}

export function parseScoreString(ss: string | undefined | null): { home: number; away: number } | null {
  if (!ss) return null;
  const m = /^(\d+)-(\d+)$/.exec(ss.trim());
  if (!m) return null;
  return { home: Number(m[1]), away: Number(m[2]) };
}

export interface NormalizedMatch {
  eventId: string;
  home: string;
  away: string;
  status: ResultStatus;
  homeGoals: number | null;
  awayGoals: number | null;
  totalGoals: number | null;
}

export function normalizeMatchDetail(raw: RawMatchDetail): NormalizedMatch {
  const score = parseScoreString(raw.ss);
  return {
    eventId: String(raw.eventid),
    home: raw.home ?? '',
    away: raw.away ?? '',
    status: normalizeMatchTimeStatus(raw.time_status),
    homeGoals: score?.home ?? null,
    awayGoals: score?.away ?? null,
    totalGoals: score ? score.home + score.away : null,
  };
}

export function isOverLine(totalGoals: number | null, line = 3.5): boolean | null {
  if (totalGoals === null) return null;
  return totalGoals > line;
}

// NFD scompone le lettere accentate in base + segno diacritico separato;
// il filtro a-z0-9 che segue elimina gia' da solo sia il diacritico che ogni
// altra punteggiatura/spazio, senza bisogno di un secondo passaggio dedicato.
const normTeam = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');

// Match per nome squadra esatto-normalizzato (case/accenti/punteggiatura
// ignorati). Nessun candidato o piu' di uno -> null: non esiste ancora un
// campo orario affidabile nello schema osservato per disambiguare, quindi
// un match ambiguo e' meglio di un match sbagliato.
export function matchEventByTeams(candidates: RawMatchDetail[], home: string, away: string): RawMatchDetail | null {
  const h = normTeam(home);
  const a = normTeam(away);
  const hits = candidates.filter((c) => normTeam(c.home ?? '') === h && normTeam(c.away ?? '') === a);
  return hits.length === 1 ? hits[0] : null;
}
