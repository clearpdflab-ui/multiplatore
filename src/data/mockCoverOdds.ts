import type { RawLdlCoverOddsItem, RawLdlEvent, RawLdlSite } from '../engine/coverOddsFeed';

// Mock feed conforme agli schema OSSERVATI sull'API reale autenticata
// (dump utente 2026-09-10 per /coverodds e /sites; liberidalavoro.it).
// Usato per sviluppare/testare senza un LDL_BEARER_TOKEN valido a portata di mano.
export const MOCK_LDL_EVENTS: RawLdlEvent[] = [
  {
    id: 166922,
    datetime: '2026-09-12T14:00:00',
    league: {
      id: 24,
      ref: 'xbpjAGxq',
      country: 'Italia',
      name: 'Serie A',
      oddsscasser: true,
      top: true,
    },
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
    league: {
      id: 24,
      ref: 'xbpjAGxq',
      country: 'Italia',
      name: 'Serie A',
      oddsscasser: true,
      top: false,
    },
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
    league: {
      id: 40,
      ref: 'abcd1234',
      country: 'Egitto',
      name: 'Premier League',
      oddsscasser: true,
      top: false,
    },
    home: { id: 16600, name: 'Al Qanah', code: 'QAN', score: 1 },
    away: { id: 1517, name: 'El Gaish', code: 'GEI', score: 1 },
    status: 'Finale',
    sites: null, // come nel dump reale: quote non piu' disponibili a fine match
    urls: null,
  },
];

export function mockCoverOddsForEventIds(eventIds: Array<number | string>): RawLdlEvent[] {
  if (eventIds.length === 0) {
    return MOCK_LDL_EVENTS;
  }
  const set = new Set(eventIds.map(String));
  return MOCK_LDL_EVENTS.filter((e) => set.has(String(e.id)));
}

// ---- Mock per la shape coverodds reale (dump autenticato 2026-09-10) ----

export const MOCK_LDL_SITES: RawLdlSite[] = [
  {
    id: 16,
    name: 'Lottomatica',
    url: 'https://www.lottomatica.it/scommesse/sport',
    type: 'bookmaker',
  },
  { id: 23, name: 'Sisal', url: 'https://www.sisal.it/scommesse-matchpoint', type: 'bookmaker' },
];

// Metadati (li ha solo /events; nel feed coverodds/puntapunta sono null).
export const MOCK_LDL_COVER_EVENTS: RawLdlEvent[] = [
  {
    id: 167178,
    datetime: '2026-09-10T17:00:00',
    league: { id: 41, country: 'Svezia', name: 'Superettan', oddsscasser: true, top: false },
    home: { id: 910, name: 'Östersund', score: 2 },
    away: { id: 908, name: 'Brage', score: 1 },
    status: '2 Tempo',
    sites: null,
    urls: null,
  },
  {
    id: 167179,
    datetime: '2026-09-10T17:00:00',
    league: { id: 41, country: 'Svezia', name: 'Superettan', oddsscasser: true, top: false },
    home: { id: 1252, name: 'Sundsvall', score: null },
    away: { id: 1254, name: 'Örebro', score: null },
    status: 'Prematch',
    sites: null,
    urls: null,
  },
  {
    id: 167167,
    datetime: '2026-09-10T18:45:00',
    league: {
      id: 52,
      country: 'Internazionali di Club',
      name: 'Champions League',
      oddsscasser: true,
      top: true,
    },
    home: { id: 1256, name: 'Fenerbahce', score: null },
    away: { id: 1102, name: 'Roma', score: null },
    status: 'Prematch',
    sites: null,
    urls: null,
  },
  {
    id: 167180,
    datetime: '2026-09-10T17:00:00',
    league: { id: 41, country: 'Svezia', name: 'Superettan', oddsscasser: true, top: false },
    home: { id: 903, name: 'Varberg', score: null },
    away: { id: 167, name: 'Norrkoping', score: null },
    status: 'Prematch',
    sites: null,
    urls: null,
  },
];

