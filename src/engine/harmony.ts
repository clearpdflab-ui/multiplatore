import { DEFAULT_BOOK, getBonusForBook } from './books';
import { roundToFiftyCents } from './dutching';
import type { Book, TicketLeg } from '../types';

// Universal harmonized sizing (formula v3):
//   fin  = (prod q_i) * (1 + min(bonus_b(N), cap)/100)
//   s*   = (S + B + T(d)) / (fin - 1)
//   s    = ROUNDUP(max(s*, minStake)) to 0.50  [engine floor is 1.00 via roundToFiftyCents]
// Invariant: any ticket that sweeps nets >= T(d) before interim bleed;
// with bleed reserve B it nets >= T(d) even riding to the end.

export type TicketPhase = 'SEEKING' | 'RIDING' | 'SETTLED';

export interface SizedTicket {
  legs: TicketLeg[];
  book: Book;
  n: number;
  raw: number;
  bonus: number;
  finale: number;
  stakeNeutral: number;
  stake: number;
  lordo: number;
  nettoNoBleed: number; // lordo - (spent + stake), i.e. no interim tickets
  feasible: boolean;
}

export interface SizingArgs {
  legs: TicketLeg[];
  book?: Book;
  spent: number; // cumulative spent before this ticket (lost tickets included)
  bleed?: number; // reserved interim dead stakes (default 0)
  target?: number; // default 45
  minStake?: number; // default 1 (book floor)
}

const r2 = (x: number) => Number(x.toFixed(2));

export function sizeTicket(args: SizingArgs): SizedTicket {
  const { legs, book = DEFAULT_BOOK, spent, bleed = 0, target = 45, minStake = 1 } = args;
  const n = legs.length;
  const raw = legs.reduce((acc, l) => acc * l.odds, 1);
  const bonus = getBonusForBook(book, n);
  const finale = raw * (1 + bonus / 100);
  if (!(n >= 1) || !(finale > 1)) {
    return {
      legs,
      book,
      n,
      raw,
      bonus,
      finale,
      stakeNeutral: 0,
      stake: 0,
      lordo: 0,
      nettoNoBleed: 0,
      feasible: false,
    };
  }
  const neutral = (spent + bleed + target) / (finale - 1);
  const stake = roundToFiftyCents(Math.max(neutral, minStake));
  const lordo = r2(stake * finale);
  return {
    legs,
    book,
    n,
    raw,
    bonus,
    finale,
    stakeNeutral: r2(neutral),
    stake,
    lordo,
    nettoNoBleed: r2(lordo - (spent + stake)),
    feasible: true,
  };
}

// Dynamic target: never fixed, never negative.
// T(d) = min(max(Tbase, rho * spent), TmaxFeasible); Tmax<0 => no ticket.
export function targetForDepth(
  base: number,
  rho: number,
  spent: number,
  tMaxFeasible: number,
): number {
  const desired = Math.max(base, rho * spent);
  if (!(tMaxFeasible >= 0)) {
    return 0;
  }
  return Math.min(desired, tMaxFeasible);
}

// Bankroll-derived parameters (recomputed live as bankroll changes).
export function bankrollTargets(bankroll: number, tau = 0.015): { tBase: number } {
  return { tBase: r2(Math.max(0, tau * bankroll)) };
}

export function maxConcurrentCycles(
  bankroll: number,
  worstCycleCost: number,
  factor = 2,
  opCap = 6,
): { nMax: number; utilization: number } {
  if (!(bankroll > 0) || !(worstCycleCost > 0)) {
    return { nMax: 0, utilization: 0 };
  }
  const nMax = Math.max(0, Math.min(opCap, Math.floor(bankroll / (factor * worstCycleCost))));
  return { nMax, utilization: r2((nMax * worstCycleCost) / bankroll) };
}

// Spend ceiling keeping the exchange lock placeable:
// lockStake = (S + T)/ (lockFin - 1) <= sCap  =>  S <= sCap*(lockFin-1) - T - B
export function spendLimitForLock(
  sCap: number,
  lockFin: number,
  target: number,
  bleed: number,
): number {
  return r2(sCap * (lockFin - 1) - target - bleed);
}

