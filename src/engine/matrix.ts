import { generateCustomSlips } from './slips';
import type { UserMatch } from '../types';

// F20 — MOTORE A MATRICI per multiple a scalare con regola MAI-PERDITA.
//
// La madre e' N Under 3.5 fino all'ultimo evento; ogni copertura
// C_k = Over_k + Under_{k+1..N} (solo il PRIMO evento e' Over). Conoscendo
// TUTTI gli eventi a priori, il motore calcola la MATRICE completa
// (stake x rami) e BILANCIA le puntate (dutching a payout comune) finche'
// OGNI ramo finale chiude in positivo:
//
//   madre:            tutti Under                -> madreGross - I (- liab.)
//   C_k (1..N-1):     Over@k + Under dopo        -> P_k - I (- liab.)
//   FINALE lay:       Over@N (banca vince)       -> B(1-c) - I
//   FINALE book:      Over@N (singola vince)     -> P_N - I
//
// Requisiti (F20): min quota 1.25 su OGNI selezione, fee exchange 4.5%,
// stake S0 libero (anche 1 su 30 eventi), N scelto dal motore, singola
// finale decisa dal motore (banca lay OPPURE punta/punta).

export interface MatrixInput {
  matches: UserMatch[]; // sequenza ORDINATA (kickoff crescente)
  baseStake: number; // S0 (anche 1)
  targetProfit: number; // t: netto garantito su ogni ramo
  layCommissionPct?: number; // default 4.5 (fee exchange utente)
  layQuote?: number; // quota lay Under ultimo; se assente = Under ultimo match
  finaleModes?: ('lay' | 'book')[]; // default entrambi: decide il motore
  // F23 — budget totale ipotetico I_tot: OGNI copertura paga P = I_tot + t.
  // Senza budget = sizing dutch (capitale risolto dal target).
  budget?: number;
}

export interface MatrixBranch {
  code: string; // 'S0' | 'C1'.. | 'FIN'
  desc: string; // es. 'Over #3 + Under #4..#8'
  mult: number; // moltiplicatore finale (bonus incluso)
  stake: number;
  payout: number;
  net: number; // netto "se vince quel ramo"
}

export interface MatrixSolution {
  n: number;
  finaleMode: 'lay' | 'book'; // scelta del motore per questa scala
  layQuote: number; // 0 in book (nessuna banca)
  layCommissionPct: number;
  targetUsed: number; // t valutato (== input, o t* se auto)
  feasible: boolean;
  equalizedNet: number | null; // netto garantito su OGNI ramo (se feasible)
  branches: MatrixBranch[]; // [S0, C1.., FINALE]
  branchNets: number[];
  bookStakes: number; // I
  liability: number; // responsabilita' banca (0 in book)
  exposure: number; // I + liability
  motherGross: number;
  stakes: number[]; // [S0, C1.., (B)]
  baseUsed: number; // S0 effettivo (adeguato al minimo se serve)
  baseMinRequired: number; // S0 minimo per chiudere anche il ramo madre
  reason: 'layQuote' | 'dutch' | 'mother' | 'quota' | 'budget' | null;
  budgetUsed: number | null; // I_tot usato (null = sizing dutch, non budget)
  requiredCapital: number | null; // capitale dutched per +t (se budget non basta)
  maxLayQuote: number; // 0 = N/A in book
  kFactor: number; // 1 in book
  sumInverse: number; // SOMMA 1/m (lay: solo coperture; book: + singola)
  bindingStep: number; // step (1-based) della copertura col 1/m max
}

function branchDesc(n: number, step: number, isLay: boolean): string {
  if (step === 0) {
    return `${n}× Under 3.5`;
  }
  if (step === n) {
    return isLay ? `LAY Under #${n}` : `Over #${n} (singola)`;
  }
  return `Over #${step} + Under #${step + 1}..#${n}`;
}

