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
    generateCustomSlips(mkMatches(8, over), 20, 45, mode, false, 1.1, 4, 'lay_exchange', {
      layOdds: 1.3,
    });

  it('Over@7 su 8, match 8 UNDER: la bancata C8 pareggia i due rami finali', () => {
    const r = genLay([7]);
    const C7 = r.coverageSlips[6];
    const C8 = r.coverageSlips[7];

    expect(C8.type).toBe('FINAL_LAY');
    expect(C8.items[0].market).toBe('LAY UNDER 3.5');
    expect(C8.status).toBe('LOST'); // esce Under: la banca perde la responsabilita'

    // stake banca = payout attiva / (L - c) = payout C7 / (1.3 - 0.05)
    expect(C8.stake).toBeCloseTo(C7.potentialGrossPayout / 1.255, 0);
    expect(C8.liability).toBeCloseTo(C8.stake * 0.3, 2);
    expect(C8.commissionPct).toBe(4.5);

    // F14 rivisto: sizing STANDARD su tutta la scala (niente gonfio su C7:
    // con quote lay alte esplodeva, es. 34 -> 93 sui dati reali utente)
    expect(C7.stake).toBe(43);

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

  it('tutti UNDER risolti: vince la madre, la banca è dimensionata sul payout madre', () => {
    const r = genLay([]);
    const C8 = r.coverageSlips[7];
    expect(C8.stake).toBeCloseTo(r.motherSlip.potentialGrossPayout / 1.255, 0);
    expect(r.overallStatus).toBe('WON_MOTHER');
    expect(r.netGainRealized).toBeCloseTo(r.motherSlip.realizedNetIfWon, 2);
  });

  it('PIANO (match pending): banca dimensionata sullo scontro C7/C8, NON sul lock della madre', () => {
    // regressione "puntate sballate": a piano il riferimento era la madre
    // (payout 8 gambe) -> banca da 912€/RESP 866 sui dati reali. Ora il
    // riferimento e' l'ultima copertura C_{N-1} (lo scontro tipico).
    const r = generateCustomSlips(mkMatches(8, [], false), 20, 45, 'flat', false, 1.1, 4, 'lay_exchange', { layOdds: 1.3 });
    const C7 = r.coverageSlips[6];
    const C8 = r.coverageSlips[7];
    expect(C8.stake).toBeCloseTo(C7.potentialGrossPayout / 1.255, 0);
    // NON dimensionata sulla madre ( sarebbe motherGross/1.255 ~ 185, non 136 )
    expect(Math.abs(C8.stake - r.motherSlip.potentialGrossPayout / 1.255)).toBeGreaterThan(10);
    // banca NON ancora piazzata: il netto se vince C7 non sconta la
    // responsabilita' (e' il "atteso" puro del relay = target)
    expect(C7.realizedNetIfWon).toBeCloseTo(C7.potentialNetProfit, 2);
    expect(C7.realizedNetIfWon).toBeCloseTo(45, 0);
    // la banca mostra il suo ramo: utile se Over meno puntate book
    expect(C8.realizedNetIfWon).toBeCloseTo(C8.potentialGrossPayout - 125, 2);
  });

  it('default book_single: la finale resta la singola Over in bookmaker', () => {
    const r = generateCustomSlips(mkMatches(8, [7]), 20, 45);
    expect(r.coverageSlips[7].type).toBe('FINAL_SINGLE');
    expect(r.coverageSlips[7].items[0].market).toBe('OVER 3.5');
    expect(r.coverageSlips[7].liability).toBeUndefined();
  });

  it('stake bancata MANUALE (es. 40): scala standard, netti dei due rami onesti', () => {
    // l'utente fissa lui lo stake della banca (40): nessun gonfio su C7
    const r = generateCustomSlips(mkMatches(8, [7]), 20, 45, 'flat', false, 1.1, 4, 'lay_exchange', { layOdds: 1.3, layStake: 40 });
    const C7 = r.coverageSlips[6];
    const C8 = r.coverageSlips[7];
    expect(C8.stake).toBe(40);
    expect(C8.liability).toBeCloseTo(40 * 0.3, 2); // 12€ @1.30
    // C7 torna al sizing standard (43, non 63.5 del green-up automatico)
    expect(C7.stake).toBe(43);
    // ramo Under (vince C7): 170.28 - 125 - 12
    expect(C7.realizedNetIfWon).toBeCloseTo(170.28 - 125 - 12, 2);
    expect(r.netGainRealized).toBeCloseTo(C7.realizedNetIfWon, 2);
    // ramo Over (vince la banca): 40*0.955 - 125 — mostrato onesto in rosso
    expect(C8.realizedNetIfWon).toBeCloseTo(40 * 0.955 - 125, 2);
    expect(C8.realizedNetIfWon).toBeLessThan(0);
  });

  it('back_loaded: target leggeri all inizio, recupero caricato in finale', () => {
    const r = genLay([7], 'back_loaded');
    const targets = r.coverageSlips.map((s) => s.targetProfit);
    expect(targets[0]).toBeLessThan(targets[7]);
    expect(targets[0]).toBe(15);
    expect(targets[7]).toBe(80);
    // scenario utente (Over@7): green-up pari sul target pesante di C7 (~+22)
    expect(r.netGainRealized ?? 0).toBeGreaterThan(20);
    expect(r.coverageSlips[7].realizedNetIfWon).toBeGreaterThan(20);
    expect(Math.abs((r.netGainRealized ?? 0) - r.coverageSlips[7].realizedNetIfWon)).toBeLessThanOrEqual(1);
    const rO = genLay([7, 8], 'back_loaded');
    expect(rO.netGainRealized ?? 0).toBeGreaterThan(20);
    // Over precoce (Over@1): il green-up non puo' recuperare, l'app lo mostra onesto
    const rEarly = genLay([1], 'back_loaded');
    expect(rEarly.netGainRealized).toBeLessThan(0);
  });
});

