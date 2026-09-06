import {
  StepCalculation,
  CalculationModel,
  SequentialStepState,
  AsymmetricMode,
  UserMatch,
  GeneratedSlip,
  GeneratedSlipItem,
  BookmakerModelId,
  BookmakerModelConfig,
} from '../types';

export interface ModelParameters {
  totalEvents: number;
  baseStake: number;
  underOdds: number;
  overOdds: number;
  targetProfit: number;
  model: CalculationModel;
  finalSingleOdds: number;
  enableBooster?: boolean;
  boosterOdds?: number; // default 1.10
  boosterThresholdEvents?: number; // e.g. <= 4 to push to 5+ and re-enable bonus
  asymmetricMode?: AsymmetricMode; // 'flat' | 'front_loaded' | 'capital_preservation'
  bookmakerModel?: BookmakerModelId;
}

/**
 * Modelli di aggio bookmaker reali identificati dall'utente per Under/Over 3.5
 * Modello A: 1.32 - 3.00 (Aggio 9.09%, Payout 90.91%)
 * Modello B: 1.30 - 3.15 (Aggio 8.67%, Payout 91.33%)
 */
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

/**
 * Calcola esattamente l'aggio del bookmaker (overround), payout e probabilità reali normalizzate
 */
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

/**
 * Rounds stake to nearest 0.50 increment (e.g. 2.14 -> 2.50, 3.42 -> 3.50, 4.00 -> 4.00)
 * Ensures bets match legal bookmaker increments (0.50 / 1.00) and never under-fund recovery.
 */
export function roundToFiftyCents(val: number): number {
  if (val <= 0) return 0.5;
  const rounded = Math.ceil(val * 2) / 2;
  return Math.max(1.0, Number(rounded.toFixed(2)));
}

/**
 * Calculates step-specific target profit based on asymmetric strategy.
 * Front-loaded: High profit early when odds are high (cheap to buy), decaying to minimal at end.
 * Capital preservation: Moderate early, 0.00€ break-even on final steps to minimize peak exposure.
 * Flat: Constant target profit everywhere.
 */
export function getStepTargetProfit(
  step: number,
  totalEvents: number,
  baseTarget: number,
  mode: AsymmetricMode = 'flat'
): number {
  if (mode === 'flat' || !mode) return baseTarget;

  if (mode === 'front_loaded') {
    // Step 1: ~1.8x, decaying down to ~0.15x (min 5€) at the final step
    const ratio = (step - 1) / Math.max(1, totalEvents - 1);
    const factor = Math.max(0.12, 1.8 - 1.68 * ratio);
    return Math.max(5, Math.round((baseTarget * factor) / 5) * 5);
  }

  if (mode === 'capital_preservation') {
    // Early (steps 1-2): 1.25x target
    // Mid steps: 0.7x target
    // Final 2 steps: 0.00€ (strict break-even recovery to eliminate capital explosion)
    if (step >= totalEvents - 1) return 0;
    if (step <= 2) return Math.round((baseTarget * 1.25) / 5) * 5;
    return Math.max(5, Math.round((baseTarget * 0.6) / 5) * 5);
  }

  return baseTarget;
}

/**
 * Bonus table: strictly starts at minimum 5 events as requested!
 * 8 events: 26.2%
 * 7 events: 18.0%
 * 6 events: 12.0%
 * 5 events: 6.0%
 * < 5 events: 0.0%
 */
export function getBonusPercentage(eventCount: number): number {
  if (eventCount >= 8) return 26.2;
  if (eventCount === 7) return 18.0;
  if (eventCount === 6) return 12.0;
  if (eventCount === 5) return 6.0;
  return 0.0;
}

/**
 * Calculates step-by-step odds, stakes, costs and profits
 */