function solveOneMode(
  matches: UserMatch[],
  baseStake: number,
  targetProfit: number,
  layCommissionPct: number,
  layQuote: number,
  mode: 'lay' | 'book',
  budget?: number,
): MatrixSolution | null {
  const n = matches.length;
  if (n < 2) {
    return null;
  }
  if (mode === 'lay' && !(layQuote > 1)) {
    return null;
  }
  const r = generateCustomSlips(
    matches,
    baseStake,
    targetProfit,
    'flat',
    false,
    1.1,
    4,
    mode === 'lay' ? 'lay_exchange' : 'book_single',
    {
      layOdds: layQuote,
      layCommissionPct,
      harmonized: true,
      budget,
    },
  );
  const h = r.harmonization;
  if (!h) {
    return null;
  }
  const isLay = mode === 'lay';
  const layCard = isLay ? r.coverageSlips[r.coverageSlips.length - 1] : null;
  const bookSlips = isLay ? r.coverageSlips.slice(0, -1) : r.coverageSlips;
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
  const branches: MatrixBranch[] = [
    {
      code: 'S0',
      desc: branchDesc(n, 0, isLay),
      mult: r.motherSlip.finalMultiplier,
      stake: r.motherSlip.stake,
      payout: r.motherSlip.potentialGrossPayout,
      net: r.motherSlip.realizedNetIfWon,
    },
    ...bookSlips.map((s) => ({
      code: s.code,
      desc: branchDesc(n, s.step, isLay),
      mult: s.finalMultiplier,
      stake: s.stake,
      payout: s.potentialGrossPayout,
      net: s.realizedNetIfWon,
    })),
    ...(layCard
      ? [
          {
            code: `C${n}`,
            desc: branchDesc(n, n, isLay),
            mult: layCard.finalMultiplier,
            stake: layCard.stake,
            payout: layCard.potentialGrossPayout,
            net: layCard.realizedNetIfWon,
          },
        ]
      : []),
  ];
  return {
    n,
    finaleMode: mode,
    layQuote: isLay ? layQuote : 0,
    layCommissionPct,
    targetUsed: targetProfit,
    feasible: h.feasible,
    equalizedNet: h.equalizedNet,
    branches,
    branchNets: branches.map((b) => b.net),
    bookStakes: Number((r.maxPotentialExposure - (layCard?.liability ?? 0)).toFixed(2)),
    liability: layCard?.liability ?? 0,
    exposure: r.maxPotentialExposure,
    motherGross: r.motherSlip.potentialGrossPayout,
    stakes: branches.map((b) => b.stake),
    baseUsed: h.baseUsed,
    baseMinRequired: h.baseMinRequired,
    reason: h.reason,
    budgetUsed: h.budgetUsed,
    requiredCapital: h.requiredCapital,
    maxLayQuote: h.maxLayQuote,
    kFactor: h.kFactor,
    sumInverse: Number(sumInverse.toFixed(4)),
    bindingStep,
  };
}

// Risolve la matrice per UNA sequenza, provando entrambi i modi finale
// (banca lay OPPURE punta/punta) e tenendo il migliore: prima i fattibili
// (garantito desc), poi il meno lontano dal chiudere.
export function solveMatrix(input: MatrixInput): MatrixSolution | null {
  const n = input.matches.length;
  if (n < 2) {
    return null;
  }
  const targetResolved = input.targetProfit;
  const comm = input.layCommissionPct ?? 4.5;
  const modes = input.finaleModes ?? (['lay', 'book'] as ('lay' | 'book')[]);
  // Quota lay esplicita (anche <= 1: solveOneMode la rifiuta per il lay);
  // assente = auto dall'Under dell'ultimo match.
  const layQuote =
    typeof input.layQuote === 'number'
      ? input.layQuote
      : Number(input.matches[n - 1].underOdds) || 1.3;
  let best: MatrixSolution | null = null;
  let bestScore = -Infinity;
  for (const mode of modes) {
    const sol = solveOneMode(
      input.matches,
      input.baseStake,
      targetResolved,
      comm,
      layQuote,
      mode,
      input.budget,
    );
    if (!sol) {
      continue;
    }
    // fattibile >> infattibile; a pari esito: garantito alto, capitale basso.
    const score =
      (sol.feasible ? 1e12 : 0) +
      (sol.equalizedNet ?? -(sol.finaleMode === 'lay' ? sol.kFactor * sol.sumInverse : sol.sumInverse) * 1000) -
      sol.exposure / 1e6;
    if (score > bestScore) {
      bestScore = score;
      best = sol;
    }
  }
  // F23 — confronto onesto: se col budget non verifica, quanto servirebbe in
  // dutch per lo stesso target? (Solo quando budget impostato e infattibile.)
  if (best && input.budget !== undefined && !best.feasible) {
    const dutchBest = solveMatrix({ ...input, budget: undefined, targetProfit: targetResolved });
    if (dutchBest?.feasible) {
      best.requiredCapital = dutchBest.exposure;
    }
  }
  return best;
}

export interface TargetRow {
  t: number;
  feasible: boolean;
  minNet: number | null;
  exposure: number | null;
}

export interface TargetProposal {
  tStar: number | null; // max t verificato (null se nessuno chiude)
  rows: TargetRow[];
}

// F23 — propone la quota obiettivo congrua: spazza t = 5..60 (step 5) e
// tiene il MASSIMO t verificato (ogni ramo >= t, spesa entro budget).
// Con budget: t* cresce finche' la verifica tiene; senza budget (dutch)
// la fattibilita' non dipende da t, quindi t* = tMax.
export function proposeTarget(
  input: Omit<MatrixInput, 'targetProfit'> & { tMin?: number; tMax?: number; tStep?: number },
): TargetProposal {
  const tMin = input.tMin ?? 5;
  const tMax = input.tMax ?? 60;
  const tStep = input.tStep ?? 5;
  const rows: TargetRow[] = [];
  for (let t = tMin; t <= tMax + 1e-9; t += tStep) {
    const target = Number(t.toFixed(2));
    const sol = solveMatrix({ ...input, targetProfit: target });
    if (!sol) {
      rows.push({ t: target, feasible: false, minNet: null, exposure: null });
      continue;
    }
    const minNet =
      sol.branchNets.length > 0 ? Math.min(...sol.branchNets) : null;
    rows.push({
      t: target,
      feasible: sol.feasible,
      minNet: minNet !== null ? Number(minNet.toFixed(2)) : null,
      exposure: sol.exposure,
    });
  }
  let tStar: number | null = null;
  for (const r of rows) {
    if (r.feasible) {
      tStar = r.t;
    }
  }
  return { tStar, rows };
}
