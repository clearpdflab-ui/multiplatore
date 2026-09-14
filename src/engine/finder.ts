import {
  bestCoverSide,
  byKickoffAsc,
  dedupKey,
  hasKickoffPassed,
  kickoffGapMs,
  MIN_GAP_MS,
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
  // F23 — budget totale ipotetico I_tot (es. 200): OGNI copertura paga
  // P = I_tot + t. Senza budget = sizing dutch (capitale risolto dal target).
  budget?: number;
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
  targetUsed: number; // t valutato (== targetProfit richiesto)
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
  reason: 'layQuote' | 'dutch' | 'mother' | 'quota' | 'budget' | null;
  line: number; // linea Totals della scala (uniforme per costruzione)
}

export interface FinderResult {
  feasible: FinderCandidate[]; // topK fattibili: equalized desc, poi capitale asc
  best: FinderCandidate | null;
  closestMaxLay: number | null; // lay max piu' alta tra i candidati completi
  // F21 — quando nulla chiude nella fascia richiesta:
  fallback: FinderCandidate | null; // migliore scala fattibile SOTTO minEvents
  closest: FinderCandidate | null; // infattibile in fascia col lay max piu' alto
  poolSize: number;
  // F22 — trasparenza scarti: duplicati e gap < 2h rimossi dalla ricerca.
  skippedDuplicates: number;
  skippedGap: number;
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
      line: r.line,
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
  budget?: number,
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
    budget,
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
    targetUsed: sol.targetUsed,
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
    reason: sol.reason,
    line: rows[0]?.line ?? 3.5,
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
  // F22: dedup stessa partita (squadre+kickoff normalizzati, oppure stesso
  // eventId del feed) + conteggio scarti.
  const seenPool = new Set<string>();
  const seenIds = new Set<string>();
  let skippedDuplicates = 0;
  const pool = params.rows
    .filter((r) => r.status === 'scheduled' && !hasKickoffPassed(r, params.now))
    .filter((r) => {
      const under = bestCoverSide(r, 'under');
      const over = bestCoverSide(r, 'over');
      return Boolean(under && over && (under?.odds ?? 0) >= oddsMin && (over?.odds ?? 0) >= oddsMin);
    })
    .sort(byKickoffAsc)
    .filter((r) => {
      const k = dedupKey(r);
      if (seenPool.has(k) || seenIds.has(r.eventId)) {
        skippedDuplicates += 1;
        return false;
      }
      seenPool.add(k);
      seenIds.add(r.eventId);
      return true;
    });

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
      params.budget,
    );
    evalCache.set(key, c);
    return c;
  };

  const beamScore = (c: FinderCandidate | null): number => {
    if (!c) {
      return -1e18;
    }
    // Fattibili per prime (garantito desc, poi capitale asc per diversificare
    // i prefissi); parziali/infattibili: piu' vicini a chiudere per primi.
    if (c.feasible) {
      return 1e12 + (c.equalizedNet ?? 0) - c.exposure / 1e6;
    }
    return -(c.finaleMode === 'lay' ? c.kFactor * c.sumInverse : c.sumInverse);
  };

  const rankFeasible = (list: FinderCandidate[]): FinderCandidate[] =>
    list
      .filter((c) => c.feasible)
      .sort((a, b) => (b.equalizedNet ?? 0) - (a.equalizedNet ?? 0) || a.exposure - b.exposure);

  const full: FinderCandidate[] = [];
  const seenFull = new Set<string>();
  // F21: anche le scale complete SOTTO minEvents (gia' valutate nella beam)
  // vengono raccolte: se nulla chiude in fascia, si propone il fallback.
  const short: FinderCandidate[] = [];
  const seenShort = new Set<string>();
  // F22: gap minimo 2h tra kickoff consecutivi della STESSA scala (regola
  // relay). Il prune avviene in espansione; skippedGap li conta.
  let skippedGap = 0;
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
        // F22: scarta l'estensione se il gap col precedente e' < 2h.
        // kickoffGapMs NaN (kickoff mancante) = non giudicabile -> passa.
        const gap = kickoffGapMs(s[s.length - 1], pool[i]);
        if (Number.isFinite(gap) && gap < MIN_GAP_MS) {
          skippedGap += 1;
          continue;
        }
        const seq = [...s, pool[i]];
        const key = seq.map((r) => r.eventId).join('|');
        let bestScore = -1e18;
        for (const mode of modes) {
          const c = evaluateCached(seq, mode);
          const mkey = `${mode}|${key}`;
          if (c && seq.length >= minEvents && !seenFull.has(mkey)) {
            full.push(c);
            seenFull.add(mkey);
          }
          if (c && seq.length >= 2 && seq.length < minEvents && !seenShort.has(mkey)) {
            short.push(c);
            seenShort.add(mkey);
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

  const feasible = rankFeasible(full).slice(0, topK);
  const fallbackList = rankFeasible(short).slice(0, topK);
  // La piu' vicina a chiudere in fascia: distanza minima dalla soglia
  // (lay: k*S -> 1; book: S -> 1).
  const infeasibleFull = full.filter((c) => !c.feasible);
  const closeDistance = (c: FinderCandidate): number =>
    c.finaleMode === 'lay' ? c.kFactor * c.sumInverse - 1 : c.sumInverse - 1;
  infeasibleFull.sort((a, b) => closeDistance(a) - closeDistance(b));
  const maxLays = full.map((c) => c.maxLayQuote).filter((v) => Number.isFinite(v) && v > 0);
  return {
    feasible,
    best: feasible[0] ?? null,
    closestMaxLay: maxLays.length ? Number(Math.max(...maxLays).toFixed(2)) : null,
    fallback: fallbackList[0] ?? null,
    closest: infeasibleFull[0] ?? null,
    poolSize: pool.length,
    skippedDuplicates,
    skippedGap,
    evaluations,
    budgetHit,
  };
}
