import {
  UserMatch,
  GeneratedSlip,
  GeneratedSlipItem,
  AsymmetricMode,
  FinalHedgeMode,
} from '../types';
import { DEFAULT_BONUS_TABLE, DEFAULT_BOOK } from './books';
import type { Book } from '../types';
import { roundToFiftyCents, getStepTargetProfit } from './dutching';

// M1-precheck — bonus EFFETTIVO per ticket su un book dato. Il book default
// ("Main", overEligible) mantiene il comportamento storico; i book che
// escludono le gambe Over dal bonus non lo riconoscono sulle coperture
// (la prima gamba di ogni copertura e' sempre Over per costruzione).
// N<5 -> 0% su qualunque book. Il controllo leghe/competizioni e' escluso:
// UserMatch non porta la lega (rischio residuo documentato, stress S6).
function effectiveBonus(book: Book | undefined, nLegs: number, hasOverLeg: boolean): number {
  const b = book ?? DEFAULT_BOOK;
  if (nLegs < 5) {
    return 0;
  }
  if (hasOverLeg && b.overEligible === false) {
    return 0;
  }
  const table = b.bonusTable ?? DEFAULT_BONUS_TABLE;
  const raw = table[nLegs] ?? 0;
  return Math.min(raw, b.bonusCap);
}

// F17: partita con flag firstHalfOnly -> le sue gambe usano il mercato del
// PRIMO TEMPO (le quote sono quelle inserite a mano nel workbench).
// F26: linea Totals variabile (1.5/2.5/3.5/4.5).
function legMarket(
  m: UserMatch,
  base: 'UNDER' | 'OVER',
  line: number,
): GeneratedSlipItem['market'] {
  const label = `${base} ${line}`;
  return m.firstHalfOnly
    ? (`${label} 1T` as GeneratedSlipItem['market'])
    : (label as GeneratedSlipItem['market']);
}

function layMarket(m: UserMatch, line: number): GeneratedSlipItem['market'] {
  const label = `LAY UNDER ${line}`;
  return m.firstHalfOnly
    ? (`${label} 1T` as GeneratedSlipItem['market'])
    : (label as GeneratedSlipItem['market']);
}

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

// F15/F20 — armonizzazione regola mai-perdita (lay_exchange o book_single)
export interface LayFinaleOptions {
  layOdds?: number; // null/undefined = auto (quota Under ultimo match)
  layCommissionPct?: number; // default 4.5 (fee exchange utente)
  layStake?: number; // stake bancata manuale (>0), altrimenti sizing automatico
  harmonized?: boolean; // sizing armonizzato: OGNI esito finale >= 0
  // F23 — budget totale ipotetico I_tot: OGNI copertura paga P = I_tot + t
  // (vincita lorda sopra il costo totale, successive incluse). Richiede
  // harmonized (contabilita' full-relay); senza budget = sizing dutch.
  budget?: number;
  // M2a — modo ROI: il target non e' fisso in euro ma e' r% del capitale
  // (t = roiPct/100 * E). Richiede harmonized; col budget impostato vince il
  // budget e roiPct e' ignorato. In ROI la verifica e' STRETTA (tolleranza
  // zero, quanto di arrotondamento compreso): feasible <=> OGNI ramo
  // arrotondato chiude >= t. Niente bump di S0 (tutto scala linearmente con b).
  targetMode?: 'fixed' | 'roi'; // default 'fixed'
  roiPct?: number; // es. 4 -> t = 4% dell'esposizione
  // M2a — tetto S0 operativo (es. 10): gli stake reali non superano mai il cap;
  // in fixed+armonizzato un bMin oltre il cap rende infattibile (reason 'cap').
  baseCap?: number;
}

