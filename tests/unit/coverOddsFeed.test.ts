import { describe, expect, it } from 'vitest';
import {
  bestCoverSide,
  buildSitesIndex,
  collectInactiveSiteIds,
  normalizeCoverOdds,
  normalizeCoverOddsItems,
  normalizeEventsFeed,
  normalizeLdlStatus,
  parseCoverType,
  type RawLdlCoverOddsEntry,
  type RawLdlCoverOddsItem,
  type RawLdlEvent,
  type RawLdlSite,
} from '../../src/engine/coverOddsFeed';
import { findRegistryBook } from '../../src/engine/oddsFeed';
import { DEFAULT_BOOK } from '../../src/engine/books';
import {
  MOCK_LDL_COVERODDS,
  MOCK_LDL_COVER_EVENTS,
  MOCK_LDL_EVENTS,
  MOCK_LDL_SITES,
  mockCoverOddsForEventIds,
} from '../../src/data/mockCoverOdds';
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

describe('parseCoverType', () => {
  it('should parse under/over with line', () => {
    expect(parseCoverType('Under 3.5')).toEqual({ side: 'under', line: 3.5 });
    expect(parseCoverType('Over 2.5')).toEqual({ side: 'over', line: 2.5 });
    expect(parseCoverType('over 3,5')).toEqual({ side: 'over', line: 3.5 });
  });

  it('should reject unrelated or missing types', () => {
    expect(parseCoverType('1X2')).toBeNull();
    expect(parseCoverType(undefined)).toBeNull();
    expect(parseCoverType('Under')).toBeNull();
  });
});

describe('normalizeCoverOddsItems (shape reale /coverodds)', () => {
  const eventsById = new Map(MOCK_LDL_COVER_EVENTS.map((e) => [String(e.id), e]));
  const sitesById = buildSitesIndex(MOCK_LDL_SITES);
  const rows = normalizeCoverOddsItems(MOCK_LDL_COVERODDS, { line: 3.5, sitesById, eventsById });

  it('should resolve book names via sites index (site.name is null in real feed)', () => {
    const ostersund = rows.find((r) => r.home === 'Östersund')!;
    expect(ostersund.books).toEqual([
      { book: 'Lottomatica', under: 1.3, over: null },
      { book: 'Sisal', under: null, over: 3.2 },
    ]);
  });

  it('should carry the server rating through to the row', () => {
    expect(rows.find((r) => r.eventId === '167178')?.rating).toBeCloseTo(0.8938);
    expect(rows.find((r) => r.eventId === '167167')?.rating).toBeCloseTo(0.8458);
  });

  it('should merge metadata from /events (kickoff, league, status, scores)', () => {
    const ostersund = rows.find((r) => r.eventId === '167178')!;
    expect(ostersund.kickoff).toBe('2026-09-10T17:00:00');
    expect(ostersund.league).toBe('Superettan');
    expect(ostersund.status).toBe('live');
    expect(ostersund.totalGoals).toBe(3);
    expect(ostersund.lineStatus).toBe('warning'); // 3 gol, linea 3.5
    expect(bestCoverSide(ostersund, 'under')).toEqual({ book: 'Lottomatica', odds: 1.3 });
    expect(bestCoverSide(ostersund, 'over')).toEqual({ book: 'Sisal', odds: 3.2 });
  });

  it('should degrade gracefully without /events metadata', () => {
    const bare = normalizeCoverOddsItems(MOCK_LDL_COVERODDS, { line: 3.5, sitesById });
    expect(bare.length).toBe(MOCK_LDL_COVERODDS.length);
    expect(bare[0].kickoff).toBe('');
    expect(bare[0].league).toBe('');
    expect(bare[0].status).toBe('scheduled');
    expect(bare[0].books.length).toBeGreaterThan(0);
  });

  it('should filter entries on a different line and keep max odds per book/side', () => {
    const item: RawLdlCoverOddsItem = {
      event: { id: 1, home: { id: 1, name: 'A' }, away: { id: 2, name: 'B' } },
      odds: [
        { id: 1, site: { id: 16 }, type: 'Under 3.5', odds: 1.4 },
        { id: 2, site: { id: 16 }, type: 'Under 3.5', odds: 1.55 },
        { id: 3, site: { id: 16 }, type: 'Over 2.5', odds: 1.9 },
        { id: 4, site: { id: 16 }, type: 'Under 3.5', odds: null },
      ],
    };
    const [row] = normalizeCoverOddsItems([item], { line: 3.5, sitesById });
    expect(row.books).toEqual([{ book: 'Lottomatica', under: 1.55, over: null }]);
  });

  it('should fall back to site url hostname when id is not in the sites index', () => {
    const item: RawLdlCoverOddsItem = {
      event: { id: 2, home: { id: 1, name: 'C' }, away: { id: 2, name: 'D' } },
      odds: [
        { id: 1, site: { id: 999, url: 'https://www.planetwin365.it/scommesse' }, type: 'Over 3.5', odds: 2.2 },
      ],
    };
    const [row] = normalizeCoverOddsItems([item], { line: 3.5, sitesById });
    expect(row.books).toEqual([{ book: 'planetwin365.it', under: null, over: 2.2 }]);
  });

  it('should skip items without a usable event id or odds', () => {
    const junk = [
      { event: null, odds: null },
      { event: { id: 3, home: { id: 1, name: 'E' }, away: { id: 2, name: 'F' } }, odds: null },
    ] as unknown as RawLdlCoverOddsItem[];
    const rows2 = normalizeCoverOddsItems(junk, { line: 3.5, sitesById });
    expect(rows2.length).toBe(1);
    expect(rows2[0].books).toEqual([]);
  });
});

