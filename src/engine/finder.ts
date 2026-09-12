import {
  bestCoverSide,
  byKickoffAsc,
  hasKickoffPassed,
  type CoverOddsRow,
} from './coverOddsFeed';
import { solveMatrix, type MatrixBranch } from './matrix';
import type { UserMatch } from '../types';

// F19/F20 — MOTORE DI RICERCA SCALE ARMONIZZATE ("finder").
//
// Data la pool di partite del calendario (kickoff + quote U/O reali), trova
// le SEQUENZE cronologiche di N eventi la cui scala chiude la regola
// MAI-PERDITA: OGNI esito finale con netto >= target. Il motore sceglie lui:
// numero eventi N, stake S0, payout comune D e SINGOLA FINALE (banca lay
// exchange con fee utente, oppure punta/punta) — vince la configurazione
// fattibile col miglior garantito / minor capitale.
//
// Matematica (stessa di slips.ts, F15/F20):
//   lay:  k = (L-c)/(1-c); S = SOMMA_j 1/m_j (solo coperture)
//         fattibile <=> k*S < 1; I = (b+k*t*S)/(1-k*S); D = k*(I+t)
//         s_j = D/m_j ; B = D/(L-c) (bancata sul ramo peggiore)
//   book: dutching puro, singola inclusa: S' su C1..CN
//         fattibile <=> S' < 1; D' = (b+t)/(1-S')
//
// La ricerca e' una beam search cronologica (l'ordine e' fissato dal
// kickoff): ogni candidato viene valutato ESATTAMENTE riusando
// generateCustomSlips con harmonized, cosi' i numeri proposti sono gli
// stessi che il workbench ricalcola all'import.

export interface FinderParams {
  rows: CoverOddsRow[];
  now: number;
  baseStake: number;
  targetProfit: number;
  layCommissionPct?: number; // default 4.5 (fee exchange utente)
  lay: 'prematch' | number; // 'prematch' = Under dell'ultimo match della scala
  oddsMin?: number; // minimo quota OGNI selezione (regola: mai sotto 1.25)
  minEvents?: number; // default 5 (da qui il bonus)
  maxEvents?: number; // default 9 (fino a 30, madre standard)
  finaleModes?: ('lay' | 'book')[]; // default entrambi: decide il motore
  topK?: number; // default 3
  beamWidth?: number; // default 30
  evalBudget?: number; // valutazioni esatte massime (default 12000)
}

export interface FinderCandidate {
  eventIds: string[];
  rows: CoverOddsRow[]; // sequenza cronologica
  n: number;
  finaleMode: 'lay' | 'book'; // scelta del motore per questa scala
  layQuote: number; // 0 in book (nessuna banca)
  layCommissionPct: number;
  feasible: boolean;
  equalizedNet: number | null;
  branchNets: number[]; // netto "se vince": [madre, C1.., (banca)]
  legs: MatrixBranch[]; // matrice: una riga per ramo (S0, C1.., FINALE)
  bookStakes: number; // I
  liability: number; // responsabilita' banca (0 in book)
  exposure: number; // I + liability
  motherGross: number;
  stakes: number[]; // [S0, C1.., (B)]
  maxLayQuote: number; // 0 = N/A in book
  kFactor: number; // 1 in book
  sumInverse: number; // SOMMA 1/m (lay: solo coperture; book: + singola)
  bindingStep: number; // step (1-based) della copertura col 1/m max
}

export interface FinderResult {
  feasible: FinderCandidate[]; // topK fattibili: equalized desc, poi capitale asc
  best: FinderCandidate | null;
  closestMaxLay: number | null; // lay max piu' alta tra i candidati completi
  poolSize: number;
  evaluations: number;
  budgetHit: boolean;
}

function rowsToMatches(rows: CoverOddsRow[]): UserMatch[] {
  return rows.map((r, idx) => {
    const under = bestCoverSide(r, 'under');
    const over = bestCoverSide(r, 'over');
    return {
      id: `finder_${r.eventId}`,
      order: idx + 1,
      timeSlot: r.kickoff,
      homeTeam: r.home,
      awayTeam: r.away,
      underOdds: under?.odds ?? 1.3,
      overOdds: over?.odds ?? 3.0,
      outcome: 'PENDING' as const,
      kickoff: r.kickoff || undefined,
    };
  });
}

function evaluateSequence(
  rows: CoverOddsRow[],
  baseStake: number,
  targetProfit: number,
  layCommissionPct: number,
  layQuote: number,
  mode: 'lay' | 'book',
): FinderCandidate | null {
  if (rows.length < 2) {
    return null;
  }
  if (mode === 'lay' && !(layQuote > 1)) {
    return null;
  }
  const sol = solveMatrix({
    matches: rowsToMatches(rows),
    baseStake,
    targetProfit,
    layCommissionPct,
    layQuote,
    finaleModes: [mode],
  });
  if (!sol || sol.finaleMode !== mode) {
    return null;
  }
  return {
    eventIds: rows.map((x) => x.eventId),
    rows,
    n: rows.length,
    finaleMode: sol.finaleMode,
    layQuote: sol.layQuote,
    layCommissionPct: sol.layCommissionPct,
    feasible: sol.feasible,
    equalizedNet: sol.equalizedNet,
    branchNets: sol.branchNets,
    legs: sol.branches,
    bookStakes: sol.bookStakes,
    liability: sol.liability,
    exposure: sol.exposure,
    motherGross: sol.motherGross,
    stakes: sol.stakes,
    maxLayQuote: sol.maxLayQuote,
    kFactor: sol.kFactor,
    sumInverse: sol.sumInverse,
    bindingStep: sol.bindingStep,
  };
}

