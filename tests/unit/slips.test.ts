import { describe, it, expect } from 'vitest';
import { generateCustomSlips } from '../../src/engine/slips';
import { UserMatch } from '../../src/types';

function mkMatches(n: number, overIdx: number[] = [], resolved = true): UserMatch[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `m${i + 1}`,
    order: i + 1,
    timeSlot: `${14 + i}:00`,
    homeTeam: `H${i + 1}`,
    awayTeam: `A${i + 1}`,
    underOdds: 1.32,
    overOdds: 3.0,
    outcome: !resolved
      ? ('PENDING' as const)
      : overIdx.includes(i + 1)
        ? ('OVER' as const)
        : ('UNDER' as const),
  }));
}

describe('generateCustomSlips', () => {
  it('empty matches -> vuota senza errori', () => {
    const r = generateCustomSlips([], 10, 45);
    expect(r.coverageSlips).toHaveLength(0);
    expect(r.motherSlip.code).toBe('S0');
    expect(r.overallStatus).toBe('IN_PLAY');
    expect(r.totalInvestedSoFar).toBe(10);
  });

  it('madre: 8 UNDER 1.32 -> moltiplicatore geometrico + bonus 26.2%', () => {
    const r = generateCustomSlips(mkMatches(8), 10, 45);
    const raw = Math.pow(1.32, 8);
    expect(r.motherSlip.rawMultiplier).toBe(Number(raw.toFixed(2)));
    expect(r.motherSlip.bonusPercentage).toBe(26.2);
    expect(r.motherSlip.finalMultiplier).toBe(Number((raw * 1.262).toFixed(2)));
    expect(r.motherSlip.status).toBe('WON');
    expect(r.overallStatus).toBe('WON_MOTHER');
    expect(r.winningSlipCode).toBe('S0');
  });

  it('N coperture + 1 singola finale con Over primo', () => {
    const r = generateCustomSlips(mkMatches(4, [1]), 10, 45);
    expect(r.coverageSlips).toHaveLength(4);
    expect(r.coverageSlips[3].type).toBe('FINAL_SINGLE');
    // C1 ha preso l'Over: prima gamba Over + (N-1) restanti Under
    expect(r.coverageSlips[0].items[0].market).toBe('OVER 3.5');
    expect(r.coverageSlips[0].items.filter((i) => i.market === 'UNDER 3.5')).toHaveLength(3);
    expect(r.coverageSlips[0].status).toBe('WON');
    expect(r.overallStatus).toBe('WON_COVERAGE');
    expect(r.winningSlipCode).toBe('C1');
    expect(r.hasOverOccurred).toBe(true);
    expect(r.firstOverIndex).toBe(0);
  });

  it('2+ Over (relay a scalare) -> vince la copertura dellULTIMO Over, non del primo', () => {
    // Over ai match 2 e 4 (su 5), match 5 Under: la copertura C2 viene bruciata
    // dal secondo Over, ma C4 (Over@4 + Under sul solo match 5 restante) vince.
    const r = generateCustomSlips(mkMatches(5, [2, 4]), 10, 45);
    expect(r.overallStatus).toBe('WON_COVERAGE');
    expect(r.winningSlipCode).toBe('C4');
    expect(r.netGainRealized).not.toBeNull();
    // C2 (primo Over) e' persa: un Over successivo al match 4 brucia il suo
    // requisito "tutte Under dopo"
    expect(r.coverageSlips[1].status).toBe('LOST');
    // C4 (ultimo Over) e' vinta: nessun Over dopo di lei
    expect(r.coverageSlips[3].status).toBe('WON');
  });

  it('booster sotto soglia eventi -> gamba extra aggiunta', () => {
    const r = generateCustomSlips(mkMatches(4, [], true), 10, 45, 'flat', true, 1.1, 4);
    const final = r.coverageSlips[3]; // 1 evento sotto soglia
    expect(final.items.some((i) => i.market === 'BOOSTER 1X/12')).toBe(true);
    expect(final.eventCount).toBe(2); // Over finale + booster
  });

  it('senza booster nessuna gamba BOOSTER', () => {
    const r = generateCustomSlips(mkMatches(4, [], true), 10, 45, 'flat', false);
    expect(r.coverageSlips.every((s) => s.items.every((i) => i.market !== 'BOOSTER 1X/12'))).toBe(
      true,
    );
  });

  it('partite pending -> madre ACTIVE, nessun esito', () => {
    const r = generateCustomSlips(mkMatches(3, [], false), 10, 45);
    expect(r.motherSlip.status).toBe('ACTIVE');
    expect(r.overallStatus).toBe('IN_PLAY');
    expect(r.netGainRealized).toBeNull();
  });

  it('costo cumulato crescente e stake multipli di 0.50', () => {
    const r = generateCustomSlips(mkMatches(6, [], true), 10, 45);
    let prev = 0;
    for (const s of r.coverageSlips) {
      expect(s.stake % 0.5).toBeCloseTo(0, 10); // step da 0.50
      expect(s.cumulativeCost).toBeGreaterThan(prev);
      prev = s.cumulativeCost;
    }
    // tutte UNDER risolte: ogni copertura e' stata piazzata e persa
    expect(r.maxPotentialExposure).toBe(r.totalInvestedSoFar);
  });

  it('asymmetric front_loaded -> target step variabile', () => {
    const flat = generateCustomSlips(mkMatches(6, [], true), 10, 45, 'flat');
    const front = generateCustomSlips(mkMatches(6, [], true), 10, 45, 'front_loaded');
    expect(front.coverageSlips[0].targetProfit).toBeGreaterThan(
      front.coverageSlips[5].targetProfit,
    );
    expect(flat.coverageSlips[0].targetProfit).toBe(45);
  });
});