export function calculateSteps(params: ModelParameters): StepCalculation[] {
  const {
    totalEvents,
    baseStake,
    underOdds,
    overOdds,
    targetProfit,
    model,
    finalSingleOdds,
    enableBooster,
    boosterOdds = 1.10,
    boosterThresholdEvents = 4,
    asymmetricMode = 'flat',
  } = params;
  const steps: StepCalculation[] = [];
  let cumulativeCost = baseStake;

  for (let k = 1; k <= totalEvents; k++) {
    const stepTarget = getStepTargetProfit(k, totalEvents, targetProfit, asymmetricMode);
    const remainingUnder = totalEvents - k;
    const baseEventsInTicket = k === totalEvents ? 1 : 1 + remainingUnder;
    const shouldAddBooster = Boolean(enableBooster && baseEventsInTicket <= boosterThresholdEvents);
    const effectiveEvents = shouldAddBooster ? baseEventsInTicket + 1 : baseEventsInTicket;
    const bonus = getBonusPercentage(effectiveEvents);

    let odds = 1;
    let formulaText = '';

    if (k === totalEvents) {
      // Final step: Single Over 3.5 bet (+ optional booster)
      const baseFinal = finalSingleOdds || overOdds;
      if (shouldAddBooster) {
        odds = Number((baseFinal * boosterOdds).toFixed(2));
        formulaText = `Singola Over 3.5 (${baseFinal.toFixed(2)}) × Booster (${boosterOdds.toFixed(2)}) = ${odds.toFixed(2)}`;
      } else {
        odds = baseFinal;
        formulaText = `Singola Over 3.5 (Match ${k}) = ${odds.toFixed(2)}`;
      }
    } else if (model === 'original_sum') {
      // The CSV sum formula
      let raw = overOdds + remainingUnder * underOdds;
      if (shouldAddBooster) raw *= boosterOdds;
      odds = Number(raw.toFixed(2));
      formulaText = `${overOdds} + (${remainingUnder} × ${underOdds})${shouldAddBooster ? ` × ${boosterOdds}` : ''} = ${odds}`;
    } else {
      // Real multiplication with booster and bonus
      let rawOdds = overOdds * Math.pow(underOdds, remainingUnder);
      if (shouldAddBooster) {
        rawOdds *= boosterOdds;
      }
      odds = Number((rawOdds * (1 + bonus / 100)).toFixed(3));
      
      const boosterLabel = shouldAddBooster ? ` × Booster ${boosterOdds.toFixed(2)}` : '';
      const bonusLabel = bonus > 0 ? ` [+${bonus}% bonus (${effectiveEvents} ev.)]` : ' [0% bonus (<5)]';
      formulaText = `${overOdds} × (${underOdds})^${remainingUnder}${boosterLabel}${bonusLabel} = ${odds.toFixed(2)}`;
    }

    // Stake calculation via Dutching rounded to 0.50 increments using step-specific asymmetric target
    let rawStake = 0;
    if (odds > 1) {
      rawStake = (cumulativeCost + stepTarget) / (odds - 1);
    } else {
      rawStake = 10;
    }
    const stake = roundToFiftyCents(rawStake);

    cumulativeCost += stake;
    const grossWin = Number((stake * odds).toFixed(2));
    const netProfit = Number((grossWin - cumulativeCost).toFixed(2));
    const roi = Number(((netProfit / cumulativeCost) * 100).toFixed(1));

    steps.push({
      step: k,
      name: k === totalEvents ? `Step ${k} (Singola Finale)` : `Step ${k} (Copertura ${k})`,
      eventDescription:
        k === totalEvents
          ? `Match ${k} Over 3.5${shouldAddBooster ? ` + Booster 1.10` : ''}`
          : `1 Over (Match ${k}) + ${remainingUnder} Under${shouldAddBooster ? ` + Booster 1.10` : ''}`,
      calculatedOdds: odds,
      oddsFormulaText: formulaText,
      stake,
      cumulativeCost: Number(cumulativeCost.toFixed(2)),
      grossWin,
      netProfit,
      roiPercentage: roi,
    });
  }

  return steps;
}

/**
 * Builds the interactive 2-hour sequential step timeline
 */
