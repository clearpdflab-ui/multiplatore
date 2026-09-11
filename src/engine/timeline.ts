import { ModelParameters, SequentialStepState } from '../types';
import { getBonusPercentage } from './bonus';
import { roundToFiftyCents, getStepTargetProfit } from './dutching';

export function buildSequentialTimeline(
  params: ModelParameters,
  matchOutcomes: ('UNDER' | 'OVER' | 'PENDING')[],
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
    boosterOdds = 1.1,
    boosterThresholdEvents = 4,
    asymmetricMode = 'flat',
  } = params;
  const timeline: SequentialStepState[] = [];
  let cumulativeCost = baseStake;
  let activeTicketType: 'MAIN' | 'REPLACEMENT' = 'MAIN';
  let activeTicketDesc = `Multipla Madre (Tutti gli ${totalEvents} Under 3.5)`;
  let currentActiveTicketDesc = activeTicketDesc;

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
      finalOdds = rawOdds;
    } else if (model === 'original_sum') {
      let raw = overOdds + remainingUnderAfterThis * underOdds;
      if (hasBooster) {
        raw *= boosterOdds;
      }
      rawOdds = raw;
      finalOdds = raw;
    } else {
      let r = overOdds * Math.pow(underOdds, remainingUnderAfterThis);
      if (hasBooster) {
        r *= boosterOdds;
      }
      rawOdds = r;
      finalOdds = Number((rawOdds * (1 + bonus / 100)).toFixed(3));
    }

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
    if (outcome === 'PENDING') {
      status = 'ACTIVE';
    } else if (outcome === 'UNDER') {
      status = 'RESOLVED_UNDER';
      cumulativeCost += stake;
    } else if (outcome === 'OVER') {
      status = 'RESOLVED_OVER_SWAP';
      cumulativeCost += stake;
      if (k !== totalEvents) {
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

  const allResolved = matchOutcomes.every((o) => o !== 'PENDING');
  let simulationStatus: 'IN_PROGRESS' | 'WON' | 'LOST' = 'IN_PROGRESS';
  let finalPayout = 0;
  let finalNet = 0;
  if (allResolved) {
    // Logica "Live Relay a Scalare": ogni Over brucia la schedina attiva ma la
    // copertura piazzata su quello stesso step (Over@k + Under su TUTTI i
    // restanti) diventa la nuova schedina madre. Quindi conta solo l'ULTIMO
    // Over della sequenza: la sua copertura, per costruzione, richiedeva Under
    // su tutti i match successivi, che essendo l'ultimo Over sono infatti Under.
    let lastOverStepIdx = -1;
    matchOutcomes.forEach((o, i) => {
      if (o === 'OVER') {lastOverStepIdx = i;}
    });
    if (lastOverStepIdx === -1) {
      // Nessun Over: la multipla madre (tutti Under) è arrivata intatta a fine corsa.
      simulationStatus = 'WON';
      finalPayout = baseGrossWin;
    } else {
      // Vince la copertura piazzata sull'ultimo Over, qualunque cosa sia successo prima.
      simulationStatus = 'WON';
      finalPayout = timeline[lastOverStepIdx].potentialGrossWin;
    }
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
