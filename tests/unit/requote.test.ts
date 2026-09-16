import { describe, expect, it } from 'vitest';
import {
  requoteGate,
  snapExchangeStakeUp,
  snapLayPriceUp,
  EXCHANGE_MIN_STAKE,
} from '../../src/engine/requote';
import { solveMatrix } from '../../src/engine/matrix';
import { DEFAULT_BOOK } from '../../src/engine/books';
import type { UserMatch } from '../../src/types';

// M4 — gate di re-quoting + validita' exchange.
// S3/S4/S5/S6/S7/S14 della matrice di stress.

function mkScale(pairs: [number, number][]): UserMatch[] {
  return pairs.map(([u, o], i) => ({
    id: `m${i + 1}`,
    order: i + 1,
    timeSlot: `t${i}`,
    homeTeam: `H${i + 1}`,
    awayTeam: `A${i + 1}`,
    underOdds: u,
    overOdds: o,
    outcome: 'PENDING' as const,
  }));
}

const ROI4 = { targetMode: 'roi' as const, roiPct: 4, baseCap: 10 };
// Scala base certificata (N=2 ad alta quota, lay 1.25): chiude in ROI.
const BASE: [number, number][] = [
  [1.8, 1.8],
  [1.8, 1.8],
];

describe('M4 — gate via libera su scala verificata', () => {
  it('quote osservate == pianificate: ok:true, banca eseguibile, nota operativa', () => {
    const v = requoteGate({
      matches: mkScale(BASE),
      baseStake: 10,
      layQuoteObserved: 1.25,
      ...ROI4,
    });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.solution.feasible).toBe(true);
      expect(v.layExecPrice).toBeCloseTo(1.25, 2);
      expect(v.layExecStake).toBeGreaterThanOrEqual(EXCHANGE_MIN_STAKE);
      expect(v.note).toContain('VIA LIBERA');
    }
  });
});

describe('S3 — shock quote post-sizing: il gate blocca', () => {
  it('shock -25% sulle coppie: STOP con reason (non si piazza al buio)', () => {
    const shocked = mkScale(BASE).map((m) => ({
      ...m,
      underOdds: Number((m.underOdds * 0.75).toFixed(2)),
      overOdds: Number((m.overOdds * 0.75).toFixed(2)),
    }));
    const v = requoteGate({
      matches: shocked,
      baseStake: 10,
      layQuoteObserved: 1.25,
      ...ROI4,
    });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.reason).not.toBeNull();
      expect(v.detail).toContain('STOP');
    }
  });

  it('micro-shock -1%: verdetto coerente in entrambe le direzioni', () => {
    const shocked = mkScale(BASE).map((m) => ({
      ...m,
      underOdds: Number((m.underOdds * 0.99).toFixed(2)),
      overOdds: Number((m.overOdds * 0.99).toFixed(2)),
    }));
    const v = requoteGate({
      matches: shocked,
      baseStake: 10,
      layQuoteObserved: 1.25,
      ...ROI4,
    });
    // coerenza, non direzione: se ok, i netti verificano; se stop, c'e' reason.
    if (v.ok) {
      expect(Math.min(...v.solution.branchNets)).toBeGreaterThanOrEqual(
        v.solution.targetUsed - 1e-9,
      );
    } else {
      expect(v.reason).not.toBeNull();
    }
  });
});

describe('S4 — drift lay al lock: gerarchia dei vincoli onesta', () => {
  it('lay oltre Lmax su madre grande: STOP layQuote, osservato > maxLayQuote', () => {
    // N=4 a quota 2.0: madre m0~17, mai binding -> il drift rompe kS (layQuote).
    const big: [number, number][] = [
      [2.0, 2.0],
      [2.0, 2.0],
      [2.0, 2.0],
      [2.0, 2.0],
    ];
    const v = requoteGate({
      matches: mkScale(big),
      baseStake: 10,
      layQuoteObserved: 2.6,
      finaleModes: ['lay'], // solo lay: il verdetto e' sul vincolo kS (Lmax)
      ...ROI4,
    });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.reason).toBe('layQuote');
      expect(v.detail).toContain('STOP');
      expect(2.6).toBeGreaterThan(v.solution?.maxLayQuote ?? 99);
      expect(v.detail).toContain('massimo che chiude');
    }
  });

  it('lay alta su madre corta: STOP mother (binding reale), niente hint Lmax fuorviante', () => {
    const v = requoteGate({
      matches: mkScale(BASE),
      baseStake: 10,
      layQuoteObserved: 2.7,
      ...ROI4,
    });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      // a L alta il leverage esplode e la madre corta non copre: mother lega prima di kS
      expect(v.reason).toBe('mother');
      expect(v.detail).toContain('STOP');
      expect(v.detail).not.toContain('massimo che chiude');
    }
  });

  it('lay vicino al piano (1.30): nessun falso STOP', () => {
    const v = requoteGate({
      matches: mkScale(BASE),
      baseStake: 10,
      layQuoteObserved: 1.3,
      ...ROI4,
    });
    expect(v.ok).toBe(true);
  });
});

