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

  it('regola min quota 1.25: selezioni sotto soglia escluse dalla pool', () => {
    const ks = kickoffs(7);
    const rows = [
      mkRow('underBasso', ks[0], 1.2, 2.6), // Under < 1.25
      mkRow('overBasso', ks[1], 1.5, 1.1), // Over < 1.25
      ...ks.slice(2).map((k, i) => mkRow(`ok${i + 1}`, k, 1.5, 2.4)),
    ];
    const r = findHarmonizableLadders({
      rows,
      now: NOW,
      baseStake: 20,
      targetProfit: 45,
      lay: 1.3,
      minEvents: 5,
      maxEvents: 5,
    });
    expect(r.poolSize).toBe(5);
    (r.best ? [r.best, ...r.feasible] : []).forEach((c) => {
      expect(c.eventIds).not.toContain('underBasso');
      expect(c.eventIds).not.toContain('overBasso');
    });
  });

  it('modo book: il motore valuta anche la singola punta/punta', () => {
    const ks = kickoffs(8);
    const rows = ks.map((k, i) =>
      mkRow(`m${i + 1}`, k, 1.5 + (i % 3) * 0.1, 2.2 + (i % 4) * 0.15),
    );
    const r = findHarmonizableLadders({
      rows,
      now: NOW,
      baseStake: 20,
      targetProfit: 45,
      lay: 1.3,
      minEvents: 5,
      maxEvents: 6,
      finaleModes: ['book'],
    });
    // ogni candidato valutato e' in modo book (con o senza fattibilita')
    expect(r.evaluations).toBeGreaterThan(0);
    const seen = r.feasible.length > 0 ? r.feasible : [];
    seen.forEach((c) => {
      expect(c.finaleMode).toBe('book');
      expect(c.liability).toBe(0);
      expect(c.layQuote).toBe(0);
    });
  });

  it('F21: se nulla chiude in fascia, propone il fallback sotto minEvents', () => {
    // Prime 3 ad Under alti (= madri corte ricche), ultime 4 ad Under bassi
    // (= veleno per le scale lunghe: SOMMA esplode). min=6, max=7.
    // Le scale da 6-7 non chiudono il dutch; quelle da 4 (es. [1,2,3,4])
    // chiudono dutch E madre -> fallback.
    const ks = kickoffs(7);
    const odds: [number, number][] = [
      [2.0, 2.75],
      [2.0, 2.75],
      [2.0, 2.75],
      [1.35, 2.0],
      [1.35, 2.0],
      [1.35, 2.0],
      [1.35, 2.0],
    ];
    const rows = odds.map(([u, o], i) => mkRow(`m${i + 1}`, ks[i], u, o));
    const r = findHarmonizableLadders({
      rows,
      now: NOW,
      baseStake: 20,
      targetProfit: 45,
      lay: 1.6,
      minEvents: 6,
      maxEvents: 7,
    });
    expect(r.feasible).toHaveLength(0);
    expect(r.fallback).not.toBeNull();
    expect(r.fallback!.n).toBeLessThan(6);
    expect(r.fallback!.n).toBeGreaterThanOrEqual(2);
    r.fallback!.branchNets.forEach((net) => expect(net).toBeGreaterThan(0));
  });

  it('F21: closest indica la sequenza infattibile piu vicina a chiudere', () => {    const ks = kickoffs(8);
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
    expect(r.closest).not.toBeNull();
    expect(r.closest!.feasible).toBe(false);
    expect(r.closest!.rows.length).toBeGreaterThanOrEqual(5);
    expect(r.closest!.rows.length).toBeLessThanOrEqual(8);
    // sequenza cronologica
    const times = r.closest!.rows.map((x) => new Date(x.kickoff).getTime());
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]);
    }
  });

  it('F22: stessa partita 2 volte in pool -> una sola in scala (dedup)', () => {
    const rows = [
      mkRow('e1', '2026-09-13T14:00:00Z', 1.6, 2.5),
      // stessa partita, altro eventId (Serie B vs feed doppio)
      { ...mkRow('e2', '2026-09-13T14:00:00Z', 1.6, 2.5), home: 'Home e1', away: 'Away e1' },
      ...kickoffs(4).map((k, i) => mkRow(`ok${i + 1}`, k, 1.6, 2.5)),
    ];
    const r = findHarmonizableLadders({
      rows,
      now: NOW,
      baseStake: 20,
      targetProfit: 45,
      lay: 1.3,
      minEvents: 2,
      maxEvents: 4,
    });
    // 6 righe - 1 duplicata = 5 in pool
    expect(r.poolSize).toBe(5);
    expect(r.skippedDuplicates).toBe(1);
    // MAI entrambe le copie dentro la STESSA scala (scale diverse possono
    // condividere partite legittimamente: e' il vincolo per-scala che conta)
    const checkNoDupPair = (ids: string[]) => {
      expect(ids.filter((id) => id === 'e1' || id === 'e2').length).toBeLessThanOrEqual(1);
      expect(new Set(ids).size).toBe(ids.length);
    };
    r.feasible.forEach((c) => checkNoDupPair(c.eventIds));
    if (r.fallback) {
      checkNoDupPair(r.fallback.eventIds);
    }
    if (r.closest) {
      checkNoDupPair(r.closest.eventIds);
    }
  });

  it('F22: gap < 2h tra consecutive -> sequenza scartata', () => {
    const rows = [
      mkRow('a', '2026-09-13T14:00:00Z', 1.6, 2.5),
      mkRow('b', '2026-09-13T15:00:00Z', 1.6, 2.5), // solo 1h dopo A
      mkRow('c', '2026-09-13T18:00:00Z', 1.6, 2.5),
      mkRow('d', '2026-09-13T21:00:00Z', 1.6, 2.5),
    ];
    const r = findHarmonizableLadders({
      rows,
      now: NOW,
      baseStake: 20,
      targetProfit: 45,
      lay: 1.3,
      minEvents: 2,
      maxEvents: 4,
    });
    expect(r.poolSize).toBe(4);
    expect(r.skippedGap).toBeGreaterThan(0);
    const checkGap = (ids: string[]) => {
      for (let i = 1; i < ids.length; i++) {
        const prev = rows.find((x) => x.eventId === ids[i - 1])!;
        const cur = rows.find((x) => x.eventId === ids[i])!;
        const gap = new Date(cur.kickoff).getTime() - new Date(prev.kickoff).getTime();
        expect(gap).toBeGreaterThanOrEqual(2 * 3600_000);
      }
    };
    r.feasible.forEach((c) => checkGap(c.eventIds));
    if (r.fallback) {
      checkGap(r.fallback.eventIds);
    }
    // A e B mai adiacenti nella stessa scala
    const hasAdjacentAB = [...r.feasible, ...(r.fallback ? [r.fallback] : [])].some((c) => {
      const ids = c.eventIds;
      return ids.some((id, i) => i > 0 && ((id === 'b' && ids[i - 1] === 'a') || (id === 'a' && ids[i - 1] === 'b')));
    });
    expect(hasAdjacentAB).toBe(false);
  });

  it('F23: budget passato al motore, candidati con payout da budget', () => {
    const ks = kickoffs(6);
    const rows = ks.map((k, i) => mkRow(`m${i + 1}`, k, 1.9, 3.5));
    const r = findHarmonizableLadders({
      rows,
      now: NOW,
      baseStake: 20,
      targetProfit: 30,
      lay: 1.5,
      minEvents: 5,
      maxEvents: 5,
      budget: 150,
    });
    expect(r.evaluations).toBeGreaterThan(0);
    expect(r.best).not.toBeNull();
    expect(r.best!.feasible).toBe(true);
    // coperture pagano >= budget+target
    for (const leg of r.best!.legs) {
      if (leg.code === 'S0' || leg.desc.startsWith('LAY ')) {
        continue;
      }
      expect(leg.payout).toBeGreaterThanOrEqual(180);
    }
    r.best!.branchNets.forEach((net) => expect(net).toBeGreaterThanOrEqual(29));
  });
});