describe('generateCustomSlips — netto reale del relay (regressione bancata finale C7/C8)', () => {
  it('Over@7 su 8, match 8 UNDER: vince C7, ma il netto reale sconta lo stake della singola C8 persa', () => {
    const r = generateCustomSlips(mkMatches(8, [7]), 20, 45);
    const C7 = r.coverageSlips[6];
    const C8 = r.coverageSlips[7];

    expect(r.overallStatus).toBe('WON_COVERAGE');
    expect(r.winningSlipCode).toBe('C7');
    // la singola finale C8 viene comunque piazzata dal relay e persa
    expect(C8.status).toBe('LOST');
    // capitale reale = S0 + TUTTE le puntate C1..C8
    expect(r.totalInvestedSoFar).toBe(r.maxPotentialExposure);

    // netto realizzato = payout C7 - tutto il capitale piazzato
    expect(r.netGainRealized).toBeCloseTo(C7.potentialGrossPayout - r.totalInvestedSoFar, 2);
    // regressione: prima il banner mostrava C7.potentialNetProfit, ignorando C8
    expect(r.netGainRealized).not.toBe(C7.potentialNetProfit);
    expect(r.netGainRealized).toBeCloseTo(C7.potentialNetProfit - C8.stake, 2);

    // proiezione per card: netto reale se vince = payout - esposizione massima
    expect(C7.realizedNetIfWon).toBeCloseTo(C7.potentialGrossPayout - r.maxPotentialExposure, 2);
    expect(C7.realizedNetIfWon).toBeLessThan(0);
    expect(C8.realizedNetIfWon).toBeCloseTo(C8.potentialGrossPayout - r.maxPotentialExposure, 2);
    expect(C8.realizedNetIfWon).toBeGreaterThan(0);
  });

  it('Over@7 e Over@8 su 8: vince la singola C8, nessuna puntata successiva -> netto = target', () => {
    const r = generateCustomSlips(mkMatches(8, [7, 8]), 20, 45);
    const C8 = r.coverageSlips[7];
    expect(r.winningSlipCode).toBe('C8');
    expect(r.netGainRealized).toBeCloseTo(C8.potentialGrossPayout - r.totalInvestedSoFar, 2);
    expect(r.netGainRealized).not.toBeLessThan(0);
  });

  it('Over intermedio (Over@5 su 8): il netto reale sconta TUTTE le puntate successive C6..C8', () => {
    const r = generateCustomSlips(mkMatches(8, [5]), 20, 45);
    const C5 = r.coverageSlips[4];
    const futureStakes = r.coverageSlips.slice(5).reduce((acc, s) => acc + s.stake, 0);
    expect(r.winningSlipCode).toBe('C5');
    expect(r.netGainRealized).toBeCloseTo(C5.potentialNetProfit - futureStakes, 2);
    expect(C5.realizedNetIfWon).toBeCloseTo(C5.potentialNetProfit - futureStakes, 2);
  });

  it('madre WON (tutti UNDER): netto invariato = motherGross - capitale piazzato', () => {
    const r = generateCustomSlips(mkMatches(8, []), 20, 45);
    expect(r.overallStatus).toBe('WON_MOTHER');
    expect(r.netGainRealized).toBeCloseTo(
      r.motherSlip.potentialGrossPayout - r.totalInvestedSoFar,
      2,
    );
    expect(r.motherSlip.realizedNetIfWon).toBeCloseTo(
      r.motherSlip.potentialGrossPayout - r.maxPotentialExposure,
      2,
    );
  });
});

