import { ModelParameters } from '../types';
import { getBonusPercentage } from './bonus';
import { roundToFiftyCents, getStepTargetProfit } from './dutching';

export function calculateSteps(params: ModelParameters): any[] {
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
  const steps: any[] = [];
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
      const baseFinal = finalSingleOdds || overOdds;
      if (shouldAddBooster) {
        odds = Number((baseFinal * boosterOdds).toFixed(2));
        formulaText = `Singola Over 3.5 (${baseFinal.toFixed(2)}) × Booster (${boosterOdds.toFixed(2)}) = ${odds.toFixed(2)}`;
      } else {
        odds = baseFinal;
        formulaText = `Singola Over 3.5 (Match ${k}) = ${odds.toFixed(2)}`;
      }
    } else if (model === 'original_sum') {
      let raw = overOdds + remainingUnder * underOdds;
      if (shouldAddBooster) {
        raw *= boosterOdds;
      }
      odds = Number(raw.toFixed(2));
      formulaText = `${overOdds} + (${remainingUnder} × ${underOdds})${shouldAddBooster ? ` × ${boosterOdds}` : ''} = ${odds}`;
    } else {
      let rawOdds = overOdds * Math.pow(underOdds, remainingUnder);
      if (shouldAddBooster) {
        rawOdds *= boosterOdds;
      }
      odds = Number((rawOdds * (1 + bonus / 100)).toFixed(3));
      const boosterLabel = shouldAddBooster ? ` × Booster ${boosterOdds.toFixed(2)}` : '';
      const bonusLabel =
        bonus > 0 ? ` [+${bonus}% bonus (${effectiveEvents} ev.)]` : ' [0% bonus (<5)]';
      formulaText = `${overOdds} × (${underOdds})^${remainingUnder}${boosterLabel}${bonusLabel} = ${odds.toFixed(2)}`;
    }

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
