import {
  bestCoverSide,
  byKickoffAsc,
  hasKickoffPassed,
  type CoverOddsRow,
} from './coverOddsFeed';
import { generateCustomSlips } from './slips';
import type { UserMatch } from '../types';

// F19 — MOTORE DI RICERCA SCALE ARMONIZZATE ("finder").
//
// Data la pool di partite del calendario (kickoff + quote U/O reali), trova
// le SEQUENZE cronologiche di N eventi la cui scala chiude la regola
// MAI-PERDITA: OGNI esito finale (madre, qualsiasi copertura, banca se esce
// Over) con netto >= target.
//
// Matematica (stessa di slips.ts, F15): per coperture con moltiplicatori
// m_1..m_{N-1}, quota lay L, commissione c, base b, target t:
//
//   k = (L-c)/(1-c);   S = SOMMA_j 1/m_j
//   fattibile  <=>  k*S < 1
//   I = (b + k*t*S)/(1-k*S)        (puntate book totali)
//   D = k*(I+t)                    (payout comune = dutching)
//   s_j = D/m_j ;  B = D/(L-c)     (bancata sul ramo peggiore)
//
// La ricerca e' una beam search cronologica (l'ordine e' fissato dal
// kickoff): ogni candidato viene valutato ESATTAMENTE riusando
// generateCustomSlips con lay+harmonized, cosi' i numeri proposti sono gli
// stessi che il workbench ricalcola all'import.

export interface FinderParams {
  rows: CoverOddsRow[];
  now: number;
  baseStake: number;
  targetProfit: number;
  layCommissionPct?: number; // default 5
  lay: 'prematch' | number; // 'prematch' = Under dell'ultimo match della scala
  oddsMin?: number; // Under minimo per entrare in pool (default 1.0)
  minEvents?: number; // default 5 (da qui il bonus)
  maxEvents?: number; // default 9
  topK?: number; // default 3
  beamWidth?: number; // default 30
  evalBudget?: number; // valutazioni esatte massime (default 12000)
}

export interface FinderCandidate {
  eventIds: string[];
  rows: CoverOddsRow[]; // sequenza cronologica
  n: number;
  layQuote: number;
  layCommissionPct: number;
  feasible: boolean;
  equalizedNet: number | null;
  branchNets: number[]; // netto "se vince": [madre, C1..C_{N-1}, banca]
  bookStakes: number; // I
  liability: number; // responsabilita' banca
  exposure: number; // I + liability
  motherGross: number;
  stakes: number[]; // [S0, C1..C_{N-1}, B]
  maxLayQuote: number;
  kFactor: number;
  sumInverse: number; // SOMMA 1/m_k sulle coperture book
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
): FinderCandidate | null {
  if (rows.length < 2 || !(layQuote > 1)) {
    return null;
  }
  const r = generateCustomSlips(
    rowsToMatches(rows),
    baseStake,
    targetProfit,
    'flat',
    false,
    1.1,
    4,
    'lay_exchange',
    {
      layOdds: layQuote,
      layCommissionPct,
      harmonized: true,
    },
  );
  const h = r.harmonization;
  if (!h) {
    return null;
  }
  const layCard = r.coverageSlips[r.coverageSlips.length - 1];
  const bookSlips = r.coverageSlips.slice(0, -1);
  const sumInverse = bookSlips.reduce(
    (acc, s) => acc + (s.finalMultiplier > 1 ? 1 / s.finalMultiplier : 0),
    0,
  );
  let bindingStep = 1;
  let worstInv = -1;
  bookSlips.forEach((s) => {
    const inv = s.finalMultiplier > 1 ? 1 / s.finalMultiplier : 0;
    if (inv > worstInv) {
      worstInv = inv;
      bindingStep = s.step;
    }
  });
  return {
    eventIds: rows.map((x) => x.eventId),
    rows,
    n: rows.length,
    layQuote,
    layCommissionPct,
    feasible: h.feasible,
    equalizedNet: h.equalizedNet,
    branchNets: [
      r.motherSlip.realizedNetIfWon,
      ...bookSlips.map((s) => s.realizedNetIfWon),
      layCard.realizedNetIfWon,
    ],
    bookStakes: Number((r.maxPotentialExposure - (layCard.liability ?? 0)).toFixed(2)),
    liability: layCard.liability ?? 0,
    exposure: r.maxPotentialExposure,
    motherGross: r.motherSlip.potentialGrossPayout,
    stakes: [r.motherSlip.stake, ...bookSlips.map((s) => s.stake), layCard.stake],
    maxLayQuote: h.maxLayQuote,
    kFactor: h.kFactor,
    sumInverse: Number(sumInverse.toFixed(4)),
    bindingStep,
  };
}

export function findHarmonizableLadders(params: FinderParams): FinderResult {
  const comm = params.layCommissionPct ?? 5;
  const oddsMin = params.oddsMin ?? 1.0;
  const minEvents = Math.max(2, Math.min(params.minEvents ?? 5, 15));
  const maxEvents = Math.max(minEvents, Math.min(params.maxEvents ?? 9, 15));
  const topK = params.topK ?? 3;
  const beamWidth = params.beamWidth ?? 30;
  const budget = params.evalBudget ?? 12000;

  // Pool idonea: scheduled, non iniziate, copertura U+O completa, Under minimo.
  const pool = params.rows
    .filter((r) => r.status === 'scheduled' && !hasKickoffPassed(r, params.now))
    .filter((r) => {
      const under = bestCoverSide(r, 'under');
      const over = bestCoverSide(r, 'over');
      return Boolean(under && over && (under?.odds ?? 0) >= oddsMin);
    })
    .sort(byKickoffAsc);

  const evalCache = new Map<string, FinderCandidate | null>();
  let evaluations = 0;
  let budgetHit = false;
  const evaluateCached = (seq: CoverOddsRow[]): FinderCandidate | null => {
    const key = seq.map((r) => r.eventId).join('|');
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
    );
    evalCache.set(key, c);
    return c;
  };

  const beamScore = (c: FinderCandidate | null): number => {
    if (!c) {
      return -1e18;
    }
    // Fattibili per prime (garantito desc); parziali/infattibili: piu' vicini
    // a chiudere (k*S piccolo) per primi.
    if (c.feasible) {
      return 1e12 + (c.equalizedNet ?? 0);
    }
    return -(c.kFactor * c.sumInverse);
  };

  const full: FinderCandidate[] = [];
  const seenFull = new Set<string>();
  let beam: CoverOddsRow[][] = pool.map((r) => [r]);
  for (let len = 2; len <= maxEvents && beam.length > 0; len++) {
    const scored: { seq: CoverOddsRow[]; c: FinderCandidate | null; score: number }[] = [];
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
        const c = evaluateCached(seq);
        if (seq.length >= minEvents && c && !seenFull.has(key)) {
          full.push(c);
          seenFull.add(key);
        }
        if (seq.length < maxEvents) {
          scored.push({ seq, c, score: beamScore(c) });
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
