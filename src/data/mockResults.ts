import type { RawLiveEvent, RawMatchDetail } from '../engine/resultsFeed';

// Mock feed conforme allo schema osservato su api.scoretrend.net (curl
// diretto, F5). Usato per sviluppare/testare senza dipendere dalla
// disponibilita' di eventi realmente live.
export const MOCK_LIVE_EVENTS: RawLiveEvent[] = [
  {
    eventid: '13090114',
    home: 'Inter',
    away: 'Genoa',
    ss: '2-1',
    time_status: 1,
    league: 'Serie A',
  },
  {
    eventid: '13090115',
    home: 'Milan',
    away: 'Torino',
    ss: '0-0',
    time_status: 0,
    league: 'Serie A',
  },
];

export const MOCK_MATCH_DETAILS: RawMatchDetail[] = [
  {
    id: '1',
    eventid: '13090114',
    home: 'Inter',
    away: 'Genoa',
    ss: '4-2',
    time_status: 3,
    league: 'Serie A',
  },
  {
    id: '2',
    eventid: '13090115',
    home: 'Milan',
    away: 'Torino',
    ss: '0-0',
    time_status: 0,
    league: 'Serie A',
  },
];

export function mockMatchDetailsForIds(eventIds: string[]): RawMatchDetail[] {
  if (eventIds.length === 0) {
    return MOCK_MATCH_DETAILS;
  }
  const set = new Set(eventIds);
  return MOCK_MATCH_DETAILS.filter((m) => set.has(m.eventid));
}
