import { solveMatrix, type MatrixSolution } from './matrix';
import type { Book, UserMatch } from '../types';

// M4 — GATE DI RE-QUOTING PRE-PIAZZAMENTO + VALIDITA' EXCHANGE.
//
// Il dutching e' calcolato su quote stimate (workbench/feed). Se al momento di
// piazzare le quote osservate sono peggiori, la garanzia mai-perdita e' NULLA.
// Questo gate va eseguito con le quote OSSERVATE subito prima di ogni
// piazzamento (copertura o banca): si piazza SOLO se ok:true, altrimenti STOP.
// Il piazzamento resta manuale (scope F5); il gate e' il semaforo certificato.
//
// Secondo controllo: la banca B e' dimensionata con arrotondi stile bookmaker
// (0.50€), ma l'exchange impone minimo ~2€ e tick di prezzo. Il gate
// ri-snappa B al valido eseguibile e RIVERIFICA i netti con la liability
// reale: se lo snap mangia il margine, STOP (mai piazzare "quasi verde").

export const EXCHANGE_MIN_STAKE = 2;

// Tick di prezzo Betfair (soglia -> passo): prezzo valido = multiplo del passo
// della fascia. Fasce ufficiali: <2: 0.01, 2-3: 0.02, 3-4: 0.05, 4-6: 0.1,
// 6-10: 0.2, 10-20: 0.5, 20-30: 1, 30-50: 2, 50-100: 5, >=100: 10.
const EXCHANGE_TICKS: [number, number][] = [
  [2, 0.01],
  [3, 0.02],
  [4, 0.05],
  [6, 0.1],
  [10, 0.2],
  [20, 0.5],
  [30, 1],
  [50, 2],
  [100, 5],
  [Number.POSITIVE_INFINITY, 10],
];

function tickStep(price: number): number {
  for (const [limit, step] of EXCHANGE_TICKS) {
    if (price < limit) {
      return step;
    }
  }
  return 10;
}

// Prezzo lay offerto -> prezzo eseguibile CONSERVATIVO (snap UP: bancare a una
// quota piu' alta costa di piu', quindi la verifica col prezzo snappato e'
// pessimistica e sicura). Prezzi gia' su tick restano invariati.
export function snapLayPriceUp(price: number): number {
  if (!(price > 1)) {
    return price;
  }
  const step = tickStep(price);
  const snapped = Math.ceil(price / step - 1e-9) * step;
  return Number(snapped.toFixed(2));
}

// Stake banca -> stake eseguibile (minimo exchange + centesimo).
export function snapExchangeStakeUp(stake: number, minStake = EXCHANGE_MIN_STAKE): number {
  return Number(Math.max(minStake, Math.ceil(stake * 100 - 1e-9) / 100).toFixed(2));
}

export interface RequoteParams {
  matches: UserMatch[]; // scala con quote OSSERVATE ora (non stimate)
  baseStake: number;
  targetProfit?: number; // target fisso (modo fixed)
  targetMode?: 'fixed' | 'roi';
  roiPct?: number; // es. 4 (modo roi)
  baseCap?: number; // tetto S0 (es. 10)
  layCommissionPct?: number; // default 4.5
  layQuoteObserved?: number; // prezzo lay offerto ORA (default: Under ultimo osservato)
  finaleModes?: ('lay' | 'book')[];
  book?: Book;
  minExchangeStake?: number; // default 2
}

export type RequoteReason =
  'layQuote' | 'dutch' | 'mother' | 'quota' | 'budget' | 'cap' | 'terms' | 'exchange' | null;

export type RequoteVerdict =
  | { ok: true; solution: MatrixSolution; layExecPrice: number; layExecStake: number; note: string }
  | { ok: false; reason: RequoteReason; detail: string; solution: MatrixSolution | null };

