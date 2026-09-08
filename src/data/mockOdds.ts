import type { RawEventOdds } from '../engine/oddsFeed';

// Mock feed conforme alla shape di odds-api.io /v3/odds/multi (docs guide
// "Fetching Odds"): serve a sviluppare il comparatore senza consumare quota.
export const MOCK_ODDS_EVENTS: RawEventOdds[] = [
  {
    id: 900101,
    home: 'Inter',
    away: 'Genoa',
    date: '2026-09-12T18:00:00Z',
    status: 'pending',
    bookmakers: {
      'Snai IT': [
        { name: 'ML', odds: [{ home: '1.45', draw: '4.60', away: '6.75' }] },
        { name: 'Totals', odds: [
          { max: 2.5, over: '1.72', under: '2.10' },
          { max: 3.5, over: '2.55', under: '1.50' },
        ] },
      ],
      'Eurobet IT': [
        { name: 'Totals', odds: [
          { max: 2.5, over: '1.70', under: '2.12' },
          { max: 3.5, over: '2.60', under: '1.48' },
        ] },
      ],
    },
  },
  {
    id: 900102,
    home: 'Milan',
    away: 'Torino',
    date: '2026-09-13T16:00:00Z',
    status: 'pending',
    bookmakers: {
      'Snai IT': [
        { name: 'Totals', odds: [
          { max: 2.5, over: '1.66', under: '2.20' },
          { max: 3.5, over: '2.45', under: '1.53' },
        ] },
      ],
      'Eurobet IT': [
        { name: 'Totals', odds: [
          { max: 2.5, over: '1.68', under: '2.15' },
          { max: 3.5, over: '2.50', under: '1.51' },
        ] },
      ],
    },
  },
  {
    id: 900103,
    home: 'Juventus',
    away: 'Lecce',
    date: '2026-09-13T18:45:00Z',
    status: 'pending',
    bookmakers: {
      'Snai IT': [
        { name: 'Totals', odds: [
          { max: 2.5, over: '1.80', under: '2.00' },
          { max: 3.5, over: '2.75', under: '1.44' },
        ] },
      ],
      // Eurobet senza linea 3.5: il comparatore deve gestire il buco.
      'Eurobet IT': [
        { name: 'Totals', odds: [{ max: 2.5, over: '1.78', under: '2.02' }] },
      ],
    },
  },
  {
    id: 900104,
    home: 'Roma',
    away: 'Napoli',
    date: '2026-09-14T18:45:00Z',
    status: 'pending',
    bookmakers: {
      'Snai IT': [
        { name: 'Totals', odds: [
          { max: 2.5, over: '1.60', under: '2.30' },
          { max: 3.5, over: '2.28', under: '1.60' },
        ] },
      ],
      'Eurobet IT': [
        { name: 'Totals', odds: [
          { max: 2.5, over: '1.62', under: '2.25' },
          { max: 3.5, over: '2.32', under: '1.58' },
        ] },
      ],
    },
  },
];

export function mockOddsForEventIds(eventIds: number[]): RawEventOdds[] {
  if (eventIds.length === 0) return MOCK_ODDS_EVENTS;
  const set = new Set(eventIds.map(Number));
  return MOCK_ODDS_EVENTS.filter((e) => set.has(Number(e.id)));
}
