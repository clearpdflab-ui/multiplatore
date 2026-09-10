import { describe, expect, it } from 'vitest';
import { bestCoverSide, normalizeCoverOdds, normalizeLdlStatus } from '../../src/engine/coverOddsFeed';
import { findRegistryBook } from '../../src/engine/oddsFeed';
import { DEFAULT_BOOK } from '../../src/engine/books';
import { MOCK_LDL_EVENTS, mockCoverOddsForEventIds } from '../../src/data/mockCoverOdds';
import type { Book } from '../../src/types';

describe('normalizeLdlStatus', () => {
  it('should map known italian statuses', () => {
    expect(normalizeLdlStatus('Prematch')).toBe('scheduled');
    expect(normalizeLdlStatus('Finale')).toBe('finished');
    expect(normalizeLdlStatus('Posticipato')).toBe('postponed');
    expect(normalizeLdlStatus('Vittoria per Ritiro')).toBe('finished');
    expect(normalizeLdlStatus('1 Tempo')).toBe('live');
    expect(normalizeLdlStatus(undefined)).toBe('scheduled');
    expect(normalizeLdlStatus('Boh')).toBe('other');
  });
});

describe('normalizeCoverOdds + bestCoverSide', () => {
  const rows = normalizeCoverOdds(MOCK_LDL_EVENTS, 3.5);

  it('should normalize events and keep only the selected line', () => {
    expect(rows.length).toBe(3);
    const inter = rows[0];
    expect(inter.home).toBe('Inter');
    expect(inter.books.length).toBe(2);
    const milan = rows.find((r) => r.home === 'Milan')!;
    expect(milan.books.length).toBe(1); // Eurobet ha solo la riga 2.5 -> scartata
  });

  it('should handle sites: null like the real dump', () => {
    const finished = rows.find((r) => r.status === 'finished')!;
    expect(finished.books).toEqual([]);
  });

  it('should pick the best side across observed books', () => {
    const inter = rows[0];
    expect(bestCoverSide(inter, 'under')).toEqual({ book: 'Snai IT', odds: 1.5 });
    expect(bestCoverSide(inter, 'over')).toEqual({ book: 'Eurobet IT', odds: 2.6 });
  });

  it('should return null when no book offers that side', () => {
    const finished = rows.find((r) => r.status === 'finished')!;
    expect(bestCoverSide(finished, 'under')).toBeNull();
  });

  it('should filter mock by event ids', () => {
    expect(mockCoverOddsForEventIds([166923]).map((e) => e.id)).toEqual([166923]);
    expect(mockCoverOddsForEventIds([]).length).toBe(3);
  });

  it('should passthrough real scores and derive totalGoals/lineStatus for finished matches', () => {
    const finished = rows.find((r) => r.status === 'finished')!;
    expect(finished.homeScore).toBe(1);
    expect(finished.awayScore).toBe(1);
    expect(finished.totalGoals).toBe(2);
    expect(finished.lineStatus).toBe('safe');
  });

  it('should leave score fields null for matches not yet played', () => {
    const inter = rows[0];
    expect(inter.homeScore).toBeNull();
    expect(inter.awayScore).toBeNull();
    expect(inter.totalGoals).toBeNull();
    expect(inter.lineStatus).toBeNull();
  });

  it('should flag totalGoals above the line as over and at the line floor as warning', () => {
    expect(computeLineStatusFor(4, 3.5)).toBe('over');
    expect(computeLineStatusFor(3, 3.5)).toBe('warning');
    expect(computeLineStatusFor(2, 3.5)).toBe('safe');
  });
});

function computeLineStatusFor(totalGoals: number, line: number) {
  const events = [
    {
      id: 999,
      datetime: '2026-09-07T14:00:00',
      league: { id: 1, name: 'Test' },
      home: { id: 1, name: 'A', score: totalGoals },
      away: { id: 2, name: 'B', score: 0 },
      status: 'Finale',
      sites: null,
      urls: null,
    },
  ];
  return normalizeCoverOdds(events, line)[0].lineStatus;
}

describe('findRegistryBook reuse for LDL site names', () => {
  const books: Book[] = [
    DEFAULT_BOOK,
    { ...DEFAULT_BOOK, id: 'snai', name: 'Snai', apiBookKey: 'Snai IT' },
    { ...DEFAULT_BOOK, id: 'euro', name: 'Eurobet' },
  ];

  it('should map LDL site names to registry books', () => {
    expect(findRegistryBook(books, 'Snai IT')?.id).toBe('snai');
    expect(findRegistryBook(books, 'Eurobet IT')?.id).toBe('euro');
  });
});
