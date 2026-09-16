import {
  bestCoverSide,
  byKickoffAsc,
  dedupKey,
  hasKickoffPassed,
  kickoffGapMs,
  MIN_GAP_MS,
  parseLdlDateTime,
  type CoverOddsRow,
} from './coverOddsFeed';
import { solveMatrix } from './matrix';
import { DEFAULT_BOOK } from './books';
import type { UserMatch } from '../types';

// SCOUT — agente di caccia scale mai-perdita ("Radar").
//
// Il finder cerca SEQUENZE a parametri fissati; lo Scout spreme anche i
// PARAMETRI: per ogni finestra cronologica della pool prova S0 × r% × scenari
// lay (prematch + ipotesi in-play scontate) × modi (lay/book, scelti dal
// motore) e promuove solo cio' che verifica TUTTI gli N+1 rami finali a
// tolleranza zero + supera gli shock (B3/S3/S4 come funzioni, non come test).
// In lista finisce solo il verificato, con pagella shock allegata.
//
// Struttura a 2 stadi (costi sotto controllo):
//   stadio 1: finestre contigue cronologiche (niente beam: enumerazione
//             deterministica, stesso input -> stessa lista);
//   stadio 2: spremitura esatta via solveMatrix (ms per scala) + batteria shock
//             solo sulle promosse.
// Nessuna casualita': deterministico, testabile, interrompibile via budget.

export interface ScoutGrid {
  s0: number[]; // S0 provati (default [10]; il migliore assoluto vince a pari r)
  roiPct: number[]; // r% provati in ordine di preferenza (default [4])
  layDiscount: number[]; // default [0]; es. [0, 0.1, 0.2] -> L, L*0.9, L*0.8
  lines?: number[]; // default: tutte le linee presenti nella pool
  modes?: ('lay' | 'book')[]; // default entrambi (decide il motore)
  minEvents?: number; // default 2
  maxEvents?: number; // default 6
  oddsMin?: number; // default 1.25 (mai sotto su OGNI selezione)
  layCommissionPct?: number; // default 4.5
  baseCap?: number; // default 10 (tetto S0 operativo)
  topK?: number; // default 10
  evalBudget?: number; // default 4000 solve esatti (stadio 2 + shock)
  // Promozione: base feasible + questi shock obbligatori (gli altri restano
  // informativi nella pagella). Default: quote -5% e lay +0.10.
  requireQuoteMinus5?: boolean; // default true
  requireLayPlus01?: boolean; // default true
}

export function defaultScoutGrid(): ScoutGrid {
  return {
    s0: [10],
    roiPct: [4],
    layDiscount: [0],
    modes: ['lay', 'book'],
    minEvents: 2,
    maxEvents: 6,
    oddsMin: 1.25,
    layCommissionPct: 4.5,
    baseCap: 10,
    topK: 10,
    evalBudget: 4000,
    requireQuoteMinus5: true,
    requireLayPlus01: true,
  };
}

export interface ShockReport {
  quoteMinus5: boolean; // quote osservate -5%: verifica ancora
  quoteMinus10: boolean; // quote osservate -10%
  layPlus01: boolean; // lay +0.10 al lock
  layPlus02: boolean; // lay +0.20 al lock
  comm5: boolean; // commissione 5% invece di 4.5%
  noBonus: boolean; // book senza bonus Over
}

export interface ScoutPickLeg {
  home: string;
  away: string;
  kickoff: string;
  league: string;
  under: number;
  over: number;
}

export interface ScoutPick {
  key: string; // eventIds join
  eventIds: string[];
  legs: ScoutPickLeg[];
  n: number;
  line: number;
  finaleMode: 'lay' | 'book';
  s0used: number;
  roiPct: number;
  layScenario: 'prematch' | 'inplay-10' | 'inplay-20' | 'inplay-30' | 'inplay';
  layQuote: number;
  maxLayQuote: number;
  targetUsed: number;
  equalizedNet: number;
  exposure: number;
  motherGross: number;
  shocks: ShockReport;
  firstKickoffMs: number | null;
  expiresAtMs: number | null; // primo kickoff - 2h: oltre e' spazzatura
}