export function buildSequentialTimeline(
  params: ModelParameters,
  matchOutcomes: ('UNDER' | 'OVER' | 'PENDING')[]
): {
  timeline: SequentialStepState[];
  currentActiveTicketDesc: string;
  totalSpentSoFar: number;
  simulationStatus: 'IN_PROGRESS' | 'WON' | 'LOST';
  finalPayout: number;
  finalNet: number;
} {
  const {
    totalEvents,
    baseStake,
    underOdds,
    overOdds,
    targetProfit,
    model,
    finalSingleOdds,
    enableBooster,
    boosterOdds = 1.10,
    boosterThresholdEvents = 4,
    asymmetricMode = 'flat',
  } = params;
  const timeline: SequentialStepState[] = [];

  let cumulativeCost = baseStake;
  let activeTicketType: 'MAIN' | 'REPLACEMENT' = 'MAIN';
  let activeTicketDesc = `Multipla Madre (Tutti gli ${totalEvents} Under 3.5)`;
  let currentActiveTicketDesc = activeTicketDesc;
  let isBroken = false;
  let winningStep: number | null = null;
  let winningTicketDesc = '';
  let winningAmount = 0;

  // Initial base odds
  const baseBonus = getBonusPercentage(totalEvents);
  const baseRawOdds = Math.pow(underOdds, totalEvents);
  const baseFinalOdds = Number((baseRawOdds * (1 + baseBonus / 100)).toFixed(2));
  const baseGrossWin = Number((baseStake * baseFinalOdds).toFixed(2));

  for (let k = 1; k <= totalEvents; k++) {
    const stepTarget = getStepTargetProfit(k, totalEvents, targetProfit, asymmetricMode);
    const timeSlot = `+${(k - 1) * 2}h:00`;
    const remainingUnderAfterThis = totalEvents - k;
    const baseEventsInCoverage = k === totalEvents ? 1 : 1 + remainingUnderAfterThis;
    const hasBooster = Boolean(enableBooster && baseEventsInCoverage <= boosterThresholdEvents);
    const effectiveEventsInCoverage = hasBooster ? baseEventsInCoverage + 1 : baseEventsInCoverage;
    const bonus = getBonusPercentage(effectiveEventsInCoverage);

    let rawOdds = 1;
    let finalOdds = 1;

    if (k === totalEvents) {
      const baseFinal = finalSingleOdds || overOdds;
      rawOdds = hasBooster ? baseFinal * boosterOdds : baseFinal;
      finalOdds = rawOdds; // 2 events still < 5 so 0% bonus
    } else if (model === 'original_sum') {
      let raw = overOdds + remainingUnderAfterThis * underOdds;
      if (hasBooster) raw *= boosterOdds;
      rawOdds = raw;
      finalOdds = raw;
    } else {
      let r = overOdds * Math.pow(underOdds, remainingUnderAfterThis);
      if (hasBooster) r *= boosterOdds;
      rawOdds = r;
      finalOdds = Number((rawOdds * (1 + bonus / 100)).toFixed(3));
    }

    // Stake calculated to cover previous cumulative losses + step-specific targetProfit rounded to 0.50 increments
    let rawStake = 0;
    if (finalOdds > 1) {
      rawStake = (cumulativeCost + stepTarget) / (finalOdds - 1);
    } else {
      rawStake = 10;
    }
    const stake = roundToFiftyCents(rawStake);

    const outcome = matchOutcomes[k - 1] || 'PENDING';

    const coverageDesc =
      k === totalEvents
        ? `Singola Finale: Match ${k} Over 3.5${hasBooster ? ` + Booster Cuscinetto (Q=${boosterOdds.toFixed(2)})` : ''}`
        : `Copertura: Match ${k} OVER + ${remainingUnderAfterThis} restanti UNDER${hasBooster ? ` + Booster (${boosterOdds.toFixed(2)})` : ''} (${effectiveEventsInCoverage} ev.)`;

    let status: SequentialStepState['status'] = 'WAITING';

    if (isBroken) {
      status = 'FINISHED';
    } else if (outcome === 'PENDING') {
      status = 'ACTIVE';
    } else if (outcome === 'UNDER') {
      status = 'RESOLVED_UNDER';
      cumulativeCost += stake;
      // Main active ticket stays active and proceeds!
      if (k === totalEvents) {
        winningStep = k;
        winningTicketDesc = activeTicketDesc;
        winningAmount = baseGrossWin;
      }
    } else if (outcome === 'OVER') {
      status = 'RESOLVED_OVER_SWAP';
      cumulativeCost += stake;
      if (k === totalEvents) {
        winningStep = k;
        winningTicketDesc = `Singola Finale Over 3.5 (Match ${k})${hasBooster ? ' + Booster' : ''}`;
        winningAmount = Number((stake * finalOdds).toFixed(2));
      } else {
        activeTicketType = 'REPLACEMENT';
        activeTicketDesc = `Schedina Sostitutiva (Preso Over ${k} + restanti ${remainingUnderAfterThis} Under${hasBooster ? ' + Booster' : ''})`;
        currentActiveTicketDesc = activeTicketDesc;
      }
    }

    const potentialGrossWin = Number((stake * finalOdds).toFixed(2));
    const potentialNetProfit = Number((potentialGrossWin - (cumulativeCost + stake)).toFixed(2));

    timeline.push({
      step: k,
      matchIndex: k,
      timeSlot,
      matchLabel: `Partita #${k}`,
      activeTicketType,
      activeTicketDesc,
      coverageTicketDesc: coverageDesc,
      eventsInCoverage: effectiveEventsInCoverage,
      hasBooster,
      rawOdds: Number(rawOdds.toFixed(2)),
      bonusPercentage: bonus,
      finalOddsWithBonus: Number(finalOdds.toFixed(2)),
      stake,
      stepTargetProfit: stepTarget,
      cumulativeCostSoFar: Number(cumulativeCost.toFixed(2)),
      potentialGrossWin,
      potentialNetProfit,
      matchOutcome: outcome,
      status,
    });
  }

  // Determine overall simulation status
  const allResolved = matchOutcomes.every((o) => o !== 'PENDING');
  let simulationStatus: 'IN_PROGRESS' | 'WON' | 'LOST' = 'IN_PROGRESS';
  let finalPayout = 0;
  let finalNet = 0;

  if (allResolved) {
    simulationStatus = 'WON';
    finalPayout = winningAmount > 0 ? winningAmount : baseGrossWin;
    finalNet = Number((finalPayout - cumulativeCost).toFixed(2));
  }

  return {
    timeline,
    currentActiveTicketDesc,
    totalSpentSoFar: Number(cumulativeCost.toFixed(2)),
    simulationStatus,
    finalPayout,
    finalNet,
  };
}

