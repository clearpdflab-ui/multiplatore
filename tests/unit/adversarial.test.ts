import { describe, expect, it } from 'vitest';
import { generateCustomSlips, getSlipBook } from '../../src/engine/slips';
import { canOpenCycle, type CycleLedger } from '../../src/engine/harmony';
import type { UserMatch } from '../../src/types';

// Stress avversariale S9/S11/S15: onesta' dei numeri dichiarati contro
// ricalcolo indipendente, risoluzione multi-over, tetti di portafoglio.

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

// Quote reali della "multipla prova" (scala che chiude in lay @1.40, t=45).
const REAL: [number, number][] = [
  [1.4, 2.6],
  [1.33, 3],
  [1.33, 3.3],
  [1.57, 2.3],
  [1.77, 2],
  [1.65, 2.2],
  [1.55, 2.4],
  [1.95, 1.75],
];

describe('S9 — stake banca manuale: i netti dichiarati sono quelli veri', () => {
  it.each([0.5, 1, 2])('fattore %s sul green-up: ricalcolo indipendente al centesimo', (f) => {
    const ref = generateCustomSlips(mkScale(REAL), 40, 45, 'flat', false, 1.1, 4, 'lay_exchange', {
      layOdds: 1.4,
      harmonized: true,
    });
    expect(ref.harmonization?.feasible).toBe(true);
    const greenUp = ref.coverageSlips[ref.coverageSlips.length - 1].stake;
    const manual = Number((greenUp * f).toFixed(2));
    const r = generateCustomSlips(mkScale(REAL), 40, 45, 'flat', false, 1.1, 4, 'lay_exchange', {
      layOdds: 1.4,
      harmonized: true,
      layStake: manual,
    });
    // Ricalcolo indipendente dai campi esposti (niente riuso dei netti).
    const layCard = r.coverageSlips[r.coverageSlips.length - 1];
    expect(layCard.type).toBe('FINAL_LAY');
    const bookStakes =
      r.motherSlip.stake +
      r.coverageSlips.filter((s) => s.type !== 'FINAL_LAY').reduce((a, s) => a + s.stake, 0);
    const liab = layCard.liability ?? 0;
    const layWin = layCard.potentialGrossPayout;
    expect(r.motherSlip.realizedNetIfWon).toBeCloseTo(
      r.motherSlip.potentialGrossPayout - bookStakes - liab,
      2,
    );
    r.coverageSlips
      .filter((s) => s.type !== 'FINAL_LAY')
      .forEach((s) => {
        expect(s.realizedNetIfWon).toBeCloseTo(s.potentialGrossPayout - bookStakes - liab, 2);
      });
    expect(layCard.realizedNetIfWon).toBeCloseTo(layWin - bookStakes, 2);
    // e lo stake esposto e' proprio quello manuale richiesto
    expect(layCard.stake).toBeCloseTo(manual, 2);
  });
});

describe('S11 — risoluzione multi-over: vince sempre l ultimo Over', () => {
  const EIGHT: [number, number][] = [
    [1.32, 3.0],
    [1.32, 3.0],
    [1.32, 3.0],
    [1.32, 3.0],
    [1.32, 3.0],
    [1.32, 3.0],
    [1.32, 3.0],
    [1.32, 3.0],
  ];

  it('Over #2 e #5, resto Under: vince C5, netto = payout - TUTTO il piazzato', () => {
    const ms = mkScale(EIGHT);
    ms[1].outcome = 'OVER';
    ms[4].outcome = 'OVER';
    ms.forEach((m, i) => {
      if (m.outcome === 'PENDING') {
        m.outcome = 'UNDER';
      }
      void i;
    });
    const r = generateCustomSlips(ms, 20, 45, 'flat', false, 1.1, 4, 'lay_exchange', {
      layOdds: 1.32,
      harmonized: false,
    });
    expect(r.overallStatus).toBe('WON_COVERAGE');
    expect(r.winningSlipCode).toBe('C5');
    // Capitale effettivamente piazzato: S0 + coperture book attive/chiuse +
    // responsabilita' banca (la finale e' LOST -> piazzata e persa... la
    // liability e' a rischio e va contata).
    const bookPlaced =
      r.motherSlip.stake +
      r.coverageSlips
        .filter((s) => s.type !== 'FINAL_LAY' && s.status !== 'PENDING')
        .reduce((a, s) => a + s.stake, 0);
    const layPlaced = r.coverageSlips
      .filter((s) => s.type === 'FINAL_LAY' && s.status !== 'PENDING')
      .reduce((a, s) => a + (s.liability ?? 0), 0);
    const winner = r.coverageSlips[4]; // C5
    expect(winner.code).toBe('C5');
    expect(winner.status).toBe('WON');
    expect(r.netGainRealized).toBeCloseTo(winner.potentialGrossPayout - bookPlaced - layPlaced, 2);
    // C2 (primo Over) e' LOST: sostituita da C5 nel relay
    expect(r.coverageSlips[1].status).toBe('LOST');
  });

  it('tutti Under: vince la madre, netto = lordo - piazzato', () => {
    const ms = mkScale(EIGHT);
    ms.forEach((m) => {
      m.outcome = 'UNDER';
    });
    const r = generateCustomSlips(ms, 20, 45, 'flat', false, 1.1, 4, 'lay_exchange', {
      layOdds: 1.32,
      harmonized: false,
    });
    expect(r.overallStatus).toBe('WON_MOTHER');
    expect(r.winningSlipCode).toBe('S0');
    expect(r.netGainRealized).toBeCloseTo(
      r.motherSlip.potentialGrossPayout - r.totalInvestedSoFar,
      2,
    );
  });
});

