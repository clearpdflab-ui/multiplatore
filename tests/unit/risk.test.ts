import { describe, it, expect } from 'vitest';
import { calculateBinomialRisk, evaluateScenario } from '../../src/engine/risk';
import { roundToFiftyCents, getStepTargetProfit } from '../../src/engine/dutching';

describe('calculateBinomialRisk', () => {
  it('normalizza under/over a probabilita complementari con margine', () => {
    const r = calculateBinomialRisk(8, 1.32, 3.0);
    expect(r.pUnder + r.pOver).toBeCloseTo(100, 0);
    expect(r.bookmakerMargin).toBeGreaterThan(0);
    // con 8 eventi e pOver ~30% l'errore singolo e' PIU' probabile dello 0-0
    expect(r.pOneError).toBeGreaterThan(r.pZeroErrors);
    expect(r.pMultipleErrors).toBeGreaterThan(0);
  });

  it('le tre classi di esito sommano a ~100%', () => {
    const r = calculateBinomialRisk(6, 1.32, 3.0);
    expect(r.pZeroErrors + r.pOneError + r.pMultipleErrors).toBeCloseTo(100, 0);
  });
});

const steps = [
  { step: 1, stake: 10, grossWin: 200 },
  { step: 2, stake: 12, grossWin: 210 },
];

describe('evaluateScenario', () => {
  it('zero over -> WIN_BASE', () => {
    const s = evaluateScenario(['UNDER', 'UNDER'], steps, 10, 30);
    expect(s.status).toBe('WIN_BASE');
    expect(s.grossWin).toBe(300);
    expect(s.totalCost).toBe(32);
    expect(s.netProfit).toBe(268);
  });

  it('un over sulla step 2 -> WIN_COVERAGE con vincita di quella step', () => {
    const s = evaluateScenario(['UNDER', 'OVER'], steps, 10, 30);
    expect(s.status).toBe('WIN_COVERAGE');
    expect(s.grossWin).toBe(210);
    expect(s.winningTicket).toContain('Match 2');
  });

  it('2+ over -> CATASTROPHIC_LOSS con perdita del totale speso', () => {
    const s = evaluateScenario(['OVER', 'OVER'], steps, 10, 30);
    expect(s.status).toBe('CATASTROPHIC_LOSS');
    expect(s.grossWin).toBe(0);
    expect(s.netProfit).toBe(-32);
    expect(s.description).toContain('2 eventi OVER');
  });

  it('over senza step corrispondente -> catastrophic', () => {
    const s = evaluateScenario(['UNDER', 'UNDER', 'OVER'], steps, 10, 30);
    expect(s.status).toBe('CATASTROPHIC_LOSS');
  });
});

describe('dutching helpers', () => {
  it('roundToFiftyCents: paventamento su 0.50 con minimo 1', () => {
    expect(roundToFiftyCents(0)).toBe(0.5);
    expect(roundToFiftyCents(-3)).toBe(0.5);
    expect(roundToFiftyCents(0.3)).toBe(1);
    expect(roundToFiftyCents(10.01)).toBe(10.5);
    expect(roundToFiftyCents(10.5)).toBe(10.5);
  });

  it('getStepTargetProfit flat = base sempre', () => {
    expect(getStepTargetProfit(3, 8, 45, 'flat')).toBe(45);
    expect(getStepTargetProfit(1, 8, 45)).toBe(45);
  });

  it('front_loaded decrescente col procedere degli step', () => {
    const first = getStepTargetProfit(1, 8, 45, 'front_loaded');
    const last = getStepTargetProfit(8, 8, 45, 'front_loaded');
    expect(first).toBeGreaterThan(last);
    expect(last).toBeGreaterThanOrEqual(5);
  });

  it('capital_preservation: 0 negli ultimi due step, boost nei primi due', () => {
    expect(getStepTargetProfit(7, 8, 45, 'capital_preservation')).toBe(0);
    expect(getStepTargetProfit(8, 8, 45, 'capital_preservation')).toBe(0);
    expect(getStepTargetProfit(1, 8, 45, 'capital_preservation')).toBe(55);
    expect(getStepTargetProfit(4, 8, 45, 'capital_preservation')).toBe(25);
  });
});