describe('generateCustomSlips — ARMONIZZAZIONE regola mai-perdita (F15)', () => {
  // quote reali della "multipla prova" utente (8 match, Under 1.33-1.95)
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
  const mkReal = (): UserMatch[] =>
    REAL_ODDS.map(([u, o], i) => ({
      id: `r${i + 1}`,
      order: i + 1,
      timeSlot: `t${i}`,
      homeTeam: `H${i + 1}`,
      awayTeam: `A${i + 1}`,
      underOdds: u,
      overOdds: o,
      outcome: 'PENDING' as const,
    }));

  it('lay 1.40 in-play: dutching a payout comune, OGNI ramo finale chiude positivo', () => {
    const r = generateCustomSlips(mkReal(), 40, 45, 'flat', false, 1.1, 4, 'lay_exchange', {
      layOdds: 1.4,
      harmonized: true,
    });
    expect(r.harmonization?.requested).toBe(true);
    expect(r.harmonization?.feasible).toBe(true);
    // payout comune su tutte le coperture (dutching, tolleranza arrotondamenti)
    const pays = r.coverageSlips.slice(0, 7).map((s) => s.potentialGrossPayout);
    expect(Math.max(...pays) - Math.min(...pays)).toBeLessThan(30);
    // OGNI ramo (madre, C1..C7 se vincono, banca se esce Over) >= 0
    [r.motherSlip, ...r.coverageSlips].forEach((s) => {
      expect(s.realizedNetIfWon).toBeGreaterThan(0);
    });
    // il netto garantito ~ il target (45)
    expect(r.harmonization?.equalizedNet ?? 0).toBeGreaterThan(40);
  });

  it('lay 1.95 pre-match (utente): IMPOSSIBILE armonizzare, fallback standard onesto', () => {
    const r = generateCustomSlips(mkReal(), 40, 45, 'flat', false, 1.1, 4, 'lay_exchange', {
      layOdds: 1.95,
      harmonized: true,
    });
    expect(r.harmonization?.requested).toBe(true);
    expect(r.harmonization?.feasible).toBe(false);
    // quota lay massima ammessa ~1.75 con queste quote/commissione
    expect(r.harmonization?.maxLayQuote ?? 0).toBeLessThan(1.8);
    expect(r.harmonization?.maxLayQuote ?? 0).toBeGreaterThan(1.7);
    // fallback: sizing standard (C7 = 34 sui dati reali)
    expect(r.coverageSlips[6].stake).toBe(34);
    expect(r.harmonization?.equalizedNet).toBeNull();
  });

  it('book_single: nessuna info di armonizzazione', () => {
    const r = generateCustomSlips(mkMatches(8, [7]), 20, 45);
    expect(r.harmonization).toBeNull();
  });

  it('senza armonizzazione richiesta: harmonization null anche in lay', () => {
    const r = generateCustomSlips(mkReal(), 40, 45, 'flat', false, 1.1, 4, 'lay_exchange', {
      layOdds: 1.4,
    });
    expect(r.harmonization).toBeNull();
  });
});

