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

export function evaluateScenario(
  outcomes: ('UNDER' | 'OVER')[],
  steps: any[],
  baseStake: number,
  baseOdds: number,
) {
  const overIndices: number[] = [];
  outcomes.forEach((out, idx) => {
    if (out === 'OVER') {
      overIndices.push(idx + 1);
    }
  });
  const totalOver = overIndices.length;
  const totalCost = baseStake + steps.reduce((sum: number, s: any) => sum + s.stake, 0);

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
    const matchingStep = steps.find((s: any) => s.step === errorMatch);
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
    description: `Si sono verificati ${totalOver} eventi OVER 3.5 (Match ${overIndices.join(', ')}). La multipla iniziale e TUTTE le coperture sono saltate contemporaneamente.`,
  };
}