describe('normalizeEventsFeed (shape reale /events + /odds?eventId)', () => {
  const sitesById = buildSitesIndex(MOCK_LDL_SITES);
  const events: RawLdlEvent[] = [
    {
      id: 167946,
      datetime: '2026-09-13T18:00:00',
      league: { id: 24, country: 'Italia', name: 'Serie A' },
      home: { id: 122, name: 'Torino', score: null },
      away: { id: 1102, name: 'Roma', score: null },
      status: 'Prematch',
      sites: null, // sempre null nell'API reale
      urls: null,
    },
    {
      id: 167999,
      datetime: '2026-09-13T20:45:00',
      league: { id: 24, country: 'Italia', name: 'Serie A' },
      home: { id: 1, name: 'Senza', score: null },
      away: { id: 2, name: 'Quote', score: null },
      status: 'Prematch',
      sites: null,
      urls: null,
    },
  ];
  const oddsByEventId = new Map<string, RawLdlCoverOddsEntry[]>([
    [
      '167946',
      [
        { id: 1, site: { id: 16, name: null }, type: 'Under 3.5', odds: 1.35 },
        { id: 2, site: { id: 16, name: null }, type: 'Under 3.5', odds: 1.38 },
        { id: 3, site: { id: 23, name: null }, type: 'Over 3.5', odds: 2.9 },
        { id: 4, site: { id: 23, name: null }, type: 'Over 2.5', odds: 1.9 }, // scartata
        { id: 5, site: { id: 9, name: null }, type: '1X2', odds: 2.2 }, // scartata
      ],
    ],
  ]);

  it('should build rows for all events and attach books only where odds were fetched', () => {
    const rows = normalizeEventsFeed(events, { line: 3.5, sitesById, oddsByEventId });
    expect(rows.length).toBe(2);
    const torino = rows.find((r) => r.eventId === '167946')!;
    expect(torino.books).toEqual([
      { book: 'Lottomatica', under: 1.38, over: null },
      { book: 'Sisal', under: null, over: 2.9 },
    ]);
    expect(bestCoverSide(torino, 'under')).toEqual({ book: 'Lottomatica', odds: 1.38 });
    const other = rows.find((r) => r.eventId === '167999')!;
    expect(other.books).toEqual([]);
    expect(other.kickoff).toBe('2026-09-13T20:45:00'); // metadati sempre da /events
  });

  it('should fall back to embedded sites (legacy export shape) when no odds map given', () => {
    const legacy: RawLdlEvent = {
      ...events[0],
      sites: [{ site: 'Snai IT', under: '1.50', over: '2.55', line: 3.5 }],
    };
    const [row] = normalizeEventsFeed([legacy], { line: 3.5, sitesById });
    expect(row.books).toEqual([{ book: 'Snai IT', under: 1.5, over: 2.55 }]);
  });

  it('should drop offers from inactive/removed/exchange sites', () => {
    const allSites: RawLdlSite[] = [
      { id: 16, name: 'Lottomatica', type: 'bookmaker' },
      { id: 7, name: 'Broker', type: 'exchange' },
      { id: 19, name: 'Pinnacle', type: 'bookmaker_removed' },
    ];
    const odds = new Map<string, RawLdlCoverOddsEntry[]>([
      ['167946', [
        { id: 1, site: { id: 16 }, type: 'Under 3.5', odds: 1.35 },
        { id: 2, site: { id: 7 }, type: 'Under 3.5', odds: 1.6 },
        { id: 3, site: { id: 19 }, type: 'Over 3.5', odds: 3.1 },
      ]],
    ]);
    const [row] = normalizeEventsFeed([events[0]], {
      line: 3.5,
      sitesById: buildSitesIndex(allSites),
      inactiveSiteIds: collectInactiveSiteIds(allSites),
      oddsByEventId: odds,
    });
    expect(row.books).toEqual([{ book: 'Lottomatica', under: 1.35, over: null }]);
  });
});