export interface ScoutResult {
  picks: ScoutPick[];
  poolSize: number;
  perLine: Record<number, number>;
  evaluatedWindows: number;
  exactSolves: number;
  rejectedBy: Record<string, number>;
  ranAt: string;
  msElapsed: number;
  budgetHit: boolean;
  grid: Partial<ScoutGrid>;
}

export interface ScoutProgress {
  windows: number;
  solves: number;
  picks: number;
}

function rowsToMatches(rows: CoverOddsRow[]): UserMatch[] {
  return rows.map((r, idx) => {
    const under = bestCoverSide(r, 'under');
    const over = bestCoverSide(r, 'over');
    return {
      id: `scout_${r.eventId}`,
      order: idx + 1,
      timeSlot: r.kickoff,
      homeTeam: r.home,
      awayTeam: r.away,
      underOdds: under?.odds ?? 1.3,
      overOdds: over?.odds ?? 3.0,
      outcome: 'PENDING' as const,
      kickoff: r.kickoff || undefined,
      line: r.line,
    };
  });
}

function shockMatches(matches: UserMatch[], factor: number): UserMatch[] {
  return matches.map((m) => ({
    ...m,
    underOdds: Number((m.underOdds * factor).toFixed(2)),
    overOdds: Number((m.overOdds * factor).toFixed(2)),
  }));
}

const r2 = (x: number) => Number(x.toFixed(2));

function bumpRejected(rejectedBy: Record<string, number>, reason: string | null): void {
  const k = reason ?? 'n/a';
  rejectedBy[k] = (rejectedBy[k] ?? 0) + 1;
}

export interface RunScoutOpts {
  now?: number;
  onProgress?: (p: ScoutProgress) => void;
  yieldEveryWindows?: number; // default 64 (cede il thread per la progress bar)
}