/**
 * Calculates binomial distribution for N events
 */
export function calculateBinomialRisk(totalEvents: number, underOdds: number, overOdds: number) {
  const pUnderRaw = 1 / underOdds;
  const pOverRaw = 1 / overOdds;
  const totalRaw = pUnderRaw + pOverRaw;
  const pUnder = pUnderRaw / totalRaw;
  const pOver = pOverRaw / totalRaw;

  const p0 = Math.pow(pUnder, totalEvents);
  const p1 = totalEvents * pOver * Math.pow(pUnder, totalEvents - 1);
  const p2Plus = Math.max(0, 1 - (p0 + p1));

  return {
    pUnder: Number((pUnder * 100).toFixed(1)),
    pOver: Number((pOver * 100).toFixed(1)),
    pZeroErrors: Number((p0 * 100).toFixed(1)),
    pOneError: Number((p1 * 100).toFixed(1)),
    pMultipleErrors: Number((p2Plus * 100).toFixed(1)),
    bookmakerMargin: Number(((totalRaw - 1) * 100).toFixed(2)),
  };
}

/**
 * Simulates a specific scenario outcome
 */
export function evaluateScenario(
  outcomes: ('UNDER' | 'OVER')[],
  steps: StepCalculation[],
  baseStake: number,
  baseOdds: number
) {
  const overIndices: number[] = [];
  outcomes.forEach((out, idx) => {
    if (out === 'OVER') overIndices.push(idx + 1);
  });

  const totalOver = overIndices.length;
  const totalCost = baseStake + steps.reduce((sum, s) => sum + s.stake, 0);

  if (totalOver === 0) {
    const grossWin = Number((baseStake * baseOdds).toFixed(2));
    const net = Number((grossWin - totalCost).toFixed(2));
    return {
      status: 'WIN_BASE' as const,
      winningTicket: 'Multipla Iniziale (Tutti Under)',
      grossWin,
      totalCost,
      netProfit: net,
      description: `Tutti gli ${outcomes.length} eventi sono terminati UNDER 3.5. La multipla principale è vincente.`,
    };
  }

  if (totalOver === 1) {
    const errorMatch = overIndices[0];
    const matchingStep = steps.find((s) => s.step === errorMatch);

    if (matchingStep) {
      const grossWin = matchingStep.grossWin;
      const net = Number((grossWin - totalCost).toFixed(2));
      return {
        status: 'WIN_COVERAGE' as const,
        winningTicket: `Copertura #${matchingStep.step} (Match ${errorMatch} Over)`,
        grossWin,
        totalCost,
        netProfit: net,
        description: `Esattamente 1 partita (Match #${errorMatch}) è terminata OVER 3.5. La Copertura #${matchingStep.step} ha pagato la vincita.`,
      };
    }
  }

  return {
    status: 'CATASTROPHIC_LOSS' as const,
    winningTicket: 'Nessuna (Tutte le schedine perse)',
    grossWin: 0,
    totalCost,
    netProfit: -totalCost,
    description: `Si sono verificati ${totalOver} eventi OVER 3.5 (Match ${overIndices.join(', ')}). La multipla iniziale e TUTTE le coperture sono saltate contemporaneamente. Perdita del 100% del capitale.`,
  };
}

