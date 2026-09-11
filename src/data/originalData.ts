import { OriginalCsvStep, WeakPoint, ImprovementModel } from '../types';

export const ORIGINAL_BASE_BET = {
  events: 9,
  market: 'Under 3.5',
  singleOdds: 1.32,
  csvTotalOdds: 11.88, // In CSV: 9 * 1.32 = 11.88
  realTotalOdds: 12.028, // In reality: 1.32^9 = 12.028
  stake: 20,
  csvWin: 237.6,
  realWin: 240.56,
  bonusLabel: 'Bonus 26.2% su 8 partite',
  csvWinWithBonus: 299.376,
};

export const ORIGINAL_CSV_STEPS: OriginalCsvStep[] = [
  {
    step: 1,
    label: 'Copertura 1',
    nUnder: 8,
    qUnder: 1.32,
    qOver: 3.0,
    csvOdds: 13.56, // 3 + 8*1.32 = 13.56
    realOdds: 27.336, // 3 * 1.32^8 = 27.336
    csvStake: 5.0,
    csvWin: 67.8,
    csvTotalCost: 25.0,
    csvNetProfit: 42.8,
    optimalStakeReal: 2.65,
    optimalWinReal: 72.44,
  },
  {
    step: 2,
    label: 'Copertura 2',
    nUnder: 7,
    qUnder: 1.32,
    qOver: 3.0,
    csvOdds: 12.24, // 3 + 7*1.32 = 12.24
    realOdds: 20.709, // 3 * 1.32^7 = 20.709
    csvStake: 6.5,
    csvWin: 79.56,
    csvTotalCost: 31.5,
    csvNetProfit: 48.06,
    optimalStakeReal: 4.14,
    optimalWinReal: 85.73,
  },
  {
    step: 3,
    label: 'Copertura 3',
    nUnder: 6,
    qUnder: 1.32,
    qOver: 3.0,
    csvOdds: 10.92, // 3 + 6*1.32 = 10.92
    realOdds: 15.689, // 3 * 1.32^6 = 15.689
    csvStake: 8.0,
    csvWin: 87.36,
    csvTotalCost: 39.5,
    csvNetProfit: 47.86,
    optimalStakeReal: 6.09,
    optimalWinReal: 95.55,
  },
  {
    step: 4,
    label: 'Copertura 4',
    nUnder: 5,
    qUnder: 1.32,
    qOver: 3.0,
    csvOdds: 9.6, // 3 + 5*1.32 = 9.60
    realOdds: 11.885, // 3 * 1.32^5 = 11.885
    csvStake: 10.5,
    csvWin: 100.8,
    csvTotalCost: 50.0,
    csvNetProfit: 50.8,
    optimalStakeReal: 9.19,
    optimalWinReal: 109.22,
  },
  {
    step: 5,
    label: 'Copertura 5',
    nUnder: 4,
    qUnder: 1.32,
    qOver: 3.0,
    csvOdds: 8.28, // 3 + 4*1.32 = 8.28
    realOdds: 9.004, // 3 * 1.32^4 = 9.004
    csvStake: 14.0,
    csvWin: 115.92,
    csvTotalCost: 64.0,
    csvNetProfit: 51.92,
    optimalStakeReal: 14.24,
    optimalWinReal: 128.22,
  },
  {
    step: 6,
    label: 'Copertura 6',
    nUnder: 3,
    qUnder: 1.32,
    qOver: 3.0,
    csvOdds: 6.96, // 3 + 3*1.32 = 6.96
    realOdds: 6.821, // 3 * 1.32^3 = 6.821
    csvStake: 19.0,
    csvWin: 132.24,
    csvTotalCost: 83.0,
    csvNetProfit: 49.24,
    optimalStakeReal: 22.85,
    optimalWinReal: 155.86,
  },
  {
    step: 7,
    label: 'Copertura 7',
    nUnder: 2,
    qUnder: 1.32,
    qOver: 3.0,
    csvOdds: 5.64, // 3 + 2*1.32 = 5.64
    realOdds: 5.168, // 3 * 1.32^2 = 5.168
    csvStake: 29.0,
    csvWin: 163.56,
    csvTotalCost: 112.0,
    csvNetProfit: 51.56,
    optimalStakeReal: 38.87,
    optimalWinReal: 200.88,
  },
  {
    step: 8,
    label: 'Copertura 8 (Finale / Singola)',
    nUnder: 1,
    qUnder: 1.32,
    qOver: 3.0,
    csvOdds: 4.32, // Nel CSV step 8 ha quota 4.32 o singola 2.75
    realOdds: 3.96, // 3 * 1.32 = 3.96
    csvStake: 47.0,
    csvWin: 203.04,
    csvTotalCost: 159.0,
    csvNetProfit: 44.04,
    optimalStakeReal: 70.61,
    optimalWinReal: 279.62,
  },
];

