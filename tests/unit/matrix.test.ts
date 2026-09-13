import { describe, expect, it } from 'vitest';
import { proposeTarget, solveMatrix, type MatrixInput } from '../../src/engine/matrix';
import type { UserMatch } from '../../src/types';

// Quote reali della "multipla prova" utente (Under 1.33-1.95, base 40).
const REAL_ODDS: [number, number][] = [
  [1.4, 2.6],
  [1.33, 3],
  [1.33, 3.3],
  [1.57, 2.3],
  [1.77, 2],
  [1.65, 2.2],
  [1.55, 2.4],
  [1.95, 1.75],
];

function mkReal(odds: [number, number][] = REAL_ODDS): UserMatch[] {
  return odds.map(([u, o], i) => ({
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

const BASE_INPUT: MatrixInput = {
  matches: mkReal(),
  baseStake: 40,
  targetProfit: 45,
  layCommissionPct: 4.5,
  layQuote: 1.4,
};

describe('solveMatrix — motore a matrici mai-perdita (F20)', () => {
  it('lay @1.40 su quote reali: fattibile, TUTTI i rami positivi', () => {
    const sol = solveMatrix(BASE_INPUT);
    expect(sol).not.toBeNull();
    expect(sol!.feasible).toBe(true);
    expect(sol!.finaleMode).toBe('lay');
    // matrice completa: S0 + 7 coperture + banca = 9 rami
    expect(sol!.branches).toHaveLength(9);
    expect(sol!.branches[0].code).toBe('S0');
    expect(sol!.branches[8].code).toBe('C8');
    sol!.branchNets.forEach((net) => expect(net).toBeGreaterThan(0));
    expect(sol!.equalizedNet ?? 0).toBeGreaterThan(40);
    // gamba critica = ultima copertura (1/m max)
    expect(sol!.bindingStep).toBe(7);
  });

  it('solo book sui dati reali: dutching puro impossibile (margine book)', () => {
    const sol = solveMatrix({ ...BASE_INPUT, finaleModes: ['book'] });
    expect(sol).not.toBeNull();
    expect(sol!.finaleMode).toBe('book');
    // SOMMA' = 0.559 + 1/1.75 = 1.13 > 1 -> non chiude
    expect(sol!.feasible).toBe(false);
    expect(sol!.equalizedNet).toBeNull();
    expect(sol!.branches).toHaveLength(9); // S0 + 7 coperture + singola
  });

  it('lay @1.95 pre-match: impossibile, con lay massima ~1.75', () => {
    const sol = solveMatrix({ ...BASE_INPUT, layQuote: 1.95 });
    expect(sol).not.toBeNull();
    expect(sol!.feasible).toBe(false);
    expect(sol!.maxLayQuote).toBeGreaterThan(1.7);
    expect(sol!.maxLayQuote).toBeLessThan(1.8);
    expect(sol!.equalizedNet).toBeNull();
  });

  it('base S0=1 su scala corta: S0 adeguato al minimo che chiude il ramo madre', () => {
    const sol = solveMatrix({
      matches: mkReal().slice(0, 5),
      baseStake: 1,
      targetProfit: 45,
      layCommissionPct: 4.5,
      layQuote: 1.3,
    });
    expect(sol).not.toBeNull();
    expect(sol!.feasible).toBe(true);
    // S0=1 non basta per il ramo madre (madre 5 eventi paga poco contro la
    // scala): il motore adegua S0 al minimo calcolato — e' un REQUISITO.
    expect(sol!.stakes[0]).toBeGreaterThan(1);
    expect(sol!.baseUsed).toBe(sol!.stakes[0]);
    expect(sol!.baseMinRequired).toBeGreaterThan(1);
    // ...e con S0 adeguato OGNI ramo chiude positivo, madre inclusa.
    sol!.branchNets.forEach((net) => expect(net).toBeGreaterThan(0));
    expect(sol!.equalizedNet ?? 0).toBeGreaterThan(40);
  });

  it('madre troppo corta/poco pagante: ramo madre impossibile a ogni base', () => {
    // 2 eventi con Under bassi: la madre non potra' mai coprire la scala.
    const tiny = mkReal([
      [1.25, 1.3],
      [1.25, 3.0],
    ]);
    const sol = solveMatrix({
      matches: tiny,
      baseStake: 40,
      targetProfit: 45,
      layCommissionPct: 4.5,
      layQuote: 1.3,
      finaleModes: ['lay'],
    });
    expect(sol).not.toBeNull();
    expect(sol!.feasible).toBe(false);
    expect(sol!.reason).toBe('mother');
  });

  it('N < 2 o lay invalida: nessuna soluzione', () => {
    expect(solveMatrix({ ...BASE_INPUT, matches: mkReal().slice(0, 1) })).toBeNull();
    expect(solveMatrix({ ...BASE_INPUT, layQuote: 0.9, finaleModes: ['lay'] })).toBeNull();
  });
});

describe('solveMatrix — MODO BUDGET F23 (P = I_tot + t su ogni copertura)', () => {
  const EASY: [number, number][] = [
    [1.9, 3.5],
    [1.9, 3.5],
    [1.9, 3.5],
    [1.9, 3.5],
    [1.9, 3.5],
  ];
  const mkEasy = (): UserMatch[] =>
    EASY.map(([u, o], i) => ({
      id: `e${i + 1}`,
      order: i + 1,
      timeSlot: `t${i}`,
      homeTeam: `H${i + 1}`,
      awayTeam: `A${i + 1}`,
      underOdds: u,
      overOdds: o,
      outcome: 'PENDING' as const,
    }));

  it('budget 150 + t30 su scala facile: OGNI copertura paga >= 180, rami verificati', () => {
    const sol = solveMatrix({
      matches: mkEasy(),
      baseStake: 20,
      targetProfit: 30,
      layCommissionPct: 4.5,
      layQuote: 1.5,
      finaleModes: ['lay'],
      budget: 150,
    });
    expect(sol).not.toBeNull();
    expect(sol!.feasible).toBe(true);
    expect(sol!.reason).toBeNull();
    // formula utente LITERALE: payout lordo >= budget + target su OGNI copertura
    // book (la banca lay ha payout = utile, resta verificata nei branchNets)
    for (const b of sol!.branches) {
      if (b.code === 'S0' || b.desc.startsWith('LAY ')) {
        continue;
      }
      expect(b.payout).toBeGreaterThanOrEqual(180);
    }
    sol!.branchNets.forEach((net) => expect(net).toBeGreaterThanOrEqual(29));
    expect(sol!.equalizedNet ?? 0).toBeGreaterThanOrEqual(29);
  });

  it('budget 200 + t45 su quote reali utente: NON verifica (reason budget + requiredCapital)', () => {
    const sol = solveMatrix({
      ...BASE_INPUT,
      layQuote: 1.4,
      targetProfit: 45,
      budget: 200,
    });
    expect(sol).not.toBeNull();
    expect(sol!.feasible).toBe(false);
    expect(sol!.reason).toBe('budget');
    expect(sol!.equalizedNet).toBeNull();
    // confronto onesto: per +45 servirebbe il capitale dutched (~540)
    expect(sol!.requiredCapital ?? 0).toBeGreaterThan(200);
  });

  it('proposeTarget: propone il max t verificato col budget dato', () => {
    const prop = proposeTarget({
      matches: mkEasy(),
      baseStake: 20,
      layCommissionPct: 4.5,
      layQuote: 1.5,
      finaleModes: ['lay'],
      budget: 150,
      tMin: 5,
      tMax: 60,
      tStep: 5,
    });
    expect(prop.tStar).not.toBeNull();
    expect(prop.tStar!).toBeGreaterThanOrEqual(30);
    // la riga t* verifica davvero
    const row = prop.rows.find((r) => r.t === prop.tStar)!;
    expect(row.feasible).toBe(true);
  });

  it('proposeTarget: nessun t verifica su scala impossibile -> tStar null', () => {
    const prop = proposeTarget({
      matches: mkReal(),
      baseStake: 40,
      layCommissionPct: 4.5,
      layQuote: 1.4,
      finaleModes: ['lay'],
      budget: 200,
    });
    expect(prop.tStar).toBeNull();
  });
});