export const REAL_SERIE_A_3_MATCHES: UserMatch[] = [
  {
    id: 'sa3_1',
    order: 1,
    timeSlot: 'Oggi Dom 06 Set 15:00',
    homeTeam: 'Frosinone',
    awayTeam: 'Venezia',
    underOdds: 1.26,
    overOdds: 3.50,
    outcome: 'PENDING',
    note: 'Serie A 3ª Giornata (Stadio Stirpe)',
  },
  {
    id: 'sa3_2',
    order: 2,
    timeSlot: 'Oggi Dom 06 Set 15:00',
    homeTeam: 'Parma',
    awayTeam: 'Monza',
    underOdds: 1.30,
    overOdds: 3.20,
    outcome: 'PENDING',
    note: 'Serie A 3ª Giornata (Stadio Tardini)',
  },
  {
    id: 'sa3_3',
    order: 3,
    timeSlot: 'Oggi Dom 06 Set 18:00',
    homeTeam: 'Bologna',
    awayTeam: 'Sassuolo',
    underOdds: 1.32,
    overOdds: 3.05,
    outcome: 'PENDING',
    note: 'Serie A 3ª Giornata (Dall\'Ara)',
  },
  {
    id: 'sa3_4',
    order: 4,
    timeSlot: 'Oggi Dom 06 Set 20:45',
    homeTeam: 'Juventus',
    awayTeam: 'Milan',
    underOdds: 1.38,
    overOdds: 2.85,
    outcome: 'PENDING',
    note: 'Serie A 3ª Giornata (Allianz Stadium - Big Match)',
  },
  {
    id: 'sa3_5',
    order: 5,
    timeSlot: 'Domani Lun 07 Set 18:30',
    homeTeam: 'Cagliari',
    awayTeam: 'Lecce',
    underOdds: 1.24,
    overOdds: 3.75,
    outcome: 'PENDING',
    note: 'Serie A 3ª Giornata (Unipol Domus)',
  },
  {
    id: 'sa3_6',
    order: 6,
    timeSlot: 'Domani Lun 07 Set 20:45',
    homeTeam: 'Udinese',
    awayTeam: 'Lazio',
    underOdds: 1.31,
    overOdds: 3.15,
    outcome: 'PENDING',
    note: 'Serie A 3ª Giornata (Bluenergy Stadium)',
  },
  {
    id: 'sa3_7',
    order: 7,
    timeSlot: 'Ven 11 Set 20:45',
    homeTeam: 'Venezia',
    awayTeam: 'Fiorentina',
    underOdds: 1.29,
    overOdds: 3.30,
    outcome: 'PENDING',
    note: 'Serie A 4ª Giornata (Penzo)',
  },
  {
    id: 'sa3_8',
    order: 8,
    timeSlot: 'Sab 12 Set 18:00',
    homeTeam: 'Lazio',
    awayTeam: 'Milan',
    underOdds: 1.36,
    overOdds: 2.95,
    outcome: 'PENDING',
    note: 'Serie A 4ª Giornata (Olimpico - Big Match)',
  },
];

export const REAL_SERIE_A_4_MATCHES: UserMatch[] = [
  {
    id: 'sa4_1',
    order: 1,
    timeSlot: 'Ven 11 Set 20:45',
    homeTeam: 'Venezia',
    awayTeam: 'Fiorentina',
    underOdds: 1.29,
    overOdds: 3.30,
    outcome: 'PENDING',
    note: 'Serie A 4ª Giornata (Penzo)',
  },
  {
    id: 'sa4_2',
    order: 2,
    timeSlot: 'Sab 12 Set 15:00',
    homeTeam: 'Genoa',
    awayTeam: 'Frosinone',
    underOdds: 1.25,
    overOdds: 3.65,
    outcome: 'PENDING',
    note: 'Serie A 4ª Giornata (Marassi)',
  },
  {
    id: 'sa4_3',
    order: 3,
    timeSlot: 'Sab 12 Set 18:00',
    homeTeam: 'Lazio',
    awayTeam: 'Milan',
    underOdds: 1.36,
    overOdds: 2.95,
    outcome: 'PENDING',
    note: 'Serie A 4ª Giornata (Olimpico)',
  },
  {
    id: 'sa4_4',
    order: 4,
    timeSlot: 'Sab 12 Set 20:45',
    homeTeam: 'Atalanta',
    awayTeam: 'Cagliari',
    underOdds: 1.40,
    overOdds: 2.75,
    outcome: 'PENDING',
    note: 'Serie A 4ª Giornata (Gewiss Stadium)',
  },
  {
    id: 'sa4_5',
    order: 5,
    timeSlot: 'Dom 13 Set 12:30',
    homeTeam: 'Torino',
    awayTeam: 'Roma',
    underOdds: 1.27,
    overOdds: 3.45,
    outcome: 'PENDING',
    note: 'Serie A 4ª Giornata (Olimpico Grande Torino)',
  },
  {
    id: 'sa4_6',
    order: 6,
    timeSlot: 'Dom 13 Set 15:00',
    homeTeam: 'Como',
    awayTeam: 'Parma',
    underOdds: 1.30,
    overOdds: 3.20,
    outcome: 'PENDING',
    note: 'Serie A 4ª Giornata (Sinigaglia)',
  },
  {
    id: 'sa4_7',
    order: 7,
    timeSlot: 'Dom 13 Set 18:00',
    homeTeam: 'Napoli',
    awayTeam: 'Bologna',
    underOdds: 1.33,
    overOdds: 3.05,
    outcome: 'PENDING',
    note: 'Serie A 4ª Giornata (Maradona)',
  },
  {
    id: 'sa4_8',
    order: 8,
    timeSlot: 'Dom 13 Set 20:45',
    homeTeam: 'Sassuolo',
    awayTeam: 'Juventus',
    underOdds: 1.35,
    overOdds: 2.95,
    outcome: 'PENDING',
    note: 'Serie A 4ª Giornata (Mapei Stadium)',
  },
];

