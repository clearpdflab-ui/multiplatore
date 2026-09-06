import { BookmakerModelConfig } from '../types';

export const BOOKMAKER_MODELS: Record<'132_300' | '130_315', BookmakerModelConfig> = {
  '132_300': {
    id: '132_300',
    label: '1.32 — 3.00',
    name: 'Modello 1: 1.32 / 3.00 (Aggio 9.09%)',
    underOdds: 1.32,
    overOdds: 3.00,
    finalSingleOdds: 2.75,
    aggioPercent: 9.09,
    payoutPercent: 90.91,
    fairUnderProb: 69.44,
    fairOverProb: 30.56,
    description: 'Under più alto (1.32) per massimizzare la moltiplicazione della Schedina Madre; Over 3.00 per solida copertura.',
  },
  '130_315': {
    id: '130_315',
    label: '1.30 — 3.15',
    name: 'Modello 2: 1.30 / 3.15 (Aggio 8.67%)',
    underOdds: 1.30,
    overOdds: 3.15,
    finalSingleOdds: 2.85,
    aggioPercent: 8.67,
    payoutPercent: 91.33,
    fairUnderProb: 70.79,
    fairOverProb: 29.21,
    description: 'Aggio bookmaker più basso (8.67% vs 9.09%). Over 3.15 più generoso, abbassa la puntata di recupero sulle coperture.',
  },
};

export function calculateBookmakerAggio(underOdds: number, overOdds: number): {
  overround: number;
  aggioPercent: number;
  payoutPercent: number;
  fairUnderProb: number;
  fairOverProb: number;
} {
  const invU = underOdds > 0 ? 1 / underOdds : 0;
  const invO = overOdds > 0 ? 1 / overOdds : 0;
  const overround = invU + invO;
  const aggioPercent = Math.max(0, (overround - 1) * 100);
  const payoutPercent = overround > 0 ? (1 / overround) * 100 : 0;
  const fairUnderProb = overround > 0 ? (invU / overround) * 100 : 0;
  const fairOverProb = overround > 0 ? (invO / overround) * 100 : 0;

  return {
    overround: Number(overround.toFixed(4)),
    aggioPercent: Number(aggioPercent.toFixed(2)),
    payoutPercent: Number(payoutPercent.toFixed(2)),
    fairUnderProb: Number(fairUnderProb.toFixed(1)),
    fairOverProb: Number(fairOverProb.toFixed(1)),
  };
}
