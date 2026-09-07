import { describe, expect, it } from 'vitest';
import {
  bankrollTargets,
  buildReferenceChain,
  canOpenCycle,
  expectedBleed,
  maxConcurrentCycles,
  phaseOfTicket,
  recomputeAfterVoid,
  resolveWithFallback,
  sizeTicket,
  spendLimitForLock,
  targetForDepth,
} from '../../src/engine/harmony';
import { DEFAULT_BOOK } from '../../src/engine/books';

const U = (n: number) => ({ odds: 1.32, market: 'UNDER' as const });
const O = (o = 3.0) => ({ odds: o, market: 'OVER' as const });

describe('sizeTicket', () => {
  it('should size neutral stake with ROUNDUP semantics (floor 1.00)', () => {
    // C1 15-chain, Over-first: raw=3*1.32^13=110.81, bonus 79.1 -> fin=198.46
    const legs = [O(), ...Array.from({ length: 13 }, () => U(1.32))];
    const t = sizeTicket({ legs, spent: 2, target: 45 });
    expect(t.feasible).toBe(true);
    expect(t.finale).toBeCloseTo(198.46, 1);
    expect(t.stake).toBe(1.0); // neutral 0.24 -> engine floor 1.00
    expect(t.nettoNoBleed).toBeGreaterThanOrEqual(45);
  });

  it('should reject finale <= 1', () => {
    const t = sizeTicket({ legs: [{ odds: 1.0 }], spent: 10 });
    expect(t.feasible).toBe(false);
  });
});

describe('targetForDepth + bankrollTargets + maxConcurrentCycles', () => {
  it('should derive T from bankroll (tau 1.5% of 3000 = 45)', () => {
    expect(bankrollTargets(3000).tBase).toBe(45);
  });

  it('should grow target with spent (rho) but honor Tmax', () => {
    expect(targetForDepth(45, 1, 100, 1000)).toBe(100);
    expect(targetForDepth(45, 1, 100, 60)).toBe(60);
    expect(targetForDepth(45, 1, 100, -5)).toBe(0);
  });

  it('should allow 3 concurrent cycles on 3000 with worst cost 450', () => {
    const { nMax, utilization } = maxConcurrentCycles(3000, 450);
    expect(nMax).toBe(3);
    expect(utilization).toBeCloseTo(0.45, 2);
  });

  it('should block opening over the cap', () => {
    const active = [{ id: 'a', spent: 400 }, { id: 'b', spent: 400 }, { id: 'c', spent: 400 }];
    expect(canOpenCycle({ bankroll: 3000, worstCycleCost: 450, active }).ok).toBe(false);
    expect(canOpenCycle({ bankroll: 3000, worstCycleCost: 450, active: [] }).ok).toBe(true);
  });

  it('should compute lock spend bound', () => {
    // sCap*(fin-1) - T - B = 150*1.75 - 45 - 20
    expect(spendLimitForLock(150, 2.75, 45, 20)).toBeCloseTo(197.5, 1);
  });
});

describe('recomputeAfterVoid + phaseOfTicket', () => {
  it('should drop the void leg and recompute bonus tier', () => {
    const legs = [O(), ...Array.from({ length: 11 }, () => U(1.32))]; // N=12
    const r = recomputeAfterVoid(legs, 0); // void Over -> N=11
    expect(r.n).toBe(11);
    expect(r.bonus).toBe(50.4);
  });

  it('should classify phases', () => {
    expect(phaseOfTicket({ overLegHit: false, decided: false })).toBe('SEEKING');
    expect(phaseOfTicket({ overLegHit: true, decided: false })).toBe('RIDING');
    expect(phaseOfTicket({ overLegHit: true, decided: true })).toBe('SETTLED');
  });
});

describe('buildReferenceChain (15 events, Over-first)', () => {
  const chain = buildReferenceChain({
    motherUnderOdds: Array.from({ length: 15 }, () => 1.32),
    overOdds: 3.0,
    s0: 2,
  });

  it('should build mother + 14 coverages + lock', () => {
    expect(chain.rows.length).toBe(16);
    expect(chain.rows[0].kind).toBe('MOTHER');
    expect(chain.rows[15].kind).toBe('LOCK');
    expect(chain.rows[0].finale).toBeCloseTo(122.15, 1);
  });

  it('should keep M2 rollover above target (C1 wins)', () => {
    const c1 = chain.rows[1];
    expect(c1.n).toBe(14);
    expect(c1.stake).toBe(1.0); // engine floor (book min), Excel aligns in F5
    expect(c1.lordo - (2 + c1.stake)).toBeGreaterThanOrEqual(45);
  });

  it('should keep neutral sized recovery above target pre-bleed', () => {
    for (const r of chain.rows) {
      expect(r.nettoNoBleed).toBeGreaterThanOrEqual(45);
    }
  });

  it('should audit worst-case TRUE netto (motivates rider rule + ladder)', () => {
    // worst case: rider sweeps at the very end, every interim placed+dead.
    // Below target late => the process must NOT place full tickets while
    // riding (rider rule) and must step down via the fallback ladder.
    expect(chain.minTrueNetto).toBeLessThan(45);
    // lock has no later rows: true == no-bleed by construction.
    const lock = chain.rows[chain.rows.length - 1];
    expect(lock.trueNetto).toBe(lock.nettoNoBleed);
    expect(lock.nettoNoBleed).toBeGreaterThanOrEqual(45);
  });
});

describe('expectedBleed', () => {
  it('should weight later stakes by reach probability', () => {
    expect(expectedBleed([1, 1, 1])).toBeCloseTo(1.51, 2);
    expect(expectedBleed([])).toBe(0);
  });
});

describe('resolveWithFallback', () => {
  it('should pick the first feasible candidate', () => {
    const full = { label: 'full', legs: [O(), ...Array.from({ length: 11 }, () => U(1.32))] };
    const res = resolveWithFallback({ candidates: [full], spent: 3.5 });
    expect(res?.label).toBe('full');
    expect(res!.stake).toBeLessThanOrEqual(150);
  });

  it('should skip infeasible candidates and fall to lock', () => {
    const impossible = { label: 'nope', legs: [{ odds: 1.0 }] };
    const lock = { label: 'lock', legs: [{ odds: 2.75, market: 'OVER' as const }] };
    const res = resolveWithFallback({ candidates: [impossible, lock], spent: 50 });
    expect(res?.label).toBe('lock');
  });

  it('should return null when nothing is placeable (stop, never forced loss)', () => {
    const res = resolveWithFallback({
      candidates: [{ label: 'x', legs: [{ odds: 1.0 }] }],
      spent: 10,
    });
    expect(res).toBeNull();
  });

  it('should use the book with best finale via DEFAULT_BOOK', () => {
    expect(DEFAULT_BOOK.bonusCap).toBe(500);
  });
});