export const WEAK_POINTS: WeakPoint[] = [
  {
    id: 'wp-1',
    title: 'Errore Matematico di Calcolo Quote (Somma anziché Prodotto)',
    severity: 'critical',
    tag: 'Formula Errata nel CSV',
    description:
      'Nelle scommesse sportive le quote di una multipla si moltiplicano in modo esponenziale (Q_tot = q1 × q2 × ... × qn). Nel foglio CSV le quote sono state calcolate per somma lineare (es. 9 × 1,32 = 11,88 invece di 1,32⁹ = 12,03, e per la Copertura 1: 3 + 8×1,32 = 13,56 invece di 3 × 1,32⁸ = 27,34).',
    mathProof:
      'Nel CSV: Q = 3 + (8 × 1.32) = 13.56. Reale: Q = 3 × (1.32)^8 = 27.34 (+101.6% di differenza sulla prima copertura!).',
    suggestedFix:
      'Utilizzare la formula esponenziale corretta. Con la quota reale di 27.34, per ottenere lo stesso utile di ~45€ basta puntare 2.65€ invece dei 5.00€ calcolati nel foglio, dimezzando il capitale esposto!',
  },
  {
    id: 'wp-2',
    title: 'Il "Buco Nero" del Doppio Errore (Vulnerabilità Sistemica Totale)',
    severity: 'critical',
    tag: 'Rischio Catastrofico',
    description:
      "Tutte le schedine di copertura nel foglio coprono ESATTAMENTE 1 singolo Over 3.5 e 8 Under 3.5. Se si verificano 2 o più Over 3.5 su 9 partite, SALTA SIA LA MULTIPLA PRINCIPALE SIA TUTTE LE COPERTURE, con perdita secca del 100% dell'intero capitale impegnato (da 25€ fino a 279€/330€).",
    mathProof:
      "Con P(Under)=0.73 e P(Over)=0.27, per la distribuzione binomiale: P(0 Over)=6.2%, P(1 Over)=20.7%, mentre P(≥ 2 Over) = 73.1%! C'è oltre il 73% di probabilità teorica che l'intero sistema fallisca simultaneamente se giocato pre-match.",
    suggestedFix:
      'Trasformare la copertura in una "Scalare Sequenziale Temporale (Live)": NON giocare tutte le coperture prima dell\'inizio, ma scaglionare gli eventi nel tempo e coprire solo l\'evento successivo se quelli precedenti sono passati.',
  },
  {
    id: 'wp-3',
    title: 'Spreco di Liquidità nel Piazzamento Pre-Match Contemporaneo',
    severity: 'high',
    tag: 'Inefficienza di Capitale',
    description:
      "Se le coperture vengono piazzate tutte insieme prima dell'inizio delle partite, si bloccano subito oltre 159€ - 279€. Ma se la Partita 1 finisce Over 3.5, hai già sprecato le puntate sulle coperture 2, 3, 4, 5, 6, 7 e 8!",
    mathProof:
      'Costo totale pre-match = 20€ + 5€ + 6.5€ + 8€ + 10.5€ + 14€ + 19€ + 29€ + 47€ = 159€ (o fino a 279€-330€ nel CSV). Il capitale a rischio sale a 8x lo stake base.',
    suggestedFix:
      'Adottare il modello "Roll-over a Scalare": si gioca solo la multipla principale. Solo man mano che le partite si giocano e si arriva verso gli ultimi 2-3 match si valuta la copertura singola (o Cash Out) solo se la multipla è ancora viva.',
  },
  {
    id: 'wp-4',
    title: 'Aggio Composto del Bookmaker (Moltiplicazione del Margine)',
    severity: 'high',
    tag: 'Svantaggio Matematico',
    description:
      "Ogni evento Under 3.5 a 1.32 e Over 3.5 a 3.00 contiene una trattenuta (aggio) del bookmaker di circa il 6-8%. Inserire 9 eventi in una multipla moltiplica l'aggio esponenzialmente: (1 - 0.07)⁹ ≈ 0.52. Il valore atteso (Expected Value) è fortemente negativo se non c'è quota di valore (Value Bet).",
    mathProof:
      'Allibramento medio = (1/1.32) + (1/3.00) = 0.7575 + 0.3333 = 1.0908 (9.08% di aggio a partita). Su 9 partite: (1 / 1.0908)^9 = 0.449 (payout teorico 45%).',
    suggestedFix:
      'Ridurre il numero di partite ad alto rischio (es. massimo 4-5 eventi a quote solide) oppure utilizzare Betting Exchange (Banca / Punta) per coperture senza aggio composto.',
  },
];

