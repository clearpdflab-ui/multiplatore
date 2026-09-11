import { describe, it, expect } from 'vitest';
import { buildSequentialTimeline } from '../../src/engine/timeline';
import { ModelParameters } from '../../src/types';

const base: ModelParameters = {
  totalEvents: 4,
  baseStake: 10,
  underOdds: 1.32,
  overOdds: 3.0,
  targetProfit: 45,
  model: 'real_product',
  finalSingleOdds: 3.0,
  enableBooster: false,
};

describe('buildSequentialTimeline', () => {
  it('tutte pending -> timeline completa IN_PROGRESS', () => {
    const r = buildSequentialTimeline(base, ['PENDING', 'PENDING', 'PENDING', 'PENDING']);
    expect(r.timeline).toHaveLength(4);
    expect(r.simulationStatus).toBe('IN_PROGRESS');
    expect(r.timeline[0].status).toBe('ACTIVE');
    expect(r.currentActiveTicketDesc).toContain('Multipla Madre');
  });

  it('tutti under -> WON con vincita base', () => {
    const r = buildSequentialTimeline(base, ['UNDER', 'UNDER', 'UNDER', 'UNDER']);
    expect(r.simulationStatus).toBe('WON');
    const raw = Math.pow(1.32, 4);
    // 4 eventi < 5 -> nessun bonus nel modello base
    const gross = 10 * raw;
    expect(r.finalPayout).toBeCloseTo(Number(gross.toFixed(2)), 1);
  });

  it('over al match 2 -> ticket sostitutivo e step successivi FINISHED dopo risoluzione', () => {
    const r = buildSequentialTimeline(base, ['UNDER', 'OVER', 'PENDING', 'PENDING']);
    expect(r.timeline[0].status).toBe('RESOLVED_UNDER');
    expect(r.timeline[1].status).toBe('RESOLVED_OVER_SWAP');
    expect(r.currentActiveTicketDesc).toContain('Schedina Sostitutiva');
    expect(r.timeline[2].activeTicketType).toBe('REPLACEMENT');
  });

  it('modello original_sum usa la somma delle quote (il bug del CSV)', () => {
    const p = { ...base, model: 'original_sum' as const };
    const r = buildSequentialTimeline(p, ['PENDING', 'PENDING', 'PENDING', 'PENDING']);
    // step1: over 3.0 + 3 under 1.32 = 6.96 senza bonus
    expect(r.timeline[0].finalOddsWithBonus).toBeCloseTo(6.96, 1);
  });

  it('booster sotto soglia -> eventi copertura +1 e quota x booster', () => {
    const p = { ...base, enableBooster: true, boosterOdds: 1.1, boosterThresholdEvents: 4 };
    const r = buildSequentialTimeline(p, ['PENDING', 'PENDING', 'PENDING', 'PENDING']);
    const last = r.timeline[3]; // singola finale: 1 evento + booster
    expect(last.hasBooster).toBe(true);
    expect(last.eventsInCoverage).toBe(2);
    expect(last.rawOdds).toBeCloseTo(3.3, 1);
  });

  it('stake cumulato e costo monotoni', () => {
    const r = buildSequentialTimeline(base, ['PENDING', 'PENDING', 'PENDING', 'PENDING']);
    let prevCost = 0;
    for (const s of r.timeline) {
      expect(s.stake).toBeGreaterThanOrEqual(0.5);
      expect(s.cumulativeCostSoFar).toBeGreaterThanOrEqual(prevCost);
      prevCost = s.cumulativeCostSoFar;
    }
    expect(r.totalSpentSoFar).toBeCloseTo(r.timeline[3].cumulativeCostSoFar, 2);
  });

  it('capitale_preservation e front_loaded cambiano i target', () => {
    const flat = buildSequentialTimeline(base, ['PENDING', 'PENDING', 'PENDING', 'PENDING']);
    const cap = buildSequentialTimeline(
      { ...base, asymmetricMode: 'capital_preservation' },
      ['PENDING', 'PENDING', 'PENDING', 'PENDING'],
    );
    expect(flat.timeline[1].stepTargetProfit).toBe(45);
    // capital_preservation: ultimi 2 step target 0
    expect(cap.timeline[3].stepTargetProfit).toBe(0);
    expect(cap.timeline[0].stepTargetProfit).toBeGreaterThan(45);
  });
});
