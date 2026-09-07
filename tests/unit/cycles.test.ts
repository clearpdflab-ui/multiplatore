import { describe, expect, it } from 'vitest';
import {
  buildTerminationLegs,
  exposureSummary,
  findSharedLegs,
  normalizeLegKey,
  refillToThirty,
} from '../../src/engine/cycles';

describe('refillToThirty', () => {
  it('should refill to 30 cycling the pool without mutating inputs', () => {
    const current = [{ odds: 1.32, market: 'UNDER' as const, label: 'A' }];
    const pool = [
      { odds: 1.32, market: 'UNDER' as const, label: 'B' },
      { odds: 1.35, market: 'UNDER' as const, label: 'C' },
    ];
    const out = refillToThirty(current, pool);
    expect(out.length).toBe(30);
    expect(current.length).toBe(1);
    expect(out[0]).toEqual(current[0]);
    expect(out[1].label).toBe('B');
    expect(out[2].label).toBe('C');
    expect(out[3].label).toBe('B'); // pool cycles
  });

  it('should not cut a full mother and return short when pool is empty', () => {
    const full = Array.from({ length: 30 }, (_, i) => ({ odds: 1.32 as number, label: `M${i}` }));
    expect(refillToThirty(full, []).length).toBe(30);
    expect(refillToThirty([{ odds: 1.32 }], []).length).toBe(1);
  });
});

describe('findSharedLegs', () => {
  it('should normalize keys and report legs shared by 2+ cycles', () => {
    expect(normalizeLegKey('  Inter - Milan ')).toBe('inter - milan');
    const conflicts = findSharedLegs([
      { cycleId: 'c1', legKeys: ['Inter-Milan', 'Napoli-Roma'] },
      { cycleId: 'c2', legKeys: ['inter-milan', 'Juve-Lazio'] },
      { cycleId: 'c3', legKeys: ['Juve-Lazio', 'Atalanta-Fiorentina', ''] },
    ]);
    expect(conflicts.map((c) => c.key)).toEqual(['inter-milan', 'juve-lazio']);
    expect(conflicts[0].cycleIds).toEqual(['c1', 'c2']);
  });

  it('should ignore duplicates within one cycle and empty keys', () => {
    const conflicts = findSharedLegs([
      { cycleId: 'c1', legKeys: ['A', 'A', '  '] },
      { cycleId: 'c2', legKeys: ['B'] },
    ]);
    expect(conflicts).toEqual([]);
  });
});

describe('exposureSummary', () => {
  it('should wrap portfolio math (3000 bankroll, worst cost 450)', () => {
    const s = exposureSummary([], 3000, 450);
    expect(s.exposure).toBe(0);
    expect(s.nMax).toBe(3);
    expect(s.ok).toBe(true);
    const full = exposureSummary(
      [{ id: 'a', spent: 400 }, { id: 'b', spent: 400 }, { id: 'c', spent: 400 }],
      3000,
      450,
    );
    expect(full.exposure).toBe(1200);
    expect(full.ok).toBe(false);
  });
});

describe('buildTerminationLegs', () => {
  it('should build Over-first legs with N 1-30', () => {
    const legs = buildTerminationLegs(3.0, [1.32, 1.32, 1.32], 3);
    expect(legs?.length).toBe(3);
    expect(legs?.[0]).toMatchObject({ odds: 3.0, market: 'OVER' });
    expect(buildTerminationLegs(3.0, [1.32], 1)?.length).toBe(1);
  });

  it('should reject invalid N or short rest', () => {
    expect(buildTerminationLegs(3.0, [1.32], 0)).toBeNull();
    expect(buildTerminationLegs(3.0, [1.32], 31)).toBeNull();
    expect(buildTerminationLegs(3.0, [1.32], 5)).toBeNull(); // rest too short
    expect(buildTerminationLegs(1.0, [1.32], 1)).toBeNull();
  });
});