export const REAL_CHAMPIONS_LEAGUE_MATCHES: UserMatch[] = [
  {
    id: 'ucl_1',
    order: 1,
    timeSlot: 'Mar 15 Set 18:45',
    homeTeam: 'Juventus',
    awayTeam: 'PSV',
    underOdds: 1.36,
    overOdds: 2.95,
    outcome: 'PENDING',
    note: 'Champions League - 1ª Giornata (Allianz Stadium)',
  },
  {
    id: 'ucl_2',
    order: 2,
    timeSlot: 'Mar 15 Set 21:00',
    homeTeam: 'Milan',
    awayTeam: 'Liverpool',
    underOdds: 1.42,
    overOdds: 2.70,
    outcome: 'PENDING',
    note: 'Champions League - 1ª Giornata (San Siro)',
  },
  {
    id: 'ucl_3',
    order: 3,
    timeSlot: 'Mar 15 Set 21:00',
    homeTeam: 'Real Madrid',
    awayTeam: 'Stoccarda',
    underOdds: 1.48,
    overOdds: 2.50,
    outcome: 'PENDING',
    note: 'Champions League - 1ª Giornata (Bernabéu)',
  },
  {
    id: 'ucl_4',
    order: 4,
    timeSlot: 'Mer 16 Set 21:00',
    homeTeam: 'Manchester City',
    awayTeam: 'Inter',
    underOdds: 1.40,
    overOdds: 2.80,
    outcome: 'PENDING',
    note: 'Champions League - 1ª Giornata (Etihad)',
  },
  {
    id: 'ucl_5',
    order: 5,
    timeSlot: 'Mer 16 Set 21:00',
    homeTeam: 'PSG',
    awayTeam: 'Girona',
    underOdds: 1.45,
    overOdds: 2.60,
    outcome: 'PENDING',
    note: 'Champions League - 1ª Giornata (Parc des Princes)',
  },
  {
    id: 'ucl_6',
    order: 6,
    timeSlot: 'Gio 17 Set 21:00',
    homeTeam: 'Atalanta',
    awayTeam: 'Arsenal',
    underOdds: 1.36,
    overOdds: 2.95,
    outcome: 'PENDING',
    note: 'Champions League - 1ª Giornata (Gewiss Stadium)',
  },
  {
    id: 'ucl_7',
    order: 7,
    timeSlot: 'Gio 17 Set 21:00',
    homeTeam: 'Atletico Madrid',
    awayTeam: 'RB Lipsia',
    underOdds: 1.32,
    overOdds: 3.10,
    outcome: 'PENDING',
    note: 'Champions League - 1ª Giornata (Metropolitano)',
  },
  {
    id: 'ucl_8',
    order: 8,
    timeSlot: 'Gio 17 Set 21:00',
    homeTeam: 'Monaco',
    awayTeam: 'Barcellona',
    underOdds: 1.44,
    overOdds: 2.65,
    outcome: 'PENDING',
    note: 'Champions League - 1ª Giornata (Stade Louis II)',
  },
];

// Aliases for compatibility
export const REAL_SERIE_A_28_MATCHES: UserMatch[] = REAL_SERIE_A_3_MATCHES;
export const REAL_SERIE_A_29_MATCHES: UserMatch[] = REAL_SERIE_A_4_MATCHES;

export const DEFAULT_SERIE_A_MATCHES: UserMatch[] = REAL_SERIE_A_3_MATCHES;

export interface CustomSlipsResult {
  motherSlip: GeneratedSlip;
  coverageSlips: GeneratedSlip[];
  totalInvestedSoFar: number;
  maxPotentialExposure: number;
  currentActiveSlipCode: string;
  hasOverOccurred: boolean;
  firstOverIndex: number | null;
  overallStatus: 'IN_PLAY' | 'WON_MOTHER' | 'WON_COVERAGE' | 'LOST_MULTIPLE_OVERS';
  winningSlipCode: string | null;
  netGainRealized: number | null;
}