export function requoteGate(p: RequoteParams): RequoteVerdict {
  const n = p.matches.length;
  if (n < 2) {
    return {
      ok: false,
      reason: null,
      detail: 'Scala troppo corta per il relay (min 2 eventi).',
      solution: null,
    };
  }
  const comm = p.layCommissionPct ?? 4.5;
  const c = Math.min(0.2, Math.max(0, comm / 100));
  const lastUnder = Number(p.matches[n - 1].underOdds) || 0;
  const layObserved = p.layQuoteObserved !== undefined ? p.layQuoteObserved : lastUnder;
  const layExecPrice = snapLayPriceUp(layObserved);
  const modes = p.finaleModes ?? (['lay', 'book'] as ('lay' | 'book')[]);
  const sol = solveMatrix({
    matches: p.matches,
    baseStake: p.baseStake,
    targetProfit: p.targetProfit ?? 45,
    layCommissionPct: comm,
    layQuote: layExecPrice,
    finaleModes: modes,
    targetMode: p.targetMode,
    roiPct: p.roiPct,
    baseCap: p.baseCap,
    book: p.book,
  });
  if (!sol || !sol.feasible) {
    const reason = (sol?.reason ?? null) as RequoteReason;
    // L'hint Lmax vale SOLO per reason layQuote (e' la condizione kS<1): con
    // reason mother la madre non copre il leverage e la Lmax da S sarebbe un
    // consiglio insufficiente (serve madre piu' pagante o lay molto piu' bassa).
    let hint: string;
    if (reason === 'layQuote' && sol && sol.maxLayQuote > 0) {
      hint = ` Prezzo lay massimo che chiude: @${sol.maxLayQuote.toFixed(2)} (offerto @${layExecPrice.toFixed(2)}): attendi l'in-play o accorcia la scala.`;
    } else if (reason === 'mother') {
      hint =
        ' Il ramo madre non copre il costo della scala a questo leverage: servono madre piu' +
        ' pagante (quote alte), lay piu bassa (banca meno cara) o scala piu corta.';
    } else {
      hint = ' Accorcia la scala, cerca quote migliori o abbassa il target.';
    }
    return {
      ok: false,
      reason,
      detail: `STOP: la scala NON verifica alle quote osservate (motivo: ${reason ?? 'n/d'}). Non piazzare.${hint}`,
      solution: sol,
    };
  }
  // Soluzione dutch fattibile alle quote osservate. Se chiude in lay, la banca
  // va ri-snappata ai vincoli exchange e i netti riverificati con la liability
  // reale (sempre stretti, in qualunque modo: il gate e' il checkpoint finale).
  if (sol.finaleMode === 'lay') {
    const minStake = p.minExchangeStake ?? EXCHANGE_MIN_STAKE;
    const plannedBank = sol.stakes[sol.stakes.length - 1] ?? 0;
    const layExecStake = snapExchangeStakeUp(plannedBank, minStake);
    const liabExec = Number((layExecStake * (layExecPrice - 1)).toFixed(2));
    const bookStakes = sol.bookStakes;
    const tGate =
      p.targetMode === 'roi' && (p.roiPct ?? 0) > 0
        ? Number((((p.roiPct as number) / 100) * (bookStakes + liabExec)).toFixed(2))
        : (p.targetProfit ?? 45);
    const layWinExec = Number((layExecStake * (1 - c)).toFixed(2));
    const overNet = Number((layWinExec - bookStakes).toFixed(2));
    const motherNet = Number((sol.motherGross - bookStakes - liabExec).toFixed(2));
    // Rami book (S0 + coperture, banca esclusa): payout - I - liability reale.
    const bookBranchNets = sol.branches
      .filter((b) => b.code !== `C${sol.n}`)
      .map((b) => Number((b.payout - bookStakes - liabExec).toFixed(2)));
    const worst = Math.min(overNet, motherNet, ...bookBranchNets);
    if (!(worst >= tGate - 1e-9)) {
      return {
        ok: false,
        reason: 'exchange',
        detail: `STOP: lo snap exchange (banca €${plannedBank.toFixed(2)} -> €${layExecStake.toFixed(2)} eseguibili) mangia il margine: ramo peggiore €${worst.toFixed(2)} contro target €${tGate.toFixed(2)}. Non piazzare.`,
        solution: sol,
      };
    }
    return {
      ok: true,
      solution: sol,
      layExecPrice,
      layExecStake,
      note: `VIA LIBERA: ogni ramo chiude >= €${tGate.toFixed(2)} ai prezzi osservati. Banca €${layExecStake.toFixed(2)} @${layExecPrice.toFixed(2)} (resp. €${liabExec.toFixed(2)}).`,
    };
  }
  // Chiusura book: niente vincoli exchange, la verifica stretta del motore basta.
  return {
    ok: true,
    solution: sol,
    layExecPrice: 0,
    layExecStake: 0,
    note: `VIA LIBERA (punta/punta): ogni ramo chiude >= €${(sol.equalizedNet ?? 0).toFixed(2)} alle quote osservate.`,
  };
}
