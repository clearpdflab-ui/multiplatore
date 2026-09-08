import { describe, expect, it } from 'vitest';
import {
  bestTotalsSide,
  compareMatches,
  extractTotalsLine,
  findRegistryBook,
  normalizeOddsEvents,
  planSweep,
} from '../../src/engine/oddsFeed';
import { DEFAULT_BOOK } from '../../src/engine/books';
import { MOCK_ODDS_EVENTS, mockOddsForEventIds } from '../../src/data/mockOdds';
import type { Book } from '../../src/types';

describe('extractTotalsLine', () => {
  const markets = [
    { name: 'ML', odds: [{ home: '1.45' }] },
    { name: 'Totals', odds: [
      { max: 2.5, over: '1.72', under: '2.10' },
      { max: 3.5, over: '2.55', under: '1.50' },
    ] },
  ];

  it('should pick the 3.5 entry with numeric parsing of string quotes', () => {
    expect(extractTotalsLine(markets, 3.5)).toEqual({ under: 1.5, over: 2.55 });
    expect(extractTotalsLine(markets, 2.5)).toEqual({ under: 2.1, over: 1.72 });
  });

  it('should return null for missing market/line and reject quotes <= 1', () => {
    expect(extractTotalsLine(markets, 4.5)).toBeNull();
    expect(extractTotalsLine([{ name: 'ML', odds: [] }], 3.5)).toBeNull();
    expect(extractTotalsLine(undefined, 3.5)).toBeNull();
    expect(extractTotalsLine([{ name: 'Totals', odds: [{ max: 3.5, under: '0.9', over: '1.0' }] }], 3.5))
      .toEqual({ under: null, over: null });
  });
});

describe('normalizeOddsEvents + bestTotalsSide + compareMatches', () => {
  const matches = normalizeOddsEvents(MOCK_ODDS_EVENTS, 3.5);

  it('should keep only books that offer the 3.5 line', () => {
    expect(matches.length).toBe(4);
    const inter = matches[0];
    expect(inter.home).toBe('Inter');
    expect(inter.books.length).toBe(2);
    const juve = matches.find((m) => m.home === 'Juventus')!;
    expect(juve.books.length).toBe(1); // Eurobet ha solo 2.5 => buco gestito
  });

  it('should pick the best side across observed books', () => {
    const inter = matches[0];
    expect(bestTotalsSide(inter, 'under')).toEqual({ book: 'Snai IT', odds: 1.5 });
    expect(bestTotalsSide(inter, 'over')).toEqual({ book: 'Eurobet IT', odds: 2.6 });
    const juve = matches.find((m) => m.home === 'Juventus')!;
    expect(bestTotalsSide(juve, 'under')).toEqual({ book: 'Snai IT', odds: 1.44 });
  });

  it('should compare rows with booksWithUnder count', () => {
    const rows = compareMatches(matches);
    expect(rows[0].match).toBe('Inter - Genoa');
    expect(rows[2].booksWithUnder).toBe(1);
  });

  it('should filter mock by event ids', () => {
    expect(mockOddsForEventIds([900102]).map((e) => e.id)).toEqual([900102]);
    expect(mockOddsForEventIds([]).length).toBe(4);
  });
});

describe('findRegistryBook', () => {
  const books: Book[] = [
    DEFAULT_BOOK,
    { ...DEFAULT_BOOK, id: 'snai', name: 'Snai', apiBookKey: 'Snai IT' },
    { ...DEFAULT_BOOK, id: 'euro', name: 'Eurobet' },
  ];

  it('should map API names to registry books via apiBookKey/name', () => {
    expect(findRegistryBook(books, 'Snai IT')?.id).toBe('snai');
    expect(findRegistryBook(books, 'Eurobet IT')?.id).toBe('euro');
    expect(findRegistryBook(books, 'sna i')?.id).toBe('snai'); // normalizzazione spazi/punteggiatura
    expect(findRegistryBook(books, 'Planetwin365 IT')).toBeNull();
  });
});

describe('planSweep (budget free tier)', () => {
  it('should count 10-event chunks per key', () => {
    const p = planSweep(30, 1);
    expect(p.chunksPerKey).toBe(3);
    expect(p.callsPerSweep).toBe(3);
    expect(p.sweepsPerDayPerKey).toBe(166);
    expect(p.ok).toBe(true);
  });

  it('should reject impossible plans', () => {
    expect(planSweep(6000, 1).ok).toBe(false); // 600 chunk > 500/day
    expect(planSweep(30, 0).ok).toBe(false);
    expect(planSweep(0, 1).ok).toBe(false);
    expect(planSweep(30, 3).callsPerSweep).toBe(9);
  });
});