describe('generateCustomSlips — finale in banca (LAY exchange, green-up)', () => {
  const genLay = (over: number[], mode: 'flat' | 'back_loaded' = 'flat') =>
    generateCustomSlips(mkMatches(8, over), 20, 45, mode, false, 1.1, 4, 'lay_exchange', 1.3, 5);

  it('Over@7 su 8, match 8 UNDER: la bancata C8 pareggia i due rami finali', () => {
    const r = genLay([7]);
    const C7 = r.coverageSlips[6];
    const C8 = r.coverageSlips[7];

    expect(C8.type).toBe('FINAL_LAY');
    expect(C8.items[0].market).toBe('LAY UNDER 3.5');
    expect(C8.status).toBe('LOST'); // esce Under: la banca perde la responsabilita'

    // stake banca = payout attiva / (L - c) = payout C7 / (1.3 - 0.05)
    expect(C8.stake).toBeCloseTo(C7.potentialGrossPayout / 1.25, 0);
    expect(C8.liability).toBeCloseTo(C8.stake * 0.3, 2);
    expect(C8.commissionPct).toBe(5);

    // F14: l'ultima copertura book e' sovradimensionata (k=(L-c)/(1-c)) cosi'
    // il green-up con la banca chiude ENTRAMBI i rami al target (45), non a ~0
    expect(C7.stake).toBeGreaterThan(50); // 43 -> 63.5/65 con sizing bancata
    expect(C7.realizedNetIfWon).toBeCloseTo(45, -1);
    expect(C8.realizedNetIfWon).toBeCloseTo(45, -1);

    // green-up: entrambi i rami finali positivi e (quasi) pari
    expect(C7.realizedNetIfWon).toBeGreaterThan(0);
    expect(C8.realizedNetIfWon).toBeGreaterThan(0);
    expect(Math.abs(C7.realizedNetIfWon - C8.realizedNetIfWon)).toBeLessThanOrEqual(0.5);

    // netto realizzato = ramo Under (vince C7, responsabilita' della banca persa)
    expect(r.netGainRealized).toBeCloseTo(C7.realizedNetIfWon, 2);
    // esposizione = puntate bookmaker + responsabilita' banca
    expect(r.maxPotentialExposure).toBeCloseTo(r.totalInvestedSoFar, 2);
  });

  it('Over@7 e Over@8: vince la banca — la responsabilita NON viene persa', () => {
    const r = genLay([7, 8]);
    const C8 = r.coverageSlips[7];
    expect(r.winningSlipCode).toBe('C8');
    expect(C8.status).toBe('WON');
    // ramo Over: utile netto banca meno SOLO le puntate bookmaker
    expect(r.netGainRealized).toBeCloseTo(C8.realizedNetIfWon, 2);
    expect(r.netGainRealized).toBeGreaterThan(0);
  });

  it('tutti UNDER: vince la madre, la banca è dimensionata sul payout madre', () => {
    const r = genLay([]);
    const C8 = r.coverageSlips[7];
    expect(C8.stake).toBeCloseTo(r.motherSlip.potentialGrossPayout / 1.25, 0);
    expect(r.overallStatus).toBe('WON_MOTHER');
    expect(r.netGainRealized).toBeCloseTo(r.motherSlip.realizedNetIfWon, 2);
  });

  it('default book_single: la finale resta la singola Over in bookmaker', () => {
    const r = generateCustomSlips(mkMatches(8, [7]), 20, 45);
    expect(r.coverageSlips[7].type).toBe('FINAL_SINGLE');
    expect(r.coverageSlips[7].items[0].market).toBe('OVER 3.5');
    expect(r.coverageSlips[7].liability).toBeUndefined();
  });

  it('stake bancata MANUALE (es. 40): scala standard, netti dei due rami onesti', () => {
    // l'utente fissa lui lo stake della banca (40): nessun gonfio su C7
    const r = generateCustomSlips(mkMatches(8, [7]), 20, 45, 'flat', false, 1.1, 4, 'lay_exchange', 1.3, 5, 40);
    const C7 = r.coverageSlips[6];
    const C8 = r.coverageSlips[7];
    expect(C8.stake).toBe(40);
    expect(C8.liability).toBeCloseTo(40 * 0.3, 2); // 12€ @1.30
    // C7 torna al sizing standard (43, non 63.5 del green-up automatico)
    expect(C7.stake).toBe(43);
    // ramo Under (vince C7): 170.28 - 125 - 12
    expect(C7.realizedNetIfWon).toBeCloseTo(170.28 - 125 - 12, 2);
    expect(r.netGainRealized).toBeCloseTo(C7.realizedNetIfWon, 2);
    // ramo Over (vince la banca): 40*0.95 - 125 — mostrato onesto in rosso
    expect(C8.realizedNetIfWon).toBeCloseTo(40 * 0.95 - 125, 2);
    expect(C8.realizedNetIfWon).toBeLessThan(0);
  });

  it('back_loaded: target leggeri all inizio, recupero caricato in finale', () => {
    const r = genLay([7], 'back_loaded');
    const targets = r.coverageSlips.map((s) => s.targetProfit);
    expect(targets[0]).toBeLessThan(targets[7]);
    expect(targets[0]).toBe(15);
    expect(targets[7]).toBe(80);
    // scenario utente (Over@7): entrambi i rami finali chiudono al target C7 (70)
    expect(r.netGainRealized).toBeCloseTo(70, -1);
    expect(r.coverageSlips[7].realizedNetIfWon).toBeCloseTo(70, -1);
    const rO = genLay([7, 8], 'back_loaded');
    expect(rO.netGainRealized).toBeCloseTo(70, -1);
    // Over precoce (Over@1): il green-up non puo' recuperare, l'app lo mostra onesto
    const rEarly = genLay([1], 'back_loaded');
    expect(rEarly.netGainRealized).toBeLessThan(0);
  });
});
