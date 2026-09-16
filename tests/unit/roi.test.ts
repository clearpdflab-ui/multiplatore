import { describe, expect, it } from 'vitest';
import { generateCustomSlips } from '../../src/engine/slips';
import { solveMatrix } from '../../src/engine/matrix';
import { DEFAULT_BOOK } from '../../src/engine/books';
import type { Book } from '../../src/types';
import type { UserMatch } from '../../src/types';

// M2a — modo ROI (t = r% di E, verifica stretta) + tetto S0 + M1-precheck.
// S1/S2/S10/S12/S13 della matrice di stress.

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

// LCG deterministico (S1/S2 riproducibili senza seed esterni).
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const ROI = { targetMode: 'roi' as const, roiPct: 4, baseCap: 10 };

describe('M2a — ROI 4% lay su scala mista 5 eventi (tetto S0 10€)', () => {
  // Scala ad alta quota + lay bassa (banda fattibile: la madre deve coprire
  // il leverage E/b — vedi audit: m0 >= C(1+r)). Trovata via scansione.
  const pairs: [number, number][] = [
    [1.9, 2.1],
    [1.9, 2.1],
    [1.9, 2.1],
    [1.9, 2.0],
  ];

  it('fattibile: OGNI ramo >= t, t = 4% di E, S0 mai oltre il cap, mai bump', () => {
    const sol = solveMatrix({
      matches: mkScale(pairs),
      baseStake: 10,
      targetProfit: 45, // ignorato in modo ROI (serve solo da fallback)
      layCommissionPct: 4.5,
      layQuote: 1.25,
      finaleModes: ['lay'],
      ...ROI,
    });
    expect(sol).not.toBeNull();
    expect(sol!.feasible).toBe(true);
    expect(sol!.reason).toBeNull();
    // t effettivo = 4% dell'esposizione (tolleranza spiccioli di arrotondo t)
    expect(sol!.targetUsed).toBeGreaterThan(0);
    expect(Math.abs(sol!.targetUsed - 0.04 * sol!.exposure)).toBeLessThanOrEqual(
      Math.max(0.1, 0.01 * sol!.exposure),
    );
    // invariante certificata: OGNI ramo >= t (madre inclusa)
    sol!.branchNets.forEach((net) => expect(net).toBeGreaterThanOrEqual(sol!.targetUsed - 1e-9));
    expect(sol!.equalizedNet ?? -1).toBeGreaterThanOrEqual(sol!.targetUsed - 1e-9);
    // tetto operativo: S0 usato <= 10 e MAI bumpato oltre la base utente
    expect(sol!.baseUsed).toBeLessThanOrEqual(10);
    expect(sol!.baseUsed).toBeLessThanOrEqual(10 + 1e-9);
    expect(sol!.stakes[0]).toBe(10);
  });

  it('N=2 finale: chiude con capitale piccolo e utile 4% proporzionato', () => {
    const sol = solveMatrix({
      matches: mkScale([
        [1.8, 1.8],
        [1.8, 1.8],
      ]),
      baseStake: 10,
      targetProfit: 45,
      layCommissionPct: 4.5,
      layQuote: 1.25,
      finaleModes: ['lay'],
      ...ROI,
    });
    expect(sol).not.toBeNull();
    expect(sol!.feasible).toBe(true);
    expect(sol!.branches).toHaveLength(3); // S0 + C1 + banca
    sol!.branchNets.forEach((net) => expect(net).toBeGreaterThanOrEqual(sol!.targetUsed - 1e-9));
    // capitale contenuto (scala corta): esposizione ben sotto i 100€
    expect(sol!.exposure).toBeLessThan(100);
  });

  it('ROI book (punta/punta) su scala N=2 ad alta quota: fattibile, invariante stretta', () => {
    const sol = solveMatrix({
      matches: mkScale([
        [2.1, 2.1],
        [2.1, 2.1],
      ]),
      baseStake: 10,
      targetProfit: 45,
      layCommissionPct: 4.5,
      finaleModes: ['book'],
      ...ROI,
    });
    expect(sol).not.toBeNull();
    expect(sol!.feasible).toBe(true);
    expect(sol!.finaleMode).toBe('book');
    sol!.branchNets.forEach((net) => expect(net).toBeGreaterThanOrEqual(sol!.targetUsed - 1e-9));
    expect(sol!.equalizedNet ?? -1).toBeGreaterThanOrEqual(sol!.targetUsed - 1e-9);
  });
});

