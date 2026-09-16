import { describe, expect, it } from 'vitest';
import { runScout, defaultScoutGrid } from '../../src/engine/scout';
import type { CoverOddsRow } from '../../src/engine/coverOddsFeed';

// P1 — Scout: caccia autonoma scale mai-perdita.
// Fixture ad alta quota (banda misurata: N=3, lay scontata ~30% in-play).

const NOW = Date.parse('2026-10-01T12:00:00Z');
const H = 3600_000;

function mkRow(id: string, hourOffset: number, u: number, o: number, line = 3.5): CoverOddsRow {
  return {
    eventId: id,
    home: `H${id}`,
    away: `A${id}`,
    kickoff: new Date(NOW + hourOffset * H).toISOString(),
    league: 'Test League',
    country: 'Italia',
    status: 'scheduled',
    line,
    books: [{ book: 'Test', under: u, over: o }],
    homeScore: null,
    awayScore: null,
    totalGoals: null,
    lineStatus: null,
  };
}

describe('Scout — trova e promuove solo il verificato', () => {
  it('pool ad alta quota: promuove pick con invarianti certificate', async () => {
    const rows = [
      mkRow('e1', 3, 1.9, 2.0),
      mkRow('e2', 6, 1.9, 2.0),
      mkRow('e3', 9, 1.9, 2.0),
      mkRow('e4', 12, 1.9, 2.0),
    ];
    const res = await runScout(
      rows,
      {
        ...defaultScoutGrid(),
        s0: [10],
        roiPct: [4],
        layDiscount: [0, 0.1, 0.2, 0.3],
        minEvents: 3,
        maxEvents: 3,
        topK: 5,
      },
      { now: NOW },
    );
    expect(res.poolSize).toBe(4);
    expect(res.picks.length).toBeGreaterThan(0);
    expect(res.budgetHit).toBe(false);
    for (const p of res.picks) {
      // invariante certificata: OGNI ramo >= t == 4%E
      expect(p.equalizedNet).toBeGreaterThanOrEqual(p.targetUsed - 1e-9);
      expect(p.targetUsed).toBeCloseTo(Number((0.04 * p.exposure).toFixed(2)), 2);
      expect(p.s0used).toBeLessThanOrEqual(10 + 1e-9);
      expect(p.n).toBe(3);
      expect(p.eventIds).toHaveLength(3);
      expect(p.legs).toHaveLength(3);
      // pagella shock presente e shock obbligatori superati (promozione)
      expect(p.shocks.quoteMinus5).toBe(true);
      expect(p.shocks.layPlus01).toBe(true);
      // scadenza = primo kickoff - 2h
      expect(p.firstKickoffMs).not.toBeNull();
      expect(p.expiresAtMs).toBe((p.firstKickoffMs as number) - 2 * H);
    }
    // ranking: garantito desc
    for (let i = 1; i < res.picks.length; i++) {
      expect(res.picks[i - 1].equalizedNet).toBeGreaterThanOrEqual(
        res.picks[i].equalizedNet - 1e-9,
      );
    }
  });

  it('pool avvelenata (quote basse): lista vuota, scarti conteggiati, mai falsi promossi', async () => {
    const rows = [
      mkRow('p1', 3, 1.3, 1.4),
      mkRow('p2', 6, 1.3, 1.4),
      mkRow('p3', 9, 1.3, 1.4),
      mkRow('p4', 12, 1.28, 1.45),
      mkRow('p5', 15, 1.32, 1.42),
    ];
    const res = await runScout(
      rows,
      {
        ...defaultScoutGrid(),
        minEvents: 2,
        maxEvents: 3,
        layDiscount: [0, 0.1, 0.2, 0.3],
      },
      { now: NOW },
    );
    expect(res.picks).toHaveLength(0);
    const rejected = Object.values(res.rejectedBy).reduce((a, b) => a + b, 0);
    expect(rejected).toBeGreaterThan(0);
  });

  it('deterministico: stesso feed -> stessa lista', async () => {
    const rows = [mkRow('e1', 3, 1.9, 2.0), mkRow('e2', 6, 1.9, 2.1), mkRow('e3', 9, 2.0, 1.9)];
    const grid = {
      ...defaultScoutGrid(),
      minEvents: 2,
      maxEvents: 3,
      layDiscount: [0, 0.2],
    };
    const a = await runScout(rows, grid, { now: NOW });
    const b = await runScout(rows, grid, { now: NOW });
    expect(JSON.stringify(a.picks)).toBe(JSON.stringify(b.picks));
    expect(a.evaluatedWindows).toBe(b.evaluatedWindows);
  });

  it('budget valutazioni rispettato (budgetHit + stop)', async () => {
    const rows = Array.from({ length: 12 }, (_, i) => mkRow(`b${i}`, 3 + i * 3, 1.9, 2.0));
    const res = await runScout(
      rows,
      { ...defaultScoutGrid(), minEvents: 2, maxEvents: 4, evalBudget: 5 },
      { now: NOW },
    );
    expect(res.budgetHit).toBe(true);
    expect(res.exactSolves).toBeGreaterThanOrEqual(5);
    expect(res.evaluatedWindows).toBeLessThan(12 * 3);
  });

  it('gap < 2h tra consecutive: finestra scartata (regola relay)', async () => {
    const rows = [
      mkRow('g1', 3, 1.9, 2.0),
      mkRow('g2', 4, 1.9, 2.0), // solo 1h dopo g1
      mkRow('g3', 8, 1.9, 2.0),
    ];
    const res = await runScout(
      rows,
      { ...defaultScoutGrid(), minEvents: 3, maxEvents: 3, layDiscount: [0, 0.3] },
      { now: NOW },
    );
    // unica finestra N=3 possibile (g1,g2,g3) violata dal gap -> niente pick
    expect(res.picks).toHaveLength(0);
    expect(res.rejectedBy.gap ?? 0).toBeGreaterThan(0);
  });
});
