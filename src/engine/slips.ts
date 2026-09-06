import { UserMatch, GeneratedSlip, GeneratedSlipItem, AsymmetricMode } from '../types';
import { getBonusPercentage } from './bonus';
import { roundToFiftyCents, getStepTargetProfit } from './dutching';

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
      id: 's0', step: 0, type: 'MOTHER',
      title: 'Schedina Madre (Nessuna Partita)', code: 'S0',
      timing: 'Non definita', items: [], eventCount: 0,
      rawMultiplier: 1, bonusPercentage: 0, finalMultiplier: 1,
      stake: baseStake, targetProfit, cumulativeCost: baseStake,
      potentialGrossPayout: 0, potentialNetProfit: 0, status: 'PENDING',
    };
    return {
      motherSlip: emptySlip, coverageSlips: [],
      totalInvestedSoFar: baseStake, maxPotentialExposure: baseStake,
      currentActiveSlipCode: 'S0', hasOverOccurred: false,
      firstOverIndex: null, overallStatus: 'IN_PLAY',
      winningSlipCode: null, netGainRealized: null,
    };
  }

  const motherItems: GeneratedSlipItem[] = matches.map((m) => ({
    matchId: m.id, matchOrder: m.order, homeTeam: m.homeTeam,
    awayTeam: m.awayTeam, timeSlot: m.timeSlot, market: 'UNDER 3.5',
    odds: Number(m.underOdds) || 1.30,
  }));

  const motherRawMultiplier = motherItems.reduce((acc, it) => acc * it.odds, 1);
  const motherBonus = getBonusPercentage(N);
  const motherFinalMultiplier = Number((motherRawMultiplier * (1 + motherBonus / 100)).toFixed(2));
  const motherGross = Number((baseStake * motherFinalMultiplier).toFixed(2));
  const motherNet = Number((motherGross - baseStake).toFixed(2));

  const firstOverIdx = matches.findIndex((m) => m.outcome === 'OVER');
  const hasOver = firstOverIdx !== -1;
  const countOvers = matches.filter((m) => m.outcome === 'OVER').length;
  const allResolved = matches.every((m) => m.outcome !== 'PENDING');
  const allUnder = allResolved && !hasOver;

  let motherStatus: 'PENDING' | 'ACTIVE' | 'WON' | 'LOST' = 'ACTIVE';
  if (allUnder) motherStatus = 'WON';
  else if (hasOver) motherStatus = 'LOST';

  const motherSlip: GeneratedSlip = {
    id: 'slip-mother', step: 0, type: 'MOTHER',
    title: `Schedina Madre (${N} Match UNDER 3.5)`, code: 'S0',
    timing: `Piazzare prima del Match 1 (${matches[0]?.timeSlot || 'Inizio'})`,
    items: motherItems, eventCount: N,
    rawMultiplier: Number(motherRawMultiplier.toFixed(2)),
    bonusPercentage: motherBonus, finalMultiplier: motherFinalMultiplier,
    stake: baseStake, targetProfit: motherNet, cumulativeCost: baseStake,
    potentialGrossPayout: motherGross, potentialNetProfit: motherNet,
    status: motherStatus,
  };

  const coverageSlips: GeneratedSlip[] = [];
  let runningCumulativeCost = baseStake;

  for (let k = 1; k <= N; k++) {
    const matchIdx = k - 1;
    const currentMatch = matches[matchIdx];
    const isFinalSingle = k === N;
    const stepTarget = getStepTargetProfit(k, N, targetProfit, asymmetricMode);

    const items: GeneratedSlipItem[] = [];
    items.push({
      matchId: currentMatch.id, matchOrder: currentMatch.order,
      homeTeam: currentMatch.homeTeam, awayTeam: currentMatch.awayTeam,
      timeSlot: currentMatch.timeSlot, market: 'OVER 3.5',
      odds: Number(currentMatch.overOdds) || 3.0,
    });
    for (let j = k; j < N; j++) {
      const nextMatch = matches[j];
      items.push({
        matchId: nextMatch.id, matchOrder: nextMatch.order,
        homeTeam: nextMatch.homeTeam, awayTeam: nextMatch.awayTeam,
        timeSlot: nextMatch.timeSlot, market: 'UNDER 3.5',
        odds: Number(nextMatch.underOdds) || 1.30,
      });
    }

    const baseEventCount = items.length;
    const shouldAddBooster = Boolean(enableBooster && baseEventCount <= boosterThresholdEvents);
    if (shouldAddBooster) {
      items.push({
        matchId: `booster-k${k}`, matchOrder: 99,
        homeTeam: 'Evento Booster', awayTeam: '(1X / Doppia Chance)',
        timeSlot: currentMatch.timeSlot, market: 'BOOSTER 1X/12',
        odds: boosterOdds,
      });
    }

    const rawMultiplier = items.reduce((acc, it) => acc * it.odds, 1);
    const bonus = getBonusPercentage(items.length);
    const finalMultiplier = Number((rawMultiplier * (1 + bonus / 100)).toFixed(2));
    let rawStake = 0;
    if (finalMultiplier > 1) {
      rawStake = (runningCumulativeCost + stepTarget) / (finalMultiplier - 1);
    } else {
      rawStake = 10;
    }
    const stake = roundToFiftyCents(rawStake);
    const potentialGrossPayout = Number((stake * finalMultiplier).toFixed(2));
    const potentialNetProfit = Number((potentialGrossPayout - (runningCumulativeCost + stake)).toFixed(2));

    let slipStatus: 'PENDING' | 'ACTIVE' | 'WON' | 'LOST' = 'PENDING';
    if (currentMatch.outcome === 'OVER') {
      if (firstOverIdx === matchIdx) slipStatus = 'WON';
      else slipStatus = 'LOST';
    } else if (currentMatch.outcome === 'UNDER') {
      slipStatus = 'LOST';
    } else if (!hasOver) {
      const earlierResolved = matches.slice(0, matchIdx).every((m) => m.outcome === 'UNDER');
      if (earlierResolved) slipStatus = 'ACTIVE';
    }

    coverageSlips.push({
      id: `slip-c${k}`, step: k,
      type: isFinalSingle ? 'FINAL_SINGLE' : 'COVERAGE',
      title: isFinalSingle
        ? `Singola Finale Chiusura (${currentMatch.homeTeam} - ${currentMatch.awayTeam})`
        : `Copertura C${k} (${currentMatch.homeTeam} - ${currentMatch.awayTeam} OVER + Restanti UNDER)`,
      code: `C${k}`,
      timing: `Piazzare prima di ${currentMatch.homeTeam} - ${currentMatch.awayTeam} (${currentMatch.timeSlot})`,
      items, eventCount: items.length,
      rawMultiplier: Number(rawMultiplier.toFixed(2)),
      bonusPercentage: bonus, finalMultiplier,
      stake, targetProfit: stepTarget,
      cumulativeCost: Number(runningCumulativeCost.toFixed(2)),
      potentialGrossPayout, potentialNetProfit,
      status: slipStatus,
    });
    runningCumulativeCost = Number((runningCumulativeCost + stake).toFixed(2));
  }

  let actualInvestedSoFar = baseStake;
  coverageSlips.forEach((s) => {
    if (s.status === 'WON' || s.status === 'LOST' || s.status === 'ACTIVE') {
      actualInvestedSoFar += s.stake;
    }
  });

  let currentActiveSlipCode = 'S0';
  const activeCoverage = coverageSlips.find((s) => s.status === 'ACTIVE');
  if (activeCoverage) currentActiveSlipCode = activeCoverage.code;

  let overallStatus: 'IN_PLAY' | 'WON_MOTHER' | 'WON_COVERAGE' | 'LOST_MULTIPLE_OVERS' = 'IN_PLAY';
  let winningSlipCode: string | null = null;
  let netGainRealized: number | null = null;

  if (allUnder) {
    overallStatus = 'WON_MOTHER';
    winningSlipCode = 'S0';
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
    motherSlip, coverageSlips,
    totalInvestedSoFar: Number(actualInvestedSoFar.toFixed(2)),
    maxPotentialExposure: Number(runningCumulativeCost.toFixed(2)),
    currentActiveSlipCode, hasOverOccurred: hasOver,
    firstOverIndex: firstOverIdx, overallStatus,
    winningSlipCode, netGainRealized,
  };
}