describe('M2a — reason cap (S1/S13)', () => {
  const pairs5: [number, number][] = [
    [1.4, 2.6],
    [1.33, 3.0],
    [1.33, 3.3],
    [1.57, 2.3],
    [1.77, 2.0],
  ];

  it('fixed: bMin oltre il tetto -> reason cap, S0 resta sotto tetto, niente bump', () => {
    const uncapped = solveMatrix({
      matches: mkScale(pairs5),
      baseStake: 1,
      targetProfit: 45,
      layCommissionPct: 4.5,
      layQuote: 1.3,
      finaleModes: ['lay'],
    });
    expect(uncapped?.feasible).toBe(true);
    expect(uncapped!.baseMinRequired).toBeGreaterThan(2);
    const cap = uncapped!.baseMinRequired - 1;
    const capped = solveMatrix({
      matches: mkScale(pairs5),
      baseStake: 1,
      targetProfit: 45,
      layCommissionPct: 4.5,
      layQuote: 1.3,
      finaleModes: ['lay'],
      baseCap: cap,
    });
    expect(capped).not.toBeNull();
    expect(capped!.feasible).toBe(false);
    expect(capped!.reason).toBe('cap');
    // il minimo richiesto e' dichiarato onesto, ma S0 non lo supera mai
    expect(capped!.baseMinRequired).toBeGreaterThan(cap);
    expect(capped!.baseUsed).toBeLessThanOrEqual(cap + 1e-9);
    expect(capped!.equalizedNet).toBeNull();
  });

  it('fixed senza cap: comportamento storico invariato (bump al minimo)', () => {
    const sol = solveMatrix({
      matches: mkScale(pairs5),
      baseStake: 1,
      targetProfit: 45,
      layCommissionPct: 4.5,
      layQuote: 1.3,
      finaleModes: ['lay'],
    });
    expect(sol!.feasible).toBe(true);
    expect(sol!.stakes[0]).toBeGreaterThan(1);
    expect(sol!.baseUsed).toBe(sol!.stakes[0]);
  });
});

describe('M2a/S1 — proprieta invariante su scale random (quote 1.25-2.1)', () => {
  it('feasible <=> OGNI ramo arrotondato >= t; equalizedNet == minimo rami', () => {
    const rnd = lcg(20260916);
    let feasibleUniform = 0;
    let feasibleBiased = 0;
    const check = (sol: ReturnType<typeof solveMatrix>) => {
      expect(sol).not.toBeNull();
      // S0 mai oltre il cap in qualunque esito
      expect(sol!.baseUsed).toBeLessThanOrEqual(10 + 1e-9);
      if (sol!.feasible) {
        expect(sol!.reason).toBeNull();
        const minNet = Math.min(...sol!.branchNets);
        // invariante certificata (tolleranza zero + epsilon float)
        expect(minNet).toBeGreaterThanOrEqual(sol!.targetUsed - 1e-9);
        // equalizedNet dichiarato == minimo reale al centesimo
        expect(sol!.equalizedNet ?? -1e9).toBeCloseTo(minNet, 2);
        // t == 4% di E entro slack di arrotondo t (2 decimali su t)
        expect(Math.abs(sol!.targetUsed - 0.04 * sol!.exposure)).toBeLessThanOrEqual(
          Math.max(0.1, 0.01 * sol!.exposure),
        );
        return true;
      }
      expect(sol!.equalizedNet).toBeNull();
      expect(sol!.reason).not.toBeNull();
      return false;
    };
    // Pool A: uniforme su tutto il range (la banda fattibile e' STRETTA per
    // il vincolo madre/leverage: m0 deve coprire E/b — quasi tutte rifiutate,
    // ed e' corretto che lo siano con reason valorizzato).
    for (let i = 0; i < 300; i++) {
      const n = 2 + Math.floor(rnd() * 5); // 2..6
      const pairs: [number, number][] = Array.from({ length: n }, () => {
        const u = Number((1.25 + rnd() * 0.85).toFixed(2));
        const o = Number((1.25 + rnd() * 0.85).toFixed(2));
        return [u, o];
      });
      const layQ = Number((1.25 + rnd() * 0.95).toFixed(2)); // 1.25..2.2
      const comm = [2, 4.5, 5][Math.floor(rnd() * 3)];
      if (
        check(
          solveMatrix({
            matches: mkScale(pairs),
            baseStake: 10,
            targetProfit: 45,
            layCommissionPct: comm,
            layQuote: layQ,
            ...ROI,
          }),
        )
      ) {
        feasibleUniform++;
      }
    }
    // Pool B: banda alta (quote 1.8-2.1, lay 1.25-1.5, N 2-4): qui il finder
    // deve trovare le scale — il tasso fattibile e' sostanziale.
    for (let i = 0; i < 150; i++) {
      const n = 2 + Math.floor(rnd() * 3); // 2..4
      const pairs: [number, number][] = Array.from({ length: n }, () => {
        const u = Number((1.8 + rnd() * 0.3).toFixed(2));
        const o = Number((1.8 + rnd() * 0.3).toFixed(2));
        return [u, o];
      });
      const layQ = Number((1.25 + rnd() * 0.25).toFixed(2));
      if (
        check(
          solveMatrix({
            matches: mkScale(pairs),
            baseStake: 10,
            targetProfit: 45,
            layCommissionPct: 4.5,
            layQuote: layQ,
            ...ROI,
          }),
        )
      ) {
        feasibleBiased++;
      }
    }
    // Sanity anti-vacuita': il modello non e' un "sempre infattibile".
    // (Misurato seed 20260916: uniforme ~2%, banda alta ~30%: la caccia alle
    // scale e' il lavoro del finder, non del sizing.)
    expect(feasibleUniform).toBeGreaterThanOrEqual(3);
    expect(feasibleBiased).toBeGreaterThanOrEqual(10);
  });
});