describe('generateCustomSlips — gambe SOLO 1° TEMPO (F17)', () => {
  it('partita con firstHalfOnly: madre e coperture usano le etichette 1T', () => {
    const matches = mkMatches(3, []);
    matches[0].firstHalfOnly = true; // match 1 solo primo tempo
    const r = generateCustomSlips(matches, 10, 45, 'flat', false, 1.1, 4, 'lay_exchange', {
      layOdds: 1.3,
    });
    // madre: la gamba del match 1 e' Under 3.5 1T, le altre restano integrali
    expect(r.motherSlip.items[0].market).toBe('UNDER 3.5 1T');
    expect(r.motherSlip.items[1].market).toBe('UNDER 3.5');
    // C1: prima gamba Over del match 1 -> OVER 3.5 1T
    expect(r.coverageSlips[0].items[0].market).toBe('OVER 3.5 1T');
    // C1 gambe successive (match 2,3 Under): integrali
    expect(r.coverageSlips[0].items[1].market).toBe('UNDER 3.5');
    // C2: prima gamba Over del match 2 integrale
    expect(r.coverageSlips[1].items[0].market).toBe('OVER 3.5');
    // banca finale (match 3 integrale): LAY UNDER 3.5
    expect(r.coverageSlips[2].items[0].market).toBe('LAY UNDER 3.5');
  });

  it('ultimo match con firstHalfOnly: la banca finale e in 1T', () => {
    const matches = mkMatches(3, []);
    matches[2].firstHalfOnly = true; // ultimo match solo primo tempo
    const r = generateCustomSlips(matches, 10, 45, 'flat', false, 1.1, 4, 'lay_exchange', {
      layOdds: 1.3,
    });
    expect(r.coverageSlips[2].type).toBe('FINAL_LAY');
    expect(r.coverageSlips[2].items[0].market).toBe('LAY UNDER 3.5 1T');
    // le gambe Under del match 3 nelle coperture C1/C2 sono 1T
    expect(r.coverageSlips[0].items[2].market).toBe('UNDER 3.5 1T');
    expect(r.coverageSlips[1].items[1].market).toBe('UNDER 3.5 1T');
  });
});

describe('generateCustomSlips — ARMONIZZATO punta/punta (F20)', () => {
  const mkBook = (odds: [number, number][]): UserMatch[] =>
    odds.map(([u, o], i) => ({
      id: `b${i + 1}`,
      order: i + 1,
      timeSlot: `t${i}`,
      homeTeam: `H${i + 1}`,
      awayTeam: `A${i + 1}`,
      underOdds: u,
      overOdds: o,
      outcome: 'PENDING' as const,
    }));

  it('dutching puro chiude se SOMMA(1/m) < 1: OGNI ramo positivo', () => {
    const r = generateCustomSlips(
      mkBook([
        [1.9, 3.5],
        [1.9, 3.5],
        [1.9, 3.5],
        [1.9, 3.5],
      ]),
      20,
      45,
      'flat',
      false,
      1.1,
      4,
      'book_single',
      { harmonized: true },
    );
    expect(r.harmonization?.requested).toBe(true);
    expect(r.harmonization?.finaleMode).toBe('book');
    expect(r.harmonization?.feasible).toBe(true);
    expect(r.coverageSlips[3].type).toBe('FINAL_SINGLE');
    [r.motherSlip, ...r.coverageSlips].forEach((s) => {
      expect(s.realizedNetIfWon).toBeGreaterThan(0);
    });
    expect(r.harmonization?.equalizedNet ?? 0).toBeGreaterThan(40);
  });

  it('dutching puro impossibile (margine book): fallback standard + reason', () => {
    const r = generateCustomSlips(mkMatches(8, [7]), 20, 45, 'flat', false, 1.1, 4, 'book_single', {
      harmonized: true,
    });
    expect(r.harmonization?.finaleMode).toBe('book');
    expect(r.harmonization?.feasible).toBe(false);
    expect(r.harmonization?.reason).toBe('dutch');
    expect(r.harmonization?.equalizedNet).toBeNull();
  });

  it('F22 armonizzato: gamba sotto 1.25 -> rifiuto con reason quota', () => {
    // Singola finale Over a 1.10 (< 1.25): regola min quota violata.
    const matches = mkMatches(4, [], false);
    matches[3].overOdds = 1.1;
    const rBook = generateCustomSlips(matches, 20, 45, 'flat', false, 1.1, 4, 'book_single', {
      harmonized: true,
    });
    expect(rBook.harmonization?.requested).toBe(true);
    expect(rBook.harmonization?.feasible).toBe(false);
    expect(rBook.harmonization?.reason).toBe('quota');
    // Stessa violazione in lay: copertura con Under a 1.10
    const matches2 = mkMatches(4, [], false);
    matches2[1].underOdds = 1.1;
    const rLay = generateCustomSlips(matches2, 20, 45, 'flat', false, 1.1, 4, 'lay_exchange', {
      layOdds: 1.3,
      harmonized: true,
    });
    expect(rLay.harmonization?.feasible).toBe(false);
    expect(rLay.harmonization?.reason).toBe('quota');
  });
});