export function findHarmonizableLadders(params: FinderParams): FinderResult {
  const comm = params.layCommissionPct ?? 4.5;
  // Regola metodo: mai sotto quota 1.25 su OGNI selezione (madre e coperture).
  const oddsMin = Math.max(1.25, params.oddsMin ?? 1.25);
  const minEvents = Math.max(2, Math.min(params.minEvents ?? 5, 30));
  const maxEvents = Math.max(minEvents, Math.min(params.maxEvents ?? 9, 30));
  const modes = params.finaleModes ?? (['lay', 'book'] as ('lay' | 'book')[]);
  const topK = params.topK ?? 3;
  const beamWidth = params.beamWidth ?? 30;
  const budget = params.evalBudget ?? 12000;

  // Pool idonea: scheduled, non iniziate, copertura U+O completa, Under minimo.
  const pool = params.rows
    .filter((r) => r.status === 'scheduled' && !hasKickoffPassed(r, params.now))
    .filter((r) => {
      const under = bestCoverSide(r, 'under');
      const over = bestCoverSide(r, 'over');
      return Boolean(under && over && (under?.odds ?? 0) >= oddsMin && (over?.odds ?? 0) >= oddsMin);
    })
    .sort(byKickoffAsc);

  const evalCache = new Map<string, FinderCandidate | null>();
  let evaluations = 0;
  let budgetHit = false;
  const evaluateCached = (seq: CoverOddsRow[], mode: 'lay' | 'book'): FinderCandidate | null => {
    const key = `${mode}|${seq.map((r) => r.eventId).join('|')}`;
    const hit = evalCache.get(key);
    if (hit !== undefined) {
      return hit;
    }
    if (evaluations >= budget) {
      budgetHit = true;
      return null;
    }
    evaluations += 1;
    let layQuote: number;
    if (typeof params.lay === 'number') {
      layQuote = params.lay;
    } else {
      layQuote = bestCoverSide(seq[seq.length - 1], 'under')?.odds ?? 0;
    }
    const c = evaluateSequence(
      seq,
      params.baseStake,
      params.targetProfit,
      comm,
      layQuote,
      mode,
    );
    evalCache.set(key, c);
    return c;
  };

  const beamScore = (c: FinderCandidate | null): number => {
    if (!c) {
      return -1e18;
    }
    // Fattibili per prime (garantito desc); parziali/infattibili: piu' vicini
    // a chiudere (k*S piccolo in lay, S piccolo in book) per primi.
    if (c.feasible) {
      return 1e12 + (c.equalizedNet ?? 0);
    }
    return -(c.finaleMode === 'lay' ? c.kFactor * c.sumInverse : c.sumInverse);
  };

  const full: FinderCandidate[] = [];
  const seenFull = new Set<string>();
  let beam: CoverOddsRow[][] = pool.map((r) => [r]);
  for (let len = 2; len <= maxEvents && beam.length > 0; len++) {
    const scored: { seq: CoverOddsRow[]; score: number }[] = [];
    let stopped = false;
    for (const s of beam) {
      const lastIdx = pool.indexOf(s[s.length - 1]);
      for (let i = lastIdx + 1; i < pool.length; i++) {
        if (evaluations >= budget) {
          budgetHit = true;
          stopped = true;
          break;
        }
        const seq = [...s, pool[i]];
        const key = seq.map((r) => r.eventId).join('|');
        let bestScore = -1e18;
        for (const mode of modes) {
          const c = evaluateCached(seq, mode);
          if (seq.length >= minEvents && c && !seenFull.has(`${mode}|${key}`)) {
            full.push(c);
            seenFull.add(`${mode}|${key}`);
          }
          bestScore = Math.max(bestScore, beamScore(c));
        }
        if (seq.length < maxEvents) {
          scored.push({ seq, score: bestScore });
        }
      }
      if (stopped) {
        break;
      }
    }
    scored.sort((a, b) => b.score - a.score);
    beam = scored.slice(0, beamWidth).map((x) => x.seq);
  }

  const feasible = full
    .filter((c) => c.feasible)
    .sort((a, b) => (b.equalizedNet ?? 0) - (a.equalizedNet ?? 0) || a.exposure - b.exposure)
    .slice(0, topK);
  const maxLays = full.map((c) => c.maxLayQuote).filter((v) => Number.isFinite(v) && v > 0);
  return {
    feasible,
    best: feasible[0] ?? null,
    closestMaxLay: maxLays.length ? Number(Math.max(...maxLays).toFixed(2)) : null,
    poolSize: pool.length,
    evaluations,
    budgetHit,
  };
}