export interface HarmonizationInfo {
  requested: boolean; // armonizzazione richiesta (regola mai-perdita)
  finaleMode: 'lay' | 'book'; // chiusura valutata
  feasible: boolean; // chiude? lay: k*SOMMA(1/m) < 1 E ramo madre; book: SOMMA(1/m) < 1 E ramo madre
  layQuoteUsed: number; // 0 in book (nessuna banca)
  kFactor: number; // (L - c) / (1 - c); 1 in book
  sumInverseMultipliers: number; // SOMMA 1/m_k (lay: solo coperture; book: + singola)
  maxLayQuote: number; // quota lay massima per chiudere (0 = N/A in book)
  equalizedNet: number | null; // netto garantito su OGNI ramo (se feasible)
  baseUsed: number; // S0 effettivo (adeguato al minimo se serve)
  baseMinRequired: number; // S0 minimo per chiudere anche il ramo madre
  // M2a: 'cap' = S0 minimo oltre il tetto operativo (mai bump oltre il cap);
  // 'terms' = payout oltre il maxPayout del book (garanzia ineseguibile).
  reason: 'layQuote' | 'dutch' | 'mother' | 'quota' | 'budget' | 'cap' | 'terms' | null;
  targetUsed: number; // t usato per il sizing (fisso oppure r% di E in modo ROI)
  budgetUsed: number | null; // I_tot usato (null = sizing dutch, non budget)
  // Capitale dutched che servirebbe per +t (riferimento quando il budget
  // non basta): confronto onesto col modo dutch.
  requiredCapital: number | null;
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
  // F26: linea Totals della schedina (1.5/2.5/3.5/4.5). Tutta la matematica
  // (moltiplicatori, bonus a eventi, dutching, green-up) e' indipendente
  // dalla linea: cambiano solo etichette mercato e quote in ingresso.
  line: number = 3.5,
  // M1-precheck: book di riferimento per eleggibilita' bonus (overEligible) e
  // tetto payout (maxPayout). Assente = book default (comportamento storico).
  book?: Book,
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
    market: legMarket(m, 'UNDER', line),
    odds: Number(m.underOdds) || 1.3,
  }));

  const motherRawMultiplier = motherItems.reduce((acc, it) => acc * it.odds, 1);
  const motherBonus = effectiveBonus(book, N, false);
  const motherFinalMultiplier = Number((motherRawMultiplier * (1 + motherBonus / 100)).toFixed(2));
  // F20b: S0 puo' essere ADEGUATO al minimo che chiude anche il ramo madre
  // (vedi pass 2): motherGross/motherNet diventano let e vengono ricalcolati.
  let motherGross = Number((baseStake * motherFinalMultiplier).toFixed(2));
  let motherNet = Number((motherGross - baseStake).toFixed(2));

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
    title: `Schedina Madre (${N} Match UNDER ${line})`,
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
      market: legMarket(currentMatch, 'OVER', line),
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
        market: legMarket(nextMatch, 'UNDER', line),
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
    // La prima gamba di ogni copertura e' sempre Over -> eleggibilita' bonus
    // del book (M1-precheck): con overEligible=false il bonus e' 0.
    const bonus = effectiveBonus(book, items.length, true);
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
        : `Copertura C${k} (${currentMatch.homeTeam} - ${currentMatch.awayTeam} OVER ${line} + Restanti UNDER ${line})`,
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
  // F15 — ARMONIZZATO lay (regola mai-perdita, finalHedgeMode lay_exchange):
  // tutte le coperture pagano lo STESSO payout D, dimensionato cosi' che OGNI
  // esito finale (madre, qualsiasi C_k, banca se esce Over) chiuda >= target:
  //   Under@k: D - I - B(L-1) >= t      Over: B(1-c) - I >= t
  // da cui (pareggiando il ramo peggiore) B = D/(L-c) e D = k*(I+t) con
  // k = (L-c)/(1-c) (il lock estrae solo (1-c)/(L-c) del payout).
  // Con I = S0 + SOMMA s_k e s_k = D/m_k si chiude solo se
  //   k * SOMMA(1/m_k) < 1   (dutching): altrimenti l'armonizzazione e'
  // MATEMATICAMENTE impossibile a questa quota lay e l'app lo dichiara
  // (torna sizing standard + rami onesti). La quota lay massima ammessa e'
  // L_max = (1-c)/SOMMA(1/m_k) + c: sopra, serve bancare in-play quando
  // l'Under dell'ultimo match scende.
  //
  // F20 — ARMONIZZATO book (regola mai-perdita, finalHedgeMode book_single):
  // dutching PURO senza banca: la singola finale C_N partecipa al payout
  // comune D' insieme alle coperture. Ogni ramo chiude D' - I = t con
  //   D' = (b+t)/(1 - SOMMA'(1/m)),  SOMMA' su C1..CN (singola inclusa),
  // fattibile <=> SOMMA' < 1. Nessun haircut exchange (k = 1).
  const layOpts = lay ?? {};
  const manualLayStake = Number(layOpts.layStake) > 0 ? Number(layOpts.layStake) : null;
  const harmonizeRequested =
    finalHedgeMode === 'lay_exchange' && Boolean(layOpts.harmonized) && N > 1;
  const layQuotePlan =
    Number(layOpts.layOdds) > 1 ? Number(layOpts.layOdds) : Number(matches[N - 1].underOdds) || 1.3;
  const commPlan = Math.min(0.2, Math.max(0, (Number(layOpts.layCommissionPct) || 4.5) / 100));
  const kFactorPlan = (layQuotePlan - commPlan) / (1 - commPlan);
  const sumInverse = coverageSlips.reduce(
    (acc, s) => acc + (s.finalMultiplier > 1 ? 1 / s.finalMultiplier : 0),
    0,
  );
  const maxLayQuote =
    sumInverse > 0 ? Number(((1 / sumInverse) * (1 - commPlan) + commPlan).toFixed(2)) : 0;
  // F20b — vincolo RAMO MADRE: anche la madre deve chiudere >= t, e la madre
  // paga b*m_0 con stake b fissato dall'utente. Con I(b), B(b) funzioni di b:
  //   lay:  b*m_0 - I - B(L-1) >= t  <=>  b >= t*(1+A2)/denM,
  //         A2 = (L-1)/(1-c), denM = m_0*Q - 1 - A2, Q = 1-kS
  //   book: b*m_0 - I >= t           <=>  b >= t/[(1-S')*m_0 - 1]
  // Se la base utente non basta, S0 viene ADEGUATO al minimo che chiude
  // (riportato in harmonization + banner UI): e' un REQUISITO della puntata,
  // non una scelta. Se den <= 0 il ramo madre non chiude a nessuna base.
  // F22 — regola min quota 1.25 sulle SINGOLE selezioni (madre +
  // coperture, singola finale inclusa). Una Under 1.10 dentro una
  // multipla resterebbe invisibile a un check sul prodotto: si guarda
  // ogni quota gamba. Esclusi: gambe BOOSTER (riempitivo 1X a quota
  // bassa per disegno) e item della banca lay (prezzo exchange).
  const minLegOdds = [motherSlip, ...coverageSlips].reduce((m, s) => {
    if (s.type === 'FINAL_LAY') {
      return m;
    }
    return s.items.reduce(
      (a, it) => (it.market === 'BOOSTER 1X/12' ? a : Math.min(a, Number(it.odds) || 0)),
      m,
    );
  }, Number.POSITIVE_INFINITY);
  const quotaOk = minLegOdds >= 1.25;
  let baseUsed = baseStake;
  let baseMinRequired = baseStake;
  let harmReason: 'layQuote' | 'dutch' | 'mother' | 'quota' | 'budget' | 'cap' | 'terms' | null =
    null;
  let useLayDutch = false;
  let useBookDutch = false;
  // M2a — tetto S0 operativo: gli stake reali non superano mai il cap, nemmeno
  // in fallback standard. In fixed+armonizzato un bMin oltre il cap rende la
  // scala infattibile (reason 'cap') invece di adeguare S0 oltre il tetto.
  const baseCap = Number(layOpts.baseCap) > 0 ? Number(layOpts.baseCap) : null;
  if (baseCap !== null) {
    baseUsed = Math.min(baseStake, baseCap);
  }
  // F23 — modo BUDGET: l'utente fissa il costo totale ipotetico I_tot e OGNI
  // copertura paga P = I_tot + t (vincita lorda sopra il costo, successive
  // incluse). Vale solo con harmonized (contabilita' full-relay) e quota ok;
  // ha priorita' sul dutch (che invece RISOLVE il capitale dal target).
  // n_k resta FULL remaining: togliere una gamba a quota q>=1.25 moltiplica
  // il suo 1/m per ~q (piu' calo bonus) -> S peggiore; il relay resta sicuro
  // comunque (una sotto-copertura puo' solo aggiungere vincite, mai perdite).
  const budgetTot = Number(layOpts.budget) > 0 ? Number(layOpts.budget) : null;
  const useBudget =
    budgetTot !== null &&
    Boolean(layOpts.harmonized) &&
    quotaOk &&
    coverageSlips.length > 0 &&
    (finalHedgeMode === 'book_single' || N > 1);
  if (
    (harmonizeRequested && N > 1) ||
    (finalHedgeMode === 'book_single' && Boolean(layOpts.harmonized) && coverageSlips.length > 0)
  ) {
    if (!quotaOk) {
      harmReason = 'quota';
    }
  }
  // M2a — modo ROI (t = r% di E, forma chiusa, audit §3):
  //   lay:  E = (1+A2)*b / [(1-kS)(1-r*A2) - (1+A2)*k*r*S], A2 = (L-1)/(1-c)
  //   book: E = b / [1-S'(1+r)]
  // denomE>0 (con r*A2<1, sempre vero nel range operativo) implica kS<1, quindi
  // sostituisce la guardia 0.99. In ROI niente bump di S0: tutto scala
  // linearmente con b, quindi b resta la base (clamped al cap); la madre e'
  // verificata ex-post.
  //
  // CUSCINO ANTI-QUANTO (certificazione, stress S2): il dutch esatto chiude i
  // rami a t in aritmetica reale, ma gli stake sono arrotondati per eccesso a
  // 0.50€ (drag fino a ~0.50€ per gamba, amplificato da 1/(1-kS) in lay).
  // Sizzare a t esatto lascerebbe la garanzia in balia del quanto. Il sizing
  // avviene quindi a t_s = t0 + C_q; il CONTRATTO resta t = r*E_effettiva,
  // verificato ex-post a tolleranza zero (blocco strict). Se il leverage non
  // regge roi+quanto (r*beta >= 0.9) la scala e' correttamente infattibile:
  // una garanzia che non sopravvive al proprio quanto non e' certificabile.
  const roiPctRaw = Number(layOpts.roiPct);
  const roiMode =
    layOpts.targetMode === 'roi' &&
    roiPctRaw > 0 &&
    Boolean(layOpts.harmonized) &&
    quotaOk &&
    !useBudget &&
    coverageSlips.length > 0 &&
    (finalHedgeMode === 'book_single' || N > 1);
  const roiRate = roiMode ? roiPctRaw / 100 : 0;
  let tEff = targetProfit;
  if (roiMode && harmReason === null) {
    if (finalHedgeMode === 'lay_exchange' && N > 1) {
      const A2r = (layQuotePlan - 1) / (1 - commPlan);
      const kr = kFactorPlan;
      const Sr = sumInverse;
      const denomE = (1 - kr * Sr) * (1 - roiRate * A2r) - (1 + A2r) * kr * roiRate * Sr;
      const marginK = Math.max(0.05, 1 - kr * Sr);
      const betaLay = ((1 + A2r) * kr * Sr) / marginK + A2r; // dE/dt
      if (!(denomE > 0) || roiRate * betaLay >= 0.9) {
        harmReason = 'layQuote';
      } else {
        const E0 = ((1 + A2r) * baseUsed) / denomE;
        const Jr = coverageSlips.length;
        const dragLay = (0.5 * Jr) / marginK + 0.5;
        const cushion = dragLay / (1 - roiRate * betaLay) + 0.5;
        tEff = Number((roiRate * E0 + cushion).toFixed(2));
      }
    } else {
      const denomB = 1 - sumInverse * (1 + roiRate);
      const betaBook = sumInverse / Math.max(0.05, 1 - sumInverse); // dE/dt
      if (!(denomB > 0) || roiRate * betaBook >= 0.9) {
        harmReason = 'dutch';
      } else {
        const E0 = baseUsed / denomB;
        const Jr = coverageSlips.length;
        const cushion = (0.5 * Jr) / (1 - roiRate * betaBook) + 0.5;
        tEff = Number((roiRate * E0 + cushion).toFixed(2));
      }
    }
  }
  if (!useBudget && harmReason === null && harmonizeRequested && N > 1) {
    if (!(kFactorPlan > 1) || (!roiMode && !(kFactorPlan * sumInverse < 0.99))) {
      harmReason = 'layQuote';
    } else {
      const A2 = (layQuotePlan - 1) / (1 - commPlan);
      const Qc = 1 - kFactorPlan * sumInverse;
      const denM = motherFinalMultiplier * Qc - 1 - A2;
      if (!(denM > 0)) {
        harmReason = 'mother';
      } else if (roiMode) {
        // Scala-invariante: la madre tiene a qualunque b oppure a nessuno;
        // verifica ex-post sui netti arrotondati (blocco strict). Mai bump.
        baseMinRequired = baseUsed;
        useLayDutch = true;
      } else {
        const bMinM = (tEff * (1 + A2)) / denM;
        baseMinRequired = Number(bMinM.toFixed(2));
        const bumped = Math.max(baseUsed, roundToFiftyCents(bMinM));
        if (baseCap !== null && bumped > baseCap) {
          harmReason = 'cap';
          // baseUsed resta clamped: la scala ripiega sullo standard onesto.
        } else {
          baseUsed = bumped;
          useLayDutch = true;
        }
      }
    }
  } else if (
    !useBudget &&
    harmReason === null &&
    finalHedgeMode === 'book_single' &&
    Boolean(layOpts.harmonized) &&
    coverageSlips.length > 0
  ) {
    if (!(sumInverse < 0.99) && !roiMode) {
      harmReason = 'dutch';
    } else if (!roiMode) {
      const denB = (1 - sumInverse) * motherFinalMultiplier - 1;
      if (!(denB > 0)) {
        harmReason = 'mother';
      } else {
        const bMinB = tEff / denB;
        baseMinRequired = Number(bMinB.toFixed(2));
        const bumped = Math.max(baseUsed, roundToFiftyCents(bMinB));
        if (baseCap !== null && bumped > baseCap) {
          harmReason = 'cap';
        } else {
          baseUsed = bumped;
          useBookDutch = true;
        }
      }
    } else {
      // ROI book: denomB>0 gia' stabilito sopra; mai bump, verifica ex-post.
      baseMinRequired = baseUsed;
      useBookDutch = true;
    }
  }

  // S0 adeguato -> ricalcola la madre (stake, lordo, netto) e il cumulato.
  if (baseUsed !== baseStake) {
    motherGross = Number((baseUsed * motherFinalMultiplier).toFixed(2));
    motherNet = Number((motherGross - baseUsed).toFixed(2));
    motherSlip.stake = baseUsed;
    motherSlip.cumulativeCost = baseUsed;
    motherSlip.potentialGrossPayout = motherGross;
    motherSlip.potentialNetProfit = motherNet;
    motherSlip.targetProfit = motherNet;
  }

  let runningCumulativeCost = baseUsed;
  // F23 — sizing BUDGET: OGNI copertura paga P = I_tot + t (vincita lorda
  // sopra il costo totale ipotetico, successive incluse). Gli stake NON
  // dipendono da S0: s_k = P/m_k. La madre viene adeguata dopo (bump da
  // costi reali, sotto).
  let budgetLayStake: number | null = null;
  if (useBudget && budgetTot !== null) {
    const payoutTarget = budgetTot + targetProfit;
    coverageSlips.forEach((s) => {
      s.stake = roundToFiftyCents(payoutTarget / s.finalMultiplier);
      s.cumulativeCost = Number(runningCumulativeCost.toFixed(2));
      s.potentialGrossPayout = Number((s.stake * s.finalMultiplier).toFixed(2));
      s.potentialNetProfit = Number(
        (s.potentialGrossPayout - (runningCumulativeCost + s.stake)).toFixed(2),
      );
      s.targetProfit = targetProfit;
      runningCumulativeCost = Number((runningCumulativeCost + s.stake).toFixed(2));
    });
    // S0 minimo dai costi REALI (gli stake non dipendono da b in budget mode:
    // un solo passaggio basta): b*(m_0-1) >= S_scommesse + liab + t.
    const pMinBudget = Math.min(...coverageSlips.map((s) => s.potentialGrossPayout));
    const denomB0 = layQuotePlan - commPlan;
    const b0 = manualLayStake ?? roundToFiftyCents(denomB0 > 0 ? pMinBudget / denomB0 : 10);
    const liab0 =
      finalHedgeMode === 'lay_exchange' ? Number((b0 * (layQuotePlan - 1)).toFixed(2)) : 0;
    budgetLayStake = b0;
    const sumNoS0 = runningCumulativeCost - baseStake;
    const denMb = motherFinalMultiplier - 1;
    if (denMb > 0) {
      const bMinB = (sumNoS0 + liab0 + targetProfit) / denMb;
      baseMinRequired = Number(bMinB.toFixed(2));
      baseUsed = Math.max(baseStake, roundToFiftyCents(bMinB));
      if (baseUsed !== baseStake) {
        motherGross = Number((baseUsed * motherFinalMultiplier).toFixed(2));
        motherNet = Number((motherGross - baseUsed).toFixed(2));
        motherSlip.stake = baseUsed;
        motherSlip.cumulativeCost = baseUsed;
        motherSlip.potentialGrossPayout = motherGross;
        motherSlip.potentialNetProfit = motherNet;
        motherSlip.targetProfit = motherNet;
        runningCumulativeCost = Number((runningCumulativeCost + (baseUsed - baseStake)).toFixed(2));
      }
    } else {
      harmReason = 'mother';
    }
  } else if (useLayDutch) {
    // M2a: sizing sul target effettivo (fisso oppure r% di E in modo ROI).
    const totalBook = (baseUsed + kFactorPlan * tEff * sumInverse) / (1 - kFactorPlan * sumInverse);
    const commonPayout = kFactorPlan * (totalBook + tEff);
    coverageSlips.forEach((s) => {
      s.stake = roundToFiftyCents(commonPayout / s.finalMultiplier);
      s.cumulativeCost = Number(runningCumulativeCost.toFixed(2));
      s.potentialGrossPayout = Number((s.stake * s.finalMultiplier).toFixed(2));
      s.potentialNetProfit = Number(
        (s.potentialGrossPayout - (runningCumulativeCost + s.stake)).toFixed(2),
      );
      s.targetProfit = tEff;
      runningCumulativeCost = Number((runningCumulativeCost + s.stake).toFixed(2));
    });
  } else if (useBookDutch) {
    const commonPayoutBook = (baseUsed + tEff) / (1 - sumInverse);
    coverageSlips.forEach((s) => {
      s.stake = roundToFiftyCents(commonPayoutBook / s.finalMultiplier);
      s.cumulativeCost = Number(runningCumulativeCost.toFixed(2));
      s.potentialGrossPayout = Number((s.stake * s.finalMultiplier).toFixed(2));
      s.potentialNetProfit = Number(
        (s.potentialGrossPayout - (runningCumulativeCost + s.stake)).toFixed(2),
      );
      s.targetProfit = tEff;
      runningCumulativeCost = Number((runningCumulativeCost + s.stake).toFixed(2));
    });
  } else {
    coverageSlips.forEach((s) => {
      const rawStake =
        s.finalMultiplier > 1
          ? (runningCumulativeCost + s.targetProfit) / (s.finalMultiplier - 1)
          : 10;
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
    const activePayout =
      useLayDutch || useBudget
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
    // (B = P/(L-c) equalizza i due rami finali; in armonizzato/budget P e'
    // il peggiore -> OGNI ramo chiude >= equalizedNet).
    // In budget la B e' gia' calcolata nel finalize (budgetLayStake):
    // qui viene riusata identica (stessi input -> stesso valore).
    const layStake =
      manualLayStake ?? budgetLayStake ?? roundToFiftyCents(denom > 0 ? activePayout / denom : 10);
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
      title: `Banca Finale Exchange (${finalMatch.homeTeam} - ${finalMatch.awayTeam} LAY Under ${line})`,
      code: `C${N}`,
      timing: `Piazzare su Betfair prima di ${finalMatch.homeTeam} - ${finalMatch.awayTeam} (${finalMatch.timeSlot})`,
      items: [
        {
          matchId: finalMatch.id,
          matchOrder: finalMatch.order,
          homeTeam: finalMatch.homeTeam,
          awayTeam: finalMatch.awayTeam,
          timeSlot: finalMatch.timeSlot,
          market: layMarket(finalMatch, line),
          odds: layQuote,
        },
      ],
      eventCount: 1,
      rawMultiplier: layQuote,
      bonusPercentage: 0,
      finalMultiplier: layQuote,
      stake: layStake,
      targetProfit: getStepTargetProfit(N, N, tEff, asymmetricMode),
      cumulativeCost: Number(bookStakesTotal.toFixed(2)),
      // Se esce Over la banca incassa lo stake del puntatore meno commissione
      potentialGrossPayout: layWinProfit,
      potentialNetProfit: Number((layWinProfit - bookStakesTotal).toFixed(2)),
      realizedNetIfWon: 0,
      liability: layLiability,
      commissionPct: Number((commission * 100).toFixed(2)),
      status: layStatus,
    });

    if (harmonizeRequested && !useBudget) {
      const overNet = layWinProfit - bookStakesTotal;
      const worstUnderNet = worstCoveragePayout - bookStakesTotal - layLiability;
      const motherBranchNet = motherGross - bookStakesTotal - layLiability;
      harmonization = {
        requested: true,
        finaleMode: 'lay',
        feasible: useLayDutch,
        layQuoteUsed: layQuote,
        kFactor: Number(kFactorPlan.toFixed(4)),
        sumInverseMultipliers: Number(sumInverse.toFixed(4)),
        maxLayQuote,
        equalizedNet: useLayDutch
          ? Number(Math.min(overNet, worstUnderNet, motherBranchNet).toFixed(2))
          : null,
        baseUsed,
        baseMinRequired,
        reason: useLayDutch ? null : harmReason,
        budgetUsed: null,
        requiredCapital: null,
        targetUsed: tEff,
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
    const layLiabilityIfPlaced = layPlaced || useLayDutch || useBudget ? layLiability : 0;
    motherSlip.realizedNetIfWon = Number(
      (motherSlip.potentialGrossPayout - (bookStakesTotal + layLiabilityIfPlaced)).toFixed(2),
    );
    coverageSlips.forEach((s) => {
      s.realizedNetIfWon =
        s.type === 'FINAL_LAY'
          ? Number((s.potentialGrossPayout - bookStakesTotal).toFixed(2))
          : Number((s.potentialGrossPayout - (bookStakesTotal + layLiabilityIfPlaced)).toFixed(2));
    });
  } else {
    motherSlip.realizedNetIfWon = Number(
      (motherSlip.potentialGrossPayout - runningCumulativeCost).toFixed(2),
    );
    coverageSlips.forEach((s) => {
      s.realizedNetIfWon = Number((s.potentialGrossPayout - runningCumulativeCost).toFixed(2));
    });
    // F20 — verdetto armonizzazione book: in dutching puro ogni ramo (madre +
    // C1..CN singola inclusa) chiude D' - I = t; realizedNetIfWon sopra e'
    // gia' payout - esposizione totale, quindi il minimo e' il garantito.
    // (Siamo nel ramo else = book_single: basta il flag harmonized.)
    // In budget il verdetto e' costruito dopo (serve verifica esplicita).
    if (!useBudget && Boolean(layOpts.harmonized) && coverageSlips.length > 0) {
      const branchNets = [
        motherSlip.realizedNetIfWon,
        ...coverageSlips.map((s) => s.realizedNetIfWon),
      ];
      harmonization = {
        requested: true,
        finaleMode: 'book',
        feasible: useBookDutch,
        layQuoteUsed: 0,
        kFactor: 1,
        sumInverseMultipliers: Number(sumInverse.toFixed(4)),
        maxLayQuote: 0,
        equalizedNet: useBookDutch ? Number(Math.min(...branchNets).toFixed(2)) : null,
        baseUsed,
        baseMinRequired,
        reason: useBookDutch ? null : harmReason,
        budgetUsed: null,
        requiredCapital: null,
        targetUsed: tEff,
      };
    }
  }

  // F23 — verdetto modo BUDGET: verifica ESPLICITA su ogni ramo (i netti
  // realized sopra usano gia' stake reali + responsabilita' pianificata).
  // Fattibile <=> spesa entro il budget (+10% tolleranza arrotondamenti)
  // E ramo peggiore >= target (-1 tolleranza arrotondamenti).
  if (useBudget && budgetTot !== null && harmReason === null) {
    const branchNets = [
      motherSlip.realizedNetIfWon,
      ...coverageSlips.map((s) => s.realizedNetIfWon),
    ];
    const minNet = Math.min(...branchNets);
    const spentOk = runningCumulativeCost <= budgetTot * 1.1;
    const verified = minNet >= targetProfit - 1.0;
    const feasibleBudget = spentOk && verified;
    harmonization = {
      requested: true,
      finaleMode: finalHedgeMode === 'lay_exchange' ? 'lay' : 'book',
      feasible: feasibleBudget,
      layQuoteUsed: finalHedgeMode === 'lay_exchange' ? layQuotePlan : 0,
      kFactor: finalHedgeMode === 'lay_exchange' ? Number(kFactorPlan.toFixed(4)) : 1,
      sumInverseMultipliers: Number(sumInverse.toFixed(4)),
      maxLayQuote,
      equalizedNet: feasibleBudget ? Number(minNet.toFixed(2)) : null,
      baseUsed,
      baseMinRequired,
      reason: feasibleBudget ? null : 'budget',
      budgetUsed: budgetTot,
      // requiredCapital (capitale dutched per +t) calcolato in matrix.ts
      // confrontando col modo dutch: qui resta null.
      requiredCapital: null,
      targetUsed: targetProfit,
    };
  }

  // M2a — verifica STRETTA modo ROI (tolleranza zero, quanto compreso).
  // Il sizing avviene a t_s = t0 + cuscino anti-quanto; il CONTRATTO e'
  // t = r*E_effettiva (E dopo sizing e arrotondi): feasible <=> OGNI ramo
  // arrotondato (madre, coperture, banca) chiude >= t. Se il cuscino non basta
  // (leva estrema), la scala e' infattibile: in lay abbassare L allarga il
  // margine (reason layQuote + Lmax operativa), in book il margine e'
  // strutturale (dutch). Solo in ROI: in fixed resta la semantica storica
  // (verdetto onesto via equalizedNet, retrocompatibilita' UI/test).
  if (roiMode && harmonization?.feasible) {
    const tNeed = Number((roiRate * totalPotentialExposure).toFixed(2));
    harmonization.targetUsed = tNeed;
    const roiNets = [motherSlip.realizedNetIfWon, ...coverageSlips.map((s) => s.realizedNetIfWon)];
    if (!(Math.min(...roiNets) >= tNeed - 1e-9)) {
      harmonization.feasible = false;
      harmonization.equalizedNet = null;
      harmonization.reason = harmonization.finaleMode === 'lay' ? 'layQuote' : 'dutch';
    }
  }

  // M1-precheck — tetto payout del book: se un payout book supera il maxPayout,
  // la garanzia e' ineseguibile (reason 'terms'). Solo sui payout bookmaker
  // (la banca lay non e' un payout book). Col book default (cap illimitato)
  // il controllo e' inerte.
  const payoutCap = book?.maxPayout ?? null;
  if (payoutCap !== null && payoutCap > 0 && harmonization?.feasible) {
    const bookPayouts = [
      motherSlip.potentialGrossPayout,
      ...coverageSlips.filter((s) => s.type !== 'FINAL_LAY').map((s) => s.potentialGrossPayout),
    ];
    if (bookPayouts.some((p) => p > payoutCap)) {
      harmonization.feasible = false;
      harmonization.equalizedNet = null;
      harmonization.reason = 'terms';
    }
  }

  // Capitale effettivo: puntate bookmaker piazzate + (banca piazzata? la sua
  // responsabilita' a rischio). La responsabilita' NON e' una puntata persa
  // se poi esce Over, quindi il ramo Over usa solo la parte bookmaker.
  let bookInvestedSoFar = baseUsed;
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
      if (m.outcome === 'OVER') {
        lastOverIdx = i;
      }
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
