import { describe, expect, it } from 'vitest';
import {
  findHarmonizableLadders,
  type FinderParams,
} from '../../src/engine/finder';
import type { CoverOddsRow } from '../../src/engine/coverOddsFeed';

const NOW = Date.parse('2026-09-12T12:00:00Z');

function mkRow(
  eventId: string,
  kickoff: string,
  under: number,
  over: number,
  status: CoverOddsRow['status'] = 'scheduled',
): CoverOddsRow {
  return {
    eventId,
    home: `Home ${eventId}`,
    away: `Away ${eventId}`,
    kickoff,
    league: 'Serie A',
    status,
    line: 3.5,
    books: [{ book: 'TestBook', under, over }],
    homeScore: null,
    awayScore: null,
    totalGoals: null,
    lineStatus: null,
  };
}

function kickoffs(n: number): string[] {
  return Array.from(
    { length: n },
    (_, i) =>
      `2026-09-${String(13 + Math.floor(i / 3)).padStart(2, '0')}T${String(14 + ((i * 3) % 8)).padStart(2, '0')}:00:00Z`,
  );
}

describe('findHarmonizableLadders', () => {
  it('pool sintetica buona: trova una scala fattibile con tutti i rami > 0', () => {
    const ks = kickoffs(10);
    const rows = ks.map((k, i) =>
      mkRow(`m${i + 1}`, k, 1.5 + (i % 3) * 0.1, 2.2 + (i % 4) * 0.15),
    );
    const params: FinderParams = {
      rows,
      now: NOW,
      baseStake: 20,
      targetProfit: 45,
      layCommissionPct: 5,
      lay: 1.3,
      minEvents: 5,
      maxEvents: 8,
      topK: 2,
    };
    const r = findHarmonizableLadders(params);
    expect(r.poolSize).toBe(10);
    expect(r.evaluations).toBeGreaterThan(0);
    expect(r.best).not.toBeNull();
    const best = r.best!;
    expect(best.feasible).toBe(true);
    expect(best.n).toBeGreaterThanOrEqual(5);
    expect(best.n).toBeLessThanOrEqual(8);
    // OGNI ramo finale positivo: madre, C1..C_{N-1}, banca
    best.branchNets.forEach((net) => expect(net).toBeGreaterThan(0));
    // garantito ~ target
    expect(best.equalizedNet ?? 0).toBeGreaterThan(40);
    // sequenza cronologica
    const times = best.rows.map((x) => new Date(x.kickoff).getTime());
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]);
    }
    // topK ordinato: best e' il primo
    expect(r.feasible[0]).toBe(best);
    expect(r.feasible.length).toBeLessThanOrEqual(2);
  });

  it('quota lay impossibile (3.0): nessun fattibile, ma indica la lay massima', () => {
    const ks = kickoffs(8);
    const rows = ks.map((k, i) => mkRow(`m${i + 1}`, k, 1.5, 2.4));
    const r = findHarmonizableLadders({
      rows,
      now: NOW,
      baseStake: 20,
      targetProfit: 45,
      lay: 3.0,
      minEvents: 5,
      maxEvents: 8,
    });
    expect(r.best).toBeNull();
    expect(r.feasible).toHaveLength(0);
    expect(r.closestMaxLay).not.toBeNull();
    expect(Number.isFinite(r.closestMaxLay)).toBe(true);
    expect(r.closestMaxLay!).toBeLessThan(3.0);
  });

  it('quote reali utente (multipla prova), lay 1.40: scala fattibile tutta verde', () => {
    const real: [number, number][] = [
      [1.4, 2.6],
      [1.33, 3],
      [1.33, 3.3],
      [1.57, 2.3],
      [1.77, 2],
      [1.65, 2.2],
      [1.55, 2.4],
      [1.95, 1.75],
    ];
    const ks = kickoffs(8);
    const rows = real.map(([u, o], i) => mkRow(`r${i + 1}`, ks[i], u, o));
    const r = findHarmonizableLadders({
      rows,
      now: NOW,
      baseStake: 40,
      targetProfit: 45,
      lay: 1.4,
      minEvents: 6,
      maxEvents: 8,
    });
    expect(r.best).not.toBeNull();
    const best = r.best!;
    best.branchNets.forEach((net) => expect(net).toBeGreaterThan(0));
    expect(best.equalizedNet ?? 0).toBeGreaterThan(40);
    expect(best.n).toBeGreaterThanOrEqual(6);
    expect(best.n).toBeLessThanOrEqual(8);
  });

  it('partite iniziate o senza copertura non entrano in pool', () => {
    const rows = [
      mkRow('passata', '2026-09-12T10:00:00Z', 1.5, 2.4, 'finished'),
      mkRow('live', '2026-09-12T11:30:00Z', 1.5, 2.4, 'live'),
      ...kickoffs(6).map((k, i) => mkRow(`ok${i + 1}`, k, 1.5, 2.4)),
    ];
    const r = findHarmonizableLadders({
      rows,
      now: NOW,
      baseStake: 20,
      targetProfit: 45,
      lay: 1.3,
      minEvents: 5,
      maxEvents: 6,
    });
    expect(r.poolSize).toBe(6);
    (r.best ? [r.best, ...r.feasible] : []).forEach((c) => {
      expect(c.eventIds).not.toContain('passata');
      expect(c.eventIds).not.toContain('live');
    });
  });
});