export const IMPROVEMENTS: ImprovementModel[] = [
  {
    id: 'imp-1',
    title: 'Formula Esponenziale Corretta per Calcolo Stake (Dutching Dinamico)',
    tag: 'Ottimizzazione Capitale',
    description:
      'Calcola lo stake esatto per ogni copertura garantendo un profitto costante prefissato, usando le quote reali moltiplicate.',
    formula: 'Stake_k = (Costo_Pregresso + Target_Profit) / (Quota_Reale_k - 1)',
    advantage:
      'Riduce il capitale necessario per le prime coperture del 40-50% rispetto al foglio CSV.',
  },
  {
    id: 'imp-2',
    title: 'Copertura Sequenziale Dinamica (Live Ladder / Time Staggering)',
    tag: 'Eliminazione Rischio Doppio Errore',
    description:
      'Le partite sono organizzate in slot orari distinti. Non si piazza alcuna copertura finché non rimangono gli ultimi 2 o 3 eventi attivi.',
    formula:
      'Se Match_k perde -> Stop & Incasso. Se Match_k vince -> Prosegui senza spendere per coperture inutili.',
    advantage:
      'Si rischiano solo i 20€ iniziali per il 90% del tempo, senza impegnare 159€-330€ in anticipo.',
  },
  {
    id: 'imp-3',
    title: 'Hedging tramite Betting Exchange (Banca Under / Copertura Singola)',
    tag: 'Massima Resa',
    description:
      "Invece di costruire 8 contromultiple complesse con 8 Under e 1 Over (che soffrono l'aggio esponenziale), si banca l'evento singolo sul Betting Exchange.",
    formula: 'Banca Quota_Under sul Match attivo quando la quota scende live.',
    advantage:
      'Zero rischio di doppio errore simultaneo su altre partite e commissioni bookmaker ridotte al minimo.',
  },
  {
    id: 'imp-4',
    title: 'Booster a Quota Bassa (~1.10) per Abbattimento Stake & Recupero Bonus',
    tag: 'Idea Ottimizzazione Utente',
    description:
      'Quando le partite rimaste scendono sotto i 5 eventi (Match 5, 6, 7 e Singola Finale), il moltiplicatore perde il bonus (passa a 0%). Aggiungendo un evento "cuscinetto" a quota bassa (es. 1.10 come 1X o Over 0.5), si aumenta la quota totale e al 4° step si ripristina la soglia dei 5 eventi sbloccando il +6% di Bonus Multipla.',
    formula:
      'Quota_Finale = Quota_Copertura × 1.10 × (1 + Bonus%)  ==>  Stake_Finale = (Costi + Target) / (Quota_Finale - 1)',
    advantage:
      'Riduce lo stake necessario sulla singola finale di oltre il 18% e riattiva il bonus a 5 eventi. Richiede però cautela statistica: una quota 1.10 ha circa il 9% di rischio di insuccesso imprevisto.',
  },
];