describe('S15 — tetti di portafoglio multi-ciclo (canOpenCycle)', () => {
  const mkLedgers = (n: number, spent: number): CycleLedger[] =>
    Array.from({ length: n }, (_, i) => ({ id: `c${i}`, spent }));

  it('B0=3000, worst=200: max 6 concorrenti, il 7mo e rifiutato', () => {
    expect(
      canOpenCycle({ bankroll: 3000, worstCycleCost: 200, active: mkLedgers(5, 200) }).ok,
    ).toBe(true);
    const full = canOpenCycle({ bankroll: 3000, worstCycleCost: 200, active: mkLedgers(6, 200) });
    expect(full.ok).toBe(false);
    expect(full.reason).toContain('6');
  });

  it('tetto bankroll: esposizione + worst oltre B0 rifiutata anche sotto opCap', () => {
    const r = canOpenCycle({
      bankroll: 3000,
      worstCycleCost: 200,
      active: [{ id: 'big', spent: 2900 }],
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('bankroll');
  });

  it('sotto entrambi i tetti: via libera', () => {
    expect(
      canOpenCycle({ bankroll: 3000, worstCycleCost: 200, active: mkLedgers(2, 150) }).ok,
    ).toBe(true);
  });
});

describe('F31 prenotate — vincolo book strutturato end-to-end', () => {
  const mkBooked = (): UserMatch[] =>
    mkScale([
      [1.6, 2.2],
      [1.55, 2.4],
      [1.7, 2.1],
    ]).map((m, i) => ({
      ...m,
      underBook: ['Snai', 'Snai', 'Eurobet'][i],
      overBook: ['Eurobet', 'Snai', 'Eurobet'][i],
    }));

  it('gambe ereditano il book del lato; banca su Exchange', () => {
    const r = generateCustomSlips(mkBooked(), 10, 20, 'flat', false, 1.1, 4, 'lay_exchange', {
      layOdds: 1.5,
    });
    // madre: tutti Under -> Snai, Snai, Eurobet
    expect(r.motherSlip.items.map((it) => it.book)).toEqual(['Snai', 'Snai', 'Eurobet']);
    // C1: Over#1 (Eurobet) + Under dopo
    expect(r.coverageSlips[0].items[0].market).toContain('OVER');
    expect(r.coverageSlips[0].items[0].book).toBe('Eurobet');
    expect(r.coverageSlips[0].items[1].book).toBe('Snai');
    // banca finale su Exchange
    const lay = r.coverageSlips[r.coverageSlips.length - 1];
    expect(lay.type).toBe('FINAL_LAY');
    expect(lay.items[0].book).toBe('Exchange');
  });

  it('getSlipBook: singolo vs misto', () => {
    const r = generateCustomSlips(mkBooked(), 10, 20, 'flat', false, 1.1, 4, 'lay_exchange', {
      layOdds: 1.5,
    });
    const lay = r.coverageSlips[r.coverageSlips.length - 1];
    // banca: una sola gamba Exchange -> singolo
    expect(getSlipBook(lay)).toEqual({ single: 'Exchange', books: ['Exchange'], mixed: false });
    // madre mista Snai/Eurobet -> misto onesto
    const mother = getSlipBook(r.motherSlip);
    expect(mother.mixed).toBe(true);
    expect(mother.single).toBeNull();
    expect([...mother.books].sort()).toEqual(['Eurobet', 'Snai']);
    // scala mono-book -> singolo
    const mono = mkBooked().map((m) => ({ ...m, underBook: 'Snai', overBook: 'Snai' }));
    const r2 = generateCustomSlips(mono, 10, 20, 'flat', false, 1.1, 4, 'book_single', {});
    expect(getSlipBook(r2.motherSlip)).toEqual({ single: 'Snai', books: ['Snai'], mixed: false });
    expect(getSlipBook(r2.coverageSlips[0]).single).toBe('Snai');
  });

  it('senza book: nessun chip, nessun crash (retrocompatibilita)', () => {
    const r = generateCustomSlips(mkScale([[1.6, 2.2], [1.55, 2.4]]), 10, 20);
    expect(getSlipBook(r.motherSlip)).toEqual({ single: null, books: [], mixed: false });
  });
});
