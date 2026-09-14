import { solveMatrix, type MatrixSolution } from './matrix';
import type { UserMatch } from '../types';

// F24 — GENERATORE DI SCALA IDEALE (inverso).
//
// Tu dai quota iniziale q0 + target finale t; il motore propone N* e le
// quote ideali q_i per ogni gamba che fanno chiudere la matrice > 0.
// UNICO OBBLIGO hard: mai sotto quota 1.25 su OGNI selezione.
//
// Disegno: unders uniformi a q0 (mercati facili da cercare: "Under ~q0"),
// overs uniformi a overQ, N provato su tutto l'intervallo. Ogni N viene
// valutato ESATTAMENTE riusando solveMatrix (stessi numeri del workbench).
// Vince l'N col margine k*S (o S) piu' lontano da 1, poi capitale minore.

export const QUOTA_FLOOR = 1.25;
export const DEFAULT_OVER_Q = 2.75;

export interface SynthParams {
  q0: number; // quota iniziale di riferimento (Under madre)
  targetProfit: number; // t: netto garantito voluto su ogni ramo
  baseStake?: number; // S0 (default 1; auto-bump al minimo se serve)
  overQ?: number; // quota Over uniforme (default 2.75)
  finaleModes?: ('lay' | 'book')[]; // default entrambi: decide il motore
  layQuote?: number; // se assente: Under ultimo match (= q0 uniforme)
  layCommissionPct?: number; // default 4.5
  nMin?: number; // default 5
  nMax?: number; // default 30 (tetto bonus, non obbligo)
  topK?: number; // default 3
  line?: number; // linea Totals della scala ideale (default 3.5)
}

export interface SynthLadder {
  n: number;
  unders: number[];
  overs: number[];
  sol: MatrixSolution;
  margin: number; // 1 - k*S (lay) oppure 1 - S (book): distanza dal bordo
  exposure: number;
}

export interface SynthResult {
  q0used: number; // q0 dopo clamp >= 1.25
  overUsed: number; // overQ dopo clamp >= 1.25
  clamped: boolean;
  ladders: SynthLadder[]; // topK fattibili
  best: SynthLadder | null;
  evaluated: number;
}

function pad2(v: number): string {
  return String(v).padStart(2, '0');
}

function synthMatches(n: number, underQ: number, overQ: number, line: number): UserMatch[] {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() + 1);
  start.setUTCHours(12, 0, 0, 0);
  return Array.from({ length: n }, (_, i) => {
    const ko = new Date(start.getTime() + i * 3 * 3600_000);
    return {
      id: `synth_m${i + 1}`,
      order: i + 1,
      timeSlot: `${pad2(ko.getUTCDate())}-${pad2(ko.getUTCMonth() + 1)} - ${pad2(ko.getUTCHours())}:${pad2(ko.getUTCMinutes())}`,
      homeTeam: `Casa ${i + 1}`,
      awayTeam: `Ospite ${i + 1}`,
      underOdds: underQ,
      overOdds: overQ,
      outcome: 'PENDING' as const,
      kickoff: ko.toISOString(),
      line,
    };
  });
}

export function generateIdealLadders(p: SynthParams): SynthResult {
  const q0used = Math.max(QUOTA_FLOOR, p.q0);
  const overUsed = Math.max(QUOTA_FLOOR, p.overQ ?? DEFAULT_OVER_Q);
  const clamped = q0used !== p.q0 || overUsed !== (p.overQ ?? DEFAULT_OVER_Q);
  const nMin = Math.max(2, Math.min(p.nMin ?? 5, 30));
  const nMax = Math.max(nMin, Math.min(p.nMax ?? 30, 30));
  const topK = p.topK ?? 3;
  const t = p.targetProfit;
  const b = p.baseStake ?? 1;

  const cands: SynthLadder[] = [];
  let evaluated = 0;
  const line = p.line ?? 3.5;
  for (let n = nMin; n <= nMax; n++) {
    const matches = synthMatches(n, q0used, overUsed, line);
    const sol = solveMatrix({
      matches,
      baseStake: b,
      targetProfit: t,
      layCommissionPct: p.layCommissionPct ?? 4.5,
      layQuote: p.layQuote,
      finaleModes: p.finaleModes,
      budget: undefined,
    });
    evaluated += 1;
    if (sol?.feasible) {
      const margin =
        sol.finaleMode === 'lay' ? 1 - sol.kFactor * sol.sumInverse : 1 - sol.sumInverse;
      cands.push({
        n,
        unders: matches.map((m) => m.underOdds),
        overs: matches.map((m) => m.overOdds),
        sol,
        margin: Number(margin.toFixed(4)),
        exposure: sol.exposure,
      });
    }
  }
  cands.sort((a, b2) => b2.margin - a.margin || a.exposure - b2.exposure);
  const ladders = cands.slice(0, topK);
  return {
    q0used,
    overUsed,
    clamped,
    ladders,
    best: ladders[0] ?? null,
    evaluated,
  };
}