// Stralcio fedele dei dump reali (shape /bestevents e /puntapunta, identica:
// odds annidate, site.name null, metadati null). Id = eventi madre tipici.
export const MOCK_LDL_COVERODDS: RawLdlCoverOddsItem[] = [
  {
    mode: null,
    event: {
      id: 167178,
      datetime: null,
      league: {
        id: null,
        ref: null,
        sport: { id: 1, name: null },
        country: null,
        name: null,
        oddsscasser: null,
        top: null,
      },
      home: { id: 910, name: 'Östersund', code: null, score: null },
      away: { id: 908, name: 'Brage', code: null, score: null },
      status: null,
      sites: null,
      urls: null,
    },
    odds: [
      {
        id: 281039368,
        site: { id: 16, name: null, url: 'https://www.lottomatica.it/scommesse/sport' },
        type: 'Under 3.5',
        typeId: 13,
        bet: true,
        odds: 1.3,
      },
      {
        id: 280180428,
        site: { id: 23, name: null, url: 'https://www.sisal.it/scommesse-matchpoint' },
        type: 'Over 3.5',
        typeId: 14,
        bet: true,
        odds: 3.2,
      },
    ],
    rating: 0.8938,
  },
  {
    mode: null,
    event: {
      id: 167179,
      datetime: null,
      league: {
        id: null,
        ref: null,
        sport: { id: 1, name: null },
        country: null,
        name: null,
        oddsscasser: null,
        top: null,
      },
      home: { id: 1252, name: 'Sundsvall', code: null, score: null },
      away: { id: 1254, name: 'Örebro', code: null, score: null },
      status: null,
      sites: null,
      urls: null,
    },
    odds: [
      {
        id: 281039366,
        site: { id: 16, name: null, url: 'https://www.lottomatica.it/scommesse/sport' },
        type: 'Under 3.5',
        typeId: 13,
        bet: true,
        odds: 1.3,
      },
      {
        id: 280180442,
        site: { id: 23, name: null, url: 'https://www.sisal.it/scommesse-matchpoint' },
        type: 'Over 3.5',
        typeId: 14,
        bet: true,
        odds: 3.0,
      },
    ],
    rating: 0.8667,
  },
  {
    mode: null,
    event: {
      id: 167167,
      datetime: null,
      league: {
        id: null,
        ref: null,
        sport: { id: 1, name: null },
        country: null,
        name: null,
        oddsscasser: null,
        top: null,
      },
      home: { id: 1256, name: 'Fenerbahce', code: null, score: null },
      away: { id: 1102, name: 'Roma', code: null, score: null },
      status: null,
      sites: null,
      urls: null,
    },
    odds: [
      {
        id: 257128981,
        site: { id: 16, name: null, url: 'https://www.lottomatica.it/scommesse/sport' },
        type: 'Under 3.5',
        typeId: 13,
        bet: true,
        odds: 1.45,
      },
      {
        id: 257130366,
        site: { id: 23, name: null, url: 'https://www.sisal.it/scommesse-matchpoint' },
        type: 'Over 3.5',
        typeId: 14,
        bet: true,
        odds: 2.4,
      },
    ],
    rating: 0.8458,
  },
  {
    mode: null,
    event: {
      id: 167180,
      datetime: null,
      league: {
        id: null,
        ref: null,
        sport: { id: 1, name: null },
        country: null,
        name: null,
        oddsscasser: null,
        top: null,
      },
      home: { id: 903, name: 'Varberg', code: null, score: null },
      away: { id: 167, name: 'Norrkoping', code: null, score: null },
      status: null,
      sites: null,
      urls: null,
    },
    odds: [
      {
        id: 273375232,
        site: { id: 16, name: null, url: 'https://www.lottomatica.it/scommesse/sport' },
        type: 'Under 3.5',
        typeId: 13,
        bet: true,
        odds: 1.43,
      },
      {
        id: 273688278,
        site: { id: 23, name: null, url: 'https://www.sisal.it/scommesse-matchpoint' },
        type: 'Over 3.5',
        typeId: 14,
        bet: true,
        odds: 2.4,
      },
    ],
    rating: 0.8342,
  },
];