describe('M2a/S12 — forma chiusa ROI vs esposizione del motore', () => {
  // Col cuscino anti-quanto l'esposizione reale supera la teoria (il cuscino
  // stesso va a leva): il contratto resta ESATTO (t == r%E al centesimo) e il
  // sovraccosto del cuscino resta limitato sulle scale sane.
  it('lay: E >= E_predetta, t == 4%E al centesimo, sovraccosto limitato', () => {
    const pairs: [number, number][] = [
      [1.9, 2.1],
      [1.9, 2.1],
      [1.9, 2.1],
      [1.9, 2.0],
    ];
    const L = 1.25;
    const c = 0.045;
    const sol = solveMatrix({
      matches: mkScale(pairs),
      baseStake: 10,
      targetProfit: 45,
      layCommissionPct: 4.5,
      layQuote: L,
      finaleModes: ['lay'],
      ...ROI,
    });
    expect(sol?.feasible).toBe(true);
    const A2 = (L - 1) / (1 - c);
    const k = (L - c) / (1 - c);
    const S = sol!.sumInverse;
    const r = 0.04;
    const denomE = (1 - k * S) * (1 - r * A2) - (1 + A2) * k * r * S;
    expect(denomE).toBeGreaterThan(0);
    const Epred = ((1 + A2) * 10) / denomE;
    // mai sotto la teoria (il cuscino aggiunge solo capitale)
    expect(sol!.exposure).toBeGreaterThanOrEqual(Epred - 0.01);
    // contratto esatto: t == 4% dell'esposizione EFFETTIVA al centesimo
    expect(sol!.targetUsed).toBeCloseTo(Number((r * sol!.exposure).toFixed(2)), 2);
    // il cuscino non fa esplodere il capitale sulle scale sane
    expect(sol!.exposure).toBeLessThan(Epred * 2.5);
    // e lascia headroom reale sopra il contratto
    expect(sol!.equalizedNet ?? -1).toBeGreaterThanOrEqual(sol!.targetUsed - 1e-9);
  });

  it('book: E >= E_predetta, t == 4%E al centesimo', () => {
    const sol = solveMatrix({
      matches: mkScale([
        [2.1, 2.1],
        [2.1, 2.1],
      ]),
      baseStake: 10,
      targetProfit: 45,
      layCommissionPct: 4.5,
      finaleModes: ['book'],
      ...ROI,
    });
    expect(sol?.feasible).toBe(true);
    const S = sol!.sumInverse;
    const Epred = 10 / (1 - S * 1.04);
    expect(sol!.exposure).toBeGreaterThanOrEqual(Epred - 0.01);
    expect(sol!.targetUsed).toBeCloseTo(Number((0.04 * sol!.exposure).toFixed(2)), 2);
    expect(sol!.exposure).toBeLessThan(Epred * 2.5);
  });
});