describe('generateCustomSlips — MODO BUDGET F23 (P = I_tot + t)', () => {
  const mkBudget = (): UserMatch[] =>
    [1, 2, 3, 4].map((i) => ({
      id: `b${i}`,
      order: i,
      timeSlot: `t${i}`,
      homeTeam: `H${i}`,
      awayTeam: `A${i}`,
      underOdds: 1.9,
      overOdds: 3.5,
      outcome: 'PENDING' as const,
    }));

  const BUDGET_OPTS = { layOdds: 1.5, layCommissionPct: 4.5, harmonized: true, budget: 150 };

  it('lay + budget 150 + t30: stake da (180)/m, ogni ramo verificato', () => {
    const r = generateCustomSlips(mkBudget(), 20, 30, 'flat', false, 1.1, 4, 'lay_exchange', BUDGET_OPTS);
    expect(r.harmonization?.requested).toBe(true);
    expect(r.harmonization?.feasible).toBe(true);
    expect(r.harmonization?.reason).toBeNull();
    expect(r.harmonization?.budgetUsed).toBe(150);
    // OGNI copertura book paga >= 180 (la banca ha payout = utile)
    for (const s of r.coverageSlips) {
      if (s.type === 'FINAL_LAY') {
        continue;
      }
      expect(s.potentialGrossPayout).toBeGreaterThanOrEqual(180);
    }
    // S0=20 basta: nessun bump (madre ricca)
    expect(r.motherSlip.stake).toBe(20);
    [r.motherSlip.realizedNetIfWon, ...r.coverageSlips.map((s) => s.realizedNetIfWon)].forEach(
      (net) => expect(net).toBeGreaterThanOrEqual(29),
    );
    expect(r.harmonization?.equalizedNet ?? 0).toBeGreaterThanOrEqual(29);
  });

  it('budget + base 1: S0 adeguato al minimo, rami comunque verificati', () => {
    const r = generateCustomSlips(mkBudget(), 1, 30, 'flat', false, 1.1, 4, 'lay_exchange', BUDGET_OPTS);
    expect(r.harmonization?.feasible).toBe(true);
    expect(r.motherSlip.stake).toBeGreaterThan(1);
    expect(r.motherSlip.stake).toBe(r.harmonization?.baseUsed);
    expect(r.harmonization?.baseMinRequired ?? 0).toBeGreaterThan(1);
  });

  it('book + budget 150 + t30: dutching da budget senza banca', () => {
    const r = generateCustomSlips(mkBudget(), 20, 30, 'flat', false, 1.1, 4, 'book_single', {
      harmonized: true,
      budget: 150,
    });
    expect(r.harmonization?.finaleMode).toBe('book');
    expect(r.harmonization?.feasible).toBe(true);
    expect(r.coverageSlips[3].type).toBe('FINAL_SINGLE');
    [r.motherSlip.realizedNetIfWon, ...r.coverageSlips.map((s) => s.realizedNetIfWon)].forEach(
      (net) => expect(net).toBeGreaterThanOrEqual(29),
    );
  });

  it('senza harmonized il budget viene ignorato (sizing standard)', () => {
    const r = generateCustomSlips(mkBudget(), 20, 30, 'flat', false, 1.1, 4, 'lay_exchange', {
      layOdds: 1.5,
      budget: 150,
    });
    expect(r.harmonization).toBeNull();
    // sizing sequenziale standard: la C1 non paga 180
    expect(r.coverageSlips[0].potentialGrossPayout).toBeLessThan(180);
  });

  it('F26: line=2.5 -> etichette UNDER 2.5 / OVER 2.5 su madre e coperture', () => {
    const r = generateCustomSlips(mkMatches(4, [1]), 10, 45, 'flat', false, 1.1, 4, 'book_single', undefined, 2.5);
    expect(r.motherSlip.items.every((i) => i.market === 'UNDER 2.5')).toBe(true);
    expect(r.coverageSlips[0].items[0].market).toBe('OVER 2.5');
    expect(r.coverageSlips[0].items.filter((i) => i.market === 'UNDER 2.5')).toHaveLength(3);
    expect(r.coverageSlips[3].items[0].market).toBe('OVER 2.5');
  });

  it('F26: default senza line -> etichette 3.5 (retrocompatibilita)', () => {
    const r = generateCustomSlips(mkMatches(3), 10, 45);
    expect(r.motherSlip.items.every((i) => i.market === 'UNDER 3.5')).toBe(true);
  });
});
