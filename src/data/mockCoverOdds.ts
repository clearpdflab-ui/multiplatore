import type { RawLdlEvent } from '../engine/coverOddsFeed';

// Mock feed conforme allo schema osservato nell'export "OddsScasser"
// dell'utente (liberidalavoro.it). Usato per sviluppare/testare senza un
// LDL_BEARER_TOKEN valido a portata di mano.
export const MOCK_LDL_EVENTS: RawLdlEvent[] = [
  {
    id: 166922,
    datetime: '2026-09-12T14:00:00',
    league: { id: 24, ref: 'xbpjAGxq', country: 'Italia', name: 'Serie A', oddsscasser: true, top: true },
    home: { id: 16556, name: 'Inter', code: 'INT', score: null },
    away: { id: 1516, name: 'Genoa', code: 'GEN', score: null },
    status: 'Prematch',
    sites: [
      { site: 'Snai IT', under: '1.50', over: '2.55', line: 3.5 },
      { site: 'Eurobet IT', under: '1.48', over: '2.60', line: 3.5 },
    ],
    urls: null,
  },
  {
    id: 166923,
    datetime: '2026-09-13T16:00:00',
    league: { id: 24, ref: 'xbpjAGxq', country: 'Italia', name: 'Serie A', oddsscasser: true, top: false },
    home: { id: 1600, name: 'Milan', code: 'MIL', score: null },
    away: { id: 1601, name: 'Torino', code: 'TOR', score: null },
    status: 'Prematch',
    sites: [
      { site: 'Snai IT', under: '1.53', over: '2.45', line: 3.5 },
      { site: 'Eurobet IT', under: '1.51', over: '2.50', line: 2.5 }, // riga diversa: scartata dal normalizzatore
    ],
    urls: null,
  },
  {
    id: 166924,
    datetime: '2026-09-07T14:00:00',
    league: { id: 40, ref: 'abcd1234', country: 'Egitto', name: 'Premier League', oddsscasser: true, top: false },
    home: { id: 16600, name: 'Al Qanah', code: 'QAN', score: 1 },
    away: { id: 1517, name: 'El Gaish', code: 'GEI', score: 1 },
    status: 'Finale',
    sites: null, // come nel dump reale: quote non piu' disponibili a fine match
    urls: null,
  },
];

export function mockCoverOddsForEventIds(eventIds: Array<number | string>): RawLdlEvent[] {
  if (eventIds.length === 0) return MOCK_LDL_EVENTS;
  const set = new Set(eventIds.map(String));
  return MOCK_LDL_EVENTS.filter((e) => set.has(String(e.id)));
}
