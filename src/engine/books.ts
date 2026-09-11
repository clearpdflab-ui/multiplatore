import type { Book, TicketLeg } from '../types';

// Validated bonus table 5-30 (single source of truth in TS; mirrored in
// Supabase book_bonus_versions seed and tools/model/). Bonus applies on
// N>=5 pending legs; below 5 the book pays no bonus.
export const DEFAULT_BONUS_TABLE: Record<number, number> = {
  5: 6.0,
  6: 12.4,
  7: 19.1,
  8: 26.2,
  9: 33.8,
  10: 41.9,
  11: 50.4,
  12: 59.4,
  13: 68.9,
  14: 79.1,
  15: 89.8,
  16: 101.2,
  17: 113.3,
  18: 126.1,
  19: 139.7,
  20: 154.0,
  21: 169.3,
  22: 185.4,
  23: 202.6,
  24: 220.7,
  25: 240.0,
  26: 260.4,
  27: 282.0,
  28: 304.9,
  29: 329.2,
  30: 354.9,
};

// Seed-equivalent default book ("Main", cap 500). Live books come from
// Supabase via useBooks; engine functions accept any Book.
export const DEFAULT_BOOK: Book = {
  id: 'main',
  name: 'Main',
  bonusTable: DEFAULT_BONUS_TABLE,
  bonusCap: 500,
  minStake: 1,
  maxPayout: null,
  maxLegs: 30,
  multiDaysLimit: null,
  overEligible: true,
  competitions: ['all'],
  isActive: true,
};

// Bonus % for a ticket with eventCount pending legs on a given book.
// Below 5 legs the book pays no bonus; the cap is always enforced.
export function getBonusForBook(book: Book, eventCount: number): number {
  if (eventCount < 5) {
    return 0;
  }
  const table = book.bonusTable ?? DEFAULT_BONUS_TABLE;
  const raw = table[eventCount] ?? 0;
  return Math.min(raw, book.bonusCap);
}

// Backward-compatible entry point (default = Main book).
// Existing call sites getBonusPercentage(N) keep working unchanged.
export function getBonusPercentage(eventCount: number, book: Book = DEFAULT_BOOK): number {
  return getBonusForBook(book, eventCount);
}

export interface BookSelection {
  book: Book;
  raw: number;
  bonus: number;
  finale: number;
}

// Pick the book maximizing the ticket finale for a candidate leg set.
// Eligibility: active book, N within max legs, Over leg only if allowed.
// NOTE: max-payout feasibility needs the stake and is checked at sizing (F2).
export function selectBestBook(books: Book[], legs: TicketLeg[]): BookSelection | null {
  const n = legs.length;
  if (n < 1) {
    return null;
  }
  const hasOver = legs.some((l) => l.market === 'OVER');
  let best: BookSelection | null = null;
  for (const book of books) {
    if (!book.isActive) {
      continue;
    }
    if (n > book.maxLegs) {
      continue;
    }
    if (hasOver && !book.overEligible) {
      continue;
    }
    const raw = legs.reduce((acc, l) => acc * l.odds, 1);
    const bonus = getBonusForBook(book, n);
    const finale = raw * (1 + bonus / 100);
    if (!best || finale > best.finale) {
      best = { book, raw, bonus, finale };
    }
  }
  return best;
}