export async function runScout(
  rows: CoverOddsRow[],
  gridInput: Partial<ScoutGrid> = {},
  opts: RunScoutOpts = {},
): Promise<ScoutResult> {
  const t0 = Date.now();
  const now = opts.now ?? Date.now();
  const g: Required<Omit<ScoutGrid, 'lines'>> & { lines?: number[] } = {
    s0: gridInput.s0?.length ? [...gridInput.s0].sort((a, b) => b - a) : [10],
    roiPct: gridInput.roiPct?.length ? [...gridInput.roiPct].sort((a, b) => b - a) : [4],
    layDiscount: gridInput.layDiscount?.length
      ? [...gridInput.layDiscount].sort((a, b) => a - b)
      : [0],
    modes: gridInput.modes?.length ? gridInput.modes : ['lay', 'book'],
    minEvents: Math.max(2, Math.min(gridInput.minEvents ?? 2, 30)),
    maxEvents: Math.max(2, Math.min(gridInput.maxEvents ?? 6, 30)),
    oddsMin: Math.max(1.25, gridInput.oddsMin ?? 1.25),
    layCommissionPct: gridInput.layCommissionPct ?? 4.5,
    baseCap: gridInput.baseCap ?? 10,
    topK: gridInput.topK ?? 10,
    evalBudget: gridInput.evalBudget ?? 4000,
    requireQuoteMinus5: gridInput.requireQuoteMinus5 ?? true,
    requireLayPlus01: gridInput.requireLayPlus01 ?? true,
    lines: gridInput.lines,
  };
  const minN = Math.min(g.minEvents, g.maxEvents);
  const maxN = Math.max(g.minEvents, g.maxEvents);
  const rejectedBy: Record<string, number> = {};
  const onProgress = opts.onProgress;
  const yieldEvery = Math.max(1, opts.yieldEveryWindows ?? 64);

  // Stadio 0 — pool idonea (stesse regole del finder: future, U+O completi,
  // quota minima, dedup, ordine cronologico), raggruppata per linea.
  const seenPool = new Set<string>();
  const seenIds = new Set<string>();
  const pool = rows
    .filter((r) => r.status === 'scheduled' && !hasKickoffPassed(r, now))
    .filter((r) => {
      const under = bestCoverSide(r, 'under');
      const over = bestCoverSide(r, 'over');
      return Boolean(
        under && over && (under?.odds ?? 0) >= g.oddsMin && (over?.odds ?? 0) >= g.oddsMin,
      );
    })
    .sort(byKickoffAsc)
    .filter((r) => {
      const k = dedupKey(r);
      if (seenPool.has(k) || seenIds.has(r.eventId)) {
        return false;
      }
      seenPool.add(k);
      seenIds.add(r.eventId);
      return true;
    });
  const byLine = new Map<number, CoverOddsRow[]>();
  for (const r of pool) {
    const line = Number(r.line) || 3.5;
    if (g.lines && !g.lines.includes(line)) {
      continue;
    }
    const arr = byLine.get(line) ?? [];
    arr.push(r);
    byLine.set(line, arr);
  }
  const perLine: Record<number, number> = {};
  for (const [line, arr] of byLine) {
    perLine[line] = arr.length;
  }

  let exactSolves = 0;
  let evaluatedWindows = 0;
  let budgetHit = false;
  const budgetLeft = () => exactSolves < g.evalBudget;
  const picks: ScoutPick[] = [];
  const seenKeys = new Set<string>();

  const solveCounted = (args: Parameters<typeof solveMatrix>[0]) => {
    exactSolves += 1;
    return solveMatrix(args);
  };

  // Batteria shock su una candidata feasible (stessi parametri): rende la
  // pagella e decide la promozione assieme ai flag required.
  const runShocks = (
    matches: UserMatch[],
    s0: number,
    roi: number,
    layQ: number,
    comm: number,
  ): ShockReport => {
    const ok = (layQuote: number, ms: UserMatch[], commissionPct: number, noBonus: boolean) => {
      if (!budgetLeft()) {
        return false;
      }
      const sol = solveCounted({
        matches: ms,
        baseStake: s0,
        targetProfit: 1,
        layCommissionPct: commissionPct,
        layQuote,
        finaleModes: [...g.modes],
        targetMode: 'roi',
        roiPct: roi,
        baseCap: g.baseCap,
        book: noBonus ? { ...DEFAULT_BOOK, overEligible: false } : undefined,
      });
      return sol?.feasible === true;
    };
    return {
      quoteMinus5: ok(layQ, shockMatches(matches, 0.95), comm, false),
      quoteMinus10: ok(layQ, shockMatches(matches, 0.9), comm, false),
      layPlus01: ok(r2(layQ + 0.1), matches, comm, false),
      layPlus02: ok(r2(layQ + 0.2), matches, comm, false),
      comm5: ok(layQ, matches, 5, false),
      noBonus: ok(layQ, matches, comm, true),
    };
  };

  const layScenarioName = (d: number): ScoutPick['layScenario'] =>
    d <= 0
      ? 'prematch'
      : d <= 0.105
        ? 'inplay-10'
        : d <= 0.205
          ? 'inplay-20'
          : d <= 0.305
            ? 'inplay-30'
            : 'inplay';

  const linesSorted = [...byLine.entries()].sort((a, b) => a[0] - b[0]);
  for (const [line, arr] of linesSorted) {
    for (let n = minN; n <= maxN && !budgetHit; n++) {
      for (let start = 0; start + n <= arr.length && !budgetHit; start++) {
        const seq = arr.slice(start, start + n);
        // Relay sequenziale: gap minimo 2h tra kickoff consecutivi.
        let gapOk = true;
        for (let i = 1; i < seq.length; i++) {
          const gap = kickoffGapMs(seq[i - 1], seq[i]);
          if (Number.isFinite(gap) && (gap as number) < MIN_GAP_MS) {
            gapOk = false;
            break;
          }
        }
        if (!gapOk) {
          bumpRejected(rejectedBy, 'gap');
          continue;
        }
        evaluatedWindows += 1;
        const key = seq.map((r) => r.eventId).join('|');
        if (seenKeys.has(key)) {
          continue;
        }
        const matches = rowsToMatches(seq);
        const lastUnder = Number(matches[matches.length - 1].underOdds) || 0;
        // Sardo: S0 massimo della griglia (a pari r vince il capitale maggiore).
        const s0 = g.s0[0];
        let promoted = false;
        for (const d of g.layDiscount) {
          if (promoted || !budgetLeft()) {
            break;
          }
          const layQ = d <= 0 ? lastUnder : r2(lastUnder * (1 - d));
          if (!(layQ > 1.01)) {
            continue;
          }
          // r in ordine di preferenza: il primo che chiude e' il migliore.
          for (const roi of g.roiPct) {
            if (!budgetLeft()) {
              break;
            }
            const sol = solveCounted({
              matches,
              baseStake: s0,
              targetProfit: 1,
              layCommissionPct: g.layCommissionPct,
              layQuote: layQ,
              finaleModes: [...g.modes],
              targetMode: 'roi',
              roiPct: roi,
              baseCap: g.baseCap,
            });
            if (sol?.feasible) {
              const shocks = runShocks(matches, s0, roi, layQ, g.layCommissionPct);
              const shockOk =
                (!g.requireQuoteMinus5 || shocks.quoteMinus5) &&
                (!g.requireLayPlus01 || shocks.layPlus01);
              if (!shockOk) {
                bumpRejected(rejectedBy, 'shock');
                break; // fragile anche al miglior r: inutile provare r minori
              }
              const firstKo = seq.reduce<number | null>((acc, r) => {
                const ms = parseLdlDateTime(r.kickoff);
                if (!Number.isFinite(ms)) {
                  return acc;
                }
                return acc === null ? ms : Math.min(acc, ms);
              }, null);
              picks.push({
                key,
                eventIds: seq.map((r) => r.eventId),
                legs: seq.map((r) => ({
                  home: r.home,
                  away: r.away,
                  kickoff: r.kickoff,
                  league: r.league,
                  under: bestCoverSide(r, 'under')?.odds ?? 0,
                  over: bestCoverSide(r, 'over')?.odds ?? 0,
                })),
                n,
                line,
                finaleMode: sol.finaleMode,
                s0used: sol.baseUsed,
                roiPct: roi,
                layScenario: layScenarioName(d),
                layQuote: sol.layQuote,
                maxLayQuote: sol.maxLayQuote,
                targetUsed: sol.targetUsed,
                equalizedNet: sol.equalizedNet ?? 0,
                exposure: sol.exposure,
                motherGross: sol.motherGross,
                shocks,
                firstKickoffMs: firstKo,
                expiresAtMs: firstKo === null ? null : firstKo - 2 * 3600_000,
              });
              seenKeys.add(key);
              promoted = true;
              break;
            } else {
              bumpRejected(rejectedBy, sol?.reason ?? 'n/a');
            }
          }
        }
        if (exactSolves >= g.evalBudget) {
          budgetHit = true;
        }
        if (onProgress && evaluatedWindows % yieldEvery === 0) {
          onProgress({ windows: evaluatedWindows, solves: exactSolves, picks: picks.length });
        }
        if (evaluatedWindows % yieldEvery === 0) {
          await new Promise((res) => setTimeout(res, 0));
        }
      }
    }
  }

  picks.sort((a, b) => b.equalizedNet - a.equalizedNet || a.exposure - b.exposure);
  const top = picks.slice(0, g.topK);
  if (onProgress) {
    onProgress({ windows: evaluatedWindows, solves: exactSolves, picks: top.length });
  }
  return {
    picks: top,
    poolSize: pool.length,
    perLine,
    evaluatedWindows,
    exactSolves,
    rejectedBy,
    ranAt: new Date().toISOString(),
    msElapsed: Date.now() - t0,
    budgetHit,
    grid: gridInput,
  };
}
