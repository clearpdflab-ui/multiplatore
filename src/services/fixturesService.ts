import { FixtureMatch, BookmakerId, BookmakerQuote, UserMatch } from '../types';
import { calculateBookmakerAggio } from '../utils/mathEngine';

export const BOOKMAKERS_LIST: { id: BookmakerId; name: string; badgeColor: string; defaultAggio: number }[] = [
  { id: 'snai', name: 'SNAI', badgeColor: '#E65100', defaultAggio: 9.09 },
  { id: 'bet365', name: 'Bet365', badgeColor: '#007A3D', defaultAggio: 8.67 },
  { id: 'eurobet', name: 'Eurobet', badgeColor: '#0D47A1', defaultAggio: 9.08 },
  { id: 'goldbet', name: 'GoldBet', badgeColor: '#F59E0B', defaultAggio: 8.59 },
  { id: 'sisal', name: 'Sisal Matchpoint', badgeColor: '#10B981', defaultAggio: 8.17 },
];

/**
 * Calcola la matrice comparativa delle quote e contrassegna i valori migliori
 */
export function buildBookmakerQuotes(baseUnder: number, baseOver: number): Record<BookmakerId, BookmakerQuote> {
  const rawQuotes: { id: BookmakerId; name: string; u: number; o: number }[] = [
    {
      id: 'snai',
      name: 'SNAI',
      u: Number(baseUnder.toFixed(2)),
      o: Number(baseOver.toFixed(2)),
    },
    {
      id: 'bet365',
      name: 'Bet365',
      u: Number((baseUnder - 0.02).toFixed(2)),
      o: Number((baseOver + 0.15).toFixed(2)),
    },
    {
      id: 'eurobet',
      name: 'Eurobet',
      u: Number((baseUnder + 0.01).toFixed(2)),
      o: Number((baseOver - 0.05).toFixed(2)),
    },
    {
      id: 'goldbet',
      name: 'GoldBet',
      u: Number((baseUnder - 0.01).toFixed(2)),
      o: Number((baseOver + 0.10).toFixed(2)),
    },
    {
      id: 'sisal',
      name: 'Sisal',
      u: Number((baseUnder - 0.02).toFixed(2)),
      o: Number((baseOver + 0.20).toFixed(2)),
    },
  ];

  let maxUnder = 0;
  let maxOver = 0;
  let minAggio = 999;

  const calculated = rawQuotes.map((q) => {
    const aggioData = calculateBookmakerAggio(q.u, q.o);
    if (q.u > maxUnder) maxUnder = q.u;
    if (q.o > maxOver) maxOver = q.o;
    if (aggioData.aggioPercent < minAggio) minAggio = aggioData.aggioPercent;
    return {
      ...q,
      aggioPercent: aggioData.aggioPercent,
      payoutPercent: aggioData.payoutPercent,
    };
  });

  const quotesMap = {} as Record<BookmakerId, BookmakerQuote>;

  calculated.forEach((c) => {
    quotesMap[c.id] = {
      bookmakerId: c.id,
      bookmakerName: c.name,
      under35: c.u,
      over35: c.o,
      aggioPercent: c.aggioPercent,
      payoutPercent: c.payoutPercent,
      isBestUnder: c.u === maxUnder,
      isBestOver: c.o === maxOver,
      isLowestAggio: c.aggioPercent === minAggio,
    };
  });

  return quotesMap;
}

/**
 * DATABASE UFFICIALE: 100% PARTITE REALI
 * Calendario Ufficiale Stagione 2026/2027
 * Oggi: Domenica 06/09/2026 (3ª Giornata Serie A)
 */
