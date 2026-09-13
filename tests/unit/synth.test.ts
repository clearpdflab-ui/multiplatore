import { describe, expect, it } from 'vitest';
import { generateIdealLadders, QUOTA_FLOOR } from '../../src/engine/synth';

describe('generateIdealLadders — scala ideale da q0 + target (F24)', () => {
  it('q0=1.6/over 3.0, t=45: trova scale fattibili con N nel range', () => {
    const r = generateIdealLadders({ q0: 1.6, overQ: 3.0, targetProfit: 45, baseStake: 1 });
    expect(r.clamped).toBe(false);
    expect(r.q0used).toBe(1.6);
    expect(r.best).not.toBeNull();
    const best = r.best!;
    expect(best.n).toBeGreaterThanOrEqual(5);
    expect(best.n).toBeLessThanOrEqual(30);
    expect(best.sol.feasible).toBe(true);
    expect(best.unders.every((q) => q >= QUOTA_FLOOR)).toBe(true);
    expect(best.overs.every((q) => q >= QUOTA_FLOOR)).toBe(true);
    // garantito sul target (tolleranza arrotondamenti)
    expect(best.sol.equalizedNet ?? 0).toBeGreaterThanOrEqual(44);
    best.sol.branchNets.forEach((net) => expect(net).toBeGreaterThan(0));
    expect(r.ladders.length).toBeLessThanOrEqual(3);
  });

  it('q0 sotto il floor (1.1): clamp a 1.25 e segnalato', () => {
    const r = generateIdealLadders({ q0: 1.1, targetProfit: 45, nMin: 5, nMax: 6 });
    expect(r.clamped).toBe(true);
    expect(r.q0used).toBe(1.25);
    if (r.best) {
      expect(r.best.unders.every((q) => q >= 1.25)).toBe(true);
    }
  });

  it('quote impossibili (1.25/1.30): nessun N chiude -> best null', () => {
    const r = generateIdealLadders({
      q0: 1.25,
      overQ: 1.3,
      targetProfit: 45,
      nMin: 5,
      nMax: 8,
    });
    expect(r.best).toBeNull();
    expect(r.ladders).toHaveLength(0);
    expect(r.evaluated).toBe(4);
  });

  it('rispetta nMin/nMax e kickoff crescenti', () => {
    const r = generateIdealLadders({ q0: 1.4, targetProfit: 45, nMin: 6, nMax: 9 });
    expect(r.evaluated).toBe(4);
    for (const l of r.ladders) {
      expect(l.n).toBeGreaterThanOrEqual(6);
      expect(l.n).toBeLessThanOrEqual(9);
      expect(l.unders).toHaveLength(l.n);
      expect(l.overs).toHaveLength(l.n);
    }
  });
});
