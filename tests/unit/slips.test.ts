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

  it('2+ Over -> sistema saltato', () => {
    const r = generateCustomSlips(mkMatches(5, [2, 4]), 10, 45);
    expect(r.overallStatus).toBe('LOST_MULTIPLE_OVERS');
    expect(r.netGainRealized).toBeLessThan(0);
    // la copertura dell'OVER sbagliato (non primo) e' persa
    expect(r.coverageSlips[3].status).toBe('LOST');
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
