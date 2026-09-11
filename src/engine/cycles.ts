import { canOpenCycle, maxConcurrentCycles, portfolioExposure, type CycleLedger } from './harmony';
import type { TicketLeg } from '../types';

// F3 — pure helpers per dashboard cicli (nessun I/O, nessun Supabase qui).
// La matematica di sizing resta in harmony.ts; qui solo processo:
// refill-30, shared-leg guard, exposure summary, gambe di terminazione.

export interface LabeledLeg {
  odds: number;
  market?: 'OVER' | 'UNDER';
  label?: string;
}

// Refill-30 automatico dopo morte precoce: riuso + nuove per tornare a 30.
// Puro: non muta gli input, cicla sulla pool. Se la pool è vuota e mancano
// eventi, restituisce quello che c'è (il chiamante segnala il buco).
export function refillToThirty(
  current: LabeledLeg[],
  pool: LabeledLeg[],
  target = 30,
): LabeledLeg[] {
  const out = [...current];
  if (out.length >= target || target < 1) {
    return out.slice(0, Math.max(target, 0));
  }
  if (pool.length === 0) {
    return out;
  }
  let i = 0;
  while (out.length < target) {
    const src = pool[i % pool.length];
    out.push({ ...src });
    i += 1;
  }
  return out;
}

// Shared-leg guard: stessa chiave gamba (match normalizzato) in ≥2 cicli
// attivi => correlazione vietata dal metodo. Le chiavi vuote sono ignorate
// (senza label il guard è cieco: la UI lo segnala, qui non si indovina).
export interface CycleLegSet {
  cycleId: string;
  legKeys: string[];
}

export interface SharedLegConflict {
  key: string;
  cycleIds: string[];
}

export function normalizeLegKey(key: string): string {
  return key.trim().toLowerCase();
}

export function findSharedLegs(sets: CycleLegSet[]): SharedLegConflict[] {
  const byKey = new Map<string, Set<string>>();
  for (const s of sets) {
    const seen = new Set<string>();
    for (const raw of s.legKeys) {
      const k = normalizeLegKey(raw);
      if (!k || seen.has(k)) {
        continue;
      }
      seen.add(k);
      let owners = byKey.get(k);
      if (!owners) {
        owners = new Set();
        byKey.set(k, owners);
      }
      owners.add(s.cycleId);
    }
  }
  const out: SharedLegConflict[] = [];
  for (const [key, owners] of byKey) {
    if (owners.size >= 2) {
      out.push({ key, cycleIds: [...owners].sort() });
    }
  }
  out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return out;
}

// Exposure meter: un solo punto di lettura per tetti parallelo/bankroll.
export interface ExposureSummary {
  exposure: number;
  active: number;
  nMax: number;
  utilization: number;
  ok: boolean;
  reason: string;
}

export function exposureSummary(
  ledgers: CycleLedger[],
  bankroll: number,
  worstCycleCost: number,
  opts?: { factor?: number; opCap?: number },
): ExposureSummary {
  const factor = opts?.factor ?? 2;
  const opCap = opts?.opCap ?? 6;
  const exposure = portfolioExposure(ledgers);
  const { nMax, utilization } = maxConcurrentCycles(bankroll, worstCycleCost, factor, opCap);
  const gate = canOpenCycle({ bankroll, worstCycleCost, active: ledgers, factor, opCap });
  return { exposure, active: ledgers.length, nMax, utilization, ok: gate.ok, reason: gate.reason };
}

// Gambe di terminazione libera: [Over@prossimo_evento_madre] + [N-1 Under].
// N 1–30, prima gamba OBBLIGATA a coprire la madre. Ritorna null se N non
// valido o se i restanti non bastano (il chiamante fornisce altri match).
export function buildTerminationLegs(
  overOdds: number,
  restUnderOdds: number[],
  n: number,
): TicketLeg[] | null {
  if (!Number.isInteger(n) || n < 1 || n > 30) {
    return null;
  }
  if (!(overOdds > 1)) {
    return null;
  }
  if (n - 1 > restUnderOdds.length) {
    return null;
  }
  const legs: TicketLeg[] = [{ odds: overOdds, market: 'OVER' }];
  for (let i = 0; i < n - 1; i++) {
    const q = restUnderOdds[i];
    if (!(q > 1)) {
      return null;
    }
    legs.push({ odds: q, market: 'UNDER' });
  }
  return legs;
}