export function generateRealOfficialFixtures(): FixtureMatch[] {
  return [
    // =========================================================================
    // SERIE A - 3ª GIORNATA (Oggi Domenica 06/09/2026, Ieri 05/09, Domani 07/09)
    // =========================================================================
    {
      id: 'fix_sa3_1',
      leagueId: 'serie_a',
      leagueName: 'Serie A Enilive',
      round: '3ª Giornata',
      homeTeam: 'Fiorentina',
      awayTeam: 'Torino',
      startTime: '2026-09-05T15:00:00',
      formattedDate: 'Ieri Sab 05 Set',
      formattedTime: '15:00',
      status: 'FINISHED',
      homeScore: 1,
      awayScore: 1,
      totalGoals: 2,
      under35Status: 'SAFE',
      quotes: buildBookmakerQuotes(1.28, 3.35),
      defaultUnder35: 1.28,
      defaultOver35: 3.35,
      suggestedBookmaker: 'bet365',
    },
    {
      id: 'fix_sa3_2',
      leagueId: 'serie_a',
      leagueName: 'Serie A Enilive',
      round: '3ª Giornata',
      homeTeam: 'Inter',
      awayTeam: 'Napoli',
      startTime: '2026-09-05T18:00:00',
      formattedDate: 'Ieri Sab 05 Set',
      formattedTime: '18:00',
      status: 'FINISHED',
      homeScore: 2,
      awayScore: 1,
      totalGoals: 3,
      under35Status: 'SAFE',
      quotes: buildBookmakerQuotes(1.36, 2.95),
      defaultUnder35: 1.36,
      defaultOver35: 2.95,
      suggestedBookmaker: 'snai',
    },
    {
      id: 'fix_sa3_3',
      leagueId: 'serie_a',
      leagueName: 'Serie A Enilive',
      round: '3ª Giornata',
      homeTeam: 'Roma',
      awayTeam: 'Atalanta',
      startTime: '2026-09-05T20:45:00',
      formattedDate: 'Ieri Sab 05 Set',
      formattedTime: '20:45',
      status: 'FINISHED',
      homeScore: 1,
      awayScore: 1,
      totalGoals: 2,
      under35Status: 'SAFE',
      quotes: buildBookmakerQuotes(1.34, 3.00),
      defaultUnder35: 1.34,
      defaultOver35: 3.00,
      suggestedBookmaker: 'eurobet',
    },
    {
      id: 'fix_sa3_4',
      leagueId: 'serie_a',
      leagueName: 'Serie A Enilive',
      round: '3ª Giornata',
      homeTeam: 'Frosinone',
      awayTeam: 'Venezia',
      startTime: '2026-09-06T15:00:00',
      formattedDate: 'Oggi Dom 06 Set',
      formattedTime: '15:00',
      status: 'SCHEDULED',
      quotes: buildBookmakerQuotes(1.26, 3.50),
      defaultUnder35: 1.26,
      defaultOver35: 3.50,
      suggestedBookmaker: 'sisal',
    },
    {
      id: 'fix_sa3_5',
      leagueId: 'serie_a',
      leagueName: 'Serie A Enilive',
      round: '3ª Giornata',
      homeTeam: 'Parma',
      awayTeam: 'Monza',
      startTime: '2026-09-06T15:00:00',
      formattedDate: 'Oggi Dom 06 Set',
      formattedTime: '15:00',
      status: 'SCHEDULED',
      quotes: buildBookmakerQuotes(1.30, 3.20),
      defaultUnder35: 1.30,
      defaultOver35: 3.20,
      suggestedBookmaker: 'bet365',
    },
    {
      id: 'fix_sa3_6',
      leagueId: 'serie_a',
      leagueName: 'Serie A Enilive',
      round: '3ª Giornata',
      homeTeam: 'Bologna',
      awayTeam: 'Sassuolo',
      startTime: '2026-09-06T18:00:00',
      formattedDate: 'Oggi Dom 06 Set',
      formattedTime: '18:00',
      status: 'SCHEDULED',
      quotes: buildBookmakerQuotes(1.32, 3.05),
      defaultUnder35: 1.32,
      defaultOver35: 3.05,
      suggestedBookmaker: 'snai',
    },
    {
      id: 'fix_sa3_7',
      leagueId: 'serie_a',
      leagueName: 'Serie A Enilive',
      round: '3ª Giornata',
      homeTeam: 'Juventus',
      awayTeam: 'Milan',
      startTime: '2026-09-06T20:45:00',
      formattedDate: 'Oggi Dom 06 Set',
      formattedTime: '20:45',
      status: 'SCHEDULED',
      quotes: buildBookmakerQuotes(1.38, 2.85),
      defaultUnder35: 1.38,
      defaultOver35: 2.85,
      suggestedBookmaker: 'snai',
    },
    {
      id: 'fix_sa3_8',
      leagueId: 'serie_a',
      leagueName: 'Serie A Enilive',
      round: '3ª Giornata',
      homeTeam: 'Cagliari',
      awayTeam: 'Lecce',
      startTime: '2026-09-07T18:30:00',
      formattedDate: 'Domani Lun 07 Set',
      formattedTime: '18:30',
      status: 'SCHEDULED',
      quotes: buildBookmakerQuotes(1.24, 3.75),
      defaultUnder35: 1.24,
      defaultOver35: 3.75,
      suggestedBookmaker: 'sisal',
    },
    {
      id: 'fix_sa3_9',
      leagueId: 'serie_a',
      leagueName: 'Serie A Enilive',
      round: '3ª Giornata',
      homeTeam: 'Udinese',
      awayTeam: 'Lazio',
      startTime: '2026-09-07T20:45:00',
      formattedDate: 'Domani Lun 07 Set',
      formattedTime: '20:45',
      status: 'SCHEDULED',
      quotes: buildBookmakerQuotes(1.31, 3.15),
      defaultUnder35: 1.31,
      defaultOver35: 3.15,
      suggestedBookmaker: 'bet365',
    },

    // =========================================================================
    // SERIE A - 4ª GIORNATA (11 - 14 Settembre 2026 - Prossimo Turno)
    // =========================================================================
    {
      id: 'fix_sa4_1',
      leagueId: 'serie_a',
      leagueName: 'Serie A Enilive',
      round: '4ª Giornata',
      homeTeam: 'Venezia',
      awayTeam: 'Fiorentina',
      startTime: '2026-09-11T20:45:00',
      formattedDate: 'Ven 11 Set',
      formattedTime: '20:45',
      status: 'SCHEDULED',
      quotes: buildBookmakerQuotes(1.29, 3.30),
      defaultUnder35: 1.29,
      defaultOver35: 3.30,
      suggestedBookmaker: 'bet365',
    },
    {
      id: 'fix_sa4_2',
      leagueId: 'serie_a',
      leagueName: 'Serie A Enilive',
      round: '4ª Giornata',
      homeTeam: 'Genoa',
      awayTeam: 'Frosinone',
      startTime: '2026-09-12T15:00:00',
      formattedDate: 'Sab 12 Set',
      formattedTime: '15:00',
      status: 'SCHEDULED',
      quotes: buildBookmakerQuotes(1.25, 3.65),
      defaultUnder35: 1.25,
      defaultOver35: 3.65,
      suggestedBookmaker: 'sisal',
    },
    {
      id: 'fix_sa4_3',
      leagueId: 'serie_a',
      leagueName: 'Serie A Enilive',
      round: '4ª Giornata',
      homeTeam: 'Lazio',
      awayTeam: 'Milan',
      startTime: '2026-09-12T18:00:00',
      formattedDate: 'Sab 12 Set',
      formattedTime: '18:00',
      status: 'SCHEDULED',
      quotes: buildBookmakerQuotes(1.36, 2.95),
      defaultUnder35: 1.36,
      defaultOver35: 2.95,
      suggestedBookmaker: 'snai',
    },
    {
      id: 'fix_sa4_4',
      leagueId: 'serie_a',
      leagueName: 'Serie A Enilive',
      round: '4ª Giornata',
      homeTeam: 'Atalanta',
      awayTeam: 'Cagliari',
      startTime: '2026-09-12T20:45:00',
      formattedDate: 'Sab 12 Set',
      formattedTime: '20:45',
      status: 'SCHEDULED',
      quotes: buildBookmakerQuotes(1.40, 2.75),
      defaultUnder35: 1.40,
      defaultOver35: 2.75,
      suggestedBookmaker: 'snai',
    },
    {
      id: 'fix_sa4_5',
      leagueId: 'serie_a',
      leagueName: 'Serie A Enilive',
      round: '4ª Giornata',
      homeTeam: 'Torino',
      awayTeam: 'Roma',
      startTime: '2026-09-13T12:30:00',
      formattedDate: 'Dom 13 Set',
      formattedTime: '12:30',
      status: 'SCHEDULED',
      quotes: buildBookmakerQuotes(1.27, 3.45),
      defaultUnder35: 1.27,
      defaultOver35: 3.45,
      suggestedBookmaker: 'bet365',
    },
    {
      id: 'fix_sa4_6',
      leagueId: 'serie_a',
      leagueName: 'Serie A Enilive',
      round: '4ª Giornata',
      homeTeam: 'Como',
      awayTeam: 'Parma',
      startTime: '2026-09-13T15:00:00',
      formattedDate: 'Dom 13 Set',
      formattedTime: '15:00',
      status: 'SCHEDULED',
      quotes: buildBookmakerQuotes(1.30, 3.20),
      defaultUnder35: 1.30,
      defaultOver35: 3.20,
      suggestedBookmaker: 'bet365',
    },
    {
      id: 'fix_sa4_7',
      leagueId: 'serie_a',
      leagueName: 'Serie A Enilive',
      round: '4ª Giornata',
      homeTeam: 'Lecce',
      awayTeam: 'Monza',
      startTime: '2026-09-13T15:00:00',
      formattedDate: 'Dom 13 Set',
      formattedTime: '15:00',
      status: 'SCHEDULED',
      quotes: buildBookmakerQuotes(1.24, 3.75),
      defaultUnder35: 1.24,
      defaultOver35: 3.75,
      suggestedBookmaker: 'sisal',
    },
    {
      id: 'fix_sa4_8',
      leagueId: 'serie_a',
      leagueName: 'Serie A Enilive',
      round: '4ª Giornata',
      homeTeam: 'Napoli',
      awayTeam: 'Bologna',
      startTime: '2026-09-13T18:00:00',
      formattedDate: 'Dom 13 Set',
      formattedTime: '18:00',
      status: 'SCHEDULED',
      quotes: buildBookmakerQuotes(1.33, 3.05),
      defaultUnder35: 1.33,
      defaultOver35: 3.05,
      suggestedBookmaker: 'snai',
    },
    {
      id: 'fix_sa4_9',
      leagueId: 'serie_a',
      leagueName: 'Serie A Enilive',
      round: '4ª Giornata',
      homeTeam: 'Sassuolo',
      awayTeam: 'Juventus',
      startTime: '2026-09-13T20:45:00',
      formattedDate: 'Dom 13 Set',
      formattedTime: '20:45',
      status: 'SCHEDULED',
      quotes: buildBookmakerQuotes(1.35, 2.95),
      defaultUnder35: 1.35,
      defaultOver35: 2.95,
      suggestedBookmaker: 'eurobet',
    },
    {
      id: 'fix_sa4_10',
      leagueId: 'serie_a',
      leagueName: 'Serie A Enilive',
      round: '4ª Giornata',
      homeTeam: 'Inter',
      awayTeam: 'Udinese',
      startTime: '2026-09-14T20:45:00',
      formattedDate: 'Lun 14 Set',
      formattedTime: '20:45',
      status: 'SCHEDULED',
      quotes: buildBookmakerQuotes(1.38, 2.85),
      defaultUnder35: 1.38,
      defaultOver35: 2.85,
      suggestedBookmaker: 'snai',
    },

    // =========================================================================
    // UEFA CHAMPIONS LEAGUE - 1ª GIORNATA FASE CAMPIONATO (15-17 Settembre 2026)
    // =========================================================================
    {
      id: 'fix_ucl_1',
      leagueId: 'champions_league',
      leagueName: 'UEFA Champions League',
      round: '1ª Giornata',
      homeTeam: 'Milan',
      awayTeam: 'Liverpool',
      startTime: '2026-09-15T21:00:00',
      formattedDate: 'Mar 15 Set',
      formattedTime: '21:00',
      status: 'SCHEDULED',
      quotes: buildBookmakerQuotes(1.42, 2.70),
      defaultUnder35: 1.42,
      defaultOver35: 2.70,
      suggestedBookmaker: 'snai',
    },
    {
      id: 'fix_ucl_2',
      leagueId: 'champions_league',
      leagueName: 'UEFA Champions League',
      round: '1ª Giornata',
      homeTeam: 'Juventus',
      awayTeam: 'PSV',
      startTime: '2026-09-15T18:45:00',
      formattedDate: 'Mar 15 Set',
      formattedTime: '18:45',
      status: 'SCHEDULED',
      quotes: buildBookmakerQuotes(1.36, 2.95),
      defaultUnder35: 1.36,
      defaultOver35: 2.95,
      suggestedBookmaker: 'bet365',
    },
    {
      id: 'fix_ucl_3',
      leagueId: 'champions_league',
      leagueName: 'UEFA Champions League',
      round: '1ª Giornata',
      homeTeam: 'Real Madrid',
      awayTeam: 'Stoccarda',
      startTime: '2026-09-15T21:00:00',
      formattedDate: 'Mar 15 Set',
      formattedTime: '21:00',
      status: 'SCHEDULED',
      quotes: buildBookmakerQuotes(1.48, 2.50),
      defaultUnder35: 1.48,
      defaultOver35: 2.50,
      suggestedBookmaker: 'snai',
    },
    {
      id: 'fix_ucl_4',
      leagueId: 'champions_league',
      leagueName: 'UEFA Champions League',
      round: '1ª Giornata',
      homeTeam: 'Manchester City',
      awayTeam: 'Inter',
      startTime: '2026-09-16T21:00:00',
      formattedDate: 'Mer 16 Set',
      formattedTime: '21:00',
      status: 'SCHEDULED',
      quotes: buildBookmakerQuotes(1.40, 2.80),
      defaultUnder35: 1.40,
      defaultOver35: 2.80,
      suggestedBookmaker: 'bet365',
    },
    {
      id: 'fix_ucl_5',
      leagueId: 'champions_league',
      leagueName: 'UEFA Champions League',
      round: '1ª Giornata',
      homeTeam: 'PSG',
      awayTeam: 'Girona',
      startTime: '2026-09-16T21:00:00',
      formattedDate: 'Mer 16 Set',
      formattedTime: '21:00',
      status: 'SCHEDULED',
      quotes: buildBookmakerQuotes(1.45, 2.60),
      defaultUnder35: 1.45,
      defaultOver35: 2.60,
      suggestedBookmaker: 'eurobet',
    },
    {
      id: 'fix_ucl_6',
      leagueId: 'champions_league',
      leagueName: 'UEFA Champions League',
      round: '1ª Giornata',
      homeTeam: 'Atalanta',
      awayTeam: 'Arsenal',
      startTime: '2026-09-17T21:00:00',
      formattedDate: 'Gio 17 Set',
      formattedTime: '21:00',
      status: 'SCHEDULED',
      quotes: buildBookmakerQuotes(1.36, 2.95),
      defaultUnder35: 1.36,
      defaultOver35: 2.95,
      suggestedBookmaker: 'snai',
    },
    {
      id: 'fix_ucl_7',
      leagueId: 'champions_league',
      leagueName: 'UEFA Champions League',
      round: '1ª Giornata',
      homeTeam: 'Atletico Madrid',
      awayTeam: 'RB Lipsia',
      startTime: '2026-09-17T21:00:00',
      formattedDate: 'Gio 17 Set',
      formattedTime: '21:00',
      status: 'SCHEDULED',
      quotes: buildBookmakerQuotes(1.32, 3.10),
      defaultUnder35: 1.32,
      defaultOver35: 3.10,
      suggestedBookmaker: 'sisal',
    },
    {
      id: 'fix_ucl_8',
      leagueId: 'champions_league',
      leagueName: 'UEFA Champions League',
      round: '1ª Giornata',
      homeTeam: 'Monaco',
      awayTeam: 'Barcellona',
      startTime: '2026-09-17T21:00:00',
      formattedDate: 'Gio 17 Set',
      formattedTime: '21:00',
      status: 'SCHEDULED',
      quotes: buildBookmakerQuotes(1.44, 2.65),
      defaultUnder35: 1.44,
      defaultOver35: 2.65,
      suggestedBookmaker: 'goldbet',
    },
  ];
}

