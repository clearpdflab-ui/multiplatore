import {
  UserMatch,
  GeneratedSlip,
  GeneratedSlipItem,
  AsymmetricMode,
  FinalHedgeMode,
} from '../types';
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
  // F15 — armonizzazione regola mai-perdita (solo finalHedgeMode lay_exchange)
  harmonization: HarmonizationInfo | null;
}

export interface LayFinaleOptions {
  layOdds?: number; // null/undefined = auto (quota Under ultimo match)
  layCommissionPct?: number; // default 5
  layStake?: number; // stake bancata manuale (>0), altrimenti sizing automatico
  harmonized?: boolean; // sizing armonizzato: OGNI esito finale >= 0
}

export interface HarmonizationInfo {
  requested: boolean; // armonizzazione richiesta (regola mai-perdita)
  feasible: boolean; // chiude a questa quota lay? (k * SOMMA(1/m) < 1)
  layQuoteUsed: number;
  kFactor: number; // (L - c) / (1 - c)
  sumInverseMultipliers: number; // SOMMA 1/m_k sulle coperture book
  maxLayQuote: number; // quota lay massima per cui il dutching chiude
  equalizedNet: number | null; // netto garantito su OGNI ramo (se feasible)
}

export function generateCustomSlips(
  matches: UserMatch[],
  baseStake: number,
  targetProfit: number,
  asymmetricMode: AsymmetricMode = 'flat',
  enableBooster: boolean = false,
  boosterOdds: number = 1.1,
  boosterThresholdEvents: number = 4,
  finalHedgeMode: FinalHedgeMode = 'book_single',
  lay?: LayFinaleOptions,
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
      realizedNetIfWon: 0,
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
      harmonization: null,
    };
  }

  const motherItems: GeneratedSlipItem[] = matches.map((m) => ({
    matchId: m.id,
    matchOrder: m.order,
    homeTeam: m.homeTeam,
    awayTeam: m.awayTeam,
    timeSlot: m.timeSlot,
    market: 'UNDER 3.5',
    odds: Number(m.underOdds) || 1.3,
  }));

  const motherRawMultiplier = motherItems.reduce((acc, it) => acc * it.odds, 1);
  const motherBonus = getBonusPercentage(N);
  const motherFinalMultiplier = Number((motherRawMultiplier * (1 + motherBonus / 100)).toFixed(2));
  const motherGross = Number((baseStake * motherFinalMultiplier).toFixed(2));
  const motherNet = Number((motherGross - baseStake).toFixed(2));

  const firstOverIdx = matches.findIndex((m) => m.outcome === 'OVER');
  const hasOver = firstOverIdx !== -1;
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
    realizedNetIfWon: 0,
    status: motherStatus,
  };

  const coverageSlips: GeneratedSlip[] = [];

  // F13: con finale in banca (lay exchange) l'ultimo step NON e' una singola
  // bookmaker: il loop costruisce solo C1..C_{N-1}, la banca C_N viene
  // dimensionata dopo (serve il payout della schedina attiva alla finale).
  const lastBookStep = finalHedgeMode === 'lay_exchange' ? N - 1 : N;

  // PASS 1 — scheletro delle coperture book: gambe, moltiplicatori (con
  // bonus/booster) e stato. Gli stake vengono assegnati DOPO (pass 2), perche'
  // il sizing armonizzato (regola mai-perdita) ha bisogno di TUTTI i
  // moltiplicatori della scala insieme, non solo del cumulato fino a k.
  for (let k = 1; k <= lastBookStep; k++) {
    const matchIdx = k - 1;
    const currentMatch = matches[matchIdx];
    const isFinalSingle = k === N;
    const stepTarget = getStepTargetProfit(k, N, targetProfit, asymmetricMode);

    const items: GeneratedSlipItem[] = [];
    items.push({
      matchId: currentMatch.id,
      matchOrder: currentMatch.order,
      homeTeam: currentMatch.homeTeam,
      awayTeam: currentMatch.awayTeam,
      timeSlot: currentMatch.timeSlot,
      market: 'OVER 3.5',
      odds: Number(currentMatch.overOdds) || 3.0,
    });
    for (let j = k; j < N; j++) {
      const nextMatch = matches[j];
      items.push({
        matchId: nextMatch.id,
        matchOrder: nextMatch.order,
        homeTeam: nextMatch.homeTeam,
        awayTeam: nextMatch.awayTeam,
        timeSlot: nextMatch.timeSlot,
        market: 'UNDER 3.5',
        odds: Number(nextMatch.underOdds) || 1.3,
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

    let slipStatus: 'PENDING' | 'ACTIVE' | 'WON' | 'LOST' = 'PENDING';
    if (currentMatch.outcome === 'OVER') {
      // Logica "Live Relay a Scalare": questa copertura vince se e solo se
      // nessun match SUCCESSIVO chiude Over (i restanti devono essere tutti
      // Under, come richiesto dalle gambe della schedina). Un Over precedente
      // non conta: quella copertura è già stata sostituita da questa.
      const laterMatches = matches.slice(matchIdx + 1);
      const laterOver = laterMatches.some((m) => m.outcome === 'OVER');
      const laterAllUnder = laterMatches.every((m) => m.outcome === 'UNDER');
      if (laterOver) {
        slipStatus = 'LOST';
      } else if (laterAllUnder) {
        slipStatus = 'WON';
      } else {
        slipStatus = 'ACTIVE';
      }
    } else if (currentMatch.outcome === 'UNDER') {
      slipStatus = 'LOST';
    } else if (!hasOver) {
      const earlierResolved = matches.slice(0, matchIdx).every((m) => m.outcome === 'UNDER');
      if (earlierResolved) {
        slipStatus = 'ACTIVE';
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
      stake: 0,
      targetProfit: stepTarget,
      cumulativeCost: 0,
      potentialGrossPayout: 0,
      potentialNetProfit: 0,
      realizedNetIfWon: 0,
      status: slipStatus,
    });
  }

  // PASS 2 — sizing delle puntate book.
  //
  // STANDARD (o fallback): recupero sequenziale, ogni C_k recupera il cumulato
  // + il suo target di step (curva asimmetrica compresa).
  //
  // F15 — ARMONIZZATO (regola mai-perdita, solo lay_exchange): tutte le
  // coperture pagano lo STESSO payout D, dimensionato cosi' che OGNI esito
  // finale (madre, qualsiasi C_k, banca se esce Over) chiuda >= target:
  //   Under@k: D - I - B(L-1) >= t      Over: B(1-c) - I >= t
  // da cui (pareggiando il ramo peggiore) B = D/(L-c) e D = k*(I+t) con
  // k = (L-c)/(1-c) (il lock estrae solo (1-c)/(L-c) del payout).
  // Con I = S0 + SOMMA s_k e s_k = D/m_k si chiude solo se
  //   k * SOMMA(1/m_k) < 1   (dutching): altrimenti l'armonizzazione e'
  // MATEMATICAMENTE impossibile a questa quota lay e l'app lo dichiara
  // (torna sizing standard + rami onesti). La quota lay massima ammessa e'
  // L_max = (1-c)/SOMMA(1/m_k) + c: sopra, serve bancare in-play quando
  // l'Under dell'ultimo match scende.
  const layOpts = lay ?? {};
  const manualLayStake = Number(layOpts.layStake) > 0 ? Number(layOpts.layStake) : null;
  const harmonizeRequested =
    finalHedgeMode === 'lay_exchange' && Boolean(layOpts.harmonized) && N > 1;
  const layQuotePlan =
    Number(layOpts.layOdds) > 1
      ? Number(layOpts.layOdds)
      : Number(matches[N - 1].underOdds) || 1.3;
  const commPlan = Math.min(0.2, Math.max(0, (Number(layOpts.layCommissionPct) || 5) / 100));
  const kFactorPlan = (layQuotePlan - commPlan) / (1 - commPlan);
  const sumInverse = coverageSlips.reduce(
    (acc, s) => acc + (s.finalMultiplier > 1 ? 1 / s.finalMultiplier : 0),
    0,
  );
  const maxLayQuote =
    sumInverse > 0 ? Number(((1 / sumInverse) * (1 - commPlan) + commPlan).toFixed(2)) : 0;
  const harmonizedFeasible =
    harmonizeRequested && kFactorPlan > 1 && kFactorPlan * sumInverse < 0.99;

  let runningCumulativeCost = baseStake;
  if (harmonizedFeasible) {
    const totalBook = (baseStake + kFactorPlan * targetProfit * sumInverse) / (1 - kFactorPlan * sumInverse);
    const commonPayout = kFactorPlan * (totalBook + targetProfit);
    coverageSlips.forEach((s) => {
      s.stake = roundToFiftyCents(commonPayout / s.finalMultiplier);
      s.cumulativeCost = Number(runningCumulativeCost.toFixed(2));
      s.potentialGrossPayout = Number((s.stake * s.finalMultiplier).toFixed(2));
      s.potentialNetProfit = Number(
        (s.potentialGrossPayout - (runningCumulativeCost + s.stake)).toFixed(2),
      );
      s.targetProfit = targetProfit;
      runningCumulativeCost = Number((runningCumulativeCost + s.stake).toFixed(2));
    });
  } else {
    coverageSlips.forEach((s) => {
      const rawStake =
        s.finalMultiplier > 1 ? (runningCumulativeCost + s.targetProfit) / (s.finalMultiplier - 1) : 10;
      s.stake = roundToFiftyCents(rawStake);
      s.cumulativeCost = Number(runningCumulativeCost.toFixed(2));
      s.potentialGrossPayout = Number((s.stake * s.finalMultiplier).toFixed(2));
      s.potentialNetProfit = Number(
        (s.potentialGrossPayout - (runningCumulativeCost + s.stake)).toFixed(2),
      );
      runningCumulativeCost = Number((runningCumulativeCost + s.stake).toFixed(2));
    });
  }

  // Netto finale REALE se una schedina vince la corsa: quando la vincente e'
  // una copertura intermedia C_k (k < N), tutte le coperture successive
  // (C_{k+1}..C_N, finale inclusa) vengono comunque piazzate dal relay e
  // perse. Il capitale totale impegnato in OGNI esito risolto e' quindi
  // maxPotentialExposure (S0 + tutte le puntate), non il solo cumulato fino
  // alla vincente. Regressione "bancata finale C7/C8": se vince C7 lo stake
  // della finale C8 e' comunque perso e va sottratto.
  //
  // F13 — Finale in banca (LAY Under 3.5 su exchange, es. Betfair):
  // la bancata viene dimensionata a GREEN-UP sullo scontro finale: se esce
  // Under vince la schedina attiva (madre o C_k dell'ultimo Over), se esce
  // Over vince la banca. Lo stake del banco B che pareggia i due rami:
  //   Under: P - I - B*(L-1)     Over: B*(1-c) - I     =>  B = P / (L - c)
  // con P = payout della schedina attiva, I = puntate bookmaker gia' fatte,
  // L = quota lay, c = commissione exchange. Entrambi i rami chiudono a
  // P*(1-c)/(L-c) - I (>=0 se la scala non ha esagerato con le puntate).
  const bookStakesTotal = runningCumulativeCost; // S0 + C1..C_{N-1}
  let layLiability = 0;
  let harmonization: HarmonizationInfo | null = null;
  if (finalHedgeMode === 'lay_exchange') {
    const finalMatch = matches[N - 1];
    // Riferimento per il sizing della banca. ARMONIZZATO (feasible): il payout
    // COMUNE D delle coperture (il peggiore per costruzione) -> garanzia su
    // OGNI ramo. STANDARD: la schedina che sarebbe ATTIMA alla finale (la C_j
    // dell'ultimo Over gia' verificato; la madre SOLO a scontro risolto; a
    // piano l'ULTIMA copertura C_{N-1}, lo scontro tipico della bancata,
    // NON il lock integrale della madre).
    let activeOverIdx = -1;
    matches.slice(0, N - 1).forEach((m, i) => {
      if (m.outcome === 'OVER') {
        activeOverIdx = i;
      }
    });
    const anyPendingBefore = N > 1 && matches.slice(0, N - 1).some((m) => m.outcome === 'PENDING');
    const lastCoverage = coverageSlips[coverageSlips.length - 1];
    const worstCoveragePayout = coverageSlips.length
      ? Math.min(...coverageSlips.map((s) => s.potentialGrossPayout))
      : motherGross;
    const activePayout = harmonizedFeasible
      ? worstCoveragePayout
      : activeOverIdx !== -1
        ? coverageSlips[activeOverIdx].potentialGrossPayout
        : anyPendingBefore && lastCoverage
          ? lastCoverage.potentialGrossPayout
          : motherGross;

    const layQuote = layQuotePlan;
    const commission = commPlan;
    const denom = layQuote - commission;
    // Stake della banca: manuale se impostato, altrimenti green-up pari
    // (B = P/(L-c) equalizza i due rami finali; in armonizzato P = payout
    // comune -> OGNI ramo chiude >= equalizedNet).
    const layStake = manualLayStake ?? roundToFiftyCents(denom > 0 ? activePayout / denom : 10);
    layLiability = Number((layStake * (layQuote - 1)).toFixed(2));
    const layWinProfit = Number((layStake * (1 - commission)).toFixed(2));

    let layStatus: 'PENDING' | 'ACTIVE' | 'WON' | 'LOST' = 'PENDING';
    if (finalMatch.outcome === 'OVER') {
      layStatus = 'WON'; // esce Over: la banca Under e' vinta
    } else if (finalMatch.outcome === 'UNDER') {
      layStatus = 'LOST';
    } else if (!hasOver) {
      const earlierResolved = matches.slice(0, N - 1).every((m) => m.outcome === 'UNDER');
      if (earlierResolved) {
        layStatus = 'ACTIVE';
      }
    }

    coverageSlips.push({
      id: `slip-c${N}`,
      step: N,
      type: 'FINAL_LAY',
      title: `Banca Finale Exchange (${finalMatch.homeTeam} - ${finalMatch.awayTeam} LAY Under 3.5)`,
      code: `C${N}`,
      timing: `Piazzare su Betfair prima di ${finalMatch.homeTeam} - ${finalMatch.awayTeam} (${finalMatch.timeSlot})`,
      items: [
        {
          matchId: finalMatch.id,
          matchOrder: finalMatch.order,
          homeTeam: finalMatch.homeTeam,
          awayTeam: finalMatch.awayTeam,
          timeSlot: finalMatch.timeSlot,
          market: 'LAY UNDER 3.5',
          odds: layQuote,
        },
      ],
      eventCount: 1,
      rawMultiplier: layQuote,
      bonusPercentage: 0,
      finalMultiplier: layQuote,
      stake: layStake,
      targetProfit: getStepTargetProfit(N, N, targetProfit, asymmetricMode),
      cumulativeCost: Number(bookStakesTotal.toFixed(2)),
      // Se esce Over la banca incassa lo stake del puntatore meno commissione
      potentialGrossPayout: layWinProfit,
      potentialNetProfit: Number((layWinProfit - bookStakesTotal).toFixed(2)),
      realizedNetIfWon: 0,
      liability: layLiability,
      commissionPct: Number((commission * 100).toFixed(2)),
      status: layStatus,
    });

    if (harmonizeRequested) {
      const overNet = layWinProfit - bookStakesTotal;
      const worstUnderNet = worstCoveragePayout - bookStakesTotal - layLiability;
      const motherBranchNet = motherGross - bookStakesTotal - layLiability;
      harmonization = {
        requested: true,
        feasible: harmonizedFeasible,
        layQuoteUsed: layQuote,
        kFactor: Number(kFactorPlan.toFixed(4)),
        sumInverseMultipliers: Number(sumInverse.toFixed(4)),
        maxLayQuote,
        equalizedNet: harmonizedFeasible
          ? Number(Math.min(overNet, worstUnderNet, motherBranchNet).toFixed(2))
          : null,
      };
    }
  }

  const totalPotentialExposure =
    finalHedgeMode === 'lay_exchange'
      ? Number((bookStakesTotal + layLiability).toFixed(2))
      : runningCumulativeCost;

  if (finalHedgeMode === 'lay_exchange') {
    // Ramo Under (vince la schedina attiva): puntate bookmaker + responsabilita'
    // della banca SE PIAZZATA (status != PENDING) o se la scala e' ARMONIZZATA
    // (la bancata e' parte del piano, va considerata fin da subito). Finche'
    // la banca non e' piazzata in modalita' standard, il "netto se vince"
    // della scala e' quello puro del relay (payout - puntate book). Ramo Over
    // (vince la banca): solo le puntate bookmaker.
    const laySlip = coverageSlips[coverageSlips.length - 1];
    const layPlaced = Boolean(laySlip && laySlip.status !== 'PENDING');
    const layLiabilityIfPlaced = layPlaced || harmonizedFeasible ? layLiability : 0;
    motherSlip.realizedNetIfWon = Number(
      (motherSlip.potentialGrossPayout - (bookStakesTotal + layLiabilityIfPlaced)).toFixed(2),
    );
    coverageSlips.forEach((s) => {
      s.realizedNetIfWon =
        s.type === 'FINAL_LAY'
          ? Number((s.potentialGrossPayout - bookStakesTotal).toFixed(2))
          : Number(
              (s.potentialGrossPayout - (bookStakesTotal + layLiabilityIfPlaced)).toFixed(2),
            );
    });
  } else {
    motherSlip.realizedNetIfWon = Number(
      (motherSlip.potentialGrossPayout - runningCumulativeCost).toFixed(2),
    );
    coverageSlips.forEach((s) => {
      s.realizedNetIfWon = Number((s.potentialGrossPayout - runningCumulativeCost).toFixed(2));
    });
  }

  // Capitale effettivo: puntate bookmaker piazzate + (banca piazzata? la sua
  // responsabilita' a rischio). La responsabilita' NON e' una puntata persa
  // se poi esce Over, quindi il ramo Over usa solo la parte bookmaker.
  let bookInvestedSoFar = baseStake;
  let layAtRisk = 0;
  coverageSlips.forEach((s) => {
    if (s.status === 'WON' || s.status === 'LOST' || s.status === 'ACTIVE') {
      if (s.type === 'FINAL_LAY') {
        layAtRisk += s.liability ?? 0;
      } else {
        bookInvestedSoFar += s.stake;
      }
    }
  });
  const actualInvestedSoFar = Number((bookInvestedSoFar + layAtRisk).toFixed(2));

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
    netGainRealized = Number((motherGross - actualInvestedSoFar).toFixed(2));
  } else if (hasOver && allResolved) {
    // "Live Relay a Scalare": vince sempre la copertura piazzata sull'ULTIMO
    // Over della sequenza, indipendentemente da quanti Over si sono verificati
    // prima (ogni Over sostituisce la schedina attiva con quella nuova).
    let lastOverIdx = -1;
    matches.forEach((m, i) => {
      if (m.outcome === 'OVER') {lastOverIdx = i;}
    });
    overallStatus = 'WON_COVERAGE';
    winningSlipCode = `C${lastOverIdx + 1}`;
    const winningSlip = coverageSlips[lastOverIdx];
    // Netto realizzato = payout della vincente meno TUTTO il capitale
    // effettivamente piazzato (incluse le coperture dopo di lei, perse).
    // Prima era winningSlip.potentialNetProfit, che ignora gli stake delle
    // coperture successive (es. la finale C8 quando vince C7): errore grave,
    // sovrastimava il netto di tutta la coda di puntate perse.
    // Se la vincente e' la BANCA (ultimo match Over): la responsabilita' non
    // viene persa ma rilasciata, quindi si sottraggono solo le puntate book.
    netGainRealized = winningSlip
      ? winningSlip.type === 'FINAL_LAY'
        ? Number((winningSlip.potentialGrossPayout - bookInvestedSoFar).toFixed(2))
        : Number((winningSlip.potentialGrossPayout - actualInvestedSoFar).toFixed(2))
      : 0;
  }

  return {
    motherSlip,
    coverageSlips,
    totalInvestedSoFar: Number(actualInvestedSoFar.toFixed(2)),
    maxPotentialExposure: Number(totalPotentialExposure.toFixed(2)),
    currentActiveSlipCode,
    hasOverOccurred: hasOver,
    firstOverIndex: firstOverIdx,
    overallStatus,
    winningSlipCode,
    netGainRealized,
    harmonization,
  };
}