describe('S5 — commissione 5% vs 4.5%: coerenza', () => {
  it('stessa scala a c=5%: verdetto coerente, mai crash', () => {
    const v = requoteGate({
      matches: mkScale(BASE),
      baseStake: 10,
      layQuoteObserved: 1.25,
      layCommissionPct: 5,
      ...ROI4,
    });
    if (v.ok) {
      expect(Math.min(...v.solution.branchNets)).toBeGreaterThanOrEqual(
        v.solution.targetUsed - 1e-9,
      );
    } else {
      expect(v.reason).not.toBeNull();
      expect(v.detail).toContain('STOP');
    }
  });
});

describe('S6 — bonus negato: il piano col bonus non vale senza bonus', () => {
  it('scala N=5 con bonus vs overEligible=false: mai piu conveniente senza', () => {
    const pairs5: [number, number][] = [
      [1.9, 3.5],
      [1.9, 3.5],
      [1.9, 3.5],
      [1.9, 3.5],
      [1.9, 3.5],
    ];
    const withBonus = solveMatrix({
      matches: mkScale(pairs5),
      baseStake: 20,
      targetProfit: 30,
      layCommissionPct: 4.5,
      layQuote: 1.5,
      finaleModes: ['lay'],
      budget: undefined,
    });
    const noBonus = solveMatrix({
      matches: mkScale(pairs5),
      baseStake: 20,
      targetProfit: 30,
      layCommissionPct: 4.5,
      layQuote: 1.5,
      finaleModes: ['lay'],
      book: { ...DEFAULT_BOOK, overEligible: false },
    });
    expect(withBonus?.feasible).toBe(true);
    if (noBonus?.feasible) {
      // senza bonus servono stake maggiori a pari target: esposizione >=
      expect(noBonus.exposure).toBeGreaterThanOrEqual((withBonus?.exposure ?? 0) - 5);
    } else {
      // oppure non chiude proprio: entrambi onesti, mai l'inverso
      expect(noBonus?.reason).not.toBeNull();
    }
  });
});

describe('S7 — gamba void pre-piazzamento: re-gate sulla scala ridotta', () => {
  it('N=3 verificata -> void centrale -> N=2 riverificata, capitale scende', () => {
    const full: [number, number][] = [
      [1.8, 1.8],
      [1.8, 1.8],
      [1.8, 1.8],
    ];
    const vFull = requoteGate({
      matches: mkScale(full),
      baseStake: 10,
      layQuoteObserved: 1.25,
      ...ROI4,
    });
    expect(vFull.ok).toBe(true);
    // void del match centrale PRIMA di piazzare: la scala si accorcia e il
    // gate decide da zero (mai pagare coi vecchi stake).
    const reduced = mkScale([
      [1.8, 1.8],
      [1.8, 1.8],
    ]);
    const vRed = requoteGate({
      matches: reduced,
      baseStake: 10,
      layQuoteObserved: 1.25,
      ...ROI4,
    });
    expect(vRed.ok).toBe(true);
    if (vFull.ok && vRed.ok) {
      expect(vRed.solution.exposure).toBeLessThan(vFull.solution.exposure);
      expect(Math.min(...vRed.solution.branchNets)).toBeGreaterThanOrEqual(
        vRed.solution.targetUsed - 1e-9,
      );
    }
  });
});

describe('S14 — tick e minimo exchange', () => {
  it('snapLayPriceUp: prezzi su tick invariati, gli altri salgono al tick', () => {
    expect(snapLayPriceUp(1.5)).toBeCloseTo(1.5, 2);
    expect(snapLayPriceUp(1.01)).toBeCloseTo(1.01, 2);
    expect(snapLayPriceUp(2.53)).toBeCloseTo(2.54, 2); // fascia 2-3: passo 0.02
    expect(snapLayPriceUp(3.47)).toBeCloseTo(3.5, 2); // fascia 3-4: passo 0.05
    expect(snapLayPriceUp(5.55)).toBeCloseTo(5.6, 2); // fascia 4-6: passo 0.1
    // mai uno snap al ribasso (conservativo per chi banca)
    for (const p of [1.11, 2.07, 3.33, 7.77, 12.34]) {
      expect(snapLayPriceUp(p)).toBeGreaterThanOrEqual(p - 1e-9);
    }
  });

  it('snapExchangeStakeUp: minimo 2€ e centesimo', () => {
    expect(snapExchangeStakeUp(1.5)).toBe(2);
    expect(snapExchangeStakeUp(0.5)).toBe(2);
    expect(snapExchangeStakeUp(2.005)).toBe(2.01);
    expect(snapExchangeStakeUp(16.3)).toBe(16.3);
  });

  it('gate con minExchangeStake irraggiungibile: STOP exchange (mai piazzare corto)', () => {
    const v = requoteGate({
      matches: mkScale(BASE),
      baseStake: 10,
      layQuoteObserved: 1.25,
      minExchangeStake: 100000,
      ...ROI4,
    });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.reason).toBe('exchange');
      expect(v.detail).toContain('STOP');
    }
  });
});