export function generateCustomSlips(
  matches: UserMatch[],
  baseStake: number,
  targetProfit: number,
  asymmetricMode: AsymmetricMode = 'flat',
  enableBooster: boolean = false,
  boosterOdds: number = 1.10,
  boosterThresholdEvents: number = 4
): CustomSlipsResult {
  const N = matches.length;
  if (N === 0) {
    const emptySlip: GeneratedSlip = {
      id: 's0',
      step: 0,
      type: 'MOTHER',
      title: 'Schedina Madre (Nessuna Partita)',
      code: 'S0',
      timing: 'Non definita',
      items: [],
      eventCount: 0,
      rawMultiplier: 1,
      bonusPercentage: 0,
      finalMultiplier: 1,
      stake: baseStake,
      targetProfit,
      cumulativeCost: baseStake,
      potentialGrossPayout: 0,
      potentialNetProfit: 0,
      status: 'PENDING',
    };
    return {
      motherSlip: emptySlip,
      coverageSlips: [],
      totalInvestedSoFar: baseStake,
      maxPotentialExposure: baseStake,
      currentActiveSlipCode: 'S0',
      hasOverOccurred: false,
      firstOverIndex: null,
      overallStatus: 'IN_PLAY',
      winningSlipCode: null,
      netGainRealized: null,
    };
  }

  // 1. Schedina Madre S0 (Tutti UNDER 3.5 con quote reali di ogni partita)
  const motherItems: GeneratedSlipItem[] = matches.map((m) => ({
    matchId: m.id,
    matchOrder: m.order,
    homeTeam: m.homeTeam,
    awayTeam: m.awayTeam,
    timeSlot: m.timeSlot,
    market: 'UNDER 3.5',
    odds: Number(m.underOdds) || 1.30,
  }));

  const motherRawMultiplier = motherItems.reduce((acc, it) => acc * it.odds, 1);
  const motherBonus = getBonusPercentage(N);
  const motherFinalMultiplier = Number((motherRawMultiplier * (1 + motherBonus / 100)).toFixed(2));
  const motherGross = Number((baseStake * motherFinalMultiplier).toFixed(2));
  const motherNet = Number((motherGross - baseStake).toFixed(2));

  // Determine game state from match outcomes
  const firstOverIdx = matches.findIndex((m) => m.outcome === 'OVER');
  const hasOver = firstOverIdx !== -1;
  const countOvers = matches.filter((m) => m.outcome === 'OVER').length;
  const allResolved = matches.every((m) => m.outcome !== 'PENDING');
  const allUnder = allResolved && !hasOver;

  let motherStatus: 'PENDING' | 'ACTIVE' | 'WON' | 'LOST' = 'ACTIVE';
  if (allUnder) {
    motherStatus = 'WON';
  } else if (hasOver) {
    motherStatus = 'LOST';
  }

  const motherSlip: GeneratedSlip = {
    id: 'slip-mother',
    step: 0,
    type: 'MOTHER',
    title: `Schedina Madre (${N} Match UNDER 3.5)`,
    code: 'S0',
    timing: `Piazzare prima del Match 1 (${matches[0]?.timeSlot || 'Inizio'})`,
    items: motherItems,
    eventCount: N,
    rawMultiplier: Number(motherRawMultiplier.toFixed(2)),
    bonusPercentage: motherBonus,
    finalMultiplier: motherFinalMultiplier,
    stake: baseStake,
    targetProfit: motherNet,
    cumulativeCost: baseStake,
    potentialGrossPayout: motherGross,
    potentialNetProfit: motherNet,
    status: motherStatus,
  };

  // 2. Generazione Coperture C1 .. Cn
  const coverageSlips: GeneratedSlip[] = [];
  let runningCumulativeCost = baseStake;

  for (let k = 1; k <= N; k++) {
    const matchIdx = k - 1;
    const currentMatch = matches[matchIdx];
    const isFinalSingle = k === N;

    const stepTarget = getStepTargetProfit(k, N, targetProfit, asymmetricMode);

    const items: GeneratedSlipItem[] = [];

    // Current match is OVER 3.5 with its specific overOdds
    items.push({
      matchId: currentMatch.id,
      matchOrder: currentMatch.order,
      homeTeam: currentMatch.homeTeam,
      awayTeam: currentMatch.awayTeam,
      timeSlot: currentMatch.timeSlot,
      market: 'OVER 3.5',
      odds: Number(currentMatch.overOdds) || 3.0,
    });

    // Subsequent matches are UNDER 3.5 with their specific underOdds
    for (let j = k; j < N; j++) {
      const nextMatch = matches[j];
      items.push({
        matchId: nextMatch.id,
        matchOrder: nextMatch.order,
        homeTeam: nextMatch.homeTeam,
        awayTeam: nextMatch.awayTeam,
        timeSlot: nextMatch.timeSlot,
        market: 'UNDER 3.5',
        odds: Number(nextMatch.underOdds) || 1.30,
      });
    }

    const baseEventCount = items.length;
    const shouldAddBooster = Boolean(enableBooster && baseEventCount <= boosterThresholdEvents);

    if (shouldAddBooster) {
      items.push({
        matchId: `booster-k${k}`,
        matchOrder: 99,
        homeTeam: 'Evento Booster',
        awayTeam: '(1X / Doppia Chance)',
        timeSlot: currentMatch.timeSlot,
        market: 'BOOSTER 1X/12',
        odds: boosterOdds,
      });
    }

    const rawMultiplier = items.reduce((acc, it) => acc * it.odds, 1);
    const bonus = getBonusPercentage(items.length);
    const finalMultiplier = Number((rawMultiplier * (1 + bonus / 100)).toFixed(2));

    // Dutching stake: covers all previous costs + step target
    let rawStake = 0;
    if (finalMultiplier > 1) {
      rawStake = (runningCumulativeCost + stepTarget) / (finalMultiplier - 1);
    } else {
      rawStake = 10;
    }
    const stake = roundToFiftyCents(rawStake);

    const potentialGrossPayout = Number((stake * finalMultiplier).toFixed(2));
    const potentialNetProfit = Number((potentialGrossPayout - (runningCumulativeCost + stake)).toFixed(2));

    // Status evaluation based on match outcomes
    let slipStatus: 'PENDING' | 'ACTIVE' | 'WON' | 'LOST' = 'PENDING';

    if (currentMatch.outcome === 'OVER') {
      if (firstOverIdx === matchIdx) {
        slipStatus = 'WON';
      } else {
        slipStatus = 'LOST';
      }
    } else if (currentMatch.outcome === 'UNDER') {
      slipStatus = 'LOST';
    } else {
      // Current match is PENDING
      if (!hasOver) {
        // No over has happened yet
        const earlierMatchesResolved = matches.slice(0, matchIdx).every((m) => m.outcome === 'UNDER');
        if (earlierMatchesResolved) {
          slipStatus = 'ACTIVE';
        }
      }
    }

    coverageSlips.push({
      id: `slip-c${k}`,
      step: k,
      type: isFinalSingle ? 'FINAL_SINGLE' : 'COVERAGE',
      title: isFinalSingle
        ? `Singola Finale Chiusura (${currentMatch.homeTeam} - ${currentMatch.awayTeam})`
        : `Copertura C${k} (${currentMatch.homeTeam} - ${currentMatch.awayTeam} OVER + Restanti UNDER)`,
      code: `C${k}`,
      timing: `Piazzare prima di ${currentMatch.homeTeam} - ${currentMatch.awayTeam} (${currentMatch.timeSlot})`,
      items,
      eventCount: items.length,
      rawMultiplier: Number(rawMultiplier.toFixed(2)),
      bonusPercentage: bonus,
      finalMultiplier,
      stake,
      targetProfit: stepTarget,
      cumulativeCost: Number(runningCumulativeCost.toFixed(2)),
      potentialGrossPayout,
      potentialNetProfit,
      status: slipStatus,
    });

    // Update running cumulative cost for next step
    runningCumulativeCost = Number((runningCumulativeCost + stake).toFixed(2));
  }

  // Calculate actual invested so far based on resolved/active matches
  let actualInvestedSoFar = baseStake;
  coverageSlips.forEach((s) => {
    if (s.status === 'WON' || s.status === 'LOST' || s.status === 'ACTIVE') {
      actualInvestedSoFar += s.stake;
    }
  });

  // Determine active code
  let currentActiveSlipCode = 'S0';
  const activeCoverage = coverageSlips.find((s) => s.status === 'ACTIVE');
  if (activeCoverage) {
    currentActiveSlipCode = activeCoverage.code;
  }

  let overallStatus: 'IN_PLAY' | 'WON_MOTHER' | 'WON_COVERAGE' | 'LOST_MULTIPLE_OVERS' = 'IN_PLAY';
  let winningSlipCode: string | null = null;
  let netGainRealized: number | null = null;

  if (allUnder) {
    overallStatus = 'WON_MOTHER';
    winningSlipCode = 'S0';
    // Mother payout minus all actual placed stakes
    netGainRealized = Number((motherGross - actualInvestedSoFar).toFixed(2));
  } else if (hasOver) {
    if (countOvers === 1) {
      overallStatus = 'WON_COVERAGE';
      winningSlipCode = `C${firstOverIdx + 1}`;
      const winningSlip = coverageSlips[firstOverIdx];
      netGainRealized = winningSlip ? winningSlip.potentialNetProfit : 0;
    } else {
      overallStatus = 'LOST_MULTIPLE_OVERS';
      netGainRealized = -actualInvestedSoFar;
    }
  }

  return {
    motherSlip,
    coverageSlips,
    totalInvestedSoFar: Number(actualInvestedSoFar.toFixed(2)),
    maxPotentialExposure: Number(runningCumulativeCost.toFixed(2)),
    currentActiveSlipCode,
    hasOverOccurred: hasOver,
    firstOverIndex: firstOverIdx,
    overallStatus,
    winningSlipCode,
    netGainRealized,
  };
}