describe('M1-precheck — eleggibilita bonus e tetto payout', () => {
  const pairs: [number, number][] = [
    [1.9, 3.5],
    [1.9, 3.5],
    [1.9, 3.5],
    [1.9, 3.5],
    [1.9, 3.5],
  ];

  it('book con overEligible=false: coperture senza bonus (mamma invariata)', () => {
    const noOverBook: Book = {
      ...DEFAULT_BOOK,
      id: 'no-over',
      name: 'NoOver',
      overEligible: false,
    };
    const r = generateCustomSlips(
      mkScale(pairs),
      20,
      30,
      'flat',
      false,
      1.1,
      4,
      'lay_exchange',
      { layOdds: 1.5, harmonized: true },
      3.5,
      noOverBook,
    );
    // madre tutta Under: bonus 5 eventi applicato
    expect(r.motherSlip.bonusPercentage).toBeGreaterThan(0);
    // coperture (prima gamba Over): bonus azzerato
    r.coverageSlips
      .filter((s) => s.type !== 'FINAL_LAY')
      .forEach((s) => expect(s.bonusPercentage).toBe(0));
    void 0;
  });

  it('book default: comportamento storico (bonus su madre e coperture >=5 gambe)', () => {
    const r = generateCustomSlips(
      mkScale(pairs),
      20,
      30,
      'flat',
      false,
      1.1,
      4,
      'lay_exchange',
      { layOdds: 1.5, harmonized: true },
      3.5,
      undefined,
    );
    expect(r.motherSlip.bonusPercentage).toBeGreaterThan(0);
  });

  it('maxPayout superato: reason terms, niente garanzia', () => {
    const cappedBook: Book = { ...DEFAULT_BOOK, id: 'cap', name: 'Cap', maxPayout: 50 };
    const r = generateCustomSlips(
      mkScale(pairs),
      20,
      30,
      'flat',
      false,
      1.1,
      4,
      'lay_exchange',
      { layOdds: 1.5, harmonized: true },
      3.5,
      cappedBook,
    );
    expect(r.harmonization?.feasible).toBe(false);
    expect(r.harmonization?.reason).toBe('terms');
    expect(r.harmonization?.equalizedNet).toBeNull();
  });
});

describe('S10 — estremi e input degeneri in modo ROI', () => {
  it('N<2 / lay invalida / quota sotto soglia: rifiuti puliti', () => {
    expect(
      solveMatrix({
        matches: mkScale([[1.6, 1.7]]),
        baseStake: 10,
        targetProfit: 45,
        layQuote: 1.5,
        ...ROI,
      }),
    ).toBeNull();
    const low = solveMatrix({
      matches: mkScale([
        [1.24, 1.7],
        [1.55, 1.8],
      ]),
      baseStake: 10,
      targetProfit: 45,
      layQuote: 1.5,
      ...ROI,
    });
    expect(low?.feasible).toBe(false);
    expect(low?.reason).toBe('quota');
    const badLay = solveMatrix({
      matches: mkScale([
        [1.6, 1.7],
        [1.55, 1.8],
      ]),
      baseStake: 10,
      targetProfit: 45,
      layQuote: 1.0,
      finaleModes: ['lay'],
      ...ROI,
    });
    // lay non quotata e unico modo richiesto: nessuna soluzione (semantica storica)
    expect(badLay).toBeNull();
  });

  it('roiPct=0 o targetMode assente: fallback a fixed (nessun crash, semantica storica)', () => {
    const a = solveMatrix({
      matches: mkScale([
        [1.6, 1.7],
        [1.55, 1.8],
      ]),
      baseStake: 10,
      targetProfit: 5,
      layQuote: 1.5,
      finaleModes: ['lay'],
      targetMode: 'roi',
      roiPct: 0,
      baseCap: 10,
    });
    const b = solveMatrix({
      matches: mkScale([
        [1.6, 1.7],
        [1.55, 1.8],
      ]),
      baseStake: 10,
      targetProfit: 5,
      layQuote: 1.5,
      finaleModes: ['lay'],
    });
    expect(a?.targetUsed).toBe(b?.targetUsed);
  });

  it('commissione 20%: verdetto coerente, mai NaN', () => {
    const sol = solveMatrix({
      matches: mkScale([
        [1.4, 1.9],
        [1.55, 1.8],
        [1.7, 1.75],
      ]),
      baseStake: 10,
      targetProfit: 45,
      layCommissionPct: 20,
      layQuote: 1.5,
      finaleModes: ['lay'],
      ...ROI,
    });
    expect(sol).not.toBeNull();
    expect(Number.isFinite(sol!.exposure)).toBe(true);
    if (sol!.feasible) {
      expect(Math.min(...sol!.branchNets)).toBeGreaterThanOrEqual(sol!.targetUsed - 1e-9);
    } else {
      expect(sol!.reason).not.toBeNull();
    }
  });
});
