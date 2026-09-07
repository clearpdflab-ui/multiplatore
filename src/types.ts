export type ViewMode = 'live_slips' | 'calendar_odds' | 'practical' | 'math';

export type CalculationModel = 'original_sum' | 'real_product' | 'optimized_sequential';

export type AsymmetricMode = 'flat' | 'front_loaded' | 'capital_preservation';

export type BookmakerModelId = '132_300' | '130_315' | 'custom';

export interface BookmakerModelConfig {
  id: BookmakerModelId;
  label: string;
  name: string;
  underOdds: number;
  overOdds: number;
  finalSingleOdds: number;
  aggioPercent: number;
  payoutPercent: number;
  fairUnderProb: number;
  fairOverProb: number;
  description: string;
}

export interface UserMatch {
  id: string;
  order: number;
  timeSlot: string; // e.g. "12:30", "15:00", "18:00", "20:45"
  homeTeam: string;
  awayTeam: string;
  underOdds: number; // Quote Under 3.5 specifica
  overOdds: number; // Quote Over 3.5 specifica
  outcome: 'PENDING' | 'UNDER' | 'OVER';
  resultScore?: string;
  note?: string;
}

export interface GeneratedSlipItem {
  matchId: string;
  matchOrder: number;
  homeTeam: string;
  awayTeam: string;
  timeSlot: string;
  market: 'UNDER 3.5' | 'OVER 3.5' | 'BOOSTER 1X/12';
  odds: number;
}

export interface GeneratedSlip {
  id: string;
  step: number; // 0 for Schedina Madre S0, 1..N for Copertura Ck
  type: 'MOTHER' | 'COVERAGE' | 'FINAL_SINGLE';
  title: string;
  code: string; // e.g. "S0", "C1", "C2", ...
  timing: string;
  items: GeneratedSlipItem[];
  eventCount: number;
  rawMultiplier: number;
  bonusPercentage: number;
  finalMultiplier: number;
  stake: number;
  targetProfit: number;
  cumulativeCost: number;
  potentialGrossPayout: number;
  potentialNetProfit: number;
  status: 'PENDING' | 'ACTIVE' | 'WON' | 'LOST';
}

export interface BonusRule {
  minEvents: number;
  bonusTable: Record<number, number>; // e.g. 5: 5%, 6: 10%, 7: 18%, 8: 26.2%
}

export interface BoosterConfig {
  enabled: boolean;
  odds: number; // e.g. 1.10
  applyMode: 'late_steps' | 'all_steps' | 'under_5_only';
}

export interface SequentialStepState {
  step: number;
  matchIndex: number;
  timeSlot: string;
  matchLabel: string;
  activeTicketType: 'MAIN' | 'REPLACEMENT';
  activeTicketDesc: string;
  coverageTicketDesc: string;
  eventsInCoverage: number;
  hasBooster: boolean;
  rawOdds: number;
  bonusPercentage: number;
  finalOddsWithBonus: number;
  stake: number;
  stepTargetProfit?: number;
  cumulativeCostSoFar: number;
  potentialGrossWin: number;
  potentialNetProfit: number;
  matchOutcome: 'UNDER' | 'OVER' | 'PENDING';
  status: 'WAITING' | 'ACTIVE' | 'RESOLVED_UNDER' | 'RESOLVED_OVER_SWAP' | 'FINISHED';
}

export interface OriginalCsvStep {
  step: number;
  label: string;
  nUnder: number;
  qUnder: number;
  qOver: number;
  csvOdds: number;
  realOdds: number;
  csvStake: number;
  csvWin: number;
  csvTotalCost: number;
  csvNetProfit: number;
  optimalStakeReal: number;
  optimalWinReal: number;
}

export interface StepCalculation {
  step: number;
  name: string;
  eventDescription: string;
  calculatedOdds: number;
  oddsFormulaText: string;
  stake: number;
  cumulativeCost: number;
  grossWin: number;
  netProfit: number;
  roiPercentage: number;
}

export interface ModelParameters {
  totalEvents: number;
  baseStake: number;
  underOdds: number;
  overOdds: number;
  targetProfit: number;
  model: CalculationModel;
  finalSingleOdds: number;
  enableBooster?: boolean;
  boosterOdds?: number;
  boosterThresholdEvents?: number;
  asymmetricMode?: AsymmetricMode;
  bookmakerModel?: BookmakerModelId;
}

export interface WeakPoint {
  id: string;
  title: string;
  severity: 'critical' | 'high' | 'medium';
  tag: string;
  description: string;
  mathProof: string;
  suggestedFix: string;
}

export interface ImprovementModel {
  id: string;
  title: string;
  tag: string;
  description: string;
  formula: string;
  advantage: string;
}

export type BookmakerId = 'snai' | 'bet365' | 'eurobet' | 'goldbet' | 'sisal';

export interface BookmakerQuote {
  bookmakerId: BookmakerId;
  bookmakerName: string;
  under35: number;
  over35: number;
  aggioPercent: number;
  payoutPercent: number;
  isBestUnder?: boolean;
  isBestOver?: boolean;
  isLowestAggio?: boolean;
}

export interface FixtureMatch {
  id: string;
  leagueId: 'serie_a' | 'premier_league' | 'la_liga' | 'champions_league';
  leagueName: string;
  round: string;
  homeTeam: string;
  awayTeam: string;
  startTime: string; // ISO date string
  formattedDate: string; // e.g. "Sab 05 Set"
  formattedTime: string; // e.g. "15:00"
  status: 'SCHEDULED' | 'LIVE' | 'FINISHED';
  liveMinute?: number;
  homeScore?: number;
  awayScore?: number;
  totalGoals?: number;
  under35Status?: 'SAFE' | 'WARNING_3_GOALS' | 'OVER_BUSTED';
  quotes: Record<BookmakerId, BookmakerQuote>;
  defaultUnder35: number;
  defaultOver35: number;
  suggestedBookmaker: BookmakerId;
}

// Registry book per bonus multipla (sezione Book gestionale, tabelle versionate su Supabase).
export interface Book {
  id: string;
  name: string;
  bonusTable: Record<number, number>; // N eventi -> % bonus (es. 30 -> 354.9)
  bonusCap: number; // tetto % applicato (es. 500)
  minStake: number; // default 1
  maxPayout: number | null; // null = illimitato
  maxLegs: number; // default 30
  overEligible: boolean; // gamba Over ammessa nel bonus
  competitions: string[]; // ['all'] = tutti i campionati
  apiBookKey?: string; // mapping nomi bookmaker odds-api.net
  isActive: boolean;
}

export interface BookBonusVersion {
  id: string;
  bookId: string;
  validFrom: string; // ISO date
  tableData: Record<number, number>;
  supersededBy?: string | null;
}

// Gamba di un ticket candidato (madre/copertura/terminazione).
export interface TicketLeg {
  odds: number; // quota reale al piazzamento
  market?: 'OVER' | 'UNDER';
}

