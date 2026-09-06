import { describe, expect, it, test } from 'vitest';
import { calculateBookmakerAggio, BOOKMAKER_MODELS } from '../../src/engine/odds';
import { getBonusPercentage } from '../../src/engine/bonus';
import { roundToFiftyCents, getStepTargetProfit } from '../../src/engine/dutching';
import { calculateSteps } from '../../src/engine/calculations';
import { calculateBinomialRisk } from '../../src/engine/risk_internal';

describe('calculateBookmakerAggio', () => {
  it('should calculate correct aggio for 1.32/3.00', () => {
    const result = calculateBookmakerAggio(1.32, 3.00);
    expect(result.aggioPercent).toBeCloseTo(9.09, 1);
    expect(result.payoutPercent).toBeCloseTo(91.67, 1);
  });

  it('should calculate correct aggio for 1.30/3.15', () => {
    const result = calculateBookmakerAggio(1.30, 3.15);
    expect(result.aggioPercent).toBeCloseTo(8.67, 1);
  });
});

describe('BOOKMAKER_MODELS', () => {
  it('should have both models defined', () => {
    expect(BOOKMAKER_MODELS['132_300'].underOdds).toBe(1.32);
    expect(BOOKMAKER_MODELS['130_315'].underOdds).toBe(1.30);
    expect(BOOKMAKER_MODELS['132_300'].overOdds).toBe(3.00);
    expect(BOOKMAKER_MODELS['130_315'].overOdds).toBe(3.15);
  });
});

describe('getBonusPercentage', () => {
  it('should return correct bonus percentages', () => {
    expect(getBonusPercentage(8)).toBe(26.2);
    expect(getBonusPercentage(7)).toBe(18.0);
    expect(getBonusPercentage(6)).toBe(12.0);
    expect(getBonusPercentage(5)).toBe(6.0);
    expect(getBonusPercentage(4)).toBe(0.0);
    expect(getBonusPercentage(3)).toBe(0.0);
  });
});

describe('roundToFiftyCents', () => {
  it('should round to nearest 0.50 increment', () => {
    expect(roundToFiftyCents(2.14)).toBe(2.5);
    expect(roundToFiftyCents(3.42)).toBe(3.5);
    expect(roundToFiftyCents(4.0)).toBe(4.0);
    expect(roundToFiftyCents(0.5)).toBe(1);
    expect(roundToFiftyCents(0.1)).toBe(1);
  });
});

describe('getStepTargetProfit', () => {
  it('should return flat target for flat mode', () => {
    const result = getStepTargetProfit(3, 8, 45, 'flat');
    expect(result).toBe(45);
  });

  it('should return 0 for capital_preservation on final steps', () => {
    const result = getStepTargetProfit(7, 8, 45, 'capital_preservation');
    expect(result).toBe(0);
  });

  it('should return higher for front_loaded on early steps', () => {
    const result = getStepTargetProfit(1, 8, 45, 'front_loaded');
    expect(result).toBeGreaterThan(45);
  });
});

describe('calculateSteps', () => {
  const baseParams = {
    totalEvents: 3,
    baseStake: 20,
    underOdds: 1.32,
    overOdds: 3.0,
    targetProfit: 45,
    model: 'real_product' as const,
    finalSingleOdds: 2.75,
    enableBooster: false,
    boosterOdds: 1.10,
    boosterThresholdEvents: 4,
    asymmetricMode: 'flat' as const,
  };

  it('should generate correct number of steps', () => {
    const steps = calculateSteps(baseParams);
    expect(steps.length).toBe(3);
  });

  it('should have final step as single', () => {
    const steps = calculateSteps(baseParams);
    expect(steps[steps.length - 1].name).toContain('Singola Finale');
  });

  it('should calculate odds using product model', () => {
    const steps = calculateSteps({ ...baseParams, totalEvents: 2 });
    expect(steps[0].calculatedOdds).toBeCloseTo(3.96, 2);
  });

it('should show booster in formula when enabled', () => {
     const steps = calculateSteps({ ...baseParams, totalEvents: 8, enableBooster: true });
     const lastStep = steps[steps.length - 1];
     expect(lastStep.oddsFormulaText).toContain('Booster');
   });
});

describe('calculateBinomialRisk', () => {
  it('should calculate risk for 9 events', () => {
    const risk = calculateBinomialRisk(9, 1.32, 3.0);
    expect(risk.pUnder).toBeGreaterThan(50);
    expect(risk.pOver).toBeLessThan(50);
    expect(risk.pMultipleErrors).toBeGreaterThan(0);
    expect(risk.bookmakerMargin).toBeGreaterThan(0);
  });

  it('should have probabilities summing to ~100', () => {
    const risk = calculateBinomialRisk(9, 1.32, 3.0);
    const total = risk.pZeroErrors + risk.pOneError + risk.pMultipleErrors;
    expect(total).toBeCloseTo(100, 0);
  });
});
