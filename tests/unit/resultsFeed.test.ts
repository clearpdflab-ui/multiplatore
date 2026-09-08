import { describe, expect, it } from 'vitest';
import {
  isOverLine,
  matchEventByTeams,
  normalizeMatchDetail,
  normalizeMatchTimeStatus,
  parseScoreString,
} from '../../src/engine/resultsFeed';
import { MOCK_MATCH_DETAILS, mockMatchDetailsForIds } from '../../src/data/mockResults';

describe('parseScoreString', () => {
  it('should parse "H-A" scores', () => {
    expect(parseScoreString('2-1')).toEqual({ home: 2, away: 1 });
    expect(parseScoreString('0-0')).toEqual({ home: 0, away: 0 });
    expect(parseScoreString('12-3')).toEqual({ home: 12, away: 3 });
  });

  it('should return null for missing/malformed scores', () => {
    expect(parseScoreString(undefined)).toBeNull();
    expect(parseScoreString(null)).toBeNull();
    expect(parseScoreString('')).toBeNull();
    expect(parseScoreString('vs')).toBeNull();
    expect(parseScoreString('2 - 1')).toBeNull();
  });
});

describe('normalizeMatchTimeStatus', () => {
  it('should map known time_status codes', () => {
    expect(normalizeMatchTimeStatus(0)).toBe('scheduled');
    expect(normalizeMatchTimeStatus(1)).toBe('live');
    expect(normalizeMatchTimeStatus(3)).toBe('finished');
  });

  it('should default unknown codes to live and missing field to unknown', () => {
    expect(normalizeMatchTimeStatus(2)).toBe('live');
    expect(normalizeMatchTimeStatus(undefined)).toBe('unknown');
  });
});

describe('normalizeMatchDetail + isOverLine', () => {
  it('should combine score parsing and status mapping', () => {
    const m = normalizeMatchDetail(MOCK_MATCH_DETAILS[0]);
    expect(m).toEqual({
      eventId: '13090114',
      home: 'Inter',
      away: 'Genoa',
      status: 'finished',
      homeGoals: 4,
      awayGoals: 2,
      totalGoals: 6,
    });
    expect(isOverLine(m.totalGoals)).toBe(true);
  });

  it('should return null totals and null isOverLine for scoreless matches', () => {
    const m = normalizeMatchDetail({ eventid: 'x', time_status: 0 });
    expect(m.totalGoals).toBeNull();
    expect(isOverLine(m.totalGoals)).toBeNull();
  });

  it('should filter mock by event ids', () => {
    expect(mockMatchDetailsForIds(['13090115']).map((m) => m.eventid)).toEqual(['13090115']);
    expect(mockMatchDetailsForIds([]).length).toBe(2);
  });
});

describe('matchEventByTeams', () => {
  it('should match on exact normalized team names, ignoring case/accents', () => {
    const found = matchEventByTeams(MOCK_MATCH_DETAILS, 'inter', 'GENOA');
    expect(found?.eventid).toBe('13090114');
  });

  it('should return null when no candidate matches', () => {
    expect(matchEventByTeams(MOCK_MATCH_DETAILS, 'Juventus', 'Napoli')).toBeNull();
  });

  it('should return null on ambiguous matches (more than one candidate)', () => {
    const dup = [
      ...MOCK_MATCH_DETAILS,
      { id: '3', eventid: '999', home: 'Inter', away: 'Genoa', ss: '1-1', time_status: 1 },
    ];
    expect(matchEventByTeams(dup, 'Inter', 'Genoa')).toBeNull();
  });
});
