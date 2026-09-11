// Backward compatibility re-exports
// Tutti i moduli sono stati spostati in src/engine/
// Questo file mantiene la compatibilità con gli imports esistenti
export { calculateBookmakerAggio, BOOKMAKER_MODELS } from '../engine/odds';
export { getBonusPercentage } from '../engine/bonus';
export { roundToFiftyCents, getStepTargetProfit } from '../engine/dutching';
export { calculateSteps } from '../engine/calculations';
export { buildSequentialTimeline } from '../engine/timeline';
export { generateCustomSlips } from '../engine/slips';
export { calculateBinomialRisk, evaluateScenario } from '../engine/risk';
export type { CustomSlipsResult } from '../engine/slips';
export type { ModelParameters } from '../types';

// Mantieni le costanti originali per compatibilità
export const ORIGINAL_BASE_BET = {
  events: 9,
  market: 'Under 3.5',
  singleOdds: 1.32,
  csvTotalOdds: 11.88,
  realTotalOdds: 12.028,
  stake: 20,
  csvWin: 237.6,
  realWin: 240.56,
  bonusLabel: 'Bonus 26.2% su 8 partite',
  csvWinWithBonus: 299.376,
};
export const DEFAULT_SERIE_A_MATCHES = [];
export const REAL_SERIE_A_3_MATCHES = [];
export const REAL_SERIE_A_4_MATCHES = [];
export const REAL_CHAMPIONS_LEAGUE_MATCHES = [];
export const REAL_SERIE_A_28_MATCHES = [];
export const REAL_SERIE_A_29_MATCHES = [];