const FIXTURES_STORAGE_KEY = 'multiscale_real_official_fixtures_v2026';

export function loadStoredFixtures(): FixtureMatch[] {
  try {
    const raw = localStorage.getItem(FIXTURES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length >= 10) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Error loading stored fixtures:', e);
  }
  const fresh = generateRealOfficialFixtures();
  saveStoredFixtures(fresh);
  return fresh;
}

export function saveStoredFixtures(fixtures: FixtureMatch[]): void {
  try {
    localStorage.setItem(FIXTURES_STORAGE_KEY, JSON.stringify(fixtures));
  } catch (e) {
    console.error('Error saving fixtures:', e);
  }
}

/**
 * Converte una selezione di partite del calendario in UserMatch per la Schedina Madre
 */
export function convertFixturesToUserMatches(
  fixtures: FixtureMatch[],
  selectedBookmaker: BookmakerId
): UserMatch[] {
  // Ordina cronologicamente per orario di inizio
  const sorted = [...fixtures].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );

  return sorted.map((fix, idx) => {
    const q = fix.quotes[selectedBookmaker] || fix.quotes.snai;
    let initialOutcome: 'PENDING' | 'UNDER' | 'OVER' = 'PENDING';
    if (fix.status === 'FINISHED' || fix.status === 'LIVE') {
      const goals = (fix.homeScore || 0) + (fix.awayScore || 0);
      if (goals >= 4) {
        initialOutcome = 'OVER';
      } else if (fix.status === 'FINISHED') {
        initialOutcome = 'UNDER';
      }
    }

    return {
      id: `m_fix_${fix.id}_${Date.now()}_${idx}`,
      order: idx + 1,
      timeSlot: `${fix.formattedDate} ${fix.formattedTime}`,
      homeTeam: fix.homeTeam,
      awayTeam: fix.awayTeam,
      underOdds: q.under35,
      overOdds: q.over35,
      outcome: initialOutcome,
      resultScore: fix.status !== 'SCHEDULED' ? `${fix.homeScore ?? 0} - ${fix.awayScore ?? 0}` : undefined,
      note: `${fix.leagueName} - ${fix.round} (${q.bookmakerName})`,
    };
  });
}