// Void leg: drop it, recompute on N-1 (bonus tier may fall). Floor stays >= 0.
export function recomputeAfterVoid(
  legs: TicketLeg[],
  voidIndex: number,
  book: Book = DEFAULT_BOOK,
) {
  const kept = legs.filter((_, i) => i !== voidIndex);
  const n = kept.length;
  const raw = kept.reduce((acc, l) => acc * l.odds, 1);
  const bonus = getBonusForBook(book, n);
  const finale = n >= 1 ? raw * (1 + bonus / 100) : 0;
  return { legs: kept, n, raw, bonus, finale };
}

export function phaseOfTicket(args: { overLegHit: boolean; decided: boolean }): TicketPhase {
  if (args.decided) {
    return 'SETTLED';
  }
  return args.overLegHit ? 'RIDING' : 'SEEKING';
}

// Reference chain (mother + Over-first coverages + lock), neutral sizing,
// with worst-case TRUE-netto audit (rider sweeps at the very end, every
// interim ticket placed and lost). Audit may go negative late: that is the
// honest signal the fallback ladder uses to step down (never hidden).
export interface ChainRow {
  index: number;
  kind: 'MOTHER' | 'COVERAGE' | 'LOCK';
  n: number;
  raw: number;
  bonus: number;
  finale: number;
  stake: number;
  spentCum: number;
  lordo: number;
  nettoNoBleed: number;
  bleedReserved: number;
  trueNetto: number;
  feasible: boolean;
}

export interface BuildChainArgs {
  motherUnderOdds: number[]; // one per event (usually all 1.32)
  overOdds: number; // default over odds for coverage first legs
  book?: Book;
  s0?: number; // mother stake policy input (2-5)
  targetBase?: number;
  rho?: number; // target growth with depth; default 0 (T = bankroll base within a cycle)
  minStake?: number;
  lockOdds?: number;
  sCap?: number; // default 150
  budget?: number; // default Infinity
}

export function buildReferenceChain(args: BuildChainArgs): {
  rows: ChainRow[];
  feasible: boolean;
  minTrueNetto: number;
} {
  const {
    motherUnderOdds,
    overOdds,
    book = DEFAULT_BOOK,
    s0 = 2,
    targetBase = 45,
    rho = 0,
    minStake = 1,
    lockOdds = 2.75,
    sCap = 150,
    budget = Number.POSITIVE_INFINITY,
  } = args;

  const N = motherUnderOdds.length;
  interface Draft {
    kind: ChainRow['kind'];
    legs: TicketLeg[];
    stake: number;
    policyStake?: number;
  }
  const drafts: Draft[] = [];
  drafts.push({
    kind: 'MOTHER',
    legs: motherUnderOdds.map((o) => ({ odds: o, market: 'UNDER' as const })),
    stake: 0,
    policyStake: s0,
  });
  for (let k = 1; k <= N - 1; k++) {
    // After k confirmed Unders (M1..Mk): Over@M(k+1) + Unders after it.
    const rest = motherUnderOdds.slice(k + 1);
    drafts.push({
      kind: 'COVERAGE',
      legs: [
        { odds: overOdds, market: 'OVER' },
        ...rest.map((o) => ({ odds: o, market: 'UNDER' as const })),
      ],
      stake: 0,
    });
  }
  drafts.push({ kind: 'LOCK', legs: [{ odds: lockOdds, market: 'OVER' as const }], stake: 0 });

  // Neutral sizing forward (no reserve inflation).
  // Rationale: worst-case bleed reserve compounds (proven: sum 1/fin > 1 on
  // real chains) and explodes stakes. Bleed is controlled by PROCESS (rider
  // rule: no full tickets while riding), not by inflating every stake.
  // The audit below reports worst-case TRUE netto honestly; the fallback
  // ladder steps down where it goes negative. Live tickets may add an
  // EV-weighted reserve via expectedBleed().
  let spent = 0;
  for (const d of drafts) {
    const n = d.legs.length;
    const raw = d.legs.reduce((a, l) => a * l.odds, 1);
    const bonus = getBonusForBook(book, n);
    const finale = raw * (1 + bonus / 100);
    const target = Math.max(targetBase, rho * spent);
    d.stake =
      d.policyStake !== undefined
        ? d.policyStake
        : finale > 1
          ? roundToFiftyCents(Math.max((spent + target) / (finale - 1), minStake))
          : 0;
    spent = r2(spent + d.stake);
  }

  // Materialize rows + TRUE-netto audit.
  const rows: ChainRow[] = [];
  const totalStakes = drafts.reduce((a, d) => a + d.stake, 0);
  let spentSoFar = 0;
  for (let k = 0; k < drafts.length; k++) {
    const d = drafts[k];
    const n = d.legs.length;
    const raw = d.legs.reduce((a, l) => a * l.odds, 1);
    const bonus = getBonusForBook(book, n);
    const finale = raw * (1 + bonus / 100);
    const bleed = 0; // reference chain is neutral; live sizing adds EV reserve
    spentSoFar = r2(spentSoFar + d.stake);
    const lordo = r2(d.stake * finale);
    const laterStakes = r2(totalStakes - spentSoFar);
    const trueNetto = r2(lordo - (spentSoFar + laterStakes));
    const feasible = d.stake > 0 && d.stake <= sCap && spentSoFar <= budget;
    rows.push({
      index: k,
      kind: d.kind,
      n,
      raw: r2(raw),
      bonus,
      finale: r2(finale),
      stake: d.stake,
      spentCum: spentSoFar,
      lordo,
      nettoNoBleed: r2(lordo - spentSoFar),
      bleedReserved: bleed,
      trueNetto,
      feasible,
    });
  }
  const minTrueNetto = Math.min(...rows.map((r) => r.trueNetto));
  return { rows, feasible: rows.every((r) => r.feasible), minTrueNetto: r2(minTrueNetto) };
}

// Fallback ladder: first feasible plan wins (full T/N -> reduced T -> lock).
// Returns null when nothing is placeable (stop signal, never a forced loss).
export interface FallbackCandidate {
  legs: TicketLeg[];
  book?: Book;
  label: string;
}

export function resolveWithFallback(args: {
  candidates: FallbackCandidate[]; // ordered by preference
  spent: number;
  bleed?: number;
  targetBase?: number;
  rho?: number;
  minStake?: number;
  sCap?: number;
  budget?: number;
}): (SizedTicket & { label: string }) | null {
  const {
    candidates,
    spent,
    bleed = 0,
    targetBase = 45,
    rho = 1,
    minStake = 1,
    sCap = 150,
    budget = Number.POSITIVE_INFINITY,
  } = args;
  for (const c of candidates) {
    const book = c.book ?? DEFAULT_BOOK;
    const n = c.legs.length;
    const raw = c.legs.reduce((a, l) => a * l.odds, 1);
    const bonus = getBonusForBook(book, n);
    const finale = raw * (1 + bonus / 100);
    if (!(n >= 1) || !(finale > 1)) {
      continue;
    }
    const tMaxFeasible = sCap * (finale - 1) - spent - bleed;
    const target = targetForDepth(Math.max(targetBase, rho * spent), rho, spent, tMaxFeasible);
    if (target < 0) {
      continue;
    }
    const sized = sizeTicket({ legs: c.legs, book, spent, bleed, target, minStake });
    if (!sized.feasible) {
      continue;
    }
    if (sized.stake > sCap) {
      continue;
    }
    if (spent + sized.stake > budget) {
      continue;
    }
    return { ...sized, label: c.label };
  }
  return null;
}

// EV-weighted bleed reserve for live ticket sizing: later stakes weighted by
// reach probability (fair Under prob ~0.694 per leg). Bounded and honest,
// unlike worst-case reserve which diverges on real chains.
export function expectedBleed(laterStakes: number[], reachProbPerLeg = 0.6944): number {
  let b = 0;
  let p = 1;
  for (const s of laterStakes) {
    p *= reachProbPerLeg;
    b += p * s;
  }
  return r2(b);
}

// Portfolio math (pure): concurrent ledgers + shared-leg guard inputs.
export interface CycleLedger {
  id: string;
  spent: number;
}

export function portfolioExposure(ledgers: CycleLedger[]): number {
  return r2(ledgers.reduce((a, l) => a + l.spent, 0));
}

export function canOpenCycle(args: {
  bankroll: number;
  worstCycleCost: number;
  active: CycleLedger[];
  factor?: number;
  opCap?: number;
}): { ok: boolean; reason: string } {
  const { bankroll, worstCycleCost, active, factor = 2, opCap = 6 } = args;
  const { nMax } = maxConcurrentCycles(bankroll, worstCycleCost, factor, opCap);
  if (active.length >= nMax) {
    return { ok: false, reason: `max ${nMax} cicli concorrenti` };
  }
  if (portfolioExposure(active) + worstCycleCost > bankroll) {
    return { ok: false, reason: 'tetto bankroll superato' };
  }
  return { ok: true, reason: 'ok' };
}

export { selectBestBook, DEFAULT_BOOK, DEFAULT_BONUS_TABLE } from './books';
